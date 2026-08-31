'use client';

import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  CheckCircle2,
  XCircle,
  Users,
  TrendingUp,
  DollarSign,
  Hourglass,
  ShieldCheck,
  Activity,
  UserPlus,
  LifeBuoy,
} from 'lucide-react';
import { useAuth } from '@/shared/contexts/auth-context';
import { usePlatformDashboardData } from '@/shared/hooks/use-platform-dashboard-data';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { KpiCard } from '@/shared/components/dashboard/kpi-card';
import { RecentActivity } from '@/shared/components/dashboard/recent-activity';
import { SystemHealthCard } from '@/features/platform/components/system-health-card';
import { cn } from '@/shared/lib/utils';
import { formatCurrency } from '@/shared/lib/utils/status';

// recharts is a large dependency — code-split so it only loads for
// visitors who actually reach this page, not bundled into every route
// that happens to import platform/page.tsx's chunk.
const OrganizationGrowthChart = lazy(() =>
  import('@/features/platform/components/organization-growth-chart').then((m) => ({ default: m.OrganizationGrowthChart }))
);

export default function PlatformDashboardPage() {
  const { profile } = useAuth();
  const { stats, growth, recentOrganizations, recentActivity, loading } =
    usePlatformDashboardData();

  // Row 1: tenancy + revenue — every organization's standing at a glance.
  const tenancyKpis = [
    {
      label: 'Organizations',
      value: stats.totalOrganizations,
      icon: Building2,
      href: '/platform/organizations',
      caption: 'Customer firms',
    },
    {
      label: 'Paid Orgs',
      value: stats.paidOrganizations,
      icon: CheckCircle2,
      href: '/platform/subscriptions',
      caption: 'Active plans',
    },
    {
      label: 'Trial Orgs',
      value: stats.trialCount,
      icon: Hourglass,
      href: '/platform/subscriptions',
      caption: 'On trial',
    },
    {
      label: 'Suspended',
      value: stats.suspendedOrganizations,
      icon: XCircle,
      href: '/platform/organizations',
      caption: 'Paused firms',
    },
    {
      // Full comma-grouped figure ("NGN 150,000"), matching Revenue
      // Analytics' and Billing's own MRR/ARR tiles exactly - not the
      // abbreviated "150K" notation. Rendered with the same serif/
      // text-3xl style as every other KPI here - no isCurrency font
      // override.
      label: 'MRR',
      value: formatCurrency(stats.mrr),
      icon: TrendingUp,
      href: '/platform/subscriptions',
      caption: 'Monthly recurring',
    },
    {
      label: 'ARR',
      value: formatCurrency(stats.arr),
      icon: DollarSign,
      href: '/platform/subscriptions',
      caption: 'Annual recurring',
    },
  ];

  // Row 2: people + platform activity.
  const activityKpis = [
    {
      label: 'Total Users',
      value: stats.totalUsers,
      icon: Users,
      href: '/platform/organization-users',
      caption: 'All tenant staff',
    },
    {
      label: 'Platform Team',
      value: stats.platformTeamCount,
      icon: ShieldCheck,
      href: '/platform/platform-users',
      caption: 'Internal admins',
    },
    {
      label: 'Active Today',
      value: stats.activeToday,
      icon: Activity,
      href: '/platform/audit-logs',
      caption: 'Logged an action',
    },
    {
      label: 'New This Month',
      value: stats.newUsersThisMonth,
      icon: UserPlus,
      href: '/platform/organization-users',
      caption: 'New signups',
    },
    {
      // No ticketing system exists yet (Support Tickets is a coming-soon
      // page) — shown as a dash, not a fabricated 0-that-looks-like-data.
      label: 'Support Tickets',
      value: '—',
      icon: LifeBuoy,
      href: '/platform/support-tickets',
      caption: 'Coming soon',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Platform Console</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back, {profile?.full_name?.split(' ')[0] ?? 'there'}. Manage
            organizations, users, security and platform services.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/platform/audit-logs">Audit Logs</Link>
          </Button>
          <Button asChild>
            <Link to="/platform/organizations">
              <Building2 className="mr-1.5 h-4 w-4" />
              Create Organization Manually
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {tenancyKpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} loading={loading} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {activityKpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} loading={loading} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between px-4 py-3">
            <CardTitle className="text-lg font-semibold">Organizations</CardTitle>
            <Link to="/platform/organizations" className="text-sm text-primary hover:underline">
              Manage all
            </Link>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : recentOrganizations.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Building2 className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  No organizations yet. Create the first one to get started.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentOrganizations.map((org) => (
                  <Link
                    key={org.id}
                    to={`/platform/organizations/${org.id}`}
                    className="flex items-center justify-between rounded-lg px-2 py-2.5 transition-colors hover:bg-accent"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
                        {org.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{org.name}</p>
                        <p className="text-xs text-muted-foreground">/{org.slug}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {org.memberCount} member{org.memberCount === 1 ? '' : 's'}
                      </span>
                      <Badge
                        className={cn(
                          org.is_active
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        )}
                      >
                        {org.is_active ? 'active' : 'suspended'}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <SystemHealthCard />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <OrganizationGrowthChart growth={growth} loading={loading} />
        </Suspense>
        <RecentActivity activity={recentActivity} loading={loading} />
      </div>
    </div>
  );
}
