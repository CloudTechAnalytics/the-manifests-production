/*
# Cost-of-delay expense categories: demurrage, storage, re-examination penalties

## Design
Customs-clearance mistakes (wrong HS codes, incomplete Form M/PAAR,
undervalued invoices, missing approvals, document mismatches, inspection
holds) typically show up financially as demurrage, storage charges, or
re-examination penalties. Today those costs have no dedicated category —
they'd be filed under 'other' or 'customs' with zero visibility. This
adds three enum values only; expenses RLS is gated solely by
can_access_branch(), never by category, so no policy changes are needed.

Own migration/transaction: a brand-new enum value can't be referenced by
any later statement in the same transaction it's added in.
*/

ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'demurrage';
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'storage';
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 're_examination_penalty';
