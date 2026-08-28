/*
# assign_training() + hr_training_stats()

## assign_training()
SECURITY DEFINER, same template as convert_quotation_to_shipment()/
complete_shipment_stage(): multi-row insert + notification write,
atomically, in one function — this is the ONLY path that can create an
HR-assigned (assigned_by IS NOT NULL) employee_training row; RLS alone
blocks it from the client (migration 089).

Verifies the course belongs to the caller's own org before doing
anything else — without this check, a caller could target another
org's course id and the per-employee can_manage_hr() checks alone
wouldn't catch it (they check the EMPLOYEE's org/branch, not the
COURSE's), which would be a real cross-tenant gap.

Per targeted employee, can_manage_hr() is what stops a branch-scoped
hr_officer from assigning outside their own branch even though this
function itself bypasses employee_training's RLS. A denied employee is
skipped and counted, not a hard failure for the whole batch — a bulk
assign to "everyone in Customs" from a branch-scoped hr_officer should
still succeed for their own branch's people.

Notifications: one set-based INSERT...SELECT for the whole batch,
joined so employees with no Manifest login (profile_id IS NULL) or no
resolvable branch are naturally excluded — not an error, just nothing
to notify. Fires once, at assignment time only (confirmed: no
proactive due-date reminders in this version).

## hr_training_stats()
Additive, SECURITY INVOKER STABLE, same shape as hr_dashboard_stats()
(migration 087) — does NOT touch that function's existing signature.
Rides can_view_employee() so a branch-scoped viewer automatically gets
branch-scoped numbers, zero special-casing. overdue_count/
due_soon_7d_count are computed live from due_date here, never from a
stored flag, per the confirmed "live status only" decision.
*/

CREATE OR REPLACE FUNCTION assign_training(
  p_course_id uuid,
  p_employee_ids uuid[],
  p_due_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_course courses%ROWTYPE;
  v_uid uuid := auth.uid();
  v_batch_id uuid := gen_random_uuid();
  v_deduped_ids uuid[];
  v_employee_id uuid;
  v_emp employees%ROWTYPE;
  v_row_id uuid;
  v_assigned_count integer := 0;
  v_already_assigned_count integer := 0;
  v_denied_count integer := 0;
  v_skipped_no_login_count integer := 0;
BEGIN
  SELECT * INTO v_course FROM courses WHERE id = p_course_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COURSE_NOT_FOUND';
  END IF;

  -- Required guard: a course belongs to exactly one org. Without this,
  -- the per-employee can_manage_hr() checks below (which validate the
  -- EMPLOYEE's org/branch, not the COURSE's) would let a caller assign
  -- another org's course id to their own org's employees.
  IF NOT can_manage_training_catalog(v_course.organization_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_COURSE';
  END IF;

  SELECT ARRAY(SELECT DISTINCT unnest(p_employee_ids)) INTO v_deduped_ids;

  FOREACH v_employee_id IN ARRAY v_deduped_ids LOOP
    SELECT * INTO v_emp FROM employees WHERE id = v_employee_id AND deleted_at IS NULL;

    IF NOT FOUND OR NOT can_manage_hr(v_emp.organization_id, v_emp.branch_id) THEN
      v_denied_count := v_denied_count + 1;
      CONTINUE;
    END IF;

    v_row_id := NULL;
    INSERT INTO employee_training (employee_id, course_id, assigned_by, assignment_batch_id, due_date, status)
    VALUES (v_employee_id, p_course_id, v_uid, v_batch_id, p_due_date, 'not_started')
    ON CONFLICT (employee_id, course_id) WHERE status <> 'completed' DO NOTHING
    RETURNING id INTO v_row_id;

    IF v_row_id IS NULL THEN
      v_already_assigned_count := v_already_assigned_count + 1;
    ELSE
      v_assigned_count := v_assigned_count + 1;
      IF v_emp.profile_id IS NULL THEN
        v_skipped_no_login_count := v_skipped_no_login_count + 1;
      END IF;
    END IF;
  END LOOP;

  INSERT INTO notifications (recipient_id, branch_id, type, entity_type, entity_id, title, body)
  SELECT
    e.profile_id,
    COALESCE(e.branch_id, p.branch_id),
    'training_assigned',
    'employee_training',
    et.id,
    'New training assigned: ' || v_course.title,
    CASE WHEN et.due_date IS NOT NULL
      THEN 'Due by ' || to_char(et.due_date, 'Mon DD, YYYY') || '.'
      ELSE 'No due date set — complete at your convenience.' END
  FROM employee_training et
  JOIN employees e ON e.id = et.employee_id
  JOIN profiles p ON p.id = e.profile_id
  WHERE et.assignment_batch_id = v_batch_id
    AND e.profile_id IS NOT NULL
    AND COALESCE(e.branch_id, p.branch_id) IS NOT NULL;

  INSERT INTO activities (user_id, branch_id, action, entity_type, entity_id, description, metadata)
  VALUES (
    v_uid, get_user_branch_id(), 'training.assigned', 'course', p_course_id,
    'Assigned "' || v_course.title || '" to ' || v_assigned_count || ' employee(s)',
    jsonb_build_object('assignment_batch_id', v_batch_id, 'due_date', p_due_date)
  );

  RETURN jsonb_build_object(
    'assignment_batch_id', v_batch_id,
    'assigned_count', v_assigned_count,
    'already_assigned_count', v_already_assigned_count,
    'skipped_no_login_count', v_skipped_no_login_count,
    'denied_count', v_denied_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION assign_training(uuid, uuid[], date) TO authenticated;

CREATE OR REPLACE FUNCTION hr_training_stats()
RETURNS TABLE (
  total_assignments bigint,
  not_started_count bigint,
  in_progress_count bigint,
  completed_count bigint,
  overdue_count bigint,
  due_soon_7d_count bigint,
  certifications_expiring_30d bigint,
  self_enrolled_count bigint,
  hr_assigned_count bigint
)
LANGUAGE sql SECURITY INVOKER STABLE
AS $$
  WITH visible AS (
    SELECT * FROM employee_training et WHERE can_view_employee(et.employee_id)
  ),
  current_certs AS (
    SELECT DISTINCT ON (employee_id, course_id) certificate_expiry_date
    FROM visible
    WHERE certificate_expiry_date IS NOT NULL
    ORDER BY employee_id, course_id, created_at DESC
  )
  SELECT
    (SELECT count(*) FROM visible),
    (SELECT count(*) FROM visible WHERE status = 'not_started'),
    (SELECT count(*) FROM visible WHERE status = 'in_progress'),
    (SELECT count(*) FROM visible WHERE status = 'completed'),
    (SELECT count(*) FROM visible WHERE due_date IS NOT NULL AND due_date < CURRENT_DATE AND status <> 'completed'),
    (SELECT count(*) FROM visible WHERE due_date IS NOT NULL AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' AND status <> 'completed'),
    (SELECT count(*) FROM current_certs WHERE certificate_expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'),
    (SELECT count(*) FROM visible WHERE assigned_by IS NULL),
    (SELECT count(*) FROM visible WHERE assigned_by IS NOT NULL);
$$;

GRANT EXECUTE ON FUNCTION hr_training_stats() TO authenticated;
