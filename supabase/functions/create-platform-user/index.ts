import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

/*
 * create-platform-user
 *
 * Creates a CloudTech staff account with platform-wide access (role
 * 'platform_admin', organization_id/branch_id both null — same shape
 * migration 016's docstring describes for that role). Only callable by
 * an existing, active platform_admin. Mirrors create-user's pattern
 * exactly (admin sets a temporary password, the new user must change
 * it on first sign-in) rather than inventing a second convention.
 *
 * There is deliberately no sub-role selector here (the reference this
 * was modeled on offers "Platform Owner / Administrator / Support
 * Engineer / Sales / Developer / Finance") — this schema's user_role
 * enum has exactly one platform-level value, platform_admin. Adding
 * genuine tiered platform permissions is a real RBAC change, not
 * something to improvise inside this endpoint.
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    const callerId = callerData.user.id;

    const { data: callerProfile } = await supabaseClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", callerId)
      .maybeSingle();

    if (!callerProfile || !callerProfile.is_active || callerProfile.role !== "platform_admin") {
      return json(403, { error: "Only platform admins can add platform users" });
    }

    let body: { email?: string; full_name?: string; password?: string };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    const email = (body.email ?? "").trim().toLowerCase();
    const fullName = (body.full_name ?? "").trim();
    const password = body.password ?? "";

    if (!email || !fullName || !password) {
      return json(400, { error: "Missing required fields" });
    }
    if (!EMAIL_RE.test(email)) return json(400, { error: "Invalid email format" });
    if (fullName.length > 200) {
      return json(400, { error: "Full name must be 200 characters or fewer" });
    }
    if (password.length < 10) {
      return json(400, { error: "Password must be at least 10 characters" });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      console.error("create-platform-user createUser error:", authError?.message);
      // Most likely cause: the address already has an account.
      return json(400, { error: "Failed to create user account" });
    }

    const newUserId = authData.user.id;

    const { error: insertError } = await admin.from("profiles").insert({
      id: newUserId,
      email,
      full_name: fullName,
      role: "platform_admin",
      organization_id: null,
      branch_id: null,
      is_active: true,
      must_change_password: true,
      created_by: callerId,
    });

    if (insertError) {
      console.error("create-platform-user profile insert error:", insertError.message);
      await admin.auth.admin.deleteUser(newUserId);
      return json(400, { error: "Failed to create user profile" });
    }

    await admin.from("activities").insert({
      user_id: callerId,
      branch_id: null,
      organization_id: null,
      action: "platform_user.created",
      entity_type: "profiles",
      entity_id: newUserId,
      description: `Added platform user ${email}`,
    });

    return json(200, { success: true, user_id: newUserId });
  } catch (err) {
    console.error("create-platform-user unhandled error:", err);
    return json(500, { error: "Internal server error" });
  }
});
