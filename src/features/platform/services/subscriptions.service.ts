import { supabase } from '@/shared/lib/supabase/client';
import type { Plan, OrgSubscription, SubscriptionStatus, BillingCycle, Organization } from '@/shared/types';

// --- Subscriptions page ----------------------------------------------------

export interface SubscriptionOrgRow {
  id: string;
  name: string;
  slug: string;
  subscription: (OrgSubscription & { plan: Plan }) | null;
}

export interface SubscriptionsPageData {
  orgs: SubscriptionOrgRow[];
  plans: Plan[];
}

export async function fetchSubscriptionsPageData(): Promise<SubscriptionsPageData> {
  // Subscriptions are loaded with their own query keyed by organization_id
  // rather than embedded under the organizations query — the parent→child
  // embed was returning empty for orgs that do have a subscription, which
  // made the page offer "Assign Plan" for an org that already had one.
  const [orgsRes, subsRes, plansRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name, slug')
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    supabase.from('org_subscriptions').select('*, plan:plans(*)'),
    supabase
      .from('plans')
      .select('*')
      .is('deleted_at', null)
      .eq('is_active', true)
      // Excludes the internal "Trial" plan (migration 065) — it's
      // auto-assigned only by self-service registration, not something
      // to hand-pick when changing an org's plan here.
      .eq('is_public', true)
      .order('sort_order', { ascending: true }),
  ]);

  if (orgsRes.error) throw orgsRes.error;
  if (subsRes.error) throw subsRes.error;
  if (plansRes.error) throw plansRes.error;

  const subsByOrg = new Map<string, OrgSubscription & { plan: Plan }>();
  for (const s of (subsRes.data as (OrgSubscription & { plan: Plan })[]) ?? []) {
    subsByOrg.set(s.organization_id, s);
  }

  const orgs: SubscriptionOrgRow[] = (orgsRes.data as { id: string; name: string; slug: string }[]).map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    subscription: subsByOrg.get(o.id) ?? null,
  }));

  return { orgs, plans: (plansRes.data as Plan[]) ?? [] };
}

export async function assignSubscription(params: {
  orgId: string;
  orgName: string;
  planId: string;
  planName: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  seats: number;
  updatedBy: string;
}): Promise<void> {
  const { orgId, orgName, planId, planName, status, billingCycle, seats, updatedBy } = params;

  // Upsert on organization_id: one subscription per org (the column is
  // UNIQUE), so assigning to an org that somehow already has one updates
  // it rather than colliding with the constraint.
  const { error } = await supabase.from('org_subscriptions').upsert(
    {
      organization_id: orgId,
      plan_id: planId,
      status,
      billing_cycle: billingCycle,
      seats,
      updated_by: updatedBy,
    },
    { onConflict: 'organization_id' }
  );
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: updatedBy,
    organization_id: orgId,
    action: 'subscription.assigned',
    entity_type: 'org_subscription',
    description: `Assigned "${orgName}" to the ${planName} plan`,
  });
}

export async function changeSubscriptionPlan(params: {
  subscriptionId: string;
  orgId: string;
  orgName: string;
  planId: string;
  planName: string;
  updatedBy: string;
}): Promise<void> {
  const { subscriptionId, orgId, orgName, planId, planName, updatedBy } = params;

  const { error } = await supabase
    .from('org_subscriptions')
    .update({ plan_id: planId, updated_by: updatedBy })
    .eq('id', subscriptionId);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: updatedBy,
    organization_id: orgId,
    action: 'subscription.plan_changed',
    entity_type: 'org_subscription',
    entity_id: subscriptionId,
    description: `Changed "${orgName}" to the ${planName} plan`,
  });
}

export async function extendSubscriptionTrial(params: {
  subscriptionId: string;
  orgId: string;
  orgName: string;
  currentTrialEndsAt: string | null;
  days: number;
  updatedBy: string;
}): Promise<void> {
  const { subscriptionId, orgId, orgName, currentTrialEndsAt, days, updatedBy } = params;

  // Extend from the later of "now" or the current end date, so extending
  // an already-expired trial doesn't leave it still expired.
  const base = currentTrialEndsAt && new Date(currentTrialEndsAt) > new Date()
    ? new Date(currentTrialEndsAt)
    : new Date();
  const newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('org_subscriptions')
    .update({ trial_ends_at: newEnd, updated_by: updatedBy })
    .eq('id', subscriptionId);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: updatedBy,
    organization_id: orgId,
    action: 'subscription.trial_extended',
    entity_type: 'org_subscription',
    entity_id: subscriptionId,
    description: `Extended "${orgName}"'s trial by ${days} days`,
  });
}

export async function changeSubscriptionStatus(params: {
  subscriptionId: string;
  orgId: string;
  orgName: string;
  status: SubscriptionStatus;
  updatedBy: string;
}): Promise<void> {
  const { subscriptionId, orgId, orgName, status, updatedBy } = params;

  const { error } = await supabase
    .from('org_subscriptions')
    .update({ status, updated_by: updatedBy })
    .eq('id', subscriptionId);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: updatedBy,
    organization_id: orgId,
    action: 'subscription.status_changed',
    entity_type: 'org_subscription',
    entity_id: subscriptionId,
    description: `Changed "${orgName}"'s subscription status to ${status}`,
  });
}

// --- Billing page ----------------------------------------------------------

export type BillingSubRow = OrgSubscription & {
  plan: Plan;
  organization: Pick<Organization, 'id' | 'name' | 'slug'> | null;
};

export async function fetchBillingSubscriptions(): Promise<BillingSubRow[]> {
  const { data, error } = await supabase
    .from('org_subscriptions')
    .select('*, plan:plans(*), organization:organizations(id, name, slug)');
  if (error) throw error;
  return (data as unknown as BillingSubRow[]) ?? [];
}

// --- Revenue Analytics page --------------------------------------------------

export type RevenueSubRow = OrgSubscription & { plan: Plan };

export async function fetchRevenueSubscriptions(): Promise<RevenueSubRow[]> {
  const { data, error } = await supabase.from('org_subscriptions').select('*, plan:plans(*)');
  if (error) throw error;
  return (data as unknown as RevenueSubRow[]) ?? [];
}
