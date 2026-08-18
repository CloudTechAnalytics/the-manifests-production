'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { REGISTER_JOURNEY_STAGES } from '@/lib/register-wizard';

/**
 * The full 5-stage journey (Business / Account / Verification / Setup /
 * Complete) — spec section 26. Only stages 1-2 are steps within this page;
 * 3-5 happen in later sessions (an emailed link, then a later login), so
 * this is a read-only "where you are in the whole journey" indicator, not
 * a jumpable stepper like WizardStepper in quotation-wizard-shell.tsx.
 */
export function RegisterProgress({ currentStage }: { currentStage: number }) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {REGISTER_JOURNEY_STAGES.map((label, i) => {
        const stage = i + 1;
        const isActive = stage === currentStage;
        const isDone = stage < currentStage;
        return (
          <div key={label} className="flex flex-col items-center gap-1.5 text-center">
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : isDone
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground'
              )}
            >
              {isDone ? <Check className="h-3.5 w-3.5" /> : stage}
            </div>
            <span
              className={cn(
                'text-[10px] font-medium leading-tight',
                isActive || isDone ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
