/*
# Seed the Trial plan + the one platform_settings row

Idempotent, same style as migration 020's Basic/Professional/Enterprise
seed: ON CONFLICT DO NOTHING for the plan, and the platform_settings
singleton is only inserted if the table is empty (its own PK already
prevents a second row, but this avoids a spurious ON CONFLICT no-op read).

is_public = false keeps Trial out of any future public pricing comparison —
it's an internal provisioning detail, not a tier a customer picks.
*/

ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

INSERT INTO plans
  (name, slug, description, monthly_price, annual_price, currency,
   max_users, storage_gb, support_level, features, is_active, is_public, sort_order)
VALUES
  (
    'Trial', 'trial', 'Full-featured trial, automatically assigned at registration',
    0, 0, 'NGN',
    10, 5, 'Community',
    '["Case Management","Calendar","Tasks","Basic Reports"]'::jsonb,
    true, false, -1
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO platform_settings (id, trial_duration_days, default_trial_plan_id, self_registration_enabled, terms_version, privacy_version)
SELECT true, 14, (SELECT id FROM plans WHERE slug = 'trial'), true, 'v1', 'v1'
WHERE NOT EXISTS (SELECT 1 FROM platform_settings);
