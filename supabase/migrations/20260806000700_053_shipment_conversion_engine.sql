/*
# Shipment Conversion Engine: one-quotation-one-shipment, auto-cascaded records

## Problem being fixed
Converting an accepted quotation into a shipment was a sequence of
unprotected client-side calls (components/quotations/convert-to-shipment
-dialog.tsx) with a confirmed live bug: an operations-role user's
shipments INSERT succeeds (passes can_manage_operations()), but the
follow-up `UPDATE quotations SET converted_shipment_id = ...` requires
can_manage_sales() — which operations doesn't have — so it silently
fails. The quotation never gets marked converted and stays
re-convertible. There was also no unique constraint on
shipments.quotation_id and no protection against two simultaneous
clicks, and none of planning/documentation/customs/terminal/
examination/warehouse/delivery got created automatically.

## Fix shape
One SECURITY DEFINER RPC, convert_quotation_to_shipment(), performs the
whole cascade atomically: row-locks the quotation (the race-condition
guard), validates, inserts the shipment with a full field copy from the
quotation, seeds shipment_stages/shipment_containers, conditionally
creates shipment_customs/terminal_operations/shipment_examinations/
shipment_warehouse_records/delivery_orders per the quotation's selected
services, seeds documentation shipment_tasks, logs shipment_timeline +
activities, notifies Operations, and finally marks the quotation
converted — all as the function owner, which is what lets one call
satisfy every downstream table's differently-gated RLS (customs/
terminal/examination require can_manage_customs(), not
can_manage_operations()) without 7 separate client-side inserts each
needing a different department's permission.

## 11-value shipment_status lifecycle (values added in migration 052)
planning -> documentation -> awaiting_customs -> customs_clearance ->
terminal_processing -> cargo_examination -> released -> transport ->
delivered -> completed -> archived (+ the existing non-linear
'cancelled' escape hatch, unchanged). There is deliberately no
'awaiting_operations' status: by the time this RPC runs, Operations has
already taken ownership (that's what clicking "Start Shipment" means),
so a shipment's first status is 'planning' directly — "awaiting
operations" describes the pre-conversion, accepted-but-unconverted
QUOTATION, which is a work-queue concept (the dashboard/work-queue
Awaiting Operations sections), never a shipment stage. The 3 retired
values (booking_received, processing, in_transit, arrived) are backfilled
off existing shipments below and never produced again by application
code, but stay in the Postgres type permanently (cannot be cheaply
dropped) so historical shipment_timeline rows still render a label.

## Stage catalog changes
workflow_stage_catalog gains one new stage ('released', sequence 11,
department terminal) and one relabeled row (regulatory_compliance ->
"Awaiting Customs Documents") so the granular per-department checklist
(shipment_stages) reads with the same wording as the new strict status
field above. shipment_created keeps its "Shipment Created" label — it's
a checkpoint marking the shipment now exists, auto-completed the
instant it's created, immediately followed by 'planning' as the first
actionable, in_progress stage. `key` values are NOT renamed — only
`label`/`sequence` change — so lib/utils/workflow-rules.ts's
stage_key-keyed validators need no changes.

## New tables
shipment_warehouse_records and delivery_orders — neither exists today;
the warehouse module is deliberately pure inventory with zero shipment
linkage, and delivery previously had only shipment_transportation
(truck/driver legs, a different concept from a customer-facing delivery
order). notifications — a real per-user, per-event inbox; recipient
rows are resolved to concrete profiles.id values inside the RPC (same
has_role()-style multi-role query shape), not per-role broadcast rows
resolved at read time, so "mark read" stays a trivial per-row RLS
UPDATE. No client INSERT/DELETE policy on notifications — same
reasoning as user_roles (migration 034): writes only ever happen from
this trusted SECURITY DEFINER path.

## Quotation locking
update_quotations_branch/delete_quotations_branch gain a
`converted_shipment_id IS NULL OR is_admin()` guard. This migration
also restores a rule migration 051 accidentally dropped when it
rewrote update_quotations_branch into a CASE expression: migration 047
required admin/branch_manager to move a quotation to 'approved' — that
condition is folded back in here.
*/

-- ============================================================
-- SHIPMENTS: fields the quotation already captures, now retained
-- ============================================================

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS services text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS required_documents text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS priority quotation_priority_enum NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS cargo_type cargo_type_enum,
  ADD COLUMN IF NOT EXISTS shipment_direction shipment_direction_enum,
  ADD COLUMN IF NOT EXISTS container_count integer,
  ADD COLUMN IF NOT EXISTS packages_count integer,
  ADD COLUMN IF NOT EXISTS package_type text,
  ADD COLUMN IF NOT EXISTS dangerous_cargo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS temperature_controlled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS insurance_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS customer_notes text,
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS sales_rep_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- ============================================================
-- STATUS BACKFILL: remap existing live shipments off retired values
-- ============================================================
-- Before applying this in an environment with real (non-demo) data,
-- run: SELECT status, count(*) FROM shipments WHERE deleted_at IS NULL
-- GROUP BY status; — the 'processing'->'customs_clearance' and
-- 'arrived'->'released' remaps below are the closest reasonable fit,
-- not exact semantic equivalents, so review if those buckets are
-- non-trivial before trusting this blindly in production.

UPDATE shipments SET status = 'planning' WHERE status = 'booking_received' AND deleted_at IS NULL;
UPDATE shipments SET status = 'customs_clearance' WHERE status = 'processing' AND deleted_at IS NULL;
UPDATE shipments SET status = 'transport' WHERE status = 'in_transit' AND deleted_at IS NULL;
UPDATE shipments SET status = 'released' WHERE status = 'arrived' AND deleted_at IS NULL;

-- ============================================================
-- QUOTATION -> SHIPMENT: the real duplicate-prevention backstop
-- ============================================================
-- Run manually first, resolve any hits before this index would reject
-- them (soft-delete or null out the extra shipment's quotation_id):
--   SELECT quotation_id, count(*) FROM shipments
--   WHERE quotation_id IS NOT NULL AND deleted_at IS NULL
--   GROUP BY quotation_id HAVING count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shipments_quotation_id
  ON shipments(quotation_id) WHERE deleted_at IS NULL AND quotation_id IS NOT NULL;

-- ============================================================
-- SHIPMENT_PLANS: real forward link, alongside the existing reverse
-- (converted_shipment_id) pre-shipment/manual planning flow
-- ============================================================

ALTER TABLE shipment_plans ADD COLUMN IF NOT EXISTS shipment_id uuid REFERENCES shipments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_shipment_plans_shipment_id ON shipment_plans(shipment_id) WHERE deleted_at IS NULL;

-- ============================================================
-- SHIPMENT_WAREHOUSE_RECORDS (new)
-- ============================================================

CREATE TABLE IF NOT EXISTS shipment_warehouse_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL UNIQUE REFERENCES shipments(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'awaiting_arrival',
  expected_arrival_date date,
  received_date date,
  released_date date,
  notes text,
  created_by uuid REFERENCES profiles(id),
  updated_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE shipment_warehouse_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_shipment_warehouse_records_branch" ON shipment_warehouse_records;
CREATE POLICY "select_shipment_warehouse_records_branch" ON shipment_warehouse_records FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_shipment_warehouse_records_branch" ON shipment_warehouse_records;
CREATE POLICY "insert_shipment_warehouse_records_branch" ON shipment_warehouse_records FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_warehouse());

DROP POLICY IF EXISTS "update_shipment_warehouse_records_branch" ON shipment_warehouse_records;
CREATE POLICY "update_shipment_warehouse_records_branch" ON shipment_warehouse_records FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_warehouse())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_warehouse());

DROP POLICY IF EXISTS "delete_shipment_warehouse_records_branch" ON shipment_warehouse_records;
CREATE POLICY "delete_shipment_warehouse_records_branch" ON shipment_warehouse_records FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_warehouse());

DO $$ BEGIN
  CREATE TRIGGER trigger_shipment_warehouse_records_updated_at
    BEFORE UPDATE ON shipment_warehouse_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_shipment_warehouse_records_branch_id ON shipment_warehouse_records(branch_id) WHERE deleted_at IS NULL;

-- ============================================================
-- DELIVERY_ORDERS (new)
-- ============================================================

CREATE TABLE IF NOT EXISTS delivery_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL UNIQUE REFERENCES shipments(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  order_number text UNIQUE,
  status text NOT NULL DEFAULT 'waiting_for_release',
  delivery_address text,
  requested_delivery_date date,
  released_date date,
  delivered_date date,
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

DO $$ BEGIN
  CREATE TRIGGER trigger_delivery_orders_updated_at
    BEFORE UPDATE ON delivery_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_delivery_orders_branch_id ON delivery_orders(branch_id) WHERE deleted_at IS NULL;

CREATE SEQUENCE IF NOT EXISTS delivery_order_seq START 1;

CREATE OR REPLACE FUNCTION generate_delivery_order_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE next_val bigint;
BEGIN
  next_val := nextval('delivery_order_seq');
  RETURN 'DO-' || to_char(now(), 'YYYY') || '-' || lpad(next_val::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION set_delivery_order_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := generate_delivery_order_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_delivery_order_number ON delivery_orders;
CREATE TRIGGER trigger_set_delivery_order_number
  BEFORE INSERT ON delivery_orders
  FOR EACH ROW EXECUTE FUNCTION set_delivery_order_number();

-- ============================================================
-- NOTIFICATIONS (new)
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_notifications_own" ON notifications;
CREATE POLICY "select_notifications_own" ON notifications FOR SELECT
  TO authenticated USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "update_notifications_own" ON notifications;
CREATE POLICY "update_notifications_own" ON notifications FOR UPDATE
  TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
-- No client INSERT/DELETE policy — writes only happen from the
-- SECURITY DEFINER RPC path below (and future event triggers), same
-- reasoning as user_roles (migration 034).

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON notifications(recipient_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created ON notifications(recipient_id, created_at DESC);

-- ============================================================
-- WORKFLOW_STAGE_CATALOG: relabel + new 'released' stage
-- ============================================================

UPDATE workflow_stage_catalog SET sequence = sequence + 1 WHERE sequence >= 11;

INSERT INTO workflow_stage_catalog (key, sequence, label, default_department, is_optional)
VALUES ('released', 11, 'Released', 'terminal', false)
ON CONFLICT (key) DO NOTHING;

UPDATE workflow_stage_catalog SET label = 'Awaiting Customs Documents' WHERE key = 'regulatory_compliance';
UPDATE workflow_stage_catalog SET label = 'Terminal Processing' WHERE key = 'terminal_operations';

-- shipment_stages denormalizes label/sequence at insert time — sync
-- already-existing rows so old shipments show the same wording/order.
UPDATE shipment_stages ss
SET label = c.label, sequence = c.sequence
FROM workflow_stage_catalog c
WHERE ss.catalog_id = c.id AND (ss.label IS DISTINCT FROM c.label OR ss.sequence IS DISTINCT FROM c.sequence);

-- Backfill the new 'released' stage row for every shipment that
-- predates this migration (same heuristic style as migration 035's
-- own backfill — approximate, visual only).
INSERT INTO shipment_stages (
  shipment_id, catalog_id, branch_id, stage_key, sequence, label,
  assigned_department, status, is_optional, created_by, updated_by
)
SELECT
  s.id, c.id, s.branch_id, c.key, c.sequence, c.label, c.default_department,
  CASE
    WHEN s.status IN ('delivered', 'completed', 'archived') THEN 'completed'::workflow_stage_status
    WHEN s.status IN ('released', 'transport') THEN 'in_progress'::workflow_stage_status
    ELSE 'pending'::workflow_stage_status
  END,
  c.is_optional, s.created_by, s.updated_by
FROM shipments s
CROSS JOIN workflow_stage_catalog c
WHERE c.key = 'released' AND s.deleted_at IS NULL
ON CONFLICT (shipment_id, catalog_id) DO NOTHING;

-- ============================================================
-- DOCUMENT_TEMPLATES: fill the one missing checklist item
-- ============================================================

INSERT INTO document_templates (key, name, category, stage_key, applies_to_shipment_types, requires_red_channel, is_required, sort_order)
VALUES ('certificate_of_origin', 'Certificate of Origin', 'customs', 'documentation', NULL, false, true, 13)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- QUOTATION LOCKING: block edits/deletes on a converted quotation
-- ============================================================

DROP POLICY IF EXISTS "update_quotations_branch" ON quotations;
CREATE POLICY "update_quotations_branch" ON quotations FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (
    can_access_branch(branch_id) AND (
      CASE
        WHEN deleted_at IS NOT NULL THEN has_role('admin') OR has_role('branch_manager')
        ELSE
          can_manage_sales()
          AND (converted_shipment_id IS NULL OR is_admin())
          AND (status <> 'approved' OR has_role('admin') OR has_role('branch_manager'))
      END
    )
  );

DROP POLICY IF EXISTS "delete_quotations_branch" ON quotations;
CREATE POLICY "delete_quotations_branch" ON quotations FOR DELETE
  TO authenticated USING (
    can_access_branch(branch_id)
    AND (has_role('admin') OR has_role('branch_manager'))
    AND (converted_shipment_id IS NULL OR is_admin())
  );

-- ============================================================
-- THE CORE RPC
-- ============================================================

CREATE OR REPLACE FUNCTION convert_quotation_to_shipment(p_quotation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quotation quotations%ROWTYPE;
  v_shipment shipments%ROWTYPE;
  v_missing text[] := '{}';
  v_container_idx integer;
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_origin text;
  v_destination text;
BEGIN
  -- Row lock: the race-condition guard. A second simultaneous call for
  -- the same quotation blocks here until the first commits, then finds
  -- converted_shipment_id already set.
  SELECT * INTO v_quotation FROM quotations WHERE id = p_quotation_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QUOTATION_NOT_FOUND';
  END IF;

  IF v_quotation.converted_shipment_id IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_CONVERTED:%', v_quotation.converted_shipment_id;
  END IF;

  IF NOT can_manage_operations() THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_origin := NULLIF(coalesce(v_quotation.origin_port, v_quotation.origin), '');
  v_destination := NULLIF(coalesce(v_quotation.destination_port, v_quotation.destination), '');

  -- Server-side validation — never trust the client-side check alone.
  IF v_quotation.status <> 'accepted' THEN
    v_missing := array_append(v_missing, 'Quotation must be Accepted before it can become a shipment');
  END IF;
  IF v_quotation.customer_id IS NULL THEN
    v_missing := array_append(v_missing, 'Customer');
  END IF;
  IF v_origin IS NULL THEN
    v_missing := array_append(v_missing, 'Origin');
  END IF;
  IF v_destination IS NULL THEN
    v_missing := array_append(v_missing, 'Destination');
  END IF;
  IF v_quotation.shipment_type IS NULL THEN
    v_missing := array_append(v_missing, 'Shipment Type');
  END IF;
  IF v_quotation.commodity_description IS NULL OR v_quotation.commodity_description = '' THEN
    v_missing := array_append(v_missing, 'Cargo / Commodity Description');
  END IF;
  IF v_quotation.cargo_type = 'fcl' AND coalesce(v_quotation.container_count, 0) = 0 THEN
    v_missing := array_append(v_missing, 'Container Information (FCL requires at least one container)');
  END IF;
  IF v_quotation.cargo_type = 'lcl' AND coalesce(v_quotation.packages_count, 0) = 0 THEN
    v_missing := array_append(v_missing, 'Package Information (LCL requires package count)');
  END IF;
  IF v_quotation.services IS NULL OR array_length(v_quotation.services, 1) IS NULL THEN
    v_missing := array_append(v_missing, 'At least one Service');
  END IF;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'VALIDATION_FAILED:%', array_to_string(v_missing, '; ');
  END IF;

  -- Shipment: full field copy, no retyping.
  INSERT INTO shipments (
    customer_id, quotation_id, branch_id, shipment_type, origin, destination, status,
    booking_date, estimated_departure, estimated_arrival, weight, volume, notes,
    incoterm, hs_code, commodity, port_of_loading, port_of_discharge,
    goods_value, goods_value_currency,
    services, required_documents, priority, cargo_type, shipment_direction,
    container_count, packages_count, package_type,
    dangerous_cargo, temperature_controlled, insurance_required,
    payment_terms, payment_method, customer_notes,
    contact_person, contact_email, contact_phone, sales_rep_id,
    created_by, updated_by
  ) VALUES (
    v_quotation.customer_id, v_quotation.id, v_quotation.branch_id, v_quotation.shipment_type,
    v_origin, v_destination, 'planning',
    current_date, v_quotation.expected_shipping_date, v_quotation.expected_arrival_date,
    v_quotation.weight, v_quotation.cbm, v_quotation.notes,
    v_quotation.incoterm, v_quotation.hs_code, v_quotation.commodity_description,
    v_quotation.origin_port, v_quotation.destination_port,
    v_quotation.cargo_value, v_quotation.currency,
    v_quotation.services, v_quotation.required_documents, v_quotation.priority,
    v_quotation.cargo_type, v_quotation.shipment_direction,
    v_quotation.container_count, v_quotation.packages_count, v_quotation.package_type,
    v_quotation.dangerous_cargo, v_quotation.temperature_controlled, v_quotation.insurance_required,
    v_quotation.payment_terms, v_quotation.payment_method, v_quotation.customer_notes,
    v_quotation.contact_person, v_quotation.contact_email, v_quotation.contact_phone, v_quotation.sales_rep_id,
    v_uid, v_uid
  )
  RETURNING * INTO v_shipment;

  -- Containers.
  IF coalesce(v_quotation.container_count, 0) > 0 THEN
    FOR v_container_idx IN 1..v_quotation.container_count LOOP
      INSERT INTO shipment_containers (shipment_id, branch_id, container_type, created_by, updated_by)
      VALUES (v_shipment.id, v_shipment.branch_id, v_quotation.container_size, v_uid, v_uid);
    END LOOP;
  END IF;

  -- Planning: booking pending, vessel/planner unassigned.
  INSERT INTO shipment_plans (
    shipment_id, quotation_id, customer_id, branch_id, status,
    shipment_type, origin, destination, incoterm, commodity, goods_value, goods_value_currency,
    insurance_required, total_packages, total_weight, total_volume, hs_code, cargo_description,
    container_type, container_quantity,
    created_by, updated_by
  ) VALUES (
    v_shipment.id, v_quotation.id, v_quotation.customer_id, v_quotation.branch_id, 'planned',
    v_quotation.shipment_type, v_origin, v_destination,
    v_quotation.incoterm, v_quotation.commodity_description, v_quotation.cargo_value, v_quotation.currency,
    v_quotation.insurance_required, v_quotation.packages_count, v_quotation.weight, v_quotation.cbm,
    v_quotation.hs_code, v_quotation.commodity_description,
    v_quotation.container_size, v_quotation.container_count,
    v_uid, v_uid
  );

  -- Stage checklist: every active catalog stage except the sales-track
  -- ones (lead/quotation/quotation_approved, which precede a shipment
  -- and aren't part of its lifecycle). shipment_created is a checkpoint,
  -- not a work item — it's auto-completed the instant this row exists,
  -- with 'planning' immediately started as the first actionable stage.
  -- warehouse/cargo_examination are pre-skipped when the matching
  -- service wasn't purchased.
  INSERT INTO shipment_stages (
    shipment_id, catalog_id, branch_id, stage_key, sequence, label, assigned_department, status, is_optional,
    started_at, completed_at, created_by, updated_by
  )
  SELECT
    v_shipment.id, c.id, v_shipment.branch_id, c.key, c.sequence, c.label, c.default_department,
    CASE
      WHEN c.key = 'warehouse' AND NOT ('warehouse' = ANY(v_quotation.services)) THEN 'skipped'::workflow_stage_status
      WHEN c.key = 'cargo_examination' AND NOT ('examination' = ANY(v_quotation.services)) THEN 'skipped'::workflow_stage_status
      WHEN c.key = 'shipment_created' THEN 'completed'::workflow_stage_status
      WHEN c.key = 'planning' THEN 'in_progress'::workflow_stage_status
      ELSE 'pending'::workflow_stage_status
    END,
    c.is_optional,
    CASE WHEN c.key IN ('shipment_created', 'planning') THEN v_now END,
    CASE WHEN c.key = 'shipment_created' THEN v_now END,
    v_uid, v_uid
  FROM workflow_stage_catalog c
  WHERE c.is_active AND c.key NOT IN ('lead', 'quotation', 'quotation_approved')
  ON CONFLICT (shipment_id, catalog_id) DO NOTHING;

  -- Conditional operational records — one block per purchased service.
  IF 'customs_clearance' = ANY(v_quotation.services) THEN
    INSERT INTO shipment_customs (shipment_id, branch_id, status, created_by, updated_by)
    VALUES (v_shipment.id, v_shipment.branch_id, 'draft', v_uid, v_uid);
  END IF;

  IF 'terminal_handling' = ANY(v_quotation.services) THEN
    INSERT INTO terminal_operations (shipment_id, branch_id, status, created_by, updated_by)
    VALUES (v_shipment.id, v_shipment.branch_id, 'waiting', v_uid, v_uid);
  END IF;

  IF 'examination' = ANY(v_quotation.services) THEN
    INSERT INTO shipment_examinations (shipment_id, branch_id, created_by, updated_by)
    VALUES (v_shipment.id, v_shipment.branch_id, v_uid, v_uid);
  END IF;

  IF 'warehouse' = ANY(v_quotation.services) THEN
    INSERT INTO shipment_warehouse_records (shipment_id, branch_id, status, created_by, updated_by)
    VALUES (v_shipment.id, v_shipment.branch_id, 'awaiting_arrival', v_uid, v_uid);
  END IF;

  IF 'delivery' = ANY(v_quotation.services) THEN
    INSERT INTO delivery_orders (shipment_id, branch_id, status, delivery_address, created_by, updated_by)
    VALUES (v_shipment.id, v_shipment.branch_id, 'waiting_for_release', v_destination, v_uid, v_uid);
  END IF;

  -- Documentation checklist tasks, seeded from the existing task-template
  -- engine (no new checklist table — reuses migration 037).
  IF 'documentation' = ANY(v_quotation.services) THEN
    INSERT INTO shipment_tasks (shipment_id, stage_id, template_id, branch_id, title, assigned_department, status, priority, created_by)
    SELECT v_shipment.id, ss.id, t.id, v_shipment.branch_id, t.title, t.default_department, 'pending', t.default_priority, v_uid
    FROM stage_task_templates t
    JOIN shipment_stages ss ON ss.shipment_id = v_shipment.id AND ss.stage_key = 'documentation'
    WHERE t.stage_key = 'documentation' AND t.is_active;
  END IF;

  -- Timeline + activity — nothing happens silently.
  INSERT INTO shipment_timeline (shipment_id, status, notes, created_by)
  VALUES (v_shipment.id, 'planning', 'Shipment created from quotation ' || v_quotation.quotation_number, v_uid);

  INSERT INTO activities (user_id, branch_id, action, entity_type, entity_id, description, metadata)
  VALUES (
    v_uid, v_shipment.branch_id, 'quotation.converted', 'quotation', v_quotation.id,
    'Converted quotation ' || v_quotation.quotation_number || ' to shipment ' || v_shipment.reference_number,
    jsonb_build_object('shipment_id', v_shipment.id, 'quotation_id', v_quotation.id)
  );

  INSERT INTO activities (user_id, branch_id, action, entity_type, entity_id, description, metadata)
  VALUES (
    v_uid, v_shipment.branch_id, 'shipment.created', 'shipment', v_shipment.id,
    'Shipment ' || v_shipment.reference_number || ' created from quotation ' || v_quotation.quotation_number,
    jsonb_build_object('quotation_id', v_quotation.id)
  );

  -- Notify Planning, not Operations — Operations already acted (that's
  -- what "Start Shipment" means); Planning is the department that owns
  -- the shipment's first actionable stage. Branch-scoped, resolved the
  -- same way has_role() resolves multi-role membership.
  INSERT INTO notifications (recipient_id, branch_id, type, entity_type, entity_id, title, body)
  SELECT p.id, v_shipment.branch_id, 'shipment_created', 'shipment', v_shipment.id,
    'New shipment ready for planning: ' || v_shipment.reference_number,
    'Quotation ' || v_quotation.quotation_number || ' was converted — planning can begin.'
  FROM profiles p
  WHERE p.branch_id = v_shipment.branch_id AND p.is_active = true
    AND (
      p.role = 'planning'
      OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id AND ur.role = 'planning')
    );

  -- Lock the quotation — this is the statement that was silently
  -- failing for operations-role callers before this migration.
  UPDATE quotations
  SET converted_shipment_id = v_shipment.id, converted_at = v_now, updated_by = v_uid, updated_at = v_now
  WHERE id = v_quotation.id;

  RETURN jsonb_build_object(
    'shipment_id', v_shipment.id,
    'reference_number', v_shipment.reference_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION convert_quotation_to_shipment(uuid) TO authenticated;
