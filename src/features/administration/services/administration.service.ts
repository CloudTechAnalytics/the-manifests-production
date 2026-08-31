import { supabase } from '@/shared/lib/supabase/client';
import type {
  Branch,
  Profile,
  UserRole,
  Invitation,
  WebhookSubscription,
  SupportTicket,
  TicketPriority,
} from '@/shared/types';

// ============================================================
// Shared helpers
// ============================================================

export interface ActivityLogInput {
  user_id: string;
  branch_id?: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  description: string;
  metadata?: Record<string, unknown> | null;
}

/** Mirrors the original inline logActivity() callback on both admin
 *  pages — swallows failures (console.error only), never throws. */
export async function logActivity(input: ActivityLogInput): Promise<void> {
  const { error } = await supabase.from('activities').insert(input);
  if (error) {
    console.error('Activity log error:', error);
  }
}

async function callEdgeFunction<T = Record<string, unknown>>(
  name: string,
  body: Record<string, unknown>
): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session) {
    throw new Error('Your session has expired. Please sign in again.');
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || !(result as { success?: boolean }).success) {
    throw new EdgeFunctionError(
      (result as { error?: string }).error ?? `Request failed (${response.status})`,
      (result as { code?: string }).code
    );
  }
  return result as T;
}

/** Preserves the `result.code === 'user_limit_reached'` branching the
 *  create-user / invite-user handlers rely on to show an "Upgrade Plan"
 *  action on the toast instead of a plain error message. */
export class EdgeFunctionError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

// ============================================================
// Users page — reads
// ============================================================

/** Branches selectable as an assignment target — active only. */
export async function fetchActiveBranches(): Promise<Branch[]> {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('name', { ascending: true });
  if (error) {
    console.error('Error loading branches:', error);
    return [];
  }
  return (data as Branch[]) ?? [];
}

export interface FetchUsersParams {
  roleFilter: 'all' | UserRole;
  search: string;
}

export async function fetchUsers({ roleFilter, search }: FetchUsersParams): Promise<Profile[]> {
  let query = supabase
    .from('profiles')
    .select('*, branch:branches(*)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (roleFilter !== 'all') {
    query = query.eq('role', roleFilter);
  }
  if (search) {
    const sanitized = search.replace(/[%_(),.\\]/g, ' ');
    query = query.or(`full_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error loading users:', error);
    return [];
  }
  return (data as Profile[]) ?? [];
}

/** Additional roles beyond each user's primary profiles.role, keyed by
 *  user id — mirrors the original inline map-building in loadUsers(). */
export async function fetchAdditionalRolesByUser(
  userIds: string[]
): Promise<Record<string, UserRole[]>> {
  if (userIds.length === 0) return {};
  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .in('user_id', userIds);
  const map: Record<string, UserRole[]> = {};
  (roleRows ?? []).forEach((r) => {
    map[r.user_id] = [...(map[r.user_id] ?? []), r.role as UserRole];
  });
  return map;
}

export async function fetchInvitations(organizationId: string): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .eq('organization_id', organizationId)
    .is('accepted_at', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error loading invitations:', error);
    return [];
  }
  return (data as Invitation[]) ?? [];
}

export interface OrgUsageAndDepartments {
  departments: { id: string; name: string }[];
  userLimit: number | null;
  userCount: number | null;
}

/** Plan-based seat usage (migration 064's org_user_count/org_user_limit)
 *  plus the department picker list — fetched together exactly like the
 *  original Promise.all so this stays one round trip. */
export async function fetchOrgUsageAndDepartments(
  organizationId: string
): Promise<OrgUsageAndDepartments> {
  const [{ data: deptRows }, { data: limit }, { data: count }] = await Promise.all([
    supabase
      .from('departments')
      .select('id, name')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
    supabase.rpc('org_user_limit', { p_org_id: organizationId }),
    supabase.rpc('org_user_count', { p_org_id: organizationId }),
  ]);
  return {
    departments: (deptRows ?? []) as { id: string; name: string }[],
    userLimit: typeof limit === 'number' ? limit : null,
    userCount: typeof count === 'number' ? count : null,
  };
}

// ============================================================
// Users page — mutations
// ============================================================

export interface CreateUserInput {
  full_name: string;
  email: string;
  roles: UserRole[];
  branch_id: string;
  password: string;
}

/** Creates the user via the create-user edge function, then logs the
 *  activity client-side (the edge function also logs, but this captures
 *  the admin's own audit trail with richer metadata) — exactly the
 *  original handleCreateUser sequence. */
export async function createUser(
  form: CreateUserInput,
  actor: { id: string }
): Promise<{ userId: string }> {
  const result = await callEdgeFunction<{ user_id: string }>('create-user', {
    email: form.email.trim(),
    full_name: form.full_name.trim(),
    roles: form.roles,
    branch_id: form.branch_id,
    password: form.password,
  });

  const newUserId = result.user_id;
  await logActivity({
    user_id: actor.id,
    branch_id: form.branch_id,
    action: 'user.created',
    entity_type: 'profiles',
    entity_id: newUserId,
    description: `Created user "${form.email.trim()}" (${form.roles.join(', ')})`,
    metadata: {
      email: form.email.trim(),
      full_name: form.full_name.trim(),
      roles: form.roles,
      branch_id: form.branch_id,
    },
  });

  return { userId: newUserId };
}

export interface InviteMemberInput {
  email: string;
  full_name: string;
  role: UserRole;
  branch_id: string;
  department_id: string;
}

export async function inviteMember(
  form: InviteMemberInput
): Promise<{ emailed: boolean; link?: string }> {
  const result = await callEdgeFunction<{ emailed: boolean; link?: string }>('invite-user', {
    email: form.email.trim(),
    full_name: form.full_name.trim() || undefined,
    role: form.role,
    branch_id: form.branch_id,
    department_id: form.department_id || null,
  });
  return result;
}

export async function revokeInvitation(invitation: Invitation, actor: { id: string } | null): Promise<void> {
  const { error } = await supabase
    .from('invitations')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', invitation.id);
  if (error) throw error;

  if (actor) {
    await supabase.from('activities').insert({
      user_id: actor.id,
      branch_id: invitation.branch_id,
      action: 'invitation.revoked',
      entity_type: 'invitation',
      entity_id: invitation.id,
      description: `Revoked invitation for ${invitation.email}`,
    });
  }
}

/** Replaces a user's additional roles (beyond their primary
 *  profiles.role) via the admin-only update-user-roles edge function —
 *  user_roles has no client write policy, this is the only path in. */
export async function updateUserRoles(userId: string, roles: UserRole[]): Promise<void> {
  await callEdgeFunction('update-user-roles', { user_id: userId, roles });
}

export interface EditUserInput {
  full_name: string;
  roles: UserRole[];
  branch_id: string;
  is_active: boolean;
}

export async function editUser(
  target: Profile,
  form: EditUserInput,
  actor: { id: string },
  isEditingSelf: boolean
): Promise<void> {
  const primaryRole = form.roles[0];
  const additionalRoles = form.roles.slice(1);

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: form.full_name.trim(),
      role: isEditingSelf ? target.role : primaryRole,
      branch_id: form.branch_id,
      is_active: isEditingSelf ? target.is_active : form.is_active,
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', target.id);

  if (error) throw new Error(error.message);

  if (!isEditingSelf) {
    await updateUserRoles(target.id, additionalRoles);
  }

  await logActivity({
    user_id: actor.id,
    branch_id: form.branch_id,
    action: 'user.updated',
    entity_type: 'profiles',
    entity_id: target.id,
    description: `Updated user "${target.email}" — name, roles, branch, or status changed`,
    metadata: {
      full_name: form.full_name.trim(),
      roles: form.roles,
      branch_id: form.branch_id,
      is_active: form.is_active,
    },
  });
}

export async function resetUserPassword(
  target: Profile,
  newPassword: string,
  actor: { id: string }
): Promise<void> {
  await callEdgeFunction('reset-user-password', {
    user_id: target.id,
    new_password: newPassword,
  });

  await logActivity({
    user_id: actor.id,
    branch_id: target.branch_id,
    action: 'user.password_reset',
    entity_type: 'profiles',
    entity_id: target.id,
    description: `Reset password for user "${target.email}"`,
    metadata: { email: target.email },
  });
}

export async function toggleUserActive(target: Profile, actor: { id: string }): Promise<void> {
  const newState = !target.is_active;

  const { error } = await supabase
    .from('profiles')
    .update({
      is_active: newState,
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', target.id);

  if (error) throw new Error(error.message);

  await logActivity({
    user_id: actor.id,
    branch_id: target.branch_id,
    action: newState ? 'user.enabled' : 'user.disabled',
    entity_type: 'profiles',
    entity_id: target.id,
    description: `${newState ? 'Enabled' : 'Disabled'} user "${target.email}"`,
    metadata: { email: target.email, is_active: newState },
  });
}

// ============================================================
// Settings page — Branches
// ============================================================

/** All branches (active and inactive) — the branch management table. */
export async function fetchAllBranches(): Promise<Branch[]> {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .is('deleted_at', null)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data as Branch[]) ?? [];
}

export interface BranchFormInput {
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
  bank_swift_code: string;
}

export async function createBranch(
  form: BranchFormInput,
  actor: { id: string; organization_id: string }
): Promise<Branch> {
  const { data, error } = await supabase
    .from('branches')
    .insert({
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      bank_name: form.bank_name.trim() || null,
      bank_account_name: form.bank_account_name.trim() || null,
      bank_account_number: form.bank_account_number.trim() || null,
      bank_swift_code: form.bank_swift_code.trim() || null,
      organization_id: actor.organization_id,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;
  const newBranch = data as Branch;

  await logActivity({
    user_id: actor.id,
    branch_id: newBranch.id,
    action: 'branch.created',
    entity_type: 'branches',
    entity_id: newBranch.id,
    description: `Created branch "${newBranch.name}" (${newBranch.code})`,
    metadata: {
      name: newBranch.name,
      code: newBranch.code,
      address: newBranch.address,
      phone: newBranch.phone,
      email: newBranch.email,
    },
  });

  return newBranch;
}

export async function editBranch(
  target: Branch,
  form: BranchFormInput,
  actor: { id: string }
): Promise<void> {
  const { error } = await supabase
    .from('branches')
    .update({
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      bank_name: form.bank_name.trim() || null,
      bank_account_name: form.bank_account_name.trim() || null,
      bank_account_number: form.bank_account_number.trim() || null,
      bank_swift_code: form.bank_swift_code.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', target.id);

  if (error) throw error;

  await logActivity({
    user_id: actor.id,
    branch_id: target.id,
    action: 'branch.updated',
    entity_type: 'branches',
    entity_id: target.id,
    description: `Updated branch "${target.name}" (${target.code})`,
    metadata: {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
    },
  });
}

export async function toggleBranchActive(target: Branch, actor: { id: string }): Promise<void> {
  const newState = !target.is_active;

  const { error } = await supabase
    .from('branches')
    .update({ is_active: newState, updated_at: new Date().toISOString() })
    .eq('id', target.id);

  if (error) throw error;

  await logActivity({
    user_id: actor.id,
    branch_id: target.id,
    action: newState ? 'branch.enabled' : 'branch.disabled',
    entity_type: 'branches',
    entity_id: target.id,
    description: `${newState ? 'Enabled' : 'Disabled'} branch "${target.name}" (${target.code})`,
    metadata: { is_active: newState },
  });
}

// Every table with a NOT NULL branch_id ON DELETE RESTRICT — a real
// DELETE on branches fails the moment any of these still has a row
// pointing at it, so counts are checked up front for a clear message
// instead of a raw foreign-key-violation error.
const BRANCH_DEPENDENT_TABLES: { table: string; label: string }[] = [
  { table: 'shipments', label: 'shipment' },
  { table: 'customers', label: 'customer' },
  { table: 'quotations', label: 'quotation' },
  { table: 'invoices', label: 'invoice' },
  { table: 'payments', label: 'payment' },
  { table: 'expenses', label: 'expense' },
  { table: 'documents', label: 'document' },
  { table: 'shipment_plans', label: 'shipment plan' },
  { table: 'plan_tasks', label: 'plan task' },
  { table: 'warehouses', label: 'warehouse' },
  { table: 'stock_items', label: 'stock item' },
  { table: 'warehouse_stock', label: 'warehouse stock record' },
  { table: 'stock_movements', label: 'stock movement' },
];

/** Throws with a human-readable "still has N shipments, M invoices…"
 *  message when the branch can't be deleted yet — same blocker-summary
 *  UX as the original handleDeleteBranch. */
export async function deleteBranchWithDependencyCheck(
  target: Branch,
  actor: { id: string }
): Promise<void> {
  const [dependentResults, staffResult] = await Promise.all([
    Promise.all(
      BRANCH_DEPENDENT_TABLES.map(({ table }) =>
        supabase.from(table).select('id', { count: 'exact', head: true }).eq('branch_id', target.id)
      )
    ),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', target.id)
      .is('deleted_at', null),
  ]);

  const blockers = dependentResults
    .map((res, i) => ({ label: BRANCH_DEPENDENT_TABLES[i].label, count: res.count ?? 0 }))
    .filter((b) => b.count > 0);

  const staffCount = staffResult.count ?? 0;
  if (staffCount > 0) blockers.push({ label: 'staff member', count: staffCount });

  if (blockers.length > 0) {
    const summary = blockers
      .map((b) => `${b.count} ${b.label}${b.count === 1 ? '' : 's'}`)
      .join(', ');
    throw new Error(
      `Can't delete "${target.name}": it still has ${summary}. Remove or reassign those first, or use Disable if you just want it out of active use.`
    );
  }

  // Logged before the delete — activities.branch_id would fail its own
  // foreign key the moment the branch it points at is gone.
  await logActivity({
    user_id: actor.id,
    branch_id: target.id,
    action: 'branch.deleted',
    entity_type: 'branches',
    entity_id: target.id,
    description: `Deleted branch "${target.name}" (${target.code})`,
  });

  const { error } = await supabase.from('branches').delete().eq('id', target.id);
  if (error) throw error;
}

// ============================================================
// Settings page — Quotation workflow settings
// ============================================================

export interface OrgQuotationSettings {
  approvalRequired: boolean;
  discountThreshold: string;
  amountThreshold: string;
}

export async function fetchOrgQuotationSettings(organizationId: string): Promise<OrgQuotationSettings> {
  const { data } = await supabase
    .from('organizations')
    .select('quotation_approval_required, quotation_discount_threshold_percent, quotation_amount_threshold')
    .eq('id', organizationId)
    .maybeSingle();

  return {
    approvalRequired: data?.quotation_approval_required ?? false,
    discountThreshold: data?.quotation_discount_threshold_percent?.toString() ?? '',
    amountThreshold: data?.quotation_amount_threshold?.toString() ?? '',
  };
}

export async function updateOrgQuotationThresholds(input: {
  discountThreshold: string;
  amountThreshold: string;
}): Promise<void> {
  await callEdgeFunction('update-org-quotation-settings', {
    quotation_discount_threshold_percent: input.discountThreshold.trim()
      ? Number(input.discountThreshold)
      : null,
    quotation_amount_threshold: input.amountThreshold.trim() ? Number(input.amountThreshold) : null,
  });
}

export async function updateOrgQuotationApprovalRequired(checked: boolean): Promise<void> {
  await callEdgeFunction('update-org-quotation-settings', {
    quotation_approval_required: checked,
  });
}

// ============================================================
// Settings page — My Profile
// ============================================================

export async function updateOwnProfileName(
  actor: { id: string; branch_id: string | null },
  trimmedName: string
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: trimmedName,
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', actor.id);

  if (error) throw error;

  await logActivity({
    user_id: actor.id,
    branch_id: actor.branch_id,
    action: 'profile.updated',
    entity_type: 'profiles',
    entity_id: actor.id,
    description: `Updated own profile name to "${trimmedName}"`,
    metadata: { full_name: trimmedName },
  });
}

/** The "Current Password" field is verified by attempting a real
 *  sign-in before applying the change — a valid session already gates
 *  this page, so this only rules out a UX false-assurance bug, not a
 *  privilege-escalation one. Mirrors the original handleChangePassword
 *  exactly, including which supabase.auth error becomes which message. */
export async function changeOwnPassword(
  actor: { id: string; email: string; branch_id: string | null },
  currentPassword: string,
  newPassword: string
): Promise<{ currentPasswordIncorrect: boolean }> {
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: actor.email,
    password: currentPassword,
  });
  if (verifyError) {
    return { currentPasswordIncorrect: true };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;

  await logActivity({
    user_id: actor.id,
    branch_id: actor.branch_id,
    action: 'profile.password_changed',
    entity_type: 'profiles',
    entity_id: actor.id,
    description: 'Changed own account password',
    metadata: {},
  });

  return { currentPasswordIncorrect: false };
}

// ============================================================
// Webhook Settings panel
// ============================================================

export async function fetchWebhookSubscriptions(): Promise<WebhookSubscription[]> {
  const { data, error } = await supabase
    .from('webhook_subscriptions')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as WebhookSubscription[]) ?? [];
}

export async function deleteWebhookSubscription(id: string, actor: { id: string }): Promise<void> {
  const { error } = await supabase
    .from('webhook_subscriptions')
    .update({ deleted_at: new Date().toISOString(), updated_by: actor.id })
    .eq('id', id);
  if (error) throw error;
}

export interface WebhookFormPayload {
  name: string;
  target_url: string;
  signing_secret: string;
  event_types: string[];
  is_active: boolean;
}

export async function saveWebhookSubscription(
  payload: WebhookFormPayload,
  actor: { id: string },
  existing: WebhookSubscription | null,
  branchId?: string
): Promise<void> {
  const row = { ...payload, updated_by: actor.id };
  if (existing) {
    const { error } = await supabase.from('webhook_subscriptions').update(row).eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('webhook_subscriptions')
      .insert({ ...row, branch_id: branchId, created_by: actor.id });
    if (error) throw error;
  }
}

// ============================================================
// Support tab
// ============================================================

export async function fetchSupportTickets(organizationId: string): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as SupportTicket[]) ?? [];
}

export async function createSupportTicket(
  form: { subject: string; description: string; priority: TicketPriority },
  actor: { id: string; organization_id: string }
): Promise<void> {
  const { error } = await supabase.from('support_tickets').insert({
    organization_id: actor.organization_id,
    subject: form.subject.trim(),
    description: form.description.trim(),
    priority: form.priority,
    created_by: actor.id,
  });
  if (error) throw error;
}
