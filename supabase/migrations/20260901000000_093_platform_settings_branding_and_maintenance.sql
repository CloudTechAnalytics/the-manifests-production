/*
# Extend platform_settings: branding + maintenance mode

The Platform Console's Settings page (matching thecounsel-reference's
PlatformSettingsPage) needs a few more global, platform-admin-only
knobs that platform_settings (migration 063) doesn't have yet:
product name / support email / primary color / a global notice banner,
and a maintenance-mode toggle with its own message. All additive,
nullable-or-defaulted columns on the existing singleton row - no
backfill needed, no risk to the columns already in use (trial config,
self-registration).

Deliberately NOT adding the reference's "Feature flags" or "SMTP"
sections here - those would need either real gating logic somewhere
in the app or a real outbound-email integration to not just be decor
that does nothing when toggled/saved, and neither exists yet.
*/

ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS product_name text NOT NULL DEFAULT 'The Manifest';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS support_email text;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS primary_color text NOT NULL DEFAULT '#B38A3E';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS global_notice text;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS maintenance_mode boolean NOT NULL DEFAULT false;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS maintenance_message text;
