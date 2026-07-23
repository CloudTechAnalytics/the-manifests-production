import {
  ArrowDownToLine,
  ArrowUpFromLine,
  SlidersHorizontal,
  ArrowLeftRight,
  History,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime } from '@/lib/utils/status';
import type { StockMovement } from '@/types';

const TYPE_META: Record<
  StockMovement['movement_type'],
  { icon: typeof ArrowDownToLine; color: string; verb: string }
> = {
  inbound: { icon: ArrowDownToLine, color: 'bg-green-50 text-green-600', verb: 'Stock received' },
  outbound: { icon: ArrowUpFromLine, color: 'bg-blue-50 text-blue-600', verb: 'Stock issued' },
  adjustment_increase: {
    icon: SlidersHorizontal,
    color: 'bg-purple-50 text-purple-600',
    verb: 'Stock adjustment',
  },
  adjustment_decrease: {
    icon: SlidersHorizontal,
    color: 'bg-purple-50 text-purple-600',
    verb: 'Stock adjustment',
  },
  transfer: { icon: ArrowLeftRight, color: 'bg-cyan-50 text-cyan-600', verb: 'Transfer completed' },
};

interface RecentWarehouseActivitiesProps {
  movements: StockMovement[];
  loading?: boolean;
}

export function RecentWarehouseActivities({
  movements,
  loading,
}: RecentWarehouseActivitiesProps) {
  const recent = movements.slice(0, 8);

  return (
    <Card className="h-full">
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-lg font-semibold">Recent Warehouse Activities</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <EmptyState icon={History} title="No activity yet" compact />
        ) : (
          <div className="space-y-1">
            {recent.map((m) => {
              const meta = TYPE_META[m.movement_type];
              const Icon = meta.icon;
              const sign = m.movement_type === 'adjustment_decrease' ? '-' : '+';
              const locationLabel =
                m.movement_type === 'transfer'
                  ? `${m.warehouse?.name ?? '—'} → ${m.to_warehouse?.name ?? '—'}`
                  : m.warehouse?.name ?? '—';

              return (
                <div key={m.id} className="flex items-start gap-3 rounded-lg px-1 py-2">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {meta.verb}
                      {m.movement_type !== 'transfer' && (
                        <span className="font-normal text-muted-foreground">
                          {' '}
                          — {m.item?.name ?? 'Unknown item'} ({sign}
                          {m.quantity} {m.item?.unit ?? 'units'})
                        </span>
                      )}
                      {m.movement_type === 'transfer' && (
                        <span className="font-normal text-muted-foreground">
                          {' '}
                          — {m.item?.name ?? 'Unknown item'} ({m.quantity}{' '}
                          {m.item?.unit ?? 'units'})
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {locationLabel} • {formatDateTime(m.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
