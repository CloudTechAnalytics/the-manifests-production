/*
# Business Schema: Customers and Contacts

## Overview
Creates the central customer database with multiple contacts per customer.
Each customer belongs to a branch (branch isolation via RLS).

## New Tables

### customers
- `id` (uuid, PK)
- `company_name` (text): Customer company name
- `type` (enum): individual | corporate
- `email` (text): Primary email
- `phone` (text): Primary phone
- `address` (text): Full address
- `city` (text): City
- `country` (text): Country (default Nigeria)
- `website` (text): Company website
- `notes` (text): Free-form notes
- `status` (enum): active | inactive | blacklisted
- `branch_id` (uuid, FK -> branches): Owning branch
- `created_by` / `updated_by` (uuid): Audit
- `created_at` / `updated_at` / `deleted_at`: Audit timestamps

### customer_contacts
- `id` (uuid, PK)
- `customer_id` (uuid, FK -> customers): Parent customer
- `name` (text): Contact person name
- `title` (text): Job title
- `email` (text): Contact email
- `phone` (text): Contact phone
- `is_primary` (boolean): Primary contact flag
- `created_at` / `updated_at` / `deleted_at`: Audit

## Security
- RLS on both tables
- Branch-scoped access: users see only their branch's customers; admins see all
- Contacts inherit access from their parent customer's branch
*/

DO $$ BEGIN
  CREATE TYPE customer_type AS ENUM ('individual', 'corporate');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE customer_status AS ENUM ('active', 'inactive', 'blacklisted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- CUSTOMERS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  type customer_type NOT NULL DEFAULT 'corporate',
  email text,
  phone text,
  address text,
  city text,
  country text NOT NULL DEFAULT 'Nigeria',
  website text,
  notes text,
  status customer_status NOT NULL DEFAULT 'active',
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_customers_branch" ON customers;
CREATE POLICY "select_customers_branch" ON customers FOR SELECT
  TO authenticated USING (
    deleted_at IS NULL AND can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS "insert_customers_branch" ON customers;
CREATE POLICY "insert_customers_branch" ON customers FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "update_customers_branch" ON customers;
CREATE POLICY "update_customers_branch" ON customers FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "delete_customers_branch" ON customers;
CREATE POLICY "delete_customers_branch" ON customers FOR DELETE
  TO authenticated USING (can_access_branch(branch_id));

-- ============================================================
-- CUSTOMER CONTACTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text,
  email text,
  phone text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_contacts_branch" ON customer_contacts;
CREATE POLICY "select_contacts_branch" ON customer_contacts FOR SELECT
  TO authenticated USING (
    deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = customer_contacts.customer_id
        AND c.deleted_at IS NULL
        AND can_access_branch(c.branch_id)
    )
  );

DROP POLICY IF EXISTS "insert_contacts_branch" ON customer_contacts;
CREATE POLICY "insert_contacts_branch" ON customer_contacts FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = customer_contacts.customer_id
        AND c.deleted_at IS NULL
        AND can_access_branch(c.branch_id)
    )
  );

DROP POLICY IF EXISTS "update_contacts_branch" ON customer_contacts;
CREATE POLICY "update_contacts_branch" ON customer_contacts FOR UPDATE
  TO authenticated
  USING (
    deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = customer_contacts.customer_id
        AND can_access_branch(c.branch_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = customer_contacts.customer_id
        AND can_access_branch(c.branch_id)
    )
  );

DROP POLICY IF EXISTS "delete_contacts_branch" ON customer_contacts;
CREATE POLICY "delete_contacts_branch" ON customer_contacts FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = customer_contacts.customer_id
        AND can_access_branch(c.branch_id)
    )
  );

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_customers_branch_id ON customers(branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_company_name ON customers(company_name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_customer_id ON customer_contacts(customer_id) WHERE deleted_at IS NULL;

-- ============================================================
-- TRIGGERS
-- ============================================================

DO $$ BEGIN
  CREATE TRIGGER trigger_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_contacts_updated_at
    BEFORE UPDATE ON customer_contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
