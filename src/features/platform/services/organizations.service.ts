import { supabase } from '@/shared/lib/supabase/client';
import { callPlatformEdgeFunction } from './edge-functions';
import type {
  Organization,
  OrganizationOrigin,
  OrgSubscription,
  Plan,
  Profile,
  Invitation,
  PlatformSettings,
  BillingCycle,
} from '@/shared/types';

const DEFAULT_TRIAL_DAYS = 30;

// --- Organizations list page ------------------------------------------

export interface OrganizationsListData {
  orgs: Organization[];
  trashedCount: number;
  plans: Plan[];
  trialDays: number;
  trialPlan: { id: string; max_users: number | null } | null;
  subsByOrg: Map<string, OrgSubscription>;
  ownerByOrg: Map<string, { full_name: string; email: string }>;
  userCountByOrg: Map<string, number>;
}

/**
 * Everything the Organizations list page renders, loaded in one batch —
 * mirrors the page's previous `load()` exactly (same 8 concurrent
 * queries), just returning the result instead of setting local state.
 */
export async function fetchOrganizationsListData(): Promise<OrganizationsListData> {
  const [activeRes, trashedRes, plansRes, settingsRes, trialPlanRes, subsRes, ownersRes, profilesRes] =
    await Promise.all([
      supabase
        .from('organizations')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('organizations')
        .select('id', { count: 'exact', head: true })
        .not('deleted_at', 'is', null),
      supabase
        .from('plans')
        .select('*')
        .is('deleted_at', null)
        .eq('is_active', true)
        // is_public excludes the internal "Trial" plan (migration 065) —
        // it's auto-assigned by self-service registration via
        // platform_settings.default_trial_plan_id, not something to pick
        // from this list. Without this filter it showed up as a real,
        // separately-selectable "Trial — ₦0.00/mo" tier right next to
        // the "Free trial — N days" sentinel above, which is a different,
        // no-plan-assigned option — two confusingly similar "trial"
        // choices that did different things.
        .eq('is_public', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('platform_settings')
        .select('trial_duration_days')
        .eq('id', true)
        .maybeSingle(),
      supabase.from('plans').select('id, max_users').eq('slug', 'trial').maybeSingle(),
      supabase.from('org_subscriptions').select('*, plan:plans(*)'),
      supabase
        .from('profiles')
        .select('organization_id, full_name, email')
        .eq('role', 'admin')
        .is('branch_id', null)
        .is('deleted_at', null),
      supabase.from('profiles').select('organization_id').is('deleted_at', null),
    ]);

  if (activeRes.error) throw activeRes.error;
  if (plansRes.error) throw plansRes.error;

  const settings = settingsRes.data as Pick<PlatformSettings, 'trial_duration_days'> | null;

  const subsByOrg = new Map<string, OrgSubscription>();
  for (const s of (subsRes.data as OrgSubscription[]) ?? []) subsByOrg.set(s.organization_id, s);

  const ownerByOrg = new Map<string, { full_name: string; email: string }>();
  for (const o of (ownersRes.data as { organization_id: string | null; full_name: string; email: string }[]) ?? []) {
    if (o.organization_id && !ownerByOrg.has(o.organization_id)) {
      ownerByOrg.set(o.organization_id, { full_name: o.full_name, email: o.email });
    }
  }

  const userCountByOrg = new Map<string, number>();
  for (const p of (profilesRes.data as { organization_id: string | null }[]) ?? []) {
    if (!p.organization_id) continue;
    userCountByOrg.set(p.organization_id, (userCountByOrg.get(p.organization_id) ?? 0) + 1);
  }

  return {
    orgs: (activeRes.data as Organization[]) ?? [],
    trashedCount: trashedRes.count ?? 0,
    plans: (plansRes.data as Plan[]) ?? [],
    trialDays: settings?.trial_duration_days ?? DEFAULT_TRIAL_DAYS,
    trialPlan: (trialPlanRes.data as { id: string; max_users: number | null } | null) ?? null,
    subsByOrg,
    ownerByOrg,
    userCountByOrg,
  };
}

export interface OrgFormValues {
  name: string;
  slug: string;
  city: string;
  country: string;
  phone: string;
  email: string;
}

// Sentinel for the "Free trial — N days" choice, mirrored from the page.
const TRIAL_ONLY = 'trial';

export type CreateOrganizationResult =
  | { org: Organization; kind: 'trial' }
  | { org: Organization; kind: 'paid'; assigned: true; planName: string }
  | { org: Organization; kind: 'paid'; assigned: false };

/**
 * Creates an organization, auto-provisions its Head Office branch +
 * default departments, logs the creation, and assigns its starting
 * subscription (a free trial with no plan, or a trial of the chosen paid
 * plan) — the exact sequence the Create Organization dialog ran inline,
 * including which failures are fatal (org insert) vs. non-fatal/logged
 * only (provisioning, activity logging, a failed paid-plan assignment).
 */
export async function createOrganization(params: {
  form: OrgFormValues;
  origin: Exclude<OrganizationOrigin, 'self_service'>;
  createdBy: string;
  planId: string; // TRIAL_ONLY or a real plans.id
  billingCycle: BillingCycle;
  trialDays: number;
  trialPlanId: string | null;
  planName?: string; // resolved name of `planId` when it's a real plan
}): Promise<CreateOrganizationResult> {
  const { form, origin, createdBy, planId, billingCycle, trialDays, trialPlanId, planName } = params;

  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name: form.name.trim(),
      slug: form.slug.trim(),
      city: form.city.trim() || null,
      country: form.country.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      created_by: createdBy,
      is_active: true,
      status: 'active_trial',
      origin,
    })
    .select()
    .single();

  if (error) throw error;
  const newOrg = data as Organization;

  // Auto-provision the Head Office branch + default departments — not
  // fatal if it fails; the org still exists and this is retryable/idempotent.
  const { error: provisionError } = await supabase.rpc('provision_branch_and_departments', {
    p_org_id: newOrg.id,
  });
  if (provisionError) {
    console.error('provision_branch_and_departments error:', provisionError.message);
  }

  await supabase.from('activities').insert({
    user_id: createdBy,
    organization_id: newOrg.id,
    action: 'organization.created',
    entity_type: 'organization',
    entity_id: newOrg.id,
    description: `Created organization "${newOrg.name}" (${origin})`,
  });

  if (planId === TRIAL_ONLY) {
    // "Free trial, no paid plan chosen yet" still needs a real
    // org_subscriptions row — pointing at the internal Trial plan — so
    // feature gating and org_user_limit have something to resolve against.
    const trialEnds = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();

    if (trialPlanId) {
      const { error: subError } = await supabase.from('org_subscriptions').insert({
        organization_id: newOrg.id,
        plan_id: trialPlanId,
        status: 'trial',
        billing_cycle: 'monthly',
        seats: 1,
        trial_ends_at: trialEnds,
        updated_by: createdBy,
      });
      if (subError) console.error('Trial subscription insert error:', subError.message);
    }

    return { org: newOrg, kind: 'trial' };
  }

  // Put the org on its chosen plan as a trial straight away.
  const trialEnds = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();
  const { error: subError } = await supabase.from('org_subscriptions').insert({
    organization_id: newOrg.id,
    plan_id: planId,
    status: 'trial',
    billing_cycle: billingCycle,
    seats: 1,
    trial_ends_at: trialEnds,
    updated_by: createdBy,
  });

  if (subError) {
    return { org: newOrg, kind: 'paid', assigned: false };
  }

  await supabase.from('activities').insert({
    user_id: createdBy,
    organization_id: newOrg.id,
    action: 'subscription.assigned',
    entity_type: 'org_subscription',
    description: `Assigned "${newOrg.name}" to the ${planName ?? 'plan'} plan (trial)`,
  });

  return { org: newOrg, kind: 'paid', assigned: true, planName: planName ?? 'plan' };
}

/** Updates an organization's editable fields and logs the change. */
export async function editOrganization(params: {
  orgId: string;
  form: OrgFormValues;
  updatedBy: string;
}): Promise<void> {
  const { orgId, form, updatedBy } = params;

  const { error } = await supabase
    .from('organizations')
    .update({
      name: form.name.trim(),
      slug: form.slug.trim(),
      city: form.city.trim() || null,
      country: form.country.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
    })
    .eq('id', orgId);

  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: updatedBy,
    organization_id: orgId,
    action: 'organization.updated',
    entity_type: 'organization',
    entity_id: orgId,
    description: `Updated organization "${form.name.trim()}"`,
  });
}

export interface ToggleOrganizationActiveResult {
  newState: boolean;
  newStatus: Organization['status'];
}

/**
 * Suspends or reactivates an organization. Reactivating recomputes status
 * from the subscription (rather than guessing) so a suspended trial comes
 * back as a trial, not silently as a paid "active" org.
 */
export async function toggleOrganizationActive(params: {
  orgId: string;
  orgName: string;
  currentlyActive: boolean;
  updatedBy: string;
}): Promise<ToggleOrganizationActiveResult> {
  const { orgId, orgName, currentlyActive, updatedBy } = params;
  const newState = !currentlyActive;
  let newStatus: Organization['status'] = 'suspended';

  if (newState) {
    const { data: sub } = await supabase
      .from('org_subscriptions')
      .select('status')
      .eq('organization_id', orgId)
      .maybeSingle();
    newStatus =
      sub?.status === 'trial' ? 'active_trial' :
      sub?.status === 'cancelled' ? 'cancelled' :
      'active_subscription';
  }

  const { error } = await supabase
    .from('organizations')
    .update({ is_active: newState, status: newStatus })
    .eq('id', orgId);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: updatedBy,
    organization_id: orgId,
    action: newState ? 'organization.activated' : 'organization.suspended',
    entity_type: 'organization',
    entity_id: orgId,
    description: `${newState ? 'Activated' : 'Suspended'} organization "${orgName}"`,
  });

  return { newState, newStatus };
}

/** Soft-deletes (moves to Trash) an organization and logs the change. */
export async function softDeleteOrganization(params: {
  orgId: string;
  orgName: string;
  deletedBy: string;
}): Promise<void> {
  const { orgId, orgName, deletedBy } = params;

  const { error } = await supabase
    .from('organizations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', orgId);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: deletedBy,
    organization_id: orgId,
    action: 'organization.deleted',
    entity_type: 'organization',
    entity_id: orgId,
    description: `Moved organization "${orgName}" to Trash`,
  });
}

// --- Trash page ----------------------------------------------------------

export async function fetchTrashedOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
  if (error) throw error;
  return (data as Organization[]) ?? [];
}

export async function restoreOrganization(params: {
  orgId: string;
  orgName: string;
  restoredBy: string;
}): Promise<void> {
  const { orgId, orgName, restoredBy } = params;

  const { error } = await supabase
    .from('organizations')
    .update({ deleted_at: null })
    .eq('id', orgId);
  if (error) throw error;

  await supabase.from('activities').insert({
    user_id: restoredBy,
    organization_id: orgId,
    action: 'organization.restored',
    entity_type: 'organization',
    entity_id: orgId,
    description: `Restored organization "${orgName}" from Trash`,
  });
}

/** Permanently deletes an organization via the privileged edge function. */
export async function permanentlyDeleteOrganization(
  organizationId: string
): Promise<{ membersRemoved: number }> {
  const result = await callPlatformEdgeFunction<{ membersRemoved?: number }>('delete-organization', {
    organization_id: organizationId,
  });
  return { membersRemoved: result.membersRemoved ?? 0 };
}

// --- Organization detail page ---------------------------------------------

export interface OrganizationDetailData {
  org: Organization;
  members: Profile[];
  invites: Invitation[];
  subscription: (OrgSubscription & { plan: Plan }) | null;
}

/**
 * Loads everything the organization detail page renders. Returns null
 * when the org doesn't exist — the page treats that as "not found" and
 * redirects, same as before.
 */
export async function fetchOrganizationDetail(orgId: string): Promise<OrganizationDetailData | null> {
  const [orgRes, membersRes, invitesRes, subRes] = await Promise.all([
    supabase.from('organizations').select('*').eq('id', orgId).maybeSingle(),
    supabase
      .from('profiles')
      .select('*')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabase
      .from('invitations')
      .select('*')
      .eq('organization_id', orgId)
      .is('accepted_at', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase.from('org_subscriptions').select('*, plan:plans(*)').eq('organization_id', orgId).maybeSingle(),
  ]);

  if (orgRes.error) throw orgRes.error;
  if (!orgRes.data) return null;

  return {
    org: orgRes.data as Organization,
    members: (membersRes.data as Profile[]) ?? [],
    invites: (invitesRes.data as Invitation[]) ?? [],
    subscription: (subRes.data as (OrgSubscription & { plan: Plan }) | null) ?? null,
  };
}

export interface InviteAdminResult {
  emailed: boolean;
  link?: string;
}

/** Invites an organization's first admin via the invite-user edge function. */
export async function inviteOrganizationAdmin(params: {
  orgId: string;
  email: string;
  fullName: string;
}): Promise<InviteAdminResult> {
  const { orgId, email, fullName } = params;
  const result = await callPlatformEdgeFunction<{ emailed?: boolean; link?: string }>('invite-user', {
    email,
    full_name: fullName || undefined,
    role: 'admin',
    organization_id: orgId,
    branch_id: null,
  });
  return { emailed: !!result.emailed, link: result.link };
}

/** Creates an organization's first admin (with a temp password) via the create-user edge function. */
export async function createOrganizationAdmin(params: {
  orgId: string;
  email: string;
  fullName: string;
  password: string;
}): Promise<void> {
  const { orgId, email, fullName, password } = params;
  await callPlatformEdgeFunction('create-user', {
    email,
    full_name: fullName,
    roles: ['admin'],
    organization_id: orgId,
    password,
  });
}

/** Revokes a pending invitation and logs the action under the current caller. */
export async function revokeInvitation(params: {
  invitationId: string;
  invitationEmail: string;
  orgId: string;
}): Promise<void> {
  const { invitationId, invitationEmail, orgId } = params;

  const { error } = await supabase
    .from('invitations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', invitationId);
  if (error) throw error;

  const { data: sessionData } = await supabase.auth.getSession();
  const callerId = sessionData?.session?.user?.id;
  if (callerId) {
    await supabase.from('activities').insert({
      user_id: callerId,
      organization_id: orgId,
      action: 'invitation.revoked',
      entity_type: 'invitation',
      entity_id: invitationId,
      description: `Revoked invitation for ${invitationEmail}`,
    });
  }
}

/** Uploads (or replaces) an organization's logo and logs the change. */
export async function uploadOrganizationLogo(params: {
  orgId: string;
  orgName: string;
  file: File;
}): Promise<string> {
  const { orgId, orgName, file } = params;

  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  // One object per org, overwritten on replace, so we never accumulate
  // orphaned files as the logo changes.
  const path = `${orgId}/logo.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('org-logos')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from('org-logos').getPublicUrl(path);
  // Cache-bust so a replaced logo shows immediately rather than serving
  // the browser's cached copy of the same path.
  const url = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: updErr } = await supabase
    .from('organizations')
    .update({ logo_url: url })
    .eq('id', orgId);
  if (updErr) throw updErr;

  const { data: sessionData } = await supabase.auth.getSession();
  const callerId = sessionData?.session?.user?.id;
  if (callerId) {
    await supabase.from('activities').insert({
      user_id: callerId,
      organization_id: orgId,
      action: 'organization.logo_updated',
      entity_type: 'organization',
      entity_id: orgId,
      description: `Updated logo for "${orgName}"`,
    });
  }

  return url;
}
