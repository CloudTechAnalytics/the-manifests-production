/*
# Add six new department roles

## Why
The user wants a fuller department list (Planning, Documentation,
Customs, Terminal, Examination, Warehouse, Transport, Finance, Sales,
Administration) and — the real point of this migration and the one
after it — the ability for one person to hold *more than one* of them
at once. `customs`, `finance`, `operations`, `sales`, `branch_manager`,
`admin` already exist; this adds the remaining six.

Own migration/transaction: Postgres can't reference a brand-new enum
value in the same transaction that adds it, so the next migration
(which uses these in can_manage_planning() etc.) has to run after this
one fully commits — same reason `finance` and `customs` each needed
their own migration before it.
*/

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'planning';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'documentation';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'terminal';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'examination';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'warehouse';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'transport';
