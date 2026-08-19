'use client';

import { useCallback, useEffect, useState } from 'react';
import { TrendingUp, DollarSign, CreditCard, Users, AlertTriangle, LineChart } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import { formatCurrency, isTrialExpired } from '@/lib/utils/status';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { MrrTrendChart, type MrrTrendPoint } from '@/components/platform/mrr-trend-chart';
import type { Plan, OrgSubscription } from '@/types';

type SubRow = OrgSubscription & { plan: Plan };

function monthlyEquivalent(sub: OrgSubscription & { plan: Plan }): number {
  return sub.billing_cycle === 'annual'
    ? (sub.plan.annual_price ?? sub.plan.monthly_price * 12) / 12
    : sub.plan.monthly_price;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function lastSixMonthEnds(): { label: string; end: Date }[] {
  const out: { label: string; end: Date }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    out.push({ label: MONTH_LABELS[end.getMonth()], end });
  }
  return out;
}

export default function RevenueAnalyticsPage() {
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('org_subscriptions').select('*, plan:plans(*)');
      if (error) throw error;
      setSubs((data as unknown as SubRow[]) ?? []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load revenue data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = subs.filter((s) => s.status === 'active');
  const trials = subs.filter((s) => s.status === 'trial');
  const mrr = active.reduce((sum, s) => sum + monthlyEquivalent(s), 0);
  const arr = mrr * 12;
  const arpa = active.length > 0 ? mrr / active.length : 0;
  const atRisk = trials.filter((s) => isTrialExpired('active_trial', s.trial_ends_at)).length;

  const months = lastSixMonthEnds();

  // "Was this subscription generating revenue as of this month-end?"
  // There's no cancelled_at timestamp in this schema, only a current
  // status — updated_at is used as an honest approximation of when a
  // subscription most recently changed state (started, upgraded,
  // cancelled), the same limitation the reference's own "Reconstructed
  // from subscription starts and cancellations" caption acknowledges,
  // not silently glossed over.
  const wasEarningAt = (s: SubRow, at: Date) => {
    if (new Date(s.started_at) > at) return false;
    if (s.status === 'cancelled') return new Date(s.updated_at) > at;
    return true;
  };

  const mrrTrend: MrrTrendPoint[] = months.map(({ label, end }) => ({
    label,
    mrr: subs.filter((s) => wasEarningAt(s, end)).reduce((sum, s) => sum + monthlyEquivalent(s), 0),
  }));

  const newMrrByMonth: MrrTrendPoint[] = months.map(({ label, end }, i) => {
    const start = i === 0 ? new Date(0) : months[i - 1].end;
    const startedThisMonth = subs.filter((s) => {
      const startedAt = new Date(s.started_at);
      return startedAt > start && startedAt <= end;
    });
    return { label, mrr: startedThisMonth.reduce((sum, s) => sum + monthlyEquivalent(s), 0) };
  });

  // Simple linear projection: current MRR plus the average net monthly
  // change over the reconstructed trend above, held flat forward — not
  // a statistical forecast model. Labeled as a plain projection, not
  // dressed up as more rigorous than it is.
  const netMonthlyChange =
    mrrTrend.length > 1 ? (mrrTrend[mrrTrend.length - 1].mrr - mrrTrend[0].mrr) / (mrrTrend.length - 1) : 0;
  const forecast: MrrTrendPoint[] = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() + i + 1);
    return { label: MONTH_LABELS[d.getMonth()], mrr: Math.max(0, mrr + netMonthlyChange * (i + 1)) };
  });
  const projectedArr = forecast[forecast.length - 1].mrr * 12;

  const kpis = [
    { label: 'MRR', value: formatCurrency(mrr), icon: TrendingUp, href: '/platform/subscriptions', caption: 'Monthly recurring' },
    { label: 'ARR', value: formatCurrency(arr), icon: DollarSign, href: '/platform/subscriptions', caption: 'Annualised' },
    { label: 'ARPA', value: formatCurrency(arpa), icon: CreditCard, href: '/platform/subscriptions', caption: 'Avg / account' },
    { label: 'Paying', value: active.length, icon: Users, href: '/platform/subscriptions', caption: 'Active plans' },
    { label: 'At Risk', value: atRisk, icon: AlertTriangle, href: '/platform/subscriptions', caption: 'Past-due MRR' },
    { label: 'Proj. ARR', value: formatCurrency(projectedArr), icon: LineChart, href: '/platform/revenue-analytics', caption: '6-mo forecast' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Revenue Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recurring-revenue movement, mix, and forecast across the platform.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} loading={loading} />
        ))}
      </div>

      <MrrTrendChart
        title="MRR trend"
        subtitle="Reconstructed from subscription starts and cancellations."
        points={mrrTrend}
        loading={loading}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <MrrTrendChart title="New MRR by month" points={newMrrByMonth} loading={loading} />
        <MrrTrendChart
          title="Forecast · next 6 months"
          subtitle="Simple linear projection from the recent trend — not a statistical model."
          points={forecast}
          loading={loading}
        />
      </div>
    </div>
  );
}
