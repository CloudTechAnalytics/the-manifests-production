/*
# Grant "HR & People Management" to Professional and above

## Why gated, and why this tier
Per lib/feature-gating.ts's own documented rule (migration 083's
lesson): a module only belongs in ROUTE_FEATURE_MAP if a company could
genuinely run its freight-forwarding business without it. HR & People
Capacity is real, but no shipment, invoice, or customs clearance ever
depends on it existing — it's back-office workforce tooling, the same
category as Expense Tracking and Rate Management (both Professional+
already). Basic-tier orgs don't get it; Professional, Enterprise, and
Trial (which mirrors Enterprise per migration 082) do.

## Additive append, not a full rewrite
Appends the one new label via jsonb concatenation rather than
reproducing each plan's full feature array inline (unlike migrations
075/082/083) — smaller, safer diff, and idempotent via a NOT EXISTS
guard so re-running this migration never double-adds the label.
*/

UPDATE plans
SET features = features || '["HR & People Management"]'::jsonb
WHERE slug IN ('professional', 'enterprise', 'trial')
  AND NOT (features @> '["HR & People Management"]'::jsonb);
