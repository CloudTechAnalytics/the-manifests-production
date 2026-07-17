/*
# Invitations

Backs the "Invite an admin" / invite-user flow: an invite is created for
an email address, a link is emailed via Resend, and the recipient sets
their own password to join the organization with the role they were
given.

## Why a token HASH and not the token
Only the SHA-256 of the invite token is stored. The raw token exists in
exactly one place — the emailed link. RLS is row-level, not column-level,
so any admin permitted to list their organization's invites would
otherwise be able to read a raw token and accept an invitation intended
for someone else. Storing the hash makes read access to this table
useless for impersonation: acceptance is handled by an edge function
that hashes the incoming token and looks it up.

## Who may invite
- platform_admin: any organization (this is how an org gets its first admin)
- admin:          its own organization only, and never above its own rank
                  (the rank rule is enforced in the edge function, since
                  RLS cannot compare against the row being inserted's
                  invoker rank cleanly)

## Lifecycle
pending -> accepted (accepted_at set) | expired (expires_at passed) |
revoked (deleted_at set). A partial unique index keeps at most one live
invite per email per organization, so re-inviting is idempotent rather
than producing duplicates.
*/

CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  email text NOT NULL,
  full_name text,
  role user_role NOT NULL,
  token_hash text NOT NULL UNIQUE,
  invited_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- A platform_admin is never scoped to one organization, so an invite for
-- the platform_admin role would have no organization to belong to.
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_role_not_platform;
ALTER TABLE invitations ADD CONSTRAINT invitations_role_not_platform
  CHECK (role <> 'platform_admin');

-- At most one live (unaccepted, unrevoked) invite per email per org.
DROP INDEX IF EXISTS idx_invitations_live_unique;
CREATE UNIQUE INDEX idx_invitations_live_unique
  ON invitations (organization_id, lower(email))
  WHERE accepted_at IS NULL AND deleted_at IS NULL;

-- ============================================================
-- RLS
-- ============================================================

DROP POLICY IF EXISTS "select_invitations" ON invitations;
CREATE POLICY "select_invitations" ON invitations FOR SELECT
  TO authenticated USING (
    deleted_at IS NULL
    AND (
      is_platform_admin()
      OR (is_admin() AND organization_id = get_user_org_id())
    )
  );

DROP POLICY IF EXISTS "insert_invitations" ON invitations;
CREATE POLICY "insert_invitations" ON invitations FOR INSERT
  TO authenticated WITH CHECK (
    is_platform_admin()
    OR (is_admin() AND organization_id = get_user_org_id())
  );

-- Revoking is a soft delete via UPDATE.
DROP POLICY IF EXISTS "update_invitations" ON invitations;
CREATE POLICY "update_invitations" ON invitations FOR UPDATE
  TO authenticated
  USING (
    is_platform_admin()
    OR (is_admin() AND organization_id = get_user_org_id())
  )
  WITH CHECK (
    is_platform_admin()
    OR (is_admin() AND organization_id = get_user_org_id())
  );

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_invitations_organization_id
  ON invitations(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invitations_token_hash
  ON invitations(token_hash) WHERE deleted_at IS NULL AND accepted_at IS NULL;
