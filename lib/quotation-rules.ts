import { IMPORT_REQUIRED_DOCUMENTS, EXPORT_REQUIRED_DOCUMENTS } from '@/lib/quotation-constants';
import type { ShipmentDirection, ShipmentType, CargoType } from '@/types';
import type { QuotationFormValues } from '@/lib/quotation-schema';

/**
 * Centralized quotation business rules — document requirements, service
 * defaults, charge naming, and validation/suggestion logic all live
 * here, in one place, so a future new Incoterm/agency/service doesn't
 * mean hunting across several components. Every other quotation file
 * reads from this module rather than encoding its own copy of a rule.
 *
 * Deliberately a plain config/function module, not a database table —
 * same "rich but developer-defined, not full no-code" precedent already
 * used for every other catalog in this app (QUOTATION_SERVICES,
 * document_templates, stage_task_templates, etc.).
 */

// ============================================================
// REQUIRED DOCUMENTS
// ============================================================

export interface DocumentRuleContext {
  shipment_direction: ShipmentDirection | '' | null;
  shipment_type: ShipmentType | '' | null;
  incoterm: string | undefined;
  services: string[];
}

const CIF_LIKE_INCOTERMS = new Set(['CIF', 'CIP']);

/**
 * Direction base list plus mode/incoterm/service conditionals. Pure
 * function of its inputs — call it fresh whenever any input changes,
 * nothing to memoize at this data size.
 */
export function resolveRequiredDocuments(ctx: DocumentRuleContext): string[] {
  const base =
    ctx.shipment_direction === 'import'
      ? IMPORT_REQUIRED_DOCUMENTS
      : ctx.shipment_direction === 'export'
        ? EXPORT_REQUIRED_DOCUMENTS
        : [];

  const docs = new Set(base);

  if (ctx.shipment_type === 'sea' || ctx.shipment_type === 'road' || ctx.shipment_type === 'rail') {
    docs.add('Bill of Lading');
  }
  if (ctx.shipment_type === 'air') {
    docs.delete('Bill of Lading');
    docs.add('Air Waybill');
  }
  if (ctx.incoterm && CIF_LIKE_INCOTERMS.has(ctx.incoterm)) {
    docs.add('Insurance Certificate');
  }
  if (ctx.services.includes('son')) {
    docs.add('SONCAP');
  }
  if (ctx.services.includes('nafdac')) {
    docs.add('NAFDAC');
  }

  return Array.from(docs);
}

// ============================================================
// DEFAULT SERVICES
// ============================================================

const IMPORT_DEFAULT_SERVICES = ['freight_forwarding', 'customs_clearance', 'documentation', 'terminal_handling', 'delivery'];
const EXPORT_DEFAULT_SERVICES = ['documentation', 'freight_forwarding', 'terminal_handling', 'customs_clearance'];

export function resolveDefaultServices(direction: ShipmentDirection | '' | null): string[] {
  if (direction === 'import') return IMPORT_DEFAULT_SERVICES;
  if (direction === 'export') return EXPORT_DEFAULT_SERVICES;
  return [];
}

// ============================================================
// CHARGE TEMPLATES (mode-aware naming)
// ============================================================

export interface ChargeTemplate {
  description: string;
}

const MODE_AWARE_DESCRIPTIONS: Partial<Record<string, Partial<Record<ShipmentType, string>>>> = {
  freight_forwarding: {
    sea: 'Ocean Freight',
    road: 'Ocean Freight',
    rail: 'Ocean Freight',
    air: 'Air Freight',
    multimodal: 'Freight Charges',
  },
};

const STATIC_DESCRIPTIONS: Record<string, string> = {
  customs_clearance: 'Customs Clearance',
  documentation: 'Documentation Fee',
  terminal_handling: 'Terminal Handling Charge',
  warehouse: 'Warehousing',
  haulage: 'Haulage Charge',
  cargo_insurance: 'Insurance Premium',
  delivery: 'Final-Mile Delivery',
  examination: 'Cargo Examination Fee',
  son: 'SON Inspection',
  nafdac: 'NAFDAC Clearance',
  inspection: 'Pre-Shipment Inspection',
};

export function resolveChargeTemplate(
  serviceKey: string,
  ctx: { shipment_type: ShipmentType | '' | null }
): ChargeTemplate {
  const modeAware = ctx.shipment_type ? MODE_AWARE_DESCRIPTIONS[serviceKey]?.[ctx.shipment_type] : undefined;
  return { description: modeAware ?? STATIC_DESCRIPTIONS[serviceKey] ?? serviceKey };
}

// ============================================================
// VALIDATION — hard (blocks submission) and soft (suggestion only)
// ============================================================

export interface HardValidationIssue {
  path: (string | number)[];
  message: string;
}

/** Feeds quotationSchema's superRefine — same rules apply to New and Edit. */
export function getHardValidationIssues(values: Pick<QuotationFormValues, 'cargo_type' | 'container_size' | 'cbm'>): HardValidationIssue[] {
  const issues: HardValidationIssue[] = [];

  if (values.cargo_type === 'fcl' && !values.container_size) {
    issues.push({ path: ['container_size'], message: 'Container type is required for FCL shipments' });
  }
  if (values.cargo_type === 'lcl' && !(Number(values.cbm) > 0)) {
    issues.push({ path: ['cbm'], message: 'CBM is required for LCL shipments' });
  }

  return issues;
}

export interface Suggestion {
  id: string;
  message: string;
}

/** Non-blocking hints shown in the summary panel — never prevents saving. */
export function getSuggestions(values: Pick<QuotationFormValues, 'incoterm' | 'services'>): Suggestion[] {
  const suggestions: Suggestion[] = [];

  if (values.incoterm && CIF_LIKE_INCOTERMS.has(values.incoterm) && !values.services.includes('cargo_insurance')) {
    suggestions.push({
      id: 'cif-insurance',
      message: `${values.incoterm} shipments typically include cargo insurance — consider adding the Cargo Insurance service.`,
    });
  }

  return suggestions;
}
