'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Package,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/utils/status';

type EventType =
  | 'booking'
  | 'est_departure'
  | 'est_arrival'
  | 'actual_departure'
  | 'actual_arrival';

interface CalendarEvent {
  id: string;
  shipmentId: string;
  date: string; // YYYY-MM-DD
  type: EventType;
  referenceNumber: string | null;
  customerName: string;
}

type ViewMode = 'month' | 'week' | 'day' | 'agenda';

const EVENT_TYPE_META: Record<
  EventType,
  { label: string; dot: string; chip: string }
> = {
  booking: { label: 'Booking', dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700' },
  est_departure: { label: 'Est. Departure', dot: 'bg-purple-500', chip: 'bg-purple-50 text-purple-700' },
  est_arrival: { label: 'Est. Arrival', dot: 'bg-indigo-500', chip: 'bg-indigo-50 text-indigo-700' },
  actual_departure: { label: 'Departed', dot: 'bg-cyan-500', chip: 'bg-cyan-50 text-cyan-700' },
  actual_arrival: { label: 'Arrived', dot: 'bg-green-500', chip: 'bg-green-50 text-green-700' },
};

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

function getMonthGrid(anchor: Date): Date[] {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday-first
  const start = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function getWeekGrid(anchor: Date): Date[] {
  const offset = (anchor.getDay() + 6) % 7;
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export default function CalendarPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const branchFilter = isAdmin ? null : profile?.branch_id ?? null;

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [view, setView] = useState<ViewMode>('month');
  const [anchorDate, setAnchorDate] = useState(() => new Date());

  useEffect(() => {
    async function load() {
      if (!profile) return;
      setLoading(true);
      try {
        let query = supabase
          .from('shipments')
          .select(
            'id, reference_number, booking_date, estimated_departure, estimated_arrival, actual_departure, actual_arrival, customer:customers(company_name)'
          )
          .is('deleted_at', null);
        if (branchFilter) query = query.eq('branch_id', branchFilter);

        const { data, error } = await query;
        if (error) {
          console.error('Error loading calendar events:', error);
          setEvents([]);
          return;
        }

        const rows = (data ?? []) as unknown as {
          id: string;
          reference_number: string | null;
          booking_date: string | null;
          estimated_departure: string | null;
          estimated_arrival: string | null;
          actual_departure: string | null;
          actual_arrival: string | null;
          customer: { company_name: string } | null;
        }[];

        const evts: CalendarEvent[] = [];
        const fieldToType: [keyof (typeof rows)[number], EventType][] = [
          ['booking_date', 'booking'],
          ['estimated_departure', 'est_departure'],
          ['estimated_arrival', 'est_arrival'],
          ['actual_departure', 'actual_departure'],
          ['actual_arrival', 'actual_arrival'],
        ];

        rows.forEach((r) => {
          fieldToType.forEach(([field, type]) => {
            const value = r[field] as string | null;
            if (!value) return;
            evts.push({
              id: `${r.id}-${type}`,
              shipmentId: r.id,
              date: value,
              type,
              referenceNumber: r.reference_number,
              customerName: r.customer?.company_name ?? 'Unknown',
            });
          });
        });

        setEvents(evts);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [profile, branchFilter]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((e) => {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    });
    return map;
  }, [events]);

  const gridDates = useMemo(() => {
    if (view === 'month') return getMonthGrid(anchorDate);
    if (view === 'week') return getWeekGrid(anchorDate);
    if (view === 'day') return [anchorDate];
    return [];
  }, [view, anchorDate]);

  const agendaEvents = useMemo(() => {
    const todayKey = toDateKey(new Date());
    return events
      .filter((e) => e.date >= todayKey)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 40);
  }, [events]);

  const today = new Date();
  const monthLabel = anchorDate.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });

  const navigate = (dir: -1 | 1) => {
    setAnchorDate((prev) => {
      const d = new Date(prev);
      if (view === 'month') d.setMonth(d.getMonth() + dir);
      else if (view === 'week') d.setDate(d.getDate() + dir * 7);
      else d.setDate(d.getDate() + dir);
      return d;
    });
  };

  return (
    <div className="space-y-4 p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 font-serif text-2xl font-normal tracking-tight">
          <CalendarDays className="h-6 w-6 text-blue-600" />
          Calendar
        </h1>
        <p className="text-sm text-muted-foreground">
          Shipment dates across your operations — generated automatically
          from bookings and schedules.
        </p>
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {view !== 'agenda' && (
              <>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setAnchorDate(new Date())}>
                  Today
                </Button>
                <span className="ml-1 text-sm font-semibold">
                  {view === 'day'
                    ? anchorDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                    : monthLabel}
                </span>
              </>
            )}
            {view === 'agenda' && (
              <span className="text-sm font-semibold">Upcoming events</span>
            )}
          </div>
          <div className="flex rounded-lg border border-border p-0.5">
            {(['month', 'week', 'day', 'agenda'] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors',
                  view === v
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent'
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-xs text-muted-foreground">
        {(Object.keys(EVENT_TYPE_META) as EventType[]).map((type) => (
          <span key={type} className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', EVENT_TYPE_META[type].dot)} />
            {EVENT_TYPE_META[type].label}
          </span>
        ))}
      </div>

      {/* Views */}
      {loading ? (
        <Skeleton className="h-[560px] w-full" />
      ) : view === 'agenda' ? (
        <Card>
          <CardContent className="p-0">
            {agendaEvents.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No upcoming events"
                message="Shipment dates will appear here as they're scheduled."
              />
            ) : (
              <div className="divide-y divide-border">
                {agendaEvents.map((e) => (
                  <Link
                    key={e.id}
                    href={`/shipments/${e.shipmentId}`}
                    className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-accent/60"
                  >
                    <div className="w-20 shrink-0 text-sm font-medium text-muted-foreground">
                      {formatDate(e.date)}
                    </div>
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', EVENT_TYPE_META[e.type].dot)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {EVENT_TYPE_META[e.type].label}: {e.referenceNumber ?? 'Shipment'}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {e.customerName}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : view === 'month' ? (
        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-7 border-b border-border">
              {WEEKDAY_LABELS.map((d) => (
                <div
                  key={d}
                  className="border-r border-border p-2 text-center text-xs font-semibold text-muted-foreground last:border-r-0"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {gridDates.map((d, i) => {
                const key = toDateKey(d);
                const dayEvents = eventsByDate.get(key) ?? [];
                const inMonth = d.getMonth() === anchorDate.getMonth();
                const isToday = isSameDay(d, today);
                return (
                  <div
                    key={i}
                    className={cn(
                      'min-h-[110px] border-b border-r border-border p-1.5 last:border-r-0',
                      !inMonth && 'bg-muted/30'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                        isToday
                          ? 'bg-primary text-primary-foreground'
                          : inMonth
                            ? 'text-foreground'
                            : 'text-muted-foreground/50'
                      )}
                    >
                      {d.getDate()}
                    </span>
                    <div className="mt-1 space-y-1">
                      {dayEvents.slice(0, 3).map((e) => (
                        <Link
                          key={e.id}
                          href={`/shipments/${e.shipmentId}`}
                          className={cn(
                            'block truncate rounded px-1.5 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80',
                            EVENT_TYPE_META[e.type].chip
                          )}
                          title={`${EVENT_TYPE_META[e.type].label}: ${e.referenceNumber ?? ''}`}
                        >
                          {e.referenceNumber ?? 'Shipment'}
                        </Link>
                      ))}
                      {dayEvents.length > 3 && (
                        <p className="px-1.5 text-[10px] text-muted-foreground">
                          +{dayEvents.length - 3} more
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        // Week / Day views share a per-day list layout
        <div
          className={cn(
            'grid grid-cols-1 gap-3',
            view === 'week' && 'sm:grid-cols-2 lg:grid-cols-7'
          )}
        >
          {gridDates.map((d, i) => {
            const key = toDateKey(d);
            const dayEvents = eventsByDate.get(key) ?? [];
            const isToday = isSameDay(d, today);
            return (
              <Card key={i} className={cn(isToday && 'border-primary/40')}>
                <CardContent className="p-3">
                  <p
                    className={cn(
                      'mb-2 text-sm font-semibold',
                      isToday && 'text-primary'
                    )}
                  >
                    {d.toLocaleDateString('en-GB', {
                      weekday: view === 'day' ? 'long' : 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                  {dayEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No events</p>
                  ) : (
                    <div className="space-y-1.5">
                      {dayEvents.map((e) => (
                        <Link
                          key={e.id}
                          href={`/shipments/${e.shipmentId}`}
                          className={cn(
                            'flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-opacity hover:opacity-80',
                            EVENT_TYPE_META[e.type].chip
                          )}
                        >
                          <Package className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            {EVENT_TYPE_META[e.type].label}: {e.referenceNumber ?? 'Shipment'}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
