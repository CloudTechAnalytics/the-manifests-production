/*
# Trial plan: 10 users -> 3 users, and a subscription backfill for feature gating

## Why
1. The Trial plan's max_users is being tightened from 10 to 3, so a
   registering company can genuinely evaluate the product without the
   trial itself acting as a free 10-seat tier.

2. Feature gating (app/(app)/layout.tsx + components/layout/sidebar.tsx)
   resolves an organization's available modules from
   org_subscriptions -> plans.features. Any organization with literally no
   org_subscriptions row (the internal seed org from migration 001, and
   any org created through the platform admin's "Free trial, no plan yet"
   path before this same change fixed it to always write one) needs to
   keep working exactly as it does today rather than suddenly losing
   access to modules it's already using — so it's backfilled onto
   Enterprise (full feature set), not Trial. Going forward, every org
   gets a real subscription row at creation time (self-service always did;
   the manual "Free trial" path now does too), so this backfill should
   only ever need to run once.
*/

UPDATE plans SET max_users = 3 WHERE slug = 'trial';

INSERT INTO org_subscriptions (organization_id, plan_id, status, trial_ends_at, started_at)
SELECT o.id, (SELECT id FROM plans WHERE slug = 'enterprise'), 'active', NULL, now()
FROM organizations o
WHERE o.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM org_subscriptions s WHERE s.organization_id = o.id)
  AND EXISTS (SELECT 1 FROM plans WHERE slug = 'enterprise');
