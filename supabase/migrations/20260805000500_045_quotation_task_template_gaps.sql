/*
# Fill task-template gaps named in the quotation ERP spec

Additive only — every task template this app already seeds on shipment
creation (migration 037) stays exactly as it was. This just adds the
handful of specifically-named tasks that weren't already covered under
their natural existing stage, using ON CONFLICT (stage_key, title) DO
NOTHING so re-running this is always safe.

Two items from the spec are deliberately NOT added here: a "Finance"
stage (Customer Invoice / Payment Tracking) and restructuring
"Planning" into (Arrival Schedule / Milestones / Calendar Events).
Both would mean adding to or reshaping workflow_stage_catalog, which
drives the whole shipment lifecycle UI, not just quotations — out of
scope for "only improve the Quotation module." Invoicing already has
its own module and already links to a shipment via invoices.shipment_id;
that's the existing equivalent of "Customer Invoice" today.
*/

INSERT INTO stage_task_templates (stage_key, title, default_priority, default_department, sort_order) VALUES
  ('documentation', 'Prepare Form M', 'high', 'documentation', 8),
  ('documentation', 'Prepare PAAR', 'high', 'documentation', 9),

  ('customs_clearance', 'Await Documentation', 'medium', 'customs', 4),
  ('customs_clearance', 'Duty Assessment', 'high', 'customs', 5),

  ('terminal_operations', 'Terminal Delivery Order', 'high', 'terminal', 5),
  ('terminal_operations', 'Release', 'high', 'terminal', 6),

  ('warehouse', 'Storage', 'medium', 'warehouse', 3),

  ('transportation', 'Truck Assignment', 'high', 'transport', 5),
  ('transportation', 'Driver Assignment', 'high', 'transport', 6),
  ('transportation', 'Delivery Schedule', 'medium', 'transport', 7)
ON CONFLICT (stage_key, title) DO NOTHING;
