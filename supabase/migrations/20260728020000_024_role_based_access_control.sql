/*
# Real role-based access control

## Problem
Every RLS policy in this app gates purely on can_access_branch(branch_id)
— org membership + same branch (or admin). operations, sales, and
branch_manager have therefore always been functionally identical: an
operations user can create an invoice, a sales user can delete a
warehouse item. Nothing has ever checked *which* specialist role the
caller holds.

## Fix
Three helper functions, one per track. Each ANDs onto the existing
can_access_branch(branch_id) check on writes (INSERT/UPDATE/DELETE).
admin and branch_manager are in all three, so both keep full access —
branch_manager's is just naturally bounded to their own branch, same as
today, via can_access_branch.

Finance is the one track where SELECT itself is also restricted, not
just writes — operations and sales should not be able to see invoices,
payments, or expenses at all, per direct instruction. Operations-track
and sales-track SELECT are deliberately left open branch-wide: finance
staff still need to see which shipment an invoice is for, sales staff
still need shipment status for customer service, and nothing asked for
those to be hidden.

documents is untouched — it spans every track and already has its own
owner-or-admin rule; nothing here asked to narrow it further.

warehouse_stock needs no policy change: it has no write policies today,
every mutation flows through the stock_movements insert via a
SECURITY DEFINER sync trigger, so gating stock_movements covers it.
*/

CREATE OR REPLACE FUNCTION can_manage_operations()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'branch_manager', 'operations')
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION can_manage_sales()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'branch_manager', 'sales')
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION can_manage_finance()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'branch_manager', 'finance')
      AND is_active = true
  );
$$;

-- ============================================================
-- OPERATIONS-TRACK — writes gated, SELECT untouched
-- ============================================================

DROP POLICY IF EXISTS "insert_shipments_branch" ON shipments;
CREATE POLICY "insert_shipments_branch" ON shipments FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "update_shipments_branch" ON shipments;
CREATE POLICY "update_shipments_branch" ON shipments FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "delete_shipments_branch" ON shipments;
CREATE POLICY "delete_shipments_branch" ON shipments FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "insert_timeline_branch" ON shipment_timeline;
CREATE POLICY "insert_timeline_branch" ON shipment_timeline FOR INSERT
  TO authenticated WITH CHECK (
    can_manage_operations() AND EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = shipment_timeline.shipment_id AND s.deleted_at IS NULL AND can_access_branch(s.branch_id)
    )
  );

DROP POLICY IF EXISTS "delete_timeline_branch" ON shipment_timeline;
CREATE POLICY "delete_timeline_branch" ON shipment_timeline FOR DELETE
  TO authenticated USING (
    can_manage_operations() AND EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = shipment_timeline.shipment_id AND can_access_branch(s.branch_id)
    )
  );

DROP POLICY IF EXISTS "insert_shipment_plans_branch" ON shipment_plans;
CREATE POLICY "insert_shipment_plans_branch" ON shipment_plans FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "update_shipment_plans_branch" ON shipment_plans;
CREATE POLICY "update_shipment_plans_branch" ON shipment_plans FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "delete_shipment_plans_branch" ON shipment_plans;
CREATE POLICY "delete_shipment_plans_branch" ON shipment_plans FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "insert_plan_tasks_branch" ON plan_tasks;
CREATE POLICY "insert_plan_tasks_branch" ON plan_tasks FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "update_plan_tasks_branch" ON plan_tasks;
CREATE POLICY "update_plan_tasks_branch" ON plan_tasks FOR UPDATE
  TO authenticated
  USING (can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "delete_plan_tasks_branch" ON plan_tasks;
CREATE POLICY "delete_plan_tasks_branch" ON plan_tasks FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "insert_warehouses_branch" ON warehouses;
CREATE POLICY "insert_warehouses_branch" ON warehouses FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "update_warehouses_branch" ON warehouses;
CREATE POLICY "update_warehouses_branch" ON warehouses FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "delete_warehouses_branch" ON warehouses;
CREATE POLICY "delete_warehouses_branch" ON warehouses FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "insert_stock_items_branch" ON stock_items;
CREATE POLICY "insert_stock_items_branch" ON stock_items FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "update_stock_items_branch" ON stock_items;
CREATE POLICY "update_stock_items_branch" ON stock_items FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "delete_stock_items_branch" ON stock_items;
CREATE POLICY "delete_stock_items_branch" ON stock_items FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "insert_stock_movements_branch" ON stock_movements;
CREATE POLICY "insert_stock_movements_branch" ON stock_movements FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "delete_stock_movements_branch" ON stock_movements;
CREATE POLICY "delete_stock_movements_branch" ON stock_movements FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_operations());

-- ============================================================
-- SALES-TRACK — writes gated, SELECT untouched
-- ============================================================

DROP POLICY IF EXISTS "insert_quotations_branch" ON quotations;
CREATE POLICY "insert_quotations_branch" ON quotations FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_sales());

DROP POLICY IF EXISTS "update_quotations_branch" ON quotations;
CREATE POLICY "update_quotations_branch" ON quotations FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id) AND can_manage_sales());

DROP POLICY IF EXISTS "delete_quotations_branch" ON quotations;
CREATE POLICY "delete_quotations_branch" ON quotations FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_sales());

DROP POLICY IF EXISTS "insert_qitems_branch" ON quotation_items;
CREATE POLICY "insert_qitems_branch" ON quotation_items FOR INSERT
  TO authenticated WITH CHECK (
    can_manage_sales() AND EXISTS (
      SELECT 1 FROM quotations q
      WHERE q.id = quotation_items.quotation_id AND q.deleted_at IS NULL AND can_access_branch(q.branch_id)
    )
  );

DROP POLICY IF EXISTS "update_qitems_branch" ON quotation_items;
CREATE POLICY "update_qitems_branch" ON quotation_items FOR UPDATE
  TO authenticated
  USING (
    deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM quotations q
      WHERE q.id = quotation_items.quotation_id AND can_access_branch(q.branch_id)
    )
  )
  WITH CHECK (
    can_manage_sales() AND EXISTS (
      SELECT 1 FROM quotations q
      WHERE q.id = quotation_items.quotation_id AND can_access_branch(q.branch_id)
    )
  );

DROP POLICY IF EXISTS "delete_qitems_branch" ON quotation_items;
CREATE POLICY "delete_qitems_branch" ON quotation_items FOR DELETE
  TO authenticated USING (
    can_manage_sales() AND EXISTS (
      SELECT 1 FROM quotations q
      WHERE q.id = quotation_items.quotation_id AND can_access_branch(q.branch_id)
    )
  );

DROP POLICY IF EXISTS "insert_customers_branch" ON customers;
CREATE POLICY "insert_customers_branch" ON customers FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_sales());

DROP POLICY IF EXISTS "update_customers_branch" ON customers;
CREATE POLICY "update_customers_branch" ON customers FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id) AND can_manage_sales());

DROP POLICY IF EXISTS "delete_customers_branch" ON customers;
CREATE POLICY "delete_customers_branch" ON customers FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_sales());

DROP POLICY IF EXISTS "insert_contacts_branch" ON customer_contacts;
CREATE POLICY "insert_contacts_branch" ON customer_contacts FOR INSERT
  TO authenticated WITH CHECK (
    can_manage_sales() AND EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = customer_contacts.customer_id AND c.deleted_at IS NULL AND can_access_branch(c.branch_id)
    )
  );

DROP POLICY IF EXISTS "update_contacts_branch" ON customer_contacts;
CREATE POLICY "update_contacts_branch" ON customer_contacts FOR UPDATE
  TO authenticated
  USING (
    deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = customer_contacts.customer_id AND can_access_branch(c.branch_id)
    )
  )
  WITH CHECK (
    can_manage_sales() AND EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = customer_contacts.customer_id AND can_access_branch(c.branch_id)
    )
  );

DROP POLICY IF EXISTS "delete_contacts_branch" ON customer_contacts;
CREATE POLICY "delete_contacts_branch" ON customer_contacts FOR DELETE
  TO authenticated USING (
    can_manage_sales() AND EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = customer_contacts.customer_id AND can_access_branch(c.branch_id)
    )
  );

-- ============================================================
-- FINANCE-TRACK — SELECT *and* writes gated
-- ============================================================

DROP POLICY IF EXISTS "select_invoices_branch" ON invoices;
CREATE POLICY "select_invoices_branch" ON invoices FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_finance());

DROP POLICY IF EXISTS "insert_invoices_branch" ON invoices;
CREATE POLICY "insert_invoices_branch" ON invoices FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_finance());

DROP POLICY IF EXISTS "update_invoices_branch" ON invoices;
CREATE POLICY "update_invoices_branch" ON invoices FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_finance())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_finance());

DROP POLICY IF EXISTS "delete_invoices_branch" ON invoices;
CREATE POLICY "delete_invoices_branch" ON invoices FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_finance());

DROP POLICY IF EXISTS "select_payments_branch" ON payments;
CREATE POLICY "select_payments_branch" ON payments FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_finance());

DROP POLICY IF EXISTS "insert_payments_branch" ON payments;
CREATE POLICY "insert_payments_branch" ON payments FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_finance());

DROP POLICY IF EXISTS "update_payments_branch" ON payments;
CREATE POLICY "update_payments_branch" ON payments FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_finance())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_finance());

DROP POLICY IF EXISTS "delete_payments_branch" ON payments;
CREATE POLICY "delete_payments_branch" ON payments FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_finance());

DROP POLICY IF EXISTS "select_allocations_branch" ON payment_allocations;
CREATE POLICY "select_allocations_branch" ON payment_allocations FOR SELECT
  TO authenticated USING (
    can_manage_finance() AND EXISTS (
      SELECT 1 FROM payments p WHERE p.id = payment_allocations.payment_id AND can_access_branch(p.branch_id)
    )
  );

DROP POLICY IF EXISTS "insert_allocations_branch" ON payment_allocations;
CREATE POLICY "insert_allocations_branch" ON payment_allocations FOR INSERT
  TO authenticated WITH CHECK (
    can_manage_finance() AND EXISTS (
      SELECT 1 FROM payments p WHERE p.id = payment_allocations.payment_id AND can_access_branch(p.branch_id)
    )
  );

DROP POLICY IF EXISTS "delete_allocations_branch" ON payment_allocations;
CREATE POLICY "delete_allocations_branch" ON payment_allocations FOR DELETE
  TO authenticated USING (
    can_manage_finance() AND EXISTS (
      SELECT 1 FROM payments p WHERE p.id = payment_allocations.payment_id AND can_access_branch(p.branch_id)
    )
  );

DROP POLICY IF EXISTS "select_expenses_branch" ON expenses;
CREATE POLICY "select_expenses_branch" ON expenses FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_finance());

DROP POLICY IF EXISTS "insert_expenses_branch" ON expenses;
CREATE POLICY "insert_expenses_branch" ON expenses FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_finance());

DROP POLICY IF EXISTS "update_expenses_branch" ON expenses;
CREATE POLICY "update_expenses_branch" ON expenses FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_finance())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_finance());

DROP POLICY IF EXISTS "delete_expenses_branch" ON expenses;
CREATE POLICY "delete_expenses_branch" ON expenses FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_finance());
