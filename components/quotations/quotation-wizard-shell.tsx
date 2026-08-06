'use client';

import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { QUOTATION_WIZARD_STEPS, useQuotationWizard } from '@/lib/quotation-wizard';
import { CustomerSection } from '@/components/quotations/customer-section';
import { ShipmentInfoSection, CargoInfoSection } from '@/components/quotations/shipment-cargo-section';
import { ServicesSection } from '@/components/quotations/services-section';
import { ScopeOfServiceSection } from '@/components/quotations/scope-of-service-section';
import { ChargeBreakdownSection } from '@/components/quotations/charge-breakdown-section';
import {
  PaymentTermsSection,
  RequiredDocumentsSection,
  ValiditySection,
} from '@/components/quotations/payment-docs-validity-section';
import type { Customer, Profile } from '@/types';

interface QuotationWizardShellProps {
  customers: Customer[];
  loadingCustomers: boolean;
  salesReps: Profile[];
  branchId: string | null;
  onCustomerCreated: (customer: Customer) => void;
}

/**
 * The one guided-wizard shell both New and Edit quotation pages mount.
 * Stays inside the page's existing single FormProvider — only what's
 * rendered changes per step, so every already-live cross-section
 * reactivity (summary panel, scope of service, auto-charges) keeps
 * working exactly as it does today.
 */
export function QuotationWizardShell(props: QuotationWizardShellProps) {
  const wizard = useQuotationWizard();

  return (
    <div className="space-y-6">
      <WizardStepper
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
        {!wizard.isLast && (
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
  activeIndex,
  percent,
  onJump,
}: {
  activeIndex: number;
  percent: number;
  onJump: (index: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Step {activeIndex + 1} of {QUOTATION_WIZARD_STEPS.length}
        </span>
        <span className="font-medium text-foreground">{percent}% Complete</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex flex-wrap gap-2">
        {QUOTATION_WIZARD_STEPS.map((step, index) => {
          const isActive = index === activeIndex;
          const isDone = index < activeIndex;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onJump(index)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
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
  customers,
  loadingCustomers,
  salesReps,
  branchId,
  onCustomerCreated,
}: QuotationWizardShellProps & { stepId: string }) {
  switch (stepId) {
    case 'customer':
      return (
        <CustomerSection
          customers={customers}
          loadingCustomers={loadingCustomers}
          salesReps={salesReps}
          branchId={branchId}
          onCustomerCreated={onCustomerCreated}
        />
      );
    case 'shipment':
      return <ShipmentInfoSection />;
    case 'cargo':
      return <CargoInfoSection />;
    case 'services':
      return (
        <>
          <ServicesSection />
          <ScopeOfServiceSection />
        </>
      );
    case 'charges':
      return <ChargeBreakdownSection />;
    case 'documents':
      return <RequiredDocumentsSection />;
    case 'payment':
      return <PaymentTermsSection />;
    case 'review':
      return <ValiditySection />;
    default:
      return null;
  }
}
