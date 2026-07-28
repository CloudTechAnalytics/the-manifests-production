import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

/*
 * delete-organization
 *
 * Permanently deletes an organization AND its member accounts.
 * platform_admin only.
 *
 * Why this needs an edge function, not a plain client DELETE:
 * profiles.id is a FK to auth.users(id), so removing a member for real
 * means deleting their Supabase Auth account — auth.admin.deleteUser()
 * requires the service-role key, which the browser never holds. Deleting
 * the auth user cascades to their profile row automatically (ON DELETE
 * CASCADE), so profiles are never touched directly here.
 *
 * Still refuses if the organization has any branches. Every operational
 * table (shipments, customers, invoices, warehouse, etc.) requires a
 * branch_id, so zero branches means there is no operational history that
 * could be silently destroyed by this — only the org record and its bare
 * member accounts. This is a narrower cascade than "delete everything",
 * on purpose.
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
      .select("role, is_active")
      .eq("id", callerData.user.id)
      .maybeSingle();

    if (!caller || !caller.is_active || caller.role !== "platform_admin") {
      return json(403, { error: "Only platform admins can permanently delete organizations" });
    }

    let body: { organization_id?: string };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    if (!body.organization_id || !UUID_RE.test(body.organization_id)) {
      return json(400, { error: "Invalid organization_id" });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: org } = await admin
      .from("organizations")
      .select("id, name")
      .eq("id", body.organization_id)
      .maybeSingle();
    if (!org) return json(404, { error: "Organization not found" });

    const { count: branchCount } = await admin
      .from("branches")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", body.organization_id);

    if ((branchCount ?? 0) > 0) {
      return json(400, {
        error: `Can't delete ${org.name}: it still has ${branchCount} branch${branchCount === 1 ? "" : "es"}. Remove those first.`,
      });
    }

    const { data: members } = await admin
      .from("profiles")
      .select("id")
      .eq("organization_id", body.organization_id);

    for (const member of members ?? []) {
      const { error: deleteUserError } = await admin.auth.admin.deleteUser(member.id);
      if (deleteUserError) {
        console.error(`Failed to delete auth user ${member.id}:`, deleteUserError.message);
        return json(400, {
          error: `Failed to remove a member account while deleting ${org.name}. No changes were made to the remaining members — try again.`,
        });
      }
    }

    // Logged before the delete — organization_id would have nothing left
    // to reference once the row it's about is actually gone.
    await admin.from("activities").insert({
      user_id: callerData.user.id,
      organization_id: body.organization_id,
      action: "organization.permanently_deleted",
      entity_type: "organization",
      description: `Permanently deleted organization "${org.name}" (${members?.length ?? 0} member account${(members?.length ?? 0) === 1 ? "" : "s"} removed)`,
    });

    const { error: deleteOrgError } = await admin
      .from("organizations")
      .delete()
      .eq("id", body.organization_id);

    if (deleteOrgError) {
      console.error("organization delete error:", deleteOrgError.message);
      return json(400, { error: "Failed to delete organization" });
    }

    return json(200, { success: true, membersRemoved: members?.length ?? 0 });
  } catch (err) {
    console.error("delete-organization unhandled error:", err);
    return json(500, { error: "Internal server error" });
  }
});
