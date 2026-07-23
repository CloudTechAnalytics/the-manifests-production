'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatDate } from '@/lib/utils/status';
import type { Profile, Branch, UserRole } from '@/types';

// --- Constants -------------------------------------------------------------

type RoleFilter = 'all' | UserRole;

const ROLE_META: Record<UserRole, { label: string; color: string }> = {
  admin: { label: 'Admin', color: 'bg-blue-100 text-blue-700' },
  operations: { label: 'Operations', color: 'bg-purple-100 text-purple-700' },
  sales: { label: 'Sales', color: 'bg-amber-100 text-amber-700' },
  branch_manager: { label: 'Branch Manager', color: 'bg-cyan-100 text-cyan-700' },
};

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'operations', label: 'Operations' },
  { value: 'sales', label: 'Sales' },
  { value: 'branch_manager', label: 'Branch Manager' },
];

// --- Form types ------------------------------------------------------------

interface CreateForm {
  full_name: string;
  email: string;
  role: UserRole;
  branch_id: string;
  password: string;
}

interface EditForm {
  full_name: string;
  role: UserRole;
  branch_id: string;
  is_active: boolean;
}

// --- Component -------------------------------------------------------------

export default function UsersPage() {
  const { profile } = useAuth();

  const [users, setUsers] = useState<Profile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
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
    role: 'operations',
    branch_id: '',
    password: '',
  });
  const [createFormErrors, setCreateFormErrors] = useState<Partial<Record<keyof CreateForm, string>>>({});
  const [creating, setCreating] = useState(false);

  const [editForm, setEditForm] = useState<EditForm>({
    full_name: '',
    role: 'operations',
    branch_id: '',
    is_active: true,
  });
  const [editFormErrors, setEditFormErrors] = useState<Partial<Record<keyof EditForm, string>>>({});
  const [editing, setEditing] = useState(false);

  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordError, setResetPasswordError] = useState('');
  const [resetting, setResetting] = useState(false);

  const [toggling, setToggling] = useState(false);

  const isAdmin = profile?.role === 'admin';

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // --- Data loading --------------------------------------------------------

  const loadBranches = useCallback(async () => {
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error loading branches:', error);
      return;
    }
    setBranches((data as Branch[]) ?? []);
  }, []);

  const loadUsers = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let query = supabase
        .from('profiles')
        .select('*, branch:branches(*)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (roleFilter !== 'all') {
        query = query.eq('role', roleFilter);
      }

      if (debouncedSearch) {
        const sanitized = debouncedSearch.replace(/[%_(),.\\]/g, ' ');
        query = query.or(
          `full_name.ilike.%${sanitized}%,email.ilike.%${sanitized}%`
        );
      }

      const { data, error } = await query;
      if (error) {
        console.error('Error loading users:', error);
        setUsers([]);
        return;
      }
      setUsers((data as Profile[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [profile, roleFilter, debouncedSearch]);

  useEffect(() => {
    if (isAdmin) {
      loadBranches();
    }
  }, [isAdmin, loadBranches]);

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    } else {
      setLoading(false);
    }
  }, [isAdmin, loadUsers]);

  const roleFilterOptions = useMemo(
    () => [
      { value: 'all', label: 'All Roles' },
      ...ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label })),
    ],
    []
  );

  // --- Activity logging ----------------------------------------------------

  const logActivity = useCallback(
    async (
      action: string,
      entityType: string,
      entityId: string,
      description: string,
      metadata?: Record<string, unknown>,
      branchId?: string | null
    ) => {
      if (!profile) return;
      const { error } = await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: branchId ?? profile.branch_id ?? null,
        action,
        entity_type: entityType,
        entity_id: entityId,
        description,
        metadata: metadata ?? null,
      });
      if (error) {
        console.error('Activity log error:', error);
      }
    },
    [profile]
  );

  // --- Create user ---------------------------------------------------------

  const validateCreateForm = (): boolean => {
    const errs: Partial<Record<keyof CreateForm, string>> = {};
    if (!createForm.full_name.trim()) errs.full_name = 'Full name is required';
    if (!createForm.email.trim()) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email.trim())) {
      errs.email = 'Invalid email address';
    }
    if (!createForm.role) errs.role = 'Role is required';
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
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) {
        toast.error('Your session has expired. Please sign in again.');
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            email: createForm.email.trim(),
            full_name: createForm.full_name.trim(),
            role: createForm.role,
            branch_id: createForm.branch_id,
            password: createForm.password,
          }),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        const message = result.error ?? `Request failed (${response.status})`;
        toast.error(message);
        return;
      }

      // Log activity client-side (edge function also logs, but we log for the
      // admin's own audit trail with richer metadata)
      const newUserId = result.user_id as string;
      await logActivity(
        'user.created',
        'profiles',
        newUserId,
        `Created user "${createForm.email.trim()}" (${ROLE_META[createForm.role].label})`,
        {
          email: createForm.email.trim(),
          full_name: createForm.full_name.trim(),
          role: createForm.role,
          branch_id: createForm.branch_id,
        },
        createForm.branch_id
      );

      toast.success('User created successfully');
      setCreateOpen(false);
      setCreateForm({
        full_name: '',
        email: '',
        role: 'operations',
        branch_id: '',
        password: '',
      });
      setCreateFormErrors({});
      loadUsers();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create user';
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  // --- Edit user -----------------------------------------------------------

  const openEditDialog = (user: Profile) => {
    setEditTarget(user);
    setEditForm({
      full_name: user.full_name,
      role: user.role,
      branch_id: user.branch_id ?? '',
      is_active: user.is_active,
    });
    setEditFormErrors({});
  };

  const validateEditForm = (): boolean => {
    const errs: Partial<Record<keyof EditForm, string>> = {};
    if (!editForm.full_name.trim()) errs.full_name = 'Full name is required';
    if (!editForm.role) errs.role = 'Role is required';
    if (!editForm.branch_id) errs.branch_id = 'Branch is required';
    setEditFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleEditUser = async () => {
    if (!editTarget || !profile) return;
    if (!validateEditForm()) return;

    setEditing(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editForm.full_name.trim(),
          role: editForm.role,
          branch_id: editForm.branch_id,
          is_active: editForm.is_active,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editTarget.id);

      if (error) {
        throw new Error(error.message);
      }

      await logActivity(
        'user.updated',
        'profiles',
        editTarget.id,
        `Updated user "${editTarget.email}" — name, role, branch, or status changed`,
        {
          full_name: editForm.full_name.trim(),
          role: editForm.role,
          branch_id: editForm.branch_id,
          is_active: editForm.is_active,
        },
        editForm.branch_id
      );

      toast.success('User updated successfully');
      setEditTarget(null);
      loadUsers();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to update user';
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
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) {
        toast.error('Your session has expired. Please sign in again.');
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/reset-user-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            user_id: resetTarget.id,
            new_password: resetPassword,
          }),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        const message = result.error ?? `Request failed (${response.status})`;
        toast.error(message);
        return;
      }

      await logActivity(
        'user.password_reset',
        'profiles',
        resetTarget.id,
        `Reset password for user "${resetTarget.email}"`,
        { email: resetTarget.email },
        resetTarget.branch_id
      );

      toast.success('Password reset successfully');
      setResetTarget(null);
      setResetPassword('');
      setResetPasswordError('');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to reset password';
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

      const { error } = await supabase
        .from('profiles')
        .update({
          is_active: newState,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', toggleTarget.id);

      if (error) {
        throw new Error(error.message);
      }

      await logActivity(
        newState ? 'user.enabled' : 'user.disabled',
        'profiles',
        toggleTarget.id,
        `${newState ? 'Enabled' : 'Disabled'} user "${toggleTarget.email}"`,
        { email: toggleTarget.email, is_active: newState },
        toggleTarget.branch_id
      );

      toast.success(`User ${newState ? 'enabled' : 'disabled'} successfully`);
      setToggleTarget(null);
      loadUsers();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to update user status';
      toast.error(message);
    } finally {
      setToggling(false);
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
              Your role: {ROLE_META[profile.role]?.label ?? profile.role}
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
        <Button size="sm" onClick={() => setCreateOpen(true)} className="w-full sm:w-auto">
          <Plus className="mr-1.5 h-4 w-4" />
          Create User
        </Button>
      </div>

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
                    const roleMeta = ROLE_META[user.role];
                    const isSelf = user.id === profile.id;
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
                          <Badge
                            variant="secondary"
                            className={`text-[11px] ${roleMeta.color}`}
                          >
                            {roleMeta.label}
                          </Badge>
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
                              title="Edit user"
                              onClick={() => openEditDialog(user)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Reset password"
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
                                user.is_active ? 'Disable user' : 'Enable user'
                              }
                              disabled={isSelf}
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
        <DialogContent className="max-w-lg">
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="create-role">
                  Role <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={createForm.role}
                  onValueChange={(v) =>
                    setCreateForm((f) => ({ ...f, role: v as UserRole }))
                  }
                >
                  <SelectTrigger id="create-role">
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
                {createFormErrors.role && (
                  <p className="text-xs text-destructive">
                    {createFormErrors.role}
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
                >
                  <SelectTrigger id="create-branch">
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
                {createFormErrors.branch_id && (
                  <p className="text-xs text-destructive">
                    {createFormErrors.branch_id}
                  </p>
                )}
              </div>
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
        <DialogContent className="max-w-lg">
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-role">
                  Role <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={editForm.role}
                  onValueChange={(v) =>
                    setEditForm((f) => ({ ...f, role: v as UserRole }))
                  }
                >
                  <SelectTrigger id="edit-role">
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
                {editFormErrors.role && (
                  <p className="text-xs text-destructive">
                    {editFormErrors.role}
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
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="edit-is_active">Active Status</Label>
                <p className="text-xs text-muted-foreground">
                  Inactive users cannot sign in to the system.
                </p>
              </div>
              <Switch
                id="edit-is_active"
                checked={editForm.is_active}
                onCheckedChange={(checked) =>
                  setEditForm((f) => ({ ...f, is_active: checked }))
                }
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
        <DialogContent className="max-w-md">
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
    </div>
  );
}
