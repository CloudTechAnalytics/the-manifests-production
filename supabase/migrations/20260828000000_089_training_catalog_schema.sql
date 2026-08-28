/*
# Training & Learning — courses, materials, and employee training records

## Why courses are org-scoped, not branch-scoped
Unlike almost every operational table in this schema, a course isn't
tied to one branch — Lagos and Kano staff both take the same "Customs
Declaration Basics" course. So `courses` has `organization_id NOT NULL`
directly (the same documented exception migration 085 already used for
`employees` — a table whose natural scope is org-wide gets a direct
organization_id column instead of the usual branch_id-only tenancy).

## target_roles is a recommendation signal, not a visibility filter
Confirmed with the user: every employee can browse every course in
their org's catalog. target_roles (a user_role[]) only drives a
"Recommended for you" badge client-side — RLS never reads it.

## course_materials is a dedicated table, not a documents row
documents.branch_id is NOT NULL and its storage RLS
(can_access_storage_path, migration 007) hard-parses the first path
segment as a branch_id via can_access_branch(). Course materials have
no branch to put there — forcing one would misrepresent an org-wide
resource. Materials get their own table + a dedicated storage bucket
(migration 090), reusing nothing from documents except the general
upload-then-insert-then-cleanup-on-failure pattern.

## employee_training: no stored 'overdue', no hard unique constraint
Confirmed "live status only" — status is always one of
not_started/in_progress/completed; overdue/due-soon is computed at
query time from due_date, never stored, so there's no scheduled job
this depends on. Multiple historical rows per (employee_id, course_id)
are allowed on purpose, for recertification/retake tracking — a
PARTIAL unique index blocks two simultaneously-*open* rows for the same
person+course, not a full unique constraint. "Current status" anywhere
in the app is DISTINCT ON (employee_id, course_id) ORDER BY created_at
DESC.

## The guard trigger, not column-level RLS
Same reasoning as migration 078's prevent_profile_self_escalation():
Postgres has no column-level RLS, so a self-update (mark my own
progress) and an HR-update (change due date, reassign) share one
UPDATE policy — the trigger is what actually restricts which columns a
non-HR self-update may touch, and it's also where started_at/
completed_at/certificate_expiry_date are server-computed, never
trusted from the client.
*/

-- ============================================================
-- COURSES
-- ============================================================

CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text,
  category text,
  target_roles user_role[] NOT NULL DEFAULT '{}',
  provider text,
  estimated_duration_minutes integer,
  is_certification boolean NOT NULL DEFAULT false,
  certification_validity_months integer,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT courses_certification_validity_required CHECK (
    NOT is_certification OR certification_validity_months IS NOT NULL
  )
);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_courses_organization_id ON courses(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_courses_target_roles ON courses USING gin(target_roles);
CREATE INDEX IF NOT EXISTS idx_courses_org_active ON courses(organization_id, is_active) WHERE deleted_at IS NULL;

-- Org-only management check (courses aren't branch-scoped) — mirrors
-- the departments admin-write pattern (migration 062), extended to the
-- two HR roles.
CREATE OR REPLACE FUNCTION can_manage_training_catalog(p_target_org_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT is_platform_admin()
    OR (
      (is_admin() OR has_role('hr_manager') OR has_role('hr_officer'))
      AND p_target_org_id = get_user_org_id()
    );
$$;

GRANT EXECUTE ON FUNCTION can_manage_training_catalog(uuid) TO authenticated;

-- Catalog browsing is open to every org member — self-service learning
-- means every employee can see every course, not just ones HR assigned.
DROP POLICY IF EXISTS "select_courses_org" ON courses;
CREATE POLICY "select_courses_org" ON courses FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_org(organization_id));

DROP POLICY IF EXISTS "insert_courses_hr" ON courses;
CREATE POLICY "insert_courses_hr" ON courses FOR INSERT
  TO authenticated WITH CHECK (can_manage_training_catalog(organization_id));

DROP POLICY IF EXISTS "update_courses_hr" ON courses;
CREATE POLICY "update_courses_hr" ON courses FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_manage_training_catalog(organization_id))
  WITH CHECK (can_manage_training_catalog(organization_id));

DROP POLICY IF EXISTS "delete_courses_hr" ON courses;
CREATE POLICY "delete_courses_hr" ON courses FOR DELETE
  TO authenticated USING (can_manage_training_catalog(organization_id));

DO $$ BEGIN
  CREATE TRIGGER trigger_courses_updated_at
    BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- COURSE_MATERIALS
-- ============================================================

CREATE TABLE IF NOT EXISTS course_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  material_type text NOT NULL CHECK (material_type IN ('file', 'link')),
  title text NOT NULL,
  external_url text,
  file_path text,
  file_size bigint,
  mime_type text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_materials_type_shape CHECK (
    (material_type = 'file' AND file_path IS NOT NULL AND external_url IS NULL)
    OR (material_type = 'link' AND external_url IS NOT NULL AND file_path IS NULL)
  )
);

ALTER TABLE course_materials ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_course_materials_course_id ON course_materials(course_id);

DROP POLICY IF EXISTS "select_course_materials_org" ON course_materials;
CREATE POLICY "select_course_materials_org" ON course_materials FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = course_id AND c.deleted_at IS NULL AND can_access_org(c.organization_id))
  );

DROP POLICY IF EXISTS "insert_course_materials_hr" ON course_materials;
CREATE POLICY "insert_course_materials_hr" ON course_materials FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = course_id AND can_manage_training_catalog(c.organization_id))
  );

DROP POLICY IF EXISTS "update_course_materials_hr" ON course_materials;
CREATE POLICY "update_course_materials_hr" ON course_materials FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM courses c WHERE c.id = course_id AND can_manage_training_catalog(c.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM courses c WHERE c.id = course_id AND can_manage_training_catalog(c.organization_id)));

DROP POLICY IF EXISTS "delete_course_materials_hr" ON course_materials;
CREATE POLICY "delete_course_materials_hr" ON course_materials FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = course_id AND can_manage_training_catalog(c.organization_id))
  );

-- ============================================================
-- EMPLOYEE_TRAINING
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_training (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  assignment_batch_id uuid,
  due_date date,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  started_at timestamptz,
  completed_at timestamptz,
  certificate_expiry_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employee_training ENABLE ROW LEVEL SECURITY;

-- Blocks two simultaneously-open records for the same person+course;
-- a fresh row is still allowed once a prior one is 'completed'
-- (recertification/retake), which is exactly what this being PARTIAL
-- (not a full unique constraint) is for.
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_training_one_active_per_course
  ON employee_training(employee_id, course_id) WHERE status <> 'completed';

CREATE INDEX IF NOT EXISTS idx_employee_training_employee_id ON employee_training(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_training_course_id ON employee_training(course_id);
CREATE INDEX IF NOT EXISTS idx_employee_training_batch ON employee_training(assignment_batch_id) WHERE assignment_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employee_training_due_open ON employee_training(due_date) WHERE status <> 'completed' AND due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employee_training_current_lookup ON employee_training(employee_id, course_id, created_at DESC);

-- Reuses can_view_employee() verbatim — HR staff, the employee
-- themself, or their direct manager. Exactly the right rule already.
DROP POLICY IF EXISTS "select_employee_training_scoped" ON employee_training;
CREATE POLICY "select_employee_training_scoped" ON employee_training FOR SELECT
  TO authenticated USING (can_view_employee(employee_id));

-- The ONLY client-side insert path is self-enrollment. HR-assigned
-- rows (assigned_by IS NOT NULL) can only be created via the
-- assign_training() RPC (migration 091) — same "no client privileged
-- insert" shape as notifications.
DROP POLICY IF EXISTS "insert_employee_training_self_enroll" ON employee_training;
CREATE POLICY "insert_employee_training_self_enroll" ON employee_training FOR INSERT
  TO authenticated WITH CHECK (
    assigned_by IS NULL
    AND EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_id AND e.profile_id = auth.uid() AND e.deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "update_employee_training_self_or_hr" ON employee_training;
CREATE POLICY "update_employee_training_self_or_hr" ON employee_training FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_id
      AND (can_manage_hr(e.organization_id, e.branch_id) OR e.profile_id = auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_id
      AND (can_manage_hr(e.organization_id, e.branch_id) OR e.profile_id = auth.uid()))
  );

DROP POLICY IF EXISTS "delete_employee_training_hr" ON employee_training;
CREATE POLICY "delete_employee_training_hr" ON employee_training FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_id AND can_manage_hr(e.organization_id, e.branch_id))
  );

CREATE OR REPLACE FUNCTION guard_employee_training_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_self boolean;
  v_is_hr boolean;
  v_course courses%ROWTYPE;
BEGIN
  SELECT (e.profile_id = auth.uid()), can_manage_hr(e.organization_id, e.branch_id)
    INTO v_is_self, v_is_hr
  FROM employees e WHERE e.id = OLD.employee_id;

  IF v_is_self AND NOT v_is_hr THEN
    IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
      OR NEW.course_id IS DISTINCT FROM OLD.course_id
      OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
      OR NEW.assignment_batch_id IS DISTINCT FROM OLD.assignment_batch_id
      OR NEW.due_date IS DISTINCT FROM OLD.due_date
    THEN
      RAISE EXCEPTION 'You can only update your own progress — ask HR to change assignment details.';
    END IF;
    IF OLD.status = 'completed' AND NEW.status <> 'completed' THEN
      RAISE EXCEPTION 'A completed training record cannot be reopened — ask HR for a new record to retake it.';
    END IF;
  END IF;

  IF NEW.status = 'in_progress' AND OLD.status = 'not_started' THEN
    NEW.started_at := now();
  END IF;

  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    NEW.completed_at := now();
    SELECT * INTO v_course FROM courses WHERE id = NEW.course_id;
    IF v_course.is_certification AND v_course.certification_validity_months IS NOT NULL THEN
      NEW.certificate_expiry_date := (CURRENT_DATE + (v_course.certification_validity_months || ' months')::interval)::date;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_guard_employee_training_update ON employee_training;
CREATE TRIGGER trigger_guard_employee_training_update
  BEFORE UPDATE ON employee_training
  FOR EACH ROW EXECUTE FUNCTION guard_employee_training_update();
