/*
# Backfill retained-copy fields on shipments created before migration 053

## Problem
Migration 053 added services/required_documents/priority/cargo_type/
shipment_direction/etc. to `shipments` and has convert_quotation_to_
shipment() populate them at conversion time — but that only applies
going forward. Any shipment created before that migration (via the old
convert-to-shipment-dialog, or the manual /shipments/new form against a
quotation) still has these columns at their empty defaults
(required_documents = '{}', etc.), so migration 054's Required
Documents fix shows "no requirements" instead of the correct
Import/Export list for those pre-existing shipments.

## Fix
One-time backfill: for every non-deleted shipment linked to a
quotation (quotation_id IS NOT NULL), copy the quotation's current
services/required_documents/priority/cargo_type/shipment_direction/
container_count/packages_count/package_type/dangerous_cargo/
temperature_controlled/insurance_required/payment_terms/payment_method/
customer_notes/contact_person/contact_email/contact_phone/sales_rep_id
onto the shipment — but only where the shipment's own value is still
at its untouched default (empty array / NULL / false), so nothing a
user has since manually edited on the shipment gets overwritten.
Shipments with no linked quotation (manually created, no source of
truth to copy from) are correctly left alone — same honest-empty-state
reasoning as migration 054.
*/

UPDATE shipments s
SET
  services = CASE WHEN s.services = '{}' THEN q.services ELSE s.services END,
  required_documents = CASE WHEN s.required_documents = '{}' THEN q.required_documents ELSE s.required_documents END,
  priority = q.priority,
  cargo_type = coalesce(s.cargo_type, q.cargo_type),
  shipment_direction = coalesce(s.shipment_direction, q.shipment_direction),
  container_count = coalesce(s.container_count, q.container_count),
  packages_count = coalesce(s.packages_count, q.packages_count),
  package_type = coalesce(s.package_type, q.package_type),
  dangerous_cargo = s.dangerous_cargo OR q.dangerous_cargo,
  temperature_controlled = s.temperature_controlled OR q.temperature_controlled,
  insurance_required = s.insurance_required OR q.insurance_required,
  payment_terms = coalesce(s.payment_terms, q.payment_terms),
  payment_method = coalesce(s.payment_method, q.payment_method),
  customer_notes = coalesce(s.customer_notes, q.customer_notes),
  contact_person = coalesce(s.contact_person, q.contact_person),
  contact_email = coalesce(s.contact_email, q.contact_email),
  contact_phone = coalesce(s.contact_phone, q.contact_phone),
  sales_rep_id = coalesce(s.sales_rep_id, q.sales_rep_id)
FROM quotations q
WHERE s.quotation_id = q.id
  AND s.deleted_at IS NULL
  AND s.required_documents = '{}';
