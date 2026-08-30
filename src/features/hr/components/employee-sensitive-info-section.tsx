'use client';

import { useFormContext } from 'react-hook-form';
import { ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import type { EmployeeFormValues } from '@/shared/lib/employee-schema';

/** Step 5 — Sensitive Info. Salary, bank, tax id, emergency contact,
 *  private notes — stored in employee_sensitive_info (migration 085),
 *  which hr_officer's RLS never grants read/write on. This step isn't
 *  even shown to an hr_officer (see lib/employee-wizard.ts), but the
 *  real boundary is the database, not this component's visibility. */
export function EmployeeSensitiveInfoSection() {
  const { register } = useFormContext<EmployeeFormValues>();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          Sensitive Info
        </CardTitle>
        <CardDescription>
          Salary, bank, and emergency contact details — restricted to HR Administrators and HR Managers only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="salary_amount">Salary Amount</Label>
            <Input id="salary_amount" type="number" min={0} step="0.01" {...register('salary_amount')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="salary_currency">Currency</Label>
            <Input id="salary_currency" {...register('salary_currency')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay_frequency">Pay Frequency</Label>
            <Input id="pay_frequency" placeholder="Monthly" {...register('pay_frequency')} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="bank_name">Bank Name</Label>
            <Input id="bank_name" {...register('bank_name')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bank_account_name">Account Name</Label>
            <Input id="bank_account_name" {...register('bank_account_name')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bank_account_number">Account Number</Label>
            <Input id="bank_account_number" {...register('bank_account_number')} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="tax_id">Tax ID</Label>
            <Input id="tax_id" {...register('tax_id')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="national_id_number">National ID Number</Label>
            <Input id="national_id_number" {...register('national_id_number')} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="emergency_contact_name">Emergency Contact Name</Label>
            <Input id="emergency_contact_name" {...register('emergency_contact_name')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emergency_contact_relationship">Relationship</Label>
            <Input id="emergency_contact_relationship" {...register('emergency_contact_relationship')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emergency_contact_phone">Phone</Label>
            <Input id="emergency_contact_phone" {...register('emergency_contact_phone')} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="private_notes">Private HR Notes</Label>
          <Textarea
            id="private_notes"
            rows={3}
            placeholder="Visible only to HR Administrators and HR Managers…"
            {...register('private_notes')}
          />
        </div>
      </CardContent>
    </Card>
  );
}
