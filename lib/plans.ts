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
 * than marketing copy. Enforced as real access gating in the app shell —
 * see lib/feature-gating.ts and hooks/use-org-plan.ts.
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

export interface PlanFeatureDisplay {
  /** Null for the lowest-priced tier (nothing to diff against) — render
   *  its full feature list plainly. Set for every higher tier, whose
   *  list is usually a superset of the one below it. */
  baseName: string | null;
  /** Full list when baseName is null; otherwise only the features not
   *  already in the base plan — "Everything in Basic, plus:" below it. */
  features: string[];
}

/**
 * Two plans both listing 6-13 mostly-identical features read as "these
 * are basically the same tier" at a glance — the actual difference is
 * buried in a full re-read of each bullet list. This turns every plan
 * after the cheapest into an explicit "Everything in {cheaper plan},
 * plus:" plus only its own new features, sorted by ascending
 * monthly_price so "cheaper" always means the tier immediately below.
 * Falls back to the full list if a plan's features aren't actually a
 * superset of the one below it (e.g. a custom-edited plan) — never
 * hides a feature the plan really has.
 */
export function diffPlanFeatures(
  plans: { name: string; monthly_price: number; features: string[] }[]
): PlanFeatureDisplay[] {
  const sorted = [...plans].sort((a, b) => a.monthly_price - b.monthly_price);
  return plans.map((plan) => {
    const idx = sorted.indexOf(plan);
    const base = idx > 0 ? sorted[idx - 1] : null;
    if (!base) return { baseName: null, features: plan.features };

    const newOnes = plan.features.filter((f) => !base.features.includes(f));
    // Not actually a superset (a custom/edited plan) — the diff would
    // silently drop features the base plan has that this one doesn't,
    // which is worse than just showing everything.
    const isSuperset = base.features.every((f) => plan.features.includes(f));
    if (!isSuperset || newOnes.length === 0) return { baseName: null, features: plan.features };

    return { baseName: base.name, features: newOnes };
  });
}
