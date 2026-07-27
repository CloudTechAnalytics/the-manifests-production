'use client';

import Link from 'next/link';
import {
  Building2,
  CheckCircle2,
  XCircle,
  Users,
  ShieldCheck,
  UserPlus,
  Plus,
  TrendingUp,
  DollarSign,
  Hourglass,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { usePlatformDashboardData } from '@/hooks/use-platform-dashboard-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { OrganizationGrowthChart } from '@/components/platform/organization-growth-chart';
import { SystemHealthCard } from '@/components/platform/system-health-card';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils/status';

export default function PlatformDashboardPage() {
  const { profile } = useAuth();
  const { stats, growth, recentOrganizations, recentActivity, loading } =
    usePlatformDashboardData();

  const kpis = [
    {
      label: 'Organizations',
      value: stats.totalOrganizations,
      icon: Building2,
      href: '/platform/organizations',
      color: 'bg-primary/10 text-primary',
    },
    {
      label: 'Active',
      value: stats.activeOrganizations,
      icon: CheckCircle2,
      href: '/platform/organizations',
      color: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Suspended',
      value: stats.suspendedOrganizations,
      icon: XCircle,
      href: '/platform/organizations',
      color: 'bg-red-50 text-red-600',
    },
    {
      label: 'MRR',
      value: formatCurrency(stats.mrr),
      icon: TrendingUp,
      href: '/platform/subscriptions',
      color: 'bg-primary/10 text-primary',
    },
    {
      label: 'ARR',
      value: formatCurrency(stats.arr),
      icon: DollarSign,
      href: '/platform/subscriptions',
      color: 'bg-primary/10 text-primary',
    },
    {
      label: 'Trials',
      value: stats.trialCount,
      icon: Hourglass,
      href: '/platform/subscriptions',
      color: 'bg-amber-50 text-amber-600',
    },
    {
      label: 'Total Users',
      value: stats.totalUsers,
      icon: Users,
      href: '/platform/organization-users',
      color: 'bg-primary/10 text-primary',
    },
    {
      label: 'Platform Team',
      value: stats.platformTeamCount,
      icon: ShieldCheck,
      href: '/platform/platform-users',
      color: 'bg-primary/10 text-primary',
    },
    {
      label: 'New This Month',
      value: stats.newUsersThisMonth,
      icon: UserPlus,
      href: '/platform/organization-users',
      color: 'bg-primary/10 text-primary',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Platform Console</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back, {profile?.full_name?.split(' ')[0] ?? 'there'}. Manage
            organizations and onboard new customers.
          </p>
        </div>
        <Button asChild>
          <Link href="/platform/organizations">
            <Plus className="mr-1.5 h-4 w-4" />
            Create Organization
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-9">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} loading={loading} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between px-4 py-3">
            <CardTitle className="text-lg font-semibold">Organizations</CardTitle>
            <Link href="/platform/organizations" className="text-sm text-primary hover:underline">
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
                    href={`/platform/organizations/${org.id}`}
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
        <OrganizationGrowthChart growth={growth} loading={loading} />
        <RecentActivity activity={recentActivity} loading={loading} />
      </div>
    </div>
  );
}
