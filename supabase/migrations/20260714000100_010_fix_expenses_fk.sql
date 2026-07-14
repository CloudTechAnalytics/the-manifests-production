/*
# Fix: expenses.paid_by / approved_by pointed at the wrong table

## Problem
Same class of bug as migration 008: `expenses.paid_by` and
`expenses.approved_by` were declared as foreign keys to `auth.users(id)`,
but the frontend embeds them as `profiles` via PostgREST's constraint-name
hint (`profiles!expenses_paid_by_fkey`). Since no FK constraint links
these columns to `profiles`, that embed would fail outright and silently
empty the Expenses list — caught here before it shipped, by checking for
this exact pattern immediately after writing the migration.

## Fix
Re-point both FKs at `profiles(id)` instead of `auth.users(id)`, keeping
the same auto-generated constraint names so no frontend change is needed.
Safe for the same reason as migration 008: every user is provisioned via
the `create-user` edge function, which always creates the profiles row
alongside the auth user.
*/

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_paid_by_fkey;
ALTER TABLE expenses ADD CONSTRAINT expenses_paid_by_fkey
  FOREIGN KEY (paid_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_approved_by_fkey;
ALTER TABLE expenses ADD CONSTRAINT expenses_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL;
