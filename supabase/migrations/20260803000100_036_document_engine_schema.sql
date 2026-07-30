/*
# Document Engine: templates + backward-compatible documents ALTER

## Design
document_templates is developer-seeded reference data resolving which
documents are required for a shipment, based on shipment_type and
whether customs selected the red inspection channel. All new `documents`
columns are nullable or DEFAULTed, so every existing row and every
existing INSERT (standalone /documents page, examination/transportation
attachments) keeps working unmodified — this is a pure ALTER, no
backfill/UPDATE needed beyond Postgres filling the `status` default.

## RLS
document_templates: read-only reference data, same pattern as
workflow_stage_catalog. `documents` RLS is untouched —
update_documents_branch (migration 034) already allows
created_by/admin/can_manage_documentation() to update a row, which is
exactly what "verify/reject" needs.
*/

-- ============================================================
-- ENUM
-- ============================================================

DO $$ BEGIN
  CREATE TYPE document_status AS ENUM ('uploaded', 'verified', 'rejected', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- DOCUMENT_TEMPLATES
-- ============================================================

CREATE TABLE IF NOT EXISTS document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  name text NOT NULL,
  category document_category NOT NULL,
  stage_key text REFERENCES workflow_stage_catalog(key) ON DELETE SET NULL,
  applies_to_shipment_types shipment_type_enum[],
  requires_red_channel boolean NOT NULL DEFAULT false,
  is_required boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_document_templates_all" ON document_templates;
CREATE POLICY "select_document_templates_all" ON document_templates FOR SELECT
  TO authenticated USING (is_active);
-- No INSERT/UPDATE/DELETE policy: seeded/DB-editable only.

INSERT INTO document_templates (key, name, category, stage_key, applies_to_shipment_types, requires_red_channel, is_required, sort_order) VALUES
  ('bill_of_lading', 'Bill of Lading', 'bill_of_lading', 'documentation', ARRAY['sea','road','rail','multimodal']::shipment_type_enum[], false, true, 1),
  ('air_waybill', 'Air Waybill', 'air_waybill', 'documentation', ARRAY['air']::shipment_type_enum[], false, true, 1),
  ('commercial_invoice', 'Commercial Invoice', 'invoice', 'documentation', NULL, false, true, 2),
  ('packing_list', 'Packing List', 'packing_list', 'documentation', NULL, false, true, 3),
  ('insurance_certificate', 'Insurance Certificate', 'other', 'documentation', NULL, false, false, 4),
  ('form_m', 'Form M', 'customs', 'documentation', NULL, false, true, 5),
  ('paar', 'PAAR (Pre-Arrival Assessment Report)', 'customs', 'documentation', NULL, false, true, 6),
  ('duty_payment_receipt', 'Duty Payment Receipt', 'customs', 'customs_clearance', NULL, false, true, 7),
  ('inspection_report', 'Inspection Report', 'other', 'cargo_examination', NULL, true, true, 8),
  ('inspection_photos', 'Inspection Photos', 'other', 'cargo_examination', NULL, true, false, 9),
  ('gate_pass', 'Gate Pass', 'other', 'terminal_operations', NULL, false, true, 10),
  ('exit_note', 'Exit Note', 'other', 'terminal_operations', NULL, false, true, 11),
  ('proof_of_delivery', 'Proof of Delivery', 'proof_of_delivery', 'transportation', NULL, false, true, 12)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- DOCUMENTS: additive, backward-compatible columns
-- ============================================================

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS status document_status NOT NULL DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS replaces_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES document_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES shipment_stages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_template_id ON documents(template_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_stage_id ON documents(stage_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_replaces_document_id ON documents(replaces_document_id);
