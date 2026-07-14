/*
# Business Schema: Warehouse Management

## Overview
Adds the warehouse module: physical warehouse locations (each tied to a
branch), a per-branch item catalog, per-warehouse stock levels, and an
immutable stock-movement ledger (inbound / outbound / adjustment /
transfer) that drives those stock levels via trigger — the same
"denormalized total, trigger-synced" approach already used for
`invoices.amount_paid` / `payments.allocated_amount` in the finance module.

Deliberately NOT included in this pass (per product decision, to avoid
fabricating data with no real source):
- "Reserved" stock — there's no sales-order/booking system to derive it
  from, so only Available (== On Hand, since nothing is reserved) is
  tracked.
- Linking inbound/outbound movements to the freight `shipments` table —
  kept independent so warehouse inventory isn't conflated with customer
  freight tracking.

## New Tables

### warehouses
Physical storage locations. A branch can have more than one (e.g. "Lagos
Main Warehouse" and "Apapa Warehouse" both under the Lagos branch).
- `id`, `branch_id` (FK -> branches), `name`, `address`, `city`
- `is_active` (boolean)
- Audit: `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`

### stock_items
The item catalog. Branch-scoped, like every other business table here —
each branch manages its own catalog rather than sharing one globally.
- `id`, `branch_id` (FK -> branches), `sku`, `name`, `category` (free
  text — item categories are too open-ended for a fixed enum), `unit`
  (e.g. "units", "kg", default 'units')
- `unit_cost` (numeric): current cost per unit, used for stock valuation
- `reorder_point` (numeric): below this, a warehouse's stock for this
  item is flagged "low stock" (derived in the app, not stored — same
  reasoning as "Overdue" invoices)
- Audit fields as above; `sku` unique per branch among non-deleted rows

### warehouse_stock
Current quantity of an item at a warehouse. This table has NO
user-editable columns — RLS only grants SELECT to authenticated users.
All mutation happens through `stock_movements`, which the
`sync_stock_movement()` trigger applies here, so the audit trail can
never drift from the live balance.
- `id`, `branch_id`, `warehouse_id` (FK), `item_id` (FK)
- `quantity` (numeric, >= 0), unique per (warehouse_id, item_id)

### stock_movements
An immutable ledger of everything that changes stock: goods received
(inbound), goods issued (outbound), a manual count correction
(adjustment_increase / adjustment_decrease), or a move between two
warehouses (transfer, using `to_warehouse_id`). Rows are insert/delete
only — there's no UPDATE policy, so mistakes are corrected by deleting
the wrong entry (which reverses it via the same trigger) and inserting
the right one, matching how `payment_allocations` are corrected.
- `id`, `branch_id`, `item_id` (FK), `warehouse_id` (FK, source)
- `to_warehouse_id` (FK, nullable — required for, and only for, transfers)
- `movement_type` (enum), `quantity` (numeric, > 0), `movement_date`
- `reference` / `notes` (text)
- `created_by` (FK -> profiles), `created_at`

## Security
RLS on all four tables, branch-scoped via the existing `can_access_branch()`
helper — identical pattern to the rest of the app. No new permission model.
*/

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE stock_movement_type AS ENUM (
    'inbound', 'outbound', 'adjustment_increase', 'adjustment_decrease', 'transfer'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- WAREHOUSES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  name text NOT NULL,
  address text,
  city text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_warehouses_branch" ON warehouses;
CREATE POLICY "select_warehouses_branch" ON warehouses FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_warehouses_branch" ON warehouses;
CREATE POLICY "insert_warehouses_branch" ON warehouses FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "update_warehouses_branch" ON warehouses;
CREATE POLICY "update_warehouses_branch" ON warehouses FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "delete_warehouses_branch" ON warehouses;
CREATE POLICY "delete_warehouses_branch" ON warehouses FOR DELETE
  TO authenticated USING (can_access_branch(branch_id));

-- ============================================================
-- STOCK ITEMS TABLE (catalog)
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  sku text NOT NULL,
  name text NOT NULL,
  category text,
  unit text NOT NULL DEFAULT 'units',
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  reorder_point numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_items_branch_sku_active
  ON stock_items(branch_id, sku) WHERE deleted_at IS NULL;

ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_stock_items_branch" ON stock_items;
CREATE POLICY "select_stock_items_branch" ON stock_items FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_stock_items_branch" ON stock_items;
CREATE POLICY "insert_stock_items_branch" ON stock_items FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "update_stock_items_branch" ON stock_items;
CREATE POLICY "update_stock_items_branch" ON stock_items FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "delete_stock_items_branch" ON stock_items;
CREATE POLICY "delete_stock_items_branch" ON stock_items FOR DELETE
  TO authenticated USING (can_access_branch(branch_id));

-- ============================================================
-- WAREHOUSE STOCK TABLE (current quantity per item per warehouse)
-- Read-only to end users — only sync_stock_movement() writes to it.
-- ============================================================

CREATE TABLE IF NOT EXISTS warehouse_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
  quantity numeric(14,2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, item_id)
);

ALTER TABLE warehouse_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_warehouse_stock_branch" ON warehouse_stock;
CREATE POLICY "select_warehouse_stock_branch" ON warehouse_stock FOR SELECT
  TO authenticated USING (can_access_branch(branch_id));

-- Deliberately no INSERT/UPDATE/DELETE policy for authenticated users:
-- all writes go through stock_movements -> sync_stock_movement(), which
-- runs SECURITY DEFINER and so bypasses RLS regardless.

-- ============================================================
-- STOCK MOVEMENTS TABLE (immutable ledger)
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  item_id uuid NOT NULL REFERENCES stock_items(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id uuid REFERENCES warehouses(id) ON DELETE RESTRICT,
  movement_type stock_movement_type NOT NULL,
  quantity numeric(14,2) NOT NULL CHECK (quantity > 0),
  movement_date date NOT NULL DEFAULT CURRENT_DATE,
  reference text,
  notes text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_transfer_destination CHECK (
    (movement_type = 'transfer' AND to_warehouse_id IS NOT NULL AND to_warehouse_id <> warehouse_id)
    OR (movement_type <> 'transfer' AND to_warehouse_id IS NULL)
  )
);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_stock_movements_branch" ON stock_movements;
CREATE POLICY "select_stock_movements_branch" ON stock_movements FOR SELECT
  TO authenticated USING (can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_stock_movements_branch" ON stock_movements;
CREATE POLICY "insert_stock_movements_branch" ON stock_movements FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "delete_stock_movements_branch" ON stock_movements;
CREATE POLICY "delete_stock_movements_branch" ON stock_movements FOR DELETE
  TO authenticated USING (can_access_branch(branch_id));

-- No UPDATE policy: movements are immutable. Fix a mistake by deleting
-- the wrong entry (reverses it) and inserting a corrected one.

-- ============================================================
-- STOCK SYNC: apply/reverse stock_movements against warehouse_stock
-- ============================================================

CREATE OR REPLACE FUNCTION apply_stock_delta(
  p_item_id uuid, p_warehouse_id uuid, p_branch_id uuid, p_delta numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO warehouse_stock (item_id, warehouse_id, branch_id, quantity)
  VALUES (p_item_id, p_warehouse_id, p_branch_id, p_delta)
  ON CONFLICT (warehouse_id, item_id)
  DO UPDATE SET quantity = warehouse_stock.quantity + p_delta, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION sync_stock_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r record;
  v_sign numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    r := NEW;
    v_sign := 1;
  ELSE
    r := OLD;
    v_sign := -1; -- reverse on delete
  END IF;

  IF r.movement_type IN ('inbound', 'adjustment_increase') THEN
    PERFORM apply_stock_delta(r.item_id, r.warehouse_id, r.branch_id, v_sign * r.quantity);
  ELSIF r.movement_type IN ('outbound', 'adjustment_decrease') THEN
    PERFORM apply_stock_delta(r.item_id, r.warehouse_id, r.branch_id, -1 * v_sign * r.quantity);
  ELSIF r.movement_type = 'transfer' THEN
    PERFORM apply_stock_delta(r.item_id, r.warehouse_id, r.branch_id, -1 * v_sign * r.quantity);
    PERFORM apply_stock_delta(r.item_id, r.to_warehouse_id, r.branch_id, v_sign * r.quantity);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_stock_movement ON stock_movements;
CREATE TRIGGER trigger_sync_stock_movement
  AFTER INSERT OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION sync_stock_movement();

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

DO $$ BEGIN
  CREATE TRIGGER trigger_warehouses_updated_at
    BEFORE UPDATE ON warehouses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_stock_items_updated_at
    BEFORE UPDATE ON stock_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_warehouses_branch_id ON warehouses(branch_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stock_items_branch_id ON stock_items(branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stock_items_category ON stock_items(category) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_warehouse_id ON warehouse_stock(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_item_id ON warehouse_stock(item_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_branch_id ON warehouse_stock(branch_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_branch_id ON stock_movements(branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item_id ON stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse_id ON stock_movements(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at);
