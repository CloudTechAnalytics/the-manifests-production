/*
# Ownership-scoped delete: users can delete their own records without admin

## Problem
Every non-admin soft-delete today (customers, quotations, shipments,
invoices, payments, expenses, warehouse stock items, shipment plans, and
plan tasks) is gated purely by department + branch — can_manage_sales(),
can_manage_operations(), can_manage_finance(), can_manage_warehouse(),
can_manage_planning(). Nothing checks *who* the record belongs to, so
today any sales rep can already delete any other sales rep's customer
or quotation in the same branch, any operations staff can delete any
shipment in the branch, etc. That's the opposite of what's needed: a
regular user should be able to delete a record they created (or are
assigned to) without asking an admin, but should NOT be able to delete
a colleague's record just because they share a branch and department.

## Fix
Soft-delete is implemented everywhere in the app as an UPDATE that sets
deleted_at (never a real DELETE — admin's "permanently delete" action
goes through a service-role edge function that bypasses RLS entirely,
see lib/utils/admin-delete.ts). Each affected table's UPDATE policy is
rewritten to split the ordinary-edit case from the delete-transition
case in WITH CHECK:
  - Ordinary edits (deleted_at staying NULL): UNCHANGED — still plain
    department + branch gated exactly as before. Normal editing does
    not get stricter; a sales rep can still update a colleague's
    quotation to add notes, change status, etc.
  - Delete transitions (deleted_at becoming non-null): admin and
    branch_manager can still delete anything in their branch — they
    remain the escalation path, unchanged from today. Everyone else
    must additionally own the record: created_by = auth.uid(), or —
    where the table has one — the assignment column
    (quotations.sales_rep_id; shipments/shipment_plans/plan_tasks
    .assigned_to; shipment_plans.planned_by).

The real FOR DELETE policies (exercised only by the admin force-delete
path today, since every other actor soft-deletes via UPDATE) get the
same ownership condition mirrored in, purely for defense in depth — so
a non-admin client could never hard-delete someone else's record either
even if it tried a raw .delete() instead of the app's normal
soft-delete flow.

## Explicitly unaffected
Sub-resource tables (quotation_items, customer_contacts,
payment_allocations, warehouses, stock_movements) keep their existing
department + branch policies — deleting/editing a line item on a
record you can already see and edit isn't the "who can delete the
parent record" question this migration answers. documents keeps its
existing owner-or-admin rule, untouched.
*/

-- ============================================================
-- CUSTOMERS (sales track) — created_by
-- ============================================================

DROP POLICY IF EXISTS "update_customers_branch" ON customers;
CREATE POLICY "update_customers_branch" ON customers FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (
    can_access_branch(branch_id) AND (
      (deleted_at IS NULL AND can_manage_sales())
      OR (
        deleted_at IS NOT NULL AND (
          has_role('admin') OR has_role('branch_manager')
          OR (can_manage_sales() AND created_by = auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS "delete_customers_branch" ON customers;
CREATE POLICY "delete_customers_branch" ON customers FOR DELETE
  TO authenticated USING (
    can_access_branch(branch_id) AND (
      has_role('admin') OR has_role('branch_manager')
      OR (can_manage_sales() AND created_by = auth.uid())
    )
  );

-- ============================================================
-- QUOTATIONS (sales track) — created_by OR sales_rep_id
-- ============================================================

DROP POLICY IF EXISTS "update_quotations_branch" ON quotations;
CREATE POLICY "update_quotations_branch" ON quotations FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (
    can_access_branch(branch_id) AND (
      (deleted_at IS NULL AND can_manage_sales())
      OR (
        deleted_at IS NOT NULL AND (
          has_role('admin') OR has_role('branch_manager')
          OR (can_manage_sales() AND (created_by = auth.uid() OR sales_rep_id = auth.uid()))
        )
      )
    )
  );

DROP POLICY IF EXISTS "delete_quotations_branch" ON quotations;
CREATE POLICY "delete_quotations_branch" ON quotations FOR DELETE
  TO authenticated USING (
    can_access_branch(branch_id) AND (
      has_role('admin') OR has_role('branch_manager')
      OR (can_manage_sales() AND (created_by = auth.uid() OR sales_rep_id = auth.uid()))
    )
  );

-- ============================================================
-- SHIPMENTS (operations track) — created_by OR assigned_to
-- ============================================================

DROP POLICY IF EXISTS "update_shipments_branch" ON shipments;
CREATE POLICY "update_shipments_branch" ON shipments FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (
    can_access_branch(branch_id) AND (
      (deleted_at IS NULL AND can_manage_operations())
      OR (
        deleted_at IS NOT NULL AND (
          has_role('admin') OR has_role('branch_manager')
          OR (can_manage_operations() AND (created_by = auth.uid() OR assigned_to = auth.uid()))
        )
      )
    )
  );

DROP POLICY IF EXISTS "delete_shipments_branch" ON shipments;
CREATE POLICY "delete_shipments_branch" ON shipments FOR DELETE
  TO authenticated USING (
    can_access_branch(branch_id) AND (
      has_role('admin') OR has_role('branch_manager')
      OR (can_manage_operations() AND (created_by = auth.uid() OR assigned_to = auth.uid()))
    )
  );

-- ============================================================
-- INVOICES / PAYMENTS / EXPENSES (finance track) — created_by
-- ============================================================

DROP POLICY IF EXISTS "update_invoices_branch" ON invoices;
CREATE POLICY "update_invoices_branch" ON invoices FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_finance())
  WITH CHECK (
    can_access_branch(branch_id) AND (
      (deleted_at IS NULL AND can_manage_finance())
      OR (
        deleted_at IS NOT NULL AND (
          has_role('admin') OR has_role('branch_manager')
          OR (can_manage_finance() AND created_by = auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS "delete_invoices_branch" ON invoices;
CREATE POLICY "delete_invoices_branch" ON invoices FOR DELETE
  TO authenticated USING (
    can_access_branch(branch_id) AND (
      has_role('admin') OR has_role('branch_manager')
      OR (can_manage_finance() AND created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "update_payments_branch" ON payments;
CREATE POLICY "update_payments_branch" ON payments FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_finance())
  WITH CHECK (
    can_access_branch(branch_id) AND (
      (deleted_at IS NULL AND can_manage_finance())
      OR (
        deleted_at IS NOT NULL AND (
          has_role('admin') OR has_role('branch_manager')
          OR (can_manage_finance() AND created_by = auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS "delete_payments_branch" ON payments;
CREATE POLICY "delete_payments_branch" ON payments FOR DELETE
  TO authenticated USING (
    can_access_branch(branch_id) AND (
      has_role('admin') OR has_role('branch_manager')
      OR (can_manage_finance() AND created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "update_expenses_branch" ON expenses;
CREATE POLICY "update_expenses_branch" ON expenses FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_finance())
  WITH CHECK (
    can_access_branch(branch_id) AND (
      (deleted_at IS NULL AND can_manage_finance())
      OR (
        deleted_at IS NOT NULL AND (
          has_role('admin') OR has_role('branch_manager')
          OR (can_manage_finance() AND created_by = auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS "delete_expenses_branch" ON expenses;
CREATE POLICY "delete_expenses_branch" ON expenses FOR DELETE
  TO authenticated USING (
    can_access_branch(branch_id) AND (
      has_role('admin') OR has_role('branch_manager')
      OR (can_manage_finance() AND created_by = auth.uid())
    )
  );

-- ============================================================
-- STOCK_ITEMS / warehouse items (warehouse track) — created_by
-- ============================================================

DROP POLICY IF EXISTS "update_stock_items_branch" ON stock_items;
CREATE POLICY "update_stock_items_branch" ON stock_items FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (
    can_access_branch(branch_id) AND (
      (deleted_at IS NULL AND can_manage_warehouse())
      OR (
        deleted_at IS NOT NULL AND (
          has_role('admin') OR has_role('branch_manager')
          OR (can_manage_warehouse() AND created_by = auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS "delete_stock_items_branch" ON stock_items;
CREATE POLICY "delete_stock_items_branch" ON stock_items FOR DELETE
  TO authenticated USING (
    can_access_branch(branch_id) AND (
      has_role('admin') OR has_role('branch_manager')
      OR (can_manage_warehouse() AND created_by = auth.uid())
    )
  );

-- ============================================================
-- SHIPMENT_PLANS / PLAN_TASKS (planning track)
-- shipment_plans: created_by OR assigned_to OR planned_by
-- plan_tasks: created_by OR assigned_to
-- ============================================================

DROP POLICY IF EXISTS "update_shipment_plans_branch" ON shipment_plans;
CREATE POLICY "update_shipment_plans_branch" ON shipment_plans FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (
    can_access_branch(branch_id) AND (
      (deleted_at IS NULL AND can_manage_planning())
      OR (
        deleted_at IS NOT NULL AND (
          has_role('admin') OR has_role('branch_manager')
          OR (
            can_manage_planning()
            AND (created_by = auth.uid() OR assigned_to = auth.uid() OR planned_by = auth.uid())
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "delete_shipment_plans_branch" ON shipment_plans;
CREATE POLICY "delete_shipment_plans_branch" ON shipment_plans FOR DELETE
  TO authenticated USING (
    can_access_branch(branch_id) AND (
      has_role('admin') OR has_role('branch_manager')
      OR (
        can_manage_planning()
        AND (created_by = auth.uid() OR assigned_to = auth.uid() OR planned_by = auth.uid())
      )
    )
  );

-- plan_tasks has no deleted_at column — it's hard-deleted via a real
-- DELETE, never soft-deleted, so its UPDATE policy (ordinary field
-- edits only) is untouched; only its DELETE policy needs the ownership
-- condition.
DROP POLICY IF EXISTS "delete_plan_tasks_branch" ON plan_tasks;
CREATE POLICY "delete_plan_tasks_branch" ON plan_tasks FOR DELETE
  TO authenticated USING (
    can_access_branch(branch_id) AND (
      has_role('admin') OR has_role('branch_manager')
      OR (
        can_manage_planning()
        AND (created_by = auth.uid() OR assigned_to = auth.uid())
      )
    )
  );
