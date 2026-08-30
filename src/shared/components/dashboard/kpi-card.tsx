import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';

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
  /** A currency-formatted value (e.g. "NGN 150,000" — see formatCurrency,
   *  lib/utils/status.ts, which prints the code rather than the ₦ symbol
   *  glyph now) renders in Inter, not the Playfair Display serif face —
   *  numeric/data figures read as data, not a headline. Plain counts
   *  stay serif. */
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
    <Link to={href} className="block h-full">
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
                  // One size down from the plain-count case — "NGN
                  // 1,800,000" is a much longer string than a bare
                  // number, and text-3xl wrapped it onto two lines on
                  // narrower KPI grids (Revenue Analytics' 6-up row).
                  // whitespace-nowrap trims that further: it still wraps
                  // the *card* height evenly across a row if truly out
                  // of room, but never breaks mid-value.
                  ? 'whitespace-nowrap text-2xl font-semibold leading-none tracking-tight'
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
