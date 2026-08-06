/*
# Extend shipment_status with the strict 12-stage lifecycle

## Why a separate, first migration
Postgres requires a new enum value to be committed before it can be
used in the same session/transaction as later statements (INSERT,
comparisons, etc.). Migration 053 (schema, RLS, backfill, and the
convert_quotation_to_shipment RPC) references these new values, so
they must land in their own migration that commits on its own first —
same constraint quotation_status's additions already worked within
(migration 044), just made explicit here since 053 needs the values
usable in the very next migration, not just eventually.

## New values
awaiting_operations, planning, awaiting_customs, customs_clearance,
terminal_processing, cargo_examination, released, transport,
completed, archived — 'documentation', 'delivered', and 'cancelled'
already exist and are reused as-is. The 3 retired values
(booking_received, processing, in_transit, arrived) are NOT removed —
Postgres can't cheaply drop enum values, and shipment_timeline rows
already store them permanently as historical fact. Migration 053
backfills live shipments off them and the application code stops
producing them going forward; see that migration's comment for the
full 12-value list and the reasoning per legacy value.
*/

ALTER TYPE shipment_status ADD VALUE IF NOT EXISTS 'awaiting_operations';
ALTER TYPE shipment_status ADD VALUE IF NOT EXISTS 'planning';
ALTER TYPE shipment_status ADD VALUE IF NOT EXISTS 'awaiting_customs';
ALTER TYPE shipment_status ADD VALUE IF NOT EXISTS 'customs_clearance';
ALTER TYPE shipment_status ADD VALUE IF NOT EXISTS 'terminal_processing';
ALTER TYPE shipment_status ADD VALUE IF NOT EXISTS 'cargo_examination';
ALTER TYPE shipment_status ADD VALUE IF NOT EXISTS 'released';
ALTER TYPE shipment_status ADD VALUE IF NOT EXISTS 'transport';
ALTER TYPE shipment_status ADD VALUE IF NOT EXISTS 'completed';
ALTER TYPE shipment_status ADD VALUE IF NOT EXISTS 'archived';
