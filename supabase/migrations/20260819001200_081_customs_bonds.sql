/*
# Customs Bonds

A customs bond is the financial guarantee (posted through a surety —
usually a bank or insurance company) that duties/taxes on a shipment will
actually be paid — customs' protection against a company clearing goods
and then defaulting. Frequently a hard requirement before release, not
optional, especially for high-value cargo or deferred-duty schemes.

Lives on the Customs tab, gated the same way shipment_customs itself is
(can_manage_customs(), migration 031) rather than can_manage_operations()
or can_manage_documentation() — this is a customs-specific instrument,
not a terminal or documentation one.
*/

DO $$ BEGIN
  CREATE TYPE customs_bond_type AS ENUM ('single_entry', 'continuous', 'bonded_warehouse', 'transit', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE customs_bond_status AS ENUM ('active', 'discharged', 'expired', 'claimed_against');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS customs_bonds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bond_number text,
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  bond_type customs_bond_type NOT NULL DEFAULT 'single_entry',
  -- The bank or insurance company that issued/underwrote the bond.
  surety_name text,
  bond_amount numeric(14,2),
  currency text NOT NULL DEFAULT 'NGN',
  issue_date date,
  expiry_date date,
  status customs_bond_status NOT NULL DEFAULT 'active',
  discharged_date date,
  notes text,
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE customs_bonds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_customs_bonds_branch" ON customs_bonds;
CREATE POLICY "select_customs_bonds_branch" ON customs_bonds FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_customs_bonds_branch" ON customs_bonds;
CREATE POLICY "insert_customs_bonds_branch" ON customs_bonds FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_customs());

DROP POLICY IF EXISTS "update_customs_bonds_branch" ON customs_bonds;
CREATE POLICY "update_customs_bonds_branch" ON customs_bonds FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_customs())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_customs());

DROP POLICY IF EXISTS "delete_customs_bonds_branch" ON customs_bonds;
CREATE POLICY "delete_customs_bonds_branch" ON customs_bonds FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_customs());

CREATE INDEX IF NOT EXISTS idx_customs_bonds_shipment ON customs_bonds(shipment_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_customs_bonds_updated_at') THEN
    CREATE TRIGGER trigger_customs_bonds_updated_at
      BEFORE UPDATE ON customs_bonds
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
