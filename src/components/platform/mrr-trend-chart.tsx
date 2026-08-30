'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { LineChart as LineChartIcon } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/status';

export interface MrrTrendPoint {
  label: string;
  mrr: number;
}

interface MrrTrendChartProps {
  title: string;
  subtitle?: string;
  points: MrrTrendPoint[];
  loading?: boolean;
}

export function MrrTrendChart({ title, subtitle, points, loading }: MrrTrendChartProps) {
  const hasRevenue = points.some((p) => p.mrr > 0);

  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : !hasRevenue ? (
          <EmptyState icon={LineChartIcon} title="No revenue yet" compact />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={points} margin={{ left: -12, right: 8 }}>
              <defs>
                <linearGradient id="mrrTrendFill" x1="0" y1="0" x2="0" y2="1">
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
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                width={48}
                tickFormatter={(v: number) => formatCurrency(v).replace(/\.00$/, '')}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                  fontSize: 12,
                }}
                formatter={(value: number) => [formatCurrency(value), 'MRR']}
              />
              <Area
                type="monotone"
                dataKey="mrr"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#mrrTrendFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
