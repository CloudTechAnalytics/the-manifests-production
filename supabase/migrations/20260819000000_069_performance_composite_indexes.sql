/*
# Performance: composite indexes for the dominant list-page query shape

## Why
Every core list page (Shipments, Quotations, Invoices, Payments,
Documents, Customers) queries the same shape:

  .is('deleted_at', null).eq('branch_id', X).order('created_at', desc)

No migration up to this point ever indexed `created_at` on any of these
tables — only `branch_id`/`status`/`customer_id` etc are indexed
individually (correctly, with `WHERE deleted_at IS NULL`), so Postgres
has to fall back to a separate sort step after finding the branch-scoped
rows instead of walking one index in the right order already. A
composite (branch_id, created_at DESC) index, still scoped to
deleted_at IS NULL to match every sibling index on these tables, lets
the common case (a branch-scoped list, most-recent-first) be served by
a single ordered index scan.

## The two other index gaps found in the same audit
- invoices.quotation_id is a real FK (REFERENCES quotations(id) ON
  DELETE SET NULL, migration 009) that's the only FK on `invoices`
  without a supporting index — every sibling FK (shipment_id,
  customer_id, branch_id) already has one. invoices/[id]/page.tsx joins
  quotation:quotations(*), so this is a real, not speculative, gap.
- shipment_tasks.due_date has no index at all, but work-queue/page.tsx
  filters `status NOT IN ('done','cancelled') AND due_date < today
  ORDER BY due_date`.

## What's deliberately NOT here
No organization_id index is added anywhere in this migration.
organization_id lives on only branches/profiles/activities/departments
(migration 014's own docstring explains why) — every other table here
scopes tenancy transitively through branch_id, which is already
indexed. Adding an organization_id column/index to these tables would
be speculative, not evidence-based, and is exactly the kind of
unnecessary rewrite the performance audit was asked to avoid.
*/

CREATE INDEX IF NOT EXISTS idx_shipments_branch_created
  ON shipments(branch_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_branch_created
  ON quotations(branch_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_branch_created
  ON invoices(branch_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payments_branch_created
  ON payments(branch_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_branch_created
  ON documents(branch_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_branch_created
  ON customers(branch_id, created_at DESC) WHERE deleted_at IS NULL;

-- The one unindexed FK among the tables actually joined in the app.
CREATE INDEX IF NOT EXISTS idx_invoices_quotation_id
  ON invoices(quotation_id) WHERE deleted_at IS NULL;

-- work-queue/page.tsx's overdue-task query has no covering index today.
CREATE INDEX IF NOT EXISTS idx_shipment_tasks_status_due
  ON shipment_tasks(status, due_date);

-- The transfer-destination side of a stock movement — warehouse_id and
-- item_id both already have an index, to_warehouse_id didn't.
CREATE INDEX IF NOT EXISTS idx_stock_movements_to_warehouse_id
  ON stock_movements(to_warehouse_id) WHERE to_warehouse_id IS NOT NULL;
