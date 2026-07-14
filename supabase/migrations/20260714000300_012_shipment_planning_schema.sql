/*
# Business Schema: Shipment Planning

## Overview
Adds a pre-shipment planning stage: draft the cargo, container, vessel/
routing, transport, and cost details for a job before it becomes a real
shipment, then "convert" the plan into an actual `shipments` row once it's
ready to execute. This intentionally overlaps with `shipments` in the
fields it captures — that's the point: a plan is a shipment's data,
captured earlier, before it's committed.

Deliberately NOT included (per product decision, to avoid fabricating
data/integrations that don't exist):
- Vessel schedule lookup, container availability, and rate-quote actions
  — these need live carrier/rate APIs this project doesn't have.
- "Cost Accuracy" — only meaningful once actual costs are recorded after
  execution, which isn't modeled; the reference mockup itself shows this
  as a blank placeholder.
- A separate resource-allocation system for the "Resources" tab — reuses
  the same single `assigned_to` staff-assignment pattern already used by
  `shipments.assigned_to`, rather than inventing equipment/crew booking.

## New Tables

### shipment_plans
The draft record. Most fields mirror what `shipments` eventually needs,
plus planning-only fields (container/vessel/transport specifics, cost
estimate, risk judgment) that don't exist on `shipments` because they're
only relevant before booking is confirmed.
- `id`, `plan_number` (auto PLAN-YYYY-NNNN), `customer_id` (FK),
  `quotation_id` (FK, nullable), `branch_id` (FK)
- `status` (enum): planned | approved | in_progress | completed | cancelled
- `priority` (enum): low | medium | high
- Route/overview: `shipment_type`, `origin`, `destination`, `incoterm`,
  `commodity`, `goods_value`, `goods_value_currency`, `insurance_required`,
  `special_instructions`, `total_packages`, `total_weight`, `total_volume`,
  `hs_code`, `cargo_description`
- Container plan: `container_type`, `container_quantity`,
  `equipment_supplier`, `container_pickup_date`, `container_return_date`
- Vessel & routing: `carrier_line`, `vessel_name`, `voyage_number`,
  `port_of_loading`, `port_of_discharge`, `service_route`
- Transport plan: `pre_carriage_mode`, `transport_carrier`, `truck_number`,
  `estimated_transport_time`
- Milestones (manual dates the planner fills in as the plan progresses —
  "Quotation Approved" is derived from the linked quotation instead of
  stored, since that's real data we already have):
  `booking_confirmed_date`, `documentation_date`, `cargo_ready_date`,
  `planned_etd`, `planned_eta`, `delivery_date`
- Financials: `estimated_cost`, `estimated_revenue` (margin/profit are
  derived in the app as revenue - cost, not stored — same reasoning as
  invoice/expense derived fields elsewhere), `risk_level` (enum, the
  planner's own judgment call — an opinion field, not a fabricated metric)
- `planned_by` / `assigned_to` (FK -> profiles)
- `converted_shipment_id` (FK -> shipments, nullable), `converted_at`:
  set when "Convert to Shipment" is used
- `notes` (text)
- Audit: `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`

### plan_tasks
The "Tasks & Next Steps" checklist for a plan.
- `id`, `plan_id` (FK), `branch_id`, `title`, `assigned_to` (FK -> profiles,
  nullable), `due_date` (date, nullable)
- `status` (enum): pending | in_progress | done | cancelled
- `priority` (enum): low | medium | high
- `created_by`, `created_at`, `updated_at`

### documents (altered)
Adds a nullable `plan_id` FK so files can be attached to a plan before it
becomes a shipment. No RLS change needed — the existing branch-scoped
policies already cover it via `documents.branch_id`.

## Security
RLS on both new tables, branch-scoped via the existing `can_access_branch()`
helper — identical pattern to the rest of the app.
*/

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE plan_status AS ENUM ('planned', 'approved', 'in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE priority_level AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE plan_task_status AS ENUM ('pending', 'in_progress', 'done', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- SHIPMENT PLANS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS shipment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_number text UNIQUE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  quotation_id uuid REFERENCES quotations(id) ON DELETE SET NULL,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  status plan_status NOT NULL DEFAULT 'planned',
  priority priority_level NOT NULL DEFAULT 'medium',

  shipment_type shipment_type_enum,
  origin text,
  destination text,
  incoterm text,
  commodity text,
  goods_value numeric(14,2),
  goods_value_currency text NOT NULL DEFAULT 'NGN',
  insurance_required boolean NOT NULL DEFAULT false,
  special_instructions text,
  total_packages integer,
  total_weight numeric(14,2),
  total_volume numeric(14,2),
  hs_code text,
  cargo_description text,

  container_type text,
  container_quantity integer,
  equipment_supplier text,
  container_pickup_date date,
  container_return_date date,

  carrier_line text,
  vessel_name text,
  voyage_number text,
  port_of_loading text,
  port_of_discharge text,
  service_route text,

  pre_carriage_mode text,
  transport_carrier text,
  truck_number text,
  estimated_transport_time text,

  booking_confirmed_date date,
  documentation_date date,
  cargo_ready_date date,
  planned_etd date,
  planned_eta date,
  delivery_date date,

  estimated_cost numeric(14,2),
  estimated_revenue numeric(14,2),
  risk_level priority_level,

  planned_by uuid REFERENCES profiles(id),
  assigned_to uuid REFERENCES profiles(id),

  converted_shipment_id uuid REFERENCES shipments(id) ON DELETE SET NULL,
  converted_at timestamptz,

  notes text,
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE shipment_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_shipment_plans_branch" ON shipment_plans;
CREATE POLICY "select_shipment_plans_branch" ON shipment_plans FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_shipment_plans_branch" ON shipment_plans;
CREATE POLICY "insert_shipment_plans_branch" ON shipment_plans FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "update_shipment_plans_branch" ON shipment_plans;
CREATE POLICY "update_shipment_plans_branch" ON shipment_plans FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "delete_shipment_plans_branch" ON shipment_plans;
CREATE POLICY "delete_shipment_plans_branch" ON shipment_plans FOR DELETE
  TO authenticated USING (can_access_branch(branch_id));

-- ============================================================
-- PLAN TASKS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS plan_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES shipment_plans(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  title text NOT NULL,
  assigned_to uuid REFERENCES profiles(id),
  due_date date,
  status plan_task_status NOT NULL DEFAULT 'pending',
  priority priority_level NOT NULL DEFAULT 'medium',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE plan_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_plan_tasks_branch" ON plan_tasks;
CREATE POLICY "select_plan_tasks_branch" ON plan_tasks FOR SELECT
  TO authenticated USING (can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_plan_tasks_branch" ON plan_tasks;
CREATE POLICY "insert_plan_tasks_branch" ON plan_tasks FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "update_plan_tasks_branch" ON plan_tasks;
CREATE POLICY "update_plan_tasks_branch" ON plan_tasks FOR UPDATE
  TO authenticated
  USING (can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "delete_plan_tasks_branch" ON plan_tasks;
CREATE POLICY "delete_plan_tasks_branch" ON plan_tasks FOR DELETE
  TO authenticated USING (can_access_branch(branch_id));

-- ============================================================
-- DOCUMENTS: allow attaching to a plan
-- ============================================================

ALTER TABLE documents ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES shipment_plans(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_documents_plan_id ON documents(plan_id) WHERE deleted_at IS NULL;

-- ============================================================
-- AUTO-NUMBERING: shipment_plans (PLAN-YYYY-NNNN)
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS plan_seq START 1;

CREATE OR REPLACE FUNCTION generate_plan_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  next_val bigint;
BEGIN
  next_val := nextval('plan_seq');
  RETURN 'PLAN-' || to_char(now(), 'YYYY') || '-' || lpad(next_val::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION set_plan_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.plan_number IS NULL THEN
    NEW.plan_number := generate_plan_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_plan_number ON shipment_plans;
CREATE TRIGGER trigger_set_plan_number
  BEFORE INSERT ON shipment_plans
  FOR EACH ROW EXECUTE FUNCTION set_plan_number();

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

DO $$ BEGIN
  CREATE TRIGGER trigger_shipment_plans_updated_at
    BEFORE UPDATE ON shipment_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_plan_tasks_updated_at
    BEFORE UPDATE ON plan_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_shipment_plans_branch_id ON shipment_plans(branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipment_plans_customer_id ON shipment_plans(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipment_plans_status ON shipment_plans(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipment_plans_quotation_id ON shipment_plans(quotation_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_plan_tasks_plan_id ON plan_tasks(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_tasks_branch_id ON plan_tasks(branch_id);
