-- ============================================================
-- PLANNING COMMAND CENTER
-- ============================================================
-- Extends the Planning Centre core (migration 059) into the full
-- coordination workspace: real booking-status workflow, a document
-- readiness checklist that can track "not received" before any file
-- exists, per-role workload assignments, auto-generated planning tasks,
-- granular cost estimation, and richer risk detection.
--
-- Reused, not duplicated: shipments.awb_number, shipments.carrier/
-- voyage_number/port_of_loading/port_of_discharge (relabeled per
-- shipment_type in the UI instead of new Air/Rail columns),
-- shipment_customs.inspection_channel (Customs "Risk Level"),
-- shipment_customs.officer ("Customs Broker"), terminal_operations.
-- stack_number ("Stack Position"), terminal_operations.free_time_days/
-- free_time_expiry (Storage Free Days + demurrage risk — the same
-- fields the existing DemurrageAlert component already reads, no
-- parallel demurrage system introduced), shipment_plans.estimated_revenue
-- (Financial Planning's "Expected Revenue").

-- ============================================================
-- BOOKING MANAGEMENT (shipments)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS booking_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_status booking_status NOT NULL DEFAULT 'pending';
-- booking_date already exists on the base table (migration 004) — reused,
-- not duplicated. booking_confirmed (existing bool, migration 059) stays
-- as a denormalized "= booking_status = 'confirmed'" flag, kept in sync
-- on every save — same precedent as shipment_customs.duty_paid vs
-- duty_status.

-- ============================================================
-- SHIPMENT_PLANS: hazardous/temperature flags for the suggestion engine
-- ============================================================
-- shipment_plans never had this concept before — copied from the
-- shipment at plan-load time (shipments already has both).

ALTER TABLE shipment_plans
  ADD COLUMN IF NOT EXISTS dangerous_cargo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS temperature_controlled boolean NOT NULL DEFAULT false;

-- ============================================================
-- CUSTOMS PLANNING enrichment
-- ============================================================

ALTER TABLE shipment_customs
  ADD COLUMN IF NOT EXISTS duty_estimate numeric(14,2),
  ADD COLUMN IF NOT EXISTS inspection_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS son_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nafdac_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nesrea_required boolean NOT NULL DEFAULT false;

-- ============================================================
-- TERMINAL PLANNING enrichment
-- ============================================================

ALTER TABLE terminal_operations
  ADD COLUMN IF NOT EXISTS expected_arrival_date date,
  ADD COLUMN IF NOT EXISTS terminal_booking_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS release_order_needed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expected_pickup_date date;

-- ============================================================
-- TRANSPORT PLANNING enrichment
-- ============================================================

ALTER TABLE shipment_transportation
  ADD COLUMN IF NOT EXISTS truck_type text,
  ADD COLUMN IF NOT EXISTS route text,
  ADD COLUMN IF NOT EXISTS estimated_distance_km numeric(10,2),
  ADD COLUMN IF NOT EXISTS fuel_estimate numeric(14,2),
  ADD COLUMN IF NOT EXISTS estimated_transport_cost numeric(14,2),
  ADD COLUMN IF NOT EXISTS delivery_contact_name text,
  ADD COLUMN IF NOT EXISTS delivery_contact_phone text;

-- ============================================================
-- PLANNING TASKS: auto-generation support
-- ============================================================
-- Mirrors shipment_tasks.template_id exactly, same idempotent
-- client-side seeding convention (no DB trigger).

ALTER TABLE plan_tasks
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES stage_task_templates(id) ON DELETE SET NULL;

-- Seed the 8 spec'd planning tasks. 'planning' is already a valid
-- workflow_stage_catalog key (migration 035, sequence 5).
INSERT INTO stage_task_templates (stage_key, title, default_priority, default_department, sort_order) VALUES
  ('planning', 'Confirm Booking', 'high', 'planning', 1),
  ('planning', 'Collect Commercial Invoice', 'medium', 'documentation', 2),
  ('planning', 'Collect Packing List', 'medium', 'documentation', 3),
  ('planning', 'Verify HS Code', 'medium', 'customs', 4),
  ('planning', 'Apply for PAAR', 'high', 'customs', 5),
  ('planning', 'Book Terminal Slot', 'high', 'terminal', 6),
  ('planning', 'Assign Truck', 'medium', 'transport', 7),
  ('planning', 'Arrange Delivery', 'medium', 'transport', 8)
ON CONFLICT (stage_key, title) DO NOTHING;

-- Extra document_templates the Documentation Planning checklist needs
-- that aren't already seeded (Bill of Lading/Air Waybill/Commercial
-- Invoice/Packing List/Insurance Certificate/Form M/PAAR already exist
-- from migration 036).
INSERT INTO document_templates (key, name, category, stage_key, applies_to_shipment_types, requires_red_channel, is_required, sort_order) VALUES
  ('certificate_of_origin', 'Certificate of Origin', 'other', 'documentation', NULL, false, false, 13),
  ('soncap', 'SONCAP', 'customs', 'documentation', NULL, false, false, 14),
  ('nafdac_permit', 'NAFDAC', 'customs', 'documentation', NULL, false, false, 15),
  ('import_permit', 'Import Permit', 'customs', 'documentation', NULL, false, false, 16)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- DOCUMENTATION PLANNING: plan_document_checklist
-- ============================================================
-- A `documents` row only ever exists once a file is uploaded, so
-- "Not Received" (a state Planning must track BEFORE any file exists)
-- can't live there. This is a separate tracking layer that optionally
-- links to a real `documents` row once one is uploaded.

DO $$ BEGIN
  CREATE TYPE checklist_document_status AS ENUM ('not_received', 'received', 'verified', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS plan_document_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  template_id uuid REFERENCES document_templates(id) ON DELETE SET NULL,
  custom_label text,
  status checklist_document_status NOT NULL DEFAULT 'not_received',
  document_number text,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  uploaded_by uuid REFERENCES profiles(id),
  upload_date date,
  remarks text,
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_document_checklist_label_check CHECK (template_id IS NOT NULL OR custom_label IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_plan_document_checklist_shipment ON plan_document_checklist(shipment_id);

ALTER TABLE plan_document_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_plan_document_checklist_branch" ON plan_document_checklist FOR SELECT
  TO authenticated USING (can_access_branch(branch_id));
CREATE POLICY "insert_plan_document_checklist_branch" ON plan_document_checklist FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_planning());
CREATE POLICY "update_plan_document_checklist_branch" ON plan_document_checklist FOR UPDATE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_planning())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_planning());

DO $$ BEGIN
  CREATE TRIGGER trigger_plan_document_checklist_updated_at
    BEFORE UPDATE ON plan_document_checklist
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- INTERNAL DEPARTMENT ASSIGNMENT: plan_assignments
-- ============================================================
-- Replaces the core build's simpler "write straight to
-- shipment_stages.assigned_to + 2 shipment_plans columns" — the spec
-- wants a real per-assignment workload record (assigned date, due date,
-- independent status). shipment_plans.finance_officer_id/supervisor_id
-- (migration 059) are left in place unused, never dropped — this table
-- is the new single source of truth for all 7 roles.

DO $$ BEGIN
  CREATE TYPE plan_assignment_role AS ENUM (
    'documentation', 'customs', 'terminal', 'finance', 'transport', 'warehouse', 'supervisor'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE plan_assignment_status AS ENUM ('pending', 'working', 'completed', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS plan_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  role plan_assignment_role NOT NULL,
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_date date,
  due_date date,
  status plan_assignment_status NOT NULL DEFAULT 'pending',
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shipment_id, role)
);

ALTER TABLE plan_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_plan_assignments_branch" ON plan_assignments FOR SELECT
  TO authenticated USING (can_access_branch(branch_id));
CREATE POLICY "insert_plan_assignments_branch" ON plan_assignments FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_planning());
CREATE POLICY "update_plan_assignments_branch" ON plan_assignments FOR UPDATE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_planning())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_planning());

DO $$ BEGIN
  CREATE TRIGGER trigger_plan_assignments_updated_at
    BEFORE UPDATE ON plan_assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- FINANCIAL PLANNING: plan_cost_estimates
-- ============================================================

DO $$ BEGIN
  CREATE TYPE plan_cost_category AS ENUM (
    'ocean_freight', 'thc', 'documentation', 'terminal_charges', 'transport',
    'warehouse', 'duty', 'inspection', 'agency_fees', 'miscellaneous'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS plan_cost_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  category plan_cost_category NOT NULL,
  estimated_amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',
  notes text,
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shipment_id, category)
);

ALTER TABLE plan_cost_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_plan_cost_estimates_branch" ON plan_cost_estimates FOR SELECT
  TO authenticated USING (can_access_branch(branch_id));
CREATE POLICY "insert_plan_cost_estimates_branch" ON plan_cost_estimates FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_planning());
CREATE POLICY "update_plan_cost_estimates_branch" ON plan_cost_estimates FOR UPDATE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_planning())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_planning());

DO $$ BEGIN
  CREATE TRIGGER trigger_plan_cost_estimates_updated_at
    BEFORE UPDATE ON plan_cost_estimates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
