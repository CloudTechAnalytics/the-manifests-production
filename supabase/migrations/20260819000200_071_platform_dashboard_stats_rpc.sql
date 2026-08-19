/*
# platform_dashboard_stats — one aggregate query instead of fetching
  every organization and every profile on the entire platform

## Why
use-platform-dashboard-data.ts fetched full organizations and profiles
rows (narrow columns, but every row, unbounded) just to .length/.filter
count them in JavaScript for the platform dashboard's stat tiles. Unlike
a tenant-scoped query, this scales with the WHOLE PLATFORM's org/user
count — every new customer signup made this page marginally slower for
every platform admin, forever. A simple .limit() would have been wrong,
not just slow: these numbers are presented as true totals, and silently
capping them would make "Total Organizations: 5000" lie once the
platform passed that count.

## SECURITY INVOKER, same reasoning as customer_shipment_quotation_counts
Runs under the calling user's own RLS. A platform_admin's RLS grants
full cross-org visibility (existing policies, unchanged by this
migration), so they get the real platform-wide numbers; anyone else's
RLS restricts them to their own organization's rows, so they'd just get
their own org's count — never another tenant's data. No lockdown needed.
*/

CREATE OR REPLACE FUNCTION platform_dashboard_stats()
RETURNS TABLE (
  total_organizations bigint,
  active_organizations bigint,
  total_users bigint,
  active_users bigint,
  platform_team_count bigint,
  new_users_this_month bigint
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT
    (SELECT count(*) FROM organizations WHERE deleted_at IS NULL),
    (SELECT count(*) FROM organizations WHERE deleted_at IS NULL AND is_active = true),
    -- "still exists" mirrors the app's own prior JS logic exactly: a
    -- member whose organization was moved to Trash shouldn't count
    -- toward Total Users, or the two numbers would contradict each
    -- other (0 organizations, 1 user).
    (SELECT count(*) FROM profiles p JOIN organizations o ON o.id = p.organization_id
       WHERE p.deleted_at IS NULL AND p.role <> 'platform_admin' AND o.deleted_at IS NULL),
    (SELECT count(*) FROM profiles p JOIN organizations o ON o.id = p.organization_id
       WHERE p.deleted_at IS NULL AND p.role <> 'platform_admin' AND o.deleted_at IS NULL
       AND p.is_active = true),
    (SELECT count(*) FROM profiles WHERE deleted_at IS NULL AND role = 'platform_admin'),
    (SELECT count(*) FROM profiles p JOIN organizations o ON o.id = p.organization_id
       WHERE p.deleted_at IS NULL AND p.role <> 'platform_admin' AND o.deleted_at IS NULL
       AND p.created_at >= date_trunc('month', now()));
$$;

GRANT EXECUTE ON FUNCTION platform_dashboard_stats() TO authenticated;
