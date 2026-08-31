'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  MinusCircle,
} from 'lucide-react';
import { fetchShipmentStagesForTimeline } from '@/features/shipments/services/shipments.service';
import { cn } from '@/shared/lib/utils';
import type { Shipment } from '@/shared/types';

type StageState = 'completed' | 'in_progress' | 'pending' | 'delayed' | 'not_required';

interface StageDef {
  key: string;
  label: string;
  state: StageState;
}

const STAGE_META: Record<
  StageState,
  { icon: typeof CheckCircle2; dot: string; label: string; text: string }
> = {
  completed: { icon: CheckCircle2, dot: 'text-emerald-600 bg-emerald-50 border-emerald-300', label: 'text-foreground', text: 'text-emerald-700' },
  in_progress: { icon: Clock, dot: 'text-primary bg-primary/10 border-primary', label: 'text-foreground font-semibold', text: 'text-primary' },
  pending: { icon: Circle, dot: 'text-muted-foreground bg-muted border-border', label: 'text-muted-foreground', text: 'text-muted-foreground' },
  delayed: { icon: AlertTriangle, dot: 'text-red-600 bg-red-50 border-red-300', label: 'text-foreground', text: 'text-red-700' },
  not_required: { icon: MinusCircle, dot: 'text-muted-foreground/50 bg-muted/40 border-border/50', label: 'text-muted-foreground/60 line-through', text: 'text-muted-foreground/60' },
};

const STAGE_STATE_COPY: Record<StageState, string> = {
  completed: 'Completed',
  in_progress: 'Current stage',
  pending: 'Pending',
  delayed: 'Overdue',
  not_required: 'Skipped — not required',
};

/**
 * Vertical workflow checklist — one row per shipment_stages entry, in
 * sequence order. Replaces the old horizontal stepper (which needed
 * horizontal scrolling on anything narrower than a wide desktop) with a
 * layout that never scrolls sideways at any width.
 */
export function LifecycleTimeline({
  shipment,
  refreshToken,
}: {
  shipment: Shipment;
  refreshToken?: number;
}) {
  const { data: stages = [], isLoading: loading } = useQuery({
    queryKey: ['shipment-stages', shipment.id, refreshToken],
    queryFn: async (): Promise<StageDef[]> => {
      const rows = await fetchShipmentStagesForTimeline(shipment.id);
      const today = new Date().toISOString().split('T')[0];

      return rows.map((stage) => {
        const isOverdue =
          (stage.status === 'pending' || stage.status === 'in_progress') &&
          !!stage.due_date &&
          stage.due_date < today;

        const state: StageState =
          stage.status === 'skipped'
            ? 'not_required'
            : stage.status === 'completed'
              ? 'completed'
              : isOverdue
                ? 'delayed'
                : stage.status === 'in_progress'
                  ? 'in_progress'
                  : 'pending';

        return { key: stage.stage_key, label: stage.label, state };
      });
    },
  });

  if (shipment.status === 'cancelled') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        <AlertTriangle className="h-4 w-4" />
        This shipment was cancelled — lifecycle tracking stopped.
      </div>
    );
  }

  if (loading) {
    return <div className="h-40 animate-pulse rounded-lg bg-muted" />;
  }

  return (
    <ol className="space-y-0">
      {stages.map((stage, i) => {
        const meta = STAGE_META[stage.state];
        const Icon = meta.icon;
        const isLast = i === stages.length - 1;
        return (
          <li key={stage.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2', meta.dot)}>
                <Icon className="h-4 w-4" />
              </div>
              {!isLast && (
                <div
                  className={cn(
                    'w-0.5 flex-1 min-h-[18px]',
                    stage.state === 'completed' ? 'bg-emerald-300' : 'bg-border'
                  )}
                />
              )}
            </div>
            <div className={cn('flex-1 pb-4 pt-0.5', isLast && 'pb-0')}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className={cn('text-sm', meta.label)}>{stage.label}</span>
                <span className={cn('text-[11px] font-medium', meta.text)}>
                  {STAGE_STATE_COPY[stage.state]}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
