'use client';

import { Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';
import { useEmployeeWizard, type EmployeeWizardStep } from '@/shared/lib/employee-wizard';
import { EmployeePersonalSection } from '@/features/hr/components/employee-personal-section';
import { EmployeeEmploymentSection, type ManagerOption } from '@/features/hr/components/employee-employment-section';
import { EmployeeResponsibilitiesSection } from '@/features/hr/components/employee-responsibilities-section';
import { EmployeeManifestAccessSection } from '@/features/hr/components/employee-manifest-access-section';
import { EmployeeSensitiveInfoSection } from '@/features/hr/components/employee-sensitive-info-section';
import { EmployeeReviewSection } from '@/features/hr/components/employee-review-section';
import type { Branch, Department, Profile } from '@/shared/types';

interface EmployeeWizardShellProps {
  departments: Department[];
  branches: Branch[];
  managers: ManagerOption[];
  availableProfiles: Profile[];
  canViewSensitive: boolean;
  /** Rendered as the primary action on the last step in place of Next —
   *  a real submit button (type="submit"), inside the page's own
   *  <form>. Keeping Save inside the wizard, only on the last step,
   *  avoids the exact bug this session already hit once with the
   *  quotation form: a submit attempt from an earlier step still runs
   *  full-schema validation, but the resulting errors render on fields
   *  not currently on screen — a silent-looking failure. */
  submitting: boolean;
  submitLabel?: string;
}

/** The one guided-wizard shell Add Employee mounts, copying
 *  components/quotations/quotation-wizard-shell.tsx's exact shape:
 *  stays inside the page's single FormProvider, only what's rendered
 *  changes per step. Step count varies (5 or 6) depending on whether
 *  the caller can view Sensitive Info — see lib/employee-wizard.ts. */
export function EmployeeWizardShell({ submitting, submitLabel = 'Save Employee', ...props }: EmployeeWizardShellProps) {
  const wizard = useEmployeeWizard(props.canViewSensitive);

  return (
    <div className="space-y-6">
      <WizardStepper
        steps={wizard.steps}
        activeIndex={wizard.stepIndex}
        percent={wizard.progressPercent}
        onJump={wizard.goToStep}
      />

      <div className="min-h-[320px] space-y-6">
        <WizardStepPanel stepId={wizard.currentStep.id} {...props} />
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={wizard.goBack} disabled={wizard.isFirst}>
          <ChevronLeft className="mr-1.5 h-4 w-4" />
          Back
        </Button>
        {wizard.isLast ? (
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        ) : (
          <Button type="button" onClick={wizard.goNext}>
            Next
            <ChevronRight className="ml-1.5 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function WizardStepper({
  steps,
  activeIndex,
  percent,
  onJump,
}: {
  steps: EmployeeWizardStep[];
  activeIndex: number;
  percent: number;
  onJump: (index: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Step {activeIndex + 1} of {steps.length}
        </span>
        <span className="font-medium text-foreground">{percent}% Complete</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
      <div className={cn('grid gap-1.5', steps.length === 6 ? 'grid-cols-6' : 'grid-cols-5')}>
        {steps.map((step, index) => {
          const isActive = index === activeIndex;
          const isDone = index < activeIndex;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onJump(index)}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 text-center text-[10px] font-medium leading-tight transition-colors sm:flex-row sm:gap-1.5 sm:rounded-full sm:px-2 sm:text-[11px]',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : isDone
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent/50'
              )}
            >
              {isDone ? <Check className="h-3.5 w-3.5" /> : <span>{index + 1}</span>}
              {step.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WizardStepPanel({
  stepId,
  departments,
  branches,
  managers,
  availableProfiles,
}: Omit<EmployeeWizardShellProps, 'submitting' | 'submitLabel'> & { stepId: string }) {
  switch (stepId) {
    case 'personal':
      return <EmployeePersonalSection />;
    case 'employment':
      return <EmployeeEmploymentSection departments={departments} branches={branches} managers={managers} />;
    case 'responsibilities':
      return <EmployeeResponsibilitiesSection />;
    case 'access':
      return <EmployeeManifestAccessSection availableProfiles={availableProfiles} />;
    case 'sensitive':
      return <EmployeeSensitiveInfoSection />;
    case 'review':
      return <EmployeeReviewSection />;
    default:
      return null;
  }
}
