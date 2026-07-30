import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

/*
 * update-user-roles
 *
 * Replaces a user's *additional* roles (everything beyond their primary
 * profiles.role) with the given set — admin only, same org only.
 *
 * Why this needs an edge function, not a plain client write:
 * user_roles has no client INSERT/UPDATE/DELETE policy at all — granting
 * someone a role (especially 'admin') is privilege-escalation-sensitive,
 * so writes only ever happen through this trusted, server-verified path,
 * same reasoning already applied to warehouse_stock.
 *
 * `roles` here is the full replacement set of *additional* roles, not
 * including whatever the caller chose as the target's primary role —
 * the primary role itself is updated separately via the existing
 * direct profiles.role update already used by the Users page (unchanged
 * by this function).
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

const VALID_ROLES = new Set([
  "admin", "operations", "sales", "branch_manager", "finance", "customs",
  "planning", "documentation", "terminal", "examination", "warehouse", "transport",
]);

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

    // has_role() already requires is_active — reusing it here keeps this
    // check identical to every RLS policy that gates on being an admin.
    const { data: isAdmin } = await supabaseClient.rpc("has_role", { p_role: "admin" });
    if (!isAdmin) return json(403, { error: "Only admins can change user roles" });

    const { data: caller } = await supabaseClient
      .from("profiles")
      .select("organization_id")
      .eq("id", callerData.user.id)
      .maybeSingle();
    if (!caller?.organization_id) return json(403, { error: "No organization on this account" });

    let body: { user_id?: string; roles?: string[] };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    if (!body.user_id || !UUID_RE.test(body.user_id)) {
      return json(400, { error: "Invalid user_id" });
    }
    const roles = Array.isArray(body.roles) ? Array.from(new Set(body.roles)) : [];
    for (const r of roles) {
      if (!VALID_ROLES.has(r)) return json(400, { error: `Invalid role: ${r}` });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: target } = await admin
      .from("profiles")
      .select("id, organization_id, full_name")
      .eq("id", body.user_id)
      .maybeSingle();
    if (!target) return json(404, { error: "User not found" });
    if (target.organization_id !== caller.organization_id) {
      return json(403, { error: "That user belongs to another organization" });
    }

    const { error: deleteError } = await admin
      .from("user_roles")
      .delete()
      .eq("user_id", body.user_id);
    if (deleteError) {
      console.error("update-user-roles delete error:", deleteError.message);
      return json(400, { error: `Failed to update roles: ${deleteError.message}` });
    }

    if (roles.length > 0) {
      const { error: insertError } = await admin
        .from("user_roles")
        .insert(roles.map((role) => ({ user_id: body.user_id, role })));
      if (insertError) {
        console.error("update-user-roles insert error:", insertError.message);
        return json(400, { error: `Failed to update roles: ${insertError.message}` });
      }
    }

    await admin.from("activities").insert({
      user_id: callerData.user.id,
      organization_id: caller.organization_id,
      action: "user.roles_updated",
      entity_type: "profiles",
      entity_id: body.user_id,
      description: `Updated roles for ${target.full_name}`,
      metadata: { roles },
    });

    return json(200, { success: true });
  } catch (err) {
    console.error("update-user-roles unhandled error:", err);
    return json(500, { error: "Internal server error" });
  }
});
