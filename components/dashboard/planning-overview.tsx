import Link from 'next/link';
import { ClipboardList, ArrowRight, Flame } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import type { PlanningOverviewData } from '@/hooks/use-dashboard-data';

interface PlanningOverviewProps {
  planning: PlanningOverviewData;
  loading?: boolean;
}

/**
 * Shipment plans broken down by status. The bar is a proportional
 * share-of-total rendered straight from the counts — no synthetic
 * series, so it disappears rather than mislead when there are no plans.
 */
export function PlanningOverview({ planning, loading }: PlanningOverviewProps) {
  const segments = [
    { key: 'planned', label: 'Planned', count: planning.planned, hex: '#3b82f6' },
    { key: 'approved', label: 'Approved', count: planning.approved, hex: '#6366f1' },
    { key: 'in_progress', label: 'In Progress', count: planning.inProgress, hex: '#f59e0b' },
    { key: 'completed', label: 'Completed', count: planning.completed, hex: '#22c55e' },
  ];

  const tracked = segments.reduce((sum, s) => sum + s.count, 0);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0 px-4 pb-3 pt-4">
        <div className="space-y-0.5">
          <CardTitle className="text-lg font-semibold">
            Planning Overview
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {planning.total} plan{planning.total === 1 ? '' : 's'} total
          </p>
        </div>
        <Link
          href="/planning"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Planning
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="flex-1 px-4 pb-4 pt-0">
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : planning.total === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No shipment plans yet"
            message="Create a plan to coordinate cargo, carriers, and tasks."
            compact
          />
        ) : (
          <div className="space-y-4">
            {tracked > 0 && (
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                {segments
                  .filter((s) => s.count > 0)
                  .map((s) => (
                    <div
                      key={s.key}
                      style={{
                        width: `${(s.count / tracked) * 100}%`,
                        backgroundColor: s.hex,
                      }}
                    />
                  ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              {segments.map((s) => (
                <div key={s.key} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: s.hex }}
                  />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {s.label}
                  </span>
                  <span className="shrink-0 text-sm font-semibold">
                    {s.count}
                  </span>
                </div>
              ))}
            </div>

            {planning.highPriority > 0 && (
              <div className="flex items-center gap-2 border-t border-border pt-3">
                <Flame className="h-3.5 w-3.5 shrink-0 text-red-600" />
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {planning.highPriority}
                  </span>{' '}
                  high-priority plan
                  {planning.highPriority === 1 ? '' : 's'} still open
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
