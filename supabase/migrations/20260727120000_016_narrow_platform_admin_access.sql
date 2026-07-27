/*
# Narrow platform_admin's reach to onboarding, not tenant operations

## Problem
can_access_branch() — the helper gating every operational table (shipments,
quotations, customers, invoices, payments, expenses, warehouse_items,
warehouse_locations, shipment_plans, plan_tasks, documents, activities) —
short-circuits to TRUE for any platform_admin. That means the platform
operator role can currently read and write every tenant's shipments,
invoices, and customer data, when its actual job is registering and
onboarding organizations, not running their operations. This also cuts
against explicitly telling customers the platform operator can't see
their business data.

## Fix
Drop the is_platform_admin() bypass from can_access_branch(). Every
policy that already calls it (all of the tables listed above) becomes
tenant-safe with no further edits needed.

organizations/branches/profiles keep their platform_admin carve-outs in
can_access_org() / select_all_profiles_admin — those are onboarding
concerns (see all orgs, see all branches, see the user directory) and
are intentionally left alone.

## Side effect
Any platform_admin profile that also holds a branch_id (this schema
allows a platform_admin to double as tenant staff) loses shipments/
quotations/invoices/etc. access entirely once this runs, because its
organization_id is NULL by design — it can never match a branch's
organization_id. That is the intended effect, not a bug.

## Audit log carve-out
activities rows are metadata ("user X updated shipment Y"), not the
underlying business record. A platform-wide Audit Log page needs to
read them across every tenant, so a second, additive permissive SELECT
policy is added scoped only to is_platform_admin() — tenant staff keep
their existing branch-scoped read via select_activities_branch
untouched, since permissive policies OR together.
*/

CREATE OR REPLACE FUNCTION can_access_branch(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM branches b
    WHERE b.id = p_branch_id
      AND b.organization_id = get_user_org_id()
      AND (is_admin() OR get_user_branch_id() = p_branch_id)
  );
$$;

DROP POLICY IF EXISTS "select_activities_platform_admin" ON activities;
CREATE POLICY "select_activities_platform_admin" ON activities FOR SELECT
  TO authenticated USING (is_platform_admin());
