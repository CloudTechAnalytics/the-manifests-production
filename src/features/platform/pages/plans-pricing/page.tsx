'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Pencil,
  Check,
  Tag,
  Loader2,
  Trash2,
  Users,
  Database,
  LifeBuoy,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/shared/contexts/auth-context';
import { getErrorMessage, cn } from '@/shared/lib/utils';
import { formatCurrency } from '@/shared/lib/utils/status';
import { FEATURE_CATALOG, FEATURE_LABELS, SUPPORT_LEVELS, diffPlanFeatures } from '@/shared/lib/plans';
import {
  fetchPlansWithUsage,
  createPlan,
  updatePlan,
  deletePlan,
  type PlanWithUsage,
  type PlanPayload,
} from '@/features/platform/services/plans.service';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Switch } from '@/shared/components/ui/switch';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
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
import type { Plan } from '@/shared/types';

interface PlanForm {
  name: string;
  slug: string;
  description: string;
  monthly_price: string;
  annual_price: string;
  max_users: string;
  storage_gb: string;
  support_level: string;
  features: string[];
  is_active: boolean;
}

const EMPTY_FORM: PlanForm = {
  name: '',
  slug: '',
  description: '',
  monthly_price: '',
  annual_price: '',
  max_users: '',
  storage_gb: '',
  support_level: '',
  features: [],
  is_active: true,
};

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Whole terabytes read as "N TB"; anything else stays in GB. null = ∞.
function formatStorage(gb: number | null): string {
  if (gb == null) return '∞';
  if (gb >= 1024 && gb % 1024 === 0) return `${gb / 1024} TB`;
  return `${gb} GB`;
}

export default function PlansPricingPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading: loading } = useQuery({
    queryKey: ['plans'],
    queryFn: fetchPlansWithUsage,
  });
  const plans = data ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Plan | null>(null);
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof PlanForm, string>>>({});

  const [deleteTarget, setDeleteTarget] = useState<PlanWithUsage | null>(null);

  const invalidatePlans = () => queryClient.invalidateQueries({ queryKey: ['plans'] });

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setSlugTouched(false);
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (plan: Plan) => {
    setEditTarget(plan);
    setForm({
      name: plan.name,
      slug: plan.slug,
      description: plan.description ?? '',
      monthly_price: String(plan.monthly_price),
      annual_price: plan.annual_price != null ? String(plan.annual_price) : '',
      max_users: plan.max_users != null ? String(plan.max_users) : '',
      storage_gb: plan.storage_gb != null ? String(plan.storage_gb) : '',
      support_level: plan.support_level ?? '',
      features: plan.features,
      is_active: plan.is_active,
    });
    setSlugTouched(true);
    setErrors({});
    setDialogOpen(true);
  };

  const toggleFeature = (label: string) => {
    setForm((f) => ({
      ...f,
      features: f.features.includes(label)
        ? f.features.filter((x) => x !== label)
        : [...f.features, label],
    }));
  };

  const validate = (): boolean => {
    const errs: Partial<Record<keyof PlanForm, string>> = {};
    if (!form.name.trim()) errs.name = 'Plan name is required';
    if (!form.slug.trim()) {
      errs.slug = 'Slug is required';
    } else if (!/^[a-z0-9-]+$/.test(form.slug.trim())) {
      errs.slug = 'Slug can only contain lowercase letters, numbers, and hyphens';
    }
    if (form.monthly_price.trim() === '' || Number.isNaN(Number(form.monthly_price))) {
      errs.monthly_price = 'Monthly price is required';
    }
    if (form.annual_price.trim() !== '' && Number.isNaN(Number(form.annual_price))) {
      errs.annual_price = 'Must be a number';
    }
    if (form.max_users.trim() !== '' && Number.isNaN(Number(form.max_users))) {
      errs.max_users = 'Must be a number';
    }
    if (form.storage_gb.trim() !== '' && Number.isNaN(Number(form.storage_gb))) {
      errs.storage_gb = 'Must be a number';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Not signed in');
      const payload: PlanPayload = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description.trim() || null,
        monthly_price: Number(form.monthly_price),
        annual_price: form.annual_price.trim() === '' ? null : Number(form.annual_price),
        max_users: form.max_users.trim() === '' ? null : Number(form.max_users),
        storage_gb: form.storage_gb.trim() === '' ? null : Number(form.storage_gb),
        support_level: form.support_level.trim() || null,
        features: form.features,
        is_active: form.is_active,
      };

      if (editTarget) {
        await updatePlan({ planId: editTarget.id, payload, updatedBy: profile.id });
      } else {
        await createPlan({ payload, sortOrder: plans.length, createdBy: profile.id });
      }
      return payload;
    },
    onSuccess: (payload) => {
      invalidatePlans();
      toast.success(editTarget ? `${payload.name} updated` : `${payload.name} created`);
      setDialogOpen(false);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to save plan'));
    },
  });

  const handleSave = () => {
    if (!profile || !validate()) return;
    saveMutation.mutate();
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleteTarget || !profile) throw new Error('Not ready');
      // Soft delete. The guard against in-use plans is enforced before the
      // dialog opens, so a plan reaching here has no subscriptions.
      await deletePlan({ planId: deleteTarget.id, planName: deleteTarget.name, deletedBy: profile.id });
    },
    onSuccess: () => {
      invalidatePlans();
      toast.success(`${deleteTarget?.name} removed`);
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to remove plan'));
    },
  });

  const handleDelete = () => deleteMutation.mutate();

  // A plan in use can't be removed — offer the honest alternative rather
  // than a delete that would fail or strand a subscribed org.
  const requestDelete = (plan: PlanWithUsage) => {
    if (plan.subscription_count > 0) {
      toast.error(
        `${plan.name} has ${plan.subscription_count} organization${
          plan.subscription_count === 1 ? '' : 's'
        } on it. Retire it instead (turn off "Offered to new organizations").`
      );
      return;
    }
    setDeleteTarget(plan);
  };

  const saving = saveMutation.isPending;
  const deleting = deleteMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Plans & Pricing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define the subscription tiers offered to organizations.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          New custom plan
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-96 w-full" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Tag className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">No plans yet</p>
            <p className="text-sm text-muted-foreground">
              Create your first plan to start assigning subscriptions.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan, i) => {
            const featureDisplay = diffPlanFeatures(plans)[i];
            return (
            <Card key={plan.id} className={!plan.is_active ? 'opacity-60' : ''}>
              <CardContent className="space-y-4 p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-serif text-xl font-bold">{plan.name}</h3>
                    {plan.description && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{plan.description}</p>
                    )}
                  </div>
                  <div className="flex items-center">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(plan)} title="Edit plan">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => requestDelete(plan)}
                      title={
                        plan.subscription_count > 0
                          ? 'In use — retire instead of removing'
                          : 'Remove plan'
                      }
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="text-2xl font-bold">
                    {formatCurrency(plan.monthly_price, plan.currency)}
                    <span className="text-sm font-normal text-muted-foreground">/month</span>
                  </p>
                  {plan.annual_price != null && (
                    <p className="text-xs text-muted-foreground">
                      or {formatCurrency(plan.annual_price, plan.currency)}/year
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="flex flex-col items-center gap-1 rounded-lg bg-muted/50 px-2 py-3 text-center">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">{plan.max_users ?? '∞'}</p>
                    <p className="text-[11px] text-muted-foreground">users</p>
                  </div>
                  <div className="flex flex-col items-center gap-1 rounded-lg bg-muted/50 px-2 py-3 text-center">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">{formatStorage(plan.storage_gb)}</p>
                    <p className="text-[11px] text-muted-foreground">storage</p>
                  </div>
                  <div className="flex flex-col items-center gap-1 rounded-lg bg-muted/50 px-2 py-3 text-center">
                    <LifeBuoy className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs font-medium leading-tight">
                      {plan.support_level ?? '—'}
                    </p>
                    <p className="text-[11px] text-muted-foreground">support</p>
                  </div>
                </div>

                {featureDisplay.features.length > 0 && (
                  <div className="space-y-1.5">
                    {featureDisplay.baseName && (
                      <p className="text-xs font-medium text-muted-foreground">
                        Everything in {featureDisplay.baseName}, plus:
                      </p>
                    )}
                    <ul className="space-y-1.5">
                      {featureDisplay.features.map((f) => (
                        <li key={f} className="flex items-center gap-2 text-sm">
                          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!plan.is_active && (
                  <p className="text-xs font-medium text-muted-foreground">
                    Retired — not offered to new organizations.
                  </p>
                )}
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editTarget ? `Edit ${editTarget.name}` : 'New Plan'}</DialogTitle>
            <DialogDescription>Define pricing, limits and included features.</DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="plan-name">Plan name</Label>
                <Input
                  id="plan-name"
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }));
                  }}
                  placeholder="Professional"
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-support">Support level</Label>
                <Select
                  value={form.support_level || 'none'}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, support_level: v === 'none' ? '' : v }))
                  }
                >
                  <SelectTrigger id="plan-support">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {SUPPORT_LEVELS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plan-slug">Slug</Label>
              <Input
                id="plan-slug"
                value={form.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setForm((f) => ({ ...f, slug: slugify(e.target.value) }));
                }}
              />
              {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plan-description">Description</Label>
              <Input
                id="plan-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="For growing freight operations"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="plan-monthly">Monthly (NGN)</Label>
                <Input
                  id="plan-monthly"
                  type="number"
                  min="0"
                  value={form.monthly_price}
                  onChange={(e) => setForm((f) => ({ ...f, monthly_price: e.target.value }))}
                />
                {errors.monthly_price && (
                  <p className="text-xs text-destructive">{errors.monthly_price}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-annual">Yearly (NGN)</Label>
                <Input
                  id="plan-annual"
                  type="number"
                  min="0"
                  value={form.annual_price}
                  onChange={(e) => setForm((f) => ({ ...f, annual_price: e.target.value }))}
                />
                {errors.annual_price && (
                  <p className="text-xs text-destructive">{errors.annual_price}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="plan-max-users">Max users</Label>
                <Input
                  id="plan-max-users"
                  type="number"
                  min="0"
                  value={form.max_users}
                  onChange={(e) => setForm((f) => ({ ...f, max_users: e.target.value }))}
                  placeholder="Blank = ∞"
                />
                {errors.max_users && <p className="text-xs text-destructive">{errors.max_users}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-storage">Storage (GB)</Label>
                <Input
                  id="plan-storage"
                  type="number"
                  min="0"
                  value={form.storage_gb}
                  onChange={(e) => setForm((f) => ({ ...f, storage_gb: e.target.value }))}
                  placeholder="Blank = ∞"
                />
                {errors.storage_gb && (
                  <p className="text-xs text-destructive">{errors.storage_gb}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Included features</Label>
              <div className="grid grid-cols-2 gap-2">
                {FEATURE_CATALOG.map((feat) => {
                  const on = form.features.includes(feat.label);
                  return (
                    <button
                      key={feat.label}
                      type="button"
                      onClick={() => toggleFeature(feat.label)}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                        on
                          ? 'border-primary/40 bg-primary/5 font-medium'
                          : 'border-border text-muted-foreground hover:bg-muted/50'
                      )}
                    >
                      <span>{feat.label}</span>
                      {on && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
              {/* Surface any stored feature that predates the catalog so it
                  is not silently dropped on the next save. */}
              {form.features
                .filter((f) => !FEATURE_LABELS.includes(f))
                .map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleFeature(f)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-left text-sm text-amber-800"
                    title="Custom feature — click to remove"
                  >
                    <span>{f} (custom)</span>
                    <Check className="h-4 w-4 shrink-0" />
                  </button>
                ))}
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Offered to new organizations</p>
                <p className="text-xs text-muted-foreground">
                  Turn off to retire this plan without affecting orgs already on it.
                </p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editTarget ? 'Save Changes' : 'Create Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove plan confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              Remove {deleteTarget?.name}?
            </DialogTitle>
            <DialogDescription>
              No organization is on this plan, so removing it is safe. It stops
              appearing anywhere and can&apos;t be assigned. This can&apos;t be undone
              from the UI.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Remove plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
