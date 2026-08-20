'use client';

import { useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import type { EmployeeFormValues } from '@/lib/employee-schema';

export type EmployeeWizardStepId =
  | 'personal'
  | 'employment'
  | 'responsibilities'
  | 'access'
  | 'sensitive'
  | 'review';

export interface EmployeeWizardStep {
  id: EmployeeWizardStepId;
  label: string;
}

export const EMPLOYEE_WIZARD_STEPS: EmployeeWizardStep[] = [
  { id: 'personal', label: 'Personal' },
  { id: 'employment', label: 'Employment' },
  { id: 'responsibilities', label: 'Responsibilities' },
  { id: 'access', label: 'Manifest Access' },
  { id: 'sensitive', label: 'Sensitive Info' },
  { id: 'review', label: 'Review' },
];

/** Which form fields belong to each step — targeted trigger()
 *  validation, same pattern as WIZARD_STEP_FIELDS in
 *  lib/quotation-wizard.ts. */
export const EMPLOYEE_WIZARD_STEP_FIELDS: Record<EmployeeWizardStepId, (keyof EmployeeFormValues)[]> = {
  personal: ['first_name', 'last_name', 'date_of_birth', 'gender', 'personal_email', 'personal_phone', 'address'],
  employment: [
    'employee_number',
    'job_title',
    'department_id',
    'manager_id',
    'branch_id',
    'employment_type',
    'employment_status',
    'hire_date',
    'confirmation_date',
    'contract_end_date',
    'work_location',
  ],
  responsibilities: ['responsibilities'],
  access: ['has_manifest_access', 'profile_id'],
  sensitive: [
    'salary_amount',
    'salary_currency',
    'pay_frequency',
    'bank_name',
    'bank_account_name',
    'bank_account_number',
    'tax_id',
    'national_id_number',
    'emergency_contact_name',
    'emergency_contact_relationship',
    'emergency_contact_phone',
    'private_notes',
  ],
  review: ['notes'],
};

/**
 * Mirrors useQuotationWizard() exactly — per-step trigger() validation,
 * not whole-form. One addition: an hr_officer never sees the Sensitive
 * Info step at all. That's UI convenience only, not the real boundary —
 * can_view_hr_sensitive() (migration 085) would reject the write either
 * way even if this were bypassed.
 */
export function useEmployeeWizard(canViewSensitive: boolean) {
  const visibleSteps = useMemo(
    () => (canViewSensitive ? EMPLOYEE_WIZARD_STEPS : EMPLOYEE_WIZARD_STEPS.filter((s) => s.id !== 'sensitive')),
    [canViewSensitive]
  );
  const [stepIndex, setStepIndex] = useState(0);
  const { trigger } = useFormContext<EmployeeFormValues>();
  const currentStep = visibleSteps[Math.min(stepIndex, visibleSteps.length - 1)];

  const goNext = async () => {
    const ok = await trigger(EMPLOYEE_WIZARD_STEP_FIELDS[currentStep.id], { shouldFocus: true });
    if (ok) setStepIndex((i) => Math.min(i + 1, visibleSteps.length - 1));
    return ok;
  };

  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  const goToStep = (index: number) => {
    if (index >= 0 && index < visibleSteps.length) setStepIndex(index);
  };

  return {
    steps: visibleSteps,
    stepIndex,
    currentStep,
    isFirst: stepIndex === 0,
    isLast: stepIndex === visibleSteps.length - 1,
    progressPercent: Math.round(((stepIndex + 1) / visibleSteps.length) * 100),
    goNext,
    goBack,
    goToStep,
  };
}
