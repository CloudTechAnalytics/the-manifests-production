import { Link } from 'react-router-dom';
import { Building2, PackageCheck, Target, Users, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ShipmentStatusDonut } from '@/components/dashboard/shipment-status-donut';
import { RevenueTrendChart } from '@/components/dashboard/revenue-trend-chart';
import { formatCurrency, formatDate } from '@/lib/utils/status';
import type {
  BranchStat,
  PipelineCounts,
  RecentDelivery,
  RevenueTrendPoint,
  TopCustomerByVolume,
} from '@/hooks/use-dashboard-data';

function RateCard({
  icon: Icon,
  label,
  description,
  value,
  color,
  loading,
}: {
  icon: typeof Target;
  label: string;
  description: string;
  value: number | null;
  color: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold tracking-tight">
                {value === null ? '—' : `${value.toFixed(0)}%`}
              </p>
              {value !== null && (
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.min(value, 100)}%` }}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({
  icon: Icon,
  label,
  description,
  value,
  subValue,
  color,
  loading,
}: {
  icon: typeof Target;
  label: string;
  description: string;
  value: string;
  subValue?: string;
  color: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold tracking-tight">{value}</p>
              {subValue && (
                <p className="mt-1 text-xs text-muted-foreground">{subValue}</p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface OperationsOverviewProps {
  quotationConversionRate: number | null;
  shipmentCompletionRate: number | null;
  pipeline: PipelineCounts[];
  revenueTrend: RevenueTrendPoint[];
  primaryCurrency: string | null;
  revenueCollectedByCurrency: Record<string, number>;
  primaryCollectedCurrency: string | null;
  revenueCollectedThisMonth: number;
  topCustomersByVolume: TopCustomerByVolume[];
  recentDeliveries: RecentDelivery[];
  branchStats: BranchStat[];
  isAdmin: boolean;
  loading?: boolean;
}

export function OperationsOverview({
  quotationConversionRate,
  shipmentCompletionRate,
  pipeline,
  revenueTrend,
  primaryCurrency,
  revenueCollectedByCurrency,
  primaryCollectedCurrency,
  revenueCollectedThisMonth,
  topCustomersByVolume,
  recentDeliveries,
  branchStats,
  isAdmin,
  loading,
}: OperationsOverviewProps) {
  const collectedTotal =
    primaryCollectedCurrency === null
      ? null
      : revenueCollectedByCurrency[primaryCollectedCurrency];
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Operations Overview
        </h2>
        <p className="text-sm text-muted-foreground">
          Performance signals across your sales and shipment pipeline.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <RateCard
          icon={Target}
          label="Quotation Conversion"
          description="approved vs. decided quotations"
          value={quotationConversionRate}
          color="bg-primary/10 text-primary"
          loading={loading}
        />
        <RateCard
          icon={PackageCheck}
          label="Shipment Completion"
          description="delivered vs. all active + delivered"
          value={shipmentCompletionRate}
          color="bg-green-50 text-green-600"
          loading={loading}
        />
        <StatCard
          icon={Wallet}
          label="Revenue Collected"
          description="payments received to date"
          value={collectedTotal === null ? '—' : formatCurrency(collectedTotal, primaryCollectedCurrency ?? undefined)}
          subValue={
            collectedTotal === null
              ? undefined
              : `${formatCurrency(revenueCollectedThisMonth, primaryCollectedCurrency ?? undefined)} this month`
          }
          color="bg-emerald-50 text-emerald-600"
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ShipmentStatusDonut pipeline={pipeline} loading={loading} />
        <RevenueTrendChart
          trend={revenueTrend}
          currency={primaryCurrency}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Top Customers by shipment volume */}
        <Card>
          <CardHeader className="px-4 py-3">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Users className="h-4 w-4 text-primary" />
              Top Customers
            </CardTitle>
            <CardDescription>Ranked by active shipment volume.</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : topCustomersByVolume.length === 0 ? (
              <EmptyState icon={Users} title="No shipment volume yet" compact />
            ) : (
              <div className="space-y-1">
                {topCustomersByVolume.map((c, i) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-lg px-2 py-2 transition-colors hover:bg-accent/60"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="truncate text-sm font-medium">
                        {c.name}
                      </span>
                    </div>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {c.shipmentCount} shipment{c.shipmentCount === 1 ? '' : 's'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Deliveries */}
        <Card>
          <CardHeader className="px-4 py-3">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <PackageCheck className="h-4 w-4 text-green-600" />
              Recent Deliveries
            </CardTitle>
            <CardDescription>Most recently completed shipments.</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : recentDeliveries.length === 0 ? (
              <EmptyState
                icon={PackageCheck}
                title="No deliveries yet"
                compact
              />
            ) : (
              <div className="space-y-1">
                {recentDeliveries.map((d) => (
                  <Link
                    key={d.id}
                    to={`/shipments/${d.id}`}
                    className="flex items-center justify-between rounded-lg px-2 py-2 transition-colors hover:bg-accent/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {d.reference_number ?? '—'}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {d.customerName}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(d.deliveredOn)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Branch Performance (admin only) */}
      {isAdmin && (
        <Card>
          <CardHeader className="px-4 py-3">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Building2 className="h-4 w-4 text-primary" />
              Branch Performance
            </CardTitle>
            <CardDescription>Volume by branch across the organization.</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : branchStats.length === 0 ? (
              <EmptyState icon={Building2} title="No branches found" compact />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left font-medium text-muted-foreground">
                        Branch
                      </th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">
                        Customers
                      </th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">
                        Shipments
                      </th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">
                        Quotations
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchStats.map((b) => (
                      <tr
                        key={b.branch_id}
                        className="border-b border-border transition-colors last:border-0 hover:bg-accent/50"
                      >
                        <td className="py-3 font-medium">{b.branch_name}</td>
                        <td className="py-3 text-right tabular-nums">{b.customers}</td>
                        <td className="py-3 text-right tabular-nums">{b.shipments}</td>
                        <td className="py-3 text-right tabular-nums">{b.quotations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
