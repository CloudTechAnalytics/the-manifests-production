'use client';

import { Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { PLAN_STATUS_FLOW, PLAN_STATUS_META } from '@/shared/lib/utils/status';
import type { ShipmentPlan } from '@/shared/types';

interface PlanStatusCardProps {
  plan: ShipmentPlan;
}

/**
 * Read-only display only — advancing status is exclusively the
 * "Complete Planning" gate on the Planning Centre page, which calls the
 * shared complete_shipment_stage() RPC (validated, atomic, notifies the
 * next department) rather than a free-form "Mark as X" step here that
 * had no completeness check.
 */
export function PlanStatusCard({ plan }: PlanStatusCardProps) {
  const isCancelled = plan.status === 'cancelled';
  const currentStep = isCancelled ? -1 : PLAN_STATUS_META[plan.status]?.step ?? -1;

  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-lg font-semibold">Plan Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 pt-0">
        {PLAN_STATUS_FLOW.map((status, idx) => {
          const meta = PLAN_STATUS_META[status];
          const isComplete = !isCancelled && meta.step <= currentStep;
          const isCurrent = !isCancelled && meta.step === currentStep;
          const isLast = idx === PLAN_STATUS_FLOW.length - 1;
          return (
            <div key={status} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-semibold transition-colors ${
                    isCurrent
                      ? 'border-primary bg-primary text-primary-foreground'
                      : isComplete
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground'
                  }`}
                >
                  {isComplete && !isCurrent ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                </div>
                {!isLast && <div className={`mt-1 h-6 w-0.5 ${isComplete ? 'bg-primary/30' : 'bg-border'}`} />}
              </div>
              <span
                className={`pt-0.5 text-sm ${
                  isCurrent ? 'font-semibold text-primary' : isComplete ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {meta.label}
              </span>
            </div>
          );
        })}
        {isCancelled && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            Cancelled
          </div>
        )}
      </CardContent>
    </Card>
  );
}
