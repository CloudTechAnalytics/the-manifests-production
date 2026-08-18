/*
# Platform settings (singleton) + generic rate limiting

## platform_settings
A single-row table so trial length, the default trial plan, and the
self-service kill switch are configured by the Platform Admin instead of
hardcoded. The `id boolean PRIMARY KEY DEFAULT true CHECK (id)` trick keeps
it to exactly one row: any second INSERT collides with the existing PK, so
"update settings" is always an UPDATE, never a new row (same idea as
`org_subscriptions` being one-row-per-org, per migration 018's docstring).

## rate_limit_hits / check_rate_limit
A minimal sliding-window limiter for the new public, unauthenticated
endpoints (register, verify, resend-verification). Every existing
authenticated write already requires a valid session, which bounds abuse far
more than an anonymous endpoint does — login/password-reset keep relying on
Supabase Auth's own built-in GoTrue rate limiting, unchanged. This table is
service-role only; nothing here is reachable via PostgREST from the browser.

check_rate_limit both prunes and checks in one call so the table can never
grow unbounded from its own callers.
*/

CREATE TABLE IF NOT EXISTS platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  trial_duration_days integer NOT NULL DEFAULT 14 CHECK (trial_duration_days > 0),
  default_trial_plan_id uuid REFERENCES plans(id) ON DELETE SET NULL,
  self_registration_enabled boolean NOT NULL DEFAULT true,
  terms_version text NOT NULL DEFAULT 'v1',
  privacy_version text NOT NULL DEFAULT 'v1',
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admin_all_platform_settings" ON platform_settings;
CREATE POLICY "platform_admin_all_platform_settings" ON platform_settings FOR ALL
  TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

DO $$ BEGIN
  CREATE TRIGGER trigger_platform_settings_updated_at
    BEFORE UPDATE ON platform_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS rate_limit_hits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS enabled with no policies at all: this table is never queried through
-- PostgREST, only via check_rate_limit() from service-role edge functions.
ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_key_created_at
  ON rate_limit_hits(key, created_at);

CREATE OR REPLACE FUNCTION check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Prune this key's stale hits so the table doesn't grow unbounded.
  DELETE FROM rate_limit_hits
   WHERE key = p_key AND created_at < now() - make_interval(secs => p_window_seconds);

  SELECT count(*) INTO v_count FROM rate_limit_hits WHERE key = p_key;

  IF v_count >= p_max THEN
    RETURN false;
  END IF;

  INSERT INTO rate_limit_hits (key) VALUES (p_key);
  RETURN true;
END;
$$;
