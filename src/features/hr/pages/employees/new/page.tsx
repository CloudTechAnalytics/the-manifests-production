'use client';

import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, UserPlus } from 'lucide-react';
import { supabase } from '@/shared/lib/supabase/client';
import { getErrorMessage } from '@/shared/lib/utils';
import { useAuth } from '@/shared/contexts/auth-context';
import { EMPLOYEE_FORM_DEFAULTS, employeeSchema, type EmployeeFormValues } from '@/shared/lib/employee-schema';
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
import type { Branch, Department, Profile } from '@/shared/types';

export default function NewEmployeePage() {
  const navigate = useNavigate();
  const { profile, hasRole } = useAuth();
  const canViewSensitive = hasRole('admin') || hasRole('hr_manager');

  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [availableProfiles, setAvailableProfiles] = useState<Profile[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const methods = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: { ...EMPLOYEE_FORM_DEFAULTS, branch_id: profile?.branch_id ?? '' },
  });

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoadingOptions(true);
      const [deptRes, branchRes, empRes, profileRes, linkedRes] = await Promise.all([
        supabase.from('departments').select('*').eq('is_active', true).is('deleted_at', null).order('sort_order'),
        supabase.from('branches').select('*').eq('is_active', true).is('deleted_at', null).order('name'),
        supabase
          .from('employees')
          .select('id, first_name, last_name, job_title')
          .is('deleted_at', null)
          .eq('employment_status', 'active')
          .order('first_name'),
        supabase.from('profiles').select('*, branch:branches(*)').eq('is_active', true).is('deleted_at', null).order('full_name'),
        supabase.from('employees').select('profile_id').is('deleted_at', null).not('profile_id', 'is', null),
      ]);
      if (!isMounted) return;

      setDepartments((deptRes.data as Department[]) ?? []);
      setBranches((branchRes.data as Branch[]) ?? []);
      setManagers(
        ((empRes.data as { id: string; first_name: string; last_name: string; job_title: string }[]) ?? []).map((e) => ({
          id: e.id,
          full_name: `${e.first_name} ${e.last_name}`,
          job_title: e.job_title,
        }))
      );

      const linkedProfileIds = new Set(
        ((linkedRes.data as { profile_id: string }[]) ?? []).map((r) => r.profile_id)
      );
      setAvailableProfiles(((profileRes.data as Profile[]) ?? []).filter((p) => !linkedProfileIds.has(p.id)));

      setLoadingOptions(false);
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const onSubmit = async (values: EmployeeFormValues) => {
    if (!profile?.organization_id) {
      toast.error('No organization found for your account.');
      return;
    }
    setSubmitting(true);
    try {
      const { data: employee, error: employeeError } = await supabase
        .from('employees')
        .insert({
          organization_id: profile.organization_id,
          branch_id: values.branch_id || null,
          profile_id: values.has_manifest_access ? values.profile_id || null : null,
          department_id: values.department_id || null,
          manager_id: values.manager_id || null,
          employee_number: values.employee_number,
          first_name: values.first_name,
          last_name: values.last_name,
          personal_email: values.personal_email || null,
          personal_phone: values.personal_phone || null,
          date_of_birth: values.date_of_birth || null,
          gender: values.gender || null,
          address: values.address || null,
          job_title: values.job_title,
          employment_type: values.employment_type,
          employment_status: values.employment_status,
          work_location: values.work_location || null,
          hire_date: values.hire_date,
          confirmation_date: values.confirmation_date || null,
          contract_end_date: values.contract_end_date || null,
          notes: values.notes || null,
          created_by: profile.id,
          updated_by: profile.id,
        })
        .select('id')
        .single();

      if (employeeError || !employee) {
        throw new Error(employeeError?.message ?? 'Failed to create employee');
      }
      const employeeId = employee.id;

      if (values.responsibilities.length > 0) {
        const { error: respError } = await supabase.from('employee_responsibilities').insert(
          values.responsibilities.map((r) => ({
            employee_id: employeeId,
            role_title: r.role_title,
            linked_role: r.linked_role || null,
            is_primary: r.is_primary,
            start_date: r.start_date,
            created_by: profile.id,
          }))
        );
        if (respError) {
          console.error('Responsibilities insert error:', respError);
          toast.warning('Employee created, but responsibilities failed to save.');
        }
      }

      if (canViewSensitive) {
        const hasSensitiveData =
          values.salary_amount !== undefined ||
          values.bank_name ||
          values.bank_account_number ||
          values.tax_id ||
          values.national_id_number ||
          values.emergency_contact_name ||
          values.private_notes;
        if (hasSensitiveData) {
          const { error: sensitiveError } = await supabase.from('employee_sensitive_info').insert({
            employee_id: employeeId,
            salary_amount: values.salary_amount ?? null,
            salary_currency: values.salary_currency || 'NGN',
            pay_frequency: values.pay_frequency || null,
            bank_name: values.bank_name || null,
            bank_account_name: values.bank_account_name || null,
            bank_account_number: values.bank_account_number || null,
            tax_id: values.tax_id || null,
            national_id_number: values.national_id_number || null,
            emergency_contact_name: values.emergency_contact_name || null,
            emergency_contact_relationship: values.emergency_contact_relationship || null,
            emergency_contact_phone: values.emergency_contact_phone || null,
            private_notes: values.private_notes || null,
            created_by: profile.id,
            updated_by: profile.id,
          });
          if (sensitiveError) {
            console.error('Sensitive info insert error:', sensitiveError);
            toast.warning('Employee created, but sensitive info failed to save.');
          }
        }
      }

      const { error: activityError } = await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: values.branch_id || profile.branch_id || (branches[0]?.id ?? null),
        action: 'employee.created',
        entity_type: 'employee',
        entity_id: employeeId,
        description: `Added employee "${values.first_name} ${values.last_name}"`,
        metadata: { employee_number: values.employee_number, job_title: values.job_title },
      });
      if (activityError) console.error('Activity log error:', activityError);

      toast.success('Employee added successfully');
      navigate(`/hr/employees/${employeeId}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create employee'));
    } finally {
      setSubmitting(false);
    }
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
              departments={departments}
              branches={branches}
              managers={managers}
              availableProfiles={availableProfiles}
              canViewSensitive={canViewSensitive}
              submitting={submitting}
              submitLabel="Save Employee"
            />
          </form>
        </FormProvider>
      )}
    </div>
  );
}
