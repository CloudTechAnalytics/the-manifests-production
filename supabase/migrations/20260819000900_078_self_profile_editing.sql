/*
# Self profile editing: avatar + title, and closing a self-escalation gap

## What this adds
`profiles.title` (free-text job title, e.g. "Founder & CEO" — display only,
never read by RLS/RBAC, same category as department_id) and
`profiles.avatar_url`, plus an `avatars` storage bucket so a user can
upload their own photo. Mirrors the existing org-logos bucket (migration
021) exactly, except scoped per-user instead of platform_admin-only: a
user may only write to the path under their own auth.uid().

## A pre-existing gap this closes
Migration 007 tightened `update_own_profile`'s RLS docstring to say "users
can only update their own full_name" — but RLS policies are row-scoped,
not column-scoped, so the actual USING/WITH CHECK clause
(`id = auth.uid() AND deleted_at IS NULL`) never restricted *which*
columns a self-update could touch, and no trigger enforced it either. In
practice this means any authenticated user could currently call
`profiles.update({ role: 'platform_admin' })` (or organization_id,
is_active, deleted_at, email) on their own row directly via the REST API,
bypassing the app UI entirely — a real privilege-escalation and tenant-
isolation gap. app/(app)/users/page.tsx's own edit-self logic already
tries to prevent this client-side (`role: isEditingSelf ? editTarget.role
: primaryRole`), confirming this was always the intended behavior, just
never backed by the database.

Fixed with a trigger rather than column-level GRANTs: a column GRANT
applies to the `authenticated` role as a whole, which would also block
an admin from changing *someone else's* role/branch/org through the
separate update_all_profiles_admin policy — GRANTs can't be conditional
on which row is being touched, but a trigger can compare OLD vs NEW and
apply the restriction only when auth.uid() = OLD.id (a self-edit).

Deliberately NOT protected: `must_change_password` (change-password/page.tsx
already self-clears this after a forced reset — blocking it would break
that flow, and it's a workflow flag, not a privilege) and `branch_id`/
`department_id` (users/page.tsx already lets a self-edit change its own
branch_id with no guard — that's existing intended behavior, not a
security-sensitive field, so left as-is here to avoid regressing it).
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Public read: an avatar renders as a plain <img> anywhere a user is
-- shown (sidebar, user menu, Users list) — same reasoning as org-logos.
DROP POLICY IF EXISTS "avatars_read" ON storage.objects;
CREATE POLICY "avatars_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Writes restricted to the file's own path prefix matching the caller's
-- own id — files are keyed <user_id>/<file>, so this can never touch
-- another user's avatar.
DROP POLICY IF EXISTS "avatars_insert" ON storage.objects;
CREATE POLICY "avatars_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
CREATE POLICY "avatars_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_delete" ON storage.objects;
CREATE POLICY "avatars_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE OR REPLACE FUNCTION prevent_profile_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() = OLD.id THEN
    IF NEW.role IS DISTINCT FROM OLD.role
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.is_active IS DISTINCT FROM OLD.is_active
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
      OR NEW.email IS DISTINCT FROM OLD.email
    THEN
      RAISE EXCEPTION 'You cannot change this field on your own profile — ask another admin.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_prevent_profile_self_escalation ON profiles;
CREATE TRIGGER trigger_prevent_profile_self_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_profile_self_escalation();
