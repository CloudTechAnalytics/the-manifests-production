'use client';

import Link from 'next/link';
import {
  Package,
  FileClock,
  Truck,
  Landmark,
  FileText,
  Receipt,
  Boxes,
  Clock,
  Search,
  UserPlus,
  Plus,
  FilePlus,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useSearchContext } from '@/contexts/search-context';
import { useDashboardData } from '@/hooks/use-dashboard-data';
import { useWarehouseData } from '@/hooks/use-warehouse-data';
import { Button } from '@/components/ui/button';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { OperationsPipeline } from '@/components/dashboard/operations-pipeline';
import { OperationalAlerts } from '@/components/dashboard/operational-alerts';
import { TodaySchedule } from '@/components/dashboard/today-schedule';
import { RecentShipmentsTable } from '@/components/dashboard/recent-shipments-table';
import { RecentQuotationsTable } from '@/components/dashboard/recent-quotations-table';
import { FinanceSummary } from '@/components/dashboard/finance-summary';
import { PlanningOverview } from '@/components/dashboard/planning-overview';
import { WarehouseSummary } from '@/components/warehouse/warehouse-summary';
import { RecentActivity } from '@/components/dashboard/recent-activity';

export default function DashboardPage() {
  const { profile } = useAuth();
  const { openSearch } = useSearchContext();
  const data = useDashboardData();
  const warehouse = useWarehouseData();

  /** Live count for a pipeline stage, so KPIs and the pipeline can't diverge. */
  const stageCount = (key: string) =>
    data.pipeline.find((p) => p.key === key)?.count ?? 0;

  // Eight operational KPIs. Every value is read from a real column —
  // nothing here is derived from a placeholder or a synthetic field.
  const kpis = [
    {
      label: 'Active Shipments',
      value: data.stats.activeShipments,
      icon: Package,
      href: '/shipments',
      color: 'bg-cyan-50 text-cyan-600 ring-cyan-100',
    },
    {
      label: 'Awaiting Documentation',
      value: stageCount('documentation'),
      icon: FileClock,
      href: '/shipments?status=documentation',
      color: 'bg-amber-50 text-amber-600 ring-amber-100',
    },
    {
      label: 'Awaiting Customs',
      value: stageCount('customs'),
      icon: Landmark,
      href: '/shipments?status=processing',
      color: 'bg-purple-50 text-purple-600 ring-purple-100',
    },
    {
      label: 'In Transit',
      value: stageCount('in_transit'),
      icon: Truck,
      href: '/shipments?status=in_transit',
      color: 'bg-blue-50 text-blue-600 ring-blue-100',
    },
    {
      label: 'Pending Quotations',
      value: data.stats.pendingQuotations,
      icon: FileText,
      href: '/quotations',
      color: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
    },
    {
      label: 'Outstanding Invoices',
      value: data.finance.outstandingCount,
      icon: Receipt,
      href: '/invoices',
      color: 'bg-primary/10 text-primary ring-primary/20',
    },
    {
      label: 'Warehouse Inventory',
      value: warehouse.stats.totalItems,
      icon: Boxes,
      href: '/warehouse',
      color: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
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
      {/* Greeting + global search + quick actions, all on one row */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:gap-6">
        <div className="shrink-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {dateLabel}
          </p>
          <h1 className="mt-1 font-serif text-3xl font-normal tracking-tight">
            Good {timeOfDay}, {profile?.full_name?.split(' ')[0] ?? 'there'}.
          </h1>
        </div>

        <button
          type="button"
          onClick={openSearch}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-accent"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate text-left">
            Search shipments, customers, quotations, invoices…
          </span>
          <kbd className="hidden shrink-0 items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] font-medium sm:inline-flex">
            Ctrl K
          </kbd>
        </button>

        {/* asChild renders the Button *as* the link — nesting a <button>
            inside an <a> is invalid HTML and swallows the navigation. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button asChild size="sm">
            <Link href="/shipments/new">
              <Plus className="mr-1.5 h-4 w-4" />
              New Shipment
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/customers/new">
              <UserPlus className="mr-1.5 h-4 w-4" />
              New Customer
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/quotations/new">
              <FilePlus className="mr-1.5 h-4 w-4" />
              New Quotation
            </Link>
          </Button>
        </div>
      </div>

      {/* 3. Eight compact KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.label}
            {...kpi}
            loading={
              kpi.label === 'Warehouse Inventory'
                ? warehouse.loading
                : data.loading
            }
          />
        ))}
      </div>

      {/* 4. Operations pipeline — full width */}
      <OperationsPipeline pipeline={data.pipeline} loading={data.loading} />

      {/* 5. Operational alerts + today's schedule */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <OperationalAlerts alerts={data.alerts} loading={data.loading} />
        <TodaySchedule events={data.todaySchedule} loading={data.loading} />
      </div>

      {/* 6. Recent shipments + recent quotations */}
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

      {/* 7. Finance summary + planning overview */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <FinanceSummary finance={data.finance} loading={data.loading} />
        <PlanningOverview planning={data.planning} loading={data.loading} />
      </div>

      {/* 8. Warehouse summary + recent activity */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <WarehouseSummary
          stats={warehouse.stats}
          donut={warehouse.donut}
          periodTotals={warehouse.periodTotals}
          loading={warehouse.loading}
        />
        <RecentActivity activity={data.recentActivity} loading={data.loading} />
      </div>
    </div>
  );
}
