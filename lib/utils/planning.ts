import { supabase } from '@/lib/supabase/client';
import type {
  Shipment,
  ShipmentContainer,
  ShipmentCustoms,
  TerminalOperation,
  ShipmentTransportation,
  ShipmentStage,
} from '@/types';
import type { StageReadiness } from '@/lib/utils/workflow-rules';

/**
 * The Planning Centre page's tab keys, defined here (not locally in
 * page.tsx) because risk/checklist items now carry an `actionTab` that
 * navigates the user straight to the section that fixes them.
 */
export type PlanningTabKey =
  | 'execution'
  | 'assignments'
  | 'documentation'
  | 'financials'
  | 'tasks'
  | 'documents'
  | 'timeline'
  | 'notes';

export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface PlanningRisk {
  id: string;
  message: string;
  severity: RiskSeverity;
  /** When set, the risk banner renders an action button that jumps to `actionTab`. */
  actionLabel?: string;
  actionTab?: PlanningTabKey;
}

/** The 4 department stages every plan needs an officer assigned to. */
const DEPARTMENT_STAGE_KEYS = ['documentation', 'customs_clearance', 'terminal_operations', 'transportation'] as const;

const DEPARTMENT_ROLE_LABELS: Record<string, string> = {
  documentation: 'Documentation Officer',
  customs_clearance: 'Customs Officer',
  terminal_operations: 'Terminal Officer',
  transportation: 'Transport Officer',
};

/** Per-stage SLA target, in hours. No `sla_hours` column exists anywhere
 *  in the schema — this is a fixed default for the Ownership header's
 *  "Overdue" flag; a per-branch configurable value would be a natural
 *  Settings addition later if wanted. */
export const STAGE_SLA_HOURS: Record<string, number> = {
  planning: 24,
};

interface PlanningDataInput {
  shipment: Shipment;
  containers: ShipmentContainer[];
  customs: ShipmentCustoms | null;
  terminal: TerminalOperation | null;
  transportation: ShipmentTransportation[];
  /** Optional — only risks/checklist items that need per-role assignment
   *  status (officer-missing risks, "Officers Assigned") use this. */
  stages?: ShipmentStage[];
}

/**
 * Automated risk warnings — same derived-at-read-time convention as
 * DemurrageAlert / computeExposureAccrual / isInvoiceOverdue: no stored
 * "at risk" flag, no scheduled job, recomputed fresh on every render.
 * Every risk now carries an optional action (label + tab) so the risk
 * banner can render a "Confirm Booking →"-style button that navigates
 * straight to the fix, instead of being purely informational text.
 *
 * "Container already planned elsewhere" (a container_number reused on a
 * different open shipment) needs a cross-shipment query and is
 * deliberately deferred — not included here.
 */
export function computePlanningRisks(
  input: PlanningDataInput & { hasExamination?: boolean }
): PlanningRisk[] {
  const { shipment, customs, terminal, transportation, stages, hasExamination } = input;
  const risks: PlanningRisk[] = [];
  const today = new Date().toISOString().split('T')[0];

  const soonOrPast = (date: string | null, withinDays: number) => {
    if (!date) return false;
    const diffDays = (new Date(date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= withinDays;
  };

  if (shipment.booking_status !== 'confirmed' && soonOrPast(shipment.estimated_departure, 7)) {
    risks.push({
      id: 'booking-not-confirmed',
      message: 'Booking not confirmed.',
      severity: 'high',
      actionLabel: 'Confirm Booking',
      actionTab: 'execution',
    });
  }

  if (customs?.expected_paar_date && shipment.estimated_arrival && customs.expected_paar_date > shipment.estimated_arrival) {
    risks.push({
      id: 'paar-after-arrival',
      message: 'PAAR expected after vessel arrival.',
      severity: 'medium',
      actionLabel: 'Review Customs Timeline',
      actionTab: 'execution',
    });
  }

  const hasTruck = transportation.some((t) => !!t.truck_number);
  const pickupSoon = transportation.some((t) => soonOrPast(t.expected_pickup_date, 3));
  if (!hasTruck && pickupSoon) {
    risks.push({
      id: 'truck-not-assigned',
      message: 'Truck not assigned.',
      severity: 'medium',
      actionLabel: 'Assign Transport',
      actionTab: 'execution',
    });
  }

  const deliveryBeforeEta = transportation.some(
    (t) => t.expected_delivery_date && shipment.estimated_arrival && t.expected_delivery_date < shipment.estimated_arrival
  );
  if (deliveryBeforeEta) {
    risks.push({
      id: 'delivery-before-eta',
      message: 'Delivery date earlier than vessel ETA.',
      severity: 'critical',
      actionLabel: 'Review Transport Plan',
      actionTab: 'execution',
    });
  }

  if (customs?.expected_duty_payment_date && customs.expected_duty_payment_date < today && !customs.duty_paid) {
    risks.push({
      id: 'duty-deadline-exceeded',
      message: 'Duty payment deadline exceeded.',
      severity: 'critical',
      actionLabel: 'Review Customs Timeline',
      actionTab: 'execution',
    });
  }

  if (!terminal?.booking_slot) {
    risks.push({
      id: 'no-terminal-slot',
      message: 'Terminal slot has not been planned.',
      severity: 'medium',
      actionLabel: 'Plan Terminal Slot',
      actionTab: 'execution',
    });
  }

  if (soonOrPast(shipment.estimated_arrival, 2) && !soonOrPast(shipment.estimated_arrival, -1)) {
    risks.push({
      id: 'container-arriving-soon',
      message: 'Container arriving in 2 days.',
      severity: 'medium',
      actionLabel: 'Review Container Details',
      actionTab: 'execution',
    });
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
      actionLabel: 'Review Terminal Planning',
      actionTab: 'execution',
    });
  }

  if (customs?.inspection_required && hasExamination === false) {
    risks.push({
      id: 'inspection-pending',
      message: 'Inspection pending.',
      severity: 'medium',
      actionLabel: 'Review Customs Planning',
      actionTab: 'execution',
    });
  }

  // Internal Department Assignment — one risk per unassigned role. This
  // is new: officer gaps were previously only a Complete-Planning
  // blocker, never a visible risk.
  if (stages) {
    for (const stageKey of DEPARTMENT_STAGE_KEYS) {
      const stage = stages.find((s) => s.stage_key === stageKey);
      if (!stage?.assigned_to) {
        risks.push({
          id: `officer-missing-${stageKey}`,
          message: `${DEPARTMENT_ROLE_LABELS[stageKey]} has not been assigned.`,
          severity: 'medium',
          actionLabel: 'Assign Officer',
          actionTab: 'assignments',
        });
      }
    }
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

// ============================================================
// PLANNING CHECKLIST — the single source of truth for the checklist
// UI, the weighted completion %, and the Complete Planning gate.
// ============================================================

export interface PlanningChecklistItem {
  key: string;
  label: string;
  /** Percentage points this item contributes when done — sums to 100
   *  across the full list. */
  weight: number;
  done: boolean;
  /** Required for the Complete Planning gate. "Vessel Assigned" is the
   *  one non-mandatory item — informative, but not itself a blocker. */
  mandatory: boolean;
  tabKey: PlanningTabKey;
}

interface PlanningChecklistInput {
  shipment: Pick<Shipment, 'shipment_type' | 'booking_status' | 'vessel_name' | 'required_documents'>;
  containerCount: number;
  transportation: Pick<ShipmentTransportation, 'pickup_address' | 'truck_number' | 'expected_pickup_date'>[];
  customs: Pick<
    ShipmentCustoms,
    | 'expected_paar_date'
    | 'expected_declaration_date'
    | 'expected_duty_payment_date'
    | 'expected_examination_date'
    | 'expected_release_date'
    | 'expected_exit_date'
  > | null;
  terminal: Pick<TerminalOperation, 'booking_slot'> | null;
  stages: Pick<ShipmentStage, 'stage_key' | 'assigned_to'>[];
}

/**
 * The canonical 8-item Planning Checklist (spec sections 1+2+11
 * reconciled into one list — see the plan file for how the two
 * slightly-different example lists were merged). Pure and synchronous:
 * driven entirely by data the Planning Centre page already has loaded,
 * so the checklist/%/gate are always instantly in sync with what's on
 * screen, no separate round trip.
 */
export function buildPlanningChecklist(input: PlanningChecklistInput): PlanningChecklistItem[] {
  const { shipment, containerCount, transportation, customs, terminal, stages } = input;

  const officersAssigned = DEPARTMENT_STAGE_KEYS.every((key) =>
    stages.some((s) => s.stage_key === key && !!s.assigned_to)
  );

  const hasCustomsTimeline =
    !!customs &&
    (!!customs.expected_paar_date ||
      !!customs.expected_declaration_date ||
      !!customs.expected_duty_payment_date ||
      !!customs.expected_examination_date ||
      !!customs.expected_release_date ||
      !!customs.expected_exit_date);

  const transportPlanCreated = transportation.some(
    (t) => !!t.pickup_address || !!t.truck_number || !!t.expected_pickup_date
  );

  return [
    {
      key: 'booking_confirmed',
      label: 'Booking Confirmed',
      weight: 20,
      mandatory: true,
      tabKey: 'execution',
      done: shipment.booking_status === 'confirmed',
    },
    {
      key: 'vessel_assigned',
      label: 'Vessel Assigned',
      weight: 10,
      mandatory: false,
      tabKey: 'execution',
      // Road shipments have no vessel concept — auto-satisfied.
      done: shipment.shipment_type === 'road' ? true : !!shipment.vessel_name,
    },
    {
      key: 'container_added',
      label: 'Container Added',
      weight: 15,
      mandatory: true,
      tabKey: 'execution',
      done: containerCount > 0,
    },
    {
      key: 'transport_plan_created',
      label: 'Transport Plan Created',
      weight: 10,
      mandatory: true,
      tabKey: 'execution',
      done: transportPlanCreated,
    },
    {
      key: 'officers_assigned',
      label: 'Officers Assigned',
      weight: 10,
      mandatory: true,
      tabKey: 'assignments',
      done: officersAssigned,
    },
    {
      key: 'required_documents_identified',
      label: 'Required Documents Identified',
      weight: 10,
      mandatory: true,
      tabKey: 'documentation',
      done: (shipment.required_documents?.length ?? 0) > 0,
    },
    {
      key: 'customs_timeline_planned',
      label: 'Customs Timeline Planned',
      weight: 15,
      mandatory: true,
      tabKey: 'execution',
      done: hasCustomsTimeline,
    },
    {
      key: 'terminal_slot_planned',
      label: 'Terminal Slot Planned',
      weight: 10,
      mandatory: true,
      tabKey: 'execution',
      done: !!terminal?.booking_slot,
    },
  ];
}

/** Rolls a checklist up into the "{doneCount}/{totalCount}" counter and
 *  the weighted percent shown on the progress bar. */
export function summarizeChecklist(items: PlanningChecklistItem[]): {
  doneCount: number;
  totalCount: number;
  percent: number;
} {
  const doneCount = items.filter((i) => i.done).length;
  const percent = items.reduce((sum, i) => sum + (i.done ? i.weight : 0), 0);
  return { doneCount, totalCount: items.length, percent };
}

/**
 * Client-side "Complete Planning" gate — plugged into
 * lib/utils/workflow-rules.ts's STAGE_VALIDATORS as the `planning` entry
 * (also called from the shipment's own Workflow tab, which has no
 * preloaded Planning-page state, so this stays async/self-fetching).
 * Builds the exact same checklist + risks the page displays, so the
 * gate can never disagree with what's on screen — it's a fresh-fetch
 * safety net, not a separately-maintained set of rules.
 */
export interface PlanningReadiness extends StageReadiness {
  completionPercent: number;
}

export async function checkPlanningReadiness(shipmentId: string): Promise<PlanningReadiness> {
  const [
    { data: shipment },
    { count: containerCount },
    { data: stages },
    { data: transportation },
    { data: customs },
    { data: terminal },
  ] = await Promise.all([
    supabase
      .from('shipments')
      .select('shipment_type, booking_status, vessel_name, required_documents, estimated_departure, estimated_arrival')
      .eq('id', shipmentId)
      .maybeSingle(),
    supabase
      .from('shipment_containers')
      .select('id', { count: 'exact', head: true })
      .eq('shipment_id', shipmentId)
      .is('deleted_at', null),
    supabase
      .from('shipment_stages')
      .select('stage_key, assigned_to')
      .eq('shipment_id', shipmentId)
      .in('stage_key', DEPARTMENT_STAGE_KEYS as unknown as string[]),
    supabase
      .from('shipment_transportation')
      .select('pickup_address, truck_number, expected_pickup_date, expected_delivery_date')
      .eq('shipment_id', shipmentId)
      .is('deleted_at', null),
    supabase
      .from('shipment_customs')
      .select(
        'expected_paar_date, expected_declaration_date, expected_duty_payment_date, expected_examination_date, expected_release_date, expected_exit_date, inspection_required, duty_paid'
      )
      .eq('shipment_id', shipmentId)
      .maybeSingle(),
    supabase.from('terminal_operations').select('booking_slot, free_time_expiry').eq('shipment_id', shipmentId).maybeSingle(),
  ]);

  if (!shipment) {
    return { ready: false, blockers: ['Shipment not found.'], completionPercent: 0 };
  }

  const stageRows = stages ?? [];
  const transportRows = transportation ?? [];

  const checklist = buildPlanningChecklist({
    shipment,
    containerCount: containerCount ?? 0,
    transportation: transportRows,
    customs: customs ?? null,
    terminal: terminal ?? null,
    stages: stageRows,
  });

  const risks = computePlanningRisks({
    shipment: shipment as Shipment,
    containers: [],
    customs: customs as ShipmentCustoms | null,
    terminal: terminal as TerminalOperation | null,
    transportation: transportRows as ShipmentTransportation[],
    stages: stageRows as ShipmentStage[],
  });

  const blockers: string[] = checklist
    .filter((item) => item.mandatory && !item.done)
    .map((item) => `${item.label} — not yet done.`);

  const criticalRisks = risks.filter((r) => r.severity === 'critical');
  for (const risk of criticalRisks) {
    blockers.push(`Blocked by risk: ${risk.message}`);
  }

  const { percent } = summarizeChecklist(checklist);

  return { ready: blockers.length === 0, blockers, completionPercent: percent };
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
