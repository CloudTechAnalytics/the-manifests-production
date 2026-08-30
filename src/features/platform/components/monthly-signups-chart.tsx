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
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { Building2 } from 'lucide-react';
import type { OrgGrowthPoint } from '@/shared/hooks/use-platform-dashboard-data';

interface MonthlySignupsChartProps {
  growth: OrgGrowthPoint[];
  loading?: boolean;
}

/**
 * New organizations per month (growth[].count) — a different read of
 * the same 6-month window OrganizationGrowthChart already fetches
 * (that one plots the running cumulative total; this plots the month's
 * own signups), so no new query for this card.
 */
export function MonthlySignupsChart({ growth, loading }: MonthlySignupsChartProps) {
  const hasSignups = growth.some((g) => g.count > 0);

  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-lg font-semibold">Monthly Signups</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : !hasSignups ? (
          <EmptyState icon={Building2} title="No signups yet" compact />
        ) : (
          <ResponsiveContainer width="100%" height={192}>
            <BarChart data={growth} margin={{ left: -12, right: 8 }}>
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
                width={32}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--accent))' }}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                  fontSize: 12,
                }}
                formatter={(value: number) => [value, 'New organizations']}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
