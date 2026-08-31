import { supabase } from '@/shared/lib/supabase/client';
import type {
  Branch,
  BillingCycle,
  Department,
  OrgSubscription,
  Plan,
  UserRole,
} from '@/shared/types';

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/** Shared by every edge-function call below — throws the same message the inline callers used to show directly when there's no active session. */
async function authedHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Your session has expired. Please sign in again.');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
    apikey: ANON_KEY,
  };
}

/**
 * Data-access layer for the onboarding feature — plain wrappers around the
 * raw supabase/fetch calls that used to live inline in the wizard step
 * components. No React, no state.
 */

// --- summary-card.tsx --------------------------------------------------

export interface OrgSummaryData {
  sub: OrgSubscription | null;
  userCount: number | null;
  branchName: string | null;
}

export async function fetchOrgSummaryData(organizationId: string): Promise<OrgSummaryData> {
  const [{ data: sub }, { data: count }, { data: branch }] = await Promise.all([
    supabase
      .from('org_subscriptions')
      .select('*, plan:plans(*)')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase.rpc('org_user_count', { p_org_id: organizationId }),
    supabase
      .from('branches')
      .select('name')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    sub: sub as OrgSubscription | null,
    userCount: typeof count === 'number' ? count : null,
    branchName: branch?.name ?? null,
  };
}

// --- org-info-step.tsx ---------------------------------------------------

export async function updateOrganizationProfile(payload: {
  address: string;
  phone: string;
  website: string;
}): Promise<void> {
  const headers = await authedHeaders();
  const response = await fetch(`${FUNCTIONS_URL}/update-organization-profile`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error ?? 'Failed to save');
  }
}

// --- branch-step.tsx -------------------------------------------------------

export async function fetchBranches(organizationId: string): Promise<Branch[]> {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Branch[];
}

export async function renameBranch(id: string, name: string): Promise<void> {
  const { error } = await supabase.from('branches').update({ name }).eq('id', id);
  if (error) throw error;
}

export async function createBranch(
  name: string,
  code: string,
  organizationId: string
): Promise<void> {
  const { error } = await supabase
    .from('branches')
    .insert({ name, code, organization_id: organizationId });
  if (error) throw error;
}

// --- invite-team-step.tsx ---------------------------------------------------

export async function fetchOrgBranchesAndDepartments(
  organizationId: string
): Promise<{ branches: Branch[]; departments: Department[] }> {
  const [{ data: b }, { data: d }] = await Promise.all([
    supabase.from('branches').select('*').eq('organization_id', organizationId).is('deleted_at', null),
    supabase
      .from('departments')
      .select('*')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .eq('is_active', true),
  ]);
  return {
    branches: (b ?? []) as Branch[],
    departments: (d ?? []) as Department[],
  };
}

export interface InviteUserPayload {
  email: string;
  full_name?: string;
  role: UserRole;
  branch_id: string;
  department_id: string | null;
  organization_id: string;
}

export async function inviteUser(
  payload: InviteUserPayload
): Promise<{ success: boolean; emailed?: boolean; link?: string }> {
  const headers = await authedHeaders();
  const response = await fetch(`${FUNCTIONS_URL}/invite-user`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error ?? 'Failed to send invite');
  }
  return data;
}

// --- subscription-step.tsx ---------------------------------------------------

export interface SubscriptionStepData {
  subscription: OrgSubscription | null;
  userCount: number | null;
  plans: Plan[];
}

export async function fetchSubscriptionStepData(organizationId: string): Promise<SubscriptionStepData> {
  const [{ data: sub }, { data: count }, { data: publicPlans }] = await Promise.all([
    supabase
      .from('org_subscriptions')
      .select('*, plan:plans(*)')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase.rpc('org_user_count', { p_org_id: organizationId }),
    supabase
      .from('plans')
      .select('*')
      .eq('is_active', true)
      .eq('is_public', true)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
  ]);
  return {
    subscription: sub as OrgSubscription | null,
    userCount: typeof count === 'number' ? count : null,
    plans: (publicPlans ?? []) as Plan[],
  };
}

export async function initializeOnboardingPayment(
  planId: string,
  cycle: BillingCycle
): Promise<{ authorization_url: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Your session has expired. Please sign in again.');

  const response = await fetch(`${FUNCTIONS_URL}/initialize-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ plan_id: planId, billing_cycle: cycle, return_to: '/onboarding' }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Failed to start checkout');
  return result;
}

// --- onboarding/page.tsx (finish) ---------------------------------------------------

export async function finishOnboarding(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Your session has expired. Please sign in again.');

  const response = await fetch(`${FUNCTIONS_URL}/update-organization-profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ mark_onboarding_complete: true }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error ?? 'Failed to finish setup');
}
