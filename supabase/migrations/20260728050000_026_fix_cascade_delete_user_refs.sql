/*
# Fix: cascade delete still blocked by created_by/updated_by references

## What broke
Deleting "Blue Economy Agency" failed with GoTrue's generic "Database
error deleting user" the moment its branch had any real business data.
Cause: `created_by`/`updated_by` (and, on expenses, `paid_by`/
`approved_by`) on profiles, customers, quotations, shipments, invoices,
payments, payment_allocations, and expenses all reference
`auth.users(id)` with no ON DELETE action (implicit RESTRICT) — a
sensible default for everyday use (don't silently lose "who did this"
attribution), but fatal for a real cascade:

1. delete-organization deleted member auth accounts BEFORE running this
   function, but Postgres refuses to delete an auth user while any
   shipment/customer/invoice/etc. still lists them as created_by.
2. Even with that reordered, profiles.created_by/updated_by point at
   OTHER members of the same org (whoever created/edited that profile),
   so deleting one member could still fail if another member's profile
   still names them as its creator.

## Fix
This function now also nulls out every org member's profile
created_by/updated_by first (breaking the member-to-member reference
chain), unconditionally — not just when branches exist, since the
previous version returned early before this ran for a branch-less org.
delete-organization is updated separately to call this function BEFORE
deleting any auth account, not after, so every business-data row that
could reference a member is gone before that member's login is removed.
*/

CREATE OR REPLACE FUNCTION permanently_delete_organization_data(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_branch_ids uuid[];
BEGIN
  -- Breaks the profile-to-profile created_by/updated_by chain so
  -- deleting one member's auth account can never be blocked by another
  -- member's profile still naming them as its creator/editor.
  UPDATE profiles
  SET created_by = NULL, updated_by = NULL
  WHERE organization_id = p_org_id;

  SELECT array_agg(id) INTO v_branch_ids FROM branches WHERE organization_id = p_org_id;

  IF v_branch_ids IS NULL THEN
    RETURN; -- no branches, nothing further to cascade
  END IF;

  DELETE FROM stock_movements WHERE branch_id = ANY(v_branch_ids);
  DELETE FROM documents WHERE branch_id = ANY(v_branch_ids);

  DELETE FROM invoices WHERE branch_id = ANY(v_branch_ids);
  DELETE FROM payments WHERE branch_id = ANY(v_branch_ids);
  DELETE FROM quotations WHERE branch_id = ANY(v_branch_ids);
  DELETE FROM shipments WHERE branch_id = ANY(v_branch_ids);
  DELETE FROM shipment_plans WHERE branch_id = ANY(v_branch_ids);
  DELETE FROM expenses WHERE branch_id = ANY(v_branch_ids);

  DELETE FROM customers WHERE branch_id = ANY(v_branch_ids);

  DELETE FROM stock_items WHERE branch_id = ANY(v_branch_ids);
  DELETE FROM warehouses WHERE branch_id = ANY(v_branch_ids);

  DELETE FROM branches WHERE organization_id = p_org_id;
END;
$$;
