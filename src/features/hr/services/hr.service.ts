import { supabase } from '@/shared/lib/supabase/client';
import type {
  BranchCapacity,
  DepartmentCapacity,
  EmployeeCapacity,
  HrDashboardStats,
  WorkforceByBranch,
  WorkforceByDepartment,
} from '@/shared/types';

/** Plain data-access functions for HR capacity insights and the HR
 *  dashboard — every `supabase.rpc(...)` call that used to live inline
 *  across those pages, unchanged in behavior, just relocated. */

export async function fetchBranchCapacity(): Promise<BranchCapacity[]> {
  const { data } = await supabase.rpc('hr_branch_capacity');
  return (data as BranchCapacity[]) ?? [];
}

export async function fetchDepartmentCapacity(): Promise<DepartmentCapacity[]> {
  const { data } = await supabase.rpc('hr_department_capacity');
  return (data as DepartmentCapacity[]) ?? [];
}

export async function fetchPeopleCapacity(): Promise<EmployeeCapacity[]> {
  const { data } = await supabase.rpc('hr_people_capacity');
  return (data as EmployeeCapacity[]) ?? [];
}

export async function fetchHrDashboardStats(): Promise<HrDashboardStats | null> {
  const { data } = await supabase.rpc('hr_dashboard_stats');
  return ((data as HrDashboardStats[]) ?? [])[0] ?? null;
}

export async function fetchWorkforceByBranch(): Promise<WorkforceByBranch[]> {
  const { data } = await supabase.rpc('hr_workforce_by_branch');
  return (data as WorkforceByBranch[]) ?? [];
}

export async function fetchWorkforceByDepartment(): Promise<WorkforceByDepartment[]> {
  const { data } = await supabase.rpc('hr_workforce_by_department');
  return ((data as WorkforceByDepartment[]) ?? []).filter((d) => d.employee_count > 0);
}
