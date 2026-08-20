/*
# HR & People Capacity — Phase 1: employee_responsibilities

## Why
Spec section 13 — one person can perform multiple functions (e.g.
primary Operations Officer, secondary Documentation + Customer
Follow-up) without the company needing to create duplicate employee
records. `linked_role` is what the Phase 1 capacity engine (migration
087) joins on to pull each person's real workload from every role they
actually cover, not just their primary one.

`department_id` here is the same label-only column as everywhere else
in this schema (migration 062's invariant) — never read by RLS.
*/

CREATE TABLE IF NOT EXISTS employee_responsibilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  role_title text NOT NULL,
  linked_role user_role,
  is_primary boolean NOT NULL DEFAULT false,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE employee_responsibilities ENABLE ROW LEVEL SECURITY;

-- At most one primary responsibility per employee at a time.
DROP INDEX IF EXISTS idx_employee_responsibilities_one_primary;
CREATE UNIQUE INDEX idx_employee_responsibilities_one_primary
  ON employee_responsibilities(employee_id)
  WHERE is_primary AND deleted_at IS NULL AND end_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_employee_responsibilities_employee_id
  ON employee_responsibilities(employee_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_employee_responsibilities_linked_role
  ON employee_responsibilities(linked_role) WHERE deleted_at IS NULL AND end_date IS NULL;

DROP POLICY IF EXISTS "select_employee_responsibilities_scoped" ON employee_responsibilities;
CREATE POLICY "select_employee_responsibilities_scoped" ON employee_responsibilities FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_view_employee(employee_id));

DROP POLICY IF EXISTS "insert_employee_responsibilities_hr" ON employee_responsibilities;
CREATE POLICY "insert_employee_responsibilities_hr" ON employee_responsibilities FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_id AND can_manage_hr(e.organization_id, e.branch_id))
  );

DROP POLICY IF EXISTS "update_employee_responsibilities_hr" ON employee_responsibilities;
CREATE POLICY "update_employee_responsibilities_hr" ON employee_responsibilities FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_id AND can_manage_hr(e.organization_id, e.branch_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_id AND can_manage_hr(e.organization_id, e.branch_id)));

DROP POLICY IF EXISTS "delete_employee_responsibilities_hr" ON employee_responsibilities;
CREATE POLICY "delete_employee_responsibilities_hr" ON employee_responsibilities FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_id AND can_manage_hr(e.organization_id, e.branch_id))
  );

DO $$ BEGIN
  CREATE TRIGGER trigger_employee_responsibilities_updated_at
    BEFORE UPDATE ON employee_responsibilities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
