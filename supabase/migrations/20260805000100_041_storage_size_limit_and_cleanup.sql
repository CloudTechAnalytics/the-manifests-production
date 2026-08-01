/*
# Storage hardening: server-side size limit + cascade cleanup helper

## file_size_limit
The `documents` bucket had no size limit at the storage layer — only
client-side checks (50 MB), which a direct API call bypasses entirely.
Setting it on the bucket itself makes the limit real regardless of
which client called it. File type is intentionally left unrestricted
(matches the existing product decision on the Documents page — freight
paperwork spans PDF/DOCX/images and there's no reason to block that).

## Orphaned files after cascade delete
`documents.shipment_id` and `documents.customer_id` are ON DELETE
CASCADE — when a shipment or customer is permanently deleted, the
document *rows* disappear but the underlying *files* were never
cleaned up from storage. This function returns the file_paths that are
about to be orphaned so admin-delete-record can remove them from
storage right before it deletes the row that references them.
*/

UPDATE storage.buckets
SET file_size_limit = 52428800 -- 50 MB, matches the client-side limit
WHERE id = 'documents';

CREATE OR REPLACE FUNCTION documents_file_paths_for_shipment(p_shipment_id uuid)
RETURNS TABLE (file_path text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT file_path FROM documents WHERE shipment_id = p_shipment_id;
$$;

CREATE OR REPLACE FUNCTION documents_file_paths_for_customer(p_customer_id uuid)
RETURNS TABLE (file_path text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT file_path FROM documents WHERE customer_id = p_customer_id;
$$;
