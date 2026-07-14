'use client';

import Link from 'next/link';
import {
  Users,
  FileText,
  Package,
  PackageCheck,
  DollarSign,
  Clock,
  Search,
  UserPlus,
  Plus,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useSearchContext } from '@/contexts/search-context';
import { useDashboardData } from '@/hooks/use-dashboard-data';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { OperationsPipeline } from '@/components/dashboard/operations-pipeline';
import { OperationalAlerts } from '@/components/dashboard/operational-alerts';
import { RecentShipmentsTable } from '@/components/dashboard/recent-shipments-table';
import { RecentQuotationsTable } from '@/components/dashboard/recent-quotations-table';
import { OperationsOverview } from '@/components/dashboard/operations-overview';
import { formatCurrency } from '@/lib/utils/status';

export default function DashboardPage() {
  const { profile } = useAuth();
  const { openSearch } = useSearchContext();
  const data = useDashboardData();

  const revenueValue =
    data.primaryCurrency === null
      ? '—'
      : formatCurrency(
          data.revenueByCurrency[data.primaryCurrency],
          data.primaryCurrency
        );

  const kpis = [
    {
      label: 'Active Shipments',
      value: data.stats.activeShipments,
      icon: Package,
      href: '/shipments',
      color: 'bg-cyan-50 text-cyan-600 ring-cyan-100',
    },
    {
      label: 'Delivered',
      value: data.stats.deliveredShipments,
      icon: PackageCheck,
      href: '/shipments',
      color: 'bg-green-50 text-green-600 ring-green-100',
    },
    {
      label: 'Customers',
      value: data.stats.totalCustomers,
      icon: Users,
      href: '/customers',
      color: 'bg-blue-50 text-blue-600 ring-blue-100',
    },
    {
      label: 'Pending Quotations',
      value: data.stats.pendingQuotations,
      icon: FileText,
      href: '/quotations',
      color: 'bg-amber-50 text-amber-600 ring-amber-100',
    },
    {
      label: 'Pipeline Won',
      value: revenueValue,
      icon: DollarSign,
      href: '/sales',
      color: 'bg-primary/10 text-primary ring-primary/20',
    },
    {
      label: 'Delayed Shipments',
      value: data.stats.delayedShipments,
      icon: Clock,
      href: '/shipments',
      color: 'bg-red-50 text-red-600 ring-red-100',
    },
  ];

  const now = new Date();
  const dateLabel = now
    .toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      weekday: 'long',
    })
    .toUpperCase()
    .replace(/, (\w+)$/, ' · $1');
  const hour = now.getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

  return (
    <div className="space-y-4 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {dateLabel}
          </p>
          <h1 className="mt-1 font-serif text-3xl font-medium tracking-tight">
            Good {timeOfDay}, {profile?.full_name?.split(' ')[0] ?? 'there'}.
          </h1>
          <p className="mt-1 text-xs text-muted-foreground/80 sm:text-sm">
            Here&apos;s a live overview of today&apos;s freight operations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openSearch}
            className="hidden items-center gap-2.5 rounded-lg border border-border bg-muted/50 px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-accent md:flex md:w-[300px] lg:w-[420px] xl:w-[560px]"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate text-left">
              Search shipments, customers, quotations, invoices…
            </span>
            <kbd className="hidden shrink-0 items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] font-medium sm:inline-flex">
              Ctrl K
            </kbd>
          </button>
          <Link href="/customers/new">
            <Button variant="outline" size="sm">
              <UserPlus className="mr-1.5 h-4 w-4" />
              New Customer
            </Button>
          </Link>
          <Link href="/shipments/new">
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              New Shipment
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards — one row on desktop */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} loading={data.loading} />
        ))}
      </div>

      {/* Operations Pipeline */}
      <OperationsPipeline pipeline={data.pipeline} loading={data.loading} />

      {/* Operational Alerts */}
      <OperationalAlerts alerts={data.alerts} loading={data.loading} />

      {/* Recent Shipments + Quotations */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RecentShipmentsTable
          shipments={data.recentShipments}
          loading={data.loading}
        />
        <RecentQuotationsTable
          quotations={data.recentQuotations}
          loading={data.loading}
        />
      </div>

      {/* Operations Overview (performance panel) */}
      <OperationsOverview
        quotationConversionRate={data.quotationConversionRate}
        shipmentCompletionRate={data.shipmentCompletionRate}
        pipeline={data.pipeline}
        revenueTrend={data.revenueTrend}
        primaryCurrency={data.primaryCurrency}
        revenueCollectedByCurrency={data.revenueCollectedByCurrency}
        primaryCollectedCurrency={data.primaryCollectedCurrency}
        revenueCollectedThisMonth={data.revenueCollectedThisMonth}
        topCustomersByVolume={data.topCustomersByVolume}
        recentDeliveries={data.recentDeliveries}
        branchStats={data.branchStats}
        isAdmin={data.isAdmin}
        loading={data.loading}
      />
    </div>
  );
}
