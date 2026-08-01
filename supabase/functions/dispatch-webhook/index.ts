import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

/*
 * dispatch-webhook
 *
 * Fan-out target for a Supabase Database Webhook. Not called by the app
 * directly — configure a Database Webhook (dashboard: Database →
 * Webhooks) on `shipments`, `shipment_customs`, and `invoices` for
 * INSERT/UPDATE, pointing at this function's URL with an
 * `Authorization: Bearer <DB_WEBHOOK_SECRET>` header. That's a one-time
 * dashboard step this repo can't do for you — Database Webhook
 * registration isn't expressible in a SQL migration.
 *
 * On each row change, works out which of our own semantic event names
 * (shipment.status_changed, shipment.created, customs.status_changed,
 * invoice.paid) it corresponds to, looks up active
 * `webhook_subscriptions` for that branch + event type, and POSTs a
 * signed payload to each one. The signature is HMAC-SHA256 over the raw
 * JSON body using that subscription's own `signing_secret`, sent as
 * `X-Signature: <hex>` — subscribers verify it to confirm the request
 * actually came from us.
 *
 * It also emails the customer directly on shipment.status_changed, via
 * Resend (free tier, no card required — see RESEND_API_KEY below). This
 * piggybacks on the same Database Webhook trigger so there's only one
 * dashboard step to configure, not two.
 *
 * Required secrets (Supabase dashboard: Edge Functions → Secrets, or
 * `supabase secrets set NAME=value`):
 *   DB_WEBHOOK_SECRET   - shared secret the Database Webhook sends as
 *                          "Authorization: Bearer <value>"; you choose it
 *   RESEND_API_KEY       - from resend.com; omit to skip email entirely
 *                          (webhook fan-out above still runs)
 * Optional:
 *   RESEND_FROM_EMAIL    - defaults to "The Manifest <onboarding@resend.dev>",
 *                          which Resend only lets you send to your OWN
 *                          verified email until you verify a sending
 *                          domain in the Resend dashboard (free, just DNS
 *                          records) — needed before this can reach real
 *                          customers
 *   APP_PUBLIC_URL        - used to link to the public tracking page;
 *                          omitted from the email if not set
 */

interface DbWebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
}

function resolveEventType(payload: DbWebhookPayload): string | null {
  const { table, type, record, old_record } = payload;
  if (!record) return null;

  if (table === "shipments") {
    if (type === "INSERT") return "shipment.created";
    if (type === "UPDATE" && old_record && record.status !== old_record.status) {
      return "shipment.status_changed";
    }
    return null;
  }
  if (table === "shipment_customs") {
    if (type === "UPDATE" && old_record && record.status !== old_record.status) {
      return "customs.status_changed";
    }
    return null;
  }
  if (table === "invoices") {
    if (type === "UPDATE" && old_record && record.status === "paid" && old_record.status !== "paid") {
      return "invoice.paid";
    }
    return null;
  }
  return null;
}

const STATUS_LABELS: Record<string, string> = {
  booking_received: "Booking Received",
  documentation: "Documentation",
  processing: "Processing",
  in_transit: "In Transit",
  arrived: "Arrived",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

async function sendStatusEmail(
  supabase: ReturnType<typeof createClient>,
  record: Record<string, unknown>,
): Promise<void> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) return; // Not configured — silently skip, webhook fan-out still runs.

  const customerId = record.customer_id as string | undefined;
  if (!customerId) return;

  const { data: customer } = await supabase
    .from("customers")
    .select("email, company_name")
    .eq("id", customerId)
    .maybeSingle();

  if (!customer?.email) return;

  const status = String(record.status ?? "");
  const statusLabel = STATUS_LABELS[status] ?? status;
  const reference = String(record.reference_number ?? "your shipment");
  const appUrl = Deno.env.get("APP_PUBLIC_URL");
  const trackingLine = appUrl
    ? `<p><a href="${appUrl}/track?ref=${encodeURIComponent(reference)}">Track this shipment</a></p>`
    : "";

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM_EMAIL") ?? "The Manifest <onboarding@resend.dev>",
      to: customer.email,
      subject: `Shipment ${reference} — ${statusLabel}`,
      html: `
        <p>Hi ${customer.company_name ?? "there"},</p>
        <p>Your shipment <strong>${reference}</strong> is now <strong>${statusLabel}</strong>.</p>
        ${trackingLine}
        <p>— The Manifest</p>
      `,
    }),
  }).catch((err) => console.error("Resend send failed:", err));
}

async function signPayload(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const expectedSecret = Deno.env.get("DB_WEBHOOK_SECRET");
  const authHeader = req.headers.get("Authorization");
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let payload: DbWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const eventType = resolveEventType(payload);
  if (!eventType || !payload.record) {
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }

  const branchId = payload.record.branch_id as string | undefined;
  if (!branchId) {
    return new Response(JSON.stringify({ skipped: true, reason: "no branch_id" }), { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (eventType === "shipment.status_changed") {
    await sendStatusEmail(supabase, payload.record);
  }

  const { data: subscriptions, error } = await supabase
    .from("webhook_subscriptions")
    .select("id, target_url, signing_secret, event_types")
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .contains("event_types", [eventType]);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const deliveries = await Promise.allSettled(
    (subscriptions ?? []).map(async (sub) => {
      const body = JSON.stringify({
        event: eventType,
        table: payload.table,
        record: payload.record,
        sent_at: new Date().toISOString(),
      });
      const signature = await signPayload(sub.signing_secret, body);
      return fetch(sub.target_url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Signature": signature },
        body,
      });
    }),
  );

  return new Response(
    JSON.stringify({ event: eventType, delivered: deliveries.length }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
