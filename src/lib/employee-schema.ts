import { z } from 'zod';

/**
 * Single source of truth for the Add/Edit Employee wizard. Mirrors
 * lib/quotation-schema.ts's shape: one schema, one defaults object,
 * shared by the wizard so per-step validation (lib/employee-wizard.ts)
 * and final submit can never drift.
 */

// Multiple Responsibilities (spec section 13) — one person, several
// functions, without duplicate employee records.
export const responsibilityRowSchema = z.object({
  // Present when editing an existing row; absent for a brand-new one.
  id: z.string().optional(),
  role_title: z.string().min(1, 'Role title is required'),
  // A UserRole value or '' (no operational role match — display/label
  // only in that case, and simply excluded from the capacity engine).
  linked_role: z.string().optional().or(z.literal('')),
  is_primary: z.boolean(),
  start_date: z.string().min(1, 'Start date is required'),
});

export const employeeSchema = z
  .object({
    // Personal
    first_name: z.string().min(1, 'First name is required'),
    last_name: z.string().min(1, 'Last name is required'),
    date_of_birth: z.string().optional().or(z.literal('')),
    gender: z.string().optional().or(z.literal('')),
    personal_email: z.string().email('Enter a valid email').optional().or(z.literal('')),
    personal_phone: z.string().optional().or(z.literal('')),
    address: z.string().optional().or(z.literal('')),

    // Employment
    employee_number: z.string().min(1, 'Employee number is required'),
    job_title: z.string().min(1, 'Job title is required'),
    department_id: z.string().optional().or(z.literal('')),
    manager_id: z.string().optional().or(z.literal('')),
    branch_id: z.string().optional().or(z.literal('')),
    employment_type: z.enum(['full_time', 'part_time', 'contract', 'intern', 'temporary']),
    employment_status: z.enum(['active', 'on_leave', 'suspended', 'terminated', 'resigned']),
    hire_date: z.string().min(1, 'Hire date is required'),
    confirmation_date: z.string().optional().or(z.literal('')),
    contract_end_date: z.string().optional().or(z.literal('')),
    work_location: z.string().optional().or(z.literal('')),

    // Multiple Responsibilities
    responsibilities: z.array(responsibilityRowSchema),

    // Manifest Access — HR job title vs system role are separate
    // concepts (spec section 12). Linking is optional: a login-less
    // employee (driver, warehouse staff) is a fully legitimate record.
    has_manifest_access: z.boolean(),
    profile_id: z.string().optional().or(z.literal('')),

    // Sensitive Info — employee_sensitive_info, RLS-restricted from
    // hr_officer regardless of what the UI shows. Every field optional;
    // HR can fill these in later.
    salary_amount: z.coerce.number().min(0).optional(),
    salary_currency: z.string().optional().or(z.literal('')),
    pay_frequency: z.string().optional().or(z.literal('')),
    bank_name: z.string().optional().or(z.literal('')),
    bank_account_name: z.string().optional().or(z.literal('')),
    bank_account_number: z.string().optional().or(z.literal('')),
    tax_id: z.string().optional().or(z.literal('')),
    national_id_number: z.string().optional().or(z.literal('')),
    emergency_contact_name: z.string().optional().or(z.literal('')),
    emergency_contact_relationship: z.string().optional().or(z.literal('')),
    emergency_contact_phone: z.string().optional().or(z.literal('')),
    private_notes: z.string().optional().or(z.literal('')),

    // Review
    notes: z.string().optional().or(z.literal('')),
  })
  .refine((data) => !data.has_manifest_access || !!data.profile_id, {
    message: 'Select a Manifest user account, or turn off "Has Manifest login"',
    path: ['profile_id'],
  });

export type EmployeeFormValues = z.infer<typeof employeeSchema>;

export const EMPLOYEE_FORM_DEFAULTS: EmployeeFormValues = {
  first_name: '',
  last_name: '',
  date_of_birth: '',
  gender: '',
  personal_email: '',
  personal_phone: '',
  address: '',

  employee_number: '',
  job_title: '',
  department_id: '',
  manager_id: '',
  branch_id: '',
  employment_type: 'full_time',
  employment_status: 'active',
  hire_date: new Date().toISOString().slice(0, 10),
  confirmation_date: '',
  contract_end_date: '',
  work_location: '',

  responsibilities: [],

  has_manifest_access: false,
  profile_id: '',

  salary_amount: undefined,
  salary_currency: 'NGN',
  pay_frequency: '',
  bank_name: '',
  bank_account_name: '',
  bank_account_number: '',
  tax_id: '',
  national_id_number: '',
  emergency_contact_name: '',
  emergency_contact_relationship: '',
  emergency_contact_phone: '',
  private_notes: '',

  notes: '',
};
