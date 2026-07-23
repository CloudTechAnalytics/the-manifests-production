import { History } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatRelativeTime } from '@/lib/utils/status';
import type { ActivityItem } from '@/hooks/use-dashboard-data';

interface RecentActivityProps {
  activity: ActivityItem[];
  loading?: boolean;
}

/** Initials for the actor avatar, e.g. "John David" -> "JD". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function RecentActivity({ activity, loading }: RecentActivityProps) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="px-4 pb-3 pt-4">
        <CardTitle className="text-lg font-semibold">
          Recent Activity
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Latest actions across your branch
        </p>
      </CardHeader>
      <CardContent className="flex-1 px-4 pb-4 pt-0">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : activity.length === 0 ? (
          <EmptyState
            icon={History}
            title="No activity yet"
            message="Actions taken by your team will show up here."
            compact
          />
        ) : (
          <div className="space-y-3">
            {activity.map((item) => (
              <div key={item.id} className="flex items-start gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                  {initials(item.userName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug">{item.description}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.userName} · {formatRelativeTime(item.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
