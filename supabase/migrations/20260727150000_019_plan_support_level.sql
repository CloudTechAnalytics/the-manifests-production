/*
# Plan support level

Adds a single display-only field to `plans`: which support tier the plan
advertises (e.g. Community, Priority Email, Dedicated). Like max_users
and storage_gb, it is a figure shown to the platform_admin and on the
plan card — nothing enforces it.

Kept as free text rather than an enum so the operator can name tiers
however they market them, without a migration each time.
*/

ALTER TABLE plans ADD COLUMN IF NOT EXISTS support_level text;
