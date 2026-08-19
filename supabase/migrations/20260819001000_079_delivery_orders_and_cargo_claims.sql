/*
# Delivery Orders (TDO expiry + regeneration fee) and Cargo Claims

## Delivery Orders — a separate clock from demurrage
terminal_operations.free_time_expiry (migration 029) already tracks how
long a CONTAINER can sit at the terminal before demurrage accrues. A
Delivery Order/TDO is a different thing entirely: the document that
actually authorizes gate-out, issued with its own short validity window
(commonly 24 hours) independent of free time. If the cargo doesn't exit
before the DO expires, it's void — a new one has to be issued, at an
extra cost, even if free time hasn't run out yet. One row per DO *issue*
(not one row per shipment) because a shipment can go through several of
these if regenerated more than once — `superseded_by` chains an expired
DO to whichever one replaced it, so the full history stays visible
rather than being overwritten.

Status is derived client-side from issued_at/expires_at/exited_at, the
same lazy-computation convention org_subscriptions.trial_ends_at
already uses (see daysRemaining in lib/utils/status.ts) — no cron job,
no risk of a missed run leaving stale state.

## Cargo Claims — damage/loss claims filed against a carrier, terminal,
## or insurer once a shipment is delivered
insurance_policy_id links to cargo_insurance_policies (migration 039)
when the claim is against that policy specifically; nullable because a
claim can just as easily be filed directly against the carrier or
terminal instead of an insurer. No dedicated file-upload plumbing here —
evidence is attached via the shipment's existing Documents tab and
referenced by description; building a second upload pathway for the
same shipment would just fragment where files live.

## Expense category
The regeneration fee is logged as its own expense category, distinct
from demurrage/storage/re_examination_penalty (migration 038) - the CEO
was explicit this is billed separately from demurrage, not the same
line item under a different name.
*/

ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'delivery_order_regeneration';

-- ============================================================
-- DELIVERY_ORDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS delivery_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  do_number text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  validity_hours integer NOT NULL DEFAULT 24 CHECK (validity_hours > 0),
  expires_at timestamptz NOT NULL,
  exited_at timestamptz,
  -- Points at whichever DO replaced this one once it expired unused —
  -- NULL means this is either still live or was the one actually used.
  superseded_by uuid REFERENCES delivery_orders(id) ON DELETE SET NULL,
  regeneration_fee numeric(14,2),
  regeneration_fee_currency text NOT NULL DEFAULT 'NGN',
  -- Set once a regeneration fee is turned into an expenses row (Log as
  -- Expense action) so that action can't double-log the same fee twice.
  expense_id uuid REFERENCES expenses(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE delivery_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_delivery_orders_branch" ON delivery_orders;
CREATE POLICY "select_delivery_orders_branch" ON delivery_orders FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_delivery_orders_branch" ON delivery_orders;
CREATE POLICY "insert_delivery_orders_branch" ON delivery_orders FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "update_delivery_orders_branch" ON delivery_orders;
CREATE POLICY "update_delivery_orders_branch" ON delivery_orders FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_operations())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "delete_delivery_orders_branch" ON delivery_orders;
CREATE POLICY "delete_delivery_orders_branch" ON delivery_orders FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_operations());

CREATE INDEX IF NOT EXISTS idx_delivery_orders_shipment ON delivery_orders(shipment_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_delivery_orders_updated_at') THEN
    CREATE TRIGGER trigger_delivery_orders_updated_at
      BEFORE UPDATE ON delivery_orders
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================
-- CARGO_CLAIMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE cargo_claim_type AS ENUM ('damage', 'loss', 'shortage', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cargo_claim_against AS ENUM ('carrier', 'terminal', 'insurer', 'transporter', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cargo_claim_status AS ENUM ('filed', 'under_review', 'approved', 'rejected', 'settled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS cargo_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number text UNIQUE,
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  insurance_policy_id uuid REFERENCES cargo_insurance_policies(id) ON DELETE SET NULL,
  claim_type cargo_claim_type NOT NULL DEFAULT 'damage',
  claimed_against cargo_claim_against NOT NULL DEFAULT 'carrier',
  claimed_against_name text,
  status cargo_claim_status NOT NULL DEFAULT 'filed',
  amount_claimed numeric(14,2),
  amount_settled numeric(14,2),
  currency text NOT NULL DEFAULT 'NGN',
  filed_date date NOT NULL DEFAULT CURRENT_DATE,
  resolved_date date,
  description text,
  notes text,
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE cargo_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_cargo_claims_branch" ON cargo_claims;
CREATE POLICY "select_cargo_claims_branch" ON cargo_claims FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_cargo_claims_branch" ON cargo_claims;
CREATE POLICY "insert_cargo_claims_branch" ON cargo_claims FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_documentation());

DROP POLICY IF EXISTS "update_cargo_claims_branch" ON cargo_claims;
CREATE POLICY "update_cargo_claims_branch" ON cargo_claims FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_documentation())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_documentation());

DROP POLICY IF EXISTS "delete_cargo_claims_branch" ON cargo_claims;
CREATE POLICY "delete_cargo_claims_branch" ON cargo_claims FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_documentation());

CREATE INDEX IF NOT EXISTS idx_cargo_claims_shipment ON cargo_claims(shipment_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_cargo_claims_updated_at') THEN
    CREATE TRIGGER trigger_cargo_claims_updated_at
      BEFORE UPDATE ON cargo_claims
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Auto-numbering: CLM-YYYY-NNNN, same shape as invoice/expense numbers.
CREATE SEQUENCE IF NOT EXISTS cargo_claim_seq START 1;

CREATE OR REPLACE FUNCTION generate_cargo_claim_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  next_val bigint;
BEGIN
  next_val := nextval('cargo_claim_seq');
  RETURN 'CLM-' || to_char(now(), 'YYYY') || '-' || lpad(next_val::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION set_cargo_claim_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.claim_number IS NULL THEN
    NEW.claim_number := generate_cargo_claim_number();
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_set_cargo_claim_number') THEN
    CREATE TRIGGER trigger_set_cargo_claim_number
      BEFORE INSERT ON cargo_claims
      FOR EACH ROW EXECUTE FUNCTION set_cargo_claim_number();
  END IF;
END $$;
