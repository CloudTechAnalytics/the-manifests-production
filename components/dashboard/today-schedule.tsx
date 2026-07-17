import Link from 'next/link';
import {
  CalendarDays,
  PackagePlus,
  PlaneTakeoff,
  PlaneLanding,
  ArrowRight,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import type { ScheduleEvent, ScheduleEventType } from '@/hooks/use-dashboard-data';

const EVENT_META: Record<
  ScheduleEventType,
  { label: string; icon: typeof PackagePlus; color: string }
> = {
  booking: {
    label: 'Booking',
    icon: PackagePlus,
    color: 'bg-blue-50 text-blue-600',
  },
  est_departure: {
    label: 'Est. Departure',
    icon: PlaneTakeoff,
    color: 'bg-amber-50 text-amber-600',
  },
  actual_departure: {
    label: 'Departed',
    icon: PlaneTakeoff,
    color: 'bg-emerald-50 text-emerald-600',
  },
  est_arrival: {
    label: 'Est. Arrival',
    icon: PlaneLanding,
    color: 'bg-purple-50 text-purple-600',
  },
  actual_arrival: {
    label: 'Arrived',
    icon: PlaneLanding,
    color: 'bg-emerald-50 text-emerald-600',
  },
};

interface TodayScheduleProps {
  events: ScheduleEvent[];
  loading?: boolean;
}

export function TodaySchedule({ events, loading }: TodayScheduleProps) {
  const visible = events.slice(0, 5);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0 px-4 pb-3 pt-4">
        <div className="space-y-0.5">
          <CardTitle className="text-base font-semibold">
            Today&apos;s Schedule
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Milestones dated today
          </p>
        </div>
        <Link
          href="/calendar"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Calendar
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="flex-1 px-4 pb-4 pt-0">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Nothing scheduled today"
            message="Bookings, departures, and arrivals dated today will appear here."
            compact
          />
        ) : (
          <div className="space-y-1.5">
            {visible.map((evt) => {
              const meta = EVENT_META[evt.type];
              const Icon = meta.icon;
              return (
                <Link
                  key={evt.id}
                  href={`/shipments/${evt.shipmentId}`}
                  className="flex items-center gap-2.5 rounded-lg border border-border p-2.5 transition-colors hover:border-primary/30 hover:bg-accent"
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.color}`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {evt.reference ?? 'Draft shipment'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {evt.customerName}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
                    {meta.label}
                  </span>
                </Link>
              );
            })}
            {events.length > visible.length && (
              <p className="pt-1 text-center text-xs text-muted-foreground">
                +{events.length - visible.length} more today
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
