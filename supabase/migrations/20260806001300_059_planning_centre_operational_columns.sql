-- ============================================================
-- PLANNING CENTRE — OPERATIONAL COLUMNS
-- ============================================================
-- The redesigned Planning Centre writes directly into the real
-- operational tables (shipments, shipment_containers, shipment_customs,
-- terminal_operations, shipment_transportation, shipment_warehouse_
-- records) instead of a parallel shipment_plans snapshot — Documentation/
-- Customs/Terminal/Transport already read these tables as ground truth,
-- so this is what actually gives Planning's data automatic, zero-re-entry
-- visibility to every other department, instead of requiring a manual
-- "convert" copy step.
--
-- Most additions are "expected/target" columns living alongside each
-- table's existing "actual" columns (e.g. shipment_customs already has
-- paar_date; this adds expected_paar_date next to it) — Planning sets
-- the target, the department that actually does the work fills in the
-- actual date later, on the exact same row.

-- shipments: already has vessel_name, voyage_number, port_of_loading,
-- port_of_discharge, carrier, estimated_departure, estimated_arrival.
ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS transshipment_port text,
  ADD COLUMN IF NOT EXISTS booking_reference text,
  ADD COLUMN IF NOT EXISTS booking_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_confirmation_document_id uuid REFERENCES documents(id) ON DELETE SET NULL;

-- shipment_containers: already has container_number, seal_number,
-- container_type, status.
ALTER TABLE shipment_containers
  ADD COLUMN IF NOT EXISTS expected_empty_pickup_date date,
  ADD COLUMN IF NOT EXISTS expected_stuffing_date date,
  ADD COLUMN IF NOT EXISTS expected_gate_in_date date,
  ADD COLUMN IF NOT EXISTS expected_loading_date date;

-- shipment_customs: already has paar_date/form_m_date/duty_paid_date as
-- ACTUAL dates. No new officer-assignment column — internal customs
-- officer assignment reuses shipment_stages.assigned_to (customs_clearance
-- stage); the existing `officer` text column is a different concept (the
-- external customs broker's name).
ALTER TABLE shipment_customs
  ADD COLUMN IF NOT EXISTS expected_paar_date date,
  ADD COLUMN IF NOT EXISTS expected_declaration_date date,
  ADD COLUMN IF NOT EXISTS expected_duty_payment_date date,
  ADD COLUMN IF NOT EXISTS expected_examination_date date,
  ADD COLUMN IF NOT EXISTS expected_release_date date,
  ADD COLUMN IF NOT EXISTS expected_exit_date date,
  ADD COLUMN IF NOT EXISTS duty_estimate_approved boolean NOT NULL DEFAULT false;

-- terminal_operations: already has terminal_name, arrival_date,
-- release_date. "Terminal" itself reuses terminal_name (curated dropdown
-- in the UI, no new enum — free text, same convention already used here).
ALTER TABLE terminal_operations
  ADD COLUMN IF NOT EXISTS terminal_contact text,
  ADD COLUMN IF NOT EXISTS booking_slot text,
  ADD COLUMN IF NOT EXISTS terminal_reference text,
  ADD COLUMN IF NOT EXISTS expected_gate_in date,
  ADD COLUMN IF NOT EXISTS expected_gate_out date,
  ADD COLUMN IF NOT EXISTS expected_delivery_order_collection date;

-- shipment_transportation: already has truck_number, driver_name,
-- driver_phone, pickup_date, delivery_date — those stay as the ACTUAL-
-- event columns, set later by Transport once execution happens.
ALTER TABLE shipment_transportation
  ADD COLUMN IF NOT EXISTS pickup_address text,
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS transport_company text,
  ADD COLUMN IF NOT EXISTS escort_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expected_pickup_date date,
  ADD COLUMN IF NOT EXISTS expected_delivery_date date;

-- shipment_warehouse_records: already has warehouse_id,
-- expected_arrival_date, received_date, released_date. Its mere existence
-- per shipment already encodes "warehouse required" (the conversion
-- engine only creates this row when the `warehouse` service was
-- purchased) — no separate is_required boolean needed. Storage Days is
-- derived at read time (received -> released, or received -> today), not
-- stored, same "no scheduled job" convention as computeExposureAccrual().
ALTER TABLE shipment_warehouse_records
  ADD COLUMN IF NOT EXISTS handling_instructions text;

-- shipment_plans: exactly 2 new columns — the only 2 of the 6 Internal
-- Assignments roles with no matching shipment_stages row to reuse
-- (Documentation/Customs/Terminal/Transport officers all reuse
-- shipment_stages.assigned_to for their respective stage instead).
ALTER TABLE shipment_plans
  ADD COLUMN IF NOT EXISTS finance_officer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supervisor_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- No RLS changes: all ADD COLUMN on already-RLS'd tables — RLS is
-- row-level, not column-level (same precedent as migration 057).

COMMENT ON COLUMN shipment_customs.duty_estimate_approved IS
  'Planning Centre milestone: whether the estimated duty figure has been reviewed and approved before the shipment moves past Planning.';
COMMENT ON COLUMN terminal_operations.booking_slot IS
  'Terminal booking slot reserved during Planning — distinct from arrival_date/release_date, which track actual terminal execution.';
