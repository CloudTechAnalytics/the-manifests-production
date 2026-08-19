'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, ExternalLink, Receipt } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { formatCurrency, formatDate } from '@/lib/utils/status';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import type { OrgSubscription, Plan, PaymentTransaction } from '@/types';

const TRANSACTION_STATUS_META: Record<PaymentTransaction['status'], { label: string; color: string }> = {
  success: { label: 'Paid', color: 'bg-emerald-100 text-emerald-700' },
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700' },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700' },
  abandoned: { label: 'Abandoned', color: 'bg-muted text-muted-foreground' },
};

/**
 * Tenant-facing Billing tab — current plan/status plus payment history
 * (payment_transactions, RLS-scoped to the org's own rows). Read-only: an
 * actual plan change or renewal happens on /upgrade (initialize-payment ->
 * Paystack checkout), which any admin/branch_manager can already reach
 * from here or from the sidebar's Upgrade Plan link.
 */
export function BillingTab() {
  const { profile } = useAuth();
  const [subscription, setSubscription] = useState<(OrgSubscription & { plan: Plan }) | null>(null);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.organization_id) return;
    (async () => {
      const [{ data: sub }, { data: txns }] = await Promise.all([
        supabase
          .from('org_subscriptions')
          .select('*, plan:plans(*)')
          .eq('organization_id', profile.organization_id)
          .maybeSingle(),
        supabase
          .from('payment_transactions')
          .select('*, plan:plans(name)')
          .eq('organization_id', profile.organization_id)
          .order('created_at', { ascending: false })
          .limit(25),
      ]);
      setSubscription(sub as (OrgSubscription & { plan: Plan }) | null);
      setTransactions((txns ?? []) as PaymentTransaction[]);
      setLoading(false);
    })();
  }, [profile?.organization_id]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" />
            Current plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subscription?.plan ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-serif text-lg font-bold">{subscription.plan.name}</span>
                  <Badge variant="secondary" className="capitalize">{subscription.status}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {subscription.status === 'trial' && subscription.trial_ends_at
                    ? `Trial ends ${formatDate(subscription.trial_ends_at)}`
                    : subscription.current_period_end
                      ? `Renews or expires ${formatDate(subscription.current_period_end)}`
                      : `${formatCurrency(subscription.plan.monthly_price, subscription.plan.currency)}/mo`}
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href="/upgrade">
                  Change plan
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No subscription on file — contact support if this looks wrong.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4" />
            Payment history
          </CardTitle>
          <CardDescription>Every checkout attempt for this organization, successful or not.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Receipt className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-sm">{formatDate(t.created_at)}</TableCell>
                    <TableCell className="text-sm">
                      {(t.plan as unknown as { name: string } | undefined)?.name ?? '—'}
                      <span className="ml-1 text-xs capitalize text-muted-foreground">({t.billing_cycle})</span>
                    </TableCell>
                    <TableCell className="text-sm">{formatCurrency(t.amount, t.currency)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{t.reference}</TableCell>
                    <TableCell>
                      <Badge className={TRANSACTION_STATUS_META[t.status].color}>
                        {TRANSACTION_STATUS_META[t.status].label}
                      </Badge>
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
