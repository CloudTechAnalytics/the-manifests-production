/*
# HR & People Capacity — Phase 1: dashboard stats + capacity RPCs

## Why one aggregate RPC per view, not client-side counting
Same reasoning as platform_dashboard_stats() (migration 071): counting
rows in JavaScript after fetching them all scales with data size
forever. Every function here is SECURITY INVOKER STABLE — it runs
under the caller's own RLS, so a branch-scoped hr_officer/hr_manager/
branch_manager automatically gets numbers scoped to what they can see
(via can_view_employee() on employees, and each underlying operational
table's own existing RLS) with zero special-casing needed here.

## Capacity data sources (Phase 1, decisive)
Per-person, per-role workload comes from what already has a real
assignee column: shipment_tasks.assigned_to (+ assigned_department,
already role-tagged for every operational department), plan_tasks.
assigned_to (Planning Centre tasks — always attributed to the
'planning' role, since that's what plan_tasks is), quotations.
sales_rep_id (always 'sales'), and invoices.created_by (always
'finance' — the weakest signal of the four, since it's who processed
the invoice rather than a formal assignment, but it's the only signal
available). documents/customs_bonds/shipment_transportation have no
per-person assignee column and are NOT scored in Phase 1 — a real,
stated limitation, not an oversight.

hr_capacity_work_items() returns only currently-OPEN items (pending/
in_progress tasks; draft/pending_approval/sent quotations; draft/sent/
partial invoices) from the trailing 30 days — this is "current
workload", not lifetime activity. An employee who closes work quickly
will show fewer open items, which the thin-data rule can mistake for
low signal rather than efficiency — a known Phase 1 simplification,
noted so it isn't mistaken for a bug later.

## Scoring (transparent, not completed/total — spec section 7)
item_score = priority_multiplier x age_multiplier + overdue_bonus.
priority_multiplier: low/normal 0.75-1.0, high/urgent/vip 1.5.
age_multiplier: 1 + min(days_open, 30)/30 x 0.5 (caps at 1.5x past 30
days open). overdue_bonus: +1 flat if past due/valid_until and still
open. A person's raw_score sums this across everything actually
assigned to them, whatever role it falls under — an employee holding
multiple employee_responsibilities naturally accumulates workload from
every role they're genuinely assigned tasks in.

## Peer-relative normalization, not a fixed magic number
utilization_index = raw_score / peer_median_raw_score x 100. Peers =
other active employees sharing at least one linked_role (via
employee_responsibilities — this is exactly where Multiple
Responsibilities feeds the engine, both for whose workload counts and
for who counts as a fair comparison), same branch, falling back to
org-wide when fewer than 3 branch peers exist.

## Thin-data rule — surfaced distinctly, never as a fake "Healthy"
utilization_index/status_label are NULL (is_thin_data = true) when:
sample_size < 5 open items in the trailing 30 days, OR fewer than 3
peers at both branch and org level, OR the employee has no Manifest
login (profile_id IS NULL — can never be an assignee anywhere, so they
are excluded from scoring, not scored zero). Department capacity with
< 2 people in a role, and branch capacity in a single-branch
organization, get the same honest "not enough to compare" treatment
instead of a meaningless percentage.
*/

-- ============================================================
-- hr_capacity_work_items — normalized open-work-item feed
-- ============================================================

CREATE OR REPLACE FUNCTION hr_capacity_work_items()
RETURNS TABLE (
  assignee_profile_id uuid,
  branch_id uuid,
  linked_role user_role,
  item_score numeric,
  is_overdue boolean,
  created_at timestamptz
)
LANGUAGE sql SECURITY INVOKER STABLE
AS $$
  -- Shipment tasks: every operational department's real per-person queue.
  SELECT
    st.assigned_to,
    st.branch_id,
    st.assigned_department,
    (CASE st.priority WHEN 'low' THEN 0.75 WHEN 'high' THEN 1.5 ELSE 1.0 END)
      * (1 + LEAST(EXTRACT(DAY FROM now() - st.created_at)::numeric, 30) / 30.0 * 0.5)
      + (CASE WHEN st.due_date IS NOT NULL AND st.due_date < CURRENT_DATE THEN 1 ELSE 0 END),
    (st.due_date IS NOT NULL AND st.due_date < CURRENT_DATE),
    st.created_at
  FROM shipment_tasks st
  WHERE st.assigned_to IS NOT NULL
    AND st.assigned_department IS NOT NULL
    AND st.status IN ('pending', 'in_progress')

  UNION ALL

  -- Planning Centre tasks: always the 'planning' role — plan_tasks has
  -- no assigned_department column, but that's what this table is.
  SELECT
    pt.assigned_to,
    pt.branch_id,
    'planning'::user_role,
    (CASE pt.priority WHEN 'low' THEN 0.75 WHEN 'high' THEN 1.5 ELSE 1.0 END)
      * (1 + LEAST(EXTRACT(DAY FROM now() - pt.created_at)::numeric, 30) / 30.0 * 0.5)
      + (CASE WHEN pt.due_date IS NOT NULL AND pt.due_date < CURRENT_DATE THEN 1 ELSE 0 END),
    (pt.due_date IS NOT NULL AND pt.due_date < CURRENT_DATE),
    pt.created_at
  FROM plan_tasks pt
  WHERE pt.assigned_to IS NOT NULL
    AND pt.status IN ('pending', 'in_progress')

  UNION ALL

  -- Open quotations: always the 'sales' role. valid_until past today
  -- while still open is this table's own "overdue" signal.
  SELECT
    q.sales_rep_id,
    q.branch_id,
    'sales'::user_role,
    (CASE q.priority WHEN 'normal' THEN 1.0 ELSE 1.5 END)
      * (1 + LEAST(EXTRACT(DAY FROM now() - q.created_at)::numeric, 30) / 30.0 * 0.5)
      + (CASE WHEN q.valid_until IS NOT NULL AND q.valid_until < CURRENT_DATE THEN 1 ELSE 0 END),
    (q.valid_until IS NOT NULL AND q.valid_until < CURRENT_DATE),
    q.created_at
  FROM quotations q
  WHERE q.sales_rep_id IS NOT NULL
    AND q.deleted_at IS NULL
    AND q.status IN ('draft', 'pending_approval', 'sent')

  UNION ALL

  -- Open invoices: always 'finance'. Weakest signal of the four — who
  -- processed it, not a formal assignment — but the only one available.
  SELECT
    i.created_by,
    i.branch_id,
    'finance'::user_role,
    1.0 * (1 + LEAST(EXTRACT(DAY FROM now() - i.created_at)::numeric, 30) / 30.0 * 0.5)
      + (CASE WHEN i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE THEN 1 ELSE 0 END),
    (i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE),
    i.created_at
  FROM invoices i
  WHERE i.created_by IS NOT NULL
    AND i.deleted_at IS NULL
    AND i.status IN ('draft', 'sent', 'partial');
$$;

GRANT EXECUTE ON FUNCTION hr_capacity_work_items() TO authenticated;

-- ============================================================
-- hr_people_capacity — per-employee capacity, peer-relative
-- ============================================================

CREATE OR REPLACE FUNCTION hr_people_capacity()
RETURNS TABLE (
  employee_id uuid,
  employee_name text,
  branch_id uuid,
  branch_name text,
  raw_score numeric,
  sample_size bigint,
  peer_count integer,
  peer_median numeric,
  utilization_index numeric,
  status_label text,
  is_thin_data boolean,
  thin_reason text
)
LANGUAGE sql SECURITY INVOKER STABLE
AS $$
  WITH work AS (
    SELECT * FROM hr_capacity_work_items() WHERE created_at >= now() - interval '30 days'
  ),
  emp AS (
    SELECT
      e.id,
      (e.first_name || ' ' || e.last_name) AS full_name,
      e.branch_id,
      e.profile_id,
      COALESCE(
        array_agg(DISTINCT er.linked_role) FILTER (WHERE er.linked_role IS NOT NULL),
        ARRAY[]::user_role[]
      ) AS linked_roles
    FROM employees e
    LEFT JOIN employee_responsibilities er
      ON er.employee_id = e.id AND er.deleted_at IS NULL AND er.end_date IS NULL
    WHERE e.deleted_at IS NULL AND e.employment_status = 'active' AND can_view_employee(e.id)
    GROUP BY e.id, e.first_name, e.last_name, e.branch_id, e.profile_id
  ),
  scored AS (
    SELECT
      emp.id AS employee_id,
      emp.full_name,
      emp.branch_id,
      emp.profile_id,
      emp.linked_roles,
      COALESCE(SUM(work.item_score) FILTER (WHERE work.assignee_profile_id = emp.profile_id), 0) AS raw_score,
      COUNT(*) FILTER (WHERE work.assignee_profile_id = emp.profile_id) AS sample_size
    FROM emp
    LEFT JOIN work ON work.assignee_profile_id = emp.profile_id
    GROUP BY emp.id, emp.full_name, emp.branch_id, emp.profile_id, emp.linked_roles
  ),
  peers AS (
    SELECT
      s.employee_id,
      p.raw_score AS peer_raw_score,
      (p.branch_id = s.branch_id) AS same_branch
    FROM scored s
    JOIN scored p ON p.employee_id <> s.employee_id AND p.linked_roles && s.linked_roles
  ),
  peer_stats AS (
    SELECT
      employee_id,
      COUNT(*) FILTER (WHERE same_branch) AS branch_peer_count,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY peer_raw_score) FILTER (WHERE same_branch) AS branch_peer_median,
      COUNT(*) AS org_peer_count,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY peer_raw_score) AS org_peer_median
    FROM peers
    GROUP BY employee_id
  ),
  computed AS (
    SELECT
      s.employee_id,
      s.full_name,
      s.branch_id,
      b.name AS branch_name,
      s.profile_id,
      s.raw_score,
      s.sample_size,
      CASE WHEN COALESCE(ps.branch_peer_count, 0) >= 3 THEN ps.branch_peer_count ELSE COALESCE(ps.org_peer_count, 0) END AS effective_peer_count,
      CASE WHEN COALESCE(ps.branch_peer_count, 0) >= 3 THEN ps.branch_peer_median ELSE ps.org_peer_median END AS effective_peer_median
    FROM scored s
    LEFT JOIN peer_stats ps ON ps.employee_id = s.employee_id
    LEFT JOIN branches b ON b.id = s.branch_id
  ),
  indexed AS (
    SELECT
      c.*,
      -- PERCENTILE_CONT always returns double precision regardless of
      -- input type, so effective_peer_median is double precision here —
      -- cast to numeric so ROUND(numeric, int) resolves below (Postgres
      -- has no ROUND(double precision, integer) overload).
      CASE WHEN c.profile_id IS NOT NULL AND c.effective_peer_median > 0
        THEN c.raw_score / c.effective_peer_median::numeric * 100 END AS utilization_index_raw
    FROM computed c
  )
  SELECT
    i.employee_id,
    i.full_name,
    i.branch_id,
    i.branch_name,
    i.raw_score,
    i.sample_size,
    COALESCE(i.effective_peer_count, 0)::integer,
    i.effective_peer_median,
    ROUND(i.utilization_index_raw, 0),
    CASE
      WHEN i.profile_id IS NULL OR i.sample_size < 5 OR COALESCE(i.effective_peer_count, 0) < 3
        OR i.effective_peer_median IS NULL OR i.effective_peer_median = 0 THEN NULL
      WHEN i.utilization_index_raw < 40 THEN 'underutilized'
      WHEN i.utilization_index_raw <= 110 THEN 'healthy'
      WHEN i.utilization_index_raw <= 160 THEN 'high_utilization'
      ELSE 'overloaded'
    END AS status_label,
    (
      i.profile_id IS NULL OR i.sample_size < 5 OR COALESCE(i.effective_peer_count, 0) < 3
      OR i.effective_peer_median IS NULL OR i.effective_peer_median = 0
    ) AS is_thin_data,
    CASE
      WHEN i.profile_id IS NULL THEN 'no_login'
      WHEN i.sample_size < 5 THEN 'low_sample'
      WHEN COALESCE(i.effective_peer_count, 0) < 3 OR i.effective_peer_median IS NULL OR i.effective_peer_median = 0 THEN 'few_peers'
      ELSE NULL
    END AS thin_reason
  FROM indexed i
  ORDER BY i.full_name;
$$;

GRANT EXECUTE ON FUNCTION hr_people_capacity() TO authenticated;

-- ============================================================
-- hr_department_capacity — per (branch, role), org-relative
-- ============================================================

CREATE OR REPLACE FUNCTION hr_department_capacity()
RETURNS TABLE (
  branch_id uuid,
  branch_name text,
  linked_role user_role,
  active_employee_count integer,
  total_score numeric,
  avg_score_per_employee numeric,
  org_avg_score_per_employee numeric,
  utilization_index numeric,
  status_label text,
  is_thin_data boolean
)
LANGUAGE sql SECURITY INVOKER STABLE
AS $$
  WITH work AS (
    SELECT * FROM hr_capacity_work_items() WHERE created_at >= now() - interval '30 days'
  ),
  role_counts AS (
    SELECT e.branch_id, er.linked_role, COUNT(DISTINCT e.id) AS active_employee_count
    FROM employees e
    JOIN employee_responsibilities er ON er.employee_id = e.id AND er.deleted_at IS NULL AND er.end_date IS NULL
    WHERE e.deleted_at IS NULL AND e.employment_status = 'active' AND can_view_employee(e.id)
    GROUP BY e.branch_id, er.linked_role
  ),
  work_totals AS (
    SELECT branch_id, linked_role, SUM(item_score) AS total_score
    FROM work
    WHERE linked_role IS NOT NULL
    GROUP BY branch_id, linked_role
  ),
  branch_role AS (
    SELECT rc.branch_id, rc.linked_role, rc.active_employee_count, COALESCE(wt.total_score, 0) AS total_score
    FROM role_counts rc
    LEFT JOIN work_totals wt ON wt.branch_id = rc.branch_id AND wt.linked_role = rc.linked_role
  ),
  org_role AS (
    SELECT linked_role, SUM(active_employee_count) AS org_employee_count, SUM(total_score) AS org_total_score
    FROM branch_role
    GROUP BY linked_role
  ),
  indexed AS (
    SELECT
      br.branch_id,
      br.linked_role,
      br.active_employee_count,
      br.total_score,
      orr.org_employee_count,
      orr.org_total_score,
      CASE WHEN br.active_employee_count > 0 THEN br.total_score / br.active_employee_count END AS avg_per_employee,
      CASE WHEN orr.org_employee_count > 0 THEN orr.org_total_score / orr.org_employee_count END AS org_avg_per_employee
    FROM branch_role br
    JOIN org_role orr ON orr.linked_role = br.linked_role
  )
  SELECT
    ix.branch_id,
    b.name,
    ix.linked_role,
    ix.active_employee_count::integer,
    ix.total_score,
    ROUND(ix.avg_per_employee, 1),
    ROUND(ix.org_avg_per_employee, 1),
    CASE WHEN ix.active_employee_count >= 2 AND ix.org_employee_count >= 2 AND ix.org_avg_per_employee > 0
      THEN ROUND(ix.avg_per_employee / ix.org_avg_per_employee * 100, 0) END,
    CASE
      WHEN ix.active_employee_count < 2 OR ix.org_employee_count < 2 OR ix.org_avg_per_employee IS NULL OR ix.org_avg_per_employee = 0 THEN NULL
      WHEN ix.avg_per_employee / ix.org_avg_per_employee * 100 < 40 THEN 'underutilized'
      WHEN ix.avg_per_employee / ix.org_avg_per_employee * 100 <= 110 THEN 'healthy'
      WHEN ix.avg_per_employee / ix.org_avg_per_employee * 100 <= 160 THEN 'high_utilization'
      ELSE 'overloaded'
    END,
    (ix.active_employee_count < 2 OR ix.org_employee_count < 2 OR ix.org_avg_per_employee IS NULL OR ix.org_avg_per_employee = 0)
  FROM indexed ix
  LEFT JOIN branches b ON b.id = ix.branch_id
  ORDER BY b.name NULLS LAST, ix.linked_role;
$$;

GRANT EXECUTE ON FUNCTION hr_department_capacity() TO authenticated;

-- ============================================================
-- hr_branch_capacity — per branch, org-relative
-- ============================================================

CREATE OR REPLACE FUNCTION hr_branch_capacity()
RETURNS TABLE (
  branch_id uuid,
  branch_name text,
  active_employee_count integer,
  total_score numeric,
  avg_score_per_employee numeric,
  org_avg_score_per_employee numeric,
  utilization_index numeric,
  status_label text,
  is_thin_data boolean,
  thin_reason text
)
LANGUAGE sql SECURITY INVOKER STABLE
AS $$
  WITH work AS (
    SELECT * FROM hr_capacity_work_items() WHERE created_at >= now() - interval '30 days'
  ),
  branch_emp AS (
    SELECT branch_id, COUNT(*) AS active_employee_count
    FROM employees
    WHERE deleted_at IS NULL AND employment_status = 'active' AND branch_id IS NOT NULL AND can_view_employee(id)
    GROUP BY branch_id
  ),
  branch_work AS (
    SELECT branch_id, SUM(item_score) AS total_score FROM work GROUP BY branch_id
  ),
  branch_totals AS (
    SELECT be.branch_id, be.active_employee_count, COALESCE(bw.total_score, 0) AS total_score
    FROM branch_emp be
    LEFT JOIN branch_work bw ON bw.branch_id = be.branch_id
  ),
  branch_count AS (SELECT COUNT(*) AS n FROM branch_totals),
  org_avg AS (
    SELECT SUM(total_score) AS org_total_score, SUM(active_employee_count) AS org_employee_count
    FROM branch_totals
  ),
  indexed AS (
    SELECT
      bt.branch_id,
      bt.active_employee_count,
      bt.total_score,
      oa.org_employee_count,
      CASE WHEN bt.active_employee_count > 0 THEN bt.total_score / bt.active_employee_count END AS avg_per_employee,
      CASE WHEN oa.org_employee_count > 0 THEN oa.org_total_score / oa.org_employee_count END AS org_avg_per_employee,
      (SELECT n FROM branch_count) AS branch_count
    FROM branch_totals bt
    CROSS JOIN org_avg oa
  )
  SELECT
    ix.branch_id,
    b.name,
    ix.active_employee_count::integer,
    ix.total_score,
    ROUND(ix.avg_per_employee, 1),
    ROUND(ix.org_avg_per_employee, 1),
    CASE WHEN ix.branch_count > 1 AND ix.active_employee_count > 0 AND ix.org_avg_per_employee > 0
      THEN ROUND(ix.avg_per_employee / ix.org_avg_per_employee * 100, 0) END,
    CASE
      WHEN ix.branch_count <= 1 OR ix.active_employee_count = 0 OR ix.org_avg_per_employee IS NULL OR ix.org_avg_per_employee = 0 THEN NULL
      WHEN ix.avg_per_employee / ix.org_avg_per_employee * 100 < 40 THEN 'underutilized'
      WHEN ix.avg_per_employee / ix.org_avg_per_employee * 100 <= 110 THEN 'healthy'
      WHEN ix.avg_per_employee / ix.org_avg_per_employee * 100 <= 160 THEN 'high_utilization'
      ELSE 'overloaded'
    END,
    (ix.branch_count <= 1 OR ix.active_employee_count = 0),
    CASE WHEN ix.branch_count <= 1 THEN 'only_branch' WHEN ix.active_employee_count = 0 THEN 'no_employees' ELSE NULL END
  FROM indexed ix
  LEFT JOIN branches b ON b.id = ix.branch_id
  ORDER BY b.name;
$$;

GRANT EXECUTE ON FUNCTION hr_branch_capacity() TO authenticated;

-- ============================================================
-- Dashboard stats + bounded breakdowns
-- ============================================================

CREATE OR REPLACE FUNCTION hr_dashboard_stats()
RETURNS TABLE (
  total_employees bigint,
  active_employees bigint,
  on_leave_employees bigint,
  other_status_employees bigint,
  new_hires_30d bigint,
  contracts_ending_60d bigint,
  confirmation_due_30d bigint,
  employees_without_login bigint
)
LANGUAGE sql SECURITY INVOKER STABLE
AS $$
  SELECT
    (SELECT count(*) FROM employees WHERE deleted_at IS NULL),
    (SELECT count(*) FROM employees WHERE deleted_at IS NULL AND employment_status = 'active'),
    (SELECT count(*) FROM employees WHERE deleted_at IS NULL AND employment_status = 'on_leave'),
    (SELECT count(*) FROM employees WHERE deleted_at IS NULL AND employment_status NOT IN ('active', 'on_leave')),
    (SELECT count(*) FROM employees WHERE deleted_at IS NULL AND hire_date >= CURRENT_DATE - INTERVAL '30 days'),
    (SELECT count(*) FROM employees WHERE deleted_at IS NULL AND contract_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'),
    (SELECT count(*) FROM employees WHERE deleted_at IS NULL AND confirmation_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'),
    (SELECT count(*) FROM employees WHERE deleted_at IS NULL AND profile_id IS NULL);
$$;

GRANT EXECUTE ON FUNCTION hr_dashboard_stats() TO authenticated;

CREATE OR REPLACE FUNCTION hr_workforce_by_branch()
RETURNS TABLE (branch_id uuid, branch_name text, employee_count bigint)
LANGUAGE sql SECURITY INVOKER STABLE
AS $$
  SELECT b.id, b.name, count(e.id)
  FROM branches b
  LEFT JOIN employees e ON e.branch_id = b.id AND e.deleted_at IS NULL
  WHERE b.deleted_at IS NULL
  GROUP BY b.id, b.name
  ORDER BY b.name;
$$;

GRANT EXECUTE ON FUNCTION hr_workforce_by_branch() TO authenticated;

CREATE OR REPLACE FUNCTION hr_workforce_by_department()
RETURNS TABLE (department_id uuid, department_name text, employee_count bigint)
LANGUAGE sql SECURITY INVOKER STABLE
AS $$
  SELECT d.id, d.name, count(e.id)
  FROM departments d
  LEFT JOIN employees e ON e.department_id = d.id AND e.deleted_at IS NULL
  WHERE d.deleted_at IS NULL
  GROUP BY d.id, d.name
  ORDER BY d.name;
$$;

GRANT EXECUTE ON FUNCTION hr_workforce_by_department() TO authenticated;
