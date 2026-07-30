import { checkCustomsReleased, checkReleaseReadiness, type ReleaseReadiness } from '@/lib/utils/release-readiness';
import { getDocumentChecklist } from '@/lib/utils/document-templates';

export type StageReadiness = ReleaseReadiness;

async function checkDocumentsForStage(shipmentId: string, stageKey: string): Promise<StageReadiness> {
  const checklist = await getDocumentChecklist(shipmentId, stageKey);
  const blockers = checklist
    .filter((item) => !item.satisfied)
    .map((item) => `${item.template.name} is missing.`);
  return { ready: blockers.length === 0, blockers };
}

/**
 * One validator per gated stage. Stages not listed here (lead,
 * quotation, quotation_approved, shipment_created, planning,
 * cargo_examination, warehouse, delivered, completed) have no
 * precondition and are always advanceable — developer-defined scope,
 * not exhaustive.
 */
const STAGE_VALIDATORS: Record<string, (shipmentId: string) => Promise<StageReadiness>> = {
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
