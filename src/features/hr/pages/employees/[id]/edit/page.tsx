'use client';

import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Edit, Loader2 } from 'lucide-react';
import { getErrorMessage } from '@/shared/lib/utils';
import { useAuth } from '@/shared/contexts/auth-context';
import { EMPLOYEE_FORM_DEFAULTS, employeeSchema, type EmployeeFormValues } from '@/shared/lib/employee-schema';
import { fetchEmployeeEditData, updateEmployee } from '@/features/hr/services/employees.service';
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

export default function EditEmployeePage() {
  const params = useParams<{ id: string }>();
  const employeeId = params.id as string;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, hasRole } = useAuth();
  const canViewSensitive = hasRole('admin') || hasRole('hr_manager');

  const [existingResponsibilityIds, setExistingResponsibilityIds] = useState<string[]>([]);
  const [employeeName, setEmployeeName] = useState('');

  const methods = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: EMPLOYEE_FORM_DEFAULTS,
  });

  const { data, isLoading: loading } = useQuery({
    queryKey: ['employees', employeeId, 'edit-form'],
    queryFn: () => fetchEmployeeEditData(employeeId),
    enabled: !!employeeId,
  });

  useEffect(() => {
    if (!data) return;
    const { employee, responsibilities, sensitive } = data;

    setExistingResponsibilityIds(responsibilities.map((r) => r.id));
    setEmployeeName(`${employee.first_name} ${employee.last_name}`);

    methods.reset({
      ...EMPLOYEE_FORM_DEFAULTS,
      first_name: employee.first_name,
      last_name: employee.last_name,
      date_of_birth: employee.date_of_birth ?? '',
      gender: employee.gender ?? '',
      personal_email: employee.personal_email ?? '',
      personal_phone: employee.personal_phone ?? '',
      address: employee.address ?? '',
      employee_number: employee.employee_number,
      job_title: employee.job_title,
      department_id: employee.department_id ?? '',
      manager_id: employee.manager_id ?? '',
      branch_id: employee.branch_id ?? '',
      employment_type: employee.employment_type,
      employment_status: employee.employment_status,
      hire_date: employee.hire_date,
      confirmation_date: employee.confirmation_date ?? '',
      contract_end_date: employee.contract_end_date ?? '',
      work_location: employee.work_location ?? '',
      responsibilities: responsibilities.map((r) => ({
        id: r.id,
        role_title: r.role_title,
        linked_role: r.linked_role ?? '',
        is_primary: r.is_primary,
        start_date: r.start_date,
      })),
      has_manifest_access: !!employee.profile_id,
      profile_id: employee.profile_id ?? '',
      salary_amount: sensitive?.salary_amount ?? undefined,
      salary_currency: sensitive?.salary_currency ?? 'NGN',
      pay_frequency: sensitive?.pay_frequency ?? '',
      bank_name: sensitive?.bank_name ?? '',
      bank_account_name: sensitive?.bank_account_name ?? '',
      bank_account_number: sensitive?.bank_account_number ?? '',
      tax_id: sensitive?.tax_id ?? '',
      national_id_number: sensitive?.national_id_number ?? '',
      emergency_contact_name: sensitive?.emergency_contact_name ?? '',
      emergency_contact_relationship: sensitive?.emergency_contact_relationship ?? '',
      emergency_contact_phone: sensitive?.emergency_contact_phone ?? '',
      private_notes: sensitive?.private_notes ?? '',
      notes: employee.notes ?? '',
    });
    // methods.reset is stable across renders (react-hook-form) — safe to
    // omit from deps without re-running in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    if (data === null) {
      toast.error('Employee not found, or you do not have access to it.');
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (values: EmployeeFormValues) => {
      if (!profile) throw new Error('Not signed in');
      return updateEmployee({
        employeeId,
        values,
        updatedBy: profile.id,
        existingResponsibilityIds,
        canViewSensitive,
        fallbackBranchId: profile.branch_id ?? data?.branches[0]?.id ?? null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Employee updated');
      navigate(`/hr/employees/${employeeId}`);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, 'Failed to update employee'));
    },
  });

  const onSubmit = async (values: EmployeeFormValues) => {
    if (!profile) return;
    updateMutation.mutate(values);
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
            <BreadcrumbPage>Edit {employeeName || 'Employee'}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <Link to={`/hr/employees/${params.id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <Edit className="h-6 w-6 text-blue-600" />
            Edit {employeeName || 'Employee'}
          </h1>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading…
        </div>
      ) : (
        <FormProvider {...methods}>
          <form onSubmit={methods.handleSubmit(onSubmit)} className="space-y-6">
            <EmployeeWizardShell
              departments={data?.departments ?? []}
              branches={data?.branches ?? []}
              managers={(data?.managers ?? []).map((m) => ({
                id: m.id,
                full_name: `${m.first_name} ${m.last_name}`,
                job_title: m.job_title,
              })) satisfies ManagerOption[]}
              availableProfiles={data?.profiles ?? []}
              canViewSensitive={canViewSensitive}
              submitting={updateMutation.isPending}
              submitLabel="Save Changes"
            />
          </form>
        </FormProvider>
      )}
    </div>
  );
}
