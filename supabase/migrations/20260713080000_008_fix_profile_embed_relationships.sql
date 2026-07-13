/*
# Fix broken profile relationships used for PostgREST embedding

## Problem
`shipments.assigned_to`, `shipment_timeline.created_by`, and `documents.created_by`
were declared as foreign keys to `auth.users(id)`. The frontend, however, embeds
these as `profiles` rows via PostgREST's constraint-name hint, e.g.:

  assigned_user:profiles!shipments_assigned_to_fkey(id, full_name)

PostgREST resolves that hint by looking up the `shipments_assigned_to_fkey`
constraint and embedding whatever table it points to. Since that constraint
pointed at `auth.users`, not `profiles`, the relationship the frontend asked
for did not exist — every query using this embed (the shipments list, the
shipment detail page, the shipment timeline, and the documents list) failed
outright with a PostgREST relationship error. The frontend swallows the error
and renders an empty list, which looked like newly created shipments were
"deleted" immediately: the row was always fine in the database, only the
read query was broken.

## Fix
Re-point these three FKs at `profiles(id)` instead of `auth.users(id)`,
keeping the same auto-generated constraint names the frontend already
references, so no frontend changes are required. This is safe because every
usable auth.users row here always has a matching profiles row — accounts are
only ever created through the `create-user` edge function, which inserts the
auth user and the profile row together (rolling back the auth user if the
profile insert fails).
*/

ALTER TABLE shipments DROP CONSTRAINT IF EXISTS shipments_assigned_to_fkey;
ALTER TABLE shipments ADD CONSTRAINT shipments_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE shipment_timeline DROP CONSTRAINT IF EXISTS shipment_timeline_created_by_fkey;
ALTER TABLE shipment_timeline ADD CONSTRAINT shipment_timeline_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_created_by_fkey;
ALTER TABLE documents ADD CONSTRAINT documents_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
