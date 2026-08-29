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
  /** Unused — kept optional so existing call sites don't need to drop
   *  the prop. Icons render in the reference's filled primary-tint
   *  chip (bg-primary/12), not a per-category color. */
  color?: string;
  /** Optional trend badge, e.g. { direction: 'up', label: '3 this week' } */
  trend?: { direction: 'up' | 'down'; label: string };
  loading?: boolean;
  /** A currency-formatted value (e.g. "₦150,000") renders in Inter, not
   *  the Playfair Display serif face — the Naira sign's authentic glyph
   *  (an "N" with two horizontal strokes) reads as a rendering error at
   *  display-face size and weight. Plain counts stay serif. */
  isCurrency?: boolean;
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  href,
  caption,
  trend,
  loading,
  isCurrency,
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
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <Icon className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-end justify-between gap-2">
            <p
              className={
                isCurrency
                  ? 'text-3xl font-semibold leading-none tracking-tight'
                  : 'font-serif text-3xl font-semibold leading-none tracking-tight'
              }
            >
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
