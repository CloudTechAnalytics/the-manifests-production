/*
# ERP Phase 1: Customs, Terminal Operations, Examination, Transportation

## Overview
Adds the operational chain between "shipment booked" and "delivered" that
real freight forwarding requires: customs declaration/duty tracking,
terminal positioning/gate-pass tracking, physical examination logging
(when customs selects the red channel), and transportation-leg tracking.

This is purely additive — four new tables, five new enums, and one new
nullable column on the existing `documents` table (justified below).
`shipments` itself, its `status` enum, and every page that already keys
off it are untouched.

## New Tables

### shipment_customs
One row per shipment (`shipment_id` UNIQUE). Declaration/duty/inspection
tracking. `officer` is the external customs officer's name (free text) —
distinct from internal staff assignment, which stays on `shipment_plans`.

### terminal_operations
One row per shipment (`shipment_id` UNIQUE). Container position/bay/stack,
examination scheduling, gate pass + exit note, release date.

### shipment_examinations
Many rows per shipment (no UNIQUE on shipment_id) — a "further_inspection"
result is a real outcome that leads to a second examination.

### shipment_transportation
Many rows per shipment ("legs" — pickup, port-to-warehouse,
warehouse-to-customer can each be their own leg).

All four: `branch_id` for RLS scoping (matches every other business
table), `created_by`/`updated_by` -> profiles, standard audit timestamps
+ soft delete.

## documents.examination_id (the one existing-table change)
The Examination module needs "Inspection Photos, Inspection Report"
attached to a *specific* exam event — `documents.shipment_id` alone can't
tell which of possibly several exams a photo belongs to. Nullable,
ON DELETE SET NULL (deleting an exam record unlinks the file, doesn't
delete it). No `document_category` enum change here — that's a later
documents-checklist phase; uploads use the existing 'other' category.

## Security
RLS on all four new tables: SELECT scoped by `can_access_branch(branch_id)`
(unchanged pattern), writes additionally require `can_manage_operations()`
— these modules are operations-track, same as shipments/planning/warehouse,
since no dedicated customs/terminal role exists yet.

## Activity logging
"Every customs activity should be logged" reuses the existing `activities`
table from application code (same pattern as every other module) rather
than a parallel audit log.
*/

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE customs_status AS ENUM (
    'draft', 'submitted', 'awaiting_assessment', 'duty_payment',
    'customs_processing', 'released', 'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE customs_inspection_channel AS ENUM ('green', 'yellow', 'red');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE terminal_status AS ENUM (
    'waiting', 'positioned', 'scheduled', 'examined', 'released'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE examination_result AS ENUM (
    'passed', 'held', 'additional_duty', 'further_inspection'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE transportation_status AS ENUM (
    'assigned', 'loaded', 'in_transit', 'delivered', 'failed_delivery'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- SHIPMENT_CUSTOMS
-- ============================================================

CREATE TABLE IF NOT EXISTS shipment_customs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL UNIQUE REFERENCES shipments(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  declaration_number text,
  hs_code text,
  duty_amount numeric(14,2) NOT NULL DEFAULT 0,
  duty_paid boolean NOT NULL DEFAULT false,
  duty_paid_date date,
  customs_office text,
  inspection_channel customs_inspection_channel,
  officer text,
  status customs_status NOT NULL DEFAULT 'draft',
  notes text,
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE shipment_customs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_shipment_customs_branch" ON shipment_customs;
CREATE POLICY "select_shipment_customs_branch" ON shipment_customs FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_shipment_customs_branch" ON shipment_customs;
CREATE POLICY "insert_shipment_customs_branch" ON shipment_customs FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "update_shipment_customs_branch" ON shipment_customs;
CREATE POLICY "update_shipment_customs_branch" ON shipment_customs FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_operations())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "delete_shipment_customs_branch" ON shipment_customs;
CREATE POLICY "delete_shipment_customs_branch" ON shipment_customs FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_operations());

-- ============================================================
-- TERMINAL_OPERATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS terminal_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL UNIQUE REFERENCES shipments(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  terminal_name text,
  arrival_date date,
  container_position text,
  holding_bay text,
  stack_number text,
  examination_scheduled_date date,
  gate_pass_number text,
  exit_note_number text,
  release_date date,
  status terminal_status NOT NULL DEFAULT 'waiting',
  notes text,
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE terminal_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_terminal_operations_branch" ON terminal_operations;
CREATE POLICY "select_terminal_operations_branch" ON terminal_operations FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_terminal_operations_branch" ON terminal_operations;
CREATE POLICY "insert_terminal_operations_branch" ON terminal_operations FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "update_terminal_operations_branch" ON terminal_operations;
CREATE POLICY "update_terminal_operations_branch" ON terminal_operations FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_operations())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "delete_terminal_operations_branch" ON terminal_operations;
CREATE POLICY "delete_terminal_operations_branch" ON terminal_operations FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_operations());

-- ============================================================
-- SHIPMENT_EXAMINATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS shipment_examinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  inspection_date date,
  inspection_officer text,
  terminal_officer text,
  shipping_line_representative text,
  freight_forwarder_representative text,
  result examination_result,
  notes text,
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE shipment_examinations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_shipment_examinations_branch" ON shipment_examinations;
CREATE POLICY "select_shipment_examinations_branch" ON shipment_examinations FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_shipment_examinations_branch" ON shipment_examinations;
CREATE POLICY "insert_shipment_examinations_branch" ON shipment_examinations FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "update_shipment_examinations_branch" ON shipment_examinations;
CREATE POLICY "update_shipment_examinations_branch" ON shipment_examinations FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_operations())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "delete_shipment_examinations_branch" ON shipment_examinations;
CREATE POLICY "delete_shipment_examinations_branch" ON shipment_examinations FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_operations());

-- ============================================================
-- SHIPMENT_TRANSPORTATION
-- ============================================================

CREATE TABLE IF NOT EXISTS shipment_transportation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  truck_number text,
  trailer_number text,
  driver_name text,
  driver_phone text,
  pickup_date date,
  departure_date date,
  arrival_date date,
  delivery_date date,
  proof_of_delivery_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  status transportation_status NOT NULL DEFAULT 'assigned',
  notes text,
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE shipment_transportation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_shipment_transportation_branch" ON shipment_transportation;
CREATE POLICY "select_shipment_transportation_branch" ON shipment_transportation FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_shipment_transportation_branch" ON shipment_transportation;
CREATE POLICY "insert_shipment_transportation_branch" ON shipment_transportation FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "update_shipment_transportation_branch" ON shipment_transportation;
CREATE POLICY "update_shipment_transportation_branch" ON shipment_transportation FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_operations())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "delete_shipment_transportation_branch" ON shipment_transportation;
CREATE POLICY "delete_shipment_transportation_branch" ON shipment_transportation FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_operations());

-- ============================================================
-- DOCUMENTS: link an attachment to a specific examination event
-- ============================================================

ALTER TABLE documents ADD COLUMN IF NOT EXISTS examination_id uuid
  REFERENCES shipment_examinations(id) ON DELETE SET NULL;

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

DO $$ BEGIN
  CREATE TRIGGER trigger_shipment_customs_updated_at
    BEFORE UPDATE ON shipment_customs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_terminal_operations_updated_at
    BEFORE UPDATE ON terminal_operations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_shipment_examinations_updated_at
    BEFORE UPDATE ON shipment_examinations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_shipment_transportation_updated_at
    BEFORE UPDATE ON shipment_transportation
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_shipment_customs_branch_id ON shipment_customs(branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipment_customs_shipment_id ON shipment_customs(shipment_id);

CREATE INDEX IF NOT EXISTS idx_terminal_operations_branch_id ON terminal_operations(branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_terminal_operations_shipment_id ON terminal_operations(shipment_id);

CREATE INDEX IF NOT EXISTS idx_shipment_examinations_branch_id ON shipment_examinations(branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipment_examinations_shipment_id ON shipment_examinations(shipment_id);

CREATE INDEX IF NOT EXISTS idx_shipment_transportation_branch_id ON shipment_transportation(branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipment_transportation_shipment_id ON shipment_transportation(shipment_id);

CREATE INDEX IF NOT EXISTS idx_documents_examination_id ON documents(examination_id) WHERE deleted_at IS NULL;
