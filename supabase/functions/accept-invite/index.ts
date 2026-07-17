import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

/*
 * accept-invite
 *
 * Redeems an invitation: validates the token, creates the auth user, and
 * inserts the matching profile bound to the invitation's organization,
 * branch and role.
 *
 * This endpoint is PUBLIC by necessity — the invitee has no account yet,
 * so there is no session to authenticate. The token is therefore the only
 * credential, which drives three rules:
 *   1. The org/branch/role come from the STORED invitation, never from the
 *      request body. Otherwise anyone holding a staff invite could grant
 *      themselves admin, or join a different tenant.
 *   2. Failures are reported with one generic message, so the endpoint
 *      cannot be used to probe which tokens or emails exist.
 *   3. The token is looked up by hash; the raw token is never stored.
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

const TOKEN_RE = /^[0-9a-f]{64}$/i;
const MIN_PASSWORD = 8;

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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

  // One message for every rejection: unknown token, expired, already
  // used, revoked. Distinguishing them would let an attacker enumerate.
  const INVALID = "This invitation is invalid or has expired";

  try {
    let body: { token?: string; password?: string; full_name?: string };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    const token = (body.token ?? "").trim();
    if (!TOKEN_RE.test(token)) return json(400, { error: INVALID });
    if (!body.password || body.password.length < MIN_PASSWORD) {
      return json(400, {
        error: `Password must be at least ${MIN_PASSWORD} characters`,
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const tokenHash = await sha256Hex(token);

    const { data: invite } = await admin
      .from("invitations")
      .select(
        "id, organization_id, branch_id, email, full_name, role, expires_at, accepted_at, deleted_at",
      )
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (
      !invite ||
      invite.deleted_at !== null ||
      invite.accepted_at !== null ||
      new Date(invite.expires_at).getTime() < Date.now()
    ) {
      return json(400, { error: INVALID });
    }

    // Guard against the organization being removed or suspended between
    // the invite being sent and redeemed.
    const { data: org } = await admin
      .from("organizations")
      .select("id, is_active, deleted_at")
      .eq("id", invite.organization_id)
      .maybeSingle();
    if (!org || org.deleted_at !== null || !org.is_active) {
      return json(400, { error: INVALID });
    }

    const { data: authData, error: authError } = await admin.auth.admin
      .createUser({
        email: invite.email,
        password: body.password,
        email_confirm: true,
      });

    if (authError || !authData.user) {
      console.error("accept-invite createUser error:", authError?.message);
      // Most likely cause: the address already has an account.
      return json(400, { error: "Could not create your account" });
    }

    const newUserId = authData.user.id;

    // Role, organization and branch come from the invitation row — never
    // from the caller.
    const { error: profileError } = await admin.from("profiles").insert({
      id: newUserId,
      email: invite.email,
      full_name: body.full_name?.trim() || invite.full_name || invite.email,
      role: invite.role,
      organization_id: invite.organization_id,
      branch_id: invite.branch_id,
      is_active: true,
      must_change_password: false, // they just chose it themselves
    });

    if (profileError) {
      console.error("accept-invite profile error:", profileError.message);
      // Don't strand an auth user with no profile — that account could
      // sign in but resolve to nothing.
      await admin.auth.admin.deleteUser(newUserId);
      return json(400, { error: "Could not create your account" });
    }

    const { error: markError } = await admin
      .from("invitations")
      .update({
        accepted_at: new Date().toISOString(),
        accepted_by: newUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invite.id)
      .is("accepted_at", null); // no double-redeem

    if (markError) {
      console.error("accept-invite mark error:", markError.message);
    }

    // activities.branch_id is NOT NULL, but an org admin can legitimately
    // have no branch — log only when there is one to attribute it to,
    // rather than failing an otherwise-successful signup.
    if (invite.branch_id) {
      await admin.from("activities").insert({
        user_id: newUserId,
        branch_id: invite.branch_id,
        action: "user.joined",
        entity_type: "profiles",
        entity_id: newUserId,
        description: `${invite.email} accepted an invitation (${invite.role})`,
      });
    }

    return json(200, { success: true, email: invite.email });
  } catch (err) {
    console.error("accept-invite unhandled error:", err);
    return json(500, { error: "Internal server error" });
  }
});
