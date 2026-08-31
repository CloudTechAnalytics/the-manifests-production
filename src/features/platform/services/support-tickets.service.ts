import { supabase } from '@/shared/lib/supabase/client';
import type { SupportTicket, TicketStatus } from '@/shared/types';

export type TicketRow = SupportTicket & {
  organization: { id: string; name: string } | null;
  assigned_user: { id: string; full_name: string } | null;
};

export async function fetchSupportTickets(): Promise<TicketRow[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*, organization:organizations(id, name), assigned_user:profiles!support_tickets_assigned_to_fkey(id, full_name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as TicketRow[]) ?? [];
}

export async function updateSupportTicket(
  id: string,
  patch: Partial<Pick<SupportTicket, 'status' | 'assigned_to'>>
): Promise<void> {
  const { error } = await supabase.from('support_tickets').update(patch).eq('id', id);
  if (error) throw error;
}
