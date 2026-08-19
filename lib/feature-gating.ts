/*
 * Route -> plan feature map.
 *
 * Maps a module's URL prefix to the FEATURE_CATALOG label (lib/plans.ts)
 * that must be in an organization's plan for it to be reachable.
 *
 * Deliberately NOT gated, on top of the obvious cross-cutting utilities
 * (Dashboard, Calendar, Work Queue, Approvals, Users, Settings, Platform
 * Console): Shipments, Quotations, Customers, Tracking, Documents,
 * Invoices, Payments, Customs, Terminal, Transportation, Examination,
 * Planning, Sales. migration 035's workflow_stage_catalog is the actual
 * source of truth for what a shipment goes through — planning,
 * documentation, regulatory_compliance, customs_clearance, terminal_
 * operations, and transportation are all is_optional = false, mandatory
 * for every shipment on every plan; cargo_examination and warehouse are
 * only optional *per shipment* (this cargo doesn't need physical
 * inspection or storage), not by subscription tier. An earlier version of
 * this map gated Planning/Terminal/Transportation/Examination behind
 * Enterprise and Invoicing/Payments behind Professional+, which meant a
 * Basic or Professional org could have a shipment stuck at a mandatory
 * stage with no way to reach the page that manages it, or be unable to
 * bill its own customers — found live, testing a non-Enterprise account.
 * Never repeat that mistake here: a module only belongs in this map if a
 * company could genuinely run its freight-forwarding business without it,
 * not merely if a given shipment happens not to need it this time.
 *
 * What's left as real tier differentiators: Expense Tracking, Rate
 * Management, and Audit Logs are back-office/governance depth, not
 * required to move cargo or get paid.
 *
 * This is UI-layer gating only: it hides nav entries and blocks the route
 * from rendering. It does not touch RLS, so a request made directly against
 * the REST API (bypassing the app) is not blocked by this — the same
 * caveat already applies to org_user_count/org_user_limit (migration 064).
 */
export const ROUTE_FEATURE_MAP: { prefix: string; feature: string }[] = [
  { prefix: '/expenses', feature: 'Expense Tracking' },
  { prefix: '/rates', feature: 'Rate Management' },
  { prefix: '/activity-log', feature: 'Audit Logs' },
];

/** The feature label required to reach `pathname`, or null if it isn't
 *  gated (open to every org regardless of plan). */
export function featureForPath(pathname: string): string | null {
  const hit = ROUTE_FEATURE_MAP.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)
  );
  return hit?.feature ?? null;
}
