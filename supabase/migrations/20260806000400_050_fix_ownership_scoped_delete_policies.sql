/*
# Fix: ownership-scoped delete policies re-applied with CASE instead of nested AND/OR

## Problem
Migration 049 added ownership-scoped delete to customers, quotations,
shipments, invoices, payments, expenses, stock_items, and
shipment_plans, expressed as a deeply nested (deleted_at IS NULL AND
...) OR (deleted_at IS NOT NULL AND (...)) boolean expression. Live
testing (impersonating a sales user via request.jwt.claims + SET LOCAL
ROLE, rolled back) showed every individual sub-condition evaluating to
true — auth.uid() resolved correctly, can_access_branch() true,
created_by/sales_rep_id matched — yet the UPDATE still raised "new row
violates row-level security policy". Rather than keep guessing at the
exact parenthesization/precedence issue in the nested form, this
migration re-expresses every one of those policies as an explicit CASE
on deleted_at, which is unambiguous to read and re-verify, and
re-applies it (DROP + CREATE, idempotent) so the live state is known-
good regardless of whatever was actually stored after 049.

## Fix shape (same access rules as 049, different expression)
  WITH CHECK (
    can_access_branch(branch_id) AND (
      CASE
        WHEN deleted_at IS NULL THEN <ordinary-edit track check>
        ELSE has_role('admin') OR has_role('branch_manager')
             OR (<track check> AND <ownership check>)
      END
    )
  )
DELETE policies are untouched — they were already a single flat OR with
no deleted_at branching, so they weren't a suspect for this bug; only
the UPDATE (soft-delete transition) policies are redefined here.
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
             OR (can_manage_sales() AND created_by = auth.uid())
      END
    )
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
             OR (can_manage_sales() AND (created_by = auth.uid() OR sales_rep_id = auth.uid()))
      END
    )
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
             OR (can_manage_operations() AND (created_by = auth.uid() OR assigned_to = auth.uid()))
      END
    )
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
             OR (can_manage_finance() AND created_by = auth.uid())
      END
    )
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
             OR (can_manage_finance() AND created_by = auth.uid())
      END
    )
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
             OR (can_manage_finance() AND created_by = auth.uid())
      END
    )
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
             OR (can_manage_warehouse() AND created_by = auth.uid())
      END
    )
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
             OR (
               can_manage_planning()
               AND (created_by = auth.uid() OR assigned_to = auth.uid() OR planned_by = auth.uid())
             )
      END
    )
  );

-- Verification is deliberately NOT bundled into this file as one script:
-- these DROP+CREATE POLICY statements need to commit, and a rolled-back
-- test UPDATE needs to not commit — mixing them under one trailing
-- ROLLBACK would silently undo this fix too. Run this file first, let
-- it commit, then run the separate self-test snippet.
