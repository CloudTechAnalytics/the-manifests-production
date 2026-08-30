import type { Quotation } from '@/shared/types';

/**
 * Client-side mirror of convert_quotation_to_shipment()'s server-side
 * validation (supabase/migrations/..._053_shipment_conversion_engine.sql)
 * — same checks, same order, so the confirm dialog can show every
 * missing item before the RPC call even happens. This is UX only; the
 * RPC re-checks everything itself and is the real gate (never trust the
 * client alone).
 */
export function getConversionBlockers(quotation: Pick<
  Quotation,
  | 'status'
  | 'customer_id'
  | 'origin_port'
  | 'origin'
  | 'destination_port'
  | 'destination'
  | 'shipment_type'
  | 'commodity_description'
  | 'cargo_type'
  | 'container_count'
  | 'packages_count'
  | 'services'
>): string[] {
  const blockers: string[] = [];

  if (quotation.status !== 'accepted') {
    blockers.push('Quotation must be Accepted before it can become a shipment');
  }
  if (!quotation.customer_id) {
    blockers.push('Customer');
  }
  if (!(quotation.origin_port || quotation.origin)) {
    blockers.push('Origin');
  }
  if (!(quotation.destination_port || quotation.destination)) {
    blockers.push('Destination');
  }
  if (!quotation.shipment_type) {
    blockers.push('Shipment Type');
  }
  if (!quotation.commodity_description) {
    blockers.push('Cargo / Commodity Description');
  }
  if (quotation.cargo_type === 'fcl' && !(quotation.container_count && quotation.container_count > 0)) {
    blockers.push('Container Information (FCL requires at least one container)');
  }
  if (quotation.cargo_type === 'lcl' && !(quotation.packages_count && quotation.packages_count > 0)) {
    blockers.push('Package Information (LCL requires package count)');
  }
  if (!quotation.services || quotation.services.length === 0) {
    blockers.push('At least one Service');
  }

  return blockers;
}
