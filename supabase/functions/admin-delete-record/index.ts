import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

/*
 * admin-delete-record
 *
 * Permanently deletes a customer, quotation, shipment, invoice, payment,
 * expense, or customs/terminal/examination/transportation record — org
 * `admin` only, and only within the admin's own organization. This is a
 * true cascade with no "must be empty first" guard, same as
 * delete-organization: ordinary RLS soft-delete/DELETE is left
 * completely untouched for every other role.
 *
 * Every entity except `customer` cascades or nulls out correctly via
 * existing FK actions on the tables themselves, so a single service-role
 * .delete() is enough and already atomic. `customer` is the one case
 * where several tables (invoices, payments, quotations, shipments,
 * shipment_plans) RESTRICT on customer_id, so it goes through
 * admin_force_delete_customer() — one atomic transaction — instead.
 */

function corsHeaders(req: Request) {
  const allowed = (Deno.env.get("APP_ORIGIN") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.get("Origin") ?? "";
  const allow = allowed.includes(origin) ? origin : (allowed[0] ?? "");
  return {
    "Access-Control-Allow-Origin": allow,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Client-Info, Apikey",
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ENTITY_TABLES: Record<string, string> = {
  customer: "customers",
  quotation: "quotations",
  shipment: "shipments",
  invoice: "invoices",
  payment: "payments",
  expense: "expenses",
  shipment_customs: "shipment_customs",
  terminal_operations: "terminal_operations",
  shipment_examinations: "shipment_examinations",
  shipment_transportation: "shipment_transportation",
};

const ENTITY_LABELS: Record<string, string> = {
  customer: "customer",
  quotation: "quotation",
  shipment: "shipment",
  invoice: "invoice",
  payment: "payment",
  expense: "expense",
  shipment_customs: "customs record",
  terminal_operations: "terminal record",
  shipment_examinations: "examination record",
  shipment_transportation: "transportation leg",
};

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: cors });
  }
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Missing authorization header" });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: callerData, error: callerError } = await supabaseClient.auth
      .getUser();
    if (callerError || !callerData.user) return json(401, { error: "Unauthorized" });

    const { data: caller } = await supabaseClient
      .from("profiles")
      .select("role, is_active, organization_id")
      .eq("id", callerData.user.id)
      .maybeSingle();

    if (!caller || !caller.is_active || caller.role !== "admin") {
      return json(403, { error: "Only organization admins can permanently delete records" });
    }

    let body: { entity_type?: string; id?: string };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    const table = body.entity_type ? ENTITY_TABLES[body.entity_type] : undefined;
    if (!table || !body.id || !UUID_RE.test(body.id)) {
      return json(400, { error: "Invalid entity_type or id" });
    }
    const label = ENTITY_LABELS[body.entity_type!];

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: record } = await admin
      .from(table)
      .select("id, branch_id")
      .eq("id", body.id)
      .maybeSingle();
    if (!record) return json(404, { error: `${label} not found` });

    const { data: branch } = await admin
      .from("branches")
      .select("organization_id")
      .eq("id", record.branch_id)
      .maybeSingle();

    if (!branch || branch.organization_id !== caller.organization_id) {
      return json(403, { error: `That ${label} belongs to another organization` });
    }

    // documents.shipment_id/customer_id cascade on delete — the rows
    // disappear automatically, but the files they pointed to don't clean
    // themselves up. Remove them from storage first, while we still know
    // which files belonged to this record.
    if (body.entity_type === "shipment" || body.entity_type === "customer") {
      const rpcName = body.entity_type === "shipment"
        ? "documents_file_paths_for_shipment"
        : "documents_file_paths_for_customer";
      const rpcArg = body.entity_type === "shipment"
        ? { p_shipment_id: body.id }
        : { p_customer_id: body.id };
      const { data: orphanedDocs } = await admin.rpc(rpcName, rpcArg);
      const paths = (orphanedDocs ?? []).map((d: { file_path: string }) => d.file_path);
      if (paths.length > 0) {
        const { error: storageError } = await admin.storage.from("documents").remove(paths);
        if (storageError) {
          // Not fatal — better to leave a few orphaned files than block a
          // deletion the admin explicitly requested over a storage hiccup.
          console.error("admin-delete-record storage cleanup error:", storageError.message);
        }
      }
    }

    // Logged before the delete — nothing left to reference once the row
    // it's about is actually gone.
    await admin.from("activities").insert({
      user_id: callerData.user.id,
      branch_id: record.branch_id,
      action: `${body.entity_type}.permanently_deleted`,
      entity_type: table,
      entity_id: body.id,
      description: `Permanently deleted a ${label}`,
    });

    const { error: deleteError } = body.entity_type === "customer"
      ? await admin.rpc("admin_force_delete_customer", { p_customer_id: body.id })
      : await admin.from(table).delete().eq("id", body.id);

    if (deleteError) {
      console.error(`admin-delete-record (${table}) error:`, deleteError.message);
      return json(400, { error: `Failed to delete this ${label}: ${deleteError.message}` });
    }

    return json(200, { success: true });
  } catch (err) {
    console.error("admin-delete-record unhandled error:", err);
    return json(500, { error: "Internal server error" });
  }
});
