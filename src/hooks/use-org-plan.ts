'use client';

import useSWR from 'swr';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';

/*
 * Resolves the signed-in user's organization to its current plan's feature
 * list, for feature gating (lib/feature-gating.ts). Reads org_subscriptions
 * joined to plans — RLS already allows this (migration 064's
 * "select_own_org_subscription" + "select_active_plans_authenticated"), the
 * same policies the onboarding wizard and trial-status banner already rely
 * on for this exact join.
 *
 * `features: null` means "no subscription row at all" (an organization that
 * predates the plans system, or the platform's own internal/seed org) —
 * treated as full access rather than zero access, the same fail-open
 * convention org_user_limit already uses for a missing subscription, so
 * shipping this can't silently lock an existing org out of its own data.
 * A platform_admin has no organization_id and is never subject to this —
 * the tenant shell isn't their workspace at all (app/(app)/layout.tsx
 * already bounces them to /platform).
 */

interface PlanFeaturesResult {
  plan: { id: string; name: string; features: string[] } | null;
  status: string | null;
}

async function fetchOrgPlan(organizationId: string): Promise<PlanFeaturesResult> {
  const { data, error } = await supabase
    .from('org_subscriptions')
    .select('status, plan:plans(id, name, features)')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw error;
  const row = data as unknown as { status: string; plan: { id: string; name: string; features: string[] } | null } | null;
  return { plan: row?.plan ?? null, status: row?.status ?? null };
}

export function useOrgPlan() {
  const { profile } = useAuth();
  const organizationId = profile?.organization_id ?? null;

  const { data, isLoading } = useSWR(
    organizationId ? ['org-plan', organizationId] : null,
    () => fetchOrgPlan(organizationId as string),
    { dedupingInterval: 60000 }
  );

  const features = data?.plan?.features ?? null;

  return {
    planName: data?.plan?.name ?? null,
    features,
    loading: !!organizationId && isLoading,
    /** true if `label` is included in the org's plan, or there's no
     *  resolvable subscription (fail-open, see module docstring). */
    hasFeature: (label: string) => (features === null ? true : features.includes(label)),
  };
}
