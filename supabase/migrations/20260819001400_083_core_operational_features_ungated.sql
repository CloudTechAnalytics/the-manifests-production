/*
# Fix: mandatory shipment-lifecycle stages were wrongly gated behind Enterprise

## The mistake
lib/plans.ts's FEATURE_CATALOG and the plan feature lists it drove
(migration 075) put Customs Clearance and Warehouse Management on
Professional+, and Terminal Operations, Transportation Management,
Cargo Examination, Shipment Planning, and Sales Pipeline on Enterprise
only. Invoicing and Payments were Professional+ too.

migration 035's workflow_stage_catalog is the actual source of truth
for what a shipment goes through, and it says otherwise: planning,
documentation, regulatory_compliance, customs_clearance,
terminal_operations, and transportation are all is_optional = false —
mandatory for every shipment, on every plan. Only cargo_examination and
warehouse are genuinely skippable, and that's a per-shipment choice
(does this cargo need physical examination or storage), not a
subscription tier. Invoicing/Payments aren't in the stage catalog at
all, but a company that can't invoice its own customers isn't a
usable product regardless of plan.

Conflating "optional for a particular shipment" with "optional as a
paid tier" meant a Basic or Professional org could have a shipment
stuck at a mandatory stage with the page to manage it invisible, or be
unable to bill a customer at all. Found live, testing a Basic/
Professional-equivalent account.

## The fix
Every module needed to actually move a shipment through its lifecycle
or get paid is now in every plan, Basic included. What's left to
differentiate tiers: Expense Tracking, Rate Management, and Advanced
Reports (Professional+), Webhooks & API Integrations and Audit Logs
(Enterprise) - genuine back-office/integration/governance upgrades,
plus each plan's existing user-count and support-level differences.
Enterprise and Trial (migration 082, mirrors Enterprise) already
included everything and don't need to change.
*/

UPDATE plans SET features = '[
  "Shipment Management", "Quotations", "Customer Management",
  "Shipment Tracking", "Document Management", "Basic Reports",
  "Customs Clearance", "Terminal Operations", "Transportation Management",
  "Shipment Planning", "Cargo Examination", "Warehouse Management",
  "Sales Pipeline", "Invoicing", "Payments"
]'::jsonb
WHERE slug = 'basic';

UPDATE plans SET features = '[
  "Shipment Management", "Quotations", "Customer Management",
  "Shipment Tracking", "Document Management", "Basic Reports",
  "Customs Clearance", "Terminal Operations", "Transportation Management",
  "Shipment Planning", "Cargo Examination", "Warehouse Management",
  "Sales Pipeline", "Invoicing", "Payments",
  "Expense Tracking", "Rate Management", "Advanced Reports"
]'::jsonb
WHERE slug = 'professional';
