import { Check, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/utils/status';
import type { ShipmentPlan, Quotation } from '@/types';

interface PlanMilestonesProps {
  plan: ShipmentPlan;
  quotation: Quotation | null;
  onEdit?: () => void;
}

export function PlanMilestones({ plan, quotation, onEdit }: PlanMilestonesProps) {
  const stages = [
    { key: 'created', label: 'Plan Created', date: plan.created_at },
    {
      key: 'quotation',
      label: 'Quotation Approved',
      date: quotation?.status === 'approved' ? quotation.updated_at : null,
    },
    { key: 'booking', label: 'Booking Confirmed', date: plan.booking_confirmed_date },
    { key: 'documentation', label: 'Documentation', date: plan.documentation_date },
    { key: 'cargo_ready', label: 'Cargo Ready', date: plan.cargo_ready_date },
    { key: 'etd', label: `ETD${plan.origin ? ` (${plan.origin})` : ''}`, date: plan.planned_etd },
    { key: 'eta', label: `ETA${plan.destination ? ` (${plan.destination})` : ''}`, date: plan.planned_eta },
    { key: 'delivery', label: 'Delivery', date: plan.delivery_date },
  ];

  // "Current" = first stage without a date yet (everything before it is complete)
  const firstIncompleteIdx = stages.findIndex((s) => !s.date);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between px-4 py-3">
        <CardTitle className="text-lg font-semibold">Timeline & Milestones</CardTitle>
        {onEdit && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="flex items-start overflow-x-auto pb-2">
          {stages.map((s, idx) => {
            const isComplete = !!s.date;
            const isCurrent = firstIncompleteIdx === idx;
            const isLast = idx === stages.length - 1;
            return (
              <div key={s.key} className="flex items-start">
                <div className="flex min-w-[110px] flex-col items-center gap-1.5">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      isComplete
                        ? 'border-green-500 bg-green-500 text-white'
                        : isCurrent
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background text-muted-foreground'
                    }`}
                  >
                    {isComplete ? <Check className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-current" />}
                  </div>
                  <span className={`text-center text-xs font-medium ${isComplete ? '' : 'text-muted-foreground'}`}>
                    {s.label}
                  </span>
                  <span className="text-center text-[11px] text-muted-foreground">
                    {s.date ? formatDate(s.date) : '—'}
                  </span>
                </div>
                {!isLast && (
                  <div className={`mx-1 mt-4 h-0.5 w-8 shrink-0 ${isComplete ? 'bg-green-300' : 'bg-border'}`} />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
