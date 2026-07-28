import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

/*
 * delete-organization
 *
 * Permanently deletes an organization: every branch, every shipment,
 * customer, quotation, invoice, payment, expense, warehouse record,
 * document, and member login under it. platform_admin only. This is a
 * true cascade with no "must be empty first" guard — confirmed
 * deliberately irreversible.
 *
 * Why this needs an edge function, not a plain client DELETE:
 * profiles.id is a FK to auth.users(id), so removing a member for real
 * means deleting their Supabase Auth account — auth.admin.deleteUser()
 * requires the service-role key, which the browser never holds. Deleting
 * the auth user cascades to their profile row automatically (ON DELETE
 * CASCADE), so profiles are never touched directly here.
 *
 * Order matters here and is not arbitrary: created_by/updated_by (and,
 * on expenses, paid_by/approved_by) on customers, quotations, shipments,
 * invoices, payments, and expenses all reference auth.users(id) with no
 * ON DELETE action, so Postgres refuses to delete a member's auth
 * account while any of those rows still name them as creator/editor.
 * permanently_delete_organization_data() must therefore run BEFORE any
 * member is removed — it wipes every branch and everything under it
 * (which clears those references) in one atomic transaction, and also
 * nulls out profiles.created_by/updated_by so one member's profile can
 * never block deleting another member's auth account. Only after that
 * cascade succeeds are member auth accounts removed (one Admin API call
 * each, the only safe way to erase a login), and only after that is the
 * organizations row itself deleted, since profiles.organization_id and
 * branches.organization_id are both ON DELETE RESTRICT.
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

    const { data: members } = await admin
      .from("profiles")
      .select("id")
      .eq("organization_id", body.organization_id);

    // Must run before any member is removed: it clears every business-data
    // row that could still name a member as created_by/updated_by (which
    // would otherwise block deleting their auth account), and nulls out
    // profiles.created_by/updated_by so members can't block each other.
    const { error: cascadeError } = await admin.rpc(
      "permanently_delete_organization_data",
      { p_org_id: body.organization_id },
    );
    if (cascadeError) {
      console.error("cascade delete error:", cascadeError.message);
      return json(400, {
        error: `Failed to delete ${org.name}'s branches and business data: ${cascadeError.message}. No member accounts were removed — try again.`,
      });
    }

    for (const member of members ?? []) {
      const { error: deleteUserError } = await admin.auth.admin.deleteUser(member.id);
      if (deleteUserError) {
        // A profile with no matching auth.users row (e.g. left over from an
        // earlier partial failure) has nothing left to delete — that's not
        // a reason to block the whole cascade, so only genuinely unexpected
        // errors abort here.
        const notFound = deleteUserError.status === 404 ||
          /not.?found/i.test(deleteUserError.message);
        if (!notFound) {
          console.error(`Failed to delete auth user ${member.id}:`, deleteUserError.message);
          return json(400, {
            error: `Failed to remove a member account while deleting ${org.name}: ${deleteUserError.message}. Its branches and business data were already deleted; try again to finish removing members and the organization.`,
          });
        }
        // Orphaned profile: delete the row directly since there's no auth
        // user left whose deletion would have cascaded it away.
        await admin.from("profiles").delete().eq("id", member.id);
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
      return json(400, { error: `Failed to delete organization: ${deleteOrgError.message}` });
    }

    return json(200, { success: true, membersRemoved: members?.length ?? 0 });
  } catch (err) {
    console.error("delete-organization unhandled error:", err);
    return json(500, { error: "Internal server error" });
  }
});
