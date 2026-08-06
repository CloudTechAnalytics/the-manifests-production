/*
# Automatic department handoff on stage completion

## Problem
Completing a workflow stage (shipment_stages) never touched the
shipment's own status field — a user had to separately open "Update
Status" and manually pick the next value, and no one downstream was
told work had arrived. Real freight-forwarding handoff is automatic:
Planning finishes -> Documentation is notified and their stage starts
immediately, no manual assignment.

## Fix
A second SECURITY DEFINER RPC, complete_shipment_stage(stage_id,
action), replaces the client's direct `UPDATE shipment_stages` calls
for Complete/Skip. It performs the department permission check and
sequence check itself (mirroring shipment-workflow-panel.tsx's
existing client-side checks, now enforced server-side too), marks the
stage, and — if the completed/skipped stage matches the shipment's
current status — advances shipments.status to the next value in the
flow, skipping over any status whose stage was pre-marked 'skipped'
(this is what makes "if examination not required, skip automatically"
apply to the STATUS field too, not just the stage checklist), starts
the next stage, logs the timeline/activity, and notifies the newly
responsible department. This needs SECURITY DEFINER for the same
reason convert_quotation_to_shipment does: notifications has no client
INSERT policy by design (migration 053), so only a trusted server-side
path can write the handoff notification.

archived is a deliberate manual-only action (not part of this
auto-advance chain) — "Completed" already means locked/no further
editing; archiving is a separate, later filing decision.
*/

CREATE OR REPLACE FUNCTION complete_shipment_stage(p_stage_id uuid, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stage shipment_stages%ROWTYPE;
  v_shipment shipments%ROWTYPE;
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_new_status_value shipment_status := NULL;
  v_flow shipment_status[] := ARRAY[
    'planning', 'documentation', 'awaiting_customs', 'customs_clearance',
    'terminal_processing', 'cargo_examination', 'released', 'transport',
    'delivered', 'completed'
  ]::shipment_status[];
  v_stage_key_for_status text[] := ARRAY[
    'planning', 'documentation', 'regulatory_compliance', 'customs_clearance',
    'terminal_operations', 'cargo_examination', 'released', 'transportation',
    'delivered', 'completed'
  ];
  v_idx integer;
  v_i integer;
  v_candidate_stage_key text;
  v_candidate_stage_status workflow_stage_status;
  v_next_stage shipment_stages%ROWTYPE;
BEGIN
  IF p_action NOT IN ('complete', 'skip') THEN
    RAISE EXCEPTION 'INVALID_ACTION';
  END IF;

  SELECT * INTO v_stage FROM shipment_stages WHERE id = p_stage_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STAGE_NOT_FOUND';
  END IF;

  IF NOT (is_admin() OR is_branch_manager() OR has_role(v_stage.assigned_department)) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  IF p_action = 'skip' AND NOT v_stage.is_optional THEN
    RAISE EXCEPTION 'NOT_SKIPPABLE';
  END IF;

  -- Sequence enforcement, mirrored server-side: any earlier, non-optional,
  -- not-yet-done stage blocks completing/skipping this one.
  IF EXISTS (
    SELECT 1 FROM shipment_stages
    WHERE shipment_id = v_stage.shipment_id AND sequence < v_stage.sequence
      AND NOT is_optional AND status NOT IN ('completed', 'skipped')
  ) THEN
    RAISE EXCEPTION 'OUT_OF_ORDER';
  END IF;

  SELECT * INTO v_shipment FROM shipments WHERE id = v_stage.shipment_id FOR UPDATE;

  UPDATE shipment_stages
  SET status = (CASE WHEN p_action = 'complete' THEN 'completed' ELSE 'skipped' END)::workflow_stage_status,
      completed_at = v_now, updated_by = v_uid, updated_at = v_now
  WHERE id = p_stage_id;

  INSERT INTO activities (user_id, branch_id, action, entity_type, entity_id, description, metadata)
  VALUES (
    v_uid, v_shipment.branch_id,
    CASE WHEN p_action = 'complete' THEN 'workflow_stage.completed' ELSE 'workflow_stage.skipped' END,
    'shipment_stage', v_stage.id,
    (CASE WHEN p_action = 'complete' THEN 'Completed "' ELSE 'Skipped "' END) || v_stage.label || '" for this shipment',
    jsonb_build_object('shipment_id', v_shipment.id, 'stage_key', v_stage.stage_key)
  );

  -- Only advance the shipment's own status if the stage just actioned is
  -- the one matching its CURRENT status — sequence enforcement above
  -- guarantees stages resolve in order, so this is always the stage the
  -- shipment is actually "in" right now.
  v_idx := array_position(v_flow, v_shipment.status);
  IF v_idx IS NOT NULL AND v_stage_key_for_status[v_idx] = v_stage.stage_key THEN
    FOR v_i IN (v_idx + 1)..array_length(v_flow, 1) LOOP
      v_candidate_stage_key := v_stage_key_for_status[v_i];
      SELECT status INTO v_candidate_stage_status
      FROM shipment_stages WHERE shipment_id = v_shipment.id AND stage_key = v_candidate_stage_key;

      IF v_candidate_stage_status IS DISTINCT FROM 'skipped'::workflow_stage_status THEN
        v_new_status_value := v_flow[v_i];
        EXIT;
      END IF;
      -- else: that status's stage was pre-skipped (e.g. no examination
      -- purchased) — keep looking for the next real status to land on.
    END LOOP;
  END IF;

  IF v_new_status_value IS NOT NULL THEN
    UPDATE shipments SET status = v_new_status_value, updated_by = v_uid, updated_at = v_now WHERE id = v_shipment.id;

    INSERT INTO shipment_timeline (shipment_id, status, notes, created_by)
    VALUES (v_shipment.id, v_new_status_value, 'Advanced automatically after "' || v_stage.label || '"', v_uid);

    UPDATE shipment_stages
    SET status = 'in_progress', started_at = v_now, updated_by = v_uid, updated_at = v_now
    WHERE shipment_id = v_shipment.id
      AND stage_key = v_stage_key_for_status[array_position(v_flow, v_new_status_value)]
      AND status = 'pending'
    RETURNING * INTO v_next_stage;

    IF v_next_stage.id IS NOT NULL THEN
      INSERT INTO notifications (recipient_id, branch_id, type, entity_type, entity_id, title, body)
      SELECT p.id, v_shipment.branch_id, 'stage_handoff', 'shipment', v_shipment.id,
        v_shipment.reference_number || ' is ready for ' || v_next_stage.label,
        '"' || v_stage.label || '" is done — ' || v_next_stage.label || ' now needs your attention.'
      FROM profiles p
      WHERE p.branch_id = v_shipment.branch_id AND p.is_active = true
        AND (
          p.role = v_next_stage.assigned_department
          OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id AND ur.role = v_next_stage.assigned_department)
        );
    END IF;
  END IF;

  RETURN jsonb_build_object('new_status', v_new_status_value);
END;
$$;

GRANT EXECUTE ON FUNCTION complete_shipment_stage(uuid, text) TO authenticated;
