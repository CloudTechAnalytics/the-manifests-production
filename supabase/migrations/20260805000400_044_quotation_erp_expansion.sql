/*
# Quotation module → enterprise freight ERP quotation

Expands `quotations` from a generic sales document into the operational
source of truth: everything Operations needs to run the shipment
(incoterm, cargo, containers, ports, dates, services, required
documents) is captured once, at quote time, instead of being re-asked
after conversion.

## Status lifecycle
Old: draft -> sent -> approved -> rejected -> expired.
New: draft -> pending_approval -> approved -> sent -> accepted ->
rejected -> expired. `approved` now means "cleared internally,
ready to send" (was previously used loosely for "customer accepted",
which is what `accepted` means now). Existing rows are NOT
reinterpreted or rewritten — this only adds the new enum values so
new quotations can use the fuller lifecycle. A historical `approved`
row from before this migration behaved, in practice, like today's
`accepted` — that's a fact about old data, not something worth a
lossy rewrite to "fix".

## Two new columns elsewhere
- organizations.quotation_approval_required — company-level toggle;
  when true, sending a quotation requires it to have passed through
  the approval step first (enforced in the app, same as every other
  role check in this schema — RLS on quotations already scopes writes
  to branch/org, this is an additional business rule on top).
- shipments.quotation_id already exists from earlier migrations and is
  reused as-is for the new direct Quotation -> Shipment conversion —
  no schema change needed there.

## Why quotation_items gets a discount column but not a rewrite
Every existing column (description, quantity, unit_price, tax_rate,
total) keeps its exact meaning; discount_rate is purely additive and
defaults to 0, so every existing row's total remains correct
unchanged.
*/

-- ============================================================
-- ENUM extensions
-- ============================================================

ALTER TYPE quotation_status ADD VALUE IF NOT EXISTS 'pending_approval' BEFORE 'sent';
ALTER TYPE quotation_status ADD VALUE IF NOT EXISTS 'accepted' AFTER 'sent';

-- ============================================================
-- organizations: approval toggle
-- ============================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS quotation_approval_required boolean NOT NULL DEFAULT false;

-- ============================================================
-- quotations: the full ERP field set
-- ============================================================

DO $$ BEGIN
  CREATE TYPE shipment_direction_enum AS ENUM ('import', 'export');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cargo_type_enum AS ENUM ('fcl', 'lcl', 'roro', 'break_bulk');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE quotation_priority_enum AS ENUM ('normal', 'urgent', 'vip');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE quotations
  -- Section 1: contact + rep, beyond the customer record itself
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS sales_rep_id uuid REFERENCES profiles(id) ON DELETE SET NULL,

  -- Section 2: shipment information (transport_mode reuses the existing
  -- shipment_type column — air/sea/road/rail/multimodal already covers it)
  ADD COLUMN IF NOT EXISTS shipment_direction shipment_direction_enum,
  ADD COLUMN IF NOT EXISTS cargo_type cargo_type_enum,
  ADD COLUMN IF NOT EXISTS incoterm text,
  ADD COLUMN IF NOT EXISTS origin_country text,
  ADD COLUMN IF NOT EXISTS origin_port text,
  ADD COLUMN IF NOT EXISTS destination_country text,
  ADD COLUMN IF NOT EXISTS destination_port text,
  ADD COLUMN IF NOT EXISTS expected_shipping_date date,
  ADD COLUMN IF NOT EXISTS expected_arrival_date date,

  -- Section 3: cargo information
  ADD COLUMN IF NOT EXISTS commodity_description text,
  ADD COLUMN IF NOT EXISTS hs_code text,
  ADD COLUMN IF NOT EXISTS container_count integer,
  ADD COLUMN IF NOT EXISTS container_size text,
  ADD COLUMN IF NOT EXISTS weight numeric(14,2),
  ADD COLUMN IF NOT EXISTS weight_unit text DEFAULT 'KG',
  ADD COLUMN IF NOT EXISTS cbm numeric(14,3),
  ADD COLUMN IF NOT EXISTS packages_count integer,
  ADD COLUMN IF NOT EXISTS package_type text,
  ADD COLUMN IF NOT EXISTS dangerous_cargo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS temperature_controlled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS insurance_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cargo_value numeric(14,2),

  -- Section 4: selected services (fixed checklist, kept as a simple
  -- array rather than a junction table — see components/quotations for
  -- the fixed catalog these keys map to)
  ADD COLUMN IF NOT EXISTS services text[] NOT NULL DEFAULT '{}',

  -- Section 6: payment terms
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS payment_method text,

  -- Section 7: required documents checklist (declared at quote time —
  -- the real per-shipment checklist still comes from document_templates
  -- once a shipment exists; this is what Sales tells the customer to expect)
  ADD COLUMN IF NOT EXISTS required_documents text[] NOT NULL DEFAULT '{}',

  -- Section 8: priority + customer-facing notes, separate from the
  -- existing `notes` column which stays as internal-only notes
  ADD COLUMN IF NOT EXISTS priority quotation_priority_enum NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS customer_notes text,

  -- Section 10: approval trail
  ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_date timestamptz,
  ADD COLUMN IF NOT EXISTS approval_notes text,

  -- Section 13: conversion tracking, same pattern as shipment_plans
  ADD COLUMN IF NOT EXISTS converted_shipment_id uuid REFERENCES shipments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_quotations_sales_rep_id ON quotations(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_quotations_converted_shipment_id ON quotations(converted_shipment_id);

-- ============================================================
-- quotation_items: discount + which service generated this row
-- ============================================================

ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS discount_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_key text;
