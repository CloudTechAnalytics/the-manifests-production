/*
 * Plan feature catalog and support tiers.
 *
 * plans.features is a free-form text[] in the database, but the platform
 * admin picks from this fixed catalog in the UI so plan cards stay
 * consistent and comparable. The stored value is the feature's `label`;
 * anything already stored that is not in this list still renders (see
 * PlansPricing), it just can't be re-selected from the chips.
 *
 * The catalog mirrors The Manifest's actual product modules (freight
 * forwarding — shipments, customs, warehouse, transportation — not case
 * management), so a plan's feature list means something concrete rather
 * than marketing copy. None of these are enforced as access gates yet
 * (every org can reach every module regardless of plan today, only
 * max_users is enforced) — this list is what a plan is sold as including.
 */

export interface FeatureDef {
  label: string;
  // Grouping is display-only, to order the chips sensibly.
  group: 'Core' | 'Finance' | 'Operations' | 'Advanced';
}

export const FEATURE_CATALOG: FeatureDef[] = [
  { label: 'Shipment Management', group: 'Core' },
  { label: 'Quotations', group: 'Core' },
  { label: 'Customer Management', group: 'Core' },
  { label: 'Shipment Tracking', group: 'Core' },
  { label: 'Document Management', group: 'Core' },
  { label: 'Basic Reports', group: 'Core' },
  { label: 'Invoicing', group: 'Finance' },
  { label: 'Payments', group: 'Finance' },
  { label: 'Expense Tracking', group: 'Finance' },
  { label: 'Rate Management', group: 'Finance' },
  { label: 'Customs Clearance', group: 'Operations' },
  { label: 'Warehouse Management', group: 'Operations' },
  { label: 'Terminal Operations', group: 'Operations' },
  { label: 'Transportation Management', group: 'Operations' },
  { label: 'Cargo Examination', group: 'Operations' },
  { label: 'Shipment Planning', group: 'Operations' },
  { label: 'Sales Pipeline', group: 'Operations' },
  { label: 'Advanced Reports', group: 'Advanced' },
  { label: 'Webhooks & API Integrations', group: 'Advanced' },
  { label: 'Audit Logs', group: 'Advanced' },
];

export const FEATURE_LABELS: string[] = FEATURE_CATALOG.map((f) => f.label);

export const SUPPORT_LEVELS: string[] = [
  'Community',
  'Email',
  'Priority Email',
  'Dedicated',
];
