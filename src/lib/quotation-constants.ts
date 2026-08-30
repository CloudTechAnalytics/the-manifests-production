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
}

/**
 * The fixed service checklist (Section 4). Checking one seeds a charge
 * row in the pricing table — see lib/quotation-rules.ts's
 * resolveChargeTemplate() for what description/naming it gets (mode-
 * aware, e.g. "Ocean Freight" vs "Air Freight" for Freight Forwarding).
 */
/**
 * Deliberately excludes operational/exception charges that a real freight
 * forwarder never sells as a planned service — Customs Duty (paid by the
 * importer directly to Nigeria Customs, never our revenue; tracked instead
 * on the shipment's Customs tab Duty Assessment) and Demurrage (an
 * unplanned cost that can't be known at quotation time; tracked instead on
 * the shipment's Financial Exposure tab). Detention, Port Storage,
 * Shipping Line Storage, Terminal Penalty, Customs Penalty, and Late
 * Delivery Charges were never in this catalog and must never be added
 * here — see NOT_INCLUDED_SERVICE_OPTIONS below, where the customer-facing
 * quotation PDF states plainly that none of these are included.
 */
export const QUOTATION_SERVICES: QuotationServiceDef[] = [
  { key: 'freight_forwarding', label: 'Freight Forwarding' },
  { key: 'customs_clearance', label: 'Customs Clearance' },
  { key: 'documentation', label: 'Documentation' },
  { key: 'terminal_handling', label: 'Terminal Handling' },
  { key: 'warehouse', label: 'Warehouse' },
  { key: 'haulage', label: 'Haulage' },
  { key: 'cargo_insurance', label: 'Cargo Insurance' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'examination', label: 'Examination' },
  { key: 'son', label: 'SON' },
  { key: 'nafdac', label: 'NAFDAC' },
  { key: 'inspection', label: 'Inspection' },
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
  'Air Waybill',
  'Certificate of Origin',
  'Insurance Certificate',
  'SONCAP',
  'NAFDAC',
  'Form M',
  'PAAR',
  'Export Declaration (NXP)',
  'Shipping Instructions',
];

/**
 * Default required-document checklist by shipment direction (Section 7)
 * — pre-fills the checkbox grid above so staff don't have to hand-pick
 * every document on every quotation; still fully editable afterwards.
 * Insurance Certificate/SONCAP/NAFDAC are deliberately NOT in either base
 * list — they're conditional (CIF/CIP incoterm, SON/NAFDAC services) and
 * added by lib/quotation-rules.ts's resolveRequiredDocuments(), not
 * unconditionally on every import/export quotation.
 */
export const IMPORT_REQUIRED_DOCUMENTS = [
  'Commercial Invoice',
  'Packing List',
  'Bill of Lading',
  'Certificate of Origin',
  'Form M',
  'PAAR',
];

export const EXPORT_REQUIRED_DOCUMENTS = [
  'Commercial Invoice',
  'Packing List',
  'Export Declaration (NXP)',
  'Certificate of Origin',
  'Shipping Instructions',
  'Bill of Lading',
];

export function getDefaultRequiredDocuments(direction: ShipmentDirection | null): string[] {
  if (direction === 'import') return IMPORT_REQUIRED_DOCUMENTS;
  if (direction === 'export') return EXPORT_REQUIRED_DOCUMENTS;
  return [];
}

/**
 * Which direction(s) each catalog document belongs to, purely so the
 * Required Documents checklist can show a badge ("Import"/"Export"/
 * "Both"/"Conditional") next to every option — otherwise there's no way
 * to tell at a glance why a document is or isn't auto-checked for the
 * quotation's current direction. "Conditional" covers documents that
 * are neither base-list (Air Waybill, Insurance Certificate, SONCAP,
 * NAFDAC) — lib/quotation-rules.ts's resolveRequiredDocuments() adds
 * those based on mode/incoterm/services, not direction alone.
 */
export type RequiredDocumentCategory = 'import' | 'export' | 'both' | 'conditional';

export const REQUIRED_DOCUMENT_CATEGORY: Record<string, RequiredDocumentCategory> = (() => {
  const importSet = new Set(IMPORT_REQUIRED_DOCUMENTS);
  const exportSet = new Set(EXPORT_REQUIRED_DOCUMENTS);
  const map: Record<string, RequiredDocumentCategory> = {};
  for (const doc of REQUIRED_DOCUMENT_OPTIONS) {
    if (importSet.has(doc) && exportSet.has(doc)) map[doc] = 'both';
    else if (importSet.has(doc)) map[doc] = 'import';
    else if (exportSet.has(doc)) map[doc] = 'export';
    else map[doc] = 'conditional';
  }
  return map;
})();

/**
 * How a charge line is billed — internal GL metadata shown in the
 * charge table's "More Details" disclosure, not on the customer PDF.
 */
export const BILLING_BASIS_OPTIONS = [
  { value: 'per_shipment', label: 'Per Shipment' },
  { value: 'per_container', label: 'Per Container' },
  { value: 'per_cbm', label: 'Per CBM' },
  { value: 'per_kg', label: 'Per KG' },
  { value: 'per_document', label: 'Per Document' },
  { value: 'flat', label: 'Flat Fee' },
];

/**
 * "Not Included" catalog for the Scope of Service section — a
 * developer-defined catalog, same precedent as QUOTATION_SERVICES /
 * REQUIRED_DOCUMENT_OPTIONS (not admin-editable this pass). Each entry
 * that corresponds to a selectable service carries that service's key
 * so lib/quotation-rules.ts's resolveExcludedServiceOptions() can drop
 * it the moment that service is selected — the list is never shown
 * contradicting what's actually included.
 *
 * Entries WITHOUT a relatedServiceKey are permanently excluded — they're
 * operational/exception charges (Customs Duty, Demurrage, Detention,
 * storage/penalty charges, late delivery) that are never a quotation
 * service in the first place, so there's no selection that could ever
 * make them "included." They always show on the customer-facing PDF.
 */
export interface NotIncludedOption {
  label: string;
  relatedServiceKey?: string;
}

export const NOT_INCLUDED_SERVICE_OPTIONS: NotIncludedOption[] = [
  { label: 'Customs Duty' },
  { label: 'SON Fees', relatedServiceKey: 'son' },
  { label: 'NAFDAC Fees', relatedServiceKey: 'nafdac' },
  { label: 'Storage Charges', relatedServiceKey: 'warehouse' },
  { label: 'Demurrage' },
  { label: 'Detention' },
  { label: 'Port Storage' },
  { label: 'Shipping Line Storage' },
  { label: 'Terminal Penalty' },
  { label: 'Customs Penalty' },
  { label: 'Re-examination / Additional Examination Penalty' },
  { label: 'Late Delivery Charges' },
  { label: 'Examination Charges', relatedServiceKey: 'examination' },
  { label: 'Cargo Insurance', relatedServiceKey: 'cargo_insurance' },
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
