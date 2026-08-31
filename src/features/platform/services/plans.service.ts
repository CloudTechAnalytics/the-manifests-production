import { supabase } from '@/shared/lib/supabase/client';
import type { Plan } from '@/shared/types';

// A plan carries how many organizations are subscribed to it, so the UI
// can block deleting one that is in use (org_subscriptions.plan_id is
// ON DELETE RESTRICT — a hard delete would fail anyway; this makes the
// reason legible instead of surfacing a raw FK error).
export interface PlanWithUsage extends Plan {
  subscription_count: number;
}

export async function fetchPlansWithUsage(): Promise<PlanWithUsage[]> {
  const { data, error } = await supabase
    .from('plans')
    .select('*, org_subscriptions(count)')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
  if (error) throw error;

  const rows = (data as unknown as (Plan & { org_subscriptions: { count: number }[] })[]) ?? [];

  return rows.map((p) => ({
    ...p,
    subscription_count: p.org_subscriptions?.[0]?.count ?? 0,
  }));
}

/** Every non-deleted plan, unfiltered — used by Settings' default-trial-plan picker. */
export async function fetchAllPlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as Plan[]) ?? [];
}

export interface PlanPayload {
  name: string;
  slug: string;
  description: string | null;
  monthly_price: number;
  annual_price: number | null;
  max_users: number | null;
  storage_gb: number | null;
  support_level: string | null;
  features: string[];
  is_active: boolean;
}

export async function updatePlan(params: {
  planId: string;
  payload: PlanPayload;
  updatedBy: string;
}): Promise<void> {
  const { planId, payload, updatedBy } = params;

  const { error } = await supabase.from('plans').update(payload).eq('id', planId);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: updatedBy,
    action: 'plan.updated',
    entity_type: 'plan',
    entity_id: planId,
    description: `Updated plan "${payload.name}"`,
  });
}

export async function createPlan(params: {
  payload: PlanPayload;
  sortOrder: number;
  createdBy: string;
}): Promise<void> {
  const { payload, sortOrder, createdBy } = params;

  const { data: created, error } = await supabase
    .from('plans')
    .insert({ ...payload, created_by: createdBy, sort_order: sortOrder })
    .select('id')
    .single();
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: createdBy,
    action: 'plan.created',
    entity_type: 'plan',
    entity_id: created?.id,
    description: `Created plan "${payload.name}"`,
  });
}

/** Soft-deletes a plan. The guard against in-use plans is enforced before this is called. */
export async function deletePlan(params: {
  planId: string;
  planName: string;
  deletedBy: string;
}): Promise<void> {
  const { planId, planName, deletedBy } = params;

  const { error } = await supabase
    .from('plans')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', planId);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: deletedBy,
    action: 'plan.deleted',
    entity_type: 'plan',
    entity_id: planId,
    description: `Removed plan "${planName}"`,
  });
}
