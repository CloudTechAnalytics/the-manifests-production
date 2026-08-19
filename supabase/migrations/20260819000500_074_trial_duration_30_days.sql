/*
# Trial length: 14 -> 30 days

## Why
The one platform_settings row (migration 065) seeded trial_duration_days
at 14, and self-service registration already reads it live — but the
platform admin's own manual "Create Organization" dialog had a second,
hardcoded TRIAL_DAYS = 14 constant instead of reading the same setting,
exactly the "hardcoded trial duration" spec explicitly warned against.
Fixed on the app side in the same change as this migration (organizations/
page.tsx now fetches platform_settings instead of hardcoding a value).

Updates the existing singleton row directly — migration 065 already ran
on every environment, so editing its seed value wouldn't reach a
database that's already past it.
*/

UPDATE platform_settings SET trial_duration_days = 30 WHERE id = true;

ALTER TABLE platform_settings ALTER COLUMN trial_duration_days SET DEFAULT 30;
