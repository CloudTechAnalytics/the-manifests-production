/*
# Organizations: multi-tenancy foundation

## Problem
The app is single-tenant: one company with branches. Security rests on
  can_access_branch(id) -> is_admin() OR get_user_branch_id() = id
so `admin` sees EVERY row in the database. To host several freight
companies on one platform, each company's data must be invisible to the
others, and `admin` must stop meaning "sees everything".

## Approach — why only two tables gain organization_id
Every tenant-scoped table already carries branch_id and gates on
can_access_branch(). Branches belong to exactly one organization, so a
row's organization is derivable from its branch. Rather than add
organization_id to 15 tables and rewrite 91 policies (15 chances to miss
one and leak a tenant), organization_id lands on `branches` and
`profiles` only, and can_access_branch() is redefined to check the
organization FIRST. Every existing policy that calls it inherits tenant
isolation without being touched.

The child tables that lack branch_id (quotation_items,
customer_contacts, payment_allocations, shipment_timeline) gate via an
EXISTS on their parent, so they inherit it too. user_preferences is
keyed on auth.uid() = user_id and can never cross tenants.

## Two leaks this closes
- `select_branches_authenticated` allowed ANY authenticated user to read
  EVERY branch (it was only `deleted_at IS NULL`), which across tenants
  exposes the customer list of the platform.
- `select_all_profiles_admin` allowed an admin to read EVERY profile,
  which across tenants exposes other companies' staff.

## Backfill
All existing branches and profiles are adopted into one organization so
current data keeps working unchanged. platform_admins sit above every
organization and therefore have organization_id NULL — which is why that
column stays nullable on profiles while being NOT NULL on branches.

## After applying
Nobody is a platform_admin yet, so nobody can create organizations.
Promote yourself once, by email:

  UPDATE profiles
     SET role = 'platform_admin', organization_id = NULL
   WHERE email = 'you@example.com';
*/

-- ============================================================
-- ORGANIZATIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  address text,
  city text,
  country text,
  phone text,
  email text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TENANCY COLUMNS
-- ============================================================

ALTER TABLE branches ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;

-- Nullable by design: a platform_admin belongs to no single organization.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE RESTRICT;

-- ============================================================
-- BACKFILL — adopt all existing data into one organization
-- ============================================================

DO $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Only seed when there is existing data and no organization yet, so
  -- re-running this migration can never mint a second default org.
  IF NOT EXISTS (SELECT 1 FROM organizations) THEN
    IF EXISTS (SELECT 1 FROM branches) OR EXISTS (SELECT 1 FROM profiles) THEN
      INSERT INTO organizations (name, slug, country)
      VALUES ('The Manifest', 'the-manifest', 'Nigeria')
      RETURNING id INTO v_org_id;

      UPDATE branches SET organization_id = v_org_id WHERE organization_id IS NULL;
      UPDATE profiles SET organization_id = v_org_id WHERE organization_id IS NULL;
    END IF;
  END IF;
END $$;

-- Every branch must belong to exactly one tenant. Enforced only once the
-- backfill above has run, so no existing row can be orphaned.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM branches WHERE organization_id IS NULL) THEN
    ALTER TABLE branches ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'platform_admin'
      AND is_active = true
      AND deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT organization_id FROM profiles WHERE id = auth.uid(); $$;

CREATE OR REPLACE FUNCTION can_access_org(p_org_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$ SELECT is_platform_admin() OR (p_org_id IS NOT NULL AND get_user_org_id() = p_org_id); $$;

/*
The keystone. Organization is checked BEFORE the existing admin/branch
logic, which is what narrows `admin` from "sees everything" to "manages
everything in its own organization". Every policy already calling this
function becomes tenant-safe with no edit.
*/
CREATE OR REPLACE FUNCTION can_access_branch(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT is_platform_admin()
      OR EXISTS (
        SELECT 1
        FROM branches b
        WHERE b.id = p_branch_id
          AND b.organization_id = get_user_org_id()
          AND (is_admin() OR get_user_branch_id() = p_branch_id)
      );
$$;

-- ============================================================
-- ORGANIZATIONS RLS
-- ============================================================

DROP POLICY IF EXISTS "select_organizations" ON organizations;
CREATE POLICY "select_organizations" ON organizations FOR SELECT
  TO authenticated USING (
    deleted_at IS NULL AND (is_platform_admin() OR id = get_user_org_id())
  );

-- Only the platform operator may create/modify/remove tenants.
DROP POLICY IF EXISTS "insert_organizations_platform" ON organizations;
CREATE POLICY "insert_organizations_platform" ON organizations FOR INSERT
  TO authenticated WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS "update_organizations_platform" ON organizations;
CREATE POLICY "update_organizations_platform" ON organizations FOR UPDATE
  TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS "delete_organizations_platform" ON organizations;
CREATE POLICY "delete_organizations_platform" ON organizations FOR DELETE
  TO authenticated USING (is_platform_admin());

-- ============================================================
-- LEAK #1 — branches were readable by every authenticated user
-- ============================================================

DROP POLICY IF EXISTS "select_branches_authenticated" ON branches;
CREATE POLICY "select_branches_authenticated" ON branches FOR SELECT
  TO authenticated USING (
    deleted_at IS NULL AND can_access_org(organization_id)
  );

-- ============================================================
-- LEAK #2 — an admin could read/update every profile on the platform
-- ============================================================

DROP POLICY IF EXISTS "select_all_profiles_admin" ON profiles;
CREATE POLICY "select_all_profiles_admin" ON profiles FOR SELECT
  TO authenticated USING (
    is_platform_admin()
    OR (is_admin() AND organization_id = get_user_org_id())
  );

DROP POLICY IF EXISTS "update_all_profiles_admin" ON profiles;
CREATE POLICY "update_all_profiles_admin" ON profiles FOR UPDATE
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

CREATE INDEX IF NOT EXISTS idx_branches_organization_id
  ON branches(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id
  ON profiles(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_slug
  ON organizations(slug) WHERE deleted_at IS NULL;
