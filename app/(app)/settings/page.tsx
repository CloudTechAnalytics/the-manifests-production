'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Building2,
  Plus,
  Pencil,
  Power,
  Loader2,
  ShieldAlert,
  User as UserIcon,
  Mail,
  Phone,
  MapPin,
  KeyRound,
  Save,
  Settings as SettingsIcon,
  Info,
  Bell,
  Palette,
  Globe,
  CheckCircle2,
  Sun,
  Moon,
  Monitor,
  Trash2,
  Webhook,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { cn, getErrorMessage } from '@/lib/utils';
import { formatDate } from '@/lib/utils/status';
import { useTheme } from '@/contexts/theme-context';
import { WebhookSettingsPanel } from '@/components/settings/webhook-settings-panel';
import type { Branch, UserRole, UserPreferences } from '@/types';

// --- Constants -------------------------------------------------------------

const ROLE_META: Record<Exclude<UserRole, 'platform_admin'>, { label: string; color: string }> = {
  admin: { label: 'Administrator', color: 'bg-blue-100 text-blue-700' },
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
};

interface BranchForm {
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

const EMPTY_FORM: BranchForm = {
  name: '',
  code: '',
  address: '',
  phone: '',
  email: '',
  bank_name: '',
  bank_account_name: '',
  bank_account_number: '',
  bank_swift_code: '',
};

type BranchFormErrors = Partial<Record<keyof BranchForm, string>>;

// --- Component -------------------------------------------------------------

function SettingsPageInner() {
  const searchParams = useSearchParams();
  const { profile, refreshProfile } = useAuth();

  const validTabs = ['company', 'branches', 'profile', 'preferences', 'webhooks'];
  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : 'profile'
  );

  // Branches state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState<string | null>(null);

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Branch | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Branch | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);

  // Form state
  const [createForm, setCreateForm] = useState<BranchForm>(EMPTY_FORM);
  const [createFormErrors, setCreateFormErrors] = useState<BranchFormErrors>({});
  const [creating, setCreating] = useState(false);

  const [editForm, setEditForm] = useState<BranchForm>(EMPTY_FORM);
  const [editFormErrors, setEditFormErrors] = useState<BranchFormErrors>({});
  const [editing, setEditing] = useState(false);

  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Profile edit state
  const [profileName, setProfileName] = useState('');
  const [profileNameOriginal, setProfileNameOriginal] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<{
    current?: string;
    new?: string;
    confirm?: string;
  }>({});
  const [changingPassword, setChangingPassword] = useState(false);

  const isAdmin = profile?.role === 'admin';

  // Section 9 (Quotations) — whether Draft quotations must pass through
  // Pending Approval / Approved before they can be marked Sent, plus the
  // discount-% and amount thresholds that force Branch Manager approval
  // regardless of that toggle.
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [savingApproval, setSavingApproval] = useState(false);
  const [discountThreshold, setDiscountThreshold] = useState('');
  const [amountThreshold, setAmountThreshold] = useState('');
  const [savingThresholds, setSavingThresholds] = useState(false);

  useEffect(() => {
    if (!profile?.organization_id) return;
    supabase
      .from('organizations')
      .select('quotation_approval_required, quotation_discount_threshold_percent, quotation_amount_threshold')
      .eq('id', profile.organization_id)
      .maybeSingle()
      .then(({ data }) => {
        setApprovalRequired(data?.quotation_approval_required ?? false);
        setDiscountThreshold(data?.quotation_discount_threshold_percent?.toString() ?? '');
        setAmountThreshold(data?.quotation_amount_threshold?.toString() ?? '');
      });
  }, [profile?.organization_id]);

  const handleSaveThresholds = async () => {
    if (!profile?.organization_id) return;
    setSavingThresholds(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) throw new Error('Your session has expired. Please sign in again.');

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update-org-quotation-settings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            quotation_discount_threshold_percent: discountThreshold.trim() ? Number(discountThreshold) : null,
            quotation_amount_threshold: amountThreshold.trim() ? Number(amountThreshold) : null,
          }),
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error ?? `Request failed (${response.status})`);
      }
      toast.success('Approval thresholds updated');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update thresholds'));
    } finally {
      setSavingThresholds(false);
    }
  };

  const handleToggleApprovalRequired = async (checked: boolean) => {
    if (!profile?.organization_id) return;
    setSavingApproval(true);
    const previous = approvalRequired;
    setApprovalRequired(checked); // optimistic — reverted on failure below
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session) throw new Error('Your session has expired. Please sign in again.');

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/update-org-quotation-settings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ quotation_approval_required: checked }),
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error ?? `Request failed (${response.status})`);
      }

      toast.success(
        checked
          ? 'Quotations now require approval before they can be sent'
          : 'Quotations can be sent without a separate approval step'
      );
    } catch (err) {
      setApprovalRequired(previous);
      toast.error(getErrorMessage(err, 'Failed to update this setting'));
    } finally {
      setSavingApproval(false);
    }
  };

  // Sync profile name when profile loads or changes
  useEffect(() => {
    if (profile) {
      setProfileName(profile.full_name);
      setProfileNameOriginal(profile.full_name);
    }
  }, [profile]);

  // --- Data loading --------------------------------------------------------

  const loadBranches = useCallback(async () => {
    setBranchesLoading(true);
    setBranchesError(null);
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .is('deleted_at', null)
        .order('name', { ascending: true });

      if (error) throw error;
      setBranches((data as Branch[]) ?? []);
    } catch (err) {
      const message =
        getErrorMessage(err, 'Failed to load branches');
      setBranchesError(message);
      console.error('Error loading branches:', err);
    } finally {
      setBranchesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadBranches();
    } else {
      setBranchesLoading(false);
    }
  }, [isAdmin, loadBranches]);

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

  // --- Validation helpers --------------------------------------------------

  const validateForm = (form: BranchForm): BranchFormErrors => {
    const errs: BranchFormErrors = {};
    if (!form.name.trim()) errs.name = 'Branch name is required';
    if (!form.code.trim()) {
      errs.code = 'Branch code is required';
    } else if (!/^[A-Z0-9_-]{2,20}$/i.test(form.code.trim())) {
      errs.code =
        'Code must be 2–20 characters (letters, numbers, hyphens, underscores)';
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = 'Invalid email address';
    }
    return errs;
  };

  // --- Create branch -------------------------------------------------------

  const handleCreateBranch = async () => {
    if (!profile) return;
    const errs = validateForm(createForm);
    setCreateFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('branches')
        .insert({
          name: createForm.name.trim(),
          code: createForm.code.trim().toUpperCase(),
          address: createForm.address.trim() || null,
          phone: createForm.phone.trim() || null,
          email: createForm.email.trim() || null,
          bank_name: createForm.bank_name.trim() || null,
          bank_account_name: createForm.bank_account_name.trim() || null,
          bank_account_number: createForm.bank_account_number.trim() || null,
          bank_swift_code: createForm.bank_swift_code.trim() || null,
          organization_id: profile.organization_id,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      const newBranch = data as Branch;

      await logActivity(
        'branch.created',
        'branches',
        newBranch.id,
        `Created branch "${newBranch.name}" (${newBranch.code})`,
        {
          name: newBranch.name,
          code: newBranch.code,
          address: newBranch.address,
          phone: newBranch.phone,
          email: newBranch.email,
        },
        newBranch.id
      );

      toast.success(`Branch "${newBranch.name}" created successfully`);
      setCreateOpen(false);
      setCreateForm(EMPTY_FORM);
      setCreateFormErrors({});
      loadBranches();
    } catch (err) {
      const message =
        getErrorMessage(err, 'Failed to create branch');
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  // --- Edit branch ---------------------------------------------------------

  const openEditDialog = (branch: Branch) => {
    setEditTarget(branch);
    setEditForm({
      name: branch.name,
      code: branch.code,
      address: branch.address ?? '',
      phone: branch.phone ?? '',
      email: branch.email ?? '',
      bank_name: branch.bank_name ?? '',
      bank_account_name: branch.bank_account_name ?? '',
      bank_account_number: branch.bank_account_number ?? '',
      bank_swift_code: branch.bank_swift_code ?? '',
    });
    setEditFormErrors({});
  };

  const handleEditBranch = async () => {
    if (!editTarget || !profile) return;
    const errs = validateForm(editForm);
    setEditFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setEditing(true);
    try {
      const { error } = await supabase
        .from('branches')
        .update({
          name: editForm.name.trim(),
          code: editForm.code.trim().toUpperCase(),
          address: editForm.address.trim() || null,
          phone: editForm.phone.trim() || null,
          email: editForm.email.trim() || null,
          bank_name: editForm.bank_name.trim() || null,
          bank_account_name: editForm.bank_account_name.trim() || null,
          bank_account_number: editForm.bank_account_number.trim() || null,
          bank_swift_code: editForm.bank_swift_code.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editTarget.id);

      if (error) throw error;

      await logActivity(
        'branch.updated',
        'branches',
        editTarget.id,
        `Updated branch "${editTarget.name}" (${editTarget.code})`,
        {
          name: editForm.name.trim(),
          code: editForm.code.trim().toUpperCase(),
          address: editForm.address.trim(),
          phone: editForm.phone.trim(),
          email: editForm.email.trim(),
        },
        editTarget.id
      );

      toast.success('Branch updated successfully');
      setEditTarget(null);
      loadBranches();
    } catch (err) {
      const message =
        getErrorMessage(err, 'Failed to update branch');
      toast.error(message);
    } finally {
      setEditing(false);
    }
  };

  // --- Toggle branch status ------------------------------------------------

  const handleToggleBranch = async () => {
    if (!toggleTarget || !profile) return;

    setToggling(true);
    try {
      const newState = !toggleTarget.is_active;

      const { error } = await supabase
        .from('branches')
        .update({
          is_active: newState,
          updated_at: new Date().toISOString(),
        })
        .eq('id', toggleTarget.id);

      if (error) throw error;

      await logActivity(
        newState ? 'branch.enabled' : 'branch.disabled',
        'branches',
        toggleTarget.id,
        `${newState ? 'Enabled' : 'Disabled'} branch "${toggleTarget.name}" (${toggleTarget.code})`,
        { is_active: newState },
        toggleTarget.id
      );

      toast.success(`Branch ${newState ? 'enabled' : 'disabled'} successfully`);
      setToggleTarget(null);
      loadBranches();
    } catch (err) {
      const message =
        getErrorMessage(err, 'Failed to update branch status');
      toast.error(message);
    } finally {
      setToggling(false);
    }
  };

  // --- Delete branch ---------------------------------------------------------

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

  const handleDeleteBranch = async () => {
    if (!deleteTarget || !profile) return;

    setDeleting(true);
    try {
      const [dependentResults, staffResult] = await Promise.all([
        Promise.all(
          BRANCH_DEPENDENT_TABLES.map(({ table }) =>
            supabase
              .from(table)
              .select('id', { count: 'exact', head: true })
              .eq('branch_id', deleteTarget.id)
          )
        ),
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('branch_id', deleteTarget.id)
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
        toast.error(
          `Can't delete "${deleteTarget.name}": it still has ${summary}. Remove or reassign those first, or use Disable if you just want it out of active use.`
        );
        return;
      }

      // Logged before the delete — activities.branch_id would fail its
      // own foreign key the moment the branch it points at is gone.
      await logActivity(
        'branch.deleted',
        'branches',
        deleteTarget.id,
        `Deleted branch "${deleteTarget.name}" (${deleteTarget.code})`,
        undefined,
        deleteTarget.id
      );

      const { error } = await supabase.from('branches').delete().eq('id', deleteTarget.id);
      if (error) throw error;

      toast.success('Branch permanently deleted');
      setDeleteTarget(null);
      loadBranches();
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to delete branch');
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  // --- Profile update ------------------------------------------------------

  const handleSaveProfile = async () => {
    if (!profile) return;
    const trimmed = profileName.trim();
    if (!trimmed) {
      toast.error('Full name cannot be empty');
      return;
    }
    if (trimmed === profileNameOriginal) {
      toast.info('No changes to save');
      return;
    }

    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: trimmed,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      if (error) throw error;

      await logActivity(
        'profile.updated',
        'profiles',
        profile.id,
        `Updated own profile name to "${trimmed}"`,
        { full_name: trimmed },
        profile.branch_id
      );

      setProfileNameOriginal(trimmed);
      await refreshProfile();
      toast.success('Profile updated successfully');
    } catch (err) {
      const message =
        getErrorMessage(err, 'Failed to update profile');
      toast.error(message);
    } finally {
      setSavingProfile(false);
    }
  };

  // --- Change password -----------------------------------------------------

  const handleChangePassword = async () => {
    if (!profile) return;

    const errs: typeof passwordErrors = {};
    if (!currentPassword) errs.current = 'Current password is required';
    if (!newPassword) {
      errs.new = 'New password is required';
    } else if (newPassword.length < 8) {
      errs.new = 'Password must be at least 8 characters';
    }
    if (!confirmPassword) {
      errs.confirm = 'Please confirm your new password';
    } else if (newPassword !== confirmPassword) {
      errs.confirm = 'Passwords do not match';
    }
    if (currentPassword && newPassword && currentPassword === newPassword) {
      errs.new = 'New password must be different from current password';
    }

    setPasswordErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setChangingPassword(true);
    try {
      // The "Current Password" field was only ever checked for presence,
      // never verified — any non-empty string would pass, which is a
      // false assurance UX bug (not a privilege-escalation one, since a
      // valid session is already required to reach this page). Verify it
      // by attempting a real sign-in before applying the change.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: currentPassword,
      });
      if (verifyError) {
        setPasswordErrors({ current: 'Current password is incorrect' });
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      await logActivity(
        'profile.password_changed',
        'profiles',
        profile.id,
        'Changed own account password',
        {},
        profile.branch_id
      );

      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordErrors({});
    } catch (err) {
      const message =
        getErrorMessage(err, 'Failed to change password');
      toast.error(message);
    } finally {
      setChangingPassword(false);
    }
  };

  // --- Render: loading -----------------------------------------------------

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

  const userBranch = profile.branch;
  const roleMeta = ROLE_META[profile.role as keyof typeof ROLE_META] ?? {
    label: profile.role,
    color: 'bg-gray-100 text-gray-700',
  };
  const profileNameChanged = profileName.trim() !== profileNameOriginal;

  return (
    <div className="space-y-6 p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 page-title">
          <SettingsIcon className="h-6 w-6 text-blue-600" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your account, company information, and system preferences.
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-5">
          <TabsTrigger value="company" className="gap-1.5">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Company</span>
          </TabsTrigger>
          <TabsTrigger value="branches" className="gap-1.5">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Branches</span>
          </TabsTrigger>
          <TabsTrigger value="profile" className="gap-1.5">
            <UserIcon className="h-4 w-4" />
            <span className="hidden sm:inline">My Profile</span>
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-1.5">
            <SettingsIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Preferences</span>
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-1.5">
            <Webhook className="h-4 w-4" />
            <span className="hidden sm:inline">Webhooks</span>
          </TabsTrigger>
        </TabsList>

        {/* ──────────────────────────────────────────────────────────── */}
        {/* Tab 1: Company Information                                    */}
        {/* ──────────────────────────────────────────────────────────── */}
        <TabsContent value="company" className="space-y-6">
          {/* Platform info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <Globe className="h-5 w-5" />
                </div>
                Platform Information
              </CardTitle>
              <CardDescription>
                Details about the freight forwarding ERP platform.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Platform Name
                  </Label>
                  <p className="text-sm font-semibold">The Manifest</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Version
                  </Label>
                  <p className="text-sm font-semibold">v1.0.0</p>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Description
                </Label>
                <p className="text-sm text-muted-foreground">
                  The Manifest is a comprehensive freight forwarding ERP platform
                  that streamlines shipment management, quotations, customer
                  relationships, and document workflows across all your
                  branches.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* User's branch info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Building2 className="h-5 w-5" />
                </div>
                My Branch
              </CardTitle>
              <CardDescription>
                The branch you are currently assigned to.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {userBranch ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Branch Name
                    </Label>
                    <p className="text-sm font-semibold">{userBranch.name}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      Branch Code
                    </Label>
                    <p className="text-sm font-semibold">{userBranch.code}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Badge
                      variant="secondary"
                      className={`text-[11px] ${
                        userBranch.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {userBranch.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  {userBranch.address && (
                    <div className="space-y-1">
                      <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> Address
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {userBranch.address}
                      </p>
                    </div>
                  )}
                  {userBranch.phone && (
                    <div className="space-y-1">
                      <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" /> Phone
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {userBranch.phone}
                      </p>
                    </div>
                  )}
                  {userBranch.email && (
                    <div className="space-y-1">
                      <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" /> Email
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {userBranch.email}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Building2 className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">No branch assigned</p>
                  <p className="text-sm text-muted-foreground">
                    You are not currently assigned to a branch. Contact an
                    administrator for assistance.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quotation workflow (admin only) */}
          {isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <FileText className="h-5 w-5" />
                  </div>
                  Quotation Workflow
                </CardTitle>
                <CardDescription>
                  Controls how a quotation moves from Draft to Sent, org-wide.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
                  <div>
                    <p className="text-sm font-medium">Require approval before sending</p>
                    <p className="text-sm text-muted-foreground">
                      When on, a Draft quotation must be approved by an admin or branch
                      manager (Pending Approval → Approved) before it can be marked Sent.
                      When off, Draft can go straight to Sent.
                    </p>
                  </div>
                  <Switch
                    checked={approvalRequired}
                    onCheckedChange={handleToggleApprovalRequired}
                    disabled={savingApproval}
                  />
                </div>

                <div className="mt-4 space-y-3 rounded-lg border border-border p-4">
                  <div>
                    <p className="text-sm font-medium">Escalation thresholds</p>
                    <p className="text-sm text-muted-foreground">
                      A quotation exceeding either value always requires Branch Manager
                      approval, regardless of the toggle above. Leave blank to disable.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="discount-threshold">Discount % threshold</Label>
                      <Input
                        id="discount-threshold"
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        placeholder="e.g. 15"
                        value={discountThreshold}
                        onChange={(e) => setDiscountThreshold(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="amount-threshold">Amount threshold</Label>
                      <Input
                        id="amount-threshold"
                        type="number"
                        min="0"
                        step="1000"
                        placeholder="e.g. 5000000"
                        value={amountThreshold}
                        onChange={(e) => setAmountThreshold(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button size="sm" onClick={handleSaveThresholds} disabled={savingThresholds}>
                    {savingThresholds && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Save Thresholds
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ──────────────────────────────────────────────────────────── */}
        {/* Tab 2: Branches (admin only)                                  */}
        {/* ──────────────────────────────────────────────────────────── */}
        <TabsContent value="branches" className="space-y-6">
          {!isAdmin ? (
            <Card className="max-w-md mx-auto">
              <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
                  <ShieldAlert className="h-8 w-8 text-red-500" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-xl font-bold tracking-tight">
                    Admin Access Required
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    You do not have permission to manage branches. This area
                    is restricted to administrators only.
                  </p>
                </div>
                <Badge variant="secondary" className="text-[11px]">
                  Your role: {roleMeta.label}
                </Badge>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Branch Management</h2>
                  <p className="text-sm text-muted-foreground">
                    Create, edit, and manage all company branches.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setCreateForm(EMPTY_FORM);
                    setCreateFormErrors({});
                    setCreateOpen(true);
                  }}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add Branch
                </Button>
              </div>

              {/* Error state */}
              {branchesError && (
                <Card className="border-red-200 bg-red-50">
                  <CardContent className="flex items-center gap-3 p-4">
                    <ShieldAlert className="h-5 w-5 text-red-500" />
                    <div>
                      <p className="text-sm font-medium text-red-700">
                        Failed to load branches
                      </p>
                      <p className="text-xs text-red-600">{branchesError}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      onClick={loadBranches}
                    >
                      Retry
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Table */}
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle className="text-lg font-semibold">
                    All Branches
                    {!branchesLoading && (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        ({branches.length})
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {branchesLoading ? (
                    <div className="space-y-2 p-4">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 w-full" />
                      ))}
                    </div>
                  ) : branches.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                        <Building2 className="h-7 w-7 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">No branches found</p>
                        <p className="text-sm text-muted-foreground">
                          Get started by adding your first branch.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCreateForm(EMPTY_FORM);
                          setCreateFormErrors({});
                          setCreateOpen(true);
                        }}
                      >
                        <Plus className="mr-1.5 h-4 w-4" />
                        Add Branch
                      </Button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Code</TableHead>
                            <TableHead>Address</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {branches.map((branch) => (
                            <TableRow key={branch.id} className="transition-colors hover:bg-accent/60">
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                                    <Building2 className="h-4 w-4" />
                                  </div>
                                  {branch.name}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className="font-mono text-[11px]"
                                >
                                  {branch.code}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground max-w-[200px] truncate">
                                {branch.address ?? '—'}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {branch.phone ?? '—'}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {branch.email ?? '—'}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="secondary"
                                  className={`text-[11px] ${
                                    branch.is_active
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-gray-100 text-gray-600'
                                  }`}
                                >
                                  {branch.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    title="Edit branch"
                                    onClick={() => openEditDialog(branch)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    title={
                                      branch.is_active
                                        ? 'Disable branch'
                                        : 'Enable branch'
                                    }
                                    onClick={() => setToggleTarget(branch)}
                                  >
                                    <Power
                                      className={`h-4 w-4 ${
                                        branch.is_active
                                          ? 'text-green-600'
                                          : 'text-gray-400'
                                      }`}
                                    />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    title="Delete branch"
                                    onClick={() => setDeleteTarget(branch)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ──────────────────────────────────────────────────────────── */}
        {/* Tab 3: My Profile                                             */}
        {/* ──────────────────────────────────────────────────────────── */}
        <TabsContent value="profile" className="space-y-6">
          {/* Profile info card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <UserIcon className="h-5 w-5" />
                </div>
                Account Information
              </CardTitle>
              <CardDescription>
                Your personal account details and role assignment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Full Name
                  </Label>
                  <p className="text-sm font-semibold">{profile.full_name}</p>
                </div>
                <div className="space-y-1">
                  <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Mail className="h-3 w-3" /> Email
                  </Label>
                  <p className="text-sm font-semibold break-all">
                    {profile.email}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Role</Label>
                  <Badge
                    variant="secondary"
                    className={`text-[11px] ${roleMeta.color}`}
                  >
                    {roleMeta.label}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Branch</Label>
                  <p className="text-sm font-semibold">
                    {userBranch?.name ?? '—'}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Badge
                    variant="secondary"
                    className={`text-[11px] ${
                      profile.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {profile.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Member Since
                  </Label>
                  <p className="text-sm font-semibold">
                    {formatDate(profile.created_at)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Edit profile card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Pencil className="h-5 w-5 text-blue-600" />
                Edit Profile
              </CardTitle>
              <CardDescription>
                Update your full name. Email and role are managed by
                administrators.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="profile-name">Full Name</Label>
                <Input
                  id="profile-name"
                  placeholder="Your full name"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveProfile();
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveProfile}
                  disabled={savingProfile || !profileNameChanged}
                >
                  {savingProfile ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-4 w-4" />
                  )}
                  Save Changes
                </Button>
                {profileNameChanged && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setProfileName(profileNameOriginal)}
                    disabled={savingProfile}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Change password card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="h-5 w-5 text-blue-600" />
                Change Password
              </CardTitle>
              <CardDescription>
                Update your password to keep your account secure.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  placeholder="Enter your current password"
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    setPasswordErrors((p) => ({ ...p, current: undefined }));
                  }}
                />
                {passwordErrors.current && (
                  <p className="text-xs text-destructive">
                    {passwordErrors.current}
                  </p>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="Minimum 8 characters"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setPasswordErrors((p) => ({ ...p, new: undefined }));
                    }}
                  />
                  {passwordErrors.new && (
                    <p className="text-xs text-destructive">
                      {passwordErrors.new}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setPasswordErrors((p) => ({ ...p, confirm: undefined }));
                    }}
                  />
                  {passwordErrors.confirm && (
                    <p className="text-xs text-destructive">
                      {passwordErrors.confirm}
                    </p>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleChangePassword}
                disabled={changingPassword}
              >
                {changingPassword ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-1.5 h-4 w-4" />
                )}
                Change Password
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ──────────────────────────────────────────────────────────── */}
        {/* Tab 4: Preferences                                             */}
        {/* ──────────────────────────────────────────────────────────── */}
        <TabsContent value="preferences" className="space-y-6">
          <PreferencesTab />
        </TabsContent>

        {/* ──────────────────────────────────────────────────────────── */}
        {/* Tab 5: Webhooks                                                */}
        {/* ──────────────────────────────────────────────────────────── */}
        <TabsContent value="webhooks" className="space-y-6">
          {!isAdmin && profile?.role !== 'branch_manager' ? (
            <Card>
              <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                Only admins and branch managers can manage webhook subscriptions.
              </CardContent>
            </Card>
          ) : (
            <WebhookSettingsPanel />
          )}
        </TabsContent>
      </Tabs>

      {/* ─────────────────────────────────────────────────────────────── */}
      {/* Create Branch Dialog                                             */}
      {/* ─────────────────────────────────────────────────────────────── */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateFormErrors({});
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-600" />
              Add New Branch
            </DialogTitle>
            <DialogDescription>
              Create a new company branch. Fields marked with{' '}
              <span className="text-destructive">*</span> are required.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="create-name">
                  Branch Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="create-name"
                  placeholder="e.g. Shanghai Office"
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
                {createFormErrors.name && (
                  <p className="text-xs text-destructive">
                    {createFormErrors.name}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-code">
                  Branch Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="create-code"
                  placeholder="e.g. SHA"
                  className="font-mono uppercase"
                  value={createForm.code}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, code: e.target.value }))
                  }
                />
                {createFormErrors.code && (
                  <p className="text-xs text-destructive">
                    {createFormErrors.code}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-address">Address</Label>
              <Textarea
                id="create-address"
                placeholder="Street address, city, country"
                rows={2}
                value={createForm.address}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, address: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="create-phone">Phone</Label>
                <Input
                  id="create-phone"
                  placeholder="+1 234 567 8900"
                  value={createForm.phone}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, phone: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-email">Email</Label>
                <Input
                  id="create-email"
                  type="email"
                  placeholder="branch@freightops.com"
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
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Bank Details (for quotation PDFs)
              </Label>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="create-bank-name">Bank Name</Label>
                <Input
                  id="create-bank-name"
                  value={createForm.bank_name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, bank_name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-bank-account-name">Account Name</Label>
                <Input
                  id="create-bank-account-name"
                  value={createForm.bank_account_name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, bank_account_name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-bank-account-number">Account Number</Label>
                <Input
                  id="create-bank-account-number"
                  value={createForm.bank_account_number}
                  onChange={(e) => setCreateForm((f) => ({ ...f, bank_account_number: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-bank-swift">SWIFT Code</Label>
                <Input
                  id="create-bank-swift"
                  value={createForm.bank_swift_code}
                  onChange={(e) => setCreateForm((f) => ({ ...f, bank_swift_code: e.target.value }))}
                />
              </div>
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
            <Button onClick={handleCreateBranch} disabled={creating}>
              {creating && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Create Branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────── */}
      {/* Edit Branch Dialog                                              */}
      {/* ─────────────────────────────────────────────────────────────── */}
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
              Edit Branch
            </DialogTitle>
            <DialogDescription>
              {editTarget && (
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  {editTarget.name} ({editTarget.code})
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">
                  Branch Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-name"
                  placeholder="e.g. Shanghai Office"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
                {editFormErrors.name && (
                  <p className="text-xs text-destructive">
                    {editFormErrors.name}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-code">
                  Branch Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="edit-code"
                  placeholder="e.g. SHA"
                  className="font-mono uppercase"
                  value={editForm.code}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, code: e.target.value }))
                  }
                />
                {editFormErrors.code && (
                  <p className="text-xs text-destructive">
                    {editFormErrors.code}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-address">Address</Label>
              <Textarea
                id="edit-address"
                placeholder="Street address, city, country"
                rows={2}
                value={editForm.address}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, address: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  placeholder="+1 234 567 8900"
                  value={editForm.phone}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, phone: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  placeholder="branch@freightops.com"
                  value={editForm.email}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, email: e.target.value }))
                  }
                />
                {editFormErrors.email && (
                  <p className="text-xs text-destructive">
                    {editFormErrors.email}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Bank Details (for quotation PDFs)
              </Label>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-bank-name">Bank Name</Label>
                <Input
                  id="edit-bank-name"
                  value={editForm.bank_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, bank_name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-bank-account-name">Account Name</Label>
                <Input
                  id="edit-bank-account-name"
                  value={editForm.bank_account_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, bank_account_name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-bank-account-number">Account Number</Label>
                <Input
                  id="edit-bank-account-number"
                  value={editForm.bank_account_number}
                  onChange={(e) => setEditForm((f) => ({ ...f, bank_account_number: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-bank-swift">SWIFT Code</Label>
                <Input
                  id="edit-bank-swift"
                  value={editForm.bank_swift_code}
                  onChange={(e) => setEditForm((f) => ({ ...f, bank_swift_code: e.target.value }))}
                />
              </div>
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
            <Button onClick={handleEditBranch} disabled={editing}>
              {editing && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────── */}
      {/* Enable/Disable Branch Confirmation                              */}
      {/* ─────────────────────────────────────────────────────────────── */}
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
              {toggleTarget?.is_active ? 'Disable Branch' : 'Enable Branch'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.is_active
                ? `Are you sure you want to disable "${toggleTarget?.name}" (${toggleTarget?.code})? Users assigned to this branch may lose access to branch-specific features.`
                : `Are you sure you want to enable "${toggleTarget?.name}" (${toggleTarget?.code})? The branch will become active again.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggling}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleToggleBranch();
              }}
              disabled={toggling}
            >
              {toggling && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              {toggleTarget?.is_active ? 'Disable' : 'Enable'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─────────────────────────────────────────────────────────────── */}
      {/* Delete Branch Confirmation                                      */}
      {/* ─────────────────────────────────────────────────────────────── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              Delete Branch Permanently?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes "{deleteTarget?.name}" ({deleteTarget?.code})
              entirely — it can't be undone. This only succeeds if the branch
              has no shipments, customers, invoices, or staff still attached;
              otherwise you'll be told exactly what's blocking it. If you just
              want it out of active use without deleting it, use Disable
              instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteBranch();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// PreferencesTab — Notification Settings + Theme Preference
// ============================================================

function PreferencesTab() {
  const { theme, setTheme, preferences, setPreferences, loading } = useTheme();
  const [saving, setSaving] = useState(false);

  const handleToggle = async (key: keyof UserPreferences, value: boolean) => {
    setSaving(true);
    await setPreferences({ [key]: value } as Partial<UserPreferences>);
    setSaving(false);
    toast.success('Preference updated');
  };

  const handleThemeChange = async (t: 'light' | 'dark' | 'system') => {
    setSaving(true);
    await setTheme(t);
    setSaving(false);
    toast.success(`Theme changed to ${t}`);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const notifGroups = [
    {
      title: 'Shipment Updates',
      description: 'Get notified when shipment statuses change.',
      emailKey: 'notif_email_shipment_updates' as const,
      inappKey: 'notif_inapp_shipment_updates' as const,
    },
    {
      title: 'Quotation Approvals',
      description: 'Get notified when quotations are approved or rejected.',
      emailKey: 'notif_email_quotation_approvals' as const,
      inappKey: 'notif_inapp_quotation_approvals' as const,
    },
    {
      title: 'System Alerts',
      description: 'Get notified about system maintenance and important alerts.',
      emailKey: 'notif_email_system_alerts' as const,
      inappKey: 'notif_inapp_system_alerts' as const,
    },
  ];

  const themeOptions: { value: 'light' | 'dark' | 'system'; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <div className="space-y-6">
      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
              <Bell className="h-5 w-5" />
            </div>
            Notification Settings
          </CardTitle>
          <CardDescription>
            Configure email and in-app notifications for shipment updates, quotation approvals, and system alerts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Column headers */}
          <div className="hidden items-center gap-4 border-b border-border pb-2 sm:flex sm:pl-1">
            <span className="flex-1 text-xs font-medium text-muted-foreground">Category</span>
            <span className="w-20 text-center text-xs font-medium text-muted-foreground">Email</span>
            <span className="w-20 text-center text-xs font-medium text-muted-foreground">In-App</span>
          </div>

          {notifGroups.map((group) => (
            <div key={group.title} className="flex flex-col gap-3 border-b border-border pb-4 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4 sm:pl-1">
              <div className="flex-1">
                <p className="text-sm font-medium">{group.title}</p>
                <p className="text-xs text-muted-foreground">{group.description}</p>
              </div>
              <div className="flex items-center justify-between gap-4 sm:justify-center">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground sm:hidden">Email</span>
                  <Switch
                    checked={preferences?.[group.emailKey] ?? true}
                    onCheckedChange={(v) => handleToggle(group.emailKey, v)}
                    disabled={saving}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground sm:hidden">In-App</span>
                  <Switch
                    checked={preferences?.[group.inappKey] ?? true}
                    onCheckedChange={(v) => handleToggle(group.inappKey, v)}
                    disabled={saving}
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Theme Preference */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
              <Palette className="h-5 w-5" />
            </div>
            Theme Preference
          </CardTitle>
          <CardDescription>
            Choose between light, dark, or system themes for your dashboard interface.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {themeOptions.map((opt) => {
              const Icon = opt.icon;
              const active = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleThemeChange(opt.value)}
                  disabled={saving}
                  className={cn(
                    'flex flex-col items-center gap-3 rounded-lg border-2 p-5 transition-all hover:border-primary/50 disabled:opacity-50',
                    active
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border bg-card hover:bg-accent'
                  )}
                >
                  <div className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
                    active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className={cn(
                    'text-sm font-medium',
                    active ? 'text-primary' : 'text-foreground'
                  )}>
                    {opt.label}
                  </span>
                  {active && (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-border bg-muted/50 p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">System</span> follows your operating system preference. The theme applies instantly and is saved to your account.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}
