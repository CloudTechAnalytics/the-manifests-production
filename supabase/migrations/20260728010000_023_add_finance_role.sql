/*
# Add the finance role

Standalone on purpose: Postgres cannot reference a brand-new enum value
in the same transaction that adds it, so the RLS changes that check for
'finance' live in the next migration, run separately (as its own SQL
Editor execution) after this one has fully committed.
*/

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'finance';
