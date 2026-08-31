'use client';

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Building2,
  Loader2,
  MoreHorizontal,
  Eye,
  Pencil,
  Power,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/shared/contexts/auth-context';
import { getErrorMessage, cn } from '@/shared/lib/utils';
import { formatDate, formatCurrency, ORGANIZATION_STATUS_META } from '@/shared/lib/utils/status';
import {
  fetchOrganizationsListData,
  createOrganization,
  editOrganization,
  toggleOrganizationActive,
  softDeleteOrganization,
  type OrgFormValues,
} from '@/features/platform/services/organizations.service';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Card, CardContent } from '@/shared/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import type { Organization, OrganizationOrigin, BillingCycle } from '@/shared/types';

// Fallback only, used for the instant before platform_settings loads (or if
// it somehow fails to) — the real value always comes from
// platform_settings.trial_duration_days below, the same source Settings and
// self-service registration already read, so changing it in one place
// (Platform Console → Settings) takes effect everywhere instead of needing
// a code change.
const DEFAULT_TRIAL_DAYS = 30;

// Sentinel for the "Free trial — N days" choice: the org is created with
// no paid plan assigned (plan_id is NOT NULL, so no subscription row is
// written at all — a plan gets assigned later on Subscriptions).
const TRIAL_ONLY = 'trial';

type OrgForm = OrgFormValues;

const EMPTY_FORM: OrgForm = { name: '', slug: '', city: '', country: '', phone: '', email: '' };
const DELETE_CONFIRM_PHRASE = 'DELETE ORGANIZATION';

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function PlatformOrganizationsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading: loading } = useQuery({
    queryKey: ['organizations', 'admin-list'],
    queryFn: fetchOrganizationsListData,
  });

  const orgs = data?.orgs ?? [];
  const trashedCount = data?.trashedCount ?? 0;
  const plans = data?.plans ?? [];
  const trialDays = data?.trialDays ?? DEFAULT_TRIAL_DAYS;
  const trialPlan = data?.trialPlan ?? null;
  const subsByOrg = data?.subsByOrg ?? new Map();
  const ownerByOrg = data?.ownerByOrg ?? new Map();
  const userCountByOrg = data?.userCountByOrg ?? new Map();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<OrgForm>(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof OrgForm, string>>>({});
  const [createPlanId, setCreatePlanId] = useState('');
  const [createCycle, setCreateCycle] = useState<BillingCycle>('monthly');
  // Never 'self_service' here — this dialog is the assisted/administrative
  // path (spec section 24); self-service registration is exclusively
  // /register. Demo/Internal keep those workspaces clearly distinguished
  // from real customers on this table (spec section 25).
  const [createOrigin, setCreateOrigin] = useState<Exclude<OrganizationOrigin, 'self_service'>>('platform_admin');

  const [editTarget, setEditTarget] = useState<Organization | null>(null);
  const [editForm, setEditForm] = useState<OrgForm>(EMPTY_FORM);
  const [editErrors, setEditErrors] = useState<Partial<Record<keyof OrgForm, string>>>({});

  const [toggleTarget, setToggleTarget] = useState<Organization | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Organization | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const invalidateOrganizations = () => {
    queryClient.invalidateQueries({ queryKey: ['organizations'] });
  };

  const validate = (f: OrgForm): Partial<Record<keyof OrgForm, string>> => {
    const errs: Partial<Record<keyof OrgForm, string>> = {};
    if (!f.name.trim()) errs.name = 'Organization name is required';
    if (!f.slug.trim()) {
      errs.slug = 'Slug is required';
    } else if (!/^[a-z0-9-]+$/.test(f.slug.trim())) {
      errs.slug = 'Slug can only contain lowercase letters, numbers, and hyphens';
    }
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) {
      errs.email = 'Invalid email address';
    }
    return errs;
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not signed in');
      const planName = plans.find((p) => p.id === createPlanId)?.name;
      return createOrganization({
        form,
        origin: createOrigin,
        createdBy: profile.id,
        planId: createPlanId,
        billingCycle: createCycle,
        trialDays,
        trialPlanId: trialPlan?.id ?? null,
        planName,
      });
    },
    onSuccess: (result) => {
      invalidateOrganizations();
      if (result.kind === 'trial') {
        toast.success(`${result.org.name} created on a ${trialDays}-day free trial`);
      } else if (result.assigned) {
        toast.success(`${result.org.name} created on the ${result.planName} plan (trial)`);
      } else {
        toast.warning(
          `${result.org.name} created, but assigning the plan failed. Set it on Subscriptions.`
        );
      }
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setSlugTouched(false);
      setErrors({});
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to create organization'));
    },
  });

  const handleCreate = () => {
    if (!profile) return;
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    createMutation.mutate();
  };

  const openEdit = (org: Organization) => {
    setEditTarget(org);
    setEditForm({
      name: org.name,
      slug: org.slug,
      city: org.city ?? '',
      country: org.country ?? '',
      phone: org.phone ?? '',
      email: org.email ?? '',
    });
    setEditErrors({});
  };

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editTarget || !profile) throw new Error('Not ready');
      await editOrganization({ orgId: editTarget.id, form: editForm, updatedBy: profile.id });
    },
    onSuccess: () => {
      invalidateOrganizations();
      if (editTarget) queryClient.invalidateQueries({ queryKey: ['organization', editTarget.id] });
      toast.success('Organization updated');
      setEditTarget(null);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to update organization'));
    },
  });

  const handleEdit = () => {
    if (!editTarget || !profile) return;
    const errs = validate(editForm);
    setEditErrors(errs);
    if (Object.keys(errs).length > 0) return;
    editMutation.mutate();
  };

  const toggleMutation = useMutation({
    mutationFn: async () => {
      if (!toggleTarget || !profile) throw new Error('Not ready');
      return toggleOrganizationActive({
        orgId: toggleTarget.id,
        orgName: toggleTarget.name,
        currentlyActive: toggleTarget.is_active,
        updatedBy: profile.id,
      });
    },
    onSuccess: (result) => {
      invalidateOrganizations();
      if (toggleTarget) queryClient.invalidateQueries({ queryKey: ['organization', toggleTarget.id] });
      toast.success(`${toggleTarget?.name} ${result.newState ? 'activated' : 'suspended'}`);
      setToggleTarget(null);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to update organization status'));
    },
  });

  const handleToggleActive = () => toggleMutation.mutate();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleteTarget || !profile) throw new Error('Not ready');
      await softDeleteOrganization({ orgId: deleteTarget.id, orgName: deleteTarget.name, deletedBy: profile.id });
    },
    onSuccess: () => {
      invalidateOrganizations();
      if (deleteTarget) queryClient.invalidateQueries({ queryKey: ['organization', deleteTarget.id] });
      toast.success(`${deleteTarget?.name} moved to Trash`);
      setDeleteTarget(null);
      setDeleteConfirmText('');
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to delete organization'));
    },
  });

  const handleDelete = () => deleteMutation.mutate();

  const creating = createMutation.isPending;
  const editing = editMutation.isPending;
  const toggling = toggleMutation.isPending;
  const deleting = deleteMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Organizations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every tenant on The Manifest platform.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/platform/organizations/trash">
              <Trash2 className="mr-1.5 h-4 w-4" />
              Trash{trashedCount > 0 ? ` (${trashedCount})` : ''}
            </Link>
          </Button>
          <Button
            onClick={() => {
              // Default to the free trial, matching the dropdown's first item.
              setCreatePlanId(TRIAL_ONLY);
              setCreateCycle('monthly');
              setCreateOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Create Organization
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : orgs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium">No organizations yet</p>
              <p className="text-sm text-muted-foreground">
                Create the first organization to get started.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Storage</TableHead>
                  <TableHead>Renewal</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-10">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((org) => {
                  const sub = subsByOrg.get(org.id);
                  const owner = ownerByOrg.get(org.id);
                  const userCount = userCountByOrg.get(org.id) ?? 0;
                  const renewalDate = sub?.current_period_end ?? sub?.trial_ends_at ?? null;
                  return (
                  <TableRow key={org.id}>
                    <TableCell>
                      <Link
                        to={`/platform/organizations/${org.id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {org.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">/{org.slug}</p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {owner ? (
                        <>
                          <p className="font-medium">{owner.full_name}</p>
                          <p className="text-xs text-muted-foreground">{owner.email}</p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {sub?.plan ? (
                        <Badge variant="outline">{sub.plan.name}</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn(ORGANIZATION_STATUS_META[org.status]?.color)}>
                        {ORGANIZATION_STATUS_META[org.status]?.label ?? org.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{userCount}</TableCell>
                    <TableCell className="text-sm text-muted-foreground" title="Per-organization storage usage isn't tracked yet">
                      —
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {renewalDate ? formatDate(renewalDate) : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(org.created_at)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Organization actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel className="max-w-[200px] truncate">
                            {org.name}
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem asChild>
                            <Link to={`/platform/organizations/${org.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(org)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setToggleTarget(org)}>
                            <Power className="mr-2 h-4 w-4" />
                            {org.is_active ? 'Suspend' : 'Activate'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(org)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete organization
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Organization Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setForm(EMPTY_FORM);
            setSlugTouched(false);
            setErrors({});
            setCreateOrigin('platform_admin');
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>New Organization</DialogTitle>
            <DialogDescription>
              Provision a tenant workspace and its plan. You can invite its
              first admin from the organization&apos;s detail page next.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="org-name">Organization name</Label>
                <Input
                  id="org-name"
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({
                      ...f,
                      name,
                      slug: slugTouched ? f.slug : slugify(name),
                    }));
                  }}
                  placeholder="Acme Logistics Ltd"
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="org-slug">Slug</Label>
                <Input
                  id="org-slug"
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm((f) => ({ ...f, slug: slugify(e.target.value) }));
                  }}
                  placeholder="acme-logistics"
                />
                {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="org-city">City</Label>
                <Input
                  id="org-city"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="org-country">Country</Label>
                <Input
                  id="org-country"
                  value={form.country}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="org-phone">Phone</Label>
                <Input
                  id="org-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="org-email">Email</Label>
                <Input
                  id="org-email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="org-origin">Organization Type</Label>
                <Select value={createOrigin} onValueChange={(v) => setCreateOrigin(v as typeof createOrigin)}>
                  <SelectTrigger id="org-origin">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="platform_admin">Assisted Onboarding (real customer)</SelectItem>
                    <SelectItem value="demo">Demo</SelectItem>
                    <SelectItem value="internal">Internal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <p className="text-xs text-muted-foreground">
                  Normal customers should use self-service registration at /register. Use this for enterprise,
                  assisted, demo, or internal workspaces.
                </p>
              </div>
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-sm font-medium">Plan</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="org-plan">Subscription</Label>
                  <Select value={createPlanId} onValueChange={setCreatePlanId}>
                    <SelectTrigger id="org-plan">
                      <SelectValue placeholder="Select a plan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TRIAL_ONLY}>
                        Free trial — {trialDays} days
                      </SelectItem>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — {formatCurrency(p.monthly_price, p.currency)}/mo
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="org-cycle">Billing cycle</Label>
                  <Select
                    value={createCycle}
                    onValueChange={(v) => setCreateCycle(v as BillingCycle)}
                    disabled={createPlanId === TRIAL_ONLY}
                  >
                    <SelectTrigger id="org-cycle">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {createPlanId === TRIAL_ONLY
                  ? `Starts on a ${trialDays}-day free trial${trialPlan?.max_users ? ` (capped at ${trialPlan.max_users} users)` : ''} — pick a paid plan any time on Subscriptions. Trials are billed after conversion.`
                  : `Starts on a ${trialDays}-day trial of this plan. The billing cycle applies once the trial converts.`}
              </p>
              {plans.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No paid plans defined yet. Add tiers on{' '}
                  <Link to="/platform/plans-pricing" className="font-medium underline">
                    Plans &amp; Pricing
                  </Link>{' '}
                  to offer them here.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Create Organization
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Organization Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
            <DialogDescription>Update {editTarget?.name}&apos;s details.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-org-name">Organization name</Label>
                <Input
                  id="edit-org-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                />
                {editErrors.name && <p className="text-xs text-destructive">{editErrors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-org-slug">Slug</Label>
                <Input
                  id="edit-org-slug"
                  value={editForm.slug}
                  onChange={(e) => setEditForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                />
                {editErrors.slug && <p className="text-xs text-destructive">{editErrors.slug}</p>}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-org-city">City</Label>
                <Input
                  id="edit-org-city"
                  value={editForm.city}
                  onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-org-country">Country</Label>
                <Input
                  id="edit-org-country"
                  value={editForm.country}
                  onChange={(e) => setEditForm((f) => ({ ...f, country: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-org-phone">Phone</Label>
                <Input
                  id="edit-org-phone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-org-email">Email</Label>
                <Input
                  id="edit-org-email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                />
                {editErrors.email && <p className="text-xs text-destructive">{editErrors.email}</p>}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={editing}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={editing}>
              {editing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend / Activate Dialog */}
      <Dialog open={!!toggleTarget} onOpenChange={(open) => !open && setToggleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Power className="h-5 w-5 text-amber-600" />
              {toggleTarget?.is_active ? 'Suspend organization?' : 'Activate organization?'}
            </DialogTitle>
            <DialogDescription>
              {toggleTarget?.is_active
                ? `${toggleTarget?.name}'s staff will be unable to sign in or access their workspace until reactivated.`
                : `${toggleTarget?.name}'s staff will regain access to their workspace immediately.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToggleTarget(null)} disabled={toggling}>
              Cancel
            </Button>
            <Button onClick={handleToggleActive} disabled={toggling}>
              {toggling && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {toggleTarget?.is_active ? 'Suspend' : 'Activate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete (move to Trash) Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteConfirmText('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              Delete organization
            </DialogTitle>
            <DialogDescription>
              <strong>{deleteTarget?.name}</strong> will be moved to Trash. You can
              restore it any time from there — it stays recoverable until you
              permanently delete it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm">
              Type <strong>{DELETE_CONFIRM_PHRASE}</strong> to confirm.
            </Label>
            <Input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={DELETE_CONFIRM_PHRASE}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || deleteConfirmText !== DELETE_CONFIRM_PHRASE}
            >
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Move to Trash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
