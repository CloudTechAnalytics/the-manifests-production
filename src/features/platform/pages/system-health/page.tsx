'use client';

import { CheckCircle2, XCircle, Loader2, RefreshCw, Building2, Users, Activity } from 'lucide-react';
import { useSystemHealth } from '@/features/platform/components/system-health-card';
import { usePlatformDashboardData } from '@/shared/hooks/use-platform-dashboard-data';
import { Card } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { KpiCard } from '@/shared/components/dashboard/kpi-card';
import { cn } from '@/shared/lib/utils';

const CHECK_DESCRIPTIONS: Record<string, string> = {
  Database: 'PostgREST — every table read and write goes through this.',
  Authentication: 'Supabase Auth — sign-in, sign-up, and session refresh.',
  Storage: 'File storage — documents, avatars, and org logos.',
  'Edge Functions': 'Invites, admin actions, webhooks, and billing callbacks.',
};

export default function SystemHealthPage() {
  const { checks, checkedAt, checking, refetch } = useSystemHealth();
  const { stats, loading: statsLoading } = usePlatformDashboardData();

  const anyDown = checks.some((c) => c.status === 'down');
  const allOperational = checks.every((c) => c.status === 'operational');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">System Health</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live checks against every service the platform depends on — measured from your browser.
          </p>
        </div>
        <Button variant="outline" onClick={refetch} disabled={checking}>
          {checking ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-4 w-4" />
          )}
          Run checks
        </Button>
      </div>

      <Card
        className={cn(
          'flex items-center justify-between px-5 py-4',
          anyDown && 'border-destructive/40'
        )}
      >
        <div className="flex items-center gap-3">
          {anyDown ? (
            <XCircle className="h-5 w-5 text-red-600" />
          ) : allOperational ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          )}
          <p className="font-medium">
            {anyDown
              ? 'Some services are unreachable'
              : allOperational
                ? 'All systems operational'
                : 'Checking services…'}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          {checkedAt ? `Last checked ${checkedAt.toLocaleTimeString()}` : 'Checking…'}
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {checks.map((c) => (
          <Card key={c.name} className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {CHECK_DESCRIPTIONS[c.name] ?? ''}
                </p>
              </div>
              {c.status === 'checking' ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : c.status === 'operational' ? (
                <Badge className="shrink-0 bg-emerald-50 text-emerald-700">Operational</Badge>
              ) : (
                <Badge className="shrink-0 bg-red-50 text-red-700">Down</Badge>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="mb-3 font-serif text-lg font-semibold">Platform usage</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiCard
            label="Organizations"
            value={stats.totalOrganizations}
            icon={Building2}
            href="/platform/organizations"
            caption="Active tenants"
            loading={statsLoading}
          />
          <KpiCard
            label="Users"
            value={stats.totalUsers}
            icon={Users}
            href="/platform/organization-users"
            caption="Across all tenants"
            loading={statsLoading}
          />
          <KpiCard
            label="Active Today"
            value={stats.activeToday}
            icon={Activity}
            href="/platform/audit-logs"
            caption="Logged an action"
            loading={statsLoading}
          />
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Activity className="h-3.5 w-3.5" />
        Checks run from your browser session, so numbers include your own network latency —
        latency and incident history aren&apos;t tracked yet. For real server-side uptime
        monitoring, pair this with an external probe (e.g. UptimeRobot) against the same
        endpoints.
      </p>
    </div>
  );
}
