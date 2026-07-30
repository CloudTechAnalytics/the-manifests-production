'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  MinusCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { Shipment, ShipmentStage } from '@/types';

type StageState = 'completed' | 'in_progress' | 'pending' | 'delayed' | 'not_required';

interface StageDef {
  key: string;
  label: string;
  state: StageState;
}

const STAGE_META: Record<StageState, { icon: typeof CheckCircle2; className: string }> = {
  completed: { icon: CheckCircle2, className: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  in_progress: { icon: Clock, className: 'text-primary bg-primary/10 border-primary/30' },
  pending: { icon: Circle, className: 'text-muted-foreground bg-muted border-border' },
  delayed: { icon: AlertTriangle, className: 'text-red-600 bg-red-50 border-red-200' },
  not_required: { icon: MinusCircle, className: 'text-muted-foreground/50 bg-muted/40 border-border/50' },
};

export function LifecycleTimeline({
  shipment,
  refreshToken,
}: {
  shipment: Shipment;
  refreshToken?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [stages, setStages] = useState<StageDef[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      const { data } = await supabase
        .from('shipment_stages')
        .select('*')
        .eq('shipment_id', shipment.id)
        .order('sequence', { ascending: true });

      if (cancelled) return;

      const today = new Date().toISOString().split('T')[0];
      const rows = (data as ShipmentStage[] | null) ?? [];

      setStages(
        rows.map((stage) => {
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
        })
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [shipment.id, refreshToken]);

  if (shipment.status === 'cancelled') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        <AlertTriangle className="h-4 w-4" />
        This shipment was cancelled — lifecycle tracking stopped.
      </div>
    );
  }

  if (loading) {
    return <div className="h-20 animate-pulse rounded-lg bg-muted" />;
  }

  return (
    <div className="overflow-x-auto pb-1">
      <ol className="flex min-w-max items-start gap-1 sm:gap-2">
        {stages.map((stage, i) => {
          const meta = STAGE_META[stage.state];
          const Icon = meta.icon;
          return (
            <li key={stage.key} className="flex items-center">
              <div className="flex w-[92px] flex-col items-center gap-1.5 text-center sm:w-[104px]">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2',
                    meta.className
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span
                  className={cn(
                    'text-[11px] font-medium leading-tight',
                    stage.state === 'not_required' ? 'text-muted-foreground/50' : 'text-foreground'
                  )}
                >
                  {stage.label}
                </span>
              </div>
              {i < stages.length - 1 && (
                <div
                  className={cn(
                    'mt-4 h-0.5 w-4 shrink-0 sm:w-8',
                    stage.state === 'completed' ? 'bg-emerald-400' : 'bg-border'
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
