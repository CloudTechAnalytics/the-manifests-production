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
