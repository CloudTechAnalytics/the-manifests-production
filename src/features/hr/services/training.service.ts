import { supabase } from '@/shared/lib/supabase/client';
import type { CourseFormValues } from '@/shared/lib/course-schema';
import type { AssignTrainingFormValues } from '@/shared/lib/training-assignment-schema';
import { uploadCourseMaterialFile } from '@/shared/lib/utils/course-material-upload';
import type {
  AssignTrainingResult,
  Branch,
  Course,
  CourseMaterial,
  Department,
  EmployeeTraining,
} from '@/shared/types';

/** Plain data-access functions for the HR Training sub-feature — every
 *  `supabase.from(...)`/`supabase.rpc(...)` call that used to live inline
 *  across the training pages and their dialogs, unchanged in behavior. */

export interface CourseDetailData {
  course: Course | null;
  materials: CourseMaterial[];
  myEmployeeId: string | null;
  myEnrollment: EmployeeTraining | null;
  roster: EmployeeTraining[];
}

export async function fetchCourseDetail(courseId: string, profileId: string | undefined): Promise<CourseDetailData> {
  const [courseRes, materialsRes, myEmpRes] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).maybeSingle(),
    supabase.from('course_materials').select('*').eq('course_id', courseId).order('sort_order'),
    profileId ? supabase.from('employees').select('id').eq('profile_id', profileId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const course = (courseRes.data as Course | null) ?? null;
  const materials = (materialsRes.data as CourseMaterial[]) ?? [];
  const myEmployeeId = (myEmpRes.data as { id: string } | null)?.id ?? null;

  let myEnrollment: EmployeeTraining | null = null;
  if (myEmployeeId) {
    const { data: myRows } = await supabase
      .from('employee_training')
      .select('*')
      .eq('employee_id', myEmployeeId)
      .eq('course_id', courseId)
      .order('created_at', { ascending: false })
      .limit(1);
    myEnrollment = ((myRows as EmployeeTraining[]) ?? [])[0] ?? null;
  }

  // roster fetch is safe either way — RLS scopes it
  const { data: rosterRows } = await supabase
    .from('employee_training')
    .select('*, employee:employees(id, first_name, last_name, job_title)')
    .eq('course_id', courseId)
    .order('created_at', { ascending: false });
  const roster = (rosterRows as EmployeeTraining[]) ?? [];

  return { course, materials, myEmployeeId, myEnrollment, roster };
}

export interface CourseManageOptions {
  employeeOptions: { id: string; full_name: string }[];
  departments: Department[];
  branches: Branch[];
}

export async function fetchCourseManageOptions(): Promise<CourseManageOptions> {
  const [empRes, deptRes, branchRes] = await Promise.all([
    supabase.from('employees').select('id, first_name, last_name').is('deleted_at', null).eq('employment_status', 'active'),
    supabase.from('departments').select('*').eq('is_active', true).is('deleted_at', null),
    supabase.from('branches').select('*').eq('is_active', true).is('deleted_at', null),
  ]);

  return {
    employeeOptions: ((empRes.data as { id: string; first_name: string; last_name: string }[]) ?? []).map((e) => ({
      id: e.id,
      full_name: `${e.first_name} ${e.last_name}`,
    })),
    departments: (deptRes.data as Department[]) ?? [],
    branches: (branchRes.data as Branch[]) ?? [],
  };
}

export async function enrollInCourse(employeeId: string, courseId: string): Promise<void> {
  const { error } = await supabase.from('employee_training').insert({
    employee_id: employeeId,
    course_id: courseId,
    assigned_by: null,
    status: 'not_started',
  });
  if (error) throw new Error(error.message);
}

export interface CourseEditData {
  course: Course | null;
  materials: CourseMaterial[];
}

export async function fetchCourseEditData(courseId: string): Promise<CourseEditData> {
  const [courseRes, materialsRes] = await Promise.all([
    supabase.from('courses').select('*').eq('id', courseId).maybeSingle(),
    supabase.from('course_materials').select('*').eq('course_id', courseId).order('sort_order'),
  ]);
  return {
    course: (courseRes.data as Course | null) ?? null,
    materials: (materialsRes.data as CourseMaterial[]) ?? [],
  };
}

export interface UpdateCourseParams {
  courseId: string;
  values: CourseFormValues;
  organizationId: string;
  updatedBy: string;
  branchId: string | null;
  materialFiles: Record<number, File | undefined>;
  existingMaterialIds: string[];
}

export async function updateCourse({
  courseId,
  values,
  organizationId,
  updatedBy,
  branchId,
  materialFiles,
  existingMaterialIds,
}: UpdateCourseParams): Promise<void> {
  const { error: courseError } = await supabase
    .from('courses')
    .update({
      title: values.title,
      description: values.description || null,
      category: values.category || null,
      target_roles: values.target_roles,
      provider: values.provider || null,
      estimated_duration_minutes: values.estimated_duration_minutes ?? null,
      is_certification: values.is_certification,
      certification_validity_months: values.is_certification ? values.certification_validity_months ?? null : null,
      is_active: values.is_active,
      updated_by: updatedBy,
    })
    .eq('id', courseId);
  if (courseError) throw new Error(courseError.message);

  // Materials: remove any that were dropped, add any new rows.
  const keptIds = new Set(values.materials.map((m) => m.id).filter(Boolean));
  const removedIds = existingMaterialIds.filter((id) => !keptIds.has(id));
  if (removedIds.length > 0) {
    await supabase.from('course_materials').delete().in('id', removedIds);
  }
  for (let i = 0; i < values.materials.length; i += 1) {
    const material = values.materials[i];
    if (material.id) continue; // already exists, nothing to change here
    if (material.material_type === 'file') {
      const file = materialFiles[i];
      if (!file) continue;
      await uploadCourseMaterialFile({
        file,
        organizationId,
        courseId,
        title: material.title,
        createdBy: updatedBy,
      });
    } else {
      await supabase.from('course_materials').insert({
        course_id: courseId,
        material_type: 'link',
        title: material.title,
        external_url: material.external_url,
        created_by: updatedBy,
      });
    }
  }

  await supabase.from('activities').insert({
    user_id: updatedBy,
    branch_id: branchId,
    action: 'course.updated',
    entity_type: 'course',
    entity_id: courseId,
    description: `Updated course "${values.title}"`,
    metadata: {},
  });
}

export interface CreateCourseParams {
  values: CourseFormValues;
  organizationId: string;
  createdBy: string;
  branchId: string | null;
  materialFiles: Record<number, File | undefined>;
}

export async function createCourse({ values, organizationId, createdBy, branchId, materialFiles }: CreateCourseParams): Promise<{
  courseId: string;
  warnings: string[];
}> {
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .insert({
      organization_id: organizationId,
      title: values.title,
      description: values.description || null,
      category: values.category || null,
      target_roles: values.target_roles,
      provider: values.provider || null,
      estimated_duration_minutes: values.estimated_duration_minutes ?? null,
      is_certification: values.is_certification,
      certification_validity_months: values.is_certification ? values.certification_validity_months ?? null : null,
      is_active: values.is_active,
      created_by: createdBy,
      updated_by: createdBy,
    })
    .select('id')
    .single();

  if (courseError || !course) {
    throw new Error(courseError?.message ?? 'Failed to create course');
  }
  const courseId = course.id as string;
  const warnings: string[] = [];

  for (let i = 0; i < values.materials.length; i += 1) {
    const material = values.materials[i];
    if (material.material_type === 'file') {
      const file = materialFiles[i];
      if (!file) continue;
      const result = await uploadCourseMaterialFile({
        file,
        organizationId,
        courseId,
        title: material.title,
        createdBy,
      });
      if (!result.success) {
        warnings.push(`Course created, but "${material.title}" failed to upload.`);
      }
    } else {
      const { error: linkError } = await supabase.from('course_materials').insert({
        course_id: courseId,
        material_type: 'link',
        title: material.title,
        external_url: material.external_url,
        created_by: createdBy,
      });
      if (linkError) console.error('Link material insert error:', linkError);
    }
  }

  await supabase.from('activities').insert({
    user_id: createdBy,
    branch_id: branchId,
    action: 'course.created',
    entity_type: 'course',
    entity_id: courseId,
    description: `Created course "${values.title}"`,
    metadata: { category: values.category },
  });

  return { courseId, warnings };
}

export interface MyLearningData {
  hasEmployeeRecord: boolean;
  records: EmployeeTraining[];
}

/** The signed-in employee's own current-per-course training rows —
 *  self-enrolled and HR-assigned together. "Current" per course is
 *  whichever row has the latest created_at (history is kept for
 *  recertification, see migration 089's design note). */
export async function fetchMyLearning(profileId: string): Promise<MyLearningData> {
  const { data: emp } = await supabase.from('employees').select('id').eq('profile_id', profileId).maybeSingle();
  if (!emp) {
    return { hasEmployeeRecord: false, records: [] };
  }
  const { data, error } = await supabase
    .from('employee_training')
    .select('*, course:courses(*)')
    .eq('employee_id', (emp as { id: string }).id)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error loading my learning:', error);
    return { hasEmployeeRecord: true, records: [] };
  }
  // Current-per-course: since rows are already ordered by created_at
  // desc, the first occurrence of each course_id is the current one.
  const seen = new Set<string>();
  const current: EmployeeTraining[] = [];
  for (const row of (data as EmployeeTraining[]) ?? []) {
    if (seen.has(row.course_id)) continue;
    seen.add(row.course_id);
    current.push(row);
  }
  return { hasEmployeeRecord: true, records: current };
}

/** Mark Started / Mark Complete — a plain update; the guard trigger
 *  (migration 089) fills started_at/completed_at/certificate_expiry_date
 *  server-side, never trusting these from the client. */
export async function updateTrainingRecordStatus(recordId: string, status: 'in_progress' | 'completed'): Promise<void> {
  const { error } = await supabase.from('employee_training').update({ status }).eq('id', recordId);
  if (error) throw new Error(error.message);
}

/**
 * Resolves whichever target_mode was picked into a plain employee id
 * array client-side, then the caller makes ONE assign_training() RPC
 * call — the RPC itself stays target-shape-agnostic (migration 091), so
 * its authorization logic (can_manage_hr per employee) is uniform
 * regardless of how the UI picked the targets.
 */
export async function resolveTrainingTargetEmployeeIds(values: AssignTrainingFormValues): Promise<string[]> {
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
}

export interface AssignTrainingParams {
  courseId: string;
  employeeIds: string[];
  dueDate: string | null;
}

export async function assignTraining({ courseId, employeeIds, dueDate }: AssignTrainingParams): Promise<AssignTrainingResult> {
  const { data, error } = await supabase.rpc('assign_training', {
    p_course_id: courseId,
    p_employee_ids: employeeIds,
    p_due_date: dueDate,
  });
  if (error) throw new Error(error.message);
  return data as AssignTrainingResult;
}
