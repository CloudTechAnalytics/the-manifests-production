'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency } from '@/lib/utils/status';

interface MonthlyRevenueChartProps {
  data: { key: string; label: string; total: number }[];
  currency: string;
}

/**
 * Split out from app/(app)/sales/page.tsx and loaded via next/dynamic
 * there — recharts is a large dependency, no reason to ship it in the
 * page's own chunk when it's only needed once this one card renders.
 */
export function MonthlyRevenueChart({ data, currency }: MonthlyRevenueChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="hsl(var(--border))"
        />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        <Tooltip
          cursor={{ fill: 'hsl(var(--accent))' }}
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 'var(--radius)',
            fontSize: 12,
          }}
          formatter={(value: number) => [
            formatCurrency(value, currency),
            'Revenue',
          ]}
        />
        <Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
