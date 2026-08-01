/*
# Security fix: branches write policies were never org-scoped

## The bug
`branches.organization_id` was added in migration 014
(organizations_multi_tenancy) and the SELECT policy on `branches` was
updated to check it (`can_access_org(organization_id)`), but the
INSERT/UPDATE/DELETE policies were never touched — they still date to
migration 005 and only check `is_admin()` globally, with no comparison
against the caller's own organization at all.

Practical effect: any user with role `admin`, in ANY organization,
could UPDATE or DELETE another organization's branch, or INSERT a new
branch row under another organization's id — a real cross-tenant
write, not a theoretical one. `insert_profiles_admin` has the same gap
(narrower blast radius since no client code calls it directly — all
profile creation goes through service-role edge functions — but RLS is
supposed to be the actual boundary regardless of what the UI exposes).

## The fix
Re-point all four policies at the same `is_admin() AND organization_id
= get_user_org_id()` pattern already used correctly by
select_all_profiles_admin, update_all_profiles_admin, and the
invitations policies — this isn't a new pattern, just applying the
existing one where it was missed. platform_admin is intentionally not
special-cased here: platform-level branch/profile management already
goes through the platform console's own service-role edge functions,
not these client-facing RLS policies.
*/

DROP POLICY IF EXISTS "insert_branches_admin" ON branches;
CREATE POLICY "insert_branches_admin" ON branches FOR INSERT
  TO authenticated WITH CHECK (
    is_admin() AND organization_id = get_user_org_id()
  );

DROP POLICY IF EXISTS "update_branches_admin" ON branches;
CREATE POLICY "update_branches_admin" ON branches FOR UPDATE
  TO authenticated
  USING (is_admin() AND organization_id = get_user_org_id())
  WITH CHECK (is_admin() AND organization_id = get_user_org_id());

DROP POLICY IF EXISTS "delete_branches_admin" ON branches;
CREATE POLICY "delete_branches_admin" ON branches FOR DELETE
  TO authenticated USING (
    is_admin() AND organization_id = get_user_org_id()
  );

DROP POLICY IF EXISTS "insert_profiles_admin" ON profiles;
CREATE POLICY "insert_profiles_admin" ON profiles FOR INSERT
  TO authenticated WITH CHECK (
    is_platform_admin() OR (is_admin() AND organization_id = get_user_org_id())
  );
