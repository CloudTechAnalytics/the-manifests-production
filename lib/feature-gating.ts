/*
 * Route -> plan feature map.
 *
 * Maps a module's URL prefix to the FEATURE_CATALOG label (lib/plans.ts)
 * that must be in an organization's plan for it to be reachable. Deliberately
 * excludes Dashboard, Calendar, Work Queue, Approvals, Users, Settings,
 * Platform Console — those are cross-cutting utilities, not a sellable
 * module, so every org keeps them regardless of plan. Reports/Customers/
 * Shipments/Quotations/Tracking/Documents map to Core features that every
 * real plan (Basic and up) already includes, so gating them is a no-op for
 * paying customers — it only bites a plan that's missing a feature by
 * design (e.g. a custom/edited plan with something unchecked).
 *
 * This is UI-layer gating only: it hides nav entries and blocks the route
 * from rendering. It does not touch RLS, so a request made directly against
 * the REST API (bypassing the app) is not blocked by this — the same
 * caveat already applies to org_user_count/org_user_limit (migration 064).
 */
export const ROUTE_FEATURE_MAP: { prefix: string; feature: string }[] = [
  { prefix: '/shipments', feature: 'Shipment Management' },
  { prefix: '/quotations', feature: 'Quotations' },
  { prefix: '/customers', feature: 'Customer Management' },
  { prefix: '/tracking', feature: 'Shipment Tracking' },
  { prefix: '/documents', feature: 'Document Management' },
  { prefix: '/invoices', feature: 'Invoicing' },
  { prefix: '/payments', feature: 'Payments' },
  { prefix: '/expenses', feature: 'Expense Tracking' },
  { prefix: '/rates', feature: 'Rate Management' },
  { prefix: '/customs', feature: 'Customs Clearance' },
  { prefix: '/warehouse', feature: 'Warehouse Management' },
  { prefix: '/terminal', feature: 'Terminal Operations' },
  { prefix: '/transportation', feature: 'Transportation Management' },
  { prefix: '/examination', feature: 'Cargo Examination' },
  { prefix: '/planning', feature: 'Shipment Planning' },
  { prefix: '/sales', feature: 'Sales Pipeline' },
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
