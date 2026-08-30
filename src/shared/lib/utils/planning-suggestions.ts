import type { Shipment, ShipmentContainer, ShipmentCustoms, TerminalOperation } from '@/shared/types';

export interface PlanningSuggestion {
  id: string;
  message: string;
  level: 'info' | 'warning';
}

const FOOD_KEYWORDS = ['food', 'beverage', 'rice', 'meat', 'fish', 'grain', 'produce', 'snack'];
const ELECTRONICS_KEYWORDS = ['electronics', 'phone', 'laptop', 'computer', 'appliance', 'gadget', 'device'];

/**
 * Non-blocking, developer-defined suggestions — same shape and
 * "plain config/function module, not a database table" precedent as
 * lib/quotation-rules.ts's getSuggestions(). Never prevents completing
 * planning, purely advisory.
 */
export function getPlanningSuggestions(input: {
  shipment: Shipment;
  containers: ShipmentContainer[];
  customs: ShipmentCustoms | null;
  terminal: TerminalOperation | null;
}): PlanningSuggestion[] {
  const { shipment, containers, customs, terminal } = input;
  const suggestions: PlanningSuggestion[] = [];
  const commodity = (shipment.commodity ?? '').toLowerCase();

  if (shipment.shipment_type === 'sea' && !shipment.vessel_name) {
    suggestions.push({
      id: 'sea-vessel-booking',
      level: 'info',
      message: 'Sea shipment — suggest booking a vessel.',
    });
  }

  if (shipment.shipment_direction === 'import' && !customs?.expected_paar_date) {
    suggestions.push({
      id: 'import-paar',
      level: 'warning',
      message: 'Import shipment — PAAR is typically required.',
    });
  }

  if (shipment.incoterm && ['CIF', 'CIP'].includes(shipment.incoterm) && !shipment.insurance_required) {
    suggestions.push({
      id: 'cif-insurance',
      level: 'info',
      message: `${shipment.incoterm} shipments typically include cargo insurance — expected but not marked as required.`,
    });
  }

  const has40ft = containers.some((c) => (c.container_type ?? '').includes('40'));
  if (has40ft && terminal && !terminal.terminal_booking_required) {
    suggestions.push({
      id: '40ft-terminal-handling',
      level: 'info',
      message: '40FT container — suggest confirming terminal handling is booked.',
    });
  }

  if (FOOD_KEYWORDS.some((kw) => commodity.includes(kw)) && !customs?.nafdac_required) {
    suggestions.push({
      id: 'food-nafdac',
      level: 'info',
      message: 'Commodity looks like food/beverage — recommend NAFDAC processing.',
    });
  }

  if (ELECTRONICS_KEYWORDS.some((kw) => commodity.includes(kw)) && !customs?.son_required) {
    suggestions.push({
      id: 'electronics-soncap',
      level: 'info',
      message: 'Commodity looks like electronics — suggest SONCAP.',
    });
  }

  if (shipment.dangerous_cargo) {
    suggestions.push({
      id: 'dangerous-goods-docs',
      level: 'warning',
      message: 'Hazardous goods — DG documentation is required.',
    });
  }

  return suggestions;
}
