/*
# Audit-log every change to platform_settings, via a trigger

Matches thecounsel-reference's migration 0165 exactly in spirit,
adapted to this app's own activities table (no separate audit_logs
table or log_audit() RPC exists here - Platform Console's own Audit
Logs page already reads straight from activities, branch_id nullable
since 20260805000300_043).

A trigger rather than relying on the settings page's own service-layer
insert (updatePlatformSettings already logs one, but only from that one
call site) - this way every write path is covered: the settings page,
any future admin tooling, and a direct SQL edit alike.

Diffs old vs new column-by-column (skips updated_at, which changes on
every save regardless) and writes nothing when nothing meaningful
changed. No smtp/feature_flags columns exist on this app's
platform_settings (deliberately not built - see the Settings page's
own commit notes), so there's no credential-redaction case to handle
here the way the reference's version does.
*/

CREATE OR REPLACE FUNCTION log_platform_settings_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb := to_jsonb(OLD);
  v_new jsonb := to_jsonb(NEW);
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_changed_keys text;
BEGIN
  FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
    IF v_key = 'updated_at' THEN CONTINUE; END IF;
    IF v_old -> v_key IS DISTINCT FROM v_new -> v_key THEN
      v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key));
    END IF;
  END LOOP;

  IF v_changes = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  SELECT string_agg(k, ', ' ORDER BY k) INTO v_changed_keys FROM jsonb_object_keys(v_changes) AS k;

  INSERT INTO activities (user_id, branch_id, action, entity_type, entity_id, description, metadata)
  VALUES (
    auth.uid(),
    NULL,
    'platform_settings.updated',
    'platform_settings',
    NULL,
    'Platform settings changed: ' || v_changed_keys,
    v_changes
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_platform_settings_update ON platform_settings;
CREATE TRIGGER trigger_log_platform_settings_update
  AFTER UPDATE ON platform_settings
  FOR EACH ROW EXECUTE FUNCTION log_platform_settings_update();
