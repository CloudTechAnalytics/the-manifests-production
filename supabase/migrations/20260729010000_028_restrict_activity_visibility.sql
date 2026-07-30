/*
# Staff shouldn't see each other's activity — only admin/branch_manager should

## Problem
select_activities_branch only checks can_access_branch(branch_id), which
is purely a branch-membership test — it says nothing about role. Every
staff member in a branch (operations, sales, finance) could therefore
read every OTHER staff member's logged actions in that branch, e.g. a
sales user seeing that an admin deleted a user in operations. Only
admin and branch_manager should have that oversight; everyone else
should see just their own activity.

## Fix
Add an is_branch_manager() helper (mirrors is_admin()), then narrow
select_activities_branch: within a branch the caller can already access,
admin and branch_manager still see every row, but anyone else only sees
rows where they are the actor (user_id = auth.uid()). This also narrows
the dashboard's "Recent Activity" widget, since it reads the same table
under the same RLS.

select_activities_platform_admin and select_activities_org_admin are
untouched — cross-tenant platform oversight and org-level (branch-less)
visibility for org admins are a separate concern from this.
*/

CREATE OR REPLACE FUNCTION is_branch_manager()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'branch_manager' AND is_active = true);
$$;

DROP POLICY IF EXISTS "select_activities_branch" ON activities;
CREATE POLICY "select_activities_branch" ON activities FOR SELECT
  TO authenticated
  USING (
    can_access_branch(branch_id)
    AND (is_admin() OR is_branch_manager() OR user_id = auth.uid())
  );
