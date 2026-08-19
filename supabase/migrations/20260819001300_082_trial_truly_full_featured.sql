/*
# Trial plan: actually full-featured, not "Professional-level"

## Why
Migration 075 set Trial's features to mirror Professional, reasoning
"full-featured trial ... evaluators see real product depth." That
undersold it: Planning Centre, Terminal Operations, Transportation,
Cargo Examination, Sales Pipeline, Webhooks, and Audit Logs are
Enterprise-exclusive features, so a trial org (mirroring Professional)
couldn't reach Planning at all — found live, testing a fresh trial
account, where the Planning Centre nav item was simply missing. A trial
whose own description promises "full-featured" should mean every
module, not most of them — otherwise a prospect evaluating the product
never sees what Enterprise actually adds, undermining the trial's own
purpose.

Trial now mirrors Enterprise exactly (feature-wise) - the trial's real
constraints are max_users (3, migration 076) and its time limit, not a
locked-out module list.
*/

UPDATE plans SET features = '[
  "Shipment Management", "Quotations", "Customer Management",
  "Shipment Tracking", "Document Management", "Basic Reports",
  "Invoicing", "Payments", "Expense Tracking", "Rate Management",
  "Customs Clearance", "Warehouse Management", "Advanced Reports",
  "Terminal Operations", "Transportation Management", "Cargo Examination",
  "Shipment Planning", "Sales Pipeline", "Webhooks & API Integrations",
  "Audit Logs"
]'::jsonb
WHERE slug = 'trial';
