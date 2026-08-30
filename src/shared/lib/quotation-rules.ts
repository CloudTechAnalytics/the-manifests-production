import { supabase } from '@/shared/lib/supabase/client';
import {
  IMPORT_REQUIRED_DOCUMENTS,
  EXPORT_REQUIRED_DOCUMENTS,
  NOT_INCLUDED_SERVICE_OPTIONS,
  type NotIncludedOption,
} from '@/shared/lib/quotation-constants';
import type { ShipmentDirection, ShipmentType, CargoType } from '@/shared/types';
import type { QuotationFormValues } from '@/shared/lib/quotation-schema';

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
// SCOPE OF SERVICE (dynamic — no hardcoded lists in components)
// ============================================================

/**
 * Customer-facing wording for the Scope of Service "Included" list —
 * deliberately separate from QUOTATION_SERVICES[].label, which is the
 * short name used in the Services Required checkbox grid. A scope-of-
 * service line reads better as "Storage Services" than "Warehouse".
 */
const SCOPE_OF_SERVICE_LABELS: Record<string, string> = {
  freight_forwarding: 'Freight Forwarding',
  customs_clearance: 'Customs Clearance',
  documentation: 'Documentation',
  terminal_handling: 'Terminal Handling',
  warehouse: 'Storage Services',
  haulage: 'Inland Haulage',
  delivery: 'Final Delivery',
  cargo_insurance: 'Cargo Insurance',
  son: 'SON Processing',
  nafdac: 'NAFDAC Processing',
  examination: 'Customs Examination Support',
  inspection: 'Cargo Inspection',
};

export function resolveScopeOfServiceLabel(serviceKey: string): string {
  return SCOPE_OF_SERVICE_LABELS[serviceKey] ?? serviceKey;
}

/**
 * "Not Included" is never manually edited — it's the full catalog minus
 * whatever's tied to an already-selected service, so it can never
 * contradict what's shown as Included. See NotIncludedOption's doc
 * comment in quotation-constants.ts for the correlation design.
 */
export function resolveExcludedServiceOptions(selectedServices: string[]): NotIncludedOption[] {
  return NOT_INCLUDED_SERVICE_OPTIONS.filter(
    (option) => !option.relatedServiceKey || !selectedServices.includes(option.relatedServiceKey)
  );
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
// DEFAULT RATE (from the existing freight_rate_cards table)
// ============================================================

export interface RateContext {
  branchId: string | null;
  originPort: string;
  destinationPort: string;
  shipmentType: ShipmentType | '' | null;
}

/**
 * Only 'freight_forwarding' has a real backing rate source today — the
 * trade-lane buy/sell tariffs already managed on the Rate Cards page
 * (freight_rate_cards). Every other service has no rate table anywhere
 * in this schema, so it correctly and honestly returns null ("Rate not
 * configured") rather than inventing a number. Best-effort match on
 * origin/destination text + mode, scoped to the quotation's branch,
 * respecting the rate's validity window.
 */
export async function resolveDefaultRate(serviceKey: string, ctx: RateContext): Promise<number | null> {
  if (serviceKey !== 'freight_forwarding') return null;
  if (!ctx.branchId || !ctx.originPort.trim() || !ctx.destinationPort.trim()) return null;

  let query = supabase
    .from('freight_rate_cards')
    .select('sell_rate, valid_from, valid_to')
    .eq('branch_id', ctx.branchId)
    .ilike('trade_lane_origin', ctx.originPort.trim())
    .ilike('trade_lane_destination', ctx.destinationPort.trim())
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (ctx.shipmentType) {
    query = query.eq('shipment_type', ctx.shipmentType);
  }

  const { data } = await query.maybeSingle();
  if (!data) return null;

  const today = new Date().toISOString().split('T')[0];
  if (data.valid_from && data.valid_from > today) return null;
  if (data.valid_to && data.valid_to < today) return null;

  return Number(data.sell_rate);
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
  /** 'warning' = something a real quotation for this shipment normally
   *  needs and is currently missing; 'info' = a lighter recommendation. */
  level: 'warning' | 'info';
}

type SuggestionContext = Pick<
  QuotationFormValues,
  'incoterm' | 'services' | 'shipment_direction' | 'cargo_type' | 'required_documents'
>;

/** Non-blocking hints shown in the summary panel — never prevents saving. */
export function getSuggestions(values: SuggestionContext): Suggestion[] {
  const suggestions: Suggestion[] = [];

  if (values.incoterm && CIF_LIKE_INCOTERMS.has(values.incoterm) && !values.services.includes('cargo_insurance')) {
    suggestions.push({
      id: 'cif-insurance',
      level: 'info',
      message: `${values.incoterm} shipments typically include cargo insurance — consider adding the Cargo Insurance service.`,
    });
  }
  if (values.shipment_direction === 'import' && !values.services.includes('customs_clearance')) {
    suggestions.push({
      id: 'import-customs-clearance',
      level: 'warning',
      message: 'Import shipments normally require Customs Clearance — this quotation doesn’t include it yet.',
    });
  }
  if (values.shipment_direction === 'import' && !values.services.includes('documentation')) {
    suggestions.push({
      id: 'import-documentation',
      level: 'warning',
      message: 'Import shipments normally require Documentation — this quotation doesn’t include it yet.',
    });
  }
  if (values.shipment_direction === 'export' && !values.required_documents.includes('Shipping Instructions')) {
    suggestions.push({
      id: 'export-shipping-instructions',
      level: 'warning',
      message: 'Export shipments normally require Shipping Instructions — add it to Required Documents.',
    });
  }
  if (values.cargo_type === 'fcl' && !values.services.includes('terminal_handling')) {
    suggestions.push({
      id: 'fcl-terminal-handling',
      level: 'info',
      message: 'FCL shipments typically include Terminal Handling — consider adding the service.',
    });
  }
  if (values.cargo_type === 'lcl' && !values.services.includes('warehouse')) {
    suggestions.push({
      id: 'lcl-warehouse',
      level: 'info',
      message: 'LCL shipments often need consolidation/deconsolidation — consider adding the Warehouse service.',
    });
  }

  return suggestions;
}
