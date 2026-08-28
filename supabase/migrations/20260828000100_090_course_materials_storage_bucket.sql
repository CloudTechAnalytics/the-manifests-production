/*
# course-materials storage bucket

Dedicated bucket, not a path convention forced into `documents`. The
`documents` bucket's storage RLS (migration 007's
can_access_storage_path()) parses the FIRST path segment as a
branch_id via can_access_branch() — courses are org-scoped, not
branch-scoped, so there is no branch_id to put there. Reusing that
bucket's path convention would either break RLS or fake a branch onto
an org-wide resource.

This adds one more WHEN branch to the EXISTING can_access_storage_path()
helper (CREATE OR REPLACE, not a rewrite) — the 'documents' branch is
untouched, so nothing about existing document uploads changes.

Path convention: <organization_id>/<course_id>/<timestamp>-<filename>.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('course-materials', 'course-materials', false, 52428800)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_access_storage_path(p_bucket text, p_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $function$
  SELECT
    CASE
      WHEN p_bucket = 'documents' THEN
        can_access_branch(split_part(p_name, '/', 1)::uuid)
      WHEN p_bucket = 'course-materials' THEN
        can_access_org(split_part(p_name, '/', 1)::uuid)
      ELSE
        false
    END;
$function$;

DROP POLICY IF EXISTS "course_materials_bucket_read" ON storage.objects;
CREATE POLICY "course_materials_bucket_read" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'course-materials' AND can_access_storage_path(bucket_id, name));

DROP POLICY IF EXISTS "course_materials_bucket_insert" ON storage.objects;
CREATE POLICY "course_materials_bucket_insert" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'course-materials' AND can_access_storage_path(bucket_id, name));

DROP POLICY IF EXISTS "course_materials_bucket_update" ON storage.objects;
CREATE POLICY "course_materials_bucket_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'course-materials' AND can_access_storage_path(bucket_id, name))
  WITH CHECK (bucket_id = 'course-materials' AND can_access_storage_path(bucket_id, name));

DROP POLICY IF EXISTS "course_materials_bucket_delete" ON storage.objects;
CREATE POLICY "course_materials_bucket_delete" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'course-materials' AND can_access_storage_path(bucket_id, name));
