import { supabase } from '@/shared/lib/supabase/client';
import type { EmployeeFormValues } from '@/shared/lib/employee-schema';
import type {
  Branch,
  Department,
  Employee,
  EmployeeResponsibility,
  EmployeeSensitiveInfo,
  EmployeeTraining,
  Profile,
} from '@/shared/types';

/** Plain data-access functions for the HR Employees sub-feature — every
 *  `supabase.from(...)` call that used to live inline in the employee
 *  detail/edit/new pages, unchanged in behavior, just relocated. */

type ManagerRow = { id: string; first_name: string; last_name: string; job_title: string };

export interface EmployeeDetailData {
  employee: Employee;
  sensitive: EmployeeSensitiveInfo | null;
  responsibilities: EmployeeResponsibility[];
  linkedProfile: Profile | null;
  training: EmployeeTraining[];
}

export async function fetchEmployeeDetail(employeeId: string): Promise<EmployeeDetailData | null> {
  const { data: employeeData, error } = await supabase
    .from('employees')
    .select(
      '*, branch:branches(*), department:departments(*), manager:employees!employees_manager_id_fkey(id, first_name, last_name, job_title)'
    )
    .eq('id', employeeId)
    .maybeSingle();

  if (error || !employeeData) {
    if (error) console.error('Error loading employee:', error);
    return null;
  }
  const emp = employeeData as Employee;

  const [sensitiveRes, respRes, profileRes, trainingRes] = await Promise.all([
    supabase.from('employee_sensitive_info').select('*').eq('employee_id', employeeId).maybeSingle(),
    supabase
      .from('employee_responsibilities')
      .select('*, department:departments(*)')
      .eq('employee_id', employeeId)
      .is('deleted_at', null)
      .order('is_primary', { ascending: false }),
    emp.profile_id
      ? supabase.from('profiles').select('*, branch:branches(*)').eq('id', emp.profile_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('employee_training')
      .select('*, course:courses(*)')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false }),
  ]);

  // Current-per-course: rows are already ordered by created_at desc, so
  // the first occurrence of each course_id is current — history (prior
  // recert cycles) stays queryable but isn't shown here, same convention
  // as the My Learning page.
  const seenCourses = new Set<string>();
  const currentTraining: EmployeeTraining[] = [];
  for (const row of (trainingRes.data as EmployeeTraining[]) ?? []) {
    if (seenCourses.has(row.course_id)) continue;
    seenCourses.add(row.course_id);
    currentTraining.push(row);
  }

  return {
    employee: emp,
    // A null row here (rather than an error) is exactly what RLS
    // produces for hr_officer — masked, not broken.
    sensitive: (sensitiveRes.data as EmployeeSensitiveInfo | null) ?? null,
    responsibilities: (respRes.data as EmployeeResponsibility[]) ?? [],
    linkedProfile: (profileRes.data as Profile | null) ?? null,
    training: currentTraining,
  };
}

export interface EmployeeEditData {
  employee: Employee;
  responsibilities: EmployeeResponsibility[];
  sensitive: EmployeeSensitiveInfo | null;
  departments: Department[];
  branches: Branch[];
  managers: ManagerRow[];
  profiles: Profile[];
}

export async function fetchEmployeeEditData(employeeId: string): Promise<EmployeeEditData | null> {
  const [employeeRes, respRes, sensitiveRes, deptRes, branchRes, empRes, profileRes, linkedRes] = await Promise.all([
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

  const employee = employeeRes.data as Employee | null;
  if (employeeRes.error || !employee) return null;

  const linkedProfileIds = new Set(((linkedRes.data as { profile_id: string }[]) ?? []).map((r) => r.profile_id));
  const profiles = ((profileRes.data as Profile[]) ?? []).filter(
    (p) => !linkedProfileIds.has(p.id) || p.id === employee.profile_id
  );

  return {
    employee,
    responsibilities: (respRes.data as EmployeeResponsibility[]) ?? [],
    sensitive: (sensitiveRes.data as EmployeeSensitiveInfo | null) ?? null,
    departments: (deptRes.data as Department[]) ?? [],
    branches: (branchRes.data as Branch[]) ?? [],
    managers: (empRes.data as ManagerRow[]) ?? [],
    profiles,
  };
}

export interface EmployeeFormOptions {
  departments: Department[];
  branches: Branch[];
  managers: ManagerRow[];
  profiles: Profile[];
}

export async function fetchEmployeeFormOptions(): Promise<EmployeeFormOptions> {
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

  const linkedProfileIds = new Set(((linkedRes.data as { profile_id: string }[]) ?? []).map((r) => r.profile_id));

  return {
    departments: (deptRes.data as Department[]) ?? [],
    branches: (branchRes.data as Branch[]) ?? [],
    managers: (empRes.data as ManagerRow[]) ?? [],
    profiles: ((profileRes.data as Profile[]) ?? []).filter((p) => !linkedProfileIds.has(p.id)),
  };
}

export interface UpdateEmployeeParams {
  employeeId: string;
  values: EmployeeFormValues;
  updatedBy: string;
  existingResponsibilityIds: string[];
  canViewSensitive: boolean;
  fallbackBranchId: string | null;
}

export async function updateEmployee({
  employeeId,
  values,
  updatedBy,
  existingResponsibilityIds,
  canViewSensitive,
  fallbackBranchId,
}: UpdateEmployeeParams): Promise<void> {
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
      updated_by: updatedBy,
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
        created_by: updatedBy,
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
        updated_by: updatedBy,
      },
      { onConflict: 'employee_id' }
    );
    if (sensitiveError) console.error('Sensitive info update error:', sensitiveError);
  }

  await supabase.from('activities').insert({
    user_id: updatedBy,
    branch_id: values.branch_id || fallbackBranchId,
    action: 'employee.updated',
    entity_type: 'employee',
    entity_id: employeeId,
    description: `Updated employee "${values.first_name} ${values.last_name}"`,
    metadata: { employee_number: values.employee_number },
  });
}

export interface CreateEmployeeParams {
  values: EmployeeFormValues;
  organizationId: string;
  createdBy: string;
  canViewSensitive: boolean;
  fallbackBranchId: string | null;
}

export interface CreateEmployeeResult {
  employeeId: string;
  /** Non-fatal warnings from secondary inserts — the employee row itself
   *  was created successfully; the caller surfaces these as toast.warning
   *  the same way the inline page code used to. */
  warnings: string[];
}

export async function createEmployee({
  values,
  organizationId,
  createdBy,
  canViewSensitive,
  fallbackBranchId,
}: CreateEmployeeParams): Promise<CreateEmployeeResult> {
  const { data: employee, error: employeeError } = await supabase
    .from('employees')
    .insert({
      organization_id: organizationId,
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
      created_by: createdBy,
      updated_by: createdBy,
    })
    .select('id')
    .single();

  if (employeeError || !employee) {
    throw new Error(employeeError?.message ?? 'Failed to create employee');
  }
  const employeeId = employee.id as string;
  const warnings: string[] = [];

  if (values.responsibilities.length > 0) {
    const { error: respError } = await supabase.from('employee_responsibilities').insert(
      values.responsibilities.map((r) => ({
        employee_id: employeeId,
        role_title: r.role_title,
        linked_role: r.linked_role || null,
        is_primary: r.is_primary,
        start_date: r.start_date,
        created_by: createdBy,
      }))
    );
    if (respError) {
      console.error('Responsibilities insert error:', respError);
      warnings.push('Employee created, but responsibilities failed to save.');
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
        created_by: createdBy,
        updated_by: createdBy,
      });
      if (sensitiveError) {
        console.error('Sensitive info insert error:', sensitiveError);
        warnings.push('Employee created, but sensitive info failed to save.');
      }
    }
  }

  const { error: activityError } = await supabase.from('activities').insert({
    user_id: createdBy,
    branch_id: values.branch_id || fallbackBranchId,
    action: 'employee.created',
    entity_type: 'employee',
    entity_id: employeeId,
    description: `Added employee "${values.first_name} ${values.last_name}"`,
    metadata: { employee_number: values.employee_number, job_title: values.job_title },
  });
  if (activityError) console.error('Activity log error:', activityError);

  return { employeeId, warnings };
}
