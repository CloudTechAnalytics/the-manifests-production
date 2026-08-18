/*
# Fix: migration 066's REVOKE didn't actually lock anything down

## Root cause
Supabase provisions every new project with default privileges roughly
equivalent to:

  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

That grants EXECUTE to `anon`/`authenticated` *explicitly* at function
creation time — not merely inherited through PUBLIC. Migration 066's
`REVOKE EXECUTE ... FROM PUBLIC` therefore left those explicit grants
completely untouched: verified live against the deployed project —
`permanently_delete_organization_data` and `check_rate_limit` were both
still callable by an anonymous (anon-key-only) caller after 066 ran.

## The fix
Explicitly REVOKE EXECUTE FROM anon, authenticated (not just PUBLIC) on
every function that must not be publicly callable, then re-GRANT only to
the roles that legitimately need it. This is the same intent as 066,
just actually effective this time.
*/

REVOKE EXECUTE ON FUNCTION permanently_delete_organization_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION permanently_delete_organization_data(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION admin_force_delete_customer(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_force_delete_customer(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION provision_organization(
  uuid, text, text, text, text, text, text, text, text, text, text, text,
  integer, integer, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION provision_organization(
  uuid, text, text, text, text, text, text, text, text, text, text, text,
  integer, integer, text, text, text, text
) TO service_role;

REVOKE EXECUTE ON FUNCTION seed_default_departments(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION seed_default_departments(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit(text, integer, integer) TO service_role;

-- Legitimately callable by a signed-in user (platform_admin or that org's
-- own admin) — the function's own internal check is the real gate. Only
-- anon (never legitimately a caller) is excluded here.
REVOKE EXECUTE ON FUNCTION provision_branch_and_departments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION provision_branch_and_departments(uuid) TO authenticated;

-- Legitimately callable by any signed-in tenant user (their own org) and
-- by service_role — org_user_count/org_user_limit's own auth.role()/
-- can_access_org() check is the real gate. Only anon is excluded.
REVOKE EXECUTE ON FUNCTION org_user_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION org_user_count(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION org_user_limit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION org_user_limit(uuid) TO authenticated, service_role;
