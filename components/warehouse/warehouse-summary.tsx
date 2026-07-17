import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal, Boxes } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency } from '@/lib/utils/status';
import type { WarehouseStats } from '@/hooks/use-warehouse-data';

const SEGMENT_META = [
  { key: 'available', label: 'Available', hex: '#22c55e' },
  { key: 'low_stock', label: 'Low Stock', hex: '#f59e0b' },
  { key: 'out_of_stock', label: 'Out of Stock', hex: '#ef4444' },
] as const;

interface WarehouseSummaryProps {
  stats: WarehouseStats;
  donut: { available: number; low_stock: number; out_of_stock: number };
  periodTotals: { inboundValue: number; outboundValue: number; adjustmentValue: number };
  loading?: boolean;
}

export function WarehouseSummary({
  stats,
  donut,
  periodTotals,
  loading,
}: WarehouseSummaryProps) {
  const data = SEGMENT_META.map((s) => ({ ...s, count: donut[s.key] }));
  const total = stats.totalItems;

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between px-4 py-3">
        <CardTitle className="text-base font-semibold">Warehouse Summary</CardTitle>
        <span className="text-xs text-muted-foreground">This Month</span>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {loading ? (
          <Skeleton className="h-56 w-full" />
        ) : total === 0 ? (
          <EmptyState icon={Boxes} title="No stock items yet" compact />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-32 w-32 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data}
                      dataKey="count"
                      nameKey="label"
                      innerRadius={38}
                      outerRadius={58}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {data.map((d) => (
                        <Cell key={d.key} fill={d.hex} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 'var(--radius)',
                        fontSize: 12,
                      }}
                      formatter={(value: number, name: string) => [
                        `${value} (${total > 0 ? ((value / total) * 100).toFixed(0) : 0}%)`,
                        name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="font-serif text-2xl font-normal leading-none tracking-tight">{total}</p>
                <p className="text-xs text-muted-foreground">Total Items</p>
                <div className="mt-2 space-y-1.5">
                  {data.map((d) => (
                    <div key={d.key} className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: d.hex }}
                      />
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {d.label}
                      </span>
                      <span className="shrink-0 font-medium">
                        {d.count} ({total > 0 ? ((d.count / total) * 100).toFixed(0) : 0}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <ArrowDownToLine className="h-3 w-3 text-green-600" />
                  Inbound
                </div>
                <p className="truncate text-sm font-semibold">
                  {formatCurrency(periodTotals.inboundValue)}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <ArrowUpFromLine className="h-3 w-3 text-blue-600" />
                  Outbound
                </div>
                <p className="truncate text-sm font-semibold">
                  {formatCurrency(periodTotals.outboundValue)}
                </p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <SlidersHorizontal className="h-3 w-3 text-purple-600" />
                  Adjustment
                </div>
                <p className="truncate text-sm font-semibold">
                  {formatCurrency(periodTotals.adjustmentValue)}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
