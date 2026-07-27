/*
 * Plan feature catalog and support tiers.
 *
 * plans.features is a free-form text[] in the database, but the platform
 * admin picks from this fixed catalog in the UI so plan cards stay
 * consistent and comparable. The stored value is the feature's `label`;
 * anything already stored that is not in this list still renders (see
 * PlansPricing), it just can't be re-selected from the chips.
 *
 * The catalog mirrors The Manifest's actual product modules, so a plan's
 * feature list means something concrete rather than marketing copy.
 */

export interface FeatureDef {
  label: string;
  // Grouping is display-only, to order the chips sensibly.
  group: 'Core' | 'Finance' | 'Advanced';
}

export const FEATURE_CATALOG: FeatureDef[] = [
  { label: 'Case Management', group: 'Core' },
  { label: 'Calendar', group: 'Core' },
  { label: 'Tasks', group: 'Core' },
  { label: 'Basic Reports', group: 'Core' },
  { label: 'Billing', group: 'Finance' },
  { label: 'Invoices', group: 'Finance' },
  { label: 'Advanced Reports', group: 'Advanced' },
  { label: 'Document Versioning', group: 'Advanced' },
  { label: 'AI Features', group: 'Advanced' },
  { label: 'Custom Branding', group: 'Advanced' },
  { label: 'SSO', group: 'Advanced' },
  { label: 'Audit Logs', group: 'Advanced' },
];

export const FEATURE_LABELS: string[] = FEATURE_CATALOG.map((f) => f.label);

export const SUPPORT_LEVELS: string[] = [
  'Community',
  'Email',
  'Priority Email',
  'Dedicated',
];
