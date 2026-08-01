/*
# ERP Phase 3: Trade Documentation, Compliance, and Commercial Tooling

## Overview
Closes the gap between what `shipment_plans` already captures (incoterm,
HS code, vessel/voyage, ports, container type) and what actually survives
onto the live `shipments` record — plus everything a real forwarder needs
that neither table had: named cargo parties, master/house bill numbers,
per-container detail (a shipment is rarely exactly one container),
Nigerian import compliance (Form M, PAAR, SONCAP), cargo insurance
policies, chargeable-weight capture, buy/sell rate cards, demurrage
free-time tracking, a public no-login tracking lookup, and an outbound
webhook subscription table for customers' own systems.

Purely additive: new nullable columns on `shipments`/`shipment_customs`/
`terminal_operations`, five new tables, one SECURITY DEFINER function for
public tracking. Nothing existing changes shape.

## New columns on shipments
Trade documentation that used to live only on the plan and get dropped on
conversion: `incoterm`, `hs_code`, `commodity`, `vessel_name`,
`voyage_number`, `port_of_loading`, `port_of_discharge`, `mbl_number`,
`hbl_number`, `awb_number`, `goods_value` + `goods_value_currency`.
Named parties (a shipment's customer is the *forwarder's* client, which is
often not the same entity as the consignee on the bill of lading):
`shipper_name/address`, `consignee_name/address`, `notify_party_name/address`.
Chargeable weight: `actual_weight`, `volumetric_weight`,
`chargeable_weight` (the greater of the two — computed in application
code at save time, same convention as invoice/quotation totals elsewhere
in this schema, which are stored rather than generated columns).

## New columns on shipment_customs
`form_m_number`/`form_m_date`, `paar_number`/`paar_date`, `soncap_number`
— the two documents no Nigerian import clears without (Form M validates
the transaction with a bank before shipment; PAAR is the Nigeria Customs
risk-assessed duty report that supersedes the old SGD). SONCAP covers
regulated product categories.

## New columns on terminal_operations
`free_time_days`, `free_time_expiry` — the carrier's free storage window
before demurrage starts. Previously demurrage only showed up after the
fact as an expense category (migration 038); this is the proactive side.

## New tables
- shipment_containers: many-per-shipment (a booking is rarely a single
  box). Carries the dangerous-goods fields too (UN number, IMDG class,
  packing group) since DG declarations are made per-container/per-package,
  not per-shipment.
- cargo_insurance_policies: many-per-shipment (a plan's insurance_required
  flag never had anywhere to record the actual policy).
- freight_rate_cards: buy/sell tariffs per trade lane + carrier + container
  type, so quoting doesn't start from a blank line every time.
- webhook_subscriptions: lets an organization register their own endpoint
  to receive shipment-event POSTs. Contains a signing secret, so it's
  admin-only (not the usual can_manage_* department pattern).

## Public tracking
`public_track_shipment(p_reference)` is a SECURITY DEFINER function, not a
view — it bypasses shipments' RLS internally but only ever returns the one
row matching an exact reference number, and only safe fields (no customer,
no financials, no internal notes). Granted to `anon` so a customer can
track a shipment without an account. This is deliberately a function and
not a relaxed RLS policy: a policy change would let anon enumerate every
shipment in every tenant; a function keyed on an unguessable reference
number does not.

## Security
Same branch-scoped pattern as every operational table: SELECT via
`can_access_branch`, writes additionally gated by the relevant
`can_manage_*` role function — `can_manage_operations` for containers,
`can_manage_documentation` for insurance policies, `can_manage_sales` for
rate cards. `webhook_subscriptions` writes/reads are restricted to
admin/branch_manager only, checked inline via `has_role`, since the row
contains a callback secret.
*/

-- ============================================================
-- SHIPMENTS: trade documentation, named parties, chargeable weight
-- ============================================================

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS incoterm text,
  ADD COLUMN IF NOT EXISTS hs_code text,
  ADD COLUMN IF NOT EXISTS commodity text,
  ADD COLUMN IF NOT EXISTS vessel_name text,
  ADD COLUMN IF NOT EXISTS voyage_number text,
  ADD COLUMN IF NOT EXISTS port_of_loading text,
  ADD COLUMN IF NOT EXISTS port_of_discharge text,
  ADD COLUMN IF NOT EXISTS mbl_number text,
  ADD COLUMN IF NOT EXISTS hbl_number text,
  ADD COLUMN IF NOT EXISTS awb_number text,
  ADD COLUMN IF NOT EXISTS goods_value numeric(14,2),
  ADD COLUMN IF NOT EXISTS goods_value_currency text NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS shipper_name text,
  ADD COLUMN IF NOT EXISTS shipper_address text,
  ADD COLUMN IF NOT EXISTS consignee_name text,
  ADD COLUMN IF NOT EXISTS consignee_address text,
  ADD COLUMN IF NOT EXISTS notify_party_name text,
  ADD COLUMN IF NOT EXISTS notify_party_address text,
  ADD COLUMN IF NOT EXISTS actual_weight numeric(14,3),
  ADD COLUMN IF NOT EXISTS volumetric_weight numeric(14,3),
  ADD COLUMN IF NOT EXISTS chargeable_weight numeric(14,3);

-- ============================================================
-- SHIPMENT_PLANS: same chargeable-weight capture, at quoting time
-- ============================================================

ALTER TABLE shipment_plans
  ADD COLUMN IF NOT EXISTS actual_weight numeric(14,3),
  ADD COLUMN IF NOT EXISTS volumetric_weight numeric(14,3),
  ADD COLUMN IF NOT EXISTS chargeable_weight numeric(14,3);

-- ============================================================
-- SHIPMENT_CUSTOMS: Nigerian import compliance
-- ============================================================

ALTER TABLE shipment_customs
  ADD COLUMN IF NOT EXISTS form_m_number text,
  ADD COLUMN IF NOT EXISTS form_m_date date,
  ADD COLUMN IF NOT EXISTS paar_number text,
  ADD COLUMN IF NOT EXISTS paar_date date,
  ADD COLUMN IF NOT EXISTS soncap_number text;

-- ============================================================
-- TERMINAL_OPERATIONS: demurrage free-time tracking
-- ============================================================

ALTER TABLE terminal_operations
  ADD COLUMN IF NOT EXISTS free_time_days integer,
  ADD COLUMN IF NOT EXISTS free_time_expiry date;

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE dg_packing_group AS ENUM ('I', 'II', 'III');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- SHIPMENT_CONTAINERS
-- ============================================================

CREATE TABLE IF NOT EXISTS shipment_containers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  container_number text,
  seal_number text,
  container_type text,
  tare_weight numeric(14,2),
  gross_weight numeric(14,2),
  is_dangerous_goods boolean NOT NULL DEFAULT false,
  un_number text,
  imdg_class text,
  packing_group dg_packing_group,
  status text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE shipment_containers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_shipment_containers_branch" ON shipment_containers;
CREATE POLICY "select_shipment_containers_branch" ON shipment_containers FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_shipment_containers_branch" ON shipment_containers;
CREATE POLICY "insert_shipment_containers_branch" ON shipment_containers FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "update_shipment_containers_branch" ON shipment_containers;
CREATE POLICY "update_shipment_containers_branch" ON shipment_containers FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_operations())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_operations());

DROP POLICY IF EXISTS "delete_shipment_containers_branch" ON shipment_containers;
CREATE POLICY "delete_shipment_containers_branch" ON shipment_containers FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_operations());

-- ============================================================
-- CARGO_INSURANCE_POLICIES
-- ============================================================

CREATE TABLE IF NOT EXISTS cargo_insurance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  insurer_name text NOT NULL,
  policy_number text,
  coverage_amount numeric(14,2),
  currency text NOT NULL DEFAULT 'NGN',
  premium_amount numeric(14,2),
  start_date date,
  end_date date,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE cargo_insurance_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_cargo_insurance_branch" ON cargo_insurance_policies;
CREATE POLICY "select_cargo_insurance_branch" ON cargo_insurance_policies FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_cargo_insurance_branch" ON cargo_insurance_policies;
CREATE POLICY "insert_cargo_insurance_branch" ON cargo_insurance_policies FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_documentation());

DROP POLICY IF EXISTS "update_cargo_insurance_branch" ON cargo_insurance_policies;
CREATE POLICY "update_cargo_insurance_branch" ON cargo_insurance_policies FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_documentation())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_documentation());

DROP POLICY IF EXISTS "delete_cargo_insurance_branch" ON cargo_insurance_policies;
CREATE POLICY "delete_cargo_insurance_branch" ON cargo_insurance_policies FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_documentation());

-- ============================================================
-- FREIGHT_RATE_CARDS
-- ============================================================

CREATE TABLE IF NOT EXISTS freight_rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  carrier text,
  shipment_type shipment_type_enum,
  trade_lane_origin text NOT NULL,
  trade_lane_destination text NOT NULL,
  container_type text,
  buy_rate numeric(14,2) NOT NULL,
  sell_rate numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  valid_from date,
  valid_to date,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE freight_rate_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_freight_rate_cards_branch" ON freight_rate_cards;
CREATE POLICY "select_freight_rate_cards_branch" ON freight_rate_cards FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_branch(branch_id));

DROP POLICY IF EXISTS "insert_freight_rate_cards_branch" ON freight_rate_cards;
CREATE POLICY "insert_freight_rate_cards_branch" ON freight_rate_cards FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_sales());

DROP POLICY IF EXISTS "update_freight_rate_cards_branch" ON freight_rate_cards;
CREATE POLICY "update_freight_rate_cards_branch" ON freight_rate_cards FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_sales())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_sales());

DROP POLICY IF EXISTS "delete_freight_rate_cards_branch" ON freight_rate_cards;
CREATE POLICY "delete_freight_rate_cards_branch" ON freight_rate_cards FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_sales());

-- ============================================================
-- WEBHOOK_SUBSCRIPTIONS (admin-only — contains a signing secret)
-- ============================================================

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  name text NOT NULL,
  target_url text NOT NULL,
  signing_secret text NOT NULL,
  event_types text[] NOT NULL DEFAULT ARRAY['shipment.status_changed'],
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_webhook_subscriptions_admin" ON webhook_subscriptions;
CREATE POLICY "select_webhook_subscriptions_admin" ON webhook_subscriptions FOR SELECT
  TO authenticated USING (
    deleted_at IS NULL AND can_access_branch(branch_id)
    AND (has_role('admin') OR has_role('branch_manager'))
  );

DROP POLICY IF EXISTS "insert_webhook_subscriptions_admin" ON webhook_subscriptions;
CREATE POLICY "insert_webhook_subscriptions_admin" ON webhook_subscriptions FOR INSERT
  TO authenticated WITH CHECK (
    can_access_branch(branch_id) AND (has_role('admin') OR has_role('branch_manager'))
  );

DROP POLICY IF EXISTS "update_webhook_subscriptions_admin" ON webhook_subscriptions;
CREATE POLICY "update_webhook_subscriptions_admin" ON webhook_subscriptions FOR UPDATE
  TO authenticated
  USING (
    deleted_at IS NULL AND can_access_branch(branch_id)
    AND (has_role('admin') OR has_role('branch_manager'))
  )
  WITH CHECK (can_access_branch(branch_id) AND (has_role('admin') OR has_role('branch_manager')));

DROP POLICY IF EXISTS "delete_webhook_subscriptions_admin" ON webhook_subscriptions;
CREATE POLICY "delete_webhook_subscriptions_admin" ON webhook_subscriptions FOR DELETE
  TO authenticated USING (
    can_access_branch(branch_id) AND (has_role('admin') OR has_role('branch_manager'))
  );

-- ============================================================
-- PUBLIC TRACKING (SECURITY DEFINER — exact reference match only)
-- ============================================================

CREATE OR REPLACE FUNCTION public_track_shipment(p_reference text)
RETURNS TABLE (
  reference_number text,
  shipment_type shipment_type_enum,
  status shipment_status,
  origin text,
  destination text,
  carrier text,
  vessel_name text,
  voyage_number text,
  estimated_departure date,
  estimated_arrival date,
  actual_departure date,
  actual_arrival date,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    s.reference_number, s.shipment_type, s.status, s.origin, s.destination,
    s.carrier, s.vessel_name, s.voyage_number, s.estimated_departure,
    s.estimated_arrival, s.actual_departure, s.actual_arrival, s.updated_at
  FROM shipments s
  WHERE s.reference_number = p_reference AND s.deleted_at IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public_track_shipment(text) TO anon, authenticated;

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

DO $$ BEGIN
  CREATE TRIGGER trigger_shipment_containers_updated_at
    BEFORE UPDATE ON shipment_containers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_cargo_insurance_policies_updated_at
    BEFORE UPDATE ON cargo_insurance_policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_freight_rate_cards_updated_at
    BEFORE UPDATE ON freight_rate_cards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_webhook_subscriptions_updated_at
    BEFORE UPDATE ON webhook_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_shipment_containers_branch_id ON shipment_containers(branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_shipment_containers_shipment_id ON shipment_containers(shipment_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cargo_insurance_branch_id ON cargo_insurance_policies(branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cargo_insurance_shipment_id ON cargo_insurance_policies(shipment_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_freight_rate_cards_branch_id ON freight_rate_cards(branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_freight_rate_cards_lane ON freight_rate_cards(trade_lane_origin, trade_lane_destination) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_branch_id ON webhook_subscriptions(branch_id) WHERE deleted_at IS NULL;
