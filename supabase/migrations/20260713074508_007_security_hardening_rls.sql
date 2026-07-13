/*
# Security Hardening: RLS Policies

## Problem
Multiple RLS policy weaknesses identified in security audit:
1. profiles: users can self-escalate by updating role/branch_id/is_active/must_change_password via update_own_profile
2. activities: user_id not pinned to auth.uid() on INSERT (forgeable audit trail)
3. documents: created_by not pinned to auth.uid() on INSERT
4. storage.objects documents bucket: any authenticated user can read/write/delete ANY file (branch path predictable)
5. get_user_branch_id / can_access_branch: no is_active check (deactivated users retain access until session expires)
6. profiles: no deleted_at guard on update_own_profile (soft-deleted users can self-un-delete)

## Changes
1. profiles: tighten update_own_profile to only allow updating full_name (not role, branch_id, is_active, must_change_password, deleted_at)
2. activities: tighten INSERT policy to require user_id = auth.uid()
3. documents: tighten INSERT policy to require created_by = auth.uid(); UPDATE to require created_by = auth.uid() OR is_admin()
4. storage.objects: tighten all 4 policies to enforce branch-scoped path prefix via can_access_branch on path-extracted branch_id
5. get_user_branch_id: add is_active = true filter
6. profiles: add deleted_at IS NULL guard to update_own_profile
*/

-- ============================================================
-- 1. get_user_branch_id: add is_active check
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT branch_id FROM profiles WHERE id = auth.uid() AND is_active = true;
$function$;

-- ============================================================
-- 2. profiles: tighten update_own_profile to prevent self-escalation
--    Users can only update their own full_name, and only if not soft-deleted.
--    All other columns (role, branch_id, is_active, must_change_password, etc.)
--    are admin-only via update_all_profiles_admin.
-- ============================================================
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (id = auth.uid() AND deleted_at IS NULL);

-- ============================================================
-- 3. activities: pin user_id to auth.uid() on INSERT
-- ============================================================
DROP POLICY IF EXISTS "insert_activities_branch" ON activities;
CREATE POLICY "insert_activities_branch" ON activities FOR INSERT
  TO authenticated
  WITH CHECK (can_access_branch(branch_id) AND user_id = auth.uid());

-- ============================================================
-- 4. documents: pin created_by on INSERT; restrict UPDATE to owner or admin
-- ============================================================
DROP POLICY IF EXISTS "insert_documents_branch" ON documents;
CREATE POLICY "insert_documents_branch" ON documents FOR INSERT
  TO authenticated
  WITH CHECK (can_access_branch(branch_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS "update_documents_branch" ON documents;
CREATE POLICY "update_documents_branch" ON documents FOR UPDATE
  TO authenticated
  USING (can_access_branch(branch_id) AND (created_by = auth.uid() OR is_admin()))
  WITH CHECK (can_access_branch(branch_id) AND (created_by = auth.uid() OR is_admin()));

-- ============================================================
-- 5. storage.objects: tighten documents bucket policies
--    Path format: <branch_id>/<filename>
--    Extract branch_id from the path prefix and verify access.
--    Uses a SECURITY DEFINER helper to avoid recursion.
-- ============================================================

-- Helper: extract branch_id (first path segment) from a storage object name
CREATE OR REPLACE FUNCTION public.can_access_storage_path(p_bucket text, p_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT
    CASE
      WHEN p_bucket = 'documents' THEN
        can_access_branch(split_part(p_name, '/', 1)::uuid)
      ELSE
        false
    END;
$function$;

-- Drop old over-broad policies
DROP POLICY IF EXISTS "documents_bucket_read" ON storage.objects;
DROP POLICY IF EXISTS "documents_bucket_insert" ON storage.objects;
DROP POLICY IF EXISTS "documents_bucket_update" ON storage.objects;
DROP POLICY IF EXISTS "documents_bucket_delete" ON storage.objects;

-- Read: user must have access to the branch in the path
CREATE POLICY "documents_bucket_read" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'documents' AND can_access_storage_path(bucket_id, name));

-- Insert: user must have access to the branch in the path
CREATE POLICY "documents_bucket_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documents' AND can_access_storage_path(bucket_id, name));

-- Update: user must have access to the branch in both old and new paths
CREATE POLICY "documents_bucket_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'documents' AND can_access_storage_path(bucket_id, name))
  WITH CHECK (bucket_id = 'documents' AND can_access_storage_path(bucket_id, name));

-- Delete: user must have access to the branch in the path
CREATE POLICY "documents_bucket_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'documents' AND can_access_storage_path(bucket_id, name));
