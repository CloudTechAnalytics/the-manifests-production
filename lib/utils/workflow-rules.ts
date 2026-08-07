import { checkCustomsReleased, checkReleaseReadiness, type ReleaseReadiness } from '@/lib/utils/release-readiness';
import { getDocumentChecklist } from '@/lib/utils/document-templates';
import { checkPlanningReadiness } from '@/lib/utils/planning';
import { supabase } from '@/lib/supabase/client';
import type { ShipmentStatus } from '@/types';

export type StageReadiness = ReleaseReadiness;

export async function checkDocumentsForStage(shipmentId: string, stageKey: string): Promise<StageReadiness> {
  const checklist = await getDocumentChecklist(shipmentId, stageKey);
  const blockers = checklist
    .filter((item) => !item.satisfied)
    .map((item) => `${item.template.name} is missing.`);
  return { ready: blockers.length === 0, blockers };
}

/**
 * One validator per gated stage. Stages not listed here (lead,
 * quotation, quotation_approved, shipment_created, cargo_examination,
 * warehouse, delivered, completed) have no precondition and are always
 * advanceable — developer-defined scope, not exhaustive.
 */
const STAGE_VALIDATORS: Record<string, (shipmentId: string) => Promise<StageReadiness>> = {
  planning: (id) => checkPlanningReadiness(id),
  documentation: (id) => checkDocumentsForStage(id, 'documentation'),
  regulatory_compliance: (id) => checkDocumentsForStage(id, 'documentation'),
  customs_clearance: (id) => checkCustomsReleased(id),
  terminal_operations: (id) => checkReleaseReadiness(id),
  transportation: (id) => checkReleaseReadiness(id),
};

export async function checkStageReadiness(shipmentId: string, stageKey: string): Promise<StageReadiness> {
  const validator = STAGE_VALIDATORS[stageKey];
  return validator ? validator(shipmentId) : { ready: true, blockers: [] };
}

/**
 * Which shipment_stages row must be completed (or skipped) before the
 * shipment's main status can advance to a given target — the "cannot
 * skip stages" rule. Keyed by the status being ENTERED, valued by the
 * stage_key that must be done first (the stage matching the status
 * immediately before it in SHIPMENT_STATUS_FLOW). No entry (e.g.
 * planning, the first status — nothing to complete first — or archived,
 * which has no matching stage and is a manual-only action) means no
 * stage precondition.
 *
 * In practice, completing a stage now advances the status automatically
 * (complete_shipment_stage(), migration 056) — this map is what backs
 * the manual "Update Status" dropdown as a fallback/override path (e.g.
 * admin correcting a status by hand), so it still needs to enforce the
 * same rule independently rather than assuming the automatic path was
 * used.
 *
 * This deliberately does NOT duplicate the document/release-readiness
 * checks that already gate checkStageReadiness above — a stage can only
 * be marked completed once those pass, so requiring the stage to be
 * completed here transitively enforces the same preconditions without
 * checking them twice.
 */
const STATUS_PRECEDING_STAGE_KEY: Partial<Record<ShipmentStatus, string>> = {
  documentation: 'planning',
  awaiting_customs: 'documentation',
  customs_clearance: 'regulatory_compliance',
  terminal_processing: 'customs_clearance',
  cargo_examination: 'terminal_operations',
  released: 'cargo_examination',
  transport: 'released',
  delivered: 'transportation',
  completed: 'delivered',
  archived: 'completed',
};

async function checkStageComplete(shipmentId: string, stageKey: string): Promise<StageReadiness> {
  const { data } = await supabase
    .from('shipment_stages')
    .select('label, status')
    .eq('shipment_id', shipmentId)
    .eq('stage_key', stageKey)
    .maybeSingle();

  if (!data || data.status === 'completed' || data.status === 'skipped') {
    return { ready: true, blockers: [] };
  }
  return { ready: false, blockers: [`"${data.label}" must be completed or skipped before advancing.`] };
}

export async function checkShipmentStatusReadiness(
  shipmentId: string,
  targetStatus: ShipmentStatus
): Promise<StageReadiness> {
  const precedingStageKey = STATUS_PRECEDING_STAGE_KEY[targetStatus];
  return precedingStageKey ? checkStageComplete(shipmentId, precedingStageKey) : { ready: true, blockers: [] };
}
