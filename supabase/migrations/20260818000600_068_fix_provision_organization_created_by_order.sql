/*
# Fix: provision_organization violated organizations_created_by_fkey

## Bug
organizations.created_by REFERENCES profiles(id) (migration 014) — not
auth.users(id). provision_organization inserted the organizations row
with created_by = p_owner_user_id *before* that user's profiles row
existed (the profile is only created a few statements later, once the
org and branch already exist), so every self-service registration failed
with a 23503 foreign key violation. Caught via a live smoke test against
yqztmgmyvwackkcppgip immediately after deploying — never actually
exercised until then.

## Fix
Insert the organization with created_by NULL, then set it to the owner
once their profile actually exists (a few lines later, same
transaction). Same fix shape applies to nothing else — branches has no
created_by column, and consent_records/activities reference auth.users
directly, not profiles, so their insert order was never a problem.
*/

CREATE OR REPLACE FUNCTION provision_organization(
  p_owner_user_id uuid,
  p_owner_email text,
  p_owner_full_name text,
  p_owner_phone text,
  p_org_name text,
  p_business_type text,
  p_country text,
  p_city text,
  p_business_email text,
  p_phone text,
  p_registration_number text,
  p_website text,
  p_expected_users integer,
  p_expected_monthly_shipments integer,
  p_referral_source text,
  p_terms_version text,
  p_privacy_version text,
  p_ip_address text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_org_id uuid;
  v_org_id uuid;
  v_branch_id uuid;
  v_branch_code text;
  v_base_slug text;
  v_slug text;
  v_suffix integer := 0;
  v_plan_id uuid;
  v_trial_days integer;
  v_trial_ends_at timestamptz;
BEGIN
  SELECT organization_id INTO v_existing_org_id FROM profiles WHERE id = p_owner_user_id;

  IF v_existing_org_id IS NOT NULL THEN
    SELECT id INTO v_branch_id FROM branches
      WHERE organization_id = v_existing_org_id AND deleted_at IS NULL
      ORDER BY created_at ASC LIMIT 1;
    RETURN jsonb_build_object('organization_id', v_existing_org_id, 'branch_id', v_branch_id, 'resumed', true);
  END IF;

  IF p_business_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM organizations WHERE lower(email) = lower(p_business_email) AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'duplicate_business_email' USING ERRCODE = '23505';
  END IF;

  IF p_registration_number IS NOT NULL AND EXISTS (
    SELECT 1 FROM organizations WHERE lower(registration_number) = lower(p_registration_number) AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'duplicate_registration_number' USING ERRCODE = '23505';
  END IF;

  v_base_slug := slugify(p_org_name);
  IF v_base_slug = '' THEN v_base_slug := 'org'; END IF;
  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  END LOOP;

  -- created_by starts NULL — the owner's own profiles row doesn't exist
  -- yet (organizations.created_by REFERENCES profiles, not auth.users)
  -- — and is backfilled below once it does.
  INSERT INTO organizations (
    name, slug, city, country, phone, email, status, origin,
    business_type, registration_number, website,
    expected_users, expected_monthly_shipments, referral_source, created_by
  ) VALUES (
    p_org_name, v_slug, p_city, p_country, p_phone, p_business_email,
    'pending_verification', 'self_service',
    p_business_type, p_registration_number, p_website,
    p_expected_users, p_expected_monthly_shipments, p_referral_source, NULL
  ) RETURNING id INTO v_org_id;

  v_branch_code := 'HQ-' || upper(substr(replace(v_org_id::text, '-', ''), 1, 8));

  INSERT INTO branches (name, code, organization_id)
  VALUES ('Head Office', v_branch_code, v_org_id)
  RETURNING id INTO v_branch_id;

  PERFORM seed_default_departments(v_org_id);

  -- The owner is a branch-less ("general") admin, same shape as the
  -- existing "brand-new organization's first admin" case create-user
  -- already handles — org-wide visibility, not pinned to one branch.
  INSERT INTO profiles (id, email, full_name, phone, role, organization_id, branch_id, is_active, must_change_password, created_by)
  VALUES (p_owner_user_id, p_owner_email, p_owner_full_name, p_owner_phone, 'admin', v_org_id, NULL, true, false, p_owner_user_id);

  UPDATE organizations SET created_by = p_owner_user_id WHERE id = v_org_id;

  SELECT trial_duration_days, default_trial_plan_id INTO v_trial_days, v_plan_id
    FROM platform_settings WHERE id = true;

  IF v_plan_id IS NULL THEN
    SELECT id INTO v_plan_id FROM plans WHERE slug = 'trial' AND deleted_at IS NULL;
  END IF;
  IF v_trial_days IS NULL THEN
    v_trial_days := 14;
  END IF;

  v_trial_ends_at := now() + make_interval(days => v_trial_days);

  IF v_plan_id IS NOT NULL THEN
    INSERT INTO org_subscriptions (organization_id, plan_id, status, trial_ends_at, started_at)
    VALUES (v_org_id, v_plan_id, 'trial', v_trial_ends_at, now());
  END IF;

  INSERT INTO consent_records (profile_id, organization_id, terms_version, privacy_version, ip_address)
  VALUES (p_owner_user_id, v_org_id, p_terms_version, p_privacy_version, p_ip_address);

  INSERT INTO activities (user_id, organization_id, branch_id, action, entity_type, entity_id, description) VALUES
    (p_owner_user_id, v_org_id, NULL, 'organization.registered', 'organizations', v_org_id, 'Organization "' || p_org_name || '" registered via self-service'),
    (p_owner_user_id, v_org_id, NULL, 'owner.created', 'profiles', p_owner_user_id, 'Organization owner ' || p_owner_email || ' created'),
    (p_owner_user_id, v_org_id, v_branch_id, 'branch.created', 'branches', v_branch_id, 'Head Office branch created'),
    (p_owner_user_id, v_org_id, NULL, 'departments.created', 'departments', NULL, 'Default departments created'),
    (p_owner_user_id, v_org_id, NULL, 'trial.started', 'org_subscriptions', v_org_id, 'Trial subscription started (' || v_trial_days || ' days)');

  RETURN jsonb_build_object('organization_id', v_org_id, 'branch_id', v_branch_id, 'slug', v_slug, 'resumed', false);
END;
$$;
