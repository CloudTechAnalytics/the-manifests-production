'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import { getErrorMessage } from '@/shared/lib/utils';
import {
  ASSIGN_TRAINING_DEFAULTS,
  assignTrainingSchema,
  type AssignTrainingFormValues,
} from '@/shared/lib/training-assignment-schema';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/shared/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import type { AssignTrainingResult, Branch, Department } from '@/shared/types';

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'operations', label: 'Operations' },
  { value: 'sales', label: 'Sales' },
  { value: 'finance', label: 'Finance' },
  { value: 'customs', label: 'Customs' },
  { value: 'planning', label: 'Planning' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'terminal', label: 'Terminal' },
  { value: 'examination', label: 'Examination' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'transport', label: 'Transport' },
];

interface EmployeeOption {
  id: string;
  full_name: string;
}

interface AssignTrainingDialogProps {
  courseId: string;
  employees: EmployeeOption[];
  departments: Department[];
  branches: Branch[];
  onAssigned: (result: AssignTrainingResult) => void;
}

/**
 * Resolves whichever target_mode was picked into a plain employee id
 * array client-side, then makes ONE assign_training() RPC call — the
 * RPC itself stays target-shape-agnostic (migration 091), so its
 * authorization logic (can_manage_hr per employee) is uniform
 * regardless of how the UI picked the targets.
 */
export function AssignTrainingDialog({ courseId, employees, departments, branches, onAssigned }: AssignTrainingDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<AssignTrainingFormValues>({
    resolver: zodResolver(assignTrainingSchema),
    defaultValues: ASSIGN_TRAINING_DEFAULTS,
  });

  const targetMode = watch('target_mode');

  const resolveEmployeeIds = async (values: AssignTrainingFormValues): Promise<string[]> => {
    switch (values.target_mode) {
      case 'employee':
        return values.employee_id ? [values.employee_id] : [];
      case 'role': {
        const { data, error } = await supabase
          .from('employee_responsibilities')
          .select('employee_id')
          .eq('linked_role', values.role)
          .is('deleted_at', null)
          .is('end_date', null);
        if (error) throw new Error(error.message);
        return Array.from(new Set((data ?? []).map((r: { employee_id: string }) => r.employee_id)));
      }
      case 'department': {
        const { data, error } = await supabase
          .from('employees')
          .select('id')
          .eq('department_id', values.department_id)
          .is('deleted_at', null);
        if (error) throw new Error(error.message);
        return (data ?? []).map((e: { id: string }) => e.id);
      }
      case 'branch': {
        const { data, error } = await supabase
          .from('employees')
          .select('id')
          .eq('branch_id', values.branch_id)
          .is('deleted_at', null);
        if (error) throw new Error(error.message);
        return (data ?? []).map((e: { id: string }) => e.id);
      }
      default:
        return [];
    }
  };

  const onSubmit = async (values: AssignTrainingFormValues) => {
    setSubmitting(true);
    try {
      const employeeIds = await resolveEmployeeIds(values);
      if (employeeIds.length === 0) {
        toast.warning('No employees match that target.');
        return;
      }
      const { data, error } = await supabase.rpc('assign_training', {
        p_course_id: courseId,
        p_employee_ids: employeeIds,
        p_due_date: values.due_date || null,
      });
      if (error) throw new Error(error.message);

      const result = data as AssignTrainingResult;
      const parts = [`${result.assigned_count} assigned`];
      if (result.already_assigned_count > 0) parts.push(`${result.already_assigned_count} already assigned`);
      if (result.denied_count > 0) parts.push(`${result.denied_count} outside your branch`);
      if (result.skipped_no_login_count > 0) parts.push(`${result.skipped_no_login_count} with no Manifest login`);
      toast.success(parts.join(' · '));

      onAssigned(result);
      setOpen(false);
      reset(ASSIGN_TRAINING_DEFAULTS);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to assign training'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Send className="mr-1.5 h-4 w-4" />
          Assign
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign Training</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-3">
              <Label>Assign to</Label>
              <Controller
                control={control}
                name="target_mode"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">One employee</SelectItem>
                      <SelectItem value="role">Everyone in a role</SelectItem>
                      <SelectItem value="department">Everyone in a department</SelectItem>
                      <SelectItem value="branch">Everyone in a branch</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {targetMode === 'employee' && (
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="employee_id">Employee</Label>
                <Controller
                  control={control}
                  name="employee_id"
                  render={({ field }) => (
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <SelectTrigger id="employee_id">
                        <SelectValue placeholder="Select an employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.employee_id && <p className="text-xs text-destructive">{errors.employee_id.message}</p>}
              </div>
            )}

            {targetMode === 'role' && (
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="role">Role</Label>
                <Controller
                  control={control}
                  name="role"
                  render={({ field }) => (
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <SelectTrigger id="role">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            )}

            {targetMode === 'department' && (
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="department_id">Department</Label>
                <Controller
                  control={control}
                  name="department_id"
                  render={({ field }) => (
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <SelectTrigger id="department_id">
                        <SelectValue placeholder="Select a department" />
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
            )}

            {targetMode === 'branch' && (
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="branch_id">Branch</Label>
                <Controller
                  control={control}
                  name="branch_id"
                  render={({ field }) => (
                    <Select value={field.value || ''} onValueChange={field.onChange}>
                      <SelectTrigger id="branch_id">
                        <SelectValue placeholder="Select a branch" />
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
            )}

            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="due_date">Due Date (optional)</Label>
              <Input id="due_date" type="date" {...register('due_date')} />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Assign
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
