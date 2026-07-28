import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

/*
 * reset-user-password
 *
 * Admin-only: force-sets another user's password and flags
 * must_change_password so they're required to pick their own on next
 * sign-in. Cannot be used on yourself (use the change-password page) or
 * on an inactive account.
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

    const { data: callerData, error: callerError } =
      await supabaseClient.auth.getUser();
    if (callerError || !callerData.user) return json(401, { error: "Unauthorized" });

    const callerId = callerData.user.id;

    const { data: callerProfile } = await supabaseClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", callerId)
      .maybeSingle();

    if (!callerProfile) return json(403, { error: "Profile not found" });
    if (!callerProfile.is_active || callerProfile.role !== "admin") {
      return json(403, { error: "Only active admins can reset passwords" });
    }

    let body: { user_id?: string; new_password?: string };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    if (!body.user_id || !body.new_password) {
      return json(400, { error: "Missing user_id or new_password" });
    }
    if (!UUID_RE.test(body.user_id)) return json(400, { error: "Invalid user_id" });
    if (body.new_password.length < 8) {
      return json(400, { error: "Password must be at least 8 characters" });
    }
    if (body.user_id === callerId) {
      return json(400, { error: "Use the change password page to change your own password" });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: targetProfile } = await admin
      .from("profiles")
      .select("id, is_active, branch_id, organization_id")
      .eq("id", body.user_id)
      .maybeSingle();

    if (!targetProfile) return json(404, { error: "Target user not found" });
    if (!targetProfile.is_active) {
      return json(400, { error: "Cannot reset password for inactive user" });
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(
      body.user_id,
      { password: body.new_password },
    );

    if (updateError) {
      console.error("updateUserById error:", updateError.message);
      return json(400, { error: "Failed to reset password" });
    }

    await admin
      .from("profiles")
      .update({ must_change_password: true, updated_by: callerId })
      .eq("id", body.user_id);

    await admin.from("activities").insert({
      user_id: callerId,
      branch_id: targetProfile.branch_id,
      organization_id: targetProfile.branch_id ? null : targetProfile.organization_id,
      action: "user.password_reset",
      entity_type: "profiles",
      entity_id: body.user_id,
      description: "Admin reset user password",
    });

    return json(200, { success: true });
  } catch (err) {
    console.error("reset-user-password unhandled error:", err);
    return json(500, { error: "Internal server error" });
  }
});
