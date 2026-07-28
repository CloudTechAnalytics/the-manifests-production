/*
# Let activities log platform-level actions, not just tenant ones

## Problem
activities.branch_id is NOT NULL, so a platform_admin action with no
branch — creating an organization, defining a plan, assigning a
subscription — cannot be logged at all. The audit trail on the Platform
Console has been silent for every org-lifecycle and billing action.

## Fix
branch_id becomes nullable, and a direct organization_id column is
added so any row — platform-level or tenant-level — can declare which
organization it's about without depending on a branch to exist.
Tenant-originated rows keep working exactly as before: they still set
branch_id, and /platform/audit-logs still resolves their organization
via branch -> organization the way it already does. Only new
platform-level inserts need to set organization_id directly, since they
have no branch to derive it from.

select_activities_platform_admin (USING is_platform_admin()) doesn't
reference branch_id at all, so no RLS changes are needed here.
*/

ALTER TABLE activities ALTER COLUMN branch_id DROP NOT NULL;

ALTER TABLE activities ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_activities_organization_id ON activities(organization_id);
