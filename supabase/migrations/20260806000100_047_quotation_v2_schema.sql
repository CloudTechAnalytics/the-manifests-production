/*
# Quotation module v2: versioning, scope of service, richer charge lines,
# attachments, approval thresholds, PDF bank details

## Versioning
Self-referencing columns directly on `quotations`, not a new table — no
history/junction table exists anywhere in this schema; documents'
replaces_document_id is the closest precedent (a single self-FK linear
chain on the same table). Reusing `quotations` itself means every
existing mechanism (RLS, activities, the RHF form schema, the PDF
template) works on a version for free, with zero new joins.
  parent_quotation_id -> immediate predecessor
  root_quotation_id   -> chain anchor (NULL on the original)
  version             -> 1, 2, 3...
  is_latest_version   -> only one row per chain is editable/actionable

## Scope of service
excluded_services is the only new column — "Included" in the UI is a
read-only mirror of the existing `services` column, not a second source
of truth that could drift.

## Attachments
documents.quotation_id, same pattern as plan_id (migration 012) and
examination_id (migration 029) before it. No RLS change: the existing
can_access_branch(branch_id) policies on `documents` already cover it.

## Approval thresholds
Two nullable numeric columns on `organizations`, edited only through
the update-org-quotation-settings edge function (extended separately) —
same escape hatch already used for quotation_approval_required.
organizations itself stays platform-admin-only at the RLS layer.

## RLS: approval requires admin or branch_manager
Inlined into the EXISTING update_quotations_branch policy's WITH CHECK
rather than a second policy — Postgres OR's multiple permissive
policies together, so a second one would only widen access, never
restrict it. Scoped to status = 'approved' only: 'rejected' is reached
from two legitimate paths today (an internal pending_approval->rejected
decision, already UI-gated; and recording a customer's decision on a
Sent quote, done today by any sales rep) that RLS can't tell apart
without a trigger, which this schema deliberately never uses for
business logic — restricting rejected here would break a working flow.
*/

-- ============================================================
-- QUOTATIONS: versioning + scope of service
-- ============================================================

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS parent_quotation_id uuid REFERENCES quotations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS root_quotation_id uuid REFERENCES quotations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_latest_version boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS excluded_services text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_quotations_root_quotation_id ON quotations(root_quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotations_parent_quotation_id ON quotations(parent_quotation_id);

-- ============================================================
-- QUOTATION_ITEMS: unit, notes, explicit sort order
-- ============================================================

ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_quotation_items_sort_order ON quotation_items(quotation_id, sort_order);

-- ============================================================
-- DOCUMENTS: quotation attachments
-- ============================================================

ALTER TABLE documents ADD COLUMN IF NOT EXISTS quotation_id uuid REFERENCES quotations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_documents_quotation_id ON documents(quotation_id) WHERE deleted_at IS NULL;

-- ============================================================
-- ORGANIZATIONS: approval thresholds
-- ============================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS quotation_discount_threshold_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS quotation_amount_threshold numeric(14,2);

-- ============================================================
-- BRANCHES: bank details for the quotation PDF
-- ============================================================

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account_name text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_swift_code text;

-- ============================================================
-- RLS: only admin/branch_manager may move a quotation to 'approved'
-- ============================================================

DROP POLICY IF EXISTS "update_quotations_branch" ON quotations;
CREATE POLICY "update_quotations_branch" ON quotations FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id))
  WITH CHECK (
    can_access_branch(branch_id) AND can_manage_sales()
    AND (status <> 'approved' OR has_role('admin') OR has_role('branch_manager'))
  );
