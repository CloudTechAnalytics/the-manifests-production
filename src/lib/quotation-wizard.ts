'use client';

import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { QuotationFormValues } from '@/lib/quotation-schema';

export type QuotationWizardStepId =
  | 'customer'
  | 'shipment'
  | 'cargo'
  | 'services'
  | 'charges'
  | 'documents'
  | 'payment'
  | 'review';

export interface QuotationWizardStep {
  id: QuotationWizardStepId;
  label: string;
}

export const QUOTATION_WIZARD_STEPS: QuotationWizardStep[] = [
  { id: 'customer', label: 'Customer' },
  { id: 'shipment', label: 'Shipment' },
  { id: 'cargo', label: 'Cargo' },
  { id: 'services', label: 'Services' },
  { id: 'charges', label: 'Charges' },
  { id: 'documents', label: 'Required Documents' },
  { id: 'payment', label: 'Payment Terms' },
  { id: 'review', label: 'Review & Send' },
];

/**
 * Which form fields belong to each step — used to run targeted
 * validation (RHF's trigger()) before advancing, so a user can't skip
 * past a step with an invalid required field, without re-validating
 * the whole form on every click.
 */
export const WIZARD_STEP_FIELDS: Record<QuotationWizardStepId, (keyof QuotationFormValues)[]> = {
  customer: ['customer_id', 'contact_person', 'contact_email', 'contact_phone', 'sales_rep_id'],
  shipment: [
    'shipment_direction',
    'shipment_type',
    'cargo_type',
    'incoterm',
    'currency',
    'origin_country',
    'origin_port',
    'destination_country',
    'destination_port',
    'expected_shipping_date',
    'expected_arrival_date',
  ],
  cargo: [
    'commodity_description',
    'hs_code',
    'container_count',
    'container_size',
    'weight',
    'weight_unit',
    'cbm',
    'packages_count',
    'package_type',
    'dangerous_cargo',
    'temperature_controlled',
    'cargo_value',
  ],
  services: ['services', 'excluded_services'],
  charges: ['items'],
  documents: ['required_documents'],
  payment: ['payment_terms', 'payment_method'],
  review: ['valid_until', 'priority', 'notes', 'customer_notes', 'terms'],
};

/**
 * Step position — how far through the wizard the user is. Deliberately
 * a different metric from computeQuotationCompleteness() (field-fill
 * weighting, shown in the summary panel) — both are shown, answering
 * different questions.
 */
export function useQuotationWizard() {
  const [stepIndex, setStepIndex] = useState(0);
  const { trigger } = useFormContext<QuotationFormValues>();
  const currentStep = QUOTATION_WIZARD_STEPS[stepIndex];

  const goNext = async () => {
    const ok = await trigger(WIZARD_STEP_FIELDS[currentStep.id], { shouldFocus: true });
    if (ok) setStepIndex((i) => Math.min(i + 1, QUOTATION_WIZARD_STEPS.length - 1));
    return ok;
  };

  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  const goToStep = (index: number) => {
    if (index >= 0 && index < QUOTATION_WIZARD_STEPS.length) setStepIndex(index);
  };

  return {
    stepIndex,
    currentStep,
    isFirst: stepIndex === 0,
    isLast: stepIndex === QUOTATION_WIZARD_STEPS.length - 1,
    progressPercent: Math.round(((stepIndex + 1) / QUOTATION_WIZARD_STEPS.length) * 100),
    goNext,
    goBack,
    goToStep,
  };
}
