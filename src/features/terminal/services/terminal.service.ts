import { supabase } from '@/shared/lib/supabase/client';
import type { TerminalOperation } from '@/shared/types';

export interface TerminalQueueRow {
  id: string;
  reference_number: string | null;
  customer: { company_name: string } | null;
  terminal: TerminalOperation | null;
}

/**
 * Terminal queue — shipments not yet released from the terminal.
 */
export async function fetchTerminalQueue(isAdmin: boolean, branchId: string | null): Promise<TerminalQueueRow[]> {
  let query = supabase
    .from('shipments')
    .select('id, reference_number, branch_id, customer:customers(company_name)')
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });
  if (!isAdmin && branchId) query = query.eq('branch_id', branchId);

  const { data: shipmentRows, error } = await query;
  if (error) throw error;

  const shipments = (shipmentRows as unknown as (Omit<TerminalQueueRow, 'terminal'> & { branch_id: string })[]) ?? [];
  const shipmentIds = shipments.map((s) => s.id);

  const { data: terminalRows } = shipmentIds.length
    ? await supabase.from('terminal_operations').select('*').in('shipment_id', shipmentIds).is('deleted_at', null)
    : { data: [] };

  const terminalByShipment = new Map<string, TerminalOperation>();
  (terminalRows as TerminalOperation[] | null)?.forEach((t) => terminalByShipment.set(t.shipment_id, t));

  return shipments
    .map((s) => ({ ...s, terminal: terminalByShipment.get(s.id) ?? null }))
    .filter((s) => !s.terminal || s.terminal.status !== 'released');
}

export async function updateTerminalRecord(id: string, payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('terminal_operations').update(payload).eq('id', id);
  if (error) throw error;
}

export async function createTerminalRecord(
  payload: Record<string, unknown> & { shipment_id: string; branch_id: string; created_by: string }
): Promise<{ id: string }> {
  const { data, error } = await supabase.from('terminal_operations').insert(payload).select('id').single();
  if (error) throw error;
  return data;
}

export interface TerminalActivityInput {
  user_id: string;
  branch_id: string;
  action: string;
  entity_type: string;
  entity_id: string | undefined;
  description: string;
  metadata?: Record<string, unknown>;
}

export async function logTerminalActivity(activity: TerminalActivityInput): Promise<void> {
  await supabase.from('activities').insert(activity);
}
