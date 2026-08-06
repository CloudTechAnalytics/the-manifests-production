/*
# Simplify delete: admin/branch_manager only, drop per-record ownership

## Why
Migrations 049 and 050 tried to let a regular user (sales/operations/
finance/warehouse/planning) delete only the records they created or
were assigned to. Extensive live testing — including reducing the
policy to a literal WITH CHECK (true), which cannot logically reject
any row — still produced "new row violates row-level security policy"
for a user who unambiguously owned the record being deleted. The exact
mechanism was never conclusively identified despite exhausting direct
inspection (pg_policies, pg_policy raw expressions, grants, triggers,
RLS force flags) and live impersonation testing. Rather than keep
shipping unverifiable policy changes, this migration removes the
ownership branch entirely and reverts to a simple, easy-to-reason-
about rule: only admin and branch_manager may delete (soft-delete via
UPDATE, or hard-delete via DELETE) any record — same escalation model
this app already used everywhere else before 049.

Ordinary edits are untouched — sales/operations/finance/warehouse/
planning users still edit records in their branch exactly as before;
only the delete transition is now manager/admin-only.

created_by/sales_rep_id/assigned_to columns are left as-is (they're
useful audit/assignment data independent of this policy), just no
longer read by these WITH CHECK/USING expressions.
*/

-- ============================================================
-- CUSTOMERS
-- ============================================================
DROP POLICY IF EXISTS "update_customers_branch" ON customers;
CREATE POLICY "update_customers_branch" ON customers FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (
    can_access_branch(branch_id) AND (
      CASE
        WHEN deleted_at IS NULL THEN can_manage_sales()
        ELSE has_role('admin') OR has_role('branch_manager')
      END
    )
  );

DROP POLICY IF EXISTS "delete_customers_branch" ON customers;
CREATE POLICY "delete_customers_branch" ON customers FOR DELETE
  TO authenticated USING (
    can_access_branch(branch_id) AND (has_role('admin') OR has_role('branch_manager'))
  );

-- ============================================================
-- QUOTATIONS
-- ============================================================
DROP POLICY IF EXISTS "update_quotations_branch" ON quotations;
CREATE POLICY "update_quotations_branch" ON quotations FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (
    can_access_branch(branch_id) AND (
      CASE
        WHEN deleted_at IS NULL THEN can_manage_sales()
        ELSE has_role('admin') OR has_role('branch_manager')
      END
    )
  );

DROP POLICY IF EXISTS "delete_quotations_branch" ON quotations;
CREATE POLICY "delete_quotations_branch" ON quotations FOR DELETE
  TO authenticated USING (
    can_access_branch(branch_id) AND (has_role('admin') OR has_role('branch_manager'))
  );

-- ============================================================
-- SHIPMENTS
-- ============================================================
DROP POLICY IF EXISTS "update_shipments_branch" ON shipments;
CREATE POLICY "update_shipments_branch" ON shipments FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (
    can_access_branch(branch_id) AND (
      CASE
        WHEN deleted_at IS NULL THEN can_manage_operations()
        ELSE has_role('admin') OR has_role('branch_manager')
      END
    )
  );

DROP POLICY IF EXISTS "delete_shipments_branch" ON shipments;
CREATE POLICY "delete_shipments_branch" ON shipments FOR DELETE
  TO authenticated USING (
    can_access_branch(branch_id) AND (has_role('admin') OR has_role('branch_manager'))
  );

-- ============================================================
-- INVOICES / PAYMENTS / EXPENSES
-- ============================================================
DROP POLICY IF EXISTS "update_invoices_branch" ON invoices;
CREATE POLICY "update_invoices_branch" ON invoices FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_finance())
  WITH CHECK (
    can_access_branch(branch_id) AND (
      CASE
        WHEN deleted_at IS NULL THEN can_manage_finance()
        ELSE has_role('admin') OR has_role('branch_manager')
      END
    )
  );

DROP POLICY IF EXISTS "delete_invoices_branch" ON invoices;
CREATE POLICY "delete_invoices_branch" ON invoices FOR DELETE
  TO authenticated USING (
    can_access_branch(branch_id) AND (has_role('admin') OR has_role('branch_manager'))
  );

DROP POLICY IF EXISTS "update_payments_branch" ON payments;
CREATE POLICY "update_payments_branch" ON payments FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_finance())
  WITH CHECK (
    can_access_branch(branch_id) AND (
      CASE
        WHEN deleted_at IS NULL THEN can_manage_finance()
        ELSE has_role('admin') OR has_role('branch_manager')
      END
    )
  );

DROP POLICY IF EXISTS "delete_payments_branch" ON payments;
CREATE POLICY "delete_payments_branch" ON payments FOR DELETE
  TO authenticated USING (
    can_access_branch(branch_id) AND (has_role('admin') OR has_role('branch_manager'))
  );

DROP POLICY IF EXISTS "update_expenses_branch" ON expenses;
CREATE POLICY "update_expenses_branch" ON expenses FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_finance())
  WITH CHECK (
    can_access_branch(branch_id) AND (
      CASE
        WHEN deleted_at IS NULL THEN can_manage_finance()
        ELSE has_role('admin') OR has_role('branch_manager')
      END
    )
  );

DROP POLICY IF EXISTS "delete_expenses_branch" ON expenses;
CREATE POLICY "delete_expenses_branch" ON expenses FOR DELETE
  TO authenticated USING (
    can_access_branch(branch_id) AND (has_role('admin') OR has_role('branch_manager'))
  );

-- ============================================================
-- STOCK_ITEMS (warehouse items)
-- ============================================================
DROP POLICY IF EXISTS "update_stock_items_branch" ON stock_items;
CREATE POLICY "update_stock_items_branch" ON stock_items FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (
    can_access_branch(branch_id) AND (
      CASE
        WHEN deleted_at IS NULL THEN can_manage_warehouse()
        ELSE has_role('admin') OR has_role('branch_manager')
      END
    )
  );

DROP POLICY IF EXISTS "delete_stock_items_branch" ON stock_items;
CREATE POLICY "delete_stock_items_branch" ON stock_items FOR DELETE
  TO authenticated USING (
    can_access_branch(branch_id) AND (has_role('admin') OR has_role('branch_manager'))
  );

-- ============================================================
-- SHIPMENT_PLANS
-- ============================================================
DROP POLICY IF EXISTS "update_shipment_plans_branch" ON shipment_plans;
CREATE POLICY "update_shipment_plans_branch" ON shipment_plans FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (
    can_access_branch(branch_id) AND (
      CASE
        WHEN deleted_at IS NULL THEN can_manage_planning()
        ELSE has_role('admin') OR has_role('branch_manager')
      END
    )
  );

DROP POLICY IF EXISTS "delete_shipment_plans_branch" ON shipment_plans;
CREATE POLICY "delete_shipment_plans_branch" ON shipment_plans FOR DELETE
  TO authenticated USING (
    can_access_branch(branch_id) AND (has_role('admin') OR has_role('branch_manager'))
  );

-- ============================================================
-- PLAN_TASKS — hard-deleted (no deleted_at column), DELETE policy only
-- ============================================================
DROP POLICY IF EXISTS "delete_plan_tasks_branch" ON plan_tasks;
CREATE POLICY "delete_plan_tasks_branch" ON plan_tasks FOR DELETE
  TO authenticated USING (
    can_access_branch(branch_id) AND (has_role('admin') OR has_role('branch_manager'))
  );
