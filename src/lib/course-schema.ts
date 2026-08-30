import { z } from 'zod';

/**
 * Course create/edit form — flat, not wizard-shaped. Course creation
 * is a single-page form (title/description/materials), nothing like
 * Employee onboarding's multi-step flow, so this file exists only
 * because it's shared between the New and Edit routes (same reason
 * lib/employee-schema.ts was split out — reuse across two pages, not
 * wizard complexity).
 */

export const courseMaterialRowSchema = z.object({
  // Present when editing an existing material row; absent for a new one.
  id: z.string().optional(),
  material_type: z.enum(['file', 'link']),
  title: z.string().min(1, 'Title is required'),
  external_url: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || /^https?:\/\/.+/.test(v), 'Enter a valid URL starting with http(s)://'),
  // The actual File object for an unsaved 'file' row lives in local
  // component state (a FileList/File[]), same as every other upload
  // flow in this codebase (document-upload-dialog.tsx) — never held in
  // the zod schema/RHF state itself.
});

export const courseSchema = z
  .object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional().or(z.literal('')),
    category: z.string().optional().or(z.literal('')),
    target_roles: z.array(z.string()),
    provider: z.string().optional().or(z.literal('')),
    estimated_duration_minutes: z.coerce.number().min(0).optional(),
    is_certification: z.boolean(),
    certification_validity_months: z.coerce.number().min(1).optional(),
    is_active: z.boolean(),
    materials: z.array(courseMaterialRowSchema),
  })
  .refine((data) => !data.is_certification || !!data.certification_validity_months, {
    message: 'Certification validity (months) is required for a certification course',
    path: ['certification_validity_months'],
  });

export type CourseFormValues = z.infer<typeof courseSchema>;

export const COURSE_FORM_DEFAULTS: CourseFormValues = {
  title: '',
  description: '',
  category: '',
  target_roles: [],
  provider: '',
  estimated_duration_minutes: undefined,
  is_certification: false,
  certification_validity_months: undefined,
  is_active: true,
  materials: [],
};
