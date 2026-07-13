/*
# Business Schema: Shipments, Shipment Timeline, Documents, and Activities

## Overview
Creates the shipment operations module with status tracking, timeline events,
document attachments, and an activity log for audit trails.

## New Tables

### shipments
- `id` (uuid, PK)
- `reference_number` (text, unique): Auto-generated SHP-YYYY-NNNN
- `customer_id` (uuid, FK -> customers)
- `quotation_id` (uuid, FK -> quotations, nullable)
- `branch_id` (uuid, FK -> branches)
- `shipment_type` (enum): air | sea | road | rail | multimodal
- `origin` (text): Origin
- `destination` (text): Destination
- `status` (enum): booking_received | documentation | processing | in_transit | arrived | delivered | cancelled
- `assigned_to` (uuid, FK -> auth.users): Assigned staff
- `booking_date` (date)
- `estimated_departure` (date)
- `estimated_arrival` (date)
- `actual_departure` (date)
- `actual_arrival` (date)
- `carrier` (text): Shipping line or airline
- `tracking_number` (text)
- `container_number` (text)
- `weight` (numeric): Weight in kg
- `volume` (numeric): Volume in CBM
- `notes` (text)
- `created_by` / `updated_by` (uuid)
- `created_at` / `updated_at` / `deleted_at`

### shipment_timeline
- `id` (uuid, PK)
- `shipment_id` (uuid, FK -> shipments)
- `status` (enum): Same as shipment status
- `notes` (text): Notes for this status change
- `created_by` (uuid): Who made the change
- `created_at` (timestamptz)

### documents
- `id` (uuid, PK)
- `shipment_id` (uuid, FK -> shipments, nullable)
- `customer_id` (uuid, FK -> customers, nullable)
- `name` (text): Document name
- `category` (enum): invoice | packing_list | bill_of_lading | air_waybill | delivery_note | customs | proof_of_delivery | other
- `file_path` (text): Supabase Storage path
- `file_size` (bigint): File size in bytes
- `mime_type` (text): File MIME type
- `branch_id` (uuid, FK -> branches)
- `created_by` (uuid)
- `created_at` / `updated_at` / `deleted_at`

### activities
- `id` (uuid, PK)
- `user_id` (uuid, FK -> auth.users)
- `branch_id` (uuid, FK -> branches)
- `action` (text): Action type (e.g., "created_customer", "updated_shipment")
- `entity_type` (text): Table/entity name
- `entity_id` (uuid): Entity reference
- `description` (text): Human-readable description
- `metadata` (jsonb): Additional data
- `created_at` (timestamptz)

## Security
- RLS on all tables, branch-scoped
*/

DO $$ BEGIN
  CREATE TYPE shipment_status AS ENUM (
    'booking_received', 'documentation', 'processing',
    'in_transit', 'arrived', 'delivered', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_category AS ENUM (
    'invoice', 'packing_list', 'bill_of_lading', 'air_waybill',
    'delivery_note', 'customs', 'proof_of_delivery', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- SHIPMENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number text UNIQUE,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  quotation_id uuid REFERENCES quotations(id) ON DELETE SET NULL,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  shipment_type shipment_type_enum,
  origin text,
  destination text,
  status shipment_status NOT NULL DEFAULT 'booking_received',
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  booking_date date,
  estimated_departure date,
  estimated_arrival date,
  actual_departure date,
  actual_arrival date,
  carrier text,
  tracking_number text,
  container_number text,
  weight numeric(14,2),
  volume numeric(14,2),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_shipments_branch" ON shipments;
CREATE POLICY "select_shipments_branch" ON shipments FOR SELECT
  TO authenticated USING (
    deleted_at IS NULL AND can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS "insert_shipments_branch" ON shipments;
CREATE POLICY "insert_shipments_branch" ON shipments FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "update_shipments_branch" ON shipments;
CREATE POLICY "update_shipments_branch" ON shipments FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "delete_shipments_branch" ON shipments;
CREATE POLICY "delete_shipments_branch" ON shipments FOR DELETE
  TO authenticated USING (can_access_branch(branch_id));

-- ============================================================
-- SHIPMENT TIMELINE TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS shipment_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  status shipment_status NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shipment_timeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_timeline_branch" ON shipment_timeline;
CREATE POLICY "select_timeline_branch" ON shipment_timeline FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = shipment_timeline.shipment_id
        AND s.deleted_at IS NULL
        AND can_access_branch(s.branch_id)
    )
  );

DROP POLICY IF EXISTS "insert_timeline_branch" ON shipment_timeline;
CREATE POLICY "insert_timeline_branch" ON shipment_timeline FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = shipment_timeline.shipment_id
        AND s.deleted_at IS NULL
        AND can_access_branch(s.branch_id)
    )
  );

DROP POLICY IF EXISTS "delete_timeline_branch" ON shipment_timeline;
CREATE POLICY "delete_timeline_branch" ON shipment_timeline FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = shipment_timeline.shipment_id
        AND can_access_branch(s.branch_id)
    )
  );

-- ============================================================
-- DOCUMENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid REFERENCES shipments(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  category document_category NOT NULL DEFAULT 'other',
  file_path text NOT NULL,
  file_size bigint,
  mime_type text,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_documents_branch" ON documents;
CREATE POLICY "select_documents_branch" ON documents FOR SELECT
  TO authenticated USING (
    deleted_at IS NULL AND can_access_branch(branch_id)
  );

DROP POLICY IF EXISTS "insert_documents_branch" ON documents;
CREATE POLICY "insert_documents_branch" ON documents FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "update_documents_branch" ON documents;
CREATE POLICY "update_documents_branch" ON documents FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (can_access_branch(branch_id));

DROP POLICY IF EXISTS "delete_documents_branch" ON documents;
CREATE POLICY "delete_documents_branch" ON documents FOR DELETE
  TO authenticated USING (can_access_branch(branch_id));

-- ============================================================
-- ACTIVITIES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  description text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_activities_branch" ON activities;
CREATE POLICY "select_activities_branch" ON activities FOR SELECT
  TO authenticated USING (can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_activities_branch" ON activities;
CREATE POLICY "insert_activities_branch" ON activities FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id));

-- ============================================================
-- SHIPMENT NUMBER AUTO-GENERATION
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS shipment_seq START 1;

CREATE OR REPLACE FUNCTION generate_shipment_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_val bigint;
  year_text text := to_char(now(), 'YYYY');
  num_text text;
BEGIN
  next_val := nextval('shipment_seq');
  num_text := lpad(next_val::text, 4, '0');
  RETURN 'SHP-' || year_text || '-' || num_text;
END;
$$;

CREATE OR REPLACE FUNCTION set_shipment_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.reference_number IS NULL THEN
    NEW.reference_number := generate_shipment_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_shipment_number ON shipments;
DO $$ BEGIN
  CREATE TRIGGER trigger_set_shipment_number
    BEFORE INSERT ON shipments
    FOR EACH ROW
    EXECUTE FUNCTION set_shipment_number();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_shipments_branch_id ON shipments(branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_customer_id ON shipments(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_assigned_to ON shipments(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_ref_number ON shipments(reference_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_timeline_shipment_id ON shipment_timeline(shipment_id);
CREATE INDEX IF NOT EXISTS idx_documents_shipment_id ON documents(shipment_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_customer_id ON documents(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_branch_id ON documents(branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activities_branch_id ON activities(branch_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);

-- ============================================================
-- TRIGGERS
-- ============================================================

DO $$ BEGIN
  CREATE TRIGGER trigger_shipments_updated_at
    BEFORE UPDATE ON shipments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
