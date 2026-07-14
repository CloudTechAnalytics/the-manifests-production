import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { PackageSearch } from 'lucide-react';
import type { PipelineCounts } from '@/hooks/use-dashboard-data';

// Only the real shipment-status stages (excludes "Quotation", which isn't
// a shipment status — it's approved quotations that haven't shipped yet).
const SHIPMENT_STAGE_KEYS = new Set([
  'booking',
  'documentation',
  'customs',
  'in_transit',
  'delivered',
]);

const STAGE_HEX: Record<string, string> = {
  booking: '#3b82f6',
  documentation: '#f59e0b',
  customs: '#a855f7',
  in_transit: '#06b6d4',
  delivered: '#22c55e',
};

interface ShipmentStatusDonutProps {
  pipeline: PipelineCounts[];
  loading?: boolean;
}

export function ShipmentStatusDonut({
  pipeline,
  loading,
}: ShipmentStatusDonutProps) {
  const data = pipeline.filter((p) => SHIPMENT_STAGE_KEYS.has(p.key));
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-base font-semibold">
          Shipment Status Distribution
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : total === 0 ? (
          <EmptyState icon={PackageSearch} title="No shipments yet" compact />
        ) : (
          <div className="flex items-center gap-4">
            <div className="h-40 w-40 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {data.map((d) => (
                      <Cell key={d.key} fill={STAGE_HEX[d.key] ?? '#94a3b8'} />
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
                      `${value} (${((value / total) * 100).toFixed(0)}%)`,
                      name,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              {data.map((d) => (
                <div key={d.key} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: STAGE_HEX[d.key] ?? '#94a3b8' }}
                  />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {d.label}
                  </span>
                  <span className="shrink-0 font-medium">
                    {d.count} (
                    {total > 0 ? ((d.count / total) * 100).toFixed(0) : 0}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
