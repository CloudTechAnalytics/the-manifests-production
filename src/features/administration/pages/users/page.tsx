'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  Users as UsersIcon,
  Loader2,
  Pencil,
  KeyRound,
  Power,
  Mail,
  ShieldAlert,
  UserPlus,
  Clock,
  X,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getErrorMessage } from '@/shared/lib/utils';
import { adminForceDelete } from '@/shared/lib/utils/admin-delete';
import { useAuth } from '@/shared/contexts/auth-context';
import * as adminService from '@/features/administration/services/administration.service';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Switch } from '@/shared/components/ui/switch';
import { Checkbox } from '@/shared/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { formatDate, formatDateTime } from '@/shared/lib/utils/status';
import { CONTACT_EMAIL } from '@/shared/lib/contact';
import { ExportButton } from '@/shared/components/ui/export-button';
import type { ExportColumn } from '@/shared/lib/export';
import type { Profile, Branch, UserRole, Invitation } from '@/shared/types';

const USER_EXPORT_COLUMNS: ExportColumn<Profile>[] = [
  { header: 'Full Name', value: (u) => u.full_name },
  { header: 'Email', value: (u) => u.email },
  { header: 'Role', value: (u) => u.role },
  { header: 'Branch', value: (u) => u.branch?.name ?? '' },
  { header: 'Status', value: (u) => (u.is_active ? 'Active' : 'Inactive') },
  { header: 'Created', value: (u) => u.created_at },
];

// --- Constants -------------------------------------------------------------

type RoleFilter = 'all' | UserRole;

const ROLE_META: Record<Exclude<UserRole, 'platform_admin'>, { label: string; color: string }> = {
  admin: { label: 'Admin', color: 'bg-blue-100 text-blue-700' },
  operations: { label: 'Operations', color: 'bg-purple-100 text-purple-700' },
  sales: { label: 'Sales', color: 'bg-amber-100 text-amber-700' },
  branch_manager: { label: 'Branch Manager', color: 'bg-cyan-100 text-cyan-700' },
  finance: { label: 'Finance', color: 'bg-emerald-100 text-emerald-700' },
  customs: { label: 'Customs', color: 'bg-orange-100 text-orange-700' },
  planning: { label: 'Planning', color: 'bg-indigo-100 text-indigo-700' },
  documentation: { label: 'Documentation', color: 'bg-teal-100 text-teal-700' },
  terminal: { label: 'Terminal', color: 'bg-rose-100 text-rose-700' },
  examination: { label: 'Examination', color: 'bg-fuchsia-100 text-fuchsia-700' },
  warehouse: { label: 'Warehouse', color: 'bg-lime-100 text-lime-700' },
  transport: { label: 'Transport', color: 'bg-sky-100 text-sky-700' },
  hr_manager: { label: 'HR Manager', color: 'bg-pink-100 text-pink-700' },
  hr_officer: { label: 'HR Officer', color: 'bg-pink-50 text-pink-600' },
};

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'operations', label: 'Operations' },
  { value: 'sales', label: 'Sales' },
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'finance', label: 'Finance' },
  { value: 'customs', label: 'Customs' },
  { value: 'planning', label: 'Planning' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'terminal', label: 'Terminal' },
  { value: 'examination', label: 'Examination' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'transport', label: 'Transport' },
];

/** A user can hold several roles at once — first one checked becomes
 *  their primary role (profiles.role), the rest are additional. */
function RoleCheckboxGroup({
  selected,
  onChange,
  disabled,
}: {
  selected: UserRole[];
  onChange: (roles: UserRole[]) => void;
  disabled?: boolean;
}) {
  const toggle = (role: UserRole) => {
    onChange(
      selected.includes(role) ? selected.filter((r) => r !== role) : [...selected, role]
    );
  };
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg border border-input p-3 sm:grid-cols-3">
      {ROLE_OPTIONS.map((r) => (
        <label
          key={r.value}
          className="flex items-center gap-1.5 text-sm font-normal"
        >
          <Checkbox
            checked={selected.includes(r.value)}
            onCheckedChange={() => toggle(r.value)}
            disabled={disabled}
          />
          {r.label}
        </label>
      ))}
    </div>
  );
}

// --- Form types ------------------------------------------------------------

interface CreateForm {
  full_name: string;
  email: string;
  roles: UserRole[];
  branch_id: string;
  password: string;
}

interface EditForm {
  full_name: string;
  roles: UserRole[];
  branch_id: string;
  is_active: boolean;
}

interface InviteForm {
  email: string;
  full_name: string;
  role: UserRole;
  branch_id: string;
  department_id: string;
}

// --- Component -------------------------------------------------------------

export default function UsersPage() {
  const { profile, hasRole } = useAuth();

  // A "branch admin" is an org admin who is themselves attached to a branch.
  // They may only create/invite users into that one branch, so the branch
  // pickers below are locked to it. A "general admin" (admin with no branch)
  // and platform_admin keep full choice of branch. The edge functions
  // enforce the same rule server-side — this is just the matching UI.
  const isBranchAdmin =
    profile?.role === 'admin' && !!profile?.branch_id;
  const lockedBranchId = isBranchAdmin ? profile!.branch_id! : null;

  // Matches can_manage_user() in the database exactly — a branch admin
  // can only edit/disable/reset-password users in their own branch (which
  // also means never the org-wide admin, whose branch_id is null). RLS and
  // both edge functions enforce this too; this just keeps the UI from
  // offering an action that would be rejected anyway.
  const canManageUser = (target: Profile) =>
    !isBranchAdmin || target.branch_id === profile?.branch_id;

  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Profile | null>(null);

  // Form state
  const [createForm, setCreateForm] = useState<CreateForm>({
    full_name: '',
    email: '',
    roles: ['operations'],
    branch_id: '',
    password: '',
  });
  const [createFormErrors, setCreateFormErrors] = useState<Partial<Record<keyof CreateForm, string>>>({});
  const [creating, setCreating] = useState(false);

  const [editForm, setEditForm] = useState<EditForm>({
    full_name: '',
    roles: ['operations'],
    branch_id: '',
    is_active: true,
  });
  const [editFormErrors, setEditFormErrors] = useState<Partial<Record<keyof EditForm, string>>>({});
  const [editing, setEditing] = useState(false);

  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [resetting, setResetting] = useState(false);

  const [toggling, setToggling] = useState(false);

  // Invitations state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteForm>({
    email: '',
    full_name: '',
    role: 'operations',
    branch_id: '',
    department_id: '',
  });
  const [inviteFormErrors, setInviteFormErrors] = useState<Partial<Record<keyof InviteForm, string>>>({});
  const [inviting, setInviting] = useState(false);
  const [revokeInviteTarget, setRevokeInviteTarget] = useState<Invitation | null>(null);
  const [revokingInvite, setRevokingInvite] = useState(false);

  const isAdmin = hasRole('admin');

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // When a branch admin opens the create/invite dialog, pin the branch to
  // theirs so the (locked) picker isn't left empty.
  useEffect(() => {
    if (createOpen && lockedBranchId) {
      setCreateForm((f) => ({ ...f, branch_id: lockedBranchId }));
    }
  }, [createOpen, lockedBranchId]);
  useEffect(() => {
    if (inviteOpen && lockedBranchId) {
      setInviteForm((f) => ({ ...f, branch_id: lockedBranchId }));
    }
  }, [inviteOpen, lockedBranchId]);

  // --- Data loading --------------------------------------------------------

  const branchesQuery = useQuery({
    queryKey: ['branches', 'active'],
    queryFn: adminService.fetchActiveBranches,
    enabled: isAdmin,
  });
  const branches = branchesQuery.data ?? [];

  // Only branches a branch admin is allowed to assign into. A general admin
  // or platform_admin sees them all; a branch admin sees only their own.
  const assignableBranches = lockedBranchId
    ? branches.filter((b) => b.id === lockedBranchId)
    : branches;

  const usersQuery = useQuery({
    queryKey: ['users', roleFilter, debouncedSearch],
    queryFn: () => adminService.fetchUsers({ roleFilter, search: debouncedSearch }),
    enabled: isAdmin && !!profile,
  });
  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const loading = isAdmin ? usersQuery.isLoading : false;

  const userIds = useMemo(() => users.map((u) => u.id), [users]);
  const additionalRolesQuery = useQuery({
    queryKey: ['user-roles', userIds],
    queryFn: () => adminService.fetchAdditionalRolesByUser(userIds),
    enabled: isAdmin && userIds.length > 0,
  });
  const additionalRolesByUser = additionalRolesQuery.data ?? {};

  const invitationsQuery = useQuery({
    queryKey: ['invitations', profile?.organization_id],
    queryFn: () => adminService.fetchInvitations(profile!.organization_id!),
    enabled: isAdmin && !!profile?.organization_id,
  });
  const invitations = invitationsQuery.data ?? [];
  const invitationsLoading = isAdmin ? invitationsQuery.isLoading : false;

  // Plan-based seat usage (migration 064's org_user_count/org_user_limit —
  // the same rule create-user/invite-user/accept-invite enforce
  // server-side; null limit means unlimited). Purely informational here —
  // the edge functions are the actual gate.
  const orgUsageQuery = useQuery({
    queryKey: ['org-usage', profile?.organization_id],
    queryFn: () => adminService.fetchOrgUsageAndDepartments(profile!.organization_id!),
    enabled: isAdmin && !!profile?.organization_id,
  });
  const departments = orgUsageQuery.data?.departments ?? [];
  const userCount = orgUsageQuery.data?.userCount ?? null;
  const userLimit = orgUsageQuery.data?.userLimit ?? null;
  const atUserLimit = userLimit !== null && userCount !== null && userCount >= userLimit;

  const loadUsers = () => queryClient.invalidateQueries({ queryKey: ['users'] });
  const loadInvitations = () => queryClient.invalidateQueries({ queryKey: ['invitations'] });
  const loadUsageAndDepartments = () => queryClient.invalidateQueries({ queryKey: ['org-usage'] });

  const roleFilterOptions = useMemo(
    () => [
      { value: 'all', label: 'All Roles' },
      ...ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label })),
    ],
    []
  );

  // --- Mutations -------------------------------------------------------------

  const createUserMutation = useMutation({
    mutationFn: (form: CreateForm) => adminService.createUser(form, profile!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['org-usage'] });
    },
  });

  const inviteMemberMutation = useMutation({
    mutationFn: (form: InviteForm) => adminService.inviteMember(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      queryClient.invalidateQueries({ queryKey: ['org-usage'] });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (invitation: Invitation) => adminService.revokeInvitation(invitation, profile),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invitations'] }),
  });

  const editUserMutation = useMutation({
    mutationFn: ({ target, form, isEditingSelf }: { target: Profile; form: EditForm; isEditingSelf: boolean }) =>
      adminService.editUser(target, form, profile!, isEditingSelf),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ target, newPassword }: { target: Profile; newPassword: string }) =>
      adminService.resetUserPassword(target, newPassword, profile!),
  });

  const toggleUserMutation = useMutation({
    mutationFn: (target: Profile) => adminService.toggleUserActive(target, profile!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const result = await adminForceDelete('user', userId);
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  // --- Create user ---------------------------------------------------------

  const validateCreateForm = (): boolean => {
    const errs: Partial<Record<keyof CreateForm, string>> = {};
    if (!createForm.full_name.trim()) errs.full_name = 'Full name is required';
    if (!createForm.email.trim()) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email.trim())) {
      errs.email = 'Invalid email address';
    }
    if (createForm.roles.length === 0) errs.roles = 'At least one role is required';
    if (!createForm.branch_id) errs.branch_id = 'Branch is required';
    if (!createForm.password) {
      errs.password = 'Password is required';
    } else if (createForm.password.length < 8) {
      errs.password = 'Password must be at least 8 characters';
    }
    setCreateFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreateUser = async () => {
    if (!validateCreateForm()) return;
    if (!profile) return;

    setCreating(true);
    try {
      await createUserMutation.mutateAsync(createForm);

      toast.success('User created successfully');
      setCreateOpen(false);
      setCreateForm({
        full_name: '',
        email: '',
        roles: ['operations'],
        branch_id: '',
        password: '',
      });
      setCreateFormErrors({});
    } catch (err) {
      if (err instanceof adminService.EdgeFunctionError && err.code === 'user_limit_reached') {
        toast.error(err.message, {
          action: { label: 'Upgrade Plan', onClick: () => window.location.assign('/upgrade') },
        });
      } else {
        toast.error(getErrorMessage(err, 'Failed to create user'));
      }
    } finally {
      setCreating(false);
    }
  };

  // --- Invite member ---------------------------------------------------------

  const validateInviteForm = (): boolean => {
    const errs: Partial<Record<keyof InviteForm, string>> = {};
    if (!inviteForm.email.trim()) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteForm.email.trim())) {
      errs.email = 'Invalid email address';
    }
    if (!inviteForm.role) errs.role = 'Role is required';
    if (!inviteForm.branch_id) errs.branch_id = 'Branch is required';
    setInviteFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleInviteMember = async () => {
    if (!validateInviteForm()) return;
    if (!profile) return;

    setInviting(true);
    try {
      const result = await inviteMemberMutation.mutateAsync(inviteForm);

      toast.success(
        result.emailed
          ? `Invitation emailed to ${inviteForm.email.trim()}`
          : `Invitation created. Email delivery isn't configured — share this link: ${result.link}`
      );
      setInviteOpen(false);
      setInviteForm({ email: '', full_name: '', role: 'operations', branch_id: '', department_id: '' });
      setInviteFormErrors({});
    } catch (err) {
      if (err instanceof adminService.EdgeFunctionError && err.code === 'user_limit_reached') {
        toast.error(err.message, {
          action: { label: 'Upgrade Plan', onClick: () => window.location.assign('/upgrade') },
        });
      } else {
        toast.error(getErrorMessage(err, 'Failed to send invitation'));
      }
    } finally {
      setInviting(false);
    }
  };

  const handleRevokeInvite = async () => {
    if (!revokeInviteTarget) return;
    setRevokingInvite(true);
    try {
      await revokeInviteMutation.mutateAsync(revokeInviteTarget);
      toast.success('Invitation revoked');
      setRevokeInviteTarget(null);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to revoke invitation'));
    } finally {
      setRevokingInvite(false);
    }
  };

  // --- Edit user -----------------------------------------------------------

  const openEditDialog = (user: Profile) => {
    setEditTarget(user);
    setEditForm({
      full_name: user.full_name,
      roles: [user.role, ...(additionalRolesByUser[user.id] ?? [])],
      branch_id: user.branch_id ?? '',
      is_active: user.is_active,
    });
    setEditFormErrors({});
  };

  const validateEditForm = (): boolean => {
    const errs: Partial<Record<keyof EditForm, string>> = {};
    if (!editForm.full_name.trim()) errs.full_name = 'Full name is required';
    if (editForm.roles.length === 0) errs.roles = 'At least one role is required';
    if (!editForm.branch_id) errs.branch_id = 'Branch is required';
    setEditFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleEditUser = async () => {
    if (!editTarget || !profile) return;
    if (!validateEditForm()) return;

    // An admin editing their own account can't change their own roles or
    // active status here — the quick-toggle button already refuses this
    // (disabled={isSelf}) for the same reason: doing so from the Edit
    // dialog could lock them out with no admin left to undo it. Enforced
    // here too, not just by disabling the fields below, in case of any UI
    // bypass.
    const isEditingSelf = editTarget.id === profile.id;

    setEditing(true);
    try {
      await editUserMutation.mutateAsync({ target: editTarget, form: editForm, isEditingSelf });
      toast.success('User updated successfully');
      setEditTarget(null);
    } catch (err) {
      const message =
        getErrorMessage(err, 'Failed to update user');
      toast.error(message);
    } finally {
      setEditing(false);
    }
  };

  // --- Reset password ------------------------------------------------------

  const handleResetPassword = async () => {
    if (!resetTarget || !profile) return;

    if (!resetPassword) {
      setResetPasswordError('New password is required');
      return;
    }
    if (resetPassword.length < 8) {
      setResetPasswordError('Password must be at least 8 characters');
      return;
    }

    setResetting(true);
    try {
      await resetPasswordMutation.mutateAsync({ target: resetTarget, newPassword: resetPassword });
      toast.success('Password reset successfully');
      setResetTarget(null);
      setResetPassword('');
      setResetPasswordError('');
    } catch (err) {
      const message =
        getErrorMessage(err, 'Failed to reset password');
      toast.error(message);
    } finally {
      setResetting(false);
    }
  };

  // --- Enable / Disable user ----------------------------------------------

  const handleToggleUser = async () => {
    if (!toggleTarget || !profile) return;

    setToggling(true);
    try {
      const newState = !toggleTarget.is_active;
      await toggleUserMutation.mutateAsync(toggleTarget);
      toast.success(`User ${newState ? 'enabled' : 'disabled'} successfully`);
      setToggleTarget(null);
    } catch (err) {
      const message =
        getErrorMessage(err, 'Failed to update user status');
      toast.error(message);
    } finally {
      setToggling(false);
    }
  };

  // --- Permanently delete user ---------------------------------------------

  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeletingUser(true);
    try {
      await deleteUserMutation.mutateAsync(deleteTarget.id);
      toast.success(`"${deleteTarget.full_name}" was permanently deleted`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete user'));
    } finally {
      setDeletingUser(false);
    }
  };

  // --- Render ---------------------------------------------------------------

  // Access control: non-admins see "Access Denied"
  if (profile && !isAdmin) {
    return (
      <div className="flex items-center justify-center p-6 lg:p-8">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <ShieldAlert className="h-8 w-8 text-red-500" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-bold tracking-tight">Access Denied</h2>
              <p className="text-sm text-muted-foreground">
                You do not have permission to access the User Management page.
                This area is restricted to administrators only.
              </p>
            </div>
            <Badge variant="secondary" className="text-[11px]">
              Your role: {ROLE_META[profile.role as keyof typeof ROLE_META]?.label ?? profile.role}
            </Badge>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Still loading auth profile
  if (!profile) {
    return (
      <div className="space-y-6 p-6 lg:p-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <UsersIcon className="h-6 w-6 text-blue-600" />
            User Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage system users, roles, and permissions across all branches.
          </p>
        </div>
        <div className="flex gap-2">
          <ExportButton
            data={users}
            columns={USER_EXPORT_COLUMNS}
            filename="users"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setInviteOpen(true)}
            disabled={atUserLimit}
            className="flex-1 sm:flex-none"
          >
            <UserPlus className="mr-1.5 h-4 w-4" />
            Invite Member
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={atUserLimit} className="flex-1 sm:flex-none">
            <Plus className="mr-1.5 h-4 w-4" />
            Create User
          </Button>
        </div>
      </div>

      {/* Plan seat usage — org_user_count/org_user_limit (migration 064). Null
          limit means unlimited (Enterprise, or a legacy org with no
          subscription row), so the banner only ever appears for a real cap. */}
      {userLimit !== null && (
        <div
          className={`flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${
            atUserLimit ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-border bg-muted/30 text-muted-foreground'
          }`}
        >
          <span>
            {atUserLimit
              ? "You have reached your plan's user limit."
              : `Using ${userCount} of ${userLimit} users on your plan.`}
          </span>
          {atUserLimit && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href="/upgrade">Upgrade Plan</a>
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a href={`mailto:${CONTACT_EMAIL}`}>Contact Sales</a>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Select
              value={roleFilter}
              onValueChange={(v) => setRoleFilter(v as RoleFilter)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                {roleFilterOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">
            All Users
            {!loading && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({users.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                <UsersIcon className="h-7 w-7 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-medium">No users found</p>
                <p className="text-sm text-muted-foreground">
                  {debouncedSearch || roleFilter !== 'all'
                    ? 'Try adjusting your filters.'
                    : 'Get started by creating a new user.'}
                </p>
              </div>
              {!debouncedSearch && roleFilter === 'all' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Create User
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => {
                    const allRoles = [user.role, ...(additionalRolesByUser[user.id] ?? [])];
                    const isSelf = user.id === profile.id;
                    const canManage = canManageUser(user);
                    return (
                      <TableRow key={user.id} className="transition-colors hover:bg-accent/60">
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                              <UsersIcon className="h-4 w-4" />
                            </div>
                            <div className="flex flex-col">
                              <span>{user.full_name}</span>
                              {isSelf && (
                                <span className="text-[11px] text-muted-foreground">
                                  (You)
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.email}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {allRoles.map((r) => {
                              const meta = ROLE_META[r as keyof typeof ROLE_META] ?? {
                                label: r,
                                color: 'bg-gray-100 text-gray-700',
                              };
                              return (
                                <Badge
                                  key={r}
                                  variant="secondary"
                                  className={`text-[11px] ${meta.color}`}
                                >
                                  {meta.label}
                                </Badge>
                              );
                            })}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.branch?.name ?? '—'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={`text-[11px] ${
                              user.is_active
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {user.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(user.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title={
                                canManage
                                  ? 'Edit user'
                                  : "Outside your branch — you can't edit this user"
                              }
                              disabled={!canManage}
                              onClick={() => openEditDialog(user)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title={
                                canManage
                                  ? 'Reset password'
                                  : "Outside your branch — you can't reset this user's password"
                              }
                              disabled={!canManage}
                              onClick={() => {
                                setResetTarget(user);
                                setResetPassword('');
                                setResetPasswordError('');
                              }}
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title={
                                !canManage
                                  ? "Outside your branch — you can't disable this user"
                                  : user.is_active
                                    ? 'Disable user'
                                    : 'Enable user'
                              }
                              disabled={isSelf || !canManage}
                              onClick={() => setToggleTarget(user)}
                            >
                              <Power
                                className={`h-4 w-4 ${
                                  user.is_active
                                    ? 'text-green-600'
                                    : 'text-gray-400'
                                }`}
                              />
                            </Button>
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                title={
                                  isSelf
                                    ? "You can't delete your own account"
                                    : !canManage
                                      ? "Outside your branch — you can't delete this user"
                                      : 'Delete permanently'
                                }
                                disabled={isSelf || !canManage}
                                onClick={() => setDeleteTarget(user)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            Pending Invitations
            {!invitationsLoading && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({invitations.length})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {invitationsLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : invitations.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Clock className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No pending invitations.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.email}</TableCell>
                    <TableCell>
                      <Badge className={ROLE_META[inv.role as Exclude<UserRole, 'platform_admin'>]?.color}>
                        {ROLE_META[inv.role as Exclude<UserRole, 'platform_admin'>]?.label ?? inv.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(inv.expires_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setRevokeInviteTarget(inv)}
                        aria-label="Revoke invitation"
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setCreateFormErrors({});
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-600" />
              Create New User
            </DialogTitle>
            <DialogDescription>
              Add a new system user. They will be required to change their
              password on first login.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="create-full_name">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-full_name"
                placeholder="John Doe"
                value={createForm.full_name}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, full_name: e.target.value }))
                }
              />
              {createFormErrors.full_name && (
                <p className="text-xs text-destructive">
                  {createFormErrors.full_name}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-email">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-email"
                type="email"
                placeholder="john@company.com"
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, email: e.target.value }))
                }
              />
              {createFormErrors.email && (
                <p className="text-xs text-destructive">
                  {createFormErrors.email}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>
                Roles <span className="text-destructive">*</span>
              </Label>
              <RoleCheckboxGroup
                selected={createForm.roles}
                onChange={(roles) => setCreateForm((f) => ({ ...f, roles }))}
              />
              <p className="text-xs text-muted-foreground">
                A user can hold more than one role. The first one checked
                becomes their primary role.
              </p>
              {createFormErrors.roles && (
                <p className="text-xs text-destructive">
                  {createFormErrors.roles}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-branch">
                Branch <span className="text-destructive">*</span>
              </Label>
              <Select
                value={createForm.branch_id}
                onValueChange={(v) =>
                  setCreateForm((f) => ({ ...f, branch_id: v }))
                }
                disabled={isBranchAdmin}
              >
                <SelectTrigger id="create-branch">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {assignableBranches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isBranchAdmin && (
                <p className="text-xs text-muted-foreground">
                  As a branch admin you can only add users to your own branch.
                </p>
              )}
              {createFormErrors.branch_id && (
                <p className="text-xs text-destructive">
                  {createFormErrors.branch_id}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-password">
                Password <span className="text-destructive">*</span>
              </Label>
              <Input
                id="create-password"
                type="password"
                placeholder="Minimum 8 characters"
                value={createForm.password}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, password: e.target.value }))
                }
              />
              {createFormErrors.password ? (
                <p className="text-xs text-destructive">
                  {createFormErrors.password}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  The user will be prompted to change this on first login.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateUser} disabled={creating}>
              {creating && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Member Dialog */}
      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open);
          if (!open) {
            setInviteFormErrors({});
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-blue-600" />
              Invite Member
            </DialogTitle>
            <DialogDescription>
              We&apos;ll email a join link so they can set their own password.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="jane@company.com"
                value={inviteForm.email}
                onChange={(e) =>
                  setInviteForm((f) => ({ ...f, email: e.target.value }))
                }
              />
              {inviteFormErrors.email && (
                <p className="text-xs text-destructive">{inviteFormErrors.email}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-full_name">Full Name</Label>
              <Input
                id="invite-full_name"
                placeholder="Jane Doe"
                value={inviteForm.full_name}
                onChange={(e) =>
                  setInviteForm((f) => ({ ...f, full_name: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="invite-role">
                  Role <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={inviteForm.role}
                  onValueChange={(v) =>
                    setInviteForm((f) => ({ ...f, role: v as UserRole }))
                  }
                >
                  <SelectTrigger id="invite-role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {inviteFormErrors.role && (
                  <p className="text-xs text-destructive">{inviteFormErrors.role}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="invite-branch">
                  Branch <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={inviteForm.branch_id}
                  onValueChange={(v) =>
                    setInviteForm((f) => ({ ...f, branch_id: v }))
                  }
                  disabled={isBranchAdmin}
                >
                  <SelectTrigger id="invite-branch">
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableBranches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isBranchAdmin && (
                  <p className="text-xs text-muted-foreground">
                    As a branch admin you can only invite users to your own branch.
                  </p>
                )}
                {inviteFormErrors.branch_id && (
                  <p className="text-xs text-destructive">{inviteFormErrors.branch_id}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-department">Department</Label>
              <Select
                value={inviteForm.department_id || undefined}
                onValueChange={(v) => setInviteForm((f) => ({ ...f, department_id: v }))}
              >
                <SelectTrigger id="invite-department">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Just a label for your org chart — Role above is what actually controls what they can see and do.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInviteOpen(false)}
              disabled={inviting}
            >
              Cancel
            </Button>
            <Button onClick={handleInviteMember} disabled={inviting || atUserLimit}>
              {inviting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Send Invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke Invitation Dialog */}
      <Dialog
        open={!!revokeInviteTarget}
        onOpenChange={(open) => !open && setRevokeInviteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <X className="h-5 w-5 text-red-600" />
              Revoke invitation?
            </DialogTitle>
            <DialogDescription>
              {revokeInviteTarget?.email} will no longer be able to use this
              invitation link to join.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRevokeInviteTarget(null)}
              disabled={revokingInvite}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevokeInvite}
              disabled={revokingInvite}
            >
              {revokingInvite && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null);
            setEditFormErrors({});
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-600" />
              Edit User
            </DialogTitle>
            <DialogDescription>
              {editTarget && (
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  {editTarget.email}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-full_name">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-full_name"
                placeholder="John Doe"
                value={editForm.full_name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, full_name: e.target.value }))
                }
              />
              {editFormErrors.full_name && (
                <p className="text-xs text-destructive">
                  {editFormErrors.full_name}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>
                Roles <span className="text-destructive">*</span>
              </Label>
              <RoleCheckboxGroup
                selected={editForm.roles}
                onChange={(roles) => setEditForm((f) => ({ ...f, roles }))}
                disabled={editTarget?.id === profile?.id}
              />
              <p className="text-xs text-muted-foreground">
                The first role checked is their primary role.
              </p>
              {editFormErrors.roles && (
                <p className="text-xs text-destructive">
                  {editFormErrors.roles}
                </p>
              )}
              {editTarget?.id === profile?.id && (
                <p className="text-xs text-muted-foreground">
                  You can&apos;t change your own roles.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-branch">
                Branch <span className="text-destructive">*</span>
              </Label>
              <Select
                value={editForm.branch_id}
                onValueChange={(v) =>
                  setEditForm((f) => ({ ...f, branch_id: v }))
                }
              >
                <SelectTrigger id="edit-branch">
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editFormErrors.branch_id && (
                <p className="text-xs text-destructive">
                  {editFormErrors.branch_id}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="edit-is_active">Active Status</Label>
                <p className="text-xs text-muted-foreground">
                  {editTarget?.id === profile?.id
                    ? "You can't deactivate your own account."
                    : 'Inactive users cannot sign in to the system.'}
                </p>
              </div>
              <Switch
                id="edit-is_active"
                checked={editForm.is_active}
                onCheckedChange={(checked) =>
                  setEditForm((f) => ({ ...f, is_active: checked }))
                }
                disabled={editTarget?.id === profile?.id}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditTarget(null)}
              disabled={editing}
            >
              Cancel
            </Button>
            <Button onClick={handleEditUser} disabled={editing}>
              {editing && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResetTarget(null);
            setResetPassword('');
            setResetPasswordError('');
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-blue-600" />
              Reset Password
            </DialogTitle>
            <DialogDescription>
              {resetTarget && (
                <span className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  {resetTarget.email}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reset-password">
                New Password <span className="text-destructive">*</span>
              </Label>
              <Input
                id="reset-password"
                type="password"
                placeholder="Minimum 8 characters"
                value={resetPassword}
                onChange={(e) => {
                  setResetPassword(e.target.value);
                  setResetPasswordError('');
                }}
              />
              {resetPasswordError && (
                <p className="text-xs text-destructive">
                  {resetPasswordError}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                The user will be prompted to change this password on next
                login.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setResetTarget(null);
                setResetPassword('');
                setResetPasswordError('');
              }}
              disabled={resetting}
            >
              Cancel
            </Button>
            <Button onClick={handleResetPassword} disabled={resetting}>
              {resetting && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enable/Disable Confirmation */}
      <AlertDialog
        open={!!toggleTarget}
        onOpenChange={(open) => {
          if (!open) setToggleTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Power className="h-5 w-5 text-blue-600" />
              {toggleTarget?.is_active ? 'Disable User' : 'Enable User'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.is_active
                ? `Are you sure you want to disable "${toggleTarget?.full_name}" (${toggleTarget?.email})? They will no longer be able to sign in.`
                : `Are you sure you want to enable "${toggleTarget?.full_name}" (${toggleTarget?.email})? They will be able to sign in again.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggling}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleToggleUser();
              }}
              disabled={toggling}
            >
              {toggling && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {toggleTarget?.is_active ? 'Disable' : 'Enable'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete User Permanently
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes &quot;{deleteTarget?.full_name}&quot; (
              {deleteTarget?.email}) and revokes their login entirely — this cannot
              be undone. Every shipment, invoice, and document they ever created or
              touched stays exactly as it is; it just no longer names them as who
              did it. If you only want to stop them from signing in but keep the
              option to restore access later, use Disable instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingUser}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                handleDeleteUser();
              }}
              disabled={deletingUser}
            >
              {deletingUser && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
