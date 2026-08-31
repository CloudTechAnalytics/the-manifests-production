'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, DollarSign, Building2, Hourglass, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/shared/contexts/auth-context';
import { getErrorMessage } from '@/shared/lib/utils';
import {
  fetchSubscriptionsPageData,
  assignSubscription,
  changeSubscriptionPlan,
  extendSubscriptionTrial,
  changeSubscriptionStatus,
  type SubscriptionOrgRow,
} from '@/features/platform/services/subscriptions.service';
import { formatCurrency, formatDate } from '@/shared/lib/utils/status';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { Input } from '@/shared/components/ui/input';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { KpiCard } from '@/shared/components/dashboard/kpi-card';
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
import type { Plan, OrgSubscription, SubscriptionStatus, BillingCycle } from '@/shared/types';

type OrgRow = SubscriptionOrgRow;

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
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState<string | null>(null);

  const [assignTarget, setAssignTarget] = useState<OrgRow | null>(null);
  const [assignPlanId, setAssignPlanId] = useState('');
  const [assignCycle, setAssignCycle] = useState<BillingCycle>('monthly');
  const [assignStatus, setAssignStatus] = useState<SubscriptionStatus>('trial');
  const [assignSeats, setAssignSeats] = useState('1');

  const { data, isLoading: loading } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: fetchSubscriptionsPageData,
  });
  const orgs = data?.orgs ?? [];
  const plans = data?.plans ?? [];

  const invalidateSubscriptions = () => queryClient.invalidateQueries({ queryKey: ['subscriptions'] });

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

  const assignMutation = useMutation({
    mutationFn: () => {
      if (!assignTarget || !profile || !assignPlanId) throw new Error('Not ready');
      const planName = plans.find((p) => p.id === assignPlanId)?.name ?? 'a plan';
      return assignSubscription({
        orgId: assignTarget.id,
        orgName: assignTarget.name,
        planId: assignPlanId,
        planName,
        status: assignStatus,
        billingCycle: assignCycle,
        seats: Number(assignSeats) || 1,
        updatedBy: profile.id,
      });
    },
    onSuccess: () => {
      invalidateSubscriptions();
      toast.success(`${assignTarget!.name} assigned to a plan`);
      setAssignTarget(null);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to assign plan'));
    },
  });
  const assigning = assignMutation.isPending;
  const handleAssign = () => {
    if (!assignTarget || !profile || !assignPlanId) return;
    assignMutation.mutate();
  };

  const changePlanMutation = useMutation({
    mutationFn: (params: { sub: OrgSubscription; planId: string }) => {
      if (!profile) throw new Error('Not ready');
      const org = orgs.find((o) => o.subscription?.id === params.sub.id);
      const planName = plans.find((p) => p.id === params.planId)?.name ?? 'a plan';
      return changeSubscriptionPlan({
        subscriptionId: params.sub.id,
        orgId: params.sub.organization_id,
        orgName: org?.name ?? 'organization',
        planId: params.planId,
        planName,
        updatedBy: profile.id,
      });
    },
    onSuccess: () => invalidateSubscriptions(),
    onError: (err) => toast.error(getErrorMessage(err, 'Failed to change plan')),
    onSettled: () => setUpdating(null),
  });
  const handleChangePlan = (sub: OrgSubscription, planId: string) => {
    setUpdating(sub.id);
    changePlanMutation.mutate({ sub, planId });
  };

  const extendTrialMutation = useMutation({
    mutationFn: (params: { sub: OrgSubscription; days: number }) => {
      if (!profile) throw new Error('Not ready');
      const org = orgs.find((o) => o.subscription?.id === params.sub.id);
      return extendSubscriptionTrial({
        subscriptionId: params.sub.id,
        orgId: params.sub.organization_id,
        orgName: org?.name ?? 'organization',
        currentTrialEndsAt: params.sub.trial_ends_at,
        days: params.days,
        updatedBy: profile.id,
      });
    },
    onSuccess: (_data, params) => {
      invalidateSubscriptions();
      toast.success(`Trial extended by ${params.days} days`);
    },
    onError: (err) => toast.error(getErrorMessage(err, 'Failed to extend trial')),
    onSettled: () => setUpdating(null),
  });
  const handleExtendTrial = (sub: OrgSubscription, days: number) => {
    setUpdating(sub.id);
    extendTrialMutation.mutate({ sub, days });
  };

  const changeStatusMutation = useMutation({
    mutationFn: (params: { sub: OrgSubscription; status: SubscriptionStatus }) => {
      if (!profile) throw new Error('Not ready');
      const org = orgs.find((o) => o.subscription?.id === params.sub.id);
      return changeSubscriptionStatus({
        subscriptionId: params.sub.id,
        orgId: params.sub.organization_id,
        orgName: org?.name ?? 'organization',
        status: params.status,
        updatedBy: profile.id,
      });
    },
    onSuccess: () => invalidateSubscriptions(),
    onError: (err) => toast.error(getErrorMessage(err, 'Failed to change status')),
    onSettled: () => setUpdating(null),
  });
  const handleChangeStatus = (sub: OrgSubscription, status: SubscriptionStatus) => {
    setUpdating(sub.id);
    changeStatusMutation.mutate({ sub, status });
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
        <KpiCard
          label="MRR"
          value={formatCurrency(stats.mrr)}
          icon={TrendingUp}
          href="/platform/revenue-analytics"
          caption="Monthly recurring revenue"
        />
        <KpiCard
          label="ARR"
          value={formatCurrency(stats.arr)}
          icon={DollarSign}
          href="/platform/revenue-analytics"
          caption="Annualised"
        />
        <KpiCard
          label="Customers"
          value={stats.customers}
          icon={Building2}
          href="/platform/organizations"
          caption="Paying + trial tenants"
        />
        <KpiCard
          label="Trials"
          value={stats.trials}
          icon={Hourglass}
          href="/platform/organizations"
          caption="Not yet billing"
        />
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
                              <div className="mt-1 flex items-center gap-1.5">
                                <p className="text-xs text-muted-foreground">
                                  {daysLeft(sub.trial_ends_at)}d left
                                </p>
                                <button
                                  type="button"
                                  onClick={() => handleExtendTrial(sub, 14)}
                                  disabled={updating === sub.id}
                                  className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                                >
                                  Extend +14d
                                </button>
                              </div>
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
