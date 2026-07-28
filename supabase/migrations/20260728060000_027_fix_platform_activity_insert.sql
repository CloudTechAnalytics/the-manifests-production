/*
# Fix: platform-level audit log writes were silently rejected

## Problem
Migration 022 made activities.branch_id nullable and added
organization_id specifically so platform_admin actions with no branch
(creating an organization, suspending it, assigning a subscription,
editing a plan, etc.) could be logged. But the only INSERT policy on
activities is still:

  insert_activities_branch: WITH CHECK (can_access_branch(branch_id) ...)

can_access_branch(NULL) always evaluates to false — its EXISTS subquery
filters on `b.id = p_branch_id`, and NULL never equals anything in SQL.
Every platform-console mutation inserts an activity row with branch_id
omitted (NULL) and organization_id set instead, so every one of those
inserts has been silently rejected by RLS since migration 022 shipped —
invisible because the app fire-and-forgets these inserts without
checking the error. /platform/audit-logs has never shown an org
lifecycle, plan, or subscription change as a result.

## Fix
Add a second, additive INSERT policy scoped to exactly this case:
branch_id IS NULL and the caller is a platform_admin. This mirrors the
existing select_activities_platform_admin carve-out from migration 016
and doesn't touch tenant-side activity logging at all.

## Second, related gap
The same NULL-branch_id problem blocks tenant admins from ever reading
their own organization's branch-less activity rows (e.g. "invited a
user with no branch yet", "created an admin with no branch yet") —
select_activities_branch also filters on can_access_branch(branch_id),
false for NULL. Only a platform_admin could see these, via the
separate platform-wide policy, even though the admin who performed the
action can't see their own history. Adds a matching SELECT policy so an
org's own admin can read their org's branch-less rows.
*/

CREATE POLICY "insert_activities_platform_admin" ON activities FOR INSERT
  TO authenticated
  WITH CHECK (branch_id IS NULL AND is_platform_admin() AND user_id = auth.uid());

CREATE POLICY "select_activities_org_admin" ON activities FOR SELECT
  TO authenticated
  USING (branch_id IS NULL AND organization_id = get_user_org_id() AND is_admin());
