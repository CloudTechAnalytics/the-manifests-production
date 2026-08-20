'use client';

import { Controller, useFormContext } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { EmployeeFormValues } from '@/lib/employee-schema';
import type { Branch, Department } from '@/types';

export interface ManagerOption {
  id: string;
  full_name: string;
  job_title: string;
}

interface EmployeeEmploymentSectionProps {
  departments: Department[];
  branches: Branch[];
  managers: ManagerOption[];
}

/** Step 2 — Employment. Where this employee sits in the organization
 *  and their employment terms. `department_id` here is a label only
 *  (migration 062's invariant) — branch_id and manager_id are what
 *  actually gate access. */
export function EmployeeEmploymentSection({ departments, branches, managers }: EmployeeEmploymentSectionProps) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<EmployeeFormValues>();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Employment</CardTitle>
        <CardDescription>Where this employee sits in the organization, and their employment terms.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="employee_number">
              Employee Number <span className="text-destructive">*</span>
            </Label>
            <Input id="employee_number" placeholder="EMP-0001" {...register('employee_number')} />
            {errors.employee_number && <p className="text-xs text-destructive">{errors.employee_number.message}</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="job_title">
              Job Title <span className="text-destructive">*</span>
            </Label>
            <Input id="job_title" placeholder="Operations Supervisor" {...register('job_title')} />
            {errors.job_title && <p className="text-xs text-destructive">{errors.job_title.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="branch_id">Branch</Label>
            <Controller
              control={control}
              name="branch_id"
              render={({ field }) => (
                <Select value={field.value || ''} onValueChange={field.onChange}>
                  <SelectTrigger id="branch_id">
                    <SelectValue placeholder="Org-wide (no branch)" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="department_id">Department</Label>
            <Controller
              control={control}
              name="department_id"
              render={({ field }) => (
                <Select value={field.value || ''} onValueChange={field.onChange}>
                  <SelectTrigger id="department_id">
                    <SelectValue placeholder="No department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="manager_id">Manager</Label>
            <Controller
              control={control}
              name="manager_id"
              render={({ field }) => (
                <Select value={field.value || ''} onValueChange={field.onChange}>
                  <SelectTrigger id="manager_id">
                    <SelectValue placeholder="No manager" />
                  </SelectTrigger>
                  <SelectContent>
                    {managers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.full_name} — {m.job_title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="employment_type">Employment Type</Label>
            <Controller
              control={control}
              name="employment_type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="employment_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full_time">Full-time</SelectItem>
                    <SelectItem value="part_time">Part-time</SelectItem>
                    <SelectItem value="contract">Contract</SelectItem>
                    <SelectItem value="intern">Intern</SelectItem>
                    <SelectItem value="temporary">Temporary</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="employment_status">Employment Status</Label>
            <Controller
              control={control}
              name="employment_status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="employment_status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="on_leave">On Leave</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="terminated">Terminated</SelectItem>
                    <SelectItem value="resigned">Resigned</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="work_location">Work Location</Label>
            <Input id="work_location" placeholder="Lagos HQ — Warehouse" {...register('work_location')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hire_date">
              Hire Date <span className="text-destructive">*</span>
            </Label>
            <Input id="hire_date" type="date" {...register('hire_date')} />
            {errors.hire_date && <p className="text-xs text-destructive">{errors.hire_date.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmation_date">Confirmation Date</Label>
            <Input id="confirmation_date" type="date" {...register('confirmation_date')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contract_end_date">Contract End Date</Label>
            <Input id="contract_end_date" type="date" {...register('contract_end_date')} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
