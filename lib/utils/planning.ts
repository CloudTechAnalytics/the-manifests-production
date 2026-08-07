import { supabase } from '@/lib/supabase/client';
import { getDocumentChecklist } from '@/lib/utils/document-templates';
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

export interface PlanningRisk {
  id: string;
  message: string;
  level: 'warning' | 'critical';
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
 * sync with zero duplication. "Documents received" is the one item
 * sourced from the upload-backed document checklist instead of a plain
 * column, since that's what it actually means.
 */
export function computePlanningMilestones(
  input: PlanningDataInput & { documentsAllSatisfied: boolean }
): PlanningMilestone[] {
  const { shipment, customs, terminal, transportation, documentsAllSatisfied } = input;

  return [
    { key: 'booking_confirmed', label: 'Booking confirmed', done: shipment.booking_confirmed === true },
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
export function computePlanningRisks(input: PlanningDataInput): PlanningRisk[] {
  const { shipment, customs, terminal, transportation } = input;
  const risks: PlanningRisk[] = [];
  const today = new Date().toISOString().split('T')[0];

  const soonOrPast = (date: string | null, withinDays: number) => {
    if (!date) return false;
    const diffDays = (new Date(date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= withinDays;
  };

  if (!shipment.booking_confirmed && soonOrPast(shipment.estimated_departure, 7)) {
    risks.push({
      id: 'booking-not-confirmed',
      message: 'Booking not confirmed.',
      level: 'warning',
    });
  }

  if (customs?.expected_paar_date && shipment.estimated_arrival && customs.expected_paar_date > shipment.estimated_arrival) {
    risks.push({
      id: 'paar-after-arrival',
      message: 'PAAR expected after vessel arrival.',
      level: 'warning',
    });
  }

  const hasTruck = transportation.some((t) => !!t.truck_number);
  const pickupSoon = transportation.some((t) => soonOrPast(t.expected_pickup_date, 3));
  if (!hasTruck && pickupSoon) {
    risks.push({ id: 'truck-not-assigned', message: 'Truck not assigned.', level: 'warning' });
  }

  const deliveryBeforeEta = transportation.some(
    (t) => t.expected_delivery_date && shipment.estimated_arrival && t.expected_delivery_date < shipment.estimated_arrival
  );
  if (deliveryBeforeEta) {
    risks.push({
      id: 'delivery-before-eta',
      message: 'Delivery date earlier than vessel ETA.',
      level: 'critical',
    });
  }

  if (customs?.expected_duty_payment_date && customs.expected_duty_payment_date < today && !customs.duty_paid) {
    risks.push({
      id: 'duty-deadline-exceeded',
      message: 'Duty payment deadline exceeded.',
      level: 'critical',
    });
  }

  if (!terminal?.booking_slot) {
    risks.push({ id: 'no-terminal-slot', message: 'No terminal slot booked.', level: 'warning' });
  }

  return risks;
}

/**
 * Client-side "Complete Planning" gate — plugged into
 * lib/utils/workflow-rules.ts's STAGE_VALIDATORS as the `planning` entry.
 * The customs-officer-not-assigned check is folded into "Internal staff
 * assigned" here rather than as a separate risk, since it's a hard
 * completion requirement, not just a warning.
 */
export async function checkPlanningReadiness(shipmentId: string): Promise<StageReadiness> {
  const blockers: string[] = [];

  const [{ data: shipment }, { data: stages }, { data: transportation }, { data: customs }, { data: terminal }] =
    await Promise.all([
      supabase
        .from('shipments')
        .select('vessel_name, booking_confirmed')
        .eq('id', shipmentId)
        .maybeSingle(),
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
    ]);

  if (!shipment?.vessel_name) {
    blockers.push('Select a vessel before completing planning.');
  }
  if (!shipment?.booking_confirmed) {
    blockers.push('Confirm the booking before completing planning.');
  }

  const roleLabels: Record<string, string> = {
    documentation: 'Documentation Officer',
    customs_clearance: 'Customs Officer',
    terminal_operations: 'Terminal Officer',
    transportation: 'Transport Officer',
  };
  for (const [stageKey, label] of Object.entries(roleLabels)) {
    const stage = (stages ?? []).find((s) => s.stage_key === stageKey);
    if (!stage?.assigned_to) {
      blockers.push(`Assign a ${label} before completing planning.`);
    }
  }

  const hasTransportPlan = (transportation ?? []).some((t) => !!t.truck_number || !!t.driver_name);
  if (!hasTransportPlan) {
    blockers.push('Assign a truck or driver before completing planning.');
  }

  const hasCustomsTimeline =
    !!customs &&
    (customs.expected_paar_date ||
      customs.expected_declaration_date ||
      customs.expected_duty_payment_date ||
      customs.expected_examination_date ||
      customs.expected_release_date ||
      customs.expected_exit_date);
  if (!hasCustomsTimeline) {
    blockers.push('Set at least one customs deadline before completing planning.');
  }

  if (!terminal?.booking_slot) {
    blockers.push('Book a terminal slot before completing planning.');
  }

  return { ready: blockers.length === 0, blockers };
}

/**
 * Storage Days — derived at read time from received_date/released_date
 * (or received_date to today if still in the warehouse), never stored.
 */
export function computeStorageDays(receivedDate: string | null, releasedDate: string | null): number | null {
  if (!receivedDate) return null;
  const start = new Date(receivedDate + 'T00:00:00');
  const end = releasedDate ? new Date(releasedDate + 'T00:00:00') : new Date(new Date().toDateString());
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}
