import { checkCustomsReleased, checkReleaseReadiness, type ReleaseReadiness } from '@/lib/utils/release-readiness';
import { getDocumentChecklist } from '@/lib/utils/document-templates';
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

/**
 * Gates the simple shipment.status flow (booking_received -> documentation
 * -> processing -> in_transit -> arrived -> delivered) — the status shown
 * everywhere in the app (dashboard, lists, badges) — separately from the
 * granular shipment_stages workflow tab, which already gates itself via
 * checkStageReadiness. Keyed by the status being ENTERED: what must be
 * true before the shipment can be marked as that status.
 *
 * booking_received and arrived have no precondition (arrival is a physical
 * event nothing here can verify); cancelled is never blocked.
 */
const STATUS_VALIDATORS: Partial<Record<ShipmentStatus, (shipmentId: string) => Promise<StageReadiness>>> = {
  processing: (id) => checkDocumentsForStage(id, 'documentation'),
  in_transit: (id) => checkReleaseReadiness(id),
  delivered: (id) => checkDocumentsForStage(id, 'transportation'),
};

export async function checkShipmentStatusReadiness(
  shipmentId: string,
  targetStatus: ShipmentStatus
): Promise<StageReadiness> {
  const validator = STATUS_VALIDATORS[targetStatus];
  return validator ? validator(shipmentId) : { ready: true, blockers: [] };
}
