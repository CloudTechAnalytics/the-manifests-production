/*
# Organization logos

Adds `organizations.logo_url` and a storage bucket to hold the images.

## Why a public bucket
A logo is not sensitive and is rendered as a plain <img> in the sidebar,
on the org detail page, and anywhere an org is shown. A public bucket
gives a stable URL that needs no signing, so the mark renders without an
authenticated request. Files are keyed by organization id
(`org-logos/<org_id>/<file>`).

## Who can change a logo
Writes are restricted to platform_admin (the console is where orgs are
managed). Reads are public, as befits a logo. If org admins should later
manage their own logo, add a policy allowing writes where the path's
first segment equals the caller's own organization_id.
*/

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('org-logos', 'org-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read: logos are shown wherever an organization appears.
DROP POLICY IF EXISTS "org_logos_read" ON storage.objects;
CREATE POLICY "org_logos_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'org-logos');

-- Only the platform operator may upload / replace / remove a logo.
DROP POLICY IF EXISTS "org_logos_insert" ON storage.objects;
CREATE POLICY "org_logos_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'org-logos' AND is_platform_admin());

DROP POLICY IF EXISTS "org_logos_update" ON storage.objects;
CREATE POLICY "org_logos_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'org-logos' AND is_platform_admin())
WITH CHECK (bucket_id = 'org-logos' AND is_platform_admin());

DROP POLICY IF EXISTS "org_logos_delete" ON storage.objects;
CREATE POLICY "org_logos_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'org-logos' AND is_platform_admin());
