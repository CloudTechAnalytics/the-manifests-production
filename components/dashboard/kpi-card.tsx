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
  /** Short context line under the number, e.g. "Customer firms". Omit
   *  for a KPI that's already fully explained by its label. */
  caption?: string;
  /** No longer rendered — icons are a uniform neutral outline now,
   *  matching the reference layout, not per-category colored fills.
   *  Kept optional so existing call sites don't need to drop the prop. */
  color?: string;
  /** Optional trend badge, e.g. { direction: 'up', label: '3 this week' } */
  trend?: { direction: 'up' | 'down'; label: string };
  loading?: boolean;
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  href,
  caption,
  trend,
  loading,
}: KpiCardProps) {
  if (loading) {
    return (
      <Card className="h-full">
        <CardContent className="p-4">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Link href={href} className="block h-full">
      <Card className="h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="mt-3 flex items-end justify-between gap-2">
            <p className="font-serif text-3xl font-bold leading-none tracking-tight">
              {value}
            </p>
            {trend && (
              <span
                className={`mb-0.5 inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium ${
                  trend.direction === 'up'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-red-50 text-red-700'
                }`}
              >
                {trend.direction === 'up' ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {trend.label}
              </span>
            )}
          </div>
          {caption && (
            <p className="mt-1.5 truncate text-xs text-muted-foreground">{caption}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
