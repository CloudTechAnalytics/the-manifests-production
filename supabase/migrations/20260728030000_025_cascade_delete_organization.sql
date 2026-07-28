/*
# Full cascade delete for an organization's business data

## Problem
Permanent delete of an organization refused to run while it had any
branches, because every operational table (shipments, customers,
quotations, invoices, payments, expenses, warehouse, documents) is
RESTRICTed to its branch — a real safety rail for everyday use, but the
platform operator explicitly wants a genuine "delete this organization,
everything in it, permanently" action, confirmed as intentionally
irreversible.

## Why a single SQL function instead of sequential deletes from the edge
   function
Deleting ~12 tables one Supabase client call at a time is not atomic —
if call #7 failed, the six before it would already be committed,
leaving the organization half-destroyed (worse than the original
all-or-nothing guard). A single PL/pgSQL function runs in one
transaction: every delete succeeds, or none of them do.

## Deletion order (verified against every FK in the schema, not guessed)
1. stock_movements — the one child table that is NOT cascade-deleted by
   its parents (item_id/warehouse_id/to_warehouse_id are all RESTRICT,
   an intentional immutable-ledger rule) — must go first.
2. documents — branch_id is RESTRICT; its shipment_id/customer_id/plan_id
   links are already ON DELETE CASCADE from their respective parents, so
   most rows would disappear on their own once step 3 runs, but this
   explicit pass makes the order not depend on getting step 3 exactly
   right, and is a no-op for anything already gone.
3. invoices, payments, quotations, shipments, shipment_plans, expenses —
   none of these reference each other with RESTRICT (invoices/shipment_plans
   link to shipments/quotations via ON DELETE SET NULL), so they can all
   go in one breath. Deleting them cascades payment_allocations,
   quotation_items, shipment_timeline, and plan_tasks automatically.
4. customers — only safe now that every RESTRICT reference to it
   (invoices, payments, quotations, shipments, shipment_plans) is gone.
   Cascades customer_contacts.
5. stock_items, warehouses — safe now that stock_movements is gone.
   Cascades warehouse_stock (CASCADE from both sides).
6. branches themselves.

Member accounts are NOT touched here — deleting a Supabase Auth user
needs the Admin API, not raw SQL, so that stays in the delete-organization
edge function exactly as it already works, and must complete first: this
function's caller is expected to have already removed every profile in
the organization, since profiles.organization_id is itself RESTRICT and
would otherwise block the edge function's subsequent organizations
delete.
*/

CREATE OR REPLACE FUNCTION permanently_delete_organization_data(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_branch_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_branch_ids FROM branches WHERE organization_id = p_org_id;

  IF v_branch_ids IS NULL THEN
    RETURN; -- no branches, nothing to cascade
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
