'use client';

import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, Edit, Loader2 } from 'lucide-react';
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
import type { Branch, Department, Employee, EmployeeResponsibility, EmployeeSensitiveInfo, Profile } from '@/shared/types';

export default function EditEmployeePage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, hasRole } = useAuth();
  const canViewSensitive = hasRole('admin') || hasRole('hr_manager');

  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [availableProfiles, setAvailableProfiles] = useState<Profile[]>([]);
  const [existingResponsibilityIds, setExistingResponsibilityIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [employeeName, setEmployeeName] = useState('');

  const methods = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: EMPLOYEE_FORM_DEFAULTS,
  });

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      const employeeId = params.id;

      const [employeeRes, respRes, sensitiveRes, deptRes, branchRes, empRes, profileRes, linkedRes] =
        await Promise.all([
          supabase.from('employees').select('*').eq('id', employeeId).maybeSingle(),
          supabase.from('employee_responsibilities').select('*').eq('employee_id', employeeId).is('deleted_at', null),
          supabase.from('employee_sensitive_info').select('*').eq('employee_id', employeeId).maybeSingle(),
          supabase.from('departments').select('*').eq('is_active', true).is('deleted_at', null).order('sort_order'),
          supabase.from('branches').select('*').eq('is_active', true).is('deleted_at', null).order('name'),
          supabase
            .from('employees')
            .select('id, first_name, last_name, job_title')
            .is('deleted_at', null)
            .eq('employment_status', 'active')
            .neq('id', employeeId)
            .order('first_name'),
          supabase.from('profiles').select('*, branch:branches(*)').eq('is_active', true).is('deleted_at', null).order('full_name'),
          supabase.from('employees').select('profile_id').is('deleted_at', null).not('profile_id', 'is', null).neq('id', employeeId),
        ]);

      if (!isMounted) return;

      const employee = employeeRes.data as Employee | null;
      if (employeeRes.error || !employee) {
        toast.error('Employee not found, or you do not have access to it.');
        setLoading(false);
        return;
      }
      const responsibilities = (respRes.data as EmployeeResponsibility[]) ?? [];
      const sensitive = sensitiveRes.data as EmployeeSensitiveInfo | null;

      setDepartments((deptRes.data as Department[]) ?? []);
      setBranches((branchRes.data as Branch[]) ?? []);
      setManagers(
        ((empRes.data as { id: string; first_name: string; last_name: string; job_title: string }[]) ?? []).map((e) => ({
          id: e.id,
          full_name: `${e.first_name} ${e.last_name}`,
          job_title: e.job_title,
        }))
      );
      const linkedProfileIds = new Set(((linkedRes.data as { profile_id: string }[]) ?? []).map((r) => r.profile_id));
      const profiles = ((profileRes.data as Profile[]) ?? []).filter(
        (p) => !linkedProfileIds.has(p.id) || p.id === employee.profile_id
      );
      setAvailableProfiles(profiles);
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

      setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
    // methods.reset is stable across renders (react-hook-form) — safe to
    // omit from deps without re-fetching in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const onSubmit = async (values: EmployeeFormValues) => {
    if (!profile) return;
    const employeeId = params.id;
    setSubmitting(true);
    try {
      const { error: employeeError } = await supabase
        .from('employees')
        .update({
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
          updated_by: profile.id,
        })
        .eq('id', employeeId);

      if (employeeError) throw new Error(employeeError.message);

      // Responsibilities: simplest correct approach for Phase 1 — replace
      // the set entirely (soft-delete anything removed, upsert the rest).
      const keepIds = new Set(values.responsibilities.map((r) => r.id).filter(Boolean));
      const removedIds = existingResponsibilityIds.filter((id) => !keepIds.has(id));
      if (removedIds.length > 0) {
        await supabase.from('employee_responsibilities').update({ deleted_at: new Date().toISOString() }).in('id', removedIds);
      }
      for (const r of values.responsibilities) {
        if (r.id) {
          await supabase
            .from('employee_responsibilities')
            .update({ role_title: r.role_title, linked_role: r.linked_role || null, is_primary: r.is_primary, start_date: r.start_date })
            .eq('id', r.id);
        } else {
          await supabase.from('employee_responsibilities').insert({
            employee_id: employeeId,
            role_title: r.role_title,
            linked_role: r.linked_role || null,
            is_primary: r.is_primary,
            start_date: r.start_date,
            created_by: profile.id,
          });
        }
      }

      if (canViewSensitive) {
        const { error: sensitiveError } = await supabase.from('employee_sensitive_info').upsert(
          {
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
            updated_by: profile.id,
          },
          { onConflict: 'employee_id' }
        );
        if (sensitiveError) console.error('Sensitive info update error:', sensitiveError);
      }

      await supabase.from('activities').insert({
        user_id: profile.id,
        branch_id: values.branch_id || profile.branch_id || (branches[0]?.id ?? null),
        action: 'employee.updated',
        entity_type: 'employee',
        entity_id: employeeId,
        description: `Updated employee "${values.first_name} ${values.last_name}"`,
        metadata: { employee_number: values.employee_number },
      });

      toast.success('Employee updated');
      navigate(`/hr/employees/${employeeId}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update employee'));
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
              departments={departments}
              branches={branches}
              managers={managers}
              availableProfiles={availableProfiles}
              canViewSensitive={canViewSensitive}
              submitting={submitting}
              submitLabel="Save Changes"
            />
          </form>
        </FormProvider>
      )}
    </div>
  );
}
