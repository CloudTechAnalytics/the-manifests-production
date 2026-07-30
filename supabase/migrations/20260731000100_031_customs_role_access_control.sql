/*
# Gate Customs/Terminal/Examination writes to the new `customs` role

## Design
Same shape as can_manage_finance(): a genuinely exclusive specialist
track, not an operations sub-permission. admin and branch_manager keep
full access (the standing "full access within your own branch" rule for
branch_manager); operations no longer gets write access to these three
tables — only customs (+ admin/branch_manager) does.

SELECT stays open branch-wide (unchanged) — this follows the
operations-track/sales-track pattern (only writes are role-gated), not
the finance-track pattern (which also restricts reads). Customs status
is operational context every branch role reasonably needs to see (e.g.
"is this shipment customs-cleared yet?"), unlike financial figures.

## Explicitly NOT touched
shipment_transportation stays gated to can_manage_operations() —
Transportation is its own track (matches the Planning module's separate
"Transport Officer" vs "Customs Officer" assignment concept), not part
of this customs carve-out. Nothing else in the schema changes.
*/

CREATE OR REPLACE FUNCTION can_manage_customs() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'branch_manager', 'customs') AND is_active = true
  );
$$;

DROP POLICY IF EXISTS "insert_shipment_customs_branch" ON shipment_customs;
CREATE POLICY "insert_shipment_customs_branch" ON shipment_customs FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_customs());

DROP POLICY IF EXISTS "update_shipment_customs_branch" ON shipment_customs;
CREATE POLICY "update_shipment_customs_branch" ON shipment_customs FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_customs())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_customs());

DROP POLICY IF EXISTS "delete_shipment_customs_branch" ON shipment_customs;
CREATE POLICY "delete_shipment_customs_branch" ON shipment_customs FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_customs());

DROP POLICY IF EXISTS "insert_terminal_operations_branch" ON terminal_operations;
CREATE POLICY "insert_terminal_operations_branch" ON terminal_operations FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_customs());

DROP POLICY IF EXISTS "update_terminal_operations_branch" ON terminal_operations;
CREATE POLICY "update_terminal_operations_branch" ON terminal_operations FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_customs())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_customs());

DROP POLICY IF EXISTS "delete_terminal_operations_branch" ON terminal_operations;
CREATE POLICY "delete_terminal_operations_branch" ON terminal_operations FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_customs());

DROP POLICY IF EXISTS "insert_shipment_examinations_branch" ON shipment_examinations;
CREATE POLICY "insert_shipment_examinations_branch" ON shipment_examinations FOR INSERT
  TO authenticated WITH CHECK (can_access_branch(branch_id) AND can_manage_customs());

DROP POLICY IF EXISTS "update_shipment_examinations_branch" ON shipment_examinations;
CREATE POLICY "update_shipment_examinations_branch" ON shipment_examinations FOR UPDATE
  TO authenticated
  USING (deleted_at IS NULL AND can_access_branch(branch_id) AND can_manage_customs())
  WITH CHECK (can_access_branch(branch_id) AND can_manage_customs());

DROP POLICY IF EXISTS "delete_shipment_examinations_branch" ON shipment_examinations;
CREATE POLICY "delete_shipment_examinations_branch" ON shipment_examinations FOR DELETE
  TO authenticated USING (can_access_branch(branch_id) AND can_manage_customs());
