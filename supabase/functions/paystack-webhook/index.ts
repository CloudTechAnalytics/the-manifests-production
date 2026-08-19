import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { verifyAndActivate, createServiceRoleClient, paystackSecretKey } from "../_shared/paystack.ts";

/*
 * paystack-webhook
 *
 * Server-to-server push from Paystack (Dashboard -> Settings -> API Keys &
 * Webhooks -> Webhook URL, a one-time dashboard step this repo can't do for
 * you — same as dispatch-webhook's Database Webhook setup). This is the
 * reliability backstop for verify-payment: if a customer pays but closes
 * the tab before the browser redirect completes, this is what still
 * activates their subscription.
 *
 * No JWT — Paystack can't send one. Authenticity instead comes from the
 * x-paystack-signature header: HMAC-SHA512 of the raw request body using
 * PAYSTACK_SECRET_KEY, which only Paystack and this function know. Deno
 * deploys don't set verify_jwt for this function (see deploy notes).
 */
async function verifySignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(paystackSecretKey()),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const computed = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  // Fixed-time-ish comparison isn't critical here (this isn't a password),
  // but a plain === is what every other exact-match check in this codebase
  // already uses (token hashes, etc.) — length-checked first so a shorter
  // forged signature can't short-circuit-compare as a partial match.
  return computed.length === signature.length && computed === signature;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!(await verifySignature(rawBody, signature))) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401 });
  }

  let event: { event?: string; data?: { reference?: string } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  // charge.success is the only event this app needs to act on for the
  // one-off-transaction model — no recurring-subscription events exist to
  // handle since Paystack's Subscriptions API isn't used (see migration
  // 077's docstring).
  if (event.event !== "charge.success" || !event.data?.reference) {
    return new Response(JSON.stringify({ received: true, skipped: true }), { status: 200 });
  }

  const admin = createServiceRoleClient();
  const result = await verifyAndActivate(admin, event.data.reference);

  return new Response(JSON.stringify({ received: true, ...result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
