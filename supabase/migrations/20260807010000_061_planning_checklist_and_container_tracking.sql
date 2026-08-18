-- ============================================================
-- PLANNING CENTRE — WORKFLOW, INTELLIGENCE & USABILITY PASS
-- ============================================================
-- Two independent changes bundled in one migration:
--  1. Container Management enrichment (§6 of the spec) — 5 new
--     tracking fields on shipment_containers.
--  2. Auto Task Generation reseed (§8) — replaces the flat 8-task
--     'planning' stage_task_templates seed (migration 060) with the
--     richer 19-task, 5-department breakdown. The old rows are
--     deactivated, not deleted — any plan_tasks already created from
--     them keep their copied title string, so this is non-destructive.

-- ============================================================
-- CONTAINER MANAGEMENT enrichment
-- ============================================================

ALTER TABLE shipment_containers
  ADD COLUMN IF NOT EXISTS expected_arrival_date date,
  ADD COLUMN IF NOT EXISTS gate_out_date date,
  ADD COLUMN IF NOT EXISTS returned_empty_date date,
  ADD COLUMN IF NOT EXISTS current_location text;

DO $$ BEGIN
  CREATE TYPE container_do_status AS ENUM ('pending', 'issued', 'collected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE shipment_containers
  ADD COLUMN IF NOT EXISTS do_status container_do_status NOT NULL DEFAULT 'pending';
-- status (free-text) and notes (remarks) already exist from earlier
-- migrations — reused, not duplicated.

-- ============================================================
-- AUTO TASK GENERATION reseed — richer per-department breakdown
-- ============================================================

UPDATE stage_task_templates
SET is_active = false
WHERE stage_key = 'planning'
  AND title IN (
    'Confirm Booking', 'Collect Commercial Invoice', 'Collect Packing List',
    'Verify HS Code', 'Apply for PAAR', 'Book Terminal Slot',
    'Assign Truck', 'Arrange Delivery'
  );

INSERT INTO stage_task_templates (stage_key, title, default_priority, default_department, sort_order) VALUES
  ('planning', 'Collect Commercial Invoice', 'medium', 'documentation', 1),
  ('planning', 'Collect Packing List', 'medium', 'documentation', 2),
  ('planning', 'Collect Bill of Lading', 'medium', 'documentation', 3),
  ('planning', 'Verify Certificate of Origin', 'medium', 'documentation', 4),
  ('planning', 'Upload Documents', 'medium', 'documentation', 5),

  ('planning', 'Prepare PAAR', 'high', 'customs', 6),
  ('planning', 'Prepare Declaration', 'high', 'customs', 7),
  ('planning', 'Estimate Duty', 'medium', 'customs', 8),
  ('planning', 'Schedule Examination', 'medium', 'customs', 9),

  ('planning', 'Reserve Slot', 'high', 'terminal', 10),
  ('planning', 'Arrange Terminal Entry', 'medium', 'terminal', 11),
  ('planning', 'Monitor Container Arrival', 'medium', 'terminal', 12),

  ('planning', 'Assign Truck', 'medium', 'transport', 13),
  ('planning', 'Assign Driver', 'medium', 'transport', 14),
  ('planning', 'Schedule Delivery', 'medium', 'transport', 15),
  ('planning', 'Confirm Delivery', 'medium', 'transport', 16),

  ('planning', 'Estimate Charges', 'medium', 'finance', 17),
  ('planning', 'Monitor Demurrage', 'medium', 'finance', 18),
  ('planning', 'Prepare Final Invoice', 'medium', 'finance', 19)
ON CONFLICT (stage_key, title) DO UPDATE SET is_active = true;
