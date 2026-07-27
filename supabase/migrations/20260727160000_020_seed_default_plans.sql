/*
# Seed default plans — Basic / Professional / Enterprise

Populates the three standard tiers so Plans & Pricing is ready to use out
of the box, with the prices, limits, support levels and features shown in
the product design.

Idempotent: ON CONFLICT (slug) DO NOTHING, so re-running never duplicates
and never overwrites a plan the operator has since edited. To re-seed a
tier from scratch, delete it first.

Depends on migration 019 (plans.support_level). Storage is stored in GB;
1 TB is 1024 GB and the UI renders whole terabytes as "N TB".
created_by is left NULL — these are system-seeded, not created by a user.
*/

INSERT INTO plans
  (name, slug, description, monthly_price, annual_price, currency,
   max_users, storage_gb, support_level, features, is_active, sort_order)
VALUES
  (
    'Basic', 'basic', 'For small practices getting started',
    50000, 600000, 'NGN',
    5, 10, 'Community',
    '["Case Management","Calendar","Tasks","Basic Reports"]'::jsonb,
    true, 0
  ),
  (
    'Professional', 'professional', 'For growing firms',
    150000, 1800000, 'NGN',
    15, 100, 'Priority Email',
    '["Case Management","Calendar","Tasks","Basic Reports","Advanced Reports","Billing","Invoices","Document Versioning"]'::jsonb,
    true, 1
  ),
  (
    'Enterprise', 'enterprise', 'For large firms with advanced needs',
    250000, 2500000, 'NGN',
    NULL, 1024, 'Dedicated',
    '["Case Management","Calendar","Tasks","Basic Reports","Advanced Reports","Billing","Invoices","Document Versioning","AI Features","Custom Branding","SSO","Audit Logs"]'::jsonb,
    true, 2
  )
ON CONFLICT (slug) DO NOTHING;
