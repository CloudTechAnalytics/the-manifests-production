import type { ComponentType } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export interface KpiCardProps {
  label: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
  href: string;
  color: string;
  /** Optional trend badge, e.g. { direction: 'up', label: '3 this week' } */
  trend?: { direction: 'up' | 'down'; label: string };
  loading?: boolean;
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  href,
  color,
  trend,
  loading,
}: KpiCardProps) {
  if (loading) {
    return (
      <Card className="h-full">
        <CardContent className="p-4">
          <Skeleton className="h-14 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Link href={href} className="block h-full">
      <Card className="h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${color}`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <p className="truncate text-xs font-medium text-muted-foreground">
              {label}
            </p>
          </div>
          <p className="mt-2.5 text-[26px] font-bold leading-none tracking-tight">
            {value}
          </p>
          {trend && (
            <div
              className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${
                trend.direction === 'up' ? 'text-emerald-600' : 'text-red-600'
              }`}
            >
              {trend.direction === 'up' ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
              {trend.label}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
