import type { CargoType, QuotationPriority, ShipmentDirection } from '@/types';

/**
 * Shared reference data for the quotation module — one place so the new
 * form, edit form, detail page, and summary panel can't drift from each
 * other on what a given key means.
 */

export const CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP', 'GHS', 'KES', 'ZAR'];

export const SHIPMENT_DIRECTIONS: { value: ShipmentDirection; label: string }[] = [
  { value: 'import', label: 'Import' },
  { value: 'export', label: 'Export' },
];

export const CARGO_TYPES: { value: CargoType; label: string }[] = [
  { value: 'fcl', label: 'FCL' },
  { value: 'lcl', label: 'LCL' },
  { value: 'roro', label: 'RoRo' },
  { value: 'break_bulk', label: 'Break Bulk' },
];

export const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP', 'CPT', 'CIP'];

export const CONTAINER_SIZES = ['20FT', '40FT', '45FT'];

export const WEIGHT_UNITS = ['KG', 'TON'];

export const PACKAGE_TYPES = [
  'Pallets',
  'Cartons',
  'Crates',
  'Drums',
  'Bags',
  'Rolls',
  'Bundles',
  'Other',
];

export interface QuotationServiceDef {
  key: string;
  label: string;
  defaultDescription: string;
}

/**
 * The fixed service checklist (Section 4). Checking one seeds a charge
 * row in the pricing table with this description and a zero rate the
 * user fills in — not a rate card, just a starting point.
 */
export const QUOTATION_SERVICES: QuotationServiceDef[] = [
  { key: 'freight_forwarding', label: 'Freight Forwarding', defaultDescription: 'Freight Forwarding Service' },
  { key: 'customs_clearance', label: 'Customs Clearance', defaultDescription: 'Customs Clearance' },
  { key: 'documentation', label: 'Documentation', defaultDescription: 'Documentation Fee' },
  { key: 'terminal_handling', label: 'Terminal Handling', defaultDescription: 'Terminal Handling Charge' },
  { key: 'warehouse', label: 'Warehouse', defaultDescription: 'Warehousing' },
  { key: 'haulage', label: 'Haulage', defaultDescription: 'Haulage / Inland Transport' },
  { key: 'cargo_insurance', label: 'Cargo Insurance', defaultDescription: 'Cargo Insurance Premium' },
  { key: 'delivery', label: 'Delivery', defaultDescription: 'Final-Mile Delivery' },
  { key: 'examination', label: 'Examination', defaultDescription: 'Cargo Examination Fee' },
  { key: 'son', label: 'SON', defaultDescription: 'SON Inspection' },
  { key: 'nafdac', label: 'NAFDAC', defaultDescription: 'NAFDAC Clearance' },
  { key: 'inspection', label: 'Inspection', defaultDescription: 'Pre-Shipment Inspection' },
];

export const PAYMENT_TERMS_OPTIONS = [
  { value: '100_advance', label: '100% Advance' },
  { value: '70_30', label: '70% Advance / 30% Before Delivery' },
  { value: '50_50', label: '50% Advance / 50% Delivery' },
  { value: '50_advance', label: '50% Advance' },
  { value: 'net_7', label: 'Net 7' },
  { value: 'net_14', label: 'Net 14' },
  { value: 'net_30', label: 'Net 30' },
  { value: '30_days_credit', label: '30 Days Credit' },
  { value: '60_days_credit', label: '60 Days Credit' },
  { value: 'cod', label: 'Cash On Delivery' },
  { value: 'custom', label: 'Custom Terms' },
];

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'pos', label: 'POS' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'online', label: 'Online Payment' },
  { value: 'multiple', label: 'Multiple' },
  { value: 'partial', label: 'Partial' },
];

export const REQUIRED_DOCUMENT_OPTIONS = [
  'Commercial Invoice',
  'Packing List',
  'Bill of Lading',
  'Certificate of Origin',
  'Insurance Certificate',
  'SONCAP',
  'NAFDAC',
  'Form M',
  'PAAR',
  'Export Declaration',
  'Shipping Instructions',
  'Others',
];

/**
 * Default required-document checklist by shipment direction (Section 7)
 * — pre-fills the checkbox grid above so staff don't have to hand-pick
 * every document on every quotation; still fully editable afterwards.
 */
export const IMPORT_REQUIRED_DOCUMENTS = [
  'Commercial Invoice',
  'Packing List',
  'Bill of Lading',
  'Certificate of Origin',
  'Insurance Certificate',
  'Form M',
  'PAAR',
];

export const EXPORT_REQUIRED_DOCUMENTS = [
  'Commercial Invoice',
  'Packing List',
  'Export Declaration',
  'Certificate of Origin',
  'Shipping Instructions',
];

export function getDefaultRequiredDocuments(direction: ShipmentDirection | null): string[] {
  if (direction === 'import') return IMPORT_REQUIRED_DOCUMENTS;
  if (direction === 'export') return EXPORT_REQUIRED_DOCUMENTS;
  return [];
}

/**
 * "Not Included" checklist for the Scope of Service section — a
 * developer-defined catalog, same precedent as QUOTATION_SERVICES /
 * REQUIRED_DOCUMENT_OPTIONS (not admin-editable this pass).
 */
export const NOT_INCLUDED_SERVICE_OPTIONS = [
  'Customs Duty',
  'SON Fees',
  'NAFDAC Fees',
  'Storage Charges',
  'Demurrage',
  'Examination Charges',
];

export const QUOTATION_PRIORITY_META: Record<QuotationPriority, { label: string; color: string }> = {
  normal: { label: 'Normal', color: 'bg-gray-100 text-gray-700' },
  urgent: { label: 'Urgent', color: 'bg-amber-100 text-amber-700' },
  vip: { label: 'VIP', color: 'bg-purple-100 text-purple-700' },
};

export function paymentTermsLabel(value: string | null): string {
  return PAYMENT_TERMS_OPTIONS.find((o) => o.value === value)?.label ?? value ?? '—';
}

export function paymentMethodLabel(value: string | null): string {
  return PAYMENT_METHOD_OPTIONS.find((o) => o.value === value)?.label ?? value ?? '—';
}
