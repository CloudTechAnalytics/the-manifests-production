/*
# Business Schema: Quotations and Quotation Items

## Overview
Creates the quotation management module. Quotation numbers are auto-generated
in the format QTN-YYYY-NNNN (e.g., QTN-2026-0001). Each quotation belongs to a
customer and a branch, with line items for individual services.

## New Tables

### quotations
- `id` (uuid, PK)
- `quotation_number` (text, unique): Auto-generated QTN-YYYY-NNNN
- `customer_id` (uuid, FK -> customers): Customer being quoted
- `branch_id` (uuid, FK -> branches): Owning branch
- `status` (enum): draft | sent | approved | rejected | expired
- `shipment_type` (enum): air | sea | road | rail | multimodal
- `origin` (text): Origin location
- `destination` (text): Destination location
- `valid_until` (date): Quotation validity date
- `subtotal` (numeric): Sum of all line items
- `tax_amount` (numeric): Total tax
- `total` (numeric): Grand total
- `currency` (text): Currency code (default NGN)
- `notes` (text): Internal notes
- `terms` (text): Terms and conditions
- `created_by` / `updated_by` (uuid): Audit
- `created_at` / `updated_at` / `deleted_at`: Audit timestamps

### quotation_items
- `id` (uuid, PK)
- `quotation_id` (uuid, FK -> quotations): Parent quotation
- `description` (text): Service description
- `quantity` (numeric): Quantity
- `unit_price` (numeric): Price per unit
- `tax_rate` (numeric): Tax rate percentage
- `total` (numeric): Line total
- `created_at` / `updated_at` / `deleted_at`: Audit

## Sequence & Auto-Generation
- `quotation_seq` sequence for numbering
- `generate_quotation_number()` function to create QTN-YYYY-NNNN
- Trigger to auto-set quotation_number on insert

## Security
- RLS on both tables, branch-scoped
*/

DO $$ BEGIN
  CREATE TYPE quotation_status AS ENUM ('draft', 'sent', 'approved', 'rejected', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE shipment_type_enum AS ENUM ('air', 'sea', 'road', 'rail', 'multimodal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- QUOTATIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number text UNIQUE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  status quotation_status NOT NULL DEFAULT 'draft',
  shipment_type shipment_type_enum,
  origin text,
  destination text,
  valid_until date,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',
  notes text,
  terms text,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_quotations_branch" ON quotations;
CREATE POLICY "select_quotations_branch" ON quotations FOR SELECT
  TO authenticated USING (
    deleted_at IS NULL AND can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS "insert_quotations_branch" ON quotations;
CREATE POLICY "insert_quotations_branch" ON quotations FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "update_quotations_branch" ON quotations;
CREATE POLICY "update_quotations_branch" ON quotations FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "delete_quotations_branch" ON quotations;
CREATE POLICY "delete_quotations_branch" ON quotations FOR DELETE
  TO authenticated USING (can_access_branch(branch_id));

-- ============================================================
-- QUOTATION ITEMS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS quotation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id uuid NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(14,2) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_qitems_branch" ON quotation_items;
CREATE POLICY "select_qitems_branch" ON quotation_items FOR SELECT
  TO authenticated USING (
    deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM quotations q
      WHERE q.id = quotation_items.quotation_id
        AND q.deleted_at IS NULL
        AND can_access_branch(q.branch_id)
    )
  );

DROP POLICY IF EXISTS "insert_qitems_branch" ON quotation_items;
CREATE POLICY "insert_qitems_branch" ON quotation_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM quotations q
      WHERE q.id = quotation_items.quotation_id
        AND q.deleted_at IS NULL
        AND can_access_branch(q.branch_id)
    )
  );

DROP POLICY IF EXISTS "update_qitems_branch" ON quotation_items;
CREATE POLICY "update_qitems_branch" ON quotation_items FOR UPDATE
  TO authenticated
  USING (
    deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM quotations q
      WHERE q.id = quotation_items.quotation_id
        AND can_access_branch(q.branch_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quotations q
      WHERE q.id = quotation_items.quotation_id
        AND can_access_branch(q.branch_id)
    )
  );

DROP POLICY IF EXISTS "delete_qitems_branch" ON quotation_items;
CREATE POLICY "delete_qitems_branch" ON quotation_items FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM quotations q
      WHERE q.id = quotation_items.quotation_id
        AND can_access_branch(q.branch_id)
    )
  );

-- ============================================================
-- QUOTATION NUMBER AUTO-GENERATION
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS quotation_seq START 1;

CREATE OR REPLACE FUNCTION generate_quotation_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_val bigint;
  year_text text := to_char(now(), 'YYYY');
  num_text text;
BEGIN
  next_val := nextval('quotation_seq');
  num_text := lpad(next_val::text, 4, '0');
  RETURN 'QTN-' || year_text || '-' || num_text;
END;
$$;

CREATE OR REPLACE FUNCTION set_quotation_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.quotation_number IS NULL THEN
    NEW.quotation_number := generate_quotation_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_quotation_number ON quotations;
DO $$ BEGIN
  CREATE TRIGGER trigger_set_quotation_number
    BEFORE INSERT ON quotations
    FOR EACH ROW
    EXECUTE FUNCTION set_quotation_number();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_quotations_branch_id ON quotations(branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotations_customer_id ON quotations(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotations_status ON quotations(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_quotations_number ON quotations(quotation_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qitems_quotation_id ON quotation_items(quotation_id) WHERE deleted_at IS NULL;

-- ============================================================
-- TRIGGERS
-- ============================================================

DO $$ BEGIN
  CREATE TRIGGER trigger_quotations_updated_at
    BEFORE UPDATE ON quotations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_qitems_updated_at
    BEFORE UPDATE ON quotation_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
