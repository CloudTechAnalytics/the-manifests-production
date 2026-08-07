import { supabase } from '@/lib/supabase/client';
import type {
  Shipment,
  ShipmentContainer,
  ShipmentCustoms,
  TerminalOperation,
  ShipmentTransportation,
} from '@/types';
import type { StageReadiness } from '@/lib/utils/workflow-rules';

export interface PlanningMilestone {
  key: string;
  label: string;
  done: boolean;
}

export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface PlanningRisk {
  id: string;
  message: string;
  severity: RiskSeverity;
}

interface PlanningDataInput {
  shipment: Shipment;
  containers: ShipmentContainer[];
  customs: ShipmentCustoms | null;
  terminal: TerminalOperation | null;
  transportation: ShipmentTransportation[];
}

/**
 * Fixed, derived-on-read checklist — no separate stored checklist table.
 * Every item is a plain boolean expression over the same operational
 * tables the Execution Plan sections write to, so it's automatically in
 * sync with zero duplication. "Documents received" is sourced from the
 * Documentation Planning checklist (plan_document_checklist) — every
 * required row Received/Verified — falling back to the upload-backed
 * document checklist if the caller hasn't loaded the former.
 */
export function computePlanningMilestones(
  input: PlanningDataInput & { documentsAllSatisfied: boolean }
): PlanningMilestone[] {
  const { shipment, customs, terminal, transportation, documentsAllSatisfied } = input;

  return [
    { key: 'booking_confirmed', label: 'Booking confirmed', done: shipment.booking_status === 'confirmed' },
    { key: 'vessel_allocated', label: 'Vessel allocated', done: !!shipment.vessel_name },
    { key: 'truck_allocated', label: 'Truck allocated', done: transportation.some((t) => !!t.truck_number) },
    { key: 'driver_assigned', label: 'Driver assigned', done: transportation.some((t) => !!t.driver_name) },
    { key: 'documents_received', label: 'Documents received', done: documentsAllSatisfied },
    { key: 'form_m_available', label: 'Form M available', done: !!customs?.form_m_number },
    { key: 'paar_expected', label: 'PAAR expected', done: !!customs?.expected_paar_date },
    { key: 'duty_estimate_approved', label: 'Duty estimate approved', done: customs?.duty_estimate_approved === true },
    { key: 'terminal_slot_booked', label: 'Terminal slot booked', done: !!terminal?.booking_slot },
    {
      key: 'delivery_schedule_agreed',
      label: 'Delivery schedule agreed',
      done: transportation.some((t) => !!t.expected_delivery_date),
    },
  ];
}

/**
 * Automated risk warnings — same derived-at-read-time convention as
 * DemurrageAlert / computeExposureAccrual / isInvoiceOverdue: no stored
 * "at risk" flag, no scheduled job, recomputed fresh on every render.
 *
 * "Container already planned elsewhere" (a container_number reused on a
 * different open shipment) needs a cross-shipment query and is
 * deliberately deferred — not included here.
 */
export function computePlanningRisks(
  input: PlanningDataInput & { hasExamination?: boolean }
): PlanningRisk[] {
  const { shipment, customs, terminal, transportation, hasExamination } = input;
  const risks: PlanningRisk[] = [];
  const today = new Date().toISOString().split('T')[0];

  const soonOrPast = (date: string | null, withinDays: number) => {
    if (!date) return false;
    const diffDays = (new Date(date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= withinDays;
  };

  if (shipment.booking_status !== 'confirmed' && soonOrPast(shipment.estimated_departure, 7)) {
    risks.push({ id: 'booking-not-confirmed', message: 'Booking not confirmed.', severity: 'high' });
  }

  if (customs?.expected_paar_date && shipment.estimated_arrival && customs.expected_paar_date > shipment.estimated_arrival) {
    risks.push({ id: 'paar-after-arrival', message: 'PAAR expected after vessel arrival.', severity: 'medium' });
  }

  const hasTruck = transportation.some((t) => !!t.truck_number);
  const pickupSoon = transportation.some((t) => soonOrPast(t.expected_pickup_date, 3));
  if (!hasTruck && pickupSoon) {
    risks.push({ id: 'truck-not-assigned', message: 'Truck not assigned.', severity: 'medium' });
  }

  const deliveryBeforeEta = transportation.some(
    (t) => t.expected_delivery_date && shipment.estimated_arrival && t.expected_delivery_date < shipment.estimated_arrival
  );
  if (deliveryBeforeEta) {
    risks.push({ id: 'delivery-before-eta', message: 'Delivery date earlier than vessel ETA.', severity: 'critical' });
  }

  if (customs?.expected_duty_payment_date && customs.expected_duty_payment_date < today && !customs.duty_paid) {
    risks.push({ id: 'duty-deadline-exceeded', message: 'Duty payment deadline exceeded.', severity: 'critical' });
  }

  if (!terminal?.booking_slot) {
    risks.push({ id: 'no-terminal-slot', message: 'No terminal slot booked.', severity: 'medium' });
  }

  if (soonOrPast(shipment.estimated_arrival, 2) && !soonOrPast(shipment.estimated_arrival, -1)) {
    risks.push({ id: 'container-arriving-soon', message: 'Container arriving in 2 days.', severity: 'medium' });
  }

  const demurrageRisk = computeDemurrageRisk(terminal?.free_time_expiry ?? null);
  if (demurrageRisk !== 'green') {
    risks.push({
      id: 'storage-free-days-low',
      message:
        demurrageRisk === 'red'
          ? 'Storage free days have been exhausted — demurrage is accruing.'
          : 'Storage free days are almost exhausted.',
      severity: demurrageRisk === 'red' ? 'critical' : 'high',
    });
  }

  if (customs?.inspection_required && hasExamination === false) {
    risks.push({ id: 'inspection-pending', message: 'Inspection pending.', severity: 'medium' });
  }

  return risks;
}

/**
 * Terminal/Warehouse Storage Days — derived at read time from
 * arrival/received to release (or to today if not yet released), never
 * stored. Same shape as computeStorageDays below, just named for its
 * terminal use site.
 */
export function computeTerminalStorageDays(arrivalDate: string | null, releaseDate: string | null): number | null {
  return computeStorageDays(arrivalDate, releaseDate);
}

/**
 * Demurrage risk band — green/yellow/red by proximity to the terminal's
 * free_time_expiry date. Reuses the exact same field the shipment
 * detail page's DemurrageAlert already reads; no parallel demurrage
 * concept introduced. Yellow within 3 days of expiry, red once expired.
 */
export function computeDemurrageRisk(freeTimeExpiry: string | null): 'green' | 'yellow' | 'red' {
  if (!freeTimeExpiry) return 'green';
  const daysLeft = Math.ceil(
    (new Date(freeTimeExpiry).getTime() - new Date(new Date().toDateString()).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysLeft < 0) return 'red';
  if (daysLeft <= 3) return 'yellow';
  return 'green';
}

/**
 * Client-side "Complete Planning" gate — plugged into
 * lib/utils/workflow-rules.ts's STAGE_VALIDATORS as the `planning` entry.
 * Returns completionPercent alongside the standard ready/blockers shape
 * (a strict superset of StageReadiness — safe to use anywhere a
 * StageReadiness is expected, per TypeScript's covariant return typing).
 */
export interface PlanningReadiness extends StageReadiness {
  completionPercent: number;
}

export async function checkPlanningReadiness(shipmentId: string): Promise<PlanningReadiness> {
  const blockers: string[] = [];
  const checks: boolean[] = [];

  const [
    { data: shipment },
    { data: stages },
    { data: transportation },
    { data: customs },
    { data: terminal },
    { data: checklist },
  ] = await Promise.all([
    supabase.from('shipments').select('vessel_name, booking_status').eq('id', shipmentId).maybeSingle(),
    supabase
      .from('shipment_stages')
      .select('stage_key, assigned_to')
      .eq('shipment_id', shipmentId)
      .in('stage_key', ['documentation', 'customs_clearance', 'terminal_operations', 'transportation']),
    supabase
      .from('shipment_transportation')
      .select('truck_number, driver_name')
      .eq('shipment_id', shipmentId)
      .is('deleted_at', null),
    supabase
      .from('shipment_customs')
      .select(
        'expected_paar_date, expected_declaration_date, expected_duty_payment_date, expected_examination_date, expected_release_date, expected_exit_date'
      )
      .eq('shipment_id', shipmentId)
      .maybeSingle(),
    supabase.from('terminal_operations').select('booking_slot').eq('shipment_id', shipmentId).maybeSingle(),
    supabase.from('plan_document_checklist').select('status').eq('shipment_id', shipmentId),
  ]);

  const pushCheck = (satisfied: boolean, blockerMessage: string) => {
    checks.push(satisfied);
    if (!satisfied) blockers.push(blockerMessage);
  };

  pushCheck(!!shipment?.vessel_name, 'Select a vessel before completing planning.');
  pushCheck(shipment?.booking_status === 'confirmed', 'Confirm the booking before completing planning.');

  const roleLabels: Record<string, string> = {
    documentation: 'Documentation Officer',
    customs_clearance: 'Customs Officer',
    terminal_operations: 'Terminal Officer',
    transportation: 'Transport Officer',
  };
  for (const [stageKey, label] of Object.entries(roleLabels)) {
    const stage = (stages ?? []).find((s) => s.stage_key === stageKey);
    pushCheck(!!stage?.assigned_to, `Assign a ${label} before completing planning.`);
  }

  pushCheck(
    (transportation ?? []).some((t) => !!t.truck_number || !!t.driver_name),
    'Assign a truck or driver before completing planning.'
  );

  const hasCustomsTimeline =
    !!customs &&
    (customs.expected_paar_date ||
      customs.expected_declaration_date ||
      customs.expected_duty_payment_date ||
      customs.expected_examination_date ||
      customs.expected_release_date ||
      customs.expected_exit_date);
  pushCheck(!!hasCustomsTimeline, 'Set at least one customs deadline before completing planning.');

  pushCheck(!!terminal?.booking_slot, 'Book a terminal slot before completing planning.');

  const checklistRows = checklist ?? [];
  const documentsReady =
    checklistRows.length === 0 || checklistRows.every((c) => c.status === 'received' || c.status === 'verified');
  pushCheck(documentsReady, 'Mark all required documents as received before completing planning.');

  const completionPercent = checks.length === 0 ? 100 : Math.round((checks.filter(Boolean).length / checks.length) * 100);

  return { ready: blockers.length === 0, blockers, completionPercent };
}

/**
 * Storage Days — derived at read time from arrival/received to release
 * (or to today if not yet released), never stored.
 */
export function computeStorageDays(startDate: string | null, endDate: string | null): number | null {
  if (!startDate) return null;
  const start = new Date(startDate + 'T00:00:00');
  const end = endDate ? new Date(endDate + 'T00:00:00') : new Date(new Date().toDateString());
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}
