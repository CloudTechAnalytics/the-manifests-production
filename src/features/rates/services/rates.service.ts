import { supabase } from '@/shared/lib/supabase/client';
import type { FreightRateCard } from '@/shared/types';

export async function fetchRateCards(): Promise<FreightRateCard[]> {
  const { data, error } = await supabase
    .from('freight_rate_cards')
    .select('*')
    .is('deleted_at', null)
    .order('trade_lane_origin', { ascending: true });
  if (error) throw error;
  return (data as FreightRateCard[]) ?? [];
}

export async function softDeleteRateCard(id: string, updatedBy: string): Promise<void> {
  const { error } = await supabase
    .from('freight_rate_cards')
    .update({ deleted_at: new Date().toISOString(), updated_by: updatedBy })
    .eq('id', id);
  if (error) throw error;
}

export async function updateRateCard(id: string, payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('freight_rate_cards').update(payload).eq('id', id);
  if (error) throw error;
}

export async function createRateCard(
  payload: Record<string, unknown> & { branch_id: string | null; created_by: string }
): Promise<void> {
  const { error } = await supabase.from('freight_rate_cards').insert(payload);
  if (error) throw error;
}
