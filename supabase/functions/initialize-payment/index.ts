import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { corsHeaders, appOrigin } from "../_shared/cors.ts";
import { paystackSecretKey, createServiceRoleClient } from "../_shared/paystack.ts";

/*
 * initialize-payment
 *
 * Starts a Paystack checkout for the caller's own organization: creates a
 * pending payment_transactions row, asks Paystack to open a transaction for
 * that amount, and returns the hosted checkout URL to redirect the browser
 * to. Nothing is activated here — activation happens in verify-payment /
 * paystack-webhook once Paystack actually confirms the charge.
 *
 * Only an org's own admin or branch_manager may buy a plan for it — the
 * same role gate webhook subscriptions already use for a financial/
 * integration action, per app/(app)/settings/page.tsx's Webhooks tab.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function newReference(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `manifest_${hex}`;
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Missing authorization header" });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: callerData, error: callerError } = await supabaseClient.auth.getUser();
    if (callerError || !callerData.user) return json(401, { error: "Unauthorized" });

    const { data: caller } = await supabaseClient
      .from("profiles")
      .select("id, email, full_name, role, organization_id, is_active")
      .eq("id", callerData.user.id)
      .maybeSingle();

    if (!caller || !caller.is_active || !caller.organization_id) {
      return json(403, { error: "Profile not found" });
    }
    if (caller.role !== "admin" && caller.role !== "branch_manager") {
      return json(403, { error: "Only admins and branch managers can manage billing" });
    }

    let body: { plan_id?: string; billing_cycle?: string; return_to?: string };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    if (!body.plan_id || !UUID_RE.test(body.plan_id)) {
      return json(400, { error: "Invalid plan_id" });
    }
    if (body.billing_cycle !== "monthly" && body.billing_cycle !== "annual") {
      return json(400, { error: "billing_cycle must be 'monthly' or 'annual'" });
    }
    const billingCycle = body.billing_cycle;

    // Where /billing/callback sends the user after a successful payment —
    // e.g. back to /onboarding when checkout started there instead of the
    // default /dashboard. Must be a same-app relative path: rejects
    // anything that could redirect off this domain (a leading "//" is
    // parsed by browsers as a protocol-relative absolute URL).
    const returnTo =
      body.return_to && body.return_to.startsWith("/") && !body.return_to.startsWith("//")
        ? body.return_to
        : "/dashboard";

    const admin = createServiceRoleClient();

    // is_public excludes the internal Trial plan — it's never something
    // to buy, only auto-assigned. is_active means it's still offered.
    const { data: plan } = await admin
      .from("plans")
      .select("id, name, monthly_price, annual_price, currency, is_active, is_public")
      .eq("id", body.plan_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!plan || !plan.is_active || !plan.is_public) {
      return json(404, { error: "Plan not found" });
    }

    const amount = billingCycle === "annual" ? plan.annual_price : plan.monthly_price;
    if (!amount || amount <= 0) {
      return json(400, { error: `This plan has no ${billingCycle} price set` });
    }

    const { data: org } = await admin
      .from("organizations")
      .select("id, name")
      .eq("id", caller.organization_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!org) return json(404, { error: "Organization not found" });

    const reference = newReference();

    const { error: txnError } = await admin.from("payment_transactions").insert({
      organization_id: org.id,
      plan_id: plan.id,
      billing_cycle: billingCycle,
      amount,
      currency: plan.currency,
      provider: "paystack",
      reference,
      status: "pending",
      initiated_by: caller.id,
      metadata: { plan_name: plan.name, organization_name: org.name },
    });
    if (txnError) {
      console.error("payment_transactions insert error:", txnError.message);
      return json(500, { error: "Failed to start checkout" });
    }

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecretKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: caller.email,
        amount: Math.round(amount * 100), // kobo
        currency: plan.currency,
        reference,
        callback_url: `${appOrigin()}/billing/callback?return_to=${encodeURIComponent(returnTo)}`,
        metadata: {
          organization_id: org.id,
          plan_id: plan.id,
          billing_cycle: billingCycle,
          initiated_by: caller.id,
        },
      }),
    });

    const paystackData = await paystackRes.json();
    if (!paystackRes.ok || !paystackData?.status) {
      console.error("Paystack initialize error:", JSON.stringify(paystackData));
      await admin.from("payment_transactions").update({ status: "failed" }).eq("reference", reference);
      return json(502, { error: paystackData?.message ?? "Failed to start checkout with Paystack" });
    }

    return json(200, {
      authorization_url: paystackData.data.authorization_url,
      reference,
    });
  } catch (err) {
    console.error("initialize-payment unhandled error:", err);
    return json(500, { error: "Internal server error" });
  }
});
