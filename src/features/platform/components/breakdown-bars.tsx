import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';

export interface BreakdownRow {
  label: string;
  count: number;
  /** Tailwind bar-fill class, e.g. 'bg-emerald-500'. Defaults to the accent. */
  barClassName?: string;
}

interface BreakdownBarsProps {
  title: string;
  rows: BreakdownRow[];
  emptyMessage: string;
  loading?: boolean;
  /** Formats the number shown next to each row, e.g. as currency.
   *  Defaults to the raw count. Bar widths are still proportional to
   *  the raw `count`, regardless of how it's displayed. */
  formatCount?: (count: number) => string;
}

/**
 * A small "label — proportional bar — count" list, shared by Platform
 * Analytics' Plan Distribution and Organizations by Status cards (and
 * reusable anywhere else a simple category breakdown is needed) — no
 * charting library required for something this simple.
 */
export function BreakdownBars({ title, rows, emptyMessage, loading, formatCount }: BreakdownBarsProps) {
  const total = rows.reduce((sum, r) => sum + r.count, 0);

  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : total === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{row.label}</span>
                  <span className="text-muted-foreground">
                    {formatCount ? formatCount(row.count) : row.count}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${row.barClassName ?? 'bg-primary'}`}
                    style={{ width: `${total > 0 ? (row.count / total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
