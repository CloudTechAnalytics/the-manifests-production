/*
# Lock down EXECUTE on privileged SECURITY DEFINER functions

## What this closes
PostgreSQL grants EXECUTE on a newly created function to PUBLIC by
default — which PostgREST/Supabase then exposes to both `anon` and
`authenticated` as a callable RPC, unless explicitly revoked. Several
SECURITY DEFINER functions were written to be called only from a trusted
context (a service-role edge function that has already done its own
auth check, or nowhere at all except from inside another function) and
never had that default closed off. Two of these are pre-existing and
genuinely severe:

  - permanently_delete_organization_data(p_org_id) — no internal check at
    all. Any authenticated caller, or an anon (unauthenticated) caller,
    could invoke it directly for ANY organization id and permanently wipe
    its shipments/customers/invoices/payments/quotations/warehouse data,
    completely bypassing delete-organization's own platform_admin check.
  - admin_force_delete_customer(p_customer_id) — same shape, for a single
    customer's full record chain, bypassing admin-delete-record's own
    same-organization admin check.

Both were found while reviewing this migration set's own new functions
for the same class of gap (spec section 22's authorization-bypass /
privilege-escalation checks) — fixed here since they sit squarely in the
organization/tenant lifecycle this feature extends.

## The fix, per function
- Functions with NO legitimate direct-client use case (only ever called
  from a service-role edge function, or only from inside another
  function): REVOKE EXECUTE FROM PUBLIC, GRANT to service_role only.
  Calls from *inside* another SECURITY DEFINER function are unaffected —
  those run as the function owner, not the original caller's role.
- provision_branch_and_departments already has an internal
  is_platform_admin()/is_admin() check — tightened to `authenticated`
  only (excludes anon outright; the internal check would already reject
  it, this is defense in depth).
- org_user_count/org_user_limit ARE meant to be called directly by any
  signed-in tenant user (Users page, onboarding, the dashboard trial
  banner) for their OWN organization, and by the service-role client from
  create-user/invite-user/accept-invite for the org being written to.
  Rather than lock these down and break both callers, they gain an
  internal guard: service_role always passes (auth.role() = 'service_role'
  — auth.uid() is NULL in that context, so can_access_org() alone can't
  recognize it); anyone else must pass can_access_org(p_org_id), same
  tenant boundary RLS would enforce. A caller outside the org gets NULL
  (indistinguishable from "no subscription"), not another org's numbers.
*/

REVOKE EXECUTE ON FUNCTION permanently_delete_organization_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION permanently_delete_organization_data(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION admin_force_delete_customer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_force_delete_customer(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION provision_organization(
  uuid, text, text, text, text, text, text, text, text, text, text, text,
  integer, integer, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION provision_organization(
  uuid, text, text, text, text, text, text, text, text, text, text, text,
  integer, integer, text, text, text, text
) TO service_role;

REVOKE EXECUTE ON FUNCTION seed_default_departments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_default_departments(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION check_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_rate_limit(text, integer, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION provision_branch_and_departments(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION provision_branch_and_departments(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION org_user_count(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT can_access_org(p_org_id) THEN
    RETURN NULL;
  END IF;
  RETURN (
    SELECT count(*)::int FROM profiles
    WHERE organization_id = p_org_id AND deleted_at IS NULL AND is_active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION org_user_limit(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT can_access_org(p_org_id) THEN
    RETURN NULL;
  END IF;
  RETURN (
    SELECT p.max_users FROM org_subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.organization_id = p_org_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION org_user_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION org_user_count(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION org_user_limit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION org_user_limit(uuid) TO authenticated, service_role;
