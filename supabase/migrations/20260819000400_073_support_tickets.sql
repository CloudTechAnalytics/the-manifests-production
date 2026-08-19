/*
# Support Tickets — tenant-raised, platform-triaged

## Why
Platform Console's Support Tickets nav entry (added alongside the rest
of the console restructure) had no data model behind it — this
migration adds one, matching the existing numbered-entity convention
(quotations/shipments/invoices all follow the same generate_X_number()
+ set_X_number() trigger shape) rather than inventing a new pattern.

## Access model, using the existing can_access_org() keystone
Any active member of an organization can see and raise tickets for
their OWN organization (support requests aren't an admin-only concern —
anyone hitting a problem should be able to ask for help); a
platform_admin sees and can update every organization's tickets. Only
a platform_admin can change status/priority/assignment — triage is a
platform-staff action, not something a tenant user does to their own
ticket once it's raised.
*/

CREATE SEQUENCE IF NOT EXISTS ticket_seq START 1;

CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_val bigint;
  year_text text := to_char(now(), 'YYYY');
  num_text text;
BEGIN
  next_val := nextval('ticket_seq');
  num_text := lpad(next_val::text, 4, '0');
  RETURN 'TKT-' || year_text || '-' || num_text;
END;
$$;

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subject text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE OR REPLACE FUNCTION set_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.ticket_number IS NULL THEN
    NEW.ticket_number := generate_ticket_number();
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trigger_set_ticket_number
    BEFORE INSERT ON support_tickets
    FOR EACH ROW EXECUTE FUNCTION set_ticket_number();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trigger_support_tickets_updated_at
    BEFORE UPDATE ON support_tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- resolved_at follows status automatically, same "derived, not
-- separately maintained by the client" convention used elsewhere
-- (e.g. quotation status transitions) — set on the transition into
-- resolved/closed, cleared if it's ever reopened.
CREATE OR REPLACE FUNCTION sync_ticket_resolved_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status IN ('resolved', 'closed') AND OLD.status NOT IN ('resolved', 'closed') THEN
    NEW.resolved_at := now();
  ELSIF NEW.status NOT IN ('resolved', 'closed') AND OLD.status IN ('resolved', 'closed') THEN
    NEW.resolved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trigger_sync_ticket_resolved_at
    BEFORE UPDATE ON support_tickets
    FOR EACH ROW EXECUTE FUNCTION sync_ticket_resolved_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_support_tickets" ON support_tickets;
CREATE POLICY "select_support_tickets" ON support_tickets FOR SELECT
  TO authenticated USING (deleted_at IS NULL AND can_access_org(organization_id));

DROP POLICY IF EXISTS "insert_support_tickets" ON support_tickets;
CREATE POLICY "insert_support_tickets" ON support_tickets FOR INSERT
  TO authenticated WITH CHECK (can_access_org(organization_id));

-- Triage (status/priority/assignment) is platform-staff only — a
-- tenant user raises a ticket but doesn't self-triage it.
DROP POLICY IF EXISTS "update_support_tickets_platform_admin" ON support_tickets;
CREATE POLICY "update_support_tickets_platform_admin" ON support_tickets FOR UPDATE
  TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE INDEX IF NOT EXISTS idx_support_tickets_organization_id
  ON support_tickets(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON support_tickets(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to
  ON support_tickets(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at
  ON support_tickets(created_at DESC) WHERE deleted_at IS NULL;
