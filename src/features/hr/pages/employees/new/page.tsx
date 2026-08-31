'use client';

import { useNavigate, Link } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, UserPlus } from 'lucide-react';
import { getErrorMessage } from '@/shared/lib/utils';
import { useAuth } from '@/shared/contexts/auth-context';
import { EMPLOYEE_FORM_DEFAULTS, employeeSchema, type EmployeeFormValues } from '@/shared/lib/employee-schema';
import { createEmployee, fetchEmployeeFormOptions } from '@/features/hr/services/employees.service';
import { EmployeeWizardShell } from '@/features/hr/components/employee-wizard-shell';
import type { ManagerOption } from '@/features/hr/components/employee-employment-section';
import { Button } from '@/shared/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/components/ui/breadcrumb';

export default function NewEmployeePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, hasRole } = useAuth();
  const canViewSensitive = hasRole('admin') || hasRole('hr_manager');

  const methods = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: { ...EMPLOYEE_FORM_DEFAULTS, branch_id: profile?.branch_id ?? '' },
  });

  const { data: options, isLoading: loadingOptions } = useQuery({
    queryKey: ['hr-employee-form-options'],
    queryFn: fetchEmployeeFormOptions,
  });

  const createMutation = useMutation({
    mutationFn: (values: EmployeeFormValues) => {
      if (!profile?.organization_id) {
        throw new Error('No organization found for your account.');
      }
      return createEmployee({
        values,
        organizationId: profile.organization_id,
        createdBy: profile.id,
        canViewSensitive,
        fallbackBranchId: profile.branch_id ?? options?.branches[0]?.id ?? null,
      });
    },
    onSuccess: ({ employeeId, warnings }) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      warnings.forEach((w) => toast.warning(w));
      toast.success('Employee added successfully');
      navigate(`/hr/employees/${employeeId}`);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to create employee'));
    },
  });

  const onSubmit = async (values: EmployeeFormValues) => {
    if (!profile?.organization_id) {
      toast.error('No organization found for your account.');
      return;
    }
    createMutation.mutate(values);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 lg:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/hr/employees">Employees</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New Employee</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <Link to="/hr/employees">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <UserPlus className="h-6 w-6 text-blue-600" />
            New Employee
          </h1>
          <p className="text-sm text-muted-foreground">Add a person to HR — with or without Manifest access.</p>
        </div>
      </div>

      {loadingOptions ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading…
        </div>
      ) : (
        <FormProvider {...methods}>
          <form onSubmit={methods.handleSubmit(onSubmit)} className="space-y-6">
            <EmployeeWizardShell
              departments={options?.departments ?? []}
              branches={options?.branches ?? []}
              managers={(options?.managers ?? []).map((m) => ({
                id: m.id,
                full_name: `${m.first_name} ${m.last_name}`,
                job_title: m.job_title,
              })) satisfies ManagerOption[]}
              availableProfiles={options?.profiles ?? []}
              canViewSensitive={canViewSensitive}
              submitting={createMutation.isPending}
              submitLabel="Save Employee"
            />
          </form>
        </FormProvider>
      )}
    </div>
  );
}
