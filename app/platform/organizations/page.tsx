'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Building2,
  MapPin,
  Loader2,
  MoreHorizontal,
  Eye,
  Pencil,
  Power,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { getErrorMessage, cn } from '@/lib/utils';
import { formatDate, formatCurrency } from '@/lib/utils/status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Organization, Plan, BillingCycle } from '@/types';

// A new org starts on a 14-day trial, matching how the Subscriptions page
// treats a fresh assignment.
const TRIAL_DAYS = 14;

// Sentinel for the "Free trial — 14 days" choice: the org is created with
// no paid plan assigned (plan_id is NOT NULL, so no subscription row is
// written at all — a plan gets assigned later on Subscriptions).
const TRIAL_ONLY = 'trial';

interface OrgForm {
  name: string;
  slug: string;
  city: string;
  country: string;
  phone: string;
  email: string;
}

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
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [trashedCount, setTrashedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [plans, setPlans] = useState<Plan[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<OrgForm>(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof OrgForm, string>>>({});
  const [createPlanId, setCreatePlanId] = useState('');
  const [createCycle, setCreateCycle] = useState<BillingCycle>('monthly');
  const [creating, setCreating] = useState(false);

  const [editTarget, setEditTarget] = useState<Organization | null>(null);
  const [editForm, setEditForm] = useState<OrgForm>(EMPTY_FORM);
  const [editErrors, setEditErrors] = useState<Partial<Record<keyof OrgForm, string>>>({});
  const [editing, setEditing] = useState(false);

  const [toggleTarget, setToggleTarget] = useState<Organization | null>(null);
  const [toggling, setToggling] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Organization | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [activeRes, trashedRes, plansRes] = await Promise.all([
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
          .order('sort_order', { ascending: true }),
      ]);
      if (activeRes.error) throw activeRes.error;
      if (plansRes.error) throw plansRes.error;
      setOrgs((activeRes.data as Organization[]) ?? []);
      setTrashedCount(trashedRes.count ?? 0);
      setPlans((plansRes.data as Plan[]) ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load organizations'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  const handleCreate = async () => {
    if (!profile) return;
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('organizations')
        .insert({
          name: form.name.trim(),
          slug: form.slug.trim(),
          city: form.city.trim() || null,
          country: form.country.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          created_by: profile.id,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      const newOrg = data as Organization;

      if (createPlanId === TRIAL_ONLY) {
        // Free trial with no paid plan chosen yet — nothing to assign.
        toast.success(`${newOrg.name} created on a ${TRIAL_DAYS}-day free trial`);
      } else {
        // Put the org on its chosen plan as a trial straight away. If this
        // fails the org still exists, so report it as a partial result and
        // point at where to finish — don't pretend the whole thing failed.
        const trialEnds = new Date(
          Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000
        ).toISOString();
        const { error: subError } = await supabase.from('org_subscriptions').insert({
          organization_id: newOrg.id,
          plan_id: createPlanId,
          status: 'trial',
          billing_cycle: createCycle,
          seats: 1,
          trial_ends_at: trialEnds,
          updated_by: profile.id,
        });

        if (subError) {
          toast.warning(
            `${newOrg.name} created, but assigning the plan failed. Set it on Subscriptions.`
          );
        } else {
          const planName = plans.find((p) => p.id === createPlanId)?.name ?? 'plan';
          toast.success(`${newOrg.name} created on the ${planName} plan (trial)`);
        }
      }

      setCreateOpen(false);
      setForm(EMPTY_FORM);
      setSlugTouched(false);
      setErrors({});
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create organization'));
    } finally {
      setCreating(false);
    }
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

  const handleEdit = async () => {
    if (!editTarget) return;
    const errs = validate(editForm);
    setEditErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setEditing(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          name: editForm.name.trim(),
          slug: editForm.slug.trim(),
          city: editForm.city.trim() || null,
          country: editForm.country.trim() || null,
          phone: editForm.phone.trim() || null,
          email: editForm.email.trim() || null,
        })
        .eq('id', editTarget.id);

      if (error) throw error;

      toast.success('Organization updated');
      setEditTarget(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update organization'));
    } finally {
      setEditing(false);
    }
  };

  const handleToggleActive = async () => {
    if (!toggleTarget) return;
    setToggling(true);
    try {
      const newState = !toggleTarget.is_active;
      const { error } = await supabase
        .from('organizations')
        .update({ is_active: newState })
        .eq('id', toggleTarget.id);
      if (error) throw error;
      toast.success(`${toggleTarget.name} ${newState ? 'activated' : 'suspended'}`);
      setToggleTarget(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update organization status'));
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success(`${deleteTarget.name} moved to Trash`);
      setDeleteTarget(null);
      setDeleteConfirmText('');
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to delete organization'));
    } finally {
      setDeleting(false);
    }
  };

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
            <Link href="/platform/organizations/trash">
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
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell>
                      <Link
                        href={`/platform/organizations/${org.id}`}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {org.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{org.slug}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {org.city || org.country ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {[org.city, org.country].filter(Boolean).join(', ')}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          org.is_active
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        )}
                      >
                        {org.is_active ? 'Active' : 'Suspended'}
                      </Badge>
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
                            <Link href={`/platform/organizations/${org.id}`}>
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
                ))}
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
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Organization</DialogTitle>
            <DialogDescription>
              Provision a tenant workspace and its plan. You can invite its
              first admin from the organization&apos;s detail page next.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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

            <div className="grid grid-cols-2 gap-4">
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
            </div>

            <div className="grid grid-cols-2 gap-4">
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
                        Free trial — {TRIAL_DAYS} days
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
                  ? `Starts on a ${TRIAL_DAYS}-day free trial with no plan assigned yet — pick one any time on Subscriptions. Trials are billed after conversion.`
                  : `Starts on a ${TRIAL_DAYS}-day trial of this plan. The billing cycle applies once the trial converts.`}
              </p>
              {plans.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No paid plans defined yet. Add tiers on{' '}
                  <Link href="/platform/plans-pricing" className="font-medium underline">
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
            <DialogDescription>Update {editTarget?.name}&apos;s details.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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

            <div className="grid grid-cols-2 gap-4">
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
            </div>

            <div className="grid grid-cols-2 gap-4">
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
