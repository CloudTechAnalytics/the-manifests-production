import { z } from 'zod';
import { getHardValidationIssues } from '@/lib/quotation-rules';
import type { Organization } from '@/types';

/**
 * Single source of truth for the quotation form — shared by New and Edit
 * so the two can never drift on validation rules. Section numbers in the
 * comments match the spec this was built against.
 */

// Section 5: one charge row. Either hand-typed or seeded from a Section 4
// service checkbox (service_key set, description pre-filled, still editable).
export const chargeRowSchema = z.object({
  // Present when editing an existing row (drives update vs insert on
  // save); absent for a brand-new row, on both the New and Edit pages.
  id: z.string().optional(),
  service_key: z.string().nullable(),
  description: z.string().min(1, 'Description is required'),
  quantity: z.coerce.number().min(0, 'Quantity must be ≥ 0'),
  unit_price: z.coerce.number().min(0, 'Unit price must be ≥ 0'),
  discount_rate: z.coerce.number().min(0, 'Discount must be ≥ 0').max(100, 'Discount must be ≤ 100'),
  tax_rate: z.coerce.number().min(0, 'Tax rate must be ≥ 0').max(100, 'Tax rate must be ≤ 100'),
  unit: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  // "More Details" disclosure — internal GL/billing metadata, never
  // shown on the customer-facing PDF.
  billing_basis: z.string().optional().or(z.literal('')),
  cost_centre: z.string().optional().or(z.literal('')),
  gl_account: z.string().optional().or(z.literal('')),
  internal_reference: z.string().optional().or(z.literal('')),
  tax_code: z.string().optional().or(z.literal('')),
});

export const quotationSchema = z.object({
  // Section 1: Customer Information
  customer_id: z.string().min(1, 'Customer is required'),
  contact_person: z.string().optional().or(z.literal('')),
  contact_email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  contact_phone: z.string().optional().or(z.literal('')),
  sales_rep_id: z.string().optional().or(z.literal('')),

  // Section 2: Shipment Information
  shipment_direction: z.enum(['import', 'export']),
  shipment_type: z.enum(['air', 'sea', 'road', 'rail', 'multimodal']),
  cargo_type: z.enum(['fcl', 'lcl', 'roro', 'break_bulk']).optional().or(z.literal('')),
  incoterm: z.string().optional().or(z.literal('')),
  currency: z.string().min(1, 'Currency is required'),
  origin_country: z.string().optional().or(z.literal('')),
  origin_port: z.string().min(1, 'Origin port is required'),
  destination_country: z.string().optional().or(z.literal('')),
  destination_port: z.string().min(1, 'Destination port is required'),
  expected_shipping_date: z.string().optional().or(z.literal('')),
  expected_arrival_date: z.string().optional().or(z.literal('')),

  // Section 3: Cargo Information
  commodity_description: z.string().optional().or(z.literal('')),
  hs_code: z.string().optional().or(z.literal('')),
  container_count: z.coerce.number().min(0).optional(),
  container_size: z.string().optional().or(z.literal('')),
  weight: z.coerce.number().min(0).optional(),
  weight_unit: z.enum(['KG', 'TON']),
  cbm: z.coerce.number().min(0).optional(),
  packages_count: z.coerce.number().min(0).optional(),
  package_type: z.string().optional().or(z.literal('')),
  dangerous_cargo: z.boolean(),
  temperature_controlled: z.boolean(),
  insurance_required: z.boolean(),
  cargo_value: z.coerce.number().min(0).optional(),

  // Section 4: Services Required
  services: z.array(z.string()),

  // Scope of Service: "Not Included" — "Included" mirrors `services` above
  excluded_services: z.array(z.string()),

  // Section 5: Charge Breakdown
  items: z.array(chargeRowSchema).min(1, 'At least one charge is required'),

  // Section 6: Payment Terms
  payment_terms: z.string().optional().or(z.literal('')),
  payment_method: z.string().optional().or(z.literal('')),

  // Section 7: Required Documents
  required_documents: z.array(z.string()),

  // Section 8: Validity
  valid_until: z.string().min(1, 'Valid until date is required'),
  priority: z.enum(['normal', 'urgent', 'vip']),
  notes: z.string().optional().or(z.literal('')),
  customer_notes: z.string().optional().or(z.literal('')),
  terms: z.string().optional().or(z.literal('')),
}).superRefine((values, ctx) => {
  // Intelligent validation (Section 12) — FCL requires a container type,
  // LCL requires CBM. Sourced from the centralized rules engine so this
  // is the one place these rules are encoded, not duplicated here.
  for (const issue of getHardValidationIssues(values)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: issue.path, message: issue.message });
  }
});

export type QuotationFormValues = z.infer<typeof quotationSchema>;
export type ChargeRowValues = z.infer<typeof chargeRowSchema>;

export const QUOTATION_FORM_DEFAULTS: QuotationFormValues = {
  customer_id: '',
  contact_person: '',
  contact_email: '',
  contact_phone: '',
  sales_rep_id: '',
  shipment_direction: 'import',
  shipment_type: 'sea',
  cargo_type: '',
  incoterm: '',
  currency: 'NGN',
  origin_country: '',
  origin_port: '',
  destination_country: '',
  destination_port: '',
  expected_shipping_date: '',
  expected_arrival_date: '',
  commodity_description: '',
  hs_code: '',
  container_count: undefined,
  container_size: '',
  weight: undefined,
  weight_unit: 'KG',
  cbm: undefined,
  packages_count: undefined,
  package_type: '',
  dangerous_cargo: false,
  temperature_controlled: false,
  insurance_required: false,
  cargo_value: undefined,
  services: [],
  excluded_services: [],
  items: [
    {
      service_key: null,
      description: '',
      quantity: 1,
      unit_price: 0,
      discount_rate: 0,
      tax_rate: 0,
      unit: '',
      notes: '',
      billing_basis: '',
      cost_centre: '',
      gl_account: '',
      internal_reference: '',
      tax_code: '',
    },
  ],
  payment_terms: '',
  payment_method: '',
  required_documents: [],
  valid_until: '',
  priority: 'normal',
  notes: '',
  customer_notes: '',
  terms: '',
};

/** Line total for one charge row: qty * price, less discount, plus tax. */
export function computeLineTotal(row: {
  quantity: number;
  unit_price: number;
  discount_rate: number;
  tax_rate: number;
}): number {
  const base = (Number(row.quantity) || 0) * (Number(row.unit_price) || 0);
  const afterDiscount = base * (1 - (Number(row.discount_rate) || 0) / 100);
  return afterDiscount * (1 + (Number(row.tax_rate) || 0) / 100);
}

export interface QuotationTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
}

/**
 * Subtotal/discount/tax/total across every charge row. Discount is shown
 * per-line (Section 5) and rolls up here; there's no separate top-level
 * discount input beyond the sum of the line discounts, which is what
 * "Discount" in the Section 5 automatic totals refers to.
 */
export function computeQuotationTotals(items: ChargeRowValues[]): QuotationTotals {
  let subtotal = 0;
  let discountAmount = 0;
  let taxAmount = 0;

  for (const item of items) {
    const qty = Number(item.quantity) || 0;
    const unitPrice = Number(item.unit_price) || 0;
    const discountRate = Number(item.discount_rate) || 0;
    const taxRate = Number(item.tax_rate) || 0;

    const lineSubtotal = qty * unitPrice;
    const lineDiscount = lineSubtotal * (discountRate / 100);
    const lineTax = (lineSubtotal - lineDiscount) * (taxRate / 100);

    subtotal += lineSubtotal;
    discountAmount += lineDiscount;
    taxAmount += lineTax;
  }

  const total = subtotal - discountAmount + taxAmount;

  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    subtotal: round(subtotal),
    discountAmount: round(discountAmount),
    taxAmount: round(taxAmount),
    total: round(total),
  };
}

/**
 * How "done" a draft quotation looks, for the Completion % bar — a
 * weighted checklist of fields that are optional to save but expected
 * on a real, customer-ready quote. Not validation (the zod schema
 * already covers what's actually required to save).
 */
export function computeQuotationCompleteness(values: QuotationFormValues): number {
  const checks: boolean[] = [
    !!values.contact_person,
    !!values.contact_email,
    !!values.sales_rep_id,
    !!values.incoterm,
    !!values.expected_shipping_date,
    !!values.expected_arrival_date,
    !!values.commodity_description,
    !!values.hs_code,
    (values.weight ?? 0) > 0,
    (values.cargo_value ?? 0) > 0,
    values.services.length > 0,
    !!values.payment_terms,
    !!values.payment_method,
    values.required_documents.length > 0,
    !!values.notes,
    !!values.terms,
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}

/**
 * Why a quotation needs escalated (Branch Manager, not just any admin)
 * approval — org-configured discount-% and amount thresholds. Returns
 * null when neither threshold is configured or neither is tripped.
 */
export function computeApprovalReason(
  totals: QuotationTotals,
  org: Pick<Organization, 'quotation_discount_threshold_percent' | 'quotation_amount_threshold'>
): string | null {
  const reasons: string[] = [];
  const discountPercent = totals.subtotal > 0 ? (totals.discountAmount / totals.subtotal) * 100 : 0;

  if (
    org.quotation_discount_threshold_percent != null &&
    discountPercent > org.quotation_discount_threshold_percent
  ) {
    reasons.push(`Exceeds ${org.quotation_discount_threshold_percent}% discount threshold`);
  }
  if (org.quotation_amount_threshold != null && totals.total > org.quotation_amount_threshold) {
    reasons.push(`Exceeds ${org.quotation_amount_threshold.toLocaleString()} amount threshold`);
  }

  return reasons.length > 0 ? reasons.join(' · ') : null;
}
