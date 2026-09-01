'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Loader2, RefreshCw, Building2, Users, Activity, Database, HardDrive } from 'lucide-react';
import { useSystemHealth } from '@/features/platform/components/system-health-card';
import { usePlatformDashboardData } from '@/shared/hooks/use-platform-dashboard-data';
import { fetchResourceUsage } from '@/features/platform/services/settings.service';
import { Card } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { KpiCard } from '@/shared/components/dashboard/kpi-card';
import { formatStorage } from '@/shared/lib/utils/status';
import { cn } from '@/shared/lib/utils';

/** Green under 70%, amber 70-90%, red above - matches the 70/85/95 bands
 *  the reference's alert-email thresholds use, without the email part. */
function usagePctClass(pct: number): string {
  if (pct >= 90) return 'text-red-600';
  if (pct >= 70) return 'text-amber-600';
  return 'text-emerald-600';
}

const CHECK_DESCRIPTIONS: Record<string, string> = {
  Database: 'PostgREST — every table read and write goes through this.',
  Authentication: 'Supabase Auth — sign-in, sign-up, and session refresh.',
  Storage: 'File storage — documents, avatars, and org logos.',
  'Edge Functions': 'Invites, admin actions, webhooks, and billing callbacks.',
};

export default function SystemHealthPage() {
  const { checks, checkedAt, checking, refetch } = useSystemHealth();
  const { stats, loading: statsLoading } = usePlatformDashboardData();
  const {
    data: usage,
    isLoading: usageLoading,
    isFetching: usageFetching,
    refetch: refetchUsage,
  } = useQuery({
    queryKey: ['platform-resource-usage'],
    queryFn: fetchResourceUsage,
  });

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
            <p className="mt-4 text-sm text-muted-foreground">
              {c.latencyMs != null ? (
                <>
                  Round-trip <span className="font-medium text-foreground">{c.latencyMs}ms</span>
                </>
              ) : c.status === 'checking' ? (
                'Checking…'
              ) : (
                'No response'
              )}
            </p>
          </Card>
        ))}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold">Supabase plan usage</h2>
          <Button variant="ghost" size="sm" onClick={() => refetchUsage()} disabled={usageFetching}>
            {usageFetching ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </div>
        {usageLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
          </div>
        ) : usage ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <p className="font-medium">Database</p>
                </div>
                <p className={cn('text-sm font-semibold', usagePctClass(usage.db_pct))}>
                  {usage.db_pct}%
                </p>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {formatStorage(usage.db_bytes)} of {formatStorage(usage.db_cap_bytes)}
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full',
                    usage.db_pct >= 90 ? 'bg-red-500' : usage.db_pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                  )}
                  style={{ width: `${Math.min(100, usage.db_pct)}%` }}
                />
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  <p className="font-medium">Storage</p>
                </div>
                <p className={cn('text-sm font-semibold', usagePctClass(usage.storage_pct))}>
                  {usage.storage_pct}%
                </p>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {formatStorage(usage.storage_bytes)} of {formatStorage(usage.storage_cap_bytes)}
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full',
                    usage.storage_pct >= 90 ? 'bg-red-500' : usage.storage_pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                  )}
                  style={{ width: `${Math.min(100, usage.storage_pct)}%` }}
                />
              </div>
            </Card>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load resource usage.</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Caps default to Supabase&apos;s Free-tier limits (500 MB database, 1 GB storage) — update
          them in Platform Settings the day this project moves to a paid tier, and every
          percentage above adjusts automatically.
        </p>
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
