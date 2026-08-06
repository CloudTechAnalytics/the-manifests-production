-- ============================================================
-- CUSTOMS DUTY ASSESSMENT
-- ============================================================
-- Customs Duty is never quotation revenue — it's paid by the importer
-- directly to Nigeria Customs, we only track it operationally. This
-- extends the existing 1:1 shipment_customs record (it's already the
-- natural per-shipment customs record, with duty_amount/duty_paid/
-- duty_paid_date already on it) with the full duty breakdown the
-- Customs tab's new "Duty Assessment" section needs, plus a distinct
-- duty_status lifecycle (Not Assessed / Awaiting Payment / Paid /
-- Verified) separate from the existing `status` column, which tracks
-- the broader customs-clearance workflow, not duty assessment
-- specifically.

DO $$ BEGIN
  CREATE TYPE duty_status AS ENUM ('not_assessed', 'awaiting_payment', 'paid', 'verified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE shipment_customs
  ADD COLUMN IF NOT EXISTS duty_vat numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duty_levy numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duty_ciss numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duty_etls numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duty_paid_by text,
  ADD COLUMN IF NOT EXISTS duty_receipt_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duty_status duty_status NOT NULL DEFAULT 'not_assessed';

-- Total Duty is a pure, time-independent sum (duty_amount + VAT + Levy +
-- CISS + ETLS) — safe to store as generated, unlike the Financial Exposure
-- accrual (migration 058) which genuinely depends on "today" and must stay
-- derived at read time instead.
ALTER TABLE shipment_customs
  ADD COLUMN IF NOT EXISTS duty_total numeric(14,2)
    GENERATED ALWAYS AS (duty_amount + duty_vat + duty_levy + duty_ciss + duty_etls) STORED;

-- duty_paid_date (already existed) is reused as-is for the Duty Assessment
-- "Payment Date" field — no new date column needed.

-- No RLS changes needed: shipment_customs' existing SELECT/INSERT/UPDATE
-- policies (can_access_branch / can_manage_customs, from migrations 029 and
-- 031) already cover these new columns — RLS is row-level, not column-level.

COMMENT ON COLUMN shipment_customs.duty_total IS
  'Generated: duty_amount + duty_vat + duty_levy + duty_ciss + duty_etls. Total Duty on the Customs tab''s Duty Assessment card.';
COMMENT ON COLUMN shipment_customs.duty_status IS
  'Duty assessment lifecycle (not_assessed -> awaiting_payment -> paid -> verified), distinct from the broader `status` customs-clearance workflow column.';
