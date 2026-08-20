/*
# Add hr_manager and hr_officer roles

## Why
The new HR & People Capacity module needs two dedicated staff tiers:
hr_manager (full employee + HR management, including sensitive fields)
and hr_officer (operational HR admin, restricted from sensitive fields
like salary/bank/private notes). admin already serves as "HR
Administrator"/Organization Owner — same convention this codebase
already uses (admin with branch_id NULL = org-wide owner).

Own migration/transaction, same reason `finance`/`customs`/the six
department roles (migration 033) each needed their own: Postgres can't
reference a brand-new enum value in the same transaction that adds it.
Migration 033 proved multiple ADD VALUE statements can share one
migration as long as nothing in that same file uses them yet — the next
migration (085), which references these in RLS helper functions, runs
after this one fully commits.
*/

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'hr_manager';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'hr_officer';
