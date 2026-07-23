import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency } from '@/lib/utils/status';
import type { RevenueTrendPoint } from '@/hooks/use-dashboard-data';

interface RevenueTrendChartProps {
  trend: RevenueTrendPoint[];
  currency: string | null;
  loading?: boolean;
}

export function RevenueTrendChart({
  trend,
  currency,
  loading,
}: RevenueTrendChartProps) {
  const hasRevenue = trend.some((t) => t.cumulative > 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between px-4 py-3">
        <CardTitle className="text-lg font-semibold">
          Pipeline Value Won
        </CardTitle>
        <span className="text-xs text-muted-foreground">This Month</span>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : !hasRevenue ? (
          <EmptyState
            icon={TrendingUp}
            title="No approved quotations won this month"
            compact
          />
        ) : (
          <ResponsiveContainer width="100%" height={192}>
            <AreaChart data={trend} margin={{ left: -12, right: 8 }}>
              <defs>
                <linearGradient id="revenueTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                width={48}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                }
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                  fontSize: 12,
                }}
                formatter={(value: number) => [
                  formatCurrency(value, currency ?? 'NGN'),
                  'Value won to date',
                ]}
              />
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#revenueTrendFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
