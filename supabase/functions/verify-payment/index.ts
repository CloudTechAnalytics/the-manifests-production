import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyAndActivate, createServiceRoleClient } from "../_shared/paystack.ts";

/*
 * verify-payment
 *
 * Called by app/billing/callback/page.tsx right after Paystack redirects
 * the browser back — gives the user an immediate result instead of making
 * them wait for the webhook (which is still the source of truth /
 * reliability backstop for a closed-tab case, see paystack-webhook).
 * Re-verifies directly against Paystack itself (see verifyAndActivate) —
 * never trusts the reference alone as proof of payment.
 */
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
      .select("id, organization_id, role")
      .eq("id", callerData.user.id)
      .maybeSingle();
    if (!caller) return json(403, { error: "Profile not found" });

    let body: { reference?: string };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }
    if (!body.reference) return json(400, { error: "reference is required" });

    const admin = createServiceRoleClient();

    // The transaction must belong to the caller's own organization (or the
    // caller is platform_admin) — otherwise this becomes an oracle for
    // guessing/confirming another org's payment references.
    const { data: txn } = await admin
      .from("payment_transactions")
      .select("organization_id")
      .eq("reference", body.reference)
      .maybeSingle();
    if (!txn) return json(404, { error: "Transaction not found" });
    if (caller.role !== "platform_admin" && txn.organization_id !== caller.organization_id) {
      return json(403, { error: "Not your organization's transaction" });
    }

    const result = await verifyAndActivate(admin, body.reference);
    return json(200, result);
  } catch (err) {
    console.error("verify-payment unhandled error:", err);
    return json(500, { error: "Internal server error" });
  }
});
