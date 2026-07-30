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
import { checkReleaseReadiness } from '@/lib/utils/release-readiness';
import { cn } from '@/lib/utils';
import type {
  Shipment,
  CustomsStatus,
  CustomsInspectionChannel,
  TerminalStatus,
  ExaminationResult,
  TransportationStatus,
} from '@/types';

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

/** Where a customs_status value sits relative to the three customs stages below. */
const CUSTOMS_ORDER: Record<CustomsStatus, number> = {
  draft: 0,
  submitted: 0,
  awaiting_assessment: 1,
  customs_processing: 1,
  duty_payment: 2,
  released: 3,
  rejected: -1,
};

export function LifecycleTimeline({ shipment }: { shipment: Shipment }) {
  const [loading, setLoading] = useState(true);
  const [stages, setStages] = useState<StageDef[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      const [
        { data: plan },
        { data: customs },
        { data: terminal },
        { data: examinations },
        { data: transportLegs },
        releaseReadiness,
      ] = await Promise.all([
        supabase
          .from('shipment_plans')
          .select('id')
          .eq('converted_shipment_id', shipment.id)
          .maybeSingle(),
        supabase
          .from('shipment_customs')
          .select('status, inspection_channel, duty_paid')
          .eq('shipment_id', shipment.id)
          .is('deleted_at', null)
          .maybeSingle(),
        supabase
          .from('terminal_operations')
          .select('status')
          .eq('shipment_id', shipment.id)
          .is('deleted_at', null)
          .maybeSingle(),
        supabase
          .from('shipment_examinations')
          .select('result, created_at')
          .eq('shipment_id', shipment.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('shipment_transportation')
          .select('status, created_at')
          .eq('shipment_id', shipment.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1),
        checkReleaseReadiness(shipment.id),
      ]);

      if (cancelled) return;

      const typedCustoms = customs as {
        status: CustomsStatus;
        inspection_channel: CustomsInspectionChannel | null;
        duty_paid: boolean;
      } | null;

      const isOverdue =
        shipment.status !== 'delivered' &&
        shipment.status !== 'cancelled' &&
        !!shipment.estimated_arrival &&
        new Date(shipment.estimated_arrival) < new Date();

      const customsStage = (target: 0 | 1 | 2): StageState => {
        if (!typedCustoms) return 'pending';
        const order = CUSTOMS_ORDER[typedCustoms.status];
        if (order === -1) return target === 0 ? 'delayed' : 'pending';
        if (order > target) return 'completed';
        if (order === target) return isOverdue ? 'delayed' : 'in_progress';
        return 'pending';
      };

      const typedTerminal = terminal as { status: TerminalStatus } | null;
      const terminalState: StageState = !typedTerminal
        ? 'pending'
        : typedTerminal.status === 'released'
          ? 'completed'
          : isOverdue
            ? 'delayed'
            : 'in_progress';

      const latestExam = examinations?.[0] as { result: ExaminationResult | null } | undefined;
      const examinationRequired = typedCustoms?.inspection_channel === 'red';
      const examinationState: StageState = !examinationRequired
        ? 'not_required'
        : !latestExam
          ? 'pending'
          : latestExam.result === 'passed'
            ? 'completed'
            : latestExam.result === 'held' ||
                latestExam.result === 'additional_duty' ||
                latestExam.result === 'further_inspection'
              ? 'delayed'
              : 'in_progress';

      const releaseState: StageState = releaseReadiness.ready ? 'completed' : 'pending';

      const latestLeg = transportLegs?.[0] as { status: TransportationStatus } | undefined;
      const transportState: StageState = !latestLeg
        ? 'pending'
        : latestLeg.status === 'delivered'
          ? 'completed'
          : latestLeg.status === 'failed_delivery'
            ? 'delayed'
            : 'in_progress';

      const docState: StageState =
        shipment.status === 'cancelled'
          ? 'pending'
          : shipment.status === 'booking_received'
            ? 'pending'
            : shipment.status === 'documentation'
              ? isOverdue
                ? 'delayed'
                : 'in_progress'
              : 'completed';

      setStages(
        [
          { key: 'booking', label: 'Booking', state: 'completed' as StageState },
          { key: 'planning', label: 'Planning', state: (plan ? 'completed' : 'pending') as StageState },
          { key: 'documentation', label: 'Documentation', state: docState },
          { key: 'awaiting_customs', label: 'Awaiting Customs', state: customsStage(0) },
          { key: 'customs_processing', label: 'Customs Processing', state: customsStage(1) },
          { key: 'duty_payment', label: 'Duty Payment', state: customsStage(2) },
          { key: 'terminal', label: 'Terminal Operations', state: terminalState },
          { key: 'examination', label: 'Physical Examination', state: examinationState },
          { key: 'release', label: 'Release', state: releaseState },
          { key: 'warehouse', label: 'Warehouse', state: 'not_required' as StageState },
          { key: 'transportation', label: 'Transportation', state: transportState },
          {
            key: 'delivered',
            label: 'Delivered',
            state: (shipment.status === 'delivered' ? 'completed' : 'pending') as StageState,
          },
          { key: 'completed', label: 'Completed', state: 'pending' as StageState },
        ].filter((s) => !(s.key === 'examination' && s.state === 'not_required'))
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [shipment.id, shipment.status, shipment.estimated_arrival]);

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
