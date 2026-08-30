import { z } from 'zod';
import { MIN_PASSWORD_LENGTH, COMMON_PASSWORDS } from '@/lib/utils/password-policy';

/**
 * Single source of truth for the self-service registration wizard
 * (app/register). Mirrors lib/quotation-schema.ts's shape: one schema, one
 * FormProvider, a step->fields map in lib/register-wizard.ts for per-step
 * validation.
 */

export const BUSINESS_TYPE_OPTIONS = [
  { value: 'freight_forwarding', label: 'Freight Forwarding' },
  { value: 'clearing_forwarding', label: 'Clearing & Forwarding' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'shipping_agency', label: 'Shipping Agency' },
  { value: 'customs_brokerage', label: 'Customs Brokerage' },
  { value: 'other', label: 'Other' },
] as const;

const businessTypeValues = BUSINESS_TYPE_OPTIONS.map((o) => o.value) as [string, ...string[]];

export const registerSchema = z
  .object({
    // Step 1: Business Information
    business_name: z.string().min(1, 'Business name is required').max(200),
    business_type: z.enum(businessTypeValues, { errorMap: () => ({ message: 'Select a business type' }) }),
    country: z.string().min(1, 'Country is required'),
    city: z.string().min(1, 'State / City is required'),
    business_email: z.string().min(1, 'Business email is required').email('Enter a valid email'),
    business_phone: z.string().min(1, 'Phone number is required'),
    registration_number: z.string().optional().or(z.literal('')),
    website: z.string().optional().or(z.literal('')),
    expected_users: z.coerce.number().min(0).optional(),
    expected_monthly_shipments: z.coerce.number().min(0).optional(),
    referral_source: z.string().optional().or(z.literal('')),

    // Step 2: Organization Owner
    owner_first_name: z.string().min(1, 'First name is required').max(100),
    owner_last_name: z.string().min(1, 'Last name is required').max(100),
    owner_email: z.string().min(1, 'Work email is required').email('Enter a valid email'),
    owner_phone: z.string().min(1, 'Phone number is required'),
    password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
    confirm_password: z.string().min(1, 'Confirm your password'),
    terms_accepted: z.boolean(),
    privacy_accepted: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirm_password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['confirm_password'], message: 'Passwords do not match' });
    }
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(data.password)).length;
    if (classes < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'Include at least 3 of: lowercase, uppercase, numbers, symbols',
      });
    }
    if (COMMON_PASSWORDS.has(data.password.toLowerCase())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: 'That password is too common — please choose another' });
    }
    if (!data.terms_accepted) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['terms_accepted'], message: 'You must accept the Terms of Service' });
    }
    if (!data.privacy_accepted) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['privacy_accepted'], message: 'You must accept the Privacy Policy' });
    }
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;

export const REGISTER_FORM_DEFAULTS: RegisterFormValues = {
  business_name: '',
  business_type: 'freight_forwarding',
  country: '',
  city: '',
  business_email: '',
  business_phone: '',
  registration_number: '',
  website: '',
  expected_users: undefined,
  expected_monthly_shipments: undefined,
  referral_source: '',
  owner_first_name: '',
  owner_last_name: '',
  owner_email: '',
  owner_phone: '',
  password: '',
  confirm_password: '',
  terms_accepted: false,
  privacy_accepted: false,
};
