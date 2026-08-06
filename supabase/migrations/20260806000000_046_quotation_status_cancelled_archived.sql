/*
# Quotation lifecycle: cancelled + archived (isolated enum add)

New Postgres enum values can't be referenced in the same transaction
they're added in, so this migration ONLY adds the values. Every
column/RLS/query that uses them lives in migration 047, one file later.

- cancelled: customer withdrew the request — distinct from `rejected`,
  which means an internal/business decision not to proceed. Reachable
  from draft/pending_approval/approved/sent.
- archived: housekeeping-only terminal state for old quotations that
  are done (accepted/rejected/expired/cancelled) — hides them from
  default list views without deleting, same soft-lifecycle spirit as
  deleted_at but reversible via an ordinary status change, not a trash
  bin.
*/

ALTER TYPE quotation_status ADD VALUE IF NOT EXISTS 'cancelled' AFTER 'rejected';
ALTER TYPE quotation_status ADD VALUE IF NOT EXISTS 'archived' AFTER 'expired';
