/*
# Required Documents checklist driven by the quotation, not a static catalog

## Problem
The shipment Documents tab's "Required Documents" table
(resolveRequiredTemplates in lib/utils/document-templates.ts) matched
document_templates purely by shipment_type (air/sea/road/rail/
multimodal) and the customs red-channel flag — completely independent
of what was actually recorded on the quotation's Required Documents
section (built earlier, with explicit Import/Export badges and a
custom-document add UI). The result: every shipment saw close to the
whole template catalog regardless of direction or what the customer
actually needs to provide, and custom/import-specific choices from the
quotation were invisible.

## Fix
Application code (next commit) now filters 'documentation'-stage
templates by whether their name appears in shipments.required_documents
(copied verbatim from the quotation by convert_quotation_to_shipment —
migration 053) instead of shipment_type. Every other stage's templates
(customs_clearance, terminal_operations, cargo_examination,
transportation — internally-generated operational documents like Gate
Pass/Duty Payment Receipt/Proof of Delivery that were never part of the
quotation's customer-facing checklist) keep their existing shipment_type
/red-channel gating unchanged.

For that name-match to work, document_templates.name must exactly equal
the strings used in quotation-constants.ts's REQUIRED_DOCUMENT_OPTIONS.
This migration:
  - Renames 'PAAR (Pre-Arrival Assessment Report)' -> 'PAAR' (was the
    one existing mismatch).
  - Adds the 4 templates that existed as quotation options but never
    had a matching document_templates row at all (SONCAP, NAFDAC,
    Export Declaration (NXP), Shipping Instructions) — without these,
    an export shipment's required documents had nowhere to attach an
    upload to.
*/

UPDATE document_templates SET name = 'PAAR' WHERE key = 'paar';

INSERT INTO document_templates (key, name, category, stage_key, applies_to_shipment_types, requires_red_channel, is_required, sort_order) VALUES
  ('soncap', 'SONCAP', 'customs', 'documentation', NULL, false, true, 14),
  ('nafdac', 'NAFDAC', 'customs', 'documentation', NULL, false, true, 15),
  ('export_declaration', 'Export Declaration (NXP)', 'customs', 'documentation', NULL, false, true, 16),
  ('shipping_instructions', 'Shipping Instructions', 'other', 'documentation', NULL, false, true, 17)
ON CONFLICT (key) DO NOTHING;
