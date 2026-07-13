import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(status: number, message: string) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed");
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonError(401, "Missing authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: callerData, error: callerError } =
      await supabaseClient.auth.getUser();

    if (callerError || !callerData.user) {
      return jsonError(401, "Unauthorized");
    }

    const callerId = callerData.user.id;

    const { data: callerProfile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", callerId)
      .maybeSingle();

    if (profileError || !callerProfile) {
      return jsonError(403, "Profile not found");
    }

    if (!callerProfile.is_active || callerProfile.role !== "admin") {
      return jsonError(403, "Only active admins can reset passwords");
    }

    let body: { user_id?: string; new_password?: string };

    try {
      body = await req.json();
    } catch {
      return jsonError(400, "Invalid JSON body");
    }

    if (!body.user_id || !body.new_password) {
      return jsonError(400, "Missing user_id or new_password");
    }

    if (!UUID_RE.test(body.user_id)) {
      return jsonError(400, "Invalid user_id");
    }

    if (body.new_password.length < 8) {
      return jsonError(400, "Password must be at least 8 characters");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("id, is_active")
      .eq("id", body.user_id)
      .maybeSingle();

    if (targetError || !targetProfile) {
      return jsonError(404, "Target user not found");
    }

    if (!targetProfile.is_active) {
      return jsonError(400, "Cannot reset password for inactive user");
    }

    if (body.user_id === callerId) {
      return jsonError(400, "Use the change password page to change your own password");
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      body.user_id,
      { password: body.new_password },
    );

    if (updateError) {
      console.error("updateUserById error:", updateError.message);
      return jsonError(400, "Failed to reset password");
    }

    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true, updated_by: callerId })
      .eq("id", body.user_id);

    await supabaseAdmin.from("activities").insert({
      user_id: callerId,
      branch_id: null,
      action: "reset_user_password",
      entity_type: "profiles",
      entity_id: body.user_id,
      description: "Admin reset user password",
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("reset-user-password unhandled error:", err);
    return jsonError(500, "Internal server error");
  }
});
