'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Info, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PLAN_STATUS_FLOW, PLAN_STATUS_META } from '@/lib/utils/status';
import type { ShipmentPlan, PlanStatus } from '@/types';

interface PlanStatusCardProps {
  plan: ShipmentPlan;
  onUpdated: () => void;
}

export function PlanStatusCard({ plan, onUpdated }: PlanStatusCardProps) {
  const { profile } = useAuth();
  const [updating, setUpdating] = useState(false);

  const isCancelled = plan.status === 'cancelled';
  const isConverted = !!plan.converted_shipment_id;
  const currentStep = isCancelled ? -1 : PLAN_STATUS_META[plan.status].step;

  const nextStatus: PlanStatus | null = (() => {
    const idx = PLAN_STATUS_FLOW.indexOf(plan.status);
    if (idx === -1 || idx >= PLAN_STATUS_FLOW.length - 1) return null;
    return PLAN_STATUS_FLOW[idx + 1];
  })();

  const advanceStatus = async (status: PlanStatus) => {
    if (!profile?.id) return;
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('shipment_plans')
        .update({ status, updated_by: profile.id, updated_at: new Date().toISOString() })
        .eq('id', plan.id);
      if (error) throw error;

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: plan.branch_id,
        action: 'plan.status_changed',
        entity_type: 'shipment_plan',
        entity_id: plan.id,
        description: `Moved plan ${plan.plan_number ?? ''} to "${PLAN_STATUS_META[status].label}"`,
        metadata: { status },
      });

      toast.success(`Plan marked as ${PLAN_STATUS_META[status].label}`);
      onUpdated();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update plan status';
      toast.error(message);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-lg font-semibold">Plan Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4 pt-0">
        <div className="space-y-3">
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
                  {!isLast && (
                    <div className={`mt-1 h-6 w-0.5 ${isComplete ? 'bg-primary/30' : 'bg-border'}`} />
                  )}
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
        </div>

        {plan.status === 'planned' && !isConverted && (
          <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>This is a draft plan. Review all details and convert this plan to a shipment when ready.</span>
          </div>
        )}

        {isConverted && (
          <div className="flex items-start gap-2 rounded-lg bg-green-50 p-3 text-xs text-green-700">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>This plan has been converted to a shipment.</span>
          </div>
        )}

        {!isCancelled && !isConverted && nextStatus && (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={updating}
            onClick={() => advanceStatus(nextStatus)}
          >
            {updating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Mark as {PLAN_STATUS_META[nextStatus].label}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
