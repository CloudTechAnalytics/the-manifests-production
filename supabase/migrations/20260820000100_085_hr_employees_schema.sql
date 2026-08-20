/*
# HR & People Capacity — Phase 1: employees + sensitive info

## Design
`employees` is the canonical HR entity — separate from `profiles`, not
a replacement for it. `profile_id` is nullable on purpose: a real
freight-forwarding company has drivers, warehouse staff, and other
people it needs to track in HR who never need (or get) a Manifest
login. When set, the linked profile's system role/branch/permissions
are shown on the employee's "Manifest Access" tab; when null, that tab
is simply empty — never a broken or fabricated section.

`organization_id NOT NULL` directly on `employees` is a deliberate,
documented exception to this schema's usual "tenancy flows through
branch_id" rule (migration 014): the exception applies to any table
whose branch_id can itself be NULL (an org-wide row), exactly like an
org-wide admin has branch_id IS NULL today. An HR Administrator or a
company-wide executive is exactly such a row.

`branch_id` and `department_id` are both nullable and, per migration
062's own invariant, `department_id` remains a label only — nothing in
this migration's RLS reads it. Real access scoping runs on
organization_id/branch_id plus the new can_manage_hr()/
can_view_hr_sensitive() helpers, and on manager_id (self-FK) for the
"Department Manager sees their direct reports" tier — not on
department membership, which this codebase has never treated as a
security boundary.

## Sensitive data isolation
There is no column-level RLS in Postgres, and migration 078 already
rejected the column-GRANT approach for exactly that reason. Salary,
bank details, tax id, emergency contact, and private notes live in a
separate 1:1 `employee_sensitive_info` table with its own RLS, gated by
can_view_hr_sensitive() — which deliberately excludes hr_officer. This
is the same "child table gates via EXISTS on parent" shape already used
elsewhere in this schema.

## Avoiding the migration-005 recursion bug
"Is this the employee's manager" cannot be an inline subquery inside
employees' own RLS policy (profiles hit exactly this infinite-recursion
bug once already). can_view_employee() is SECURITY DEFINER, so its
internal query bypasses RLS the same way is_admin()/has_role() do.
*/

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE employment_type AS ENUM ('full_time', 'part_time', 'contract', 'intern', 'temporary');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE employment_status AS ENUM ('active', 'on_leave', 'suspended', 'terminated', 'resigned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- EMPLOYEES
-- ============================================================

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  profile_id uuid UNIQUE REFERENCES profiles(id) ON DELETE SET NULL,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  employee_number text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  personal_email text,
  personal_phone text,
  date_of_birth date,
  gender text,
  address text,
  job_title text NOT NULL,
  employment_type employment_type NOT NULL DEFAULT 'full_time',
  employment_status employment_status NOT NULL DEFAULT 'active',
  work_location text,
  hire_date date NOT NULL DEFAULT CURRENT_DATE,
  confirmation_date date,
  contract_end_date date,
  termination_date date,
  termination_reason text,
  notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

DROP INDEX IF EXISTS idx_employees_org_employee_number_unique;
CREATE UNIQUE INDEX idx_employees_org_employee_number_unique
  ON employees (organization_id, employee_number)
  WHERE deleted_at IS NULL;

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_employees_organization_id ON employees(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_employees_branch_id ON employees(branch_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_employees_department_id ON employees(department_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_employees_manager_id ON employees(manager_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_employees_org_created ON employees(organization_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_employees_branch_created ON employees(branch_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_employees_org_status ON employees(organization_id, employment_status) WHERE deleted_at IS NULL;

-- ============================================================
-- EMPLOYEE_SENSITIVE_INFO — 1:1, isolated on purpose
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_sensitive_info (
  employee_id uuid PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  salary_amount numeric(14,2),
  salary_currency text NOT NULL DEFAULT 'NGN',
  pay_frequency text,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  tax_id text,
  national_id_number text,
  emergency_contact_name text,
  emergency_contact_relationship text,
  emergency_contact_phone text,
  private_notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employee_sensitive_info ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION can_manage_hr(p_target_org_id uuid, p_target_branch_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT is_platform_admin()
    OR (
      (has_role('admin') OR has_role('hr_manager') OR has_role('hr_officer'))
      AND p_target_org_id = get_user_org_id()
      AND (get_user_branch_id() IS NULL OR get_user_branch_id() = p_target_branch_id)
    );
$$;

-- hr_officer is deliberately excluded here — "operational HR admin,
-- restricted sensitive information" per spec. admin/hr_manager only.
CREATE OR REPLACE FUNCTION can_view_hr_sensitive(p_target_org_id uuid, p_target_branch_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT is_platform_admin()
    OR (
      (has_role('admin') OR has_role('hr_manager'))
      AND p_target_org_id = get_user_org_id()
      AND (get_user_branch_id() IS NULL OR get_user_branch_id() = p_target_branch_id)
    );
$$;

-- Read-visibility for a single employee row: HR staff (via
-- can_manage_hr), the employee's own linked profile, or their direct
-- manager (one level — "direct reports only" for Phase 1). SECURITY
-- DEFINER specifically so this can be used inside employees' own SELECT
-- policy without the self-referential recursion bug migration 005 hit.
CREATE OR REPLACE FUNCTION can_view_employee(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = p_employee_id AND e.deleted_at IS NULL
      AND (
        can_manage_hr(e.organization_id, e.branch_id)
        OR e.profile_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM employees mgr
          WHERE mgr.id = e.manager_id AND mgr.profile_id = auth.uid()
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION can_manage_hr(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_view_hr_sensitive(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION can_view_employee(uuid) TO authenticated;

-- ============================================================
-- RLS POLICIES — employees
-- ============================================================

DROP POLICY IF EXISTS "select_employees_scoped" ON employees;
CREATE POLICY "select_employees_scoped" ON employees FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_view_employee(id));

DROP POLICY IF EXISTS "insert_employees_hr" ON employees;
CREATE POLICY "insert_employees_hr" ON employees FOR INSERT
  TO authenticated WITH CHECK (can_manage_hr(organization_id, branch_id));

-- Phase 1 scope: employee/manager self-edit is not enabled yet (avoids
-- needing a self-escalation guard trigger this early). UPDATE is
-- HR-staff-only for now.
DROP POLICY IF EXISTS "update_employees_hr" ON employees;
CREATE POLICY "update_employees_hr" ON employees FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_manage_hr(organization_id, branch_id))
  WITH CHECK (can_manage_hr(organization_id, branch_id));

DROP POLICY IF EXISTS "delete_employees_hr" ON employees;
CREATE POLICY "delete_employees_hr" ON employees FOR DELETE
  TO authenticated USING (can_manage_hr(organization_id, branch_id));

-- ============================================================
-- RLS POLICIES — employee_sensitive_info
-- ============================================================

DROP POLICY IF EXISTS "select_employee_sensitive_scoped" ON employee_sensitive_info;
CREATE POLICY "select_employee_sensitive_scoped" ON employee_sensitive_info FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM employees e WHERE e.id = employee_id
        AND (can_view_hr_sensitive(e.organization_id, e.branch_id) OR e.profile_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "insert_employee_sensitive_hr" ON employee_sensitive_info;
CREATE POLICY "insert_employee_sensitive_hr" ON employee_sensitive_info FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_id AND can_view_hr_sensitive(e.organization_id, e.branch_id))
  );

DROP POLICY IF EXISTS "update_employee_sensitive_hr" ON employee_sensitive_info;
CREATE POLICY "update_employee_sensitive_hr" ON employee_sensitive_info FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_id AND can_view_hr_sensitive(e.organization_id, e.branch_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_id AND can_view_hr_sensitive(e.organization_id, e.branch_id)));

DROP POLICY IF EXISTS "delete_employee_sensitive_hr" ON employee_sensitive_info;
CREATE POLICY "delete_employee_sensitive_hr" ON employee_sensitive_info FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_id AND can_view_hr_sensitive(e.organization_id, e.branch_id))
  );

-- ============================================================
-- TRIGGERS
-- ============================================================

DO $$ BEGIN
  CREATE TRIGGER trigger_employees_updated_at
    BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_employee_sensitive_info_updated_at
    BEFORE UPDATE ON employee_sensitive_info
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
