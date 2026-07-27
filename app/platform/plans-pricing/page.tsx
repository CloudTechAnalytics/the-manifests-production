'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Check, Tag, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { getErrorMessage } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Plan } from '@/types';

interface PlanForm {
  name: string;
  slug: string;
  description: string;
  monthly_price: string;
  annual_price: string;
  max_users: string;
  storage_gb: string;
  features: string;
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
  features: '',
  is_active: true,
};

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export default function PlansPricingPage() {
  const { profile } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Plan | null>(null);
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof PlanForm, string>>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .is('deleted_at', null)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setPlans((data as Plan[]) ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load plans'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      features: plan.features.join('\n'),
      is_active: plan.is_active,
    });
    setSlugTouched(true);
    setErrors({});
    setDialogOpen(true);
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

  const handleSave = async () => {
    if (!profile || !validate()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description.trim() || null,
        monthly_price: Number(form.monthly_price),
        annual_price: form.annual_price.trim() === '' ? null : Number(form.annual_price),
        max_users: form.max_users.trim() === '' ? null : Number(form.max_users),
        storage_gb: form.storage_gb.trim() === '' ? null : Number(form.storage_gb),
        features: form.features
          .split('\n')
          .map((f) => f.trim())
          .filter(Boolean),
        is_active: form.is_active,
      };

      if (editTarget) {
        const { error } = await supabase.from('plans').update(payload).eq('id', editTarget.id);
        if (error) throw error;
        toast.success(`${payload.name} updated`);
      } else {
        const { error } = await supabase
          .from('plans')
          .insert({ ...payload, created_by: profile.id, sort_order: plans.length });
        if (error) throw error;
        toast.success(`${payload.name} created`);
      }

      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to save plan'));
    } finally {
      setSaving(false);
    }
  };

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
          {plans.map((plan) => (
            <Card key={plan.id} className={!plan.is_active ? 'opacity-60' : ''}>
              <CardContent className="space-y-4 p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-serif text-xl font-bold">{plan.name}</h3>
                    {plan.description && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{plan.description}</p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(plan)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>

                <div>
                  <p className="font-serif text-2xl font-bold">
                    {formatCurrency(plan.monthly_price, plan.currency)}
                    <span className="text-sm font-normal text-muted-foreground">/month</span>
                  </p>
                  {plan.annual_price != null && (
                    <p className="text-xs text-muted-foreground">
                      or {formatCurrency(plan.annual_price, plan.currency)}/year
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg bg-muted/50 px-3 py-2 text-center">
                    <p className="font-medium">{plan.max_users ?? '∞'}</p>
                    <p className="text-xs text-muted-foreground">users</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 px-3 py-2 text-center">
                    <p className="font-medium">
                      {plan.storage_gb != null ? `${plan.storage_gb} GB` : '∞'}
                    </p>
                    <p className="text-xs text-muted-foreground">storage</p>
                  </div>
                </div>

                {plan.features.length > 0 && (
                  <ul className="space-y-1.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}

                {!plan.is_active && (
                  <p className="text-xs font-medium text-muted-foreground">
                    Retired — not offered to new organizations.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Plan' : 'New Plan'}</DialogTitle>
            <DialogDescription>
              {editTarget
                ? `Update ${editTarget.name}'s pricing and limits.`
                : 'Define a new subscription tier.'}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
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
                <Label htmlFor="plan-monthly">Monthly price (₦)</Label>
                <Input
                  id="plan-monthly"
                  type="number"
                  value={form.monthly_price}
                  onChange={(e) => setForm((f) => ({ ...f, monthly_price: e.target.value }))}
                />
                {errors.monthly_price && (
                  <p className="text-xs text-destructive">{errors.monthly_price}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-annual">Annual price (₦, optional)</Label>
                <Input
                  id="plan-annual"
                  type="number"
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
                <Label htmlFor="plan-max-users">Max users (blank = unlimited)</Label>
                <Input
                  id="plan-max-users"
                  type="number"
                  value={form.max_users}
                  onChange={(e) => setForm((f) => ({ ...f, max_users: e.target.value }))}
                />
                {errors.max_users && <p className="text-xs text-destructive">{errors.max_users}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-storage">Storage GB (blank = unlimited)</Label>
                <Input
                  id="plan-storage"
                  type="number"
                  value={form.storage_gb}
                  onChange={(e) => setForm((f) => ({ ...f, storage_gb: e.target.value }))}
                />
                {errors.storage_gb && (
                  <p className="text-xs text-destructive">{errors.storage_gb}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plan-features">Features (one per line)</Label>
              <Textarea
                id="plan-features"
                rows={5}
                value={form.features}
                onChange={(e) => setForm((f) => ({ ...f, features: e.target.value }))}
                placeholder={'Shipment Tracking\nCustoms Documentation\nInvoicing'}
              />
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
    </div>
  );
}
