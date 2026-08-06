import { supabase } from '@/lib/supabase/client';
import type { WorkflowStageCatalog } from '@/types';

/**
 * Bulk-inserts one shipment_stages row per active catalog stage for a
 * newly-created shipment. Called as an additional step right after a
 * shipment insert succeeds — never replaces or modifies that insert.
 * Best-effort: a failure here shouldn't block shipment creation, since
 * the catalog table has no write path for callers to have broken it.
 *
 * Excludes the sales-track stages (lead/quotation/quotation_approved —
 * they precede a shipment and aren't part of its own lifecycle) and
 * auto-completes 'shipment_created' (a checkpoint, not a work item) with
 * 'planning' immediately started as the first actionable stage — same
 * shape as convert_quotation_to_shipment's server-side seed (migration
 * 053), kept in sync here for the other two shipment-creation paths
 * (manual /shipments/new, and Planning's own Plan -> Shipment
 * conversion) that don't go through that RPC.
 */
export async function seedShipmentStages(
  shipmentId: string,
  branchId: string,
  createdBy: string | null
): Promise<void> {
  const { data: catalog } = await supabase
    .from('workflow_stage_catalog')
    .select('*')
    .eq('is_active', true)
    .order('sequence', { ascending: true });

  const excluded = new Set(['lead', 'quotation', 'quotation_approved']);
  const stages = ((catalog as WorkflowStageCatalog[] | null) ?? []).filter((s) => !excluded.has(s.key));
  if (stages.length === 0) return;

  const now = new Date().toISOString();

  await supabase.from('shipment_stages').insert(
    stages.map((stage) => ({
      shipment_id: shipmentId,
      catalog_id: stage.id,
      branch_id: branchId,
      stage_key: stage.key,
      sequence: stage.sequence,
      label: stage.label,
      assigned_department: stage.default_department,
      is_optional: stage.is_optional,
      status: stage.key === 'shipment_created' ? 'completed' : stage.key === 'planning' ? 'in_progress' : 'pending',
      started_at: stage.key === 'shipment_created' || stage.key === 'planning' ? now : null,
      completed_at: stage.key === 'shipment_created' ? now : null,
      created_by: createdBy,
      updated_by: createdBy,
    }))
  );
}
