/*
# Task Engine: stage task templates + per-shipment tasks

## Design
Reuses plan_task_status and priority_level verbatim (same enum values,
same click-to-cycle UX as plan_tasks) instead of inventing new ones.
stage_task_templates is developer-seeded; shipment_tasks is populated
client-side when a stage's "Start" action fires — no DB trigger,
matching this schema's no-trigger convention for business rules.

## Dynamic RLS
shipment_tasks.assigned_department varies per row (nullable — ad-hoc
tasks may have no department). Same inline has_role(assigned_department)
pattern as shipment_stages.
*/

-- ============================================================
-- STAGE_TASK_TEMPLATES (developer-seeded reference data)
-- ============================================================

CREATE TABLE IF NOT EXISTS stage_task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_key text NOT NULL REFERENCES workflow_stage_catalog(key) ON DELETE CASCADE,
  title text NOT NULL,
  default_priority priority_level NOT NULL DEFAULT 'medium',
  default_department user_role,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage_key, title)
);

ALTER TABLE stage_task_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_stage_task_templates_all" ON stage_task_templates;
CREATE POLICY "select_stage_task_templates_all" ON stage_task_templates FOR SELECT
  TO authenticated USING (is_active);
-- No INSERT/UPDATE/DELETE policy: seeded/DB-editable only.

INSERT INTO stage_task_templates (stage_key, title, default_priority, default_department, sort_order) VALUES
  ('lead', 'Log Lead Details', 'medium', 'sales', 1),
  ('lead', 'Qualify Lead', 'medium', 'sales', 2),

  ('quotation', 'Prepare Quotation', 'medium', 'sales', 1),
  ('quotation', 'Send Quotation to Customer', 'medium', 'sales', 2),

  ('quotation_approved', 'Confirm Customer Acceptance', 'high', 'sales', 1),

  ('shipment_created', 'Confirm Booking Details', 'high', 'operations', 1),
  ('shipment_created', 'Notify Customer of Booking', 'medium', 'operations', 2),

  ('planning', 'Assign Operations Officer', 'high', 'planning', 1),
  ('planning', 'Assign Documentation Officer', 'high', 'planning', 2),
  ('planning', 'Set ETA', 'medium', 'planning', 3),
  ('planning', 'Assign Priority', 'low', 'planning', 4),

  ('documentation', 'Upload Bill of Lading / Air Waybill', 'high', 'documentation', 1),
  ('documentation', 'Upload Commercial Invoice', 'high', 'documentation', 2),
  ('documentation', 'Upload Packing List', 'high', 'documentation', 3),
  ('documentation', 'Upload Insurance Certificate', 'medium', 'documentation', 4),
  ('documentation', 'Upload Form M', 'high', 'documentation', 5),
  ('documentation', 'Upload PAAR', 'high', 'documentation', 6),
  ('documentation', 'Verify Documents', 'high', 'documentation', 7),

  ('regulatory_compliance', 'Verify Form M Validity', 'high', 'customs', 1),
  ('regulatory_compliance', 'Verify PAAR', 'high', 'customs', 2),
  ('regulatory_compliance', 'Regulatory Compliance Sign-off', 'high', 'customs', 3),

  ('customs_clearance', 'Submit Customs Declaration (SGD)', 'high', 'customs', 1),
  ('customs_clearance', 'Pay Duty', 'high', 'customs', 2),
  ('customs_clearance', 'Obtain Customs Release', 'high', 'customs', 3),

  ('terminal_operations', 'Position Container at Terminal', 'medium', 'terminal', 1),
  ('terminal_operations', 'Schedule Examination (if required)', 'medium', 'terminal', 2),
  ('terminal_operations', 'Obtain Gate Pass', 'high', 'terminal', 3),
  ('terminal_operations', 'Issue Exit Note', 'high', 'terminal', 4),

  ('cargo_examination', 'Schedule Physical Examination', 'high', 'examination', 1),
  ('cargo_examination', 'Attend Examination', 'high', 'examination', 2),
  ('cargo_examination', 'Upload Inspection Report', 'high', 'examination', 3),

  ('warehouse', 'Receive Cargo into Warehouse', 'medium', 'warehouse', 1),
  ('warehouse', 'Release Cargo from Warehouse', 'medium', 'warehouse', 2),

  ('transportation', 'Assign Truck & Driver', 'high', 'transport', 1),
  ('transportation', 'Confirm Pickup', 'medium', 'transport', 2),
  ('transportation', 'Confirm Delivery', 'high', 'transport', 3),
  ('transportation', 'Upload Proof of Delivery', 'high', 'transport', 4),

  ('delivered', 'Confirm Delivery with Customer', 'medium', 'operations', 1),
  ('delivered', 'Close Out Shipment File', 'low', 'operations', 2),

  ('completed', 'Archive Shipment Documents', 'low', 'operations', 1),
  ('completed', 'Confirm Final Invoice/Payment', 'medium', 'operations', 2)
ON CONFLICT (stage_key, title) DO NOTHING;

-- ============================================================
-- SHIPMENT_TASKS
-- ============================================================

CREATE TABLE IF NOT EXISTS shipment_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES shipment_stages(id) ON DELETE CASCADE,
  template_id uuid REFERENCES stage_task_templates(id) ON DELETE SET NULL,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  title text NOT NULL,
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_department user_role,
  due_date date,
  status plan_task_status NOT NULL DEFAULT 'pending',
  priority priority_level NOT NULL DEFAULT 'medium',
  completed_at timestamptz,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shipment_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_shipment_tasks_branch" ON shipment_tasks;
CREATE POLICY "select_shipment_tasks_branch" ON shipment_tasks FOR SELECT
  TO authenticated USING (can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_shipment_tasks_branch" ON shipment_tasks;
CREATE POLICY "insert_shipment_tasks_branch" ON shipment_tasks FOR INSERT
  TO authenticated WITH CHECK (
    can_access_branch(branch_id)
    AND (assigned_department IS NULL OR is_admin() OR is_branch_manager() OR has_role(assigned_department))
  );

DROP POLICY IF EXISTS "update_shipment_tasks_branch" ON shipment_tasks;
CREATE POLICY "update_shipment_tasks_branch" ON shipment_tasks FOR UPDATE
  TO authenticated
  USING (can_access_branch(branch_id))
  WITH CHECK (
    can_access_branch(branch_id)
    AND (
      is_admin() OR is_branch_manager()
      OR (assigned_department IS NOT NULL AND has_role(assigned_department))
      OR assigned_to = auth.uid()
    )
  );

DROP POLICY IF EXISTS "delete_shipment_tasks_branch" ON shipment_tasks;
CREATE POLICY "delete_shipment_tasks_branch" ON shipment_tasks FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND (is_admin() OR is_branch_manager()));

DO $$ BEGIN
  CREATE TRIGGER trigger_shipment_tasks_updated_at
    BEFORE UPDATE ON shipment_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_shipment_tasks_shipment_id ON shipment_tasks(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_tasks_stage_id ON shipment_tasks(stage_id);
CREATE INDEX IF NOT EXISTS idx_shipment_tasks_branch_id ON shipment_tasks(branch_id);
CREATE INDEX IF NOT EXISTS idx_shipment_tasks_status ON shipment_tasks(status);
