/*
# Quotation module v3: GL/billing metadata on charge lines, Sent By/Sent Date

## Design
Plain additive columns, no RLS changes — both sets are written through the
already-permitted can_manage_sales()-gated update policies on quotations
and quotation_items, same as every other non-approval column on these
two tables.

## quotation_items
Five internal GL/billing fields, tucked behind the charge table's new
"More Details" disclosure — never shown on the customer-facing PDF.

## quotations
sent_by/sent_at mirror the existing approved_by/approval_date pattern:
set once, client-side, in the same handleStatusChange update that moves
status to 'sent'.
*/

ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS billing_basis text,
  ADD COLUMN IF NOT EXISTS cost_centre text,
  ADD COLUMN IF NOT EXISTS gl_account text,
  ADD COLUMN IF NOT EXISTS internal_reference text,
  ADD COLUMN IF NOT EXISTS tax_code text;

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS sent_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;
