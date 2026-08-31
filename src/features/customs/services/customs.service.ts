import { supabase } from '@/shared/lib/supabase/client';
import type { CustomsBond, ShipmentCustoms } from '@/shared/types';

export interface CustomsQueueRow {
  id: string;
  reference_number: string | null;
  customer: { company_name: string } | null;
  customs: ShipmentCustoms | null;
}

/**
 * Customs queue — every shipment not yet released through customs.
 */
export async function fetchCustomsQueue(isAdmin: boolean, branchId: string | null): Promise<CustomsQueueRow[]> {
  let query = supabase
    .from('shipments')
    .select('id, reference_number, branch_id, customer:customers(company_name)')
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });
  if (!isAdmin && branchId) query = query.eq('branch_id', branchId);

  const { data: shipmentRows, error } = await query;
  if (error) throw error;

  const shipments = (shipmentRows as unknown as (Omit<CustomsQueueRow, 'customs'> & { branch_id: string })[]) ?? [];
  const shipmentIds = shipments.map((s) => s.id);

  const { data: customsRows } = shipmentIds.length
    ? await supabase.from('shipment_customs').select('*').in('shipment_id', shipmentIds).is('deleted_at', null)
    : { data: [] };

  const customsByShipment = new Map<string, ShipmentCustoms>();
  (customsRows as ShipmentCustoms[] | null)?.forEach((c) => customsByShipment.set(c.shipment_id, c));

  return shipments
    .map((s) => ({ ...s, customs: customsByShipment.get(s.id) ?? null }))
    .filter((s) => !s.customs || s.customs.status !== 'released');
}

// ---------------------------------------------------------------------------
// Customs bonds
// ---------------------------------------------------------------------------

export interface CustomsBondPayload {
  bond_number: string | null;
  bond_type: CustomsBond['bond_type'];
  surety_name: string | null;
  bond_amount: number | null;
  currency: string;
  issue_date: string | null;
  expiry_date: string | null;
  status: CustomsBond['status'];
  discharged_date: string | null;
  notes: string | null;
  updated_by: string;
}

export async function updateCustomsBond(id: string, payload: CustomsBondPayload): Promise<void> {
  const { error } = await supabase.from('customs_bonds').update(payload).eq('id', id);
  if (error) throw error;
}

export async function createCustomsBond(
  payload: CustomsBondPayload & { shipment_id: string; branch_id: string; created_by: string }
): Promise<void> {
  const { error } = await supabase.from('customs_bonds').insert(payload);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Customs record (shipment_customs)
// ---------------------------------------------------------------------------

export async function updateCustomsRecord(id: string, payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('shipment_customs').update(payload).eq('id', id);
  if (error) throw error;
}

export async function createCustomsRecord(
  payload: Record<string, unknown> & { shipment_id: string; branch_id: string; created_by: string }
): Promise<{ id: string }> {
  const { data, error } = await supabase.from('shipment_customs').insert(payload).select('id').single();
  if (error) throw error;
  return data;
}

export interface CustomsActivityInput {
  user_id: string;
  branch_id: string;
  action: string;
  entity_type: string;
  entity_id: string | undefined;
  description: string;
  metadata?: Record<string, unknown>;
}

export async function logCustomsActivity(activity: CustomsActivityInput): Promise<void> {
  await supabase.from('activities').insert(activity);
}

// ---------------------------------------------------------------------------
// Duty assessment
// ---------------------------------------------------------------------------

export async function updateDutyAssessment(id: string, payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('shipment_customs').update(payload).eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Documents (duty receipt lookups)
// ---------------------------------------------------------------------------

export interface CustomsDocument {
  name: string;
  file_path: string;
}

export async function fetchCustomsDocument(documentId: string): Promise<CustomsDocument | null> {
  const { data } = await supabase
    .from('documents')
    .select('name, file_path')
    .eq('id', documentId)
    .maybeSingle();
  return data ?? null;
}

export async function getCustomsDocumentDownloadUrl(documentId: string): Promise<string> {
  const { data: doc, error: fetchError } = await supabase
    .from('documents')
    .select('file_path')
    .eq('id', documentId)
    .maybeSingle();
  if (fetchError || !doc?.file_path) throw new Error('Receipt file not found');

  const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.file_path, 3600);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Failed to generate download link');
  return data.signedUrl;
}
