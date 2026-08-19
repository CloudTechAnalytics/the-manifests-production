import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.58.0";

/*
 * Shared between initialize-payment, verify-payment, and paystack-webhook —
 * the actual "mark this transaction paid and activate the subscription"
 * logic lives in one place (verifyAndActivate) so the browser-return path
 * and the server-to-server webhook path can never disagree about what a
 * successful payment does. Whichever of the two runs first does the work;
 * the other is a no-op, checked by the transaction's own stored status
 * rather than re-verifying and re-applying — a payment activates a
 * subscription exactly once no matter how many times Paystack retries the
 * webhook or the user reloads the callback page.
 */

const PAYSTACK_API = "https://api.paystack.co";

export function paystackSecretKey(): string {
  const key = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return key;
}

export interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data?: {
    id: number;
    status: string; // "success" | "failed" | "abandoned" | ...
    amount: number; // kobo
    currency: string;
    reference: string;
    paid_at: string | null;
    metadata: Record<string, unknown>;
  };
}

async function paystackVerify(reference: string): Promise<PaystackVerifyResponse> {
  const res = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${paystackSecretKey()}` },
  });
  return await res.json();
}

const PERIOD_MS: Record<"monthly" | "annual", number> = {
  monthly: 30 * 24 * 60 * 60 * 1000,
  annual: 365 * 24 * 60 * 60 * 1000,
};

export interface VerifyAndActivateResult {
  ok: boolean;
  status: "success" | "failed" | "already_processed" | "not_found" | "amount_mismatch";
  organization_id?: string;
}

/**
 * Looks up `reference`, re-verifies it directly against Paystack (never
 * trusts a webhook payload's own "status" field alone — an attacker who
 * can reach this endpoint at all still can't fake a charge without
 * Paystack itself confirming it), and on a genuine success:
 *   - marks the transaction success
 *   - activates org_subscriptions on the paid plan, with current_period_end
 *     set from billing_cycle
 *   - logs an activity row
 *   - best-effort emails a receipt (never blocks on failure)
 */
export async function verifyAndActivate(
  admin: SupabaseClient,
  reference: string,
): Promise<VerifyAndActivateResult> {
  const { data: txn, error: txnError } = await admin
    .from("payment_transactions")
    .select("id, organization_id, plan_id, billing_cycle, amount, currency, status, initiated_by")
    .eq("reference", reference)
    .maybeSingle();

  if (txnError || !txn) return { ok: false, status: "not_found" };
  if (txn.status === "success") {
    return { ok: true, status: "already_processed", organization_id: txn.organization_id };
  }

  const verified = await paystackVerify(reference);
  const data = verified.data;

  if (!verified.status || !data || data.status !== "success") {
    await admin
      .from("payment_transactions")
      .update({ status: "failed" })
      .eq("id", txn.id)
      .eq("status", "pending"); // never downgrade a row another call already resolved
    return { ok: false, status: "failed", organization_id: txn.organization_id };
  }

  // Paystack amounts are in kobo; payment_transactions.amount is naira.
  // A mismatch means the reference was reused/tampered with client-side —
  // refuse to activate anything on it.
  const expectedKobo = Math.round(Number(txn.amount) * 100);
  if (data.amount !== expectedKobo) {
    console.error(`Amount mismatch for ${reference}: expected ${expectedKobo}, got ${data.amount}`);
    await admin
      .from("payment_transactions")
      .update({ status: "failed" })
      .eq("id", txn.id)
      .eq("status", "pending");
    return { ok: false, status: "amount_mismatch", organization_id: txn.organization_id };
  }

  // Guard against a race between verify-payment and the webhook both
  // arriving at once: only the call that actually flips pending -> success
  // proceeds to activate the subscription; the loser sees 0 rows updated.
  const { data: updated } = await admin
    .from("payment_transactions")
    .update({ status: "success", paid_at: data.paid_at ?? new Date().toISOString(), paystack_transaction_id: data.id })
    .eq("id", txn.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (!updated) {
    return { ok: true, status: "already_processed", organization_id: txn.organization_id };
  }

  const periodMs = PERIOD_MS[txn.billing_cycle as "monthly" | "annual"] ?? PERIOD_MS.monthly;
  const currentPeriodEnd = new Date(Date.now() + periodMs).toISOString();

  await admin
    .from("org_subscriptions")
    .upsert(
      {
        organization_id: txn.organization_id,
        plan_id: txn.plan_id,
        status: "active",
        billing_cycle: txn.billing_cycle,
        trial_ends_at: null,
        current_period_end: currentPeriodEnd,
        started_at: new Date().toISOString(),
        updated_by: txn.initiated_by,
      },
      { onConflict: "organization_id" },
    );

  await admin.from("activities").insert({
    user_id: txn.initiated_by,
    organization_id: txn.organization_id,
    action: "subscription.paid",
    entity_type: "payment_transactions",
    entity_id: txn.id,
    description: `Payment of ${txn.currency} ${Number(txn.amount).toLocaleString()} confirmed (${txn.billing_cycle})`,
  });

  await sendReceiptEmail(admin, txn.organization_id, txn.id).catch((err) =>
    console.error("Receipt email failed:", err),
  );

  return { ok: true, status: "success", organization_id: txn.organization_id };
}

async function sendReceiptEmail(admin: SupabaseClient, organizationId: string, transactionId: string): Promise<void> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) return;

  const [{ data: org }, { data: txn }] = await Promise.all([
    admin.from("organizations").select("name, email").eq("id", organizationId).maybeSingle(),
    admin
      .from("payment_transactions")
      .select("amount, currency, billing_cycle, reference, plan:plans(name)")
      .eq("id", transactionId)
      .maybeSingle(),
  ]);
  if (!org?.email || !txn) return;

  const planName = (txn.plan as unknown as { name: string } | null)?.name ?? "your plan";

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("EMAIL_FROM") ?? "The Manifest <onboarding@resend.dev>",
      to: org.email,
      subject: `Payment received — ${planName}`,
      html: `
        <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#231F1B">
          <h1 style="font-size:20px;margin:0 0 16px">Payment received</h1>
          <p style="font-size:14px;line-height:1.6;margin:0 0 12px">
            Thanks — we've received your payment for <strong>${planName}</strong> (${txn.billing_cycle}).
          </p>
          <table style="width:100%;border-collapse:collapse;margin-top:16px">
            <tr><td style="padding:4px 0;color:#8A8178">Amount</td><td style="padding:4px 0;text-align:right"><strong>${txn.currency} ${Number(txn.amount).toLocaleString()}</strong></td></tr>
            <tr><td style="padding:4px 0;color:#8A8178">Reference</td><td style="padding:4px 0;text-align:right"><strong>${txn.reference}</strong></td></tr>
          </table>
          <p style="font-size:12px;color:#8A8178;line-height:1.6;margin:24px 0 0">The Manifest</p>
        </div>
      `,
    }),
  }).catch((err) => console.error("Resend receipt send failed:", err));
}

export function createServiceRoleClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
