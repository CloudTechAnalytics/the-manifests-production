/*
# Multi-role RBAC: a user can hold more than one department role

## Design
`profiles.role` is untouched and stays authoritative as the *primary*
role — login redirect logic, the role badge shown everywhere, and every
existing single-role check keep working with zero data migration. The
new `user_roles` table holds any *additional* roles beyond it. "Does
this user have role X" becomes "primary role = X, or an additional-role
row says so" — implemented once, in has_role(), and every existing
can_manage_X()/is_admin() helper is rewritten to call it. Every
CREATE POLICY elsewhere in the schema is untouched, since they only
ever call these function names, never inline the role check.

## user_roles
No client INSERT/UPDATE/DELETE policy at all — granting someone a role
(especially 'admin') is privilege-escalation-sensitive, so writes only
happen through the update-user-roles edge function's service-role
client, same reasoning already applied to warehouse_stock (no direct
write policy; all mutation goes through a trusted path).

## Re-gating
Six new department roles exist as of migration 033 but nothing checks
them yet. This migration also moves the tables that were interim-gated
to can_manage_operations()/can_manage_customs() last phase onto their
real department now that department has its own role:
  warehouses, stock_items, stock_movements  -> can_manage_warehouse()
  shipment_plans, plan_tasks                -> can_manage_planning()
  shipment_transportation                   -> can_manage_transport()
  terminal_operations                       -> can_manage_terminal()
  shipment_examinations                     -> can_manage_examination()
  documents (UPDATE only, additive)         -> can_manage_documentation()
shipments/shipment_timeline/shipment_customs are unchanged — the
shipment record itself and customs declarations stay as they are.
*/

-- ============================================================
-- USER_ROLES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_user_roles_self_or_admin" ON user_roles;
CREATE POLICY "select_user_roles_self_or_admin" ON user_roles FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      is_admin() AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = user_roles.user_id AND p.organization_id = get_user_org_id()
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);

-- ============================================================
-- HAS_ROLE + REWRITTEN EXISTING HELPERS (same names, same signatures —
-- every existing CREATE POLICY that calls them needs no changes)
-- ============================================================

CREATE OR REPLACE FUNCTION has_role(p_role user_role)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_active = true
      AND (
        role = p_role
        OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = profiles.id AND ur.role = p_role)
      )
  );
$$;

CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$ SELECT has_role('admin'); $$;

CREATE OR REPLACE FUNCTION is_branch_manager() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$ SELECT has_role('branch_manager'); $$;

CREATE OR REPLACE FUNCTION can_manage_operations() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT has_role('admin') OR has_role('branch_manager') OR has_role('operations');
$$;

CREATE OR REPLACE FUNCTION can_manage_sales() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT has_role('admin') OR has_role('branch_manager') OR has_role('sales');
$$;

CREATE OR REPLACE FUNCTION can_manage_finance() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT has_role('admin') OR has_role('branch_manager') OR has_role('finance');
$$;

CREATE OR REPLACE FUNCTION can_manage_customs() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT has_role('admin') OR has_role('branch_manager') OR has_role('customs');
$$;

-- ============================================================
-- NEW DEPARTMENT HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION can_manage_planning() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT has_role('admin') OR has_role('branch_manager') OR has_role('planning');
$$;

CREATE OR REPLACE FUNCTION can_manage_documentation() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT has_role('admin') OR has_role('branch_manager') OR has_role('documentation');
$$;

CREATE OR REPLACE FUNCTION can_manage_terminal() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT has_role('admin') OR has_role('branch_manager') OR has_role('terminal');
$$;

CREATE OR REPLACE FUNCTION can_manage_examination() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT has_role('admin') OR has_role('branch_manager') OR has_role('examination');
$$;

CREATE OR REPLACE FUNCTION can_manage_warehouse() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT has_role('admin') OR has_role('branch_manager') OR has_role('warehouse');
$$;

CREATE OR REPLACE FUNCTION can_manage_transport() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT has_role('admin') OR has_role('branch_manager') OR has_role('transport');
$$;

-- ============================================================
-- RE-GATE: shipment_plans, plan_tasks -> can_manage_planning()
-- ============================================================

DROP POLICY IF EXISTS "insert_shipment_plans_branch" ON shipment_plans;
CREATE POLICY "insert_shipment_plans_branch" ON shipment_plans FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_planning());

DROP POLICY IF EXISTS "update_shipment_plans_branch" ON shipment_plans;
CREATE POLICY "update_shipment_plans_branch" ON shipment_plans FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id) AND can_manage_planning());

DROP POLICY IF EXISTS "delete_shipment_plans_branch" ON shipment_plans;
CREATE POLICY "delete_shipment_plans_branch" ON shipment_plans FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_planning());

DROP POLICY IF EXISTS "insert_plan_tasks_branch" ON plan_tasks;
CREATE POLICY "insert_plan_tasks_branch" ON plan_tasks FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_planning());

DROP POLICY IF EXISTS "update_plan_tasks_branch" ON plan_tasks;
CREATE POLICY "update_plan_tasks_branch" ON plan_tasks FOR UPDATE
  TO authenticated
  USING (can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id) AND can_manage_planning());

DROP POLICY IF EXISTS "delete_plan_tasks_branch" ON plan_tasks;
CREATE POLICY "delete_plan_tasks_branch" ON plan_tasks FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_planning());

-- ============================================================
-- RE-GATE: warehouses, stock_items, stock_movements -> can_manage_warehouse()
-- ============================================================

DROP POLICY IF EXISTS "insert_warehouses_branch" ON warehouses;
CREATE POLICY "insert_warehouses_branch" ON warehouses FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_warehouse());

DROP POLICY IF EXISTS "update_warehouses_branch" ON warehouses;
CREATE POLICY "update_warehouses_branch" ON warehouses FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id) AND can_manage_warehouse());

DROP POLICY IF EXISTS "delete_warehouses_branch" ON warehouses;
CREATE POLICY "delete_warehouses_branch" ON warehouses FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_warehouse());

DROP POLICY IF EXISTS "insert_stock_items_branch" ON stock_items;
CREATE POLICY "insert_stock_items_branch" ON stock_items FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_warehouse());

DROP POLICY IF EXISTS "update_stock_items_branch" ON stock_items;
CREATE POLICY "update_stock_items_branch" ON stock_items FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id) AND can_manage_warehouse());

DROP POLICY IF EXISTS "delete_stock_items_branch" ON stock_items;
CREATE POLICY "delete_stock_items_branch" ON stock_items FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_warehouse());

DROP POLICY IF EXISTS "insert_stock_movements_branch" ON stock_movements;
CREATE POLICY "insert_stock_movements_branch" ON stock_movements FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_warehouse());

DROP POLICY IF EXISTS "delete_stock_movements_branch" ON stock_movements;
CREATE POLICY "delete_stock_movements_branch" ON stock_movements FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_warehouse());

-- ============================================================
-- RE-GATE: terminal_operations -> can_manage_terminal()
-- ============================================================

DROP POLICY IF EXISTS "insert_terminal_operations_branch" ON terminal_operations;
CREATE POLICY "insert_terminal_operations_branch" ON terminal_operations FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_terminal());

DROP POLICY IF EXISTS "update_terminal_operations_branch" ON terminal_operations;
CREATE POLICY "update_terminal_operations_branch" ON terminal_operations FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_terminal())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_terminal());

DROP POLICY IF EXISTS "delete_terminal_operations_branch" ON terminal_operations;
CREATE POLICY "delete_terminal_operations_branch" ON terminal_operations FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_terminal());

-- ============================================================
-- RE-GATE: shipment_examinations -> can_manage_examination()
-- ============================================================

DROP POLICY IF EXISTS "insert_shipment_examinations_branch" ON shipment_examinations;
CREATE POLICY "insert_shipment_examinations_branch" ON shipment_examinations FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_examination());

DROP POLICY IF EXISTS "update_shipment_examinations_branch" ON shipment_examinations;
CREATE POLICY "update_shipment_examinations_branch" ON shipment_examinations FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_examination())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_examination());

DROP POLICY IF EXISTS "delete_shipment_examinations_branch" ON shipment_examinations;
CREATE POLICY "delete_shipment_examinations_branch" ON shipment_examinations FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_examination());

-- ============================================================
-- RE-GATE: shipment_transportation -> can_manage_transport()
-- ============================================================

DROP POLICY IF EXISTS "insert_shipment_transportation_branch" ON shipment_transportation;
CREATE POLICY "insert_shipment_transportation_branch" ON shipment_transportation FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_transport());

DROP POLICY IF EXISTS "update_shipment_transportation_branch" ON shipment_transportation;
CREATE POLICY "update_shipment_transportation_branch" ON shipment_transportation FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_transport())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_transport());

DROP POLICY IF EXISTS "delete_shipment_transportation_branch" ON shipment_transportation;
CREATE POLICY "delete_shipment_transportation_branch" ON shipment_transportation FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_transport());

-- ============================================================
-- RE-GATE: documents UPDATE gains can_manage_documentation() as an
-- additional way in, alongside (not instead of) the owner-or-admin
-- rule. INSERT/DELETE stay exactly as they are — upload stays open to
-- any branch member, since documents span every department.
-- ============================================================

DROP POLICY IF EXISTS "update_documents_branch" ON documents;
CREATE POLICY "update_documents_branch" ON documents FOR UPDATE
  TO authenticated
  USING (can_access_branch(branch_id) AND (created_by = auth.uid() OR is_admin() OR can_manage_documentation()))
  WITH CHECK (can_access_branch(branch_id) AND (created_by = auth.uid() OR is_admin() OR can_manage_documentation()));
