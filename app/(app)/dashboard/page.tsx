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
  UserPlus,
  Plus,
  FilePlus,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
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
  const { profile, hasRole } = useAuth();
  const data = useDashboardData();
  const warehouse = useWarehouseData();

  /** Live count for a pipeline stage, so KPIs and the pipeline can't diverge. */
  const stageCount = (key: string) =>
    data.pipeline.find((p) => p.key === key)?.count ?? 0;

  // Mirrors can_manage_finance() (the RLS gate on invoices/payments/expenses
  // — migration 034): for operations/sales, those tables return zero rows
  // rather than an error, so without this check the dashboard would show
  // "Outstanding Invoices: 0" and "No invoices yet" as if the org had no
  // invoices, instead of "you don't have permission to see them." A user
  // can hold multiple roles, so this checks the full set, not just primary.
  const canSeeFinance = hasRole('admin') || hasRole('branch_manager') || hasRole('finance');

  // Mirrors can_manage_operations()/can_manage_sales() — the quick-action
  // shortcuts below only make sense for roles that can actually create
  // these records; a customs/finance-only account would just hit an RLS
  // error clicking them.
  const canManageOperations = hasRole('admin') || hasRole('branch_manager') || hasRole('operations');
  const canManageSales = hasRole('admin') || hasRole('branch_manager') || hasRole('sales');

  // Mirrors select_activities_branch (migration 028): only admin and
  // branch_manager see everyone's activity — everyone else only sees
  // their own (enforced by RLS; this just keeps the copy honest about it).
  const seesEveryonesActivity = hasRole('admin') || hasRole('branch_manager');

  // Eight operational KPIs. Every value is read from a real column —
  // nothing here is derived from a placeholder or a synthetic field.
  const kpis = [
    {
      label: 'Active Shipments',
      value: data.stats.activeShipments,
      icon: Package,
      href: '/shipments',
      color: 'bg-primary/10 text-primary',
    },
    {
      label: 'Awaiting Documentation',
      value: stageCount('documentation'),
      icon: FileClock,
      href: '/shipments?status=documentation',
      color: 'bg-primary/10 text-primary',
    },
    {
      label: 'Awaiting Customs',
      value: stageCount('customs'),
      icon: Landmark,
      href: '/shipments?status=processing',
      color: 'bg-primary/10 text-primary',
    },
    {
      label: 'In Transit',
      value: stageCount('in_transit'),
      icon: Truck,
      href: '/shipments?status=in_transit',
      color: 'bg-primary/10 text-primary',
    },
    {
      label: 'Pending Quotations',
      value: data.stats.pendingQuotations,
      icon: FileText,
      href: '/quotations',
      color: 'bg-primary/10 text-primary',
    },
    ...(canSeeFinance
      ? [
          {
            label: 'Outstanding Invoices',
            value: data.finance.outstandingCount,
            icon: Receipt,
            href: '/invoices',
            color: 'bg-primary/10 text-primary',
          },
        ]
      : []),
    {
      label: 'Warehouse Inventory',
      value: warehouse.stats.totalItems,
      icon: Boxes,
      href: '/warehouse',
      color: 'bg-primary/10 text-primary',
    },
    {
      label: 'Delayed Shipments',
      value: data.stats.delayedShipments,
      icon: Clock,
      href: '/shipments',
      color: 'bg-primary/10 text-primary',
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
      {/* Greeting + quick actions. Global search now lives in the top bar. */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:gap-6">
        <div className="shrink-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {dateLabel}
          </p>
          <h1 className="mt-1 welcome-heading">
            Good {timeOfDay}, {profile?.full_name?.split(' ')[0] ?? 'there'}.
          </h1>
        </div>

        {/* asChild renders the Button *as* the link — nesting a <button>
            inside an <a> is invalid HTML and swallows the navigation. */}
        {(canManageOperations || canManageSales) && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 xl:ml-auto">
            {canManageOperations && (
              <Button asChild size="sm">
                <Link href="/shipments/new">
                  <Plus className="mr-1.5 h-4 w-4" />
                  New Shipment
                </Link>
              </Button>
            )}
            {canManageSales && (
              <Button asChild variant="outline" size="sm">
                <Link href="/customers/new">
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  New Customer
                </Link>
              </Button>
            )}
            {canManageSales && (
              <Button asChild variant="outline" size="sm">
                <Link href="/quotations/new">
                  <FilePlus className="mr-1.5 h-4 w-4" />
                  New Quotation
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Compact KPI cards — auto-fit so the row always fills the width
          regardless of how many tiles a role sees (e.g. finance-gated
          "Outstanding Invoices" drops the count from 8 to 7). */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
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
        <FinanceSummary
          finance={data.finance}
          loading={data.loading}
          restricted={!canSeeFinance}
        />
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
        <RecentActivity
          activity={data.recentActivity}
          loading={data.loading}
          ownActivityOnly={!seesEveryonesActivity}
        />
      </div>
    </div>
  );
}
