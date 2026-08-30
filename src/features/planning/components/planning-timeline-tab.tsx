'use client';

import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { EmptyState } from '@/shared/components/ui/empty-state';
import { formatRelativeTime } from '@/shared/lib/utils/status';
import type { Activity } from '@/shared/types';

interface PlanningTimelineTabProps {
  shipmentId: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

/**
 * Planning Timeline (§10) — a chronological audit trail of every
 * planning-related action taken on this shipment. Reads `activities`
 * filtered by the JSON-path metadata.shipment_id every planning dialog
 * now sets on insert, so it covers Vessel/Booking, Customs, Terminal,
 * Transport, Documentation checklist, and Assignment changes in one
 * feed — no separate logging system introduced.
 */
export function PlanningTimelineTab({ shipmentId }: PlanningTimelineTabProps) {
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('activities')
        .select('*, user:profiles(id, full_name)')
        .eq('metadata->>shipment_id', shipmentId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (error) {
        console.error('Error loading planning timeline:', error);
        setActivity([]);
      } else {
        setActivity((data as unknown as Activity[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [shipmentId]);

  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-lg font-semibold">Planning Timeline</CardTitle>
        <p className="text-xs text-muted-foreground">Every planning action recorded for this shipment</p>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
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
            message="Actions taken while planning this shipment will show up here."
            compact
          />
        ) : (
          <div className="space-y-3">
            {activity.map((item) => {
              const actorName = item.user?.full_name ?? 'System';
              return (
                <div key={item.id} className="flex items-start gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                    {initials(actorName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">{item.description}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {actorName} · {formatRelativeTime(item.created_at)}
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
