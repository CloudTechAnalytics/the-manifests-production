'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TrendingUp, DollarSign, Building2, Hourglass, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { getErrorMessage } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/lib/utils/status';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
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
import type { Plan, OrgSubscription, SubscriptionStatus, BillingCycle } from '@/types';

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  subscription: (OrgSubscription & { plan: Plan }) | null;
}

const STATUS_OPTIONS: { value: SubscriptionStatus; label: string }[] = [
  { value: 'trial', label: 'Trial' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'cancelled', label: 'Cancelled' },
];

function monthlyEquivalent(sub: OrgSubscription & { plan: Plan }): number {
  if (sub.billing_cycle === 'annual') {
    return (sub.plan.annual_price ?? sub.plan.monthly_price * 12) / 12;
  }
  return sub.plan.monthly_price;
}

function daysLeft(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function SubscriptionsPage() {
  const { profile } = useAuth();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const [assignTarget, setAssignTarget] = useState<OrgRow | null>(null);
  const [assignPlanId, setAssignPlanId] = useState('');
  const [assignCycle, setAssignCycle] = useState<BillingCycle>('monthly');
  const [assignStatus, setAssignStatus] = useState<SubscriptionStatus>('trial');
  const [assignSeats, setAssignSeats] = useState('1');
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Load subscriptions with their own query keyed by organization_id
      // rather than embedding them under the organizations query. The
      // parent→child embed was returning empty for orgs that do have a
      // subscription, which made the page offer "Assign Plan" for an org
      // that already had one — and the assign then collided with the
      // unique constraint on organization_id.
      const [orgsRes, subsRes, plansRes] = await Promise.all([
        supabase
          .from('organizations')
          .select('id, name, slug')
          .is('deleted_at', null)
          .order('name', { ascending: true }),
        supabase.from('org_subscriptions').select('*, plan:plans(*)'),
        supabase
          .from('plans')
          .select('*')
          .is('deleted_at', null)
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
      ]);

      if (orgsRes.error) throw orgsRes.error;
      if (subsRes.error) throw subsRes.error;
      if (plansRes.error) throw plansRes.error;

      const subsByOrg = new Map<string, OrgSubscription & { plan: Plan }>();
      for (const s of (subsRes.data as (OrgSubscription & { plan: Plan })[]) ?? []) {
        subsByOrg.set(s.organization_id, s);
      }

      const mapped: OrgRow[] = (
        orgsRes.data as { id: string; name: string; slug: string }[]
      ).map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        subscription: subsByOrg.get(o.id) ?? null,
      }));

      setOrgs(mapped);
      setPlans((plansRes.data as Plan[]) ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load subscriptions'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const active = orgs.filter((o) => o.subscription?.status === 'active');
    const trials = orgs.filter((o) => o.subscription?.status === 'trial');
    const mrr = active.reduce((sum, o) => sum + monthlyEquivalent(o.subscription!), 0);
    return {
      mrr,
      arr: mrr * 12,
      customers: active.length + trials.length,
      trials: trials.length,
    };
  }, [orgs]);

  const openAssign = (org: OrgRow) => {
    setAssignTarget(org);
    setAssignPlanId(plans[0]?.id ?? '');
    setAssignCycle('monthly');
    setAssignStatus('trial');
    setAssignSeats('1');
  };

  const handleAssign = async () => {
    if (!assignTarget || !profile || !assignPlanId) return;
    setAssigning(true);
    try {
      // Upsert on organization_id: one subscription per org (the column is
      // UNIQUE), so assigning to an org that somehow already has one
      // updates it rather than colliding with the constraint.
      const { error } = await supabase.from('org_subscriptions').upsert(
        {
          organization_id: assignTarget.id,
          plan_id: assignPlanId,
          status: assignStatus,
          billing_cycle: assignCycle,
          seats: Number(assignSeats) || 1,
          updated_by: profile.id,
        },
        { onConflict: 'organization_id' }
      );
      if (error) throw error;
      toast.success(`${assignTarget.name} assigned to a plan`);
      setAssignTarget(null);
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to assign plan'));
    } finally {
      setAssigning(false);
    }
  };

  const handleChangePlan = async (sub: OrgSubscription, planId: string) => {
    setUpdating(sub.id);
    try {
      const { error } = await supabase
        .from('org_subscriptions')
        .update({ plan_id: planId, updated_by: profile?.id })
        .eq('id', sub.id);
      if (error) throw error;
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to change plan'));
    } finally {
      setUpdating(null);
    }
  };

  const handleChangeStatus = async (sub: OrgSubscription, status: SubscriptionStatus) => {
    setUpdating(sub.id);
    try {
      const { error } = await supabase
        .from('org_subscriptions')
        .update({ status, updated_by: profile?.id })
        .eq('id', sub.id);
      if (error) throw error;
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to change status'));
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Subscriptions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Assign plans to organizations. Revenue is computed from active plans.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">MRR</p>
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-3 font-serif text-2xl font-bold">{formatCurrency(stats.mrr)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Monthly recurring revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ARR</p>
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-3 font-serif text-2xl font-bold">{formatCurrency(stats.arr)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Annualised</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customers</p>
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-3 font-serif text-2xl font-bold">{stats.customers}</p>
            <p className="mt-1 text-xs text-muted-foreground">Paying + trial tenants</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trials</p>
              <Hourglass className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-3 font-serif text-2xl font-bold">{stats.trials}</p>
            <p className="mt-1 text-xs text-muted-foreground">Not yet billing</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Seats</TableHead>
                  <TableHead>Monthly</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((org) => {
                  const sub = org.subscription;
                  return (
                    <TableRow key={org.id}>
                      <TableCell>
                        <p className="font-medium">{org.name}</p>
                        <p className="text-xs text-muted-foreground">/{org.slug}</p>
                      </TableCell>
                      {sub ? (
                        <>
                          <TableCell>
                            <Select
                              value={sub.plan_id}
                              onValueChange={(v) => handleChangePlan(sub, v)}
                              disabled={updating === sub.id}
                            >
                              <SelectTrigger className="w-[180px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {plans.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.name} — {formatCurrency(p.monthly_price)}/mo
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={sub.status}
                              onValueChange={(v) => handleChangeStatus(sub, v as SubscriptionStatus)}
                              disabled={updating === sub.id}
                            >
                              <SelectTrigger className="w-[130px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STATUS_OPTIONS.map((s) => (
                                  <SelectItem key={s.value} value={s.value}>
                                    {s.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {sub.status === 'trial' && sub.trial_ends_at && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {daysLeft(sub.trial_ends_at)}d left
                              </p>
                            )}
                          </TableCell>
                          <TableCell>{sub.seats}</TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(monthlyEquivalent(sub))}
                          </TableCell>
                        </>
                      ) : (
                        <TableCell colSpan={4}>
                          <Button variant="outline" size="sm" onClick={() => openAssign(org)}>
                            Assign Plan
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!assignTarget} onOpenChange={(open) => !open && setAssignTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Plan</DialogTitle>
            <DialogDescription>
              Set up a subscription for {assignTarget?.name}.
            </DialogDescription>
          </DialogHeader>

          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active plans exist yet — create one on Plans & Pricing first.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Plan</Label>
                <Select value={assignPlanId} onValueChange={setAssignPlanId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — {formatCurrency(p.monthly_price)}/mo
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Billing cycle</Label>
                  <Select value={assignCycle} onValueChange={(v) => setAssignCycle(v as BillingCycle)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={assignStatus} onValueChange={(v) => setAssignStatus(v as SubscriptionStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Seats</Label>
                <Input
                  type="number"
                  min={1}
                  value={assignSeats}
                  onChange={(e) => setAssignSeats(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)} disabled={assigning}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={assigning || !assignPlanId}>
              {assigning && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
