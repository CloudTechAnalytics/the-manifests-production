import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import type { OrgGrowthPoint } from '@/hooks/use-platform-dashboard-data';

interface OrganizationGrowthChartProps {
  growth: OrgGrowthPoint[];
  loading?: boolean;
}

export function OrganizationGrowthChart({ growth, loading }: OrganizationGrowthChartProps) {
  const hasOrgs = growth.some((g) => g.cumulative > 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between px-4 py-3">
        <CardTitle className="text-lg font-semibold">Organization Growth</CardTitle>
        <span className="text-xs text-muted-foreground">Last 6 months</span>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : !hasOrgs ? (
          <EmptyState icon={Building2} title="No organizations yet" compact />
        ) : (
          <ResponsiveContainer width="100%" height={192}>
            <AreaChart data={growth} margin={{ left: -12, right: 8 }}>
              <defs>
                <linearGradient id="orgGrowthFill" x1="0" y1="0" x2="0" y2="1">
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
                width={32}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                  fontSize: 12,
                }}
                formatter={(value: number) => [value, 'Total organizations']}
              />
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#orgGrowthFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
