/*
# Business Schema: Invoices, Payments, and Expenses

## Overview
Adds the finance module: invoicing customers (optionally against a shipment
or quotation), recording payments received, allocating those payments
against one or more invoices, and tracking company expenses.

## New Tables

### invoices
- `id` (uuid, PK)
- `invoice_number` (text, unique): Auto-generated INV-YYYY-NNNN
- `customer_id` (uuid, FK -> customers)
- `shipment_id` (uuid, FK -> shipments, nullable): Optional shipment this bills for
- `quotation_id` (uuid, FK -> quotations, nullable): Optional source quotation
- `branch_id` (uuid, FK -> branches)
- `status` (enum): draft | sent | partial | paid | cancelled
  Note: "Overdue" is NOT a stored status — it's derived in the app as
  status IN ('sent','partial') AND due_date < today, the same approach
  already used for "delayed shipments." Storing it would require a
  scheduled job to flip it at midnight, which this project has no
  infrastructure for.
- `issue_date` / `due_date` (date)
- `subtotal` / `tax_amount` / `total` (numeric)
- `amount_paid` (numeric): Denormalized, maintained by trigger from
  `payment_allocations` — lets list views show paid/outstanding without
  a join+aggregate on every row.
- `currency` (text, default NGN)
- `notes` / `terms` (text)
- Audit: `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`

### payments
- `id` (uuid, PK)
- `payment_number` (text, unique): Auto-generated PAY-YYYY-NNNN
- `customer_id` (uuid, FK -> customers)
- `branch_id` (uuid, FK -> branches)
- `payment_date` (date)
- `payment_method` (enum): bank_transfer | cheque | cash | card | other
- `amount` (numeric): Total amount actually received
- `allocated_amount` (numeric): Denormalized, maintained by trigger —
  sum of this payment's allocations. `amount - allocated_amount` is the
  unapplied/unallocated remainder (e.g. advance payment or overpayment).
- `reference` (text, nullable): External reference (bank txn id, cheque no.)
- `notes` (text)
- Audit fields as above

### payment_allocations
- `id` (uuid, PK)
- `payment_id` (uuid, FK -> payments)
- `invoice_id` (uuid, FK -> invoices)
- `amount` (numeric): How much of this payment was applied to this invoice
- `created_at`, `created_by`
A single payment can be split across multiple invoices, and a single
invoice can be paid by multiple payments — this is the join table.
A trigger keeps `invoices.amount_paid`/`status` and
`payments.allocated_amount` in sync whenever allocations change.

### expenses
- `id` (uuid, PK)
- `expense_number` (text, unique): Auto-generated EXP-YYYY-NNNN
- `description` (text)
- `category` (enum): transport | customs | rent | salaries_benefits | utilities | other
- `shipment_id` (uuid, FK -> shipments, nullable): Optional link (e.g. a customs fee for a specific shipment)
- `branch_id` (uuid, FK -> branches)
- `amount` (numeric), `currency` (text, default NGN)
- `expense_date` (date)
- `status` (enum): pending | approved | rejected
- `paid_by` (uuid, FK -> profiles): Who incurred/paid it
- `approved_by` (uuid, FK -> profiles, nullable)
- `notes` (text)
- Audit fields as above

## Security
RLS on all four tables, branch-scoped via the existing `can_access_branch()`
helper — identical pattern to shipments/quotations/documents. No new
permission model introduced.
*/

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'partial', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method_enum AS ENUM ('bank_transfer', 'cheque', 'cash', 'card', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE expense_category AS ENUM ('transport', 'customs', 'rent', 'salaries_benefits', 'utilities', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE expense_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- INVOICES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  shipment_id uuid REFERENCES shipments(id) ON DELETE SET NULL,
  quotation_id uuid REFERENCES quotations(id) ON DELETE SET NULL,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  status invoice_status NOT NULL DEFAULT 'draft',
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  amount_paid numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',
  notes text,
  terms text,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_invoices_branch" ON invoices;
CREATE POLICY "select_invoices_branch" ON invoices FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_invoices_branch" ON invoices;
CREATE POLICY "insert_invoices_branch" ON invoices FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "update_invoices_branch" ON invoices;
CREATE POLICY "update_invoices_branch" ON invoices FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "delete_invoices_branch" ON invoices;
CREATE POLICY "delete_invoices_branch" ON invoices FOR DELETE
  TO authenticated USING (can_access_branch(branch_id));

-- ============================================================
-- PAYMENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text UNIQUE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method payment_method_enum NOT NULL DEFAULT 'bank_transfer',
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  allocated_amount numeric(14,2) NOT NULL DEFAULT 0,
  reference text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_payments_branch" ON payments;
CREATE POLICY "select_payments_branch" ON payments FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_payments_branch" ON payments;
CREATE POLICY "insert_payments_branch" ON payments FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "update_payments_branch" ON payments;
CREATE POLICY "update_payments_branch" ON payments FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "delete_payments_branch" ON payments;
CREATE POLICY "delete_payments_branch" ON payments FOR DELETE
  TO authenticated USING (can_access_branch(branch_id));

-- ============================================================
-- PAYMENT ALLOCATIONS TABLE (join: payments <-> invoices)
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_allocations_branch" ON payment_allocations;
CREATE POLICY "select_allocations_branch" ON payment_allocations FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM payments p
      WHERE p.id = payment_allocations.payment_id
        AND can_access_branch(p.branch_id)
    )
  );

DROP POLICY IF EXISTS "insert_allocations_branch" ON payment_allocations;
CREATE POLICY "insert_allocations_branch" ON payment_allocations FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM payments p
      WHERE p.id = payment_allocations.payment_id
        AND can_access_branch(p.branch_id)
    )
  );

DROP POLICY IF EXISTS "delete_allocations_branch" ON payment_allocations;
CREATE POLICY "delete_allocations_branch" ON payment_allocations FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM payments p
      WHERE p.id = payment_allocations.payment_id
        AND can_access_branch(p.branch_id)
    )
  );

-- ============================================================
-- EXPENSES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number text UNIQUE,
  description text NOT NULL,
  category expense_category NOT NULL DEFAULT 'other',
  shipment_id uuid REFERENCES shipments(id) ON DELETE SET NULL,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'NGN',
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  status expense_status NOT NULL DEFAULT 'pending',
  paid_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_expenses_branch" ON expenses;
CREATE POLICY "select_expenses_branch" ON expenses FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_expenses_branch" ON expenses;
CREATE POLICY "insert_expenses_branch" ON expenses FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "update_expenses_branch" ON expenses;
CREATE POLICY "update_expenses_branch" ON expenses FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "delete_expenses_branch" ON expenses;
CREATE POLICY "delete_expenses_branch" ON expenses FOR DELETE
  TO authenticated USING (can_access_branch(branch_id));

-- ============================================================
-- AUTO-NUMBERING: invoices (INV-YYYY-NNNN), payments (PAY-YYYY-NNNN),
-- expenses (EXP-YYYY-NNNN)
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1;
CREATE SEQUENCE IF NOT EXISTS payment_seq START 1;
CREATE SEQUENCE IF NOT EXISTS expense_seq START 1;

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  next_val bigint;
BEGIN
  next_val := nextval('invoice_seq');
  RETURN 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(next_val::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION generate_payment_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  next_val bigint;
BEGIN
  next_val := nextval('payment_seq');
  RETURN 'PAY-' || to_char(now(), 'YYYY') || '-' || lpad(next_val::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION generate_expense_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  next_val bigint;
BEGIN
  next_val := nextval('expense_seq');
  RETURN 'EXP-' || to_char(now(), 'YYYY') || '-' || lpad(next_val::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION set_invoice_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := generate_invoice_number();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION set_payment_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.payment_number IS NULL THEN
    NEW.payment_number := generate_payment_number();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION set_expense_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.expense_number IS NULL THEN
    NEW.expense_number := generate_expense_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_invoice_number ON invoices;
CREATE TRIGGER trigger_set_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_invoice_number();

DROP TRIGGER IF EXISTS trigger_set_payment_number ON payments;
CREATE TRIGGER trigger_set_payment_number
  BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION set_payment_number();

DROP TRIGGER IF EXISTS trigger_set_expense_number ON expenses;
CREATE TRIGGER trigger_set_expense_number
  BEFORE INSERT ON expenses
  FOR EACH ROW EXECUTE FUNCTION set_expense_number();

-- ============================================================
-- ALLOCATION SYNC: keep invoices.amount_paid/status and
-- payments.allocated_amount correct whenever payment_allocations change
-- ============================================================

CREATE OR REPLACE FUNCTION sync_payment_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  target_invoice_id uuid;
  target_payment_id uuid;
  invoice_total numeric(14,2);
  new_amount_paid numeric(14,2);
  current_status invoice_status;
BEGIN
  -- Determine which invoice/payment rows need recalculating
  IF TG_OP = 'DELETE' THEN
    target_invoice_id := OLD.invoice_id;
    target_payment_id := OLD.payment_id;
  ELSE
    target_invoice_id := NEW.invoice_id;
    target_payment_id := NEW.payment_id;
  END IF;

  -- Recalculate the invoice's amount_paid + status
  SELECT total, status INTO invoice_total, current_status
  FROM invoices WHERE id = target_invoice_id;

  SELECT COALESCE(SUM(amount), 0) INTO new_amount_paid
  FROM payment_allocations WHERE invoice_id = target_invoice_id;

  UPDATE invoices SET
    amount_paid = new_amount_paid,
    status = CASE
      WHEN new_amount_paid >= invoice_total AND invoice_total > 0 THEN 'paid'::invoice_status
      WHEN new_amount_paid > 0 THEN 'partial'::invoice_status
      WHEN current_status IN ('paid', 'partial') THEN 'sent'::invoice_status
      ELSE current_status
    END,
    updated_at = now()
  WHERE id = target_invoice_id;

  -- Recalculate the payment's allocated_amount
  UPDATE payments SET
    allocated_amount = (
      SELECT COALESCE(SUM(amount), 0) FROM payment_allocations WHERE payment_id = target_payment_id
    ),
    updated_at = now()
  WHERE id = target_payment_id;

  -- Handle UPDATE where invoice_id/payment_id itself changed: also
  -- recalculate the OLD targets so they don't retain stale totals.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
      UPDATE invoices SET
        amount_paid = (SELECT COALESCE(SUM(amount), 0) FROM payment_allocations WHERE invoice_id = OLD.invoice_id),
        updated_at = now()
      WHERE id = OLD.invoice_id;
    END IF;
    IF OLD.payment_id IS DISTINCT FROM NEW.payment_id THEN
      UPDATE payments SET
        allocated_amount = (SELECT COALESCE(SUM(amount), 0) FROM payment_allocations WHERE payment_id = OLD.payment_id),
        updated_at = now()
      WHERE id = OLD.payment_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_payment_allocation ON payment_allocations;
CREATE TRIGGER trigger_sync_payment_allocation
  AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION sync_payment_allocation();

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

DO $$ BEGIN
  CREATE TRIGGER trigger_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_invoices_branch_id ON invoices(branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_shipment_id ON invoices(shipment_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payments_branch_id ON payments(branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_allocations_payment_id ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_allocations_invoice_id ON payment_allocations(invoice_id);

CREATE INDEX IF NOT EXISTS idx_expenses_branch_id ON expenses(branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_shipment_id ON expenses(shipment_id) WHERE deleted_at IS NULL;
