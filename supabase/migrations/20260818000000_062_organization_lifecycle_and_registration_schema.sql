/*
# Self-service registration: organization lifecycle, departments, tokens, consent

## Why
Today an organization is just `is_active boolean` plus a separate, unrelated
`org_subscriptions.status`. Self-service registration needs a real lifecycle
(a freshly registered org is neither "active" nor genuinely "inactive" — it's
`pending_verification`) and a few new tables to support it: a hash-only email
verification token (mirroring `invitations`' proven design), a ToS/Privacy
consent record, and a configurable `departments` list.

## Backfill safety
`organizations.status`/`origin` are backfilled from existing data so every
current row lands in a sensible state — nothing existing changes behavior.
`is_active` keeps its current meaning untouched; `status` is additive.

## Departments are a label, not a security boundary
`departments` and `profiles.department_id` exist purely for org-chart
grouping/assignment. No RLS policy anywhere reads them, and RBAC continues to
run entirely on `role` + `branch_id` exactly as it does today — this cannot
introduce a tenant-isolation regression.

## email_verification_tokens has zero SELECT policies, on purpose
Same reasoning as `invitations.token_hash`: only the SHA-256 is stored, and
even that hash is never client-readable. All reads/writes happen through the
service-role client inside the register/verify/resend edge functions.
*/

-- ============================================================
-- ORGANIZATIONS: lifecycle + registration intake fields
-- ============================================================

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS origin text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS business_type text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS registration_number text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS expected_users integer;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS expected_monthly_shipments integer;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS referral_source text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Backfill status from the two signals that exist today, then lock the
-- column down with NOT NULL + CHECK. Order matters: suspended (is_active
-- false) wins over whatever the subscription says, since an operator
-- explicitly turning an org off should never be silently overridden by a
-- stale subscription row.
UPDATE organizations o SET status = CASE
  WHEN o.is_active = false THEN 'suspended'
  WHEN EXISTS (
    SELECT 1 FROM org_subscriptions s
    WHERE s.organization_id = o.id AND s.status = 'cancelled'
  ) THEN 'cancelled'
  WHEN EXISTS (
    SELECT 1 FROM org_subscriptions s
    WHERE s.organization_id = o.id AND s.status = 'trial'
  ) THEN 'active_trial'
  ELSE 'active_subscription'
END
WHERE o.status IS NULL;

ALTER TABLE organizations ALTER COLUMN status SET DEFAULT 'pending_verification';
ALTER TABLE organizations ALTER COLUMN status SET NOT NULL;
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_status_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_status_check CHECK (
  status IN ('pending_verification', 'active_trial', 'active_subscription', 'trial_expired', 'suspended', 'cancelled')
);

-- Every pre-existing organization was created by hand through the platform
-- console, except the one seed org from migration 014's backfill, which
-- predates any organization existing and is the platform operator's own
-- workspace, not a customer's.
UPDATE organizations SET origin = CASE WHEN slug = 'the-manifest' THEN 'internal' ELSE 'platform_admin' END
WHERE origin IS NULL;

ALTER TABLE organizations ALTER COLUMN origin SET DEFAULT 'platform_admin';
ALTER TABLE organizations ALTER COLUMN origin SET NOT NULL;
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_origin_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_origin_check CHECK (
  origin IN ('self_service', 'platform_admin', 'demo', 'internal')
);

-- Duplicate protection: a business email or registration number can belong
-- to at most one live organization. Name is deliberately NOT made unique —
-- two unrelated companies can share a name; that case is handled as a soft,
-- non-blocking warning at the application layer instead.
DROP INDEX IF EXISTS idx_organizations_email_unique;
CREATE UNIQUE INDEX idx_organizations_email_unique
  ON organizations (lower(email))
  WHERE deleted_at IS NULL AND email IS NOT NULL;

DROP INDEX IF EXISTS idx_organizations_registration_number_unique;
CREATE UNIQUE INDEX idx_organizations_registration_number_unique
  ON organizations (lower(registration_number))
  WHERE deleted_at IS NULL AND registration_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status) WHERE deleted_at IS NULL;

-- ============================================================
-- DEPARTMENTS — configurable, org-scoped, label-only
-- ============================================================

CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  -- Where a matching operational role exists (e.g. "Sales" <-> role 'sales'),
  -- linking it lets the UI suggest a sensible role when assigning a user to
  -- this department. It is a suggestion only — never read by RLS/RBAC.
  linked_role user_role,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

DROP INDEX IF EXISTS idx_departments_org_name_unique;
CREATE UNIQUE INDEX idx_departments_org_name_unique
  ON departments (organization_id, lower(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_departments_organization_id
  ON departments(organization_id) WHERE deleted_at IS NULL;

-- Same shape as branches: any org member can read them (needed for
-- dropdowns), only that org's own admin or the platform operator writes.
DROP POLICY IF EXISTS "select_departments" ON departments;
CREATE POLICY "select_departments" ON departments FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_org(organization_id));

DROP POLICY IF EXISTS "insert_departments_admin" ON departments;
CREATE POLICY "insert_departments_admin" ON departments FOR INSERT
  TO authenticated WITH CHECK (
    is_platform_admin() OR (is_admin() AND organization_id = get_user_org_id())
  );

DROP POLICY IF EXISTS "update_departments_admin" ON departments;
CREATE POLICY "update_departments_admin" ON departments FOR UPDATE
  TO authenticated
  USING (is_platform_admin() OR (is_admin() AND organization_id = get_user_org_id()))
  WITH CHECK (is_platform_admin() OR (is_admin() AND organization_id = get_user_org_id()));

DO $$ BEGIN
  CREATE TRIGGER trigger_departments_updated_at
    BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- profiles.department_id: a label/assignment column only. No RLS policy
-- anywhere reads it — access control stays entirely on role + branch_id.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department_id uuid
  REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_department_id
  ON profiles(department_id) WHERE deleted_at IS NULL;

-- profiles.phone: the registration wizard's "Create Organization Owner"
-- step collects a personal contact number for the owner, which no existing
-- column carries (organizations.phone is the business line, not a person's).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;

-- invitations.department_id: "Invite Team Members" (spec section 10) asks
-- for Name/Email/Role/Department/Branch. Label-only, same as
-- profiles.department_id — never read by RLS.
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS department_id uuid
  REFERENCES departments(id) ON DELETE SET NULL;

-- ============================================================
-- EMAIL VERIFICATION TOKENS — hash-only, service-role only
-- ============================================================

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS enabled with deliberately NO policies: not even the owning user can
-- read their own row through PostgREST. All access is via the service-role
-- client inside register-organization / verify-email / resend-verification.
ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id
  ON email_verification_tokens(user_id) WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token_hash
  ON email_verification_tokens(token_hash) WHERE consumed_at IS NULL;

-- ============================================================
-- CONSENT RECORDS — ToS / Privacy acceptance, audit-only
-- ============================================================

CREATE TABLE IF NOT EXISTS consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

-- Readable for audit purposes by the platform operator or that org's own
-- admin; writable only by the service role (registration edge function) so
-- accepted_at/ip_address can never be forged from the browser.
DROP POLICY IF EXISTS "select_consent_records" ON consent_records;
CREATE POLICY "select_consent_records" ON consent_records FOR SELECT
  TO authenticated USING (
    is_platform_admin() OR (is_admin() AND organization_id = get_user_org_id())
  );

CREATE INDEX IF NOT EXISTS idx_consent_records_organization_id
  ON consent_records(organization_id);
