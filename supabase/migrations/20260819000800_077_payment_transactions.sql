/*
# Real payment collection — payment_transactions + org_subscriptions.current_period_end

## What this replaces
Migration 018 documented that nothing in this schema processes an actual
payment — org_subscriptions was internal record-keeping only, and the app's
only "billing" flow was a Contact Sales mailto link plus a Platform Admin
manually flipping an org's plan. This adds a real Paystack-backed checkout
(edge functions initialize-payment / verify-payment / paystack-webhook):
an org admin pays for a plan, Paystack confirms the charge, and
org_subscriptions is updated automatically — no manual step.

## Why a transactions table, not just updating org_subscriptions directly
org_subscriptions is still "what plan is this org on right now" (one row
per org, per migration 018's own docstring) — it has nowhere to record
individual payment attempts, amounts, or Paystack's own reference/id. This
table is the append-only payment history: one row per checkout attempt,
success or not, which is also what a receipt or a support/dispute
investigation needs to reconstruct.

## Why one-off transactions, not Paystack's recurring Subscriptions API
Keeps this MVP simple and fully under this app's control: a payment covers
one billing period (current_period_end), and the org pays again to renew —
no saved card, no auto-debit, no dependency on syncing our own `plans`
table with Paystack's separate "Plan" objects. Consistent with how trial
expiry already works here (lazily computed from trial_ends_at, nothing
auto-charges or auto-suspends) — a follow-up project if true recurring
billing is wanted later.

## Security
Only SELECT is granted to authenticated users (their own org, or
platform_admin) — INSERT/UPDATE happen exclusively through the edge
functions' service-role client, the same "zero client write policies"
shape as email_verification_tokens. reference is UNIQUE so Paystack's own
reference can never collide across two transactions, and is what both
verify-payment (browser return) and paystack-webhook (server push) look
up by — whichever runs first marks the transaction success and activates
the subscription; the other is a no-op (checked by transaction status,
not re-processed).
*/

CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  provider text NOT NULL DEFAULT 'paystack',
  reference text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'abandoned')),
  paystack_transaction_id bigint,
  paid_at timestamptz,
  initiated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_org_transactions" ON payment_transactions;
CREATE POLICY "select_own_org_transactions" ON payment_transactions FOR SELECT
  TO authenticated USING (organization_id = get_user_org_id() OR is_platform_admin());

CREATE INDEX IF NOT EXISTS idx_payment_transactions_org ON payment_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_payment_transactions_updated_at') THEN
    CREATE TRIGGER trigger_payment_transactions_updated_at
      BEFORE UPDATE ON payment_transactions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- When the current paid period ends (set on successful payment: now() +
-- 1 month/year depending on billing_cycle). NULL for a trial that's never
-- been paid for. Distinct from trial_ends_at so a converted org's payment
-- history is never confused with its original trial window.
ALTER TABLE org_subscriptions ADD COLUMN IF NOT EXISTS current_period_end timestamptz;
