/*
# Add the platform_admin role

## Why this is its own migration
PostgreSQL will not let a newly added enum value be *used* in the same
transaction that added it. Migration 014 references 'platform_admin'
inside is_platform_admin(), so the value has to be committed first, by
itself. Do not merge this file into 014.

## What changes
Adds a fifth user_role above the existing four:

  platform_admin  -- operates the platform: creates organizations and is
                  -- the only role that can see across them
  admin           -- unchanged name, NARROWED meaning (see 014): from
                  -- "sees all data" to "manages everything in ITS org"
  branch_manager / operations / sales  -- unchanged, branch-scoped

No existing row is modified here, so applying this file on its own is a
no-op for every current user.
*/

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'platform_admin';
