/*
# Security fix: a branch admin could manage any user in the org, including the org admin

## The bug
"Branch admin" isn't a distinct role — it's `role = 'admin'` with a
branch_id set (an org-wide admin has `branch_id IS NULL`). The
add/invite dialogs already knew this and locked a branch admin to
their own branch. Nothing else did:

- `update_all_profiles_admin` (RLS on profiles) only checked
  `is_admin() AND organization_id = get_user_org_id()` — any admin,
  branch-scoped or not, could UPDATE any profile in the org. This is
  what let a branch admin edit or disable the org-wide admin's
  account from the Users page, and it's enforced at the database
  level, not just hidden in the UI — a direct API call had the same
  hole.
- `reset-user-password` didn't check organization at all (only that
  the caller was *some* admin), let alone branch — a genuine
  cross-tenant bug, not just cross-branch.
- `update-user-roles` checked organization but not branch.

## The fix
One function, `can_manage_user(target_branch_id, target_org_id)`,
used by the RLS policy and called via RPC from both edge functions —
so the rule lives in exactly one place. An org-wide admin
(branch_id IS NULL) can manage anyone in their org, same as before. A
branch admin can only manage users whose branch_id matches their own.
platform_admin is unrestricted, matching every other admin policy in
this schema.
*/

CREATE OR REPLACE FUNCTION can_manage_user(p_target_branch_id uuid, p_target_org_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT is_platform_admin()
    OR (
      is_admin()
      AND p_target_org_id = get_user_org_id()
      AND (get_user_branch_id() IS NULL OR get_user_branch_id() = p_target_branch_id)
    );
$$;

GRANT EXECUTE ON FUNCTION can_manage_user(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "update_all_profiles_admin" ON profiles;
CREATE POLICY "update_all_profiles_admin" ON profiles FOR UPDATE
  TO authenticated
  USING (can_manage_user(branch_id, organization_id))
  WITH CHECK (can_manage_user(branch_id, organization_id));
