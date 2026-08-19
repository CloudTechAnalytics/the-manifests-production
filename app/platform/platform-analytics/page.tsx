'use client';

import dynamic from 'next/dynamic';
import { Building2, UserPlus, Users, Activity } from 'lucide-react';
import { usePlatformDashboardData } from '@/hooks/use-platform-dashboard-data';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { Skeleton } from '@/components/ui/skeleton';
import { BreakdownBars } from '@/components/platform/breakdown-bars';

// recharts is a large dependency — code-split so it only loads once
// these cards actually render, not bundled into this page's own chunk.
const OrganizationGrowthChart = dynamic(
  () => import('@/components/platform/organization-growth-chart').then((m) => m.OrganizationGrowthChart),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
);
const MonthlySignupsChart = dynamic(
  () => import('@/components/platform/monthly-signups-chart').then((m) => m.MonthlySignupsChart),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> }
);

export default function PlatformAnalyticsPage() {
  const { stats, growth, planDistribution, loading } = usePlatformDashboardData();

  const kpis = [
    {
      label: 'Organizations',
      value: stats.totalOrganizations,
      icon: Building2,
      href: '/platform/organizations',
      caption: 'All firms',
    },
    {
      label: 'New This Month',
      value: stats.newUsersThisMonth,
      icon: UserPlus,
      href: '/platform/organization-users',
      caption: 'New signups',
    },
    {
      label: 'Total Users',
      value: stats.totalUsers,
      icon: Users,
      href: '/platform/organization-users',
      caption: 'All tenant staff',
    },
    {
      label: 'Active Today',
      value: stats.activeToday,
      icon: Activity,
      href: '/platform/audit-logs',
      caption: 'Logged an action',
    },
  ];

  const statusRows = [
    { label: 'Paid', count: stats.paidOrganizations, barClassName: 'bg-emerald-500' },
    { label: 'Trial', count: stats.trialCount, barClassName: 'bg-amber-500' },
    { label: 'Suspended', count: stats.suspendedOrganizations, barClassName: 'bg-red-500' },
  ];

  const planRows = planDistribution.map((p, i) => ({
    label: p.planName,
    count: p.count,
    barClassName: [
      'bg-primary',
      'bg-emerald-500',
      'bg-sky-500',
      'bg-violet-500',
      'bg-amber-500',
    ][i % 5],
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Platform Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Growth, adoption, and activity across every organization on the platform.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} loading={loading} />
        ))}
      </div>

      <OrganizationGrowthChart growth={growth} loading={loading} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <MonthlySignupsChart growth={growth} loading={loading} />
        <BreakdownBars
          title="Plan Distribution"
          rows={planRows}
          emptyMessage="No subscriptions yet."
          loading={loading}
        />
      </div>

      <BreakdownBars
        title="Organizations by Status"
        rows={statusRows}
        emptyMessage="No organizations yet."
        loading={loading}
      />
    </div>
  );
}
