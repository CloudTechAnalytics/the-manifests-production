import { supabase } from '@/lib/supabase/client';
import type { WorkflowStageCatalog } from '@/types';

/**
 * Bulk-inserts one shipment_stages row per active catalog stage for a
 * newly-created shipment. Called as an additional step right after a
 * shipment insert succeeds — never replaces or modifies that insert.
 * Best-effort: a failure here shouldn't block shipment creation, since
 * the catalog table has no write path for callers to have broken it.
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

  const stages = (catalog as WorkflowStageCatalog[] | null) ?? [];
  if (stages.length === 0) return;

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
      created_by: createdBy,
      updated_by: createdBy,
    }))
  );
}
