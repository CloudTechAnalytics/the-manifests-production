import { z } from 'zod';

/**
 * The Assign Training dialog's form — one employee, or a whole
 * role/department/branch fanned out in one action (spec-confirmed
 * bulk-assignment support). Whichever target_mode is picked, the
 * dialog resolves an employee id array client-side and hands it to
 * the single assign_training() RPC — this schema only validates that
 * exactly the right target field was filled in for the chosen mode.
 */
export const assignTrainingSchema = z
  .object({
    target_mode: z.enum(['employee', 'role', 'department', 'branch']),
    employee_id: z.string().optional().or(z.literal('')),
    role: z.string().optional().or(z.literal('')),
    department_id: z.string().optional().or(z.literal('')),
    branch_id: z.string().optional().or(z.literal('')),
    due_date: z.string().optional().or(z.literal('')),
  })
  .refine(
    (data) => {
      switch (data.target_mode) {
        case 'employee':
          return !!data.employee_id;
        case 'role':
          return !!data.role;
        case 'department':
          return !!data.department_id;
        case 'branch':
          return !!data.branch_id;
        default:
          return false;
      }
    },
    { message: 'Select who this course should be assigned to', path: ['employee_id'] }
  );

export type AssignTrainingFormValues = z.infer<typeof assignTrainingSchema>;

export const ASSIGN_TRAINING_DEFAULTS: AssignTrainingFormValues = {
  target_mode: 'employee',
  employee_id: '',
  role: '',
  department_id: '',
  branch_id: '',
  due_date: '',
};
