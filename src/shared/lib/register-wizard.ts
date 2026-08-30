'use client';

import { useState } from 'react';
import type { UseFormTrigger } from 'react-hook-form';
import type { RegisterFormValues } from '@/shared/lib/register-schema';

export type RegisterWizardStepId = 'business' | 'account';

export interface RegisterWizardStep {
  id: RegisterWizardStepId;
  label: string;
}

export const REGISTER_WIZARD_STEPS: RegisterWizardStep[] = [
  { id: 'business', label: 'Business' },
  { id: 'account', label: 'Account' },
];

/**
 * The full journey shown to the user spans 5 stages (Business, Account,
 * Verification, Setup, Complete), but Verification/Setup/Complete are
 * separate sessions (an emailed link, then a later authenticated login) —
 * not steps a single form can hold state across. Only these two are real
 * react-hook-form steps; RegisterProgress (components/register) renders
 * the full 5-stage bar for context.
 */
export const REGISTER_JOURNEY_STAGES = ['Business', 'Account', 'Verification', 'Setup', 'Complete'];

export const WIZARD_STEP_FIELDS: Record<RegisterWizardStepId, (keyof RegisterFormValues)[]> = {
  business: [
    'business_name', 'business_type', 'country', 'city',
    'business_email', 'business_phone', 'registration_number', 'website',
    'expected_users', 'expected_monthly_shipments', 'referral_source',
  ],
  account: [
    'owner_first_name', 'owner_last_name', 'owner_email', 'owner_phone',
    'password', 'confirm_password', 'terms_accepted', 'privacy_accepted',
  ],
};

/**
 * Takes `trigger` as a parameter rather than reading it via
 * useFormContext() internally — this hook is called from RegisterPage,
 * the same component that owns the FormProvider, not one of its
 * descendants, so context lookup from in here would always resolve to
 * null (a provider only supplies context to its children, never back to
 * the component that renders it).
 */
export function useRegisterWizard(trigger: UseFormTrigger<RegisterFormValues>) {
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = REGISTER_WIZARD_STEPS[stepIndex];

  const goNext = async () => {
    const ok = await trigger(WIZARD_STEP_FIELDS[currentStep.id], { shouldFocus: true });
    if (ok) setStepIndex((i) => Math.min(i + 1, REGISTER_WIZARD_STEPS.length - 1));
    return ok;
  };

  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  return {
    stepIndex,
    currentStep,
    isFirst: stepIndex === 0,
    isLast: stepIndex === REGISTER_WIZARD_STEPS.length - 1,
    progressPercent: Math.round(((stepIndex + 1) / REGISTER_WIZARD_STEPS.length) * 100),
    goNext,
    goBack,
  };
}
