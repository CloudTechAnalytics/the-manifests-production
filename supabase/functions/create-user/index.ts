import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const VALID_ROLES = new Set(["admin", "operations", "sales", "branch_manager"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      .select("role, is_active, organization_id")
      .eq("id", callerId)
      .maybeSingle();

    if (profileError || !callerProfile) {
      return jsonError(403, "Profile not found");
    }

    const callerIsPlatformAdmin = callerProfile.role === "platform_admin";

    if (
      !callerProfile.is_active ||
      (callerProfile.role !== "admin" && !callerIsPlatformAdmin)
    ) {
      return jsonError(403, "Only active admins can create users");
    }

    let body: {
      email?: string;
      full_name?: string;
      role?: string;
      branch_id?: string;
      password?: string;
    };

    try {
      body = await req.json();
    } catch {
      return jsonError(400, "Invalid JSON body");
    }

    if (!body.email || !body.full_name || !body.role || !body.branch_id || !body.password) {
      return jsonError(400, "Missing required fields");
    }

    if (!EMAIL_RE.test(body.email)) {
      return jsonError(400, "Invalid email format");
    }

    if (body.full_name.length > 200) {
      return jsonError(400, "Full name must be 200 characters or fewer");
    }

    if (!VALID_ROLES.has(body.role)) {
      return jsonError(400, "Invalid role");
    }

    if (!UUID_RE.test(body.branch_id)) {
      return jsonError(400, "Invalid branch_id");
    }

    if (body.password.length < 8) {
      return jsonError(400, "Password must be at least 8 characters");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    /*
     * Tenancy check. The new user's organization is taken from the branch
     * they are being placed in, and — for an org admin — that branch must
     * live in the caller's own organization. Without this an admin could
     * post any branch_id and plant a user inside another tenant. The
     * lookup runs on the service-role client so the decision is made
     * against the real row rather than an RLS-filtered view of it.
     */
    const { data: targetBranch } = await supabaseAdmin
      .from("branches")
      .select("id, organization_id")
      .eq("id", body.branch_id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!targetBranch) {
      return jsonError(400, "Invalid branch_id");
    }

    if (
      !callerIsPlatformAdmin &&
      targetBranch.organization_id !== callerProfile.organization_id
    ) {
      return jsonError(403, "That branch belongs to another organization");
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin
      .createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
      });

    if (authError) {
      console.error("createUser error:", authError.message);
      return jsonError(400, "Failed to create user account");
    }

    const newUserId = authData.user.id;

    const { error: insertError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: newUserId,
        email: body.email,
        full_name: body.full_name,
        role: body.role,
        organization_id: targetBranch.organization_id,
        branch_id: body.branch_id,
        is_active: true,
        must_change_password: true,
        created_by: callerId,
      });

    if (insertError) {
      console.error("profile insert error:", insertError.message);
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return jsonError(400, "Failed to create user profile");
    }

    await supabaseAdmin.from("activities").insert({
      user_id: callerId,
      branch_id: body.branch_id,
      action: "created_user",
      entity_type: "profiles",
      entity_id: newUserId,
      description: `Created user ${body.email} (${body.role})`,
    });

    return new Response(
      JSON.stringify({ success: true, user_id: newUserId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("create-user unhandled error:", err);
    return jsonError(500, "Internal server error");
  }
});
