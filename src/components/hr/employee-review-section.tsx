'use client';

import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { EmployeeFormValues } from '@/lib/employee-schema';

/** Step 6 — Review. Final summary before submit. */
export function EmployeeReviewSection() {
  const { register, watch } = useFormContext<EmployeeFormValues>();
  const values = watch();
  const primary = values.responsibilities.find((r) => r.is_primary) ?? values.responsibilities[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Review</CardTitle>
        <CardDescription>Confirm everything looks right before saving.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium">
              {values.first_name} {values.last_name}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Job Title</dt>
            <dd className="font-medium">{values.job_title || '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Employee Number</dt>
            <dd className="font-medium">{values.employee_number || '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Employment</dt>
            <dd className="font-medium capitalize">
              {values.employment_type.replace('_', ' ')} · {values.employment_status.replace('_', ' ')}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Primary Responsibility</dt>
            <dd className="font-medium">{primary?.role_title || 'None set'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Manifest Access</dt>
            <dd className="font-medium">
              {values.has_manifest_access ? 'Linked to a system login' : 'No login (HR record only)'}
            </dd>
          </div>
        </dl>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" rows={3} placeholder="Anything else HR should know about this employee…" {...register('notes')} />
        </div>
      </CardContent>
    </Card>
  );
}
