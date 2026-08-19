/*
# platform_dashboard_stats: add active_today

## Why
The Platform Console dashboard is being restyled to match a two-row KPI
grouping (org/subscription metrics, then user/activity metrics) that
includes "Active Today" — distinct staff who logged an action today.
That's a real, meaningful number (not fabricated), computed the same
way the rest of platform_dashboard_stats() already is: one more
subquery in the same SQL aggregate, still SECURITY INVOKER so it stays
correctly scoped by the caller's own RLS.
*/

CREATE OR REPLACE FUNCTION platform_dashboard_stats()
RETURNS TABLE (
  total_organizations bigint,
  active_organizations bigint,
  total_users bigint,
  active_users bigint,
  platform_team_count bigint,
  new_users_this_month bigint,
  active_today bigint
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
       AND p.created_at >= date_trunc('month', now())),
    (SELECT count(DISTINCT user_id) FROM activities
       WHERE created_at >= date_trunc('day', now()) AND user_id IS NOT NULL);
$$;

GRANT EXECUTE ON FUNCTION platform_dashboard_stats() TO authenticated;
