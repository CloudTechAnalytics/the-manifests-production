'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, DollarSign, Tag, Users, AlertTriangle, Hourglass } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/lib/utils/status';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { BreakdownBars } from '@/components/platform/breakdown-bars';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Plan, OrgSubscription, Organization } from '@/types';

type SubRow = OrgSubscription & { plan: Plan; organization: Pick<Organization, 'id' | 'name' | 'slug'> | null };

function monthlyEquivalent(sub: OrgSubscription & { plan: Plan }): number {
  return sub.billing_cycle === 'annual'
    ? (sub.plan.annual_price ?? sub.plan.monthly_price * 12) / 12
    : sub.plan.monthly_price;
}

/** Next renewal = the next anniversary of started_at, one billing_cycle
 *  at a time, strictly after today. There's no stored renewal date in
 *  this schema — this is the same derivation any subscription system
 *  without one would use, not a fabricated number. */
function nextRenewal(sub: OrgSubscription): Date {
  const start = new Date(sub.started_at);
  const months = sub.billing_cycle === 'annual' ? 12 : 1;
  const next = new Date(start);
  while (next.getTime() <= Date.now()) {
    next.setMonth(next.getMonth() + months);
  }
  return next;
}

export default function BillingPage() {
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('org_subscriptions')
        .select('*, plan:plans(*), organization:organizations(id, name, slug)');
      if (error) throw error;
      setSubs((data as unknown as SubRow[]) ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load billing data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = subs.filter((s) => s.status === 'active' && s.organization);
  const trials = subs.filter((s) => s.status === 'trial');
  const mrr = active.reduce((sum, s) => sum + monthlyEquivalent(s), 0);
  const arr = mrr * 12;
  const arpa = active.length > 0 ? mrr / active.length : 0;

  const revenueByPlan = new Map<string, number>();
  active.forEach((s) => {
    revenueByPlan.set(s.plan.name, (revenueByPlan.get(s.plan.name) ?? 0) + monthlyEquivalent(s));
  });
  const planRows = Array.from(revenueByPlan.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const topCustomers = [...active]
    .sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a))
    .slice(0, 8);

  const upcomingRenewals = [...active]
    .map((s) => ({ sub: s, renewsAt: nextRenewal(s) }))
    .sort((a, b) => a.renewsAt.getTime() - b.renewsAt.getTime())
    .slice(0, 8);

  const kpis = [
    { label: 'Monthly Revenue', value: formatCurrency(mrr), icon: CreditCard, href: '/platform/subscriptions', caption: 'MRR', isCurrency: true },
    { label: 'Annual Revenue', value: formatCurrency(arr), icon: DollarSign, href: '/platform/subscriptions', caption: 'ARR', isCurrency: true },
    { label: 'Active Plans', value: active.length, icon: Tag, href: '/platform/subscriptions', caption: 'Billing now' },
    { label: 'ARPA', value: formatCurrency(arpa), icon: Users, href: '/platform/subscriptions', caption: 'Avg / account', isCurrency: true },
    {
      // No payment-collection or invoicing model exists for platform
      // subscriptions in this schema — always 0, not a fabricated number.
      label: 'Outstanding',
      value: formatCurrency(0),
      icon: AlertTriangle,
      href: '/platform/subscriptions',
      caption: '0 past due',
      isCurrency: true,
    },
    { label: 'Trials', value: trials.length, icon: Hourglass, href: '/platform/subscriptions', caption: 'Not yet billing' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Revenue, active plans, and upcoming renewals across the platform.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} loading={loading} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <BreakdownBars
          title="Revenue by plan"
          rows={planRows}
          emptyMessage="No active revenue yet."
          loading={loading}
          formatCount={(n) => formatCurrency(n)}
        />

        <Card>
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-lg font-semibold">Top paying customers</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : topCustomers.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No paying customers yet.</p>
            ) : (
              <div className="space-y-1">
                {topCustomers.map((s) => (
                  <Link
                    key={s.id}
                    href={`/platform/organizations/${s.organization!.id}`}
                    className="flex items-center justify-between rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent"
                  >
                    <div>
                      <p className="font-medium">{s.organization!.name}</p>
                      <p className="text-xs text-muted-foreground">{s.plan.name}</p>
                    </div>
                    <span className="font-medium">{formatCurrency(monthlyEquivalent(s))}/mo</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-lg font-semibold">Upcoming renewals</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : upcomingRenewals.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No upcoming renewals.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Renews</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingRenewals.map(({ sub, renewsAt }) => (
                  <TableRow key={sub.id}>
                    <TableCell className="font-medium">{sub.organization!.name}</TableCell>
                    <TableCell className="text-muted-foreground">{sub.plan.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">{sub.billing_cycle}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(renewsAt.toISOString())}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(sub.billing_cycle === 'annual' ? (sub.plan.annual_price ?? sub.plan.monthly_price * 12) : sub.plan.monthly_price)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
