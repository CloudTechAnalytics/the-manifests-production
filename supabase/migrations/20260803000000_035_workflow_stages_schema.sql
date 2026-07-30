/*
# Workflow Engine: stage catalog + per-shipment stage instances + comments

## Design
shipments.status / shipment_timeline are UNTOUCHED — the "Update Status"
dropdown and its client-side handler keep working exactly as today. This
migration adds a parallel, more granular layer: a developer-seeded
14-stage catalog (Lead -> Quotation -> ... -> Completed) and one row per
(shipment, stage) recording department, assignee, status, and dates.
Comments are a separate append-only log (mirrors shipment_timeline's
shape) so the stage row itself stays a simple mutable record.

## Dynamic RLS
shipment_stages.assigned_department varies per row (unlike every other
table in this schema, which is gated by ONE static can_manage_X()
helper). Writes therefore inline has_role(assigned_department) instead
of calling a single named helper.

## Backfill
Existing shipments get all 14 stage rows inserted immediately, with
status derived from a shipment.status -> reached_sequence heuristic, so
nothing is left blank for shipments already in flight. Approximate by
nature — a one-time visual backfill, not a source of truth for anything
else.
*/

-- ============================================================
-- ENUM
-- ============================================================

DO $$ BEGIN
  CREATE TYPE workflow_stage_status AS ENUM ('pending', 'in_progress', 'completed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- WORKFLOW_STAGE_CATALOG (developer-seeded reference data)
-- ============================================================

CREATE TABLE IF NOT EXISTS workflow_stage_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  sequence integer NOT NULL,
  label text NOT NULL,
  default_department user_role NOT NULL,
  is_optional boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workflow_stage_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_workflow_stage_catalog_all" ON workflow_stage_catalog;
CREATE POLICY "select_workflow_stage_catalog_all" ON workflow_stage_catalog FOR SELECT
  TO authenticated USING (is_active);
-- No INSERT/UPDATE/DELETE policy: catalog is seeded/DB-editable only.

INSERT INTO workflow_stage_catalog (key, sequence, label, default_department, is_optional) VALUES
  ('lead', 1, 'Lead', 'sales', false),
  ('quotation', 2, 'Quotation', 'sales', false),
  ('quotation_approved', 3, 'Quotation Approved', 'sales', false),
  ('shipment_created', 4, 'Shipment Created', 'operations', false),
  ('planning', 5, 'Planning', 'planning', false),
  ('documentation', 6, 'Documentation', 'documentation', false),
  ('regulatory_compliance', 7, 'Regulatory Compliance', 'customs', false),
  ('customs_clearance', 8, 'Customs Clearance', 'customs', false),
  ('terminal_operations', 9, 'Terminal Operations', 'terminal', false),
  ('cargo_examination', 10, 'Cargo Examination', 'examination', true),
  ('warehouse', 11, 'Warehouse', 'warehouse', true),
  ('transportation', 12, 'Transportation', 'transport', false),
  ('delivered', 13, 'Delivered', 'operations', false),
  ('completed', 14, 'Completed', 'operations', false)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- SHIPMENT_STAGES (one row per shipment per catalog stage)
-- ============================================================

CREATE TABLE IF NOT EXISTS shipment_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  catalog_id uuid NOT NULL REFERENCES workflow_stage_catalog(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  stage_key text NOT NULL,
  sequence integer NOT NULL,
  label text NOT NULL,
  assigned_department user_role NOT NULL,
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status workflow_stage_status NOT NULL DEFAULT 'pending',
  is_optional boolean NOT NULL DEFAULT false,
  due_date date,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shipment_id, catalog_id)
);

ALTER TABLE shipment_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_shipment_stages_branch" ON shipment_stages;
CREATE POLICY "select_shipment_stages_branch" ON shipment_stages FOR SELECT
  TO authenticated USING (can_access_branch(branch_id));

-- INSERT stays branch-only (unrestricted by department): stages are
-- bulk-inserted right after a shipment is created, by whoever created
-- the shipment (any branch member), same permissiveness as
-- insert_shipments_branch.
DROP POLICY IF EXISTS "insert_shipment_stages_branch" ON shipment_stages;
CREATE POLICY "insert_shipment_stages_branch" ON shipment_stages FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id));

-- UPDATE (Start/Complete/Skip/reassign) requires the row's OWN
-- department, not a fixed helper — assigned_department varies per row.
DROP POLICY IF EXISTS "update_shipment_stages_branch" ON shipment_stages;
CREATE POLICY "update_shipment_stages_branch" ON shipment_stages FOR UPDATE
  TO authenticated
  USING (can_access_branch(branch_id))
  WITH CHECK (
    can_access_branch(branch_id)
    AND (is_admin() OR is_branch_manager() OR has_role(assigned_department))
  );

DROP POLICY IF EXISTS "delete_shipment_stages_branch" ON shipment_stages;
CREATE POLICY "delete_shipment_stages_branch" ON shipment_stages FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND (is_admin() OR is_branch_manager()));

-- ============================================================
-- SHIPMENT_STAGE_COMMENTS (append-only, mirrors shipment_timeline)
-- ============================================================

CREATE TABLE IF NOT EXISTS shipment_stage_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES shipment_stages(id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  comment text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shipment_stage_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_shipment_stage_comments_branch" ON shipment_stage_comments;
CREATE POLICY "select_shipment_stage_comments_branch" ON shipment_stage_comments FOR SELECT
  TO authenticated USING (can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_shipment_stage_comments_branch" ON shipment_stage_comments;
CREATE POLICY "insert_shipment_stage_comments_branch" ON shipment_stage_comments FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "delete_shipment_stage_comments_branch" ON shipment_stage_comments;
CREATE POLICY "delete_shipment_stage_comments_branch" ON shipment_stage_comments FOR DELETE
  TO authenticated USING (can_access_branch(branch_id));

-- ============================================================
-- TRIGGERS / INDEXES
-- ============================================================

DO $$ BEGIN
  CREATE TRIGGER trigger_shipment_stages_updated_at
    BEFORE UPDATE ON shipment_stages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_shipment_stages_shipment_id ON shipment_stages(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_stages_branch_id ON shipment_stages(branch_id);
CREATE INDEX IF NOT EXISTS idx_shipment_stages_status ON shipment_stages(status);
CREATE INDEX IF NOT EXISTS idx_shipment_stage_comments_stage_id ON shipment_stage_comments(stage_id);
CREATE INDEX IF NOT EXISTS idx_shipment_stage_comments_shipment_id ON shipment_stage_comments(shipment_id);

-- ============================================================
-- BACKFILL: seed stage rows for every existing shipment
-- ============================================================

WITH status_reach AS (
  SELECT * FROM (VALUES
    ('booking_received'::shipment_status, 4),
    ('documentation'::shipment_status, 6),
    ('processing'::shipment_status, 8),
    ('in_transit'::shipment_status, 12),
    ('arrived'::shipment_status, 13),
    ('delivered'::shipment_status, 14),
    ('cancelled'::shipment_status, 4)
  ) AS t(status, reached_sequence)
)
INSERT INTO shipment_stages (
  shipment_id, catalog_id, branch_id, stage_key, sequence, label,
  assigned_department, assigned_to, status, is_optional,
  started_at, completed_at, created_by, updated_by
)
SELECT
  s.id,
  c.id,
  s.branch_id,
  c.key,
  c.sequence,
  c.label,
  c.default_department,
  CASE WHEN c.default_department = 'operations'::user_role THEN s.assigned_to ELSE NULL END,
  CASE
    WHEN c.sequence < r.reached_sequence THEN 'completed'::workflow_stage_status
    WHEN c.sequence = r.reached_sequence THEN 'in_progress'::workflow_stage_status
    ELSE 'pending'::workflow_stage_status
  END,
  c.is_optional,
  CASE WHEN c.sequence < r.reached_sequence THEN s.updated_at END,
  CASE WHEN c.sequence < r.reached_sequence THEN s.updated_at END,
  s.created_by,
  s.updated_by
FROM shipments s
JOIN status_reach r ON r.status = s.status
CROSS JOIN workflow_stage_catalog c
WHERE s.deleted_at IS NULL
ON CONFLICT (shipment_id, catalog_id) DO NOTHING;
