/*
# Plans & Subscriptions

## What this is — and isn't
Internal record-keeping for the platform operator: plans are defined
here, and an organization is assigned one via org_subscriptions. MRR/ARR
on the Platform Console are real sums over these tables, because the
assignment is real — but nothing here processes an actual payment.
There is no Stripe integration, no card on file, no invoicing. A plan's
max_users/storage_gb are display-only figures for the platform_admin's
own reference; they are not enforced anywhere in create-user or
invite-user.

## Why one subscription per org, not a history table
Scope is "what plan is this org on right now," not billing history —
org_subscriptions.organization_id is UNIQUE, so changing an org's plan
or status is an UPDATE on its one row, not a new row.

## Why plans use is_active instead of hard delete
plan_id on org_subscriptions is ON DELETE RESTRICT, so a plan actively
assigned to an organization can't be dropped out from under it. Retiring
a plan (stop offering it to new orgs, keep it working for whoever is
already on it) is a soft is_active = false instead.
*/

CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  monthly_price numeric(12,2) NOT NULL DEFAULT 0,
  annual_price numeric(12,2),
  currency text NOT NULL DEFAULT 'NGN',
  max_users integer,
  storage_gb integer,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admin_all_plans" ON plans;
CREATE POLICY "platform_admin_all_plans" ON plans FOR ALL
  TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE TABLE IF NOT EXISTS org_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'suspended', 'cancelled')),
  billing_cycle text NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  seats integer NOT NULL DEFAULT 1,
  trial_ends_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE org_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admin_all_subscriptions" ON org_subscriptions;
CREATE POLICY "platform_admin_all_subscriptions" ON org_subscriptions FOR ALL
  TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE INDEX IF NOT EXISTS idx_plans_active ON plans(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_plan_id ON org_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_status ON org_subscriptions(status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_plans_updated_at') THEN
    CREATE TRIGGER trigger_plans_updated_at
      BEFORE UPDATE ON plans
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_org_subscriptions_updated_at') THEN
    CREATE TRIGGER trigger_org_subscriptions_updated_at
      BEFORE UPDATE ON org_subscriptions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
