/*
# Resource usage monitoring — on-demand only

Matches thecounsel-reference's migration 0158, on-demand half only:
a platform_resource_usage() RPC (admin-gated, read-only) backing a
new "Supabase plan usage" card on System Health, so there's a way to
check DB/storage usage against the Free-tier caps (500MB DB / 1GB
storage) at any time.

Deliberately NOT porting the other half of that migration — the daily
pg_cron job + check-resource-usage edge function that emails every
platform admin when usage crosses a 70/85/95% band. That needs a
working outbound-email integration (Resend or similar) this app
doesn't have configured, and building the alerting half without it
would just be a cron job that silently does nothing. The on-demand
card is the part someone can actually use today; the alerting half is
a real follow-up once email is wired up, not a fabricated stub.
*/

ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS db_cap_mb integer NOT NULL DEFAULT 500;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS storage_cap_mb integer NOT NULL DEFAULT 1024;

CREATE OR REPLACE FUNCTION platform_resource_usage()
RETURNS TABLE (
  db_bytes bigint,
  storage_bytes bigint,
  db_cap_bytes bigint,
  storage_cap_bytes bigint,
  db_pct numeric,
  storage_pct numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_db_bytes bigint;
  v_storage_bytes bigint;
  v_db_cap_mb integer;
  v_storage_cap_mb integer;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Only a platform administrator can view resource usage' USING ERRCODE = '42501';
  END IF;

  SELECT pg_database_size(current_database()) INTO v_db_bytes;
  SELECT COALESCE(SUM((metadata->>'size')::bigint), 0) INTO v_storage_bytes FROM storage.objects;
  SELECT ps.db_cap_mb, ps.storage_cap_mb INTO v_db_cap_mb, v_storage_cap_mb FROM platform_settings ps WHERE ps.id = true;

  RETURN QUERY SELECT
    v_db_bytes,
    v_storage_bytes,
    v_db_cap_mb::bigint * 1024 * 1024,
    v_storage_cap_mb::bigint * 1024 * 1024,
    round(v_db_bytes::numeric / (v_db_cap_mb::numeric * 1024 * 1024) * 100, 1),
    round(v_storage_bytes::numeric / (v_storage_cap_mb::numeric * 1024 * 1024) * 100, 1);
END;
$$;

REVOKE ALL ON FUNCTION platform_resource_usage() FROM public;
GRANT EXECUTE ON FUNCTION platform_resource_usage() TO authenticated;
