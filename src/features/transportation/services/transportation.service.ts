import { supabase } from '@/shared/lib/supabase/client';
import type { ShipmentTransportation } from '@/shared/types';

export interface TransportationQueueRow {
  id: string;
  reference_number: string | null;
  customer: { company_name: string } | null;
  transportation: ShipmentTransportation | null;
}

/**
 * Transportation queue — shipments not yet delivered.
 */
export async function fetchTransportationQueue(
  isAdmin: boolean,
  branchId: string | null
): Promise<TransportationQueueRow[]> {
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
    (shipmentRows as unknown as (Omit<TransportationQueueRow, 'transportation'> & { branch_id: string })[]) ?? [];
  const shipmentIds = shipments.map((s) => s.id);

  const { data: transportRows } = shipmentIds.length
    ? await supabase.from('shipment_transportation').select('*').in('shipment_id', shipmentIds).is('deleted_at', null)
    : { data: [] };

  const transportByShipment = new Map<string, ShipmentTransportation>();
  (transportRows as ShipmentTransportation[] | null)?.forEach((t) => transportByShipment.set(t.shipment_id, t));

  return shipments
    .map((s) => ({ ...s, transportation: transportByShipment.get(s.id) ?? null }))
    .filter((s) => !s.transportation || s.transportation.status !== 'delivered');
}

export async function updateTransportationRecord(id: string, payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('shipment_transportation').update(payload).eq('id', id);
  if (error) throw error;
}

export async function createTransportationRecord(
  payload: Record<string, unknown> & { shipment_id: string; branch_id: string; created_by: string }
): Promise<{ id: string }> {
  const { data, error } = await supabase.from('shipment_transportation').insert(payload).select('id').single();
  if (error) throw error;
  return data;
}

export interface TransportationActivityInput {
  user_id: string;
  branch_id: string;
  action: string;
  entity_type: string;
  entity_id: string | undefined;
  description: string;
  metadata?: Record<string, unknown>;
}

export async function logTransportationActivity(activity: TransportationActivityInput): Promise<void> {
  await supabase.from('activities').insert(activity);
}
