-- ============================================================
-- FINANCIAL EXPOSURE MODULE
-- ============================================================
-- Tracks money being lost after a shipment is already underway —
-- demurrage, detention, terminal/warehouse storage, penalties, and
-- emergency charges. These are exception costs, never known at
-- quotation time and never sold to the customer as a quotation service
-- (see the lib/quotation-constants.ts cleanup in the same release).
--
-- Unlike shipment_customs (1:1 per shipment), a shipment can carry
-- multiple simultaneous exposures — e.g. demurrage on one container and
-- detention on another — so there's no unique constraint on shipment_id.
--
-- current_days / accumulated_cost are deliberately NOT columns here.
-- They're derived at read time from start_date/free_days/end_date/
-- charge_per_day (see lib/utils/financial-exposure.ts::computeExposureAccrual),
-- exactly like isInvoiceOverdue()/isDocumentExpired() in
-- lib/utils/status.ts — there's no scheduled job in this project to keep
-- a stored "current days" value from going stale, so it's computed fresh
-- on every read instead. end_date, once set, freezes the accrual at
-- resolution; while null, "today" is the effective end.

DO $$ BEGIN
  CREATE TYPE exposure_type AS ENUM (
    'demurrage', 'detention', 'terminal_storage', 'warehouse_storage', 'penalty', 'emergency_charge'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE responsible_party AS ENUM (
    'customer', 'freight_forwarder', 'shipping_line', 'terminal', 'customs'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE exposure_status AS ENUM ('pending', 'disputed', 'approved', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS financial_exposures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  exposure_type exposure_type NOT NULL,
  start_date date NOT NULL,
  free_days integer NOT NULL DEFAULT 0,
  end_date date,
  charge_per_day numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',
  responsible_party responsible_party NOT NULL,
  reason text,
  status exposure_status NOT NULL DEFAULT 'pending',
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_exposures_free_days_check CHECK (free_days >= 0),
  CONSTRAINT financial_exposures_charge_check CHECK (charge_per_day >= 0),
  CONSTRAINT financial_exposures_date_check CHECK (end_date IS NULL OR end_date >= start_date)
);

-- Deliberately no deleted_at column: nothing on this table is ever
-- deletable ("Nothing should be deletable. Only reversible with audit
-- trail" per spec). Reversal is a status change only (e.g. approved ->
-- disputed), never a row delete — matches the `activities` table's own
-- insert/select-only shape.

CREATE INDEX IF NOT EXISTS idx_financial_exposures_shipment ON financial_exposures(shipment_id);
CREATE INDEX IF NOT EXISTS idx_financial_exposures_branch_status ON financial_exposures(branch_id, status);

ALTER TABLE financial_exposures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_financial_exposures_branch" ON financial_exposures;
CREATE POLICY "select_financial_exposures_branch" ON financial_exposures FOR SELECT
  TO authenticated USING (can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_financial_exposures_branch" ON financial_exposures;
CREATE POLICY "insert_financial_exposures_branch" ON financial_exposures FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "update_financial_exposures_branch" ON financial_exposures;
CREATE POLICY "update_financial_exposures_branch" ON financial_exposures FOR UPDATE
  TO authenticated
  USING (can_access_branch(branch_id) AND can_manage_operations())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

-- No DELETE policy at all (default-deny under RLS) — nothing on this
-- table is deletable, by design.

DO $$ BEGIN
  CREATE TRIGGER trigger_financial_exposures_updated_at
    BEFORE UPDATE ON financial_exposures
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE financial_exposures IS
  'Money being lost after a shipment is underway: demurrage, detention, terminal/warehouse storage, penalties, emergency charges. Never a quotation charge. current_days/accumulated_cost are computed at read time, not stored.';
