/*
# Let platform_admin see soft-deleted organizations (Trash view)

## Problem
select_organizations currently is:
  USING (deleted_at IS NULL AND (is_platform_admin() OR id = get_user_org_id()))
The `deleted_at IS NULL` clause applies unconditionally, before the
platform_admin/org check — so a soft-deleted organization is invisible
to EVERYONE, including the platform operator. That breaks the Trash
view: there is no way to list, restore, or permanently delete a
soft-deleted org if the query that lists them returns nothing.

## Fix
Move the deleted_at check so it only applies to the org-membership
branch of the OR, not to platform_admin. A platform_admin sees every
organization regardless of deletion state; a regular org member still
only ever sees their own org, and only while it isn't deleted.
*/

DROP POLICY IF EXISTS "select_organizations" ON organizations;
CREATE POLICY "select_organizations" ON organizations FOR SELECT
  TO authenticated USING (
    is_platform_admin() OR (deleted_at IS NULL AND id = get_user_org_id())
  );
