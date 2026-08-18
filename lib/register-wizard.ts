'use client';

import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { RegisterFormValues } from '@/lib/register-schema';

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

export function useRegisterWizard() {
  const [stepIndex, setStepIndex] = useState(0);
  const { trigger } = useFormContext<RegisterFormValues>();
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
