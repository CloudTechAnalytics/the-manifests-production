/*
# Plan features: replace leftover template copy with real Manifest modules

## Why
Migrations 020 and 065 seeded plans.features with "Case Management",
"Calendar", "Tasks", "Basic Reports" — copied from a legal-practice-
management product template and never adapted. The Manifest is a
freight-forwarding app with no calendar or task module; those labels
meant nothing to anyone looking at Plans & Pricing. lib/plans.ts's
FEATURE_CATALOG has been rewritten to the app's actual modules in the
same change — this migration updates the already-seeded rows to match,
since the original INSERTs won't re-run (ON CONFLICT DO NOTHING).

Only touches the four system-seeded plans by slug, so any renamed/
customized plan an admin already created is untouched.
*/

UPDATE plans SET features = '[
  "Shipment Management", "Quotations", "Customer Management",
  "Shipment Tracking", "Document Management", "Basic Reports"
]'::jsonb
WHERE slug = 'basic';

UPDATE plans SET features = '[
  "Shipment Management", "Quotations", "Customer Management",
  "Shipment Tracking", "Document Management", "Basic Reports",
  "Invoicing", "Payments", "Expense Tracking", "Rate Management",
  "Customs Clearance", "Warehouse Management", "Advanced Reports"
]'::jsonb
WHERE slug = 'professional';

UPDATE plans SET features = '[
  "Shipment Management", "Quotations", "Customer Management",
  "Shipment Tracking", "Document Management", "Basic Reports",
  "Invoicing", "Payments", "Expense Tracking", "Rate Management",
  "Customs Clearance", "Warehouse Management", "Advanced Reports",
  "Terminal Operations", "Transportation Management", "Cargo Examination",
  "Shipment Planning", "Sales Pipeline", "Webhooks & API Integrations",
  "Audit Logs"
]'::jsonb
WHERE slug = 'enterprise';

-- Trial is documented as "Full-featured trial, automatically assigned at
-- registration" — mirrors Professional so evaluators see real product
-- depth, not just the bare minimum.
UPDATE plans SET features = '[
  "Shipment Management", "Quotations", "Customer Management",
  "Shipment Tracking", "Document Management", "Basic Reports",
  "Invoicing", "Payments", "Expense Tracking", "Rate Management",
  "Customs Clearance", "Warehouse Management", "Advanced Reports"
]'::jsonb
WHERE slug = 'trial';
