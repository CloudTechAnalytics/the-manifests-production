import type { BranchCapacity, CapacityStatusLabel, DepartmentCapacity, EmployeeCapacity } from '@/types';

/**
 * Pure, client-side derivation from the three capacity RPCs' output
 * (hr_people_capacity/hr_department_capacity/hr_branch_capacity,
 * migration 087) — no persistence, no new table in Phase 1.
 *
 * Spec section 10 is explicit: these are recommendations, never
 * automatic HR decisions, and never a directive about a specific
 * person's employment ("consider reviewing workload allocation", never
 * "fire someone"). Just as important: an insight is never generated
 * from a thin-data row — there isn't enough signal to say anything
 * responsible about it, so silence is the honest choice there.
 */

export const MIN_SAMPLE_SIZE = 5;
export const MIN_PEER_COUNT = 3;

export interface WorkforceInsight {
  id: string;
  tone: 'notice' | 'opportunity';
  text: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administration',
  operations: 'Operations',
  sales: 'Sales',
  branch_manager: 'Branch Management',
  finance: 'Finance',
  customs: 'Customs',
  planning: 'Planning',
  documentation: 'Documentation',
  terminal: 'Terminal',
  examination: 'Examination',
  warehouse: 'Warehouse',
  transport: 'Transport',
  hr_manager: 'HR',
  hr_officer: 'HR',
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export function generateWorkforceInsights(
  people: EmployeeCapacity[],
  departments: DepartmentCapacity[],
  branches: BranchCapacity[]
): WorkforceInsight[] {
  const insights: WorkforceInsight[] = [];

  for (const d of departments.filter((d) => !d.is_thin_data && d.status_label === 'overloaded')) {
    insights.push({
      id: `dept-overloaded-${d.branch_id}-${d.linked_role}`,
      tone: 'notice',
      text: `${roleLabel(d.linked_role)} at ${d.branch_name ?? 'this branch'} is currently operating at high capacity relative to the rest of the organization. Consider reviewing staffing allocation or redistributing work before taking on more volume there.`,
    });
  }

  for (const d of departments.filter((d) => !d.is_thin_data && d.status_label === 'underutilized')) {
    insights.push({
      id: `dept-underutilized-${d.branch_id}-${d.linked_role}`,
      tone: 'opportunity',
      text: `${roleLabel(d.linked_role)} at ${d.branch_name ?? 'this branch'} has available capacity relative to the rest of the organization. Consider directing new volume here before hiring elsewhere.`,
    });
  }

  const overloadedPeople = people.filter((p) => !p.is_thin_data && p.status_label === 'overloaded');
  if (overloadedPeople.length > 0) {
    insights.push({
      id: 'people-overloaded',
      tone: 'notice',
      text: `${overloadedPeople.length} employee${overloadedPeople.length === 1 ? '' : 's'} ${overloadedPeople.length === 1 ? 'has' : 'have'} had a consistently high workload relative to peers: ${overloadedPeople.map((p) => p.employee_name).join(', ')}. Consider reviewing workload allocation or role responsibilities.`,
    });
  }

  const underutilizedPeople = people.filter((p) => !p.is_thin_data && p.status_label === 'underutilized');
  if (underutilizedPeople.length > 0) {
    insights.push({
      id: 'people-underutilized',
      tone: 'opportunity',
      text: `${underutilizedPeople.length} employee${underutilizedPeople.length === 1 ? '' : 's'} ${underutilizedPeople.length === 1 ? 'has' : 'have'} significantly lower assigned workload than peers: ${underutilizedPeople.map((p) => p.employee_name).join(', ')}. Consider reallocating work before hiring additional staff.`,
    });
  }

  for (const b of branches.filter((b) => !b.is_thin_data && b.status_label === 'overloaded')) {
    insights.push({
      id: `branch-overloaded-${b.branch_id}`,
      tone: 'notice',
      text: `${b.branch_name ?? 'This branch'} is currently operating at high capacity relative to the rest of the organization.`,
    });
  }

  for (const b of branches.filter((b) => !b.is_thin_data && b.status_label === 'underutilized')) {
    insights.push({
      id: `branch-underutilized-${b.branch_id}`,
      tone: 'opportunity',
      text: `${b.branch_name ?? 'This branch'} has available capacity relative to the rest of the organization — worth checking before assuming another hire is needed there.`,
    });
  }

  return insights;
}

export const CAPACITY_STATUS_META: Record<CapacityStatusLabel, { label: string; className: string }> = {
  underutilized: { label: 'Underutilized', className: 'bg-blue-50 text-blue-700 border border-blue-200' },
  healthy: { label: 'Healthy', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  high_utilization: { label: 'High Utilization', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  overloaded: { label: 'Overloaded', className: 'bg-red-50 text-red-700 border border-red-200' },
};

export const THIN_DATA_REASON_TEXT: Record<string, string> = {
  no_login: 'No system activity — this employee has no Manifest login, so capacity cannot be estimated from task data.',
  low_sample: 'Capacity estimation requires more operational data.',
  few_peers: 'Not enough peers in this role yet to make a fair comparison.',
  only_branch: 'Only branch in this organization — no cross-branch comparison available.',
  no_employees: 'No active employees assigned to this branch yet.',
};

export function thinDataMessage(reason: string | null): string {
  if (reason && THIN_DATA_REASON_TEXT[reason]) return THIN_DATA_REASON_TEXT[reason];
  return 'Capacity estimation requires more operational data.';
}
