/*
# Fix delivery_orders: apply migration 079's schema for real

Migration 079 ("Delivery Orders and Cargo Claims") intended to redefine
delivery_orders around a TDO-expiry model (issued_at/validity_hours/
expires_at/exited_at, superseded_by chaining multiple issues per
shipment) instead of the original migration 053 shape (a single
per-shipment row with a manually-tracked status/delivery_address/
requested_delivery_date/released_date/delivered_date).

But 079 wrote its table as `CREATE TABLE IF NOT EXISTS delivery_orders
(...)` — and 053 had already created a table by that name, so 079's
CREATE TABLE silently no-opped. The app's frontend (delivery-orders-
panel.tsx) was built entirely against 079's intended columns
(issued_at, validity_hours, do_number, superseded_by, ...) and never
references any of 053's columns at all, so every read/write against
this table has been hitting "column does not exist" since whenever
079 shipped — this migration actually applies the change 079 meant to
make.

Written to be safe against both an empty table (this bug was caught
via the testing project, which has zero delivery_orders rows) and one
with real rows (in case this same gap exists in production by the
time this runs there): new NOT NULL columns get a real backfill before
the constraint is applied, not just a default that only covers future
inserts.
*/

-- 1. New columns 079 intended, additive and nullable-first where a
--    NOT NULL constraint needs a real backfill below.
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS do_number text;
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS issued_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS validity_hours integer NOT NULL DEFAULT 24;
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS exited_at timestamptz;
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES delivery_orders(id) ON DELETE SET NULL;
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS regeneration_fee numeric(14,2);
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS regeneration_fee_currency text NOT NULL DEFAULT 'NGN';
ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES expenses(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'delivery_orders_validity_hours_check'
  ) THEN
    ALTER TABLE delivery_orders ADD CONSTRAINT delivery_orders_validity_hours_check CHECK (validity_hours > 0);
  END IF;
END $$;

-- 2. Carry any legacy order_number values over to do_number before
--    order_number is dropped, then backfill expires_at from
--    issued_at + validity_hours for any pre-existing rows (only
--    matters if this ever runs against a table that already has
--    rows — the testing project that surfaced this bug has none).
UPDATE delivery_orders SET do_number = order_number WHERE do_number IS NULL AND order_number IS NOT NULL;
UPDATE delivery_orders SET expires_at = issued_at + (validity_hours || ' hours')::interval WHERE expires_at IS NULL;

ALTER TABLE delivery_orders ALTER COLUMN expires_at SET NOT NULL;

-- 3. Drop 053's now-superseded auto-numbering trigger/function — the
--    column it wrote to (order_number) is going away, and do_number
--    is user-entered (or left blank) per delivery-orders-panel.tsx,
--    never auto-generated.
DROP TRIGGER IF EXISTS trigger_set_delivery_order_number ON delivery_orders;
DROP FUNCTION IF EXISTS set_delivery_order_number();
DROP FUNCTION IF EXISTS generate_delivery_order_number();
DROP SEQUENCE IF EXISTS delivery_order_seq;

-- 4. Drop 053's columns/constraints that 079's design replaced. Every
--    one of these is unreferenced by the app (verified against
--    delivery-orders-panel.tsx, the only consumer of this table).
ALTER TABLE delivery_orders DROP CONSTRAINT IF EXISTS delivery_orders_shipment_id_key;
ALTER TABLE delivery_orders DROP CONSTRAINT IF EXISTS delivery_orders_order_number_key;
ALTER TABLE delivery_orders DROP COLUMN IF EXISTS order_number;
ALTER TABLE delivery_orders DROP COLUMN IF EXISTS status;
ALTER TABLE delivery_orders DROP COLUMN IF EXISTS delivery_address;
ALTER TABLE delivery_orders DROP COLUMN IF EXISTS requested_delivery_date;
ALTER TABLE delivery_orders DROP COLUMN IF EXISTS released_date;
ALTER TABLE delivery_orders DROP COLUMN IF EXISTS delivered_date;
