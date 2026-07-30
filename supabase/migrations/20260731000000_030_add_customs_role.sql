/*
# Add a dedicated `customs` role

## Why
Phase 1's Customs/Terminal/Examination modules were gated with the
existing can_manage_operations() (admin/branch_manager/operations) as an
interim decision — flagged at the time as "no dedicated customs role
yet." The user now wants that carved out into its own internal role,
same pattern as the earlier `finance` role: a genuinely separate
specialist track, not just an operations sub-permission.

Must be its own migration/transaction — Postgres can't reference a
brand-new enum value in the same transaction that adds it, so the next
migration's `role IN (..., 'customs')` would fail to parse if bundled
together with this ALTER TYPE.
*/

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'customs';
