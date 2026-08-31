import { supabase } from '@/shared/lib/supabase/client';
import type { ShipmentExamination } from '@/shared/types';

export interface ExaminationQueueRow {
  id: string;
  reference_number: string | null;
  customer: { company_name: string } | null;
  examination: ShipmentExamination | null;
}

/**
 * Examination queue — shipments with no examination record yet, or none
 * with a result recorded.
 */
export async function fetchExaminationQueue(
  isAdmin: boolean,
  branchId: string | null
): Promise<ExaminationQueueRow[]> {
  let query = supabase
    .from('shipments')
    .select('id, reference_number, branch_id, customer:customers(company_name)')
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });
  if (!isAdmin && branchId) query = query.eq('branch_id', branchId);

  const { data: shipmentRows, error } = await query;
  if (error) throw error;

  const shipments =
    (shipmentRows as unknown as (Omit<ExaminationQueueRow, 'examination'> & { branch_id: string })[]) ?? [];
  const shipmentIds = shipments.map((s) => s.id);

  const { data: examinationRows } = shipmentIds.length
    ? await supabase.from('shipment_examinations').select('*').in('shipment_id', shipmentIds).is('deleted_at', null)
    : { data: [] };

  const examinationByShipment = new Map<string, ShipmentExamination>();
  (examinationRows as ShipmentExamination[] | null)?.forEach((e) => examinationByShipment.set(e.shipment_id, e));

  return shipments
    .map((s) => ({ ...s, examination: examinationByShipment.get(s.id) ?? null }))
    .filter((s) => !s.examination || !s.examination.result);
}

export async function updateExaminationRecord(id: string, payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('shipment_examinations').update(payload).eq('id', id);
  if (error) throw error;
}

export async function createExaminationRecord(
  payload: Record<string, unknown> & { shipment_id: string; branch_id: string; created_by: string }
): Promise<{ id: string }> {
  const { data, error } = await supabase.from('shipment_examinations').insert(payload).select('id').single();
  if (error) throw error;
  return data;
}

export interface ExaminationActivityInput {
  user_id: string;
  branch_id: string;
  action: string;
  entity_type: string;
  entity_id: string | undefined;
  description: string;
}

export async function logExaminationActivity(activity: ExaminationActivityInput): Promise<void> {
  await supabase.from('activities').insert(activity);
}
