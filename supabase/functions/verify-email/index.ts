import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { corsHeaders, clientIp } from "../_shared/cors.ts";
import { sha256Hex } from "../_shared/tokens.ts";

/*
 * verify-email
 *
 * Public. Consumes a registration verification token: single-use
 * (consumed_at), time-limited (expires_at), and every failure path — not
 * found, already consumed, expired — returns the exact same generic
 * message, so the response can never be used to probe which state a token
 * is in. Confirms the email at the Supabase Auth layer too
 * (email_confirm: true) so auth.users.email_confirmed_at matches, and
 * flips the organization from pending_verification to active_trial.
 *
 * Safe to call twice with the same link (spec Test E "opens the
 * verification link twice"): the second call finds consumed_at already
 * set and returns the same generic invalid/expired message, not a crash
 * or a double-processed organization.
 */

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const GENERIC_INVALID = "This verification link is invalid or has expired. Please request a new one.";

  try {
    let body: { token?: string };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    const token = (body.token ?? "").trim();
    if (!token) return json(400, { error: GENERIC_INVALID });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const ip = clientIp(req);
    const { data: ipOk } = await admin.rpc("check_rate_limit", {
      p_key: `verify:ip:${ip}`, p_max: 30, p_window_seconds: 3600,
    });
    if (ipOk === false) {
      return json(429, { error: "Too many attempts. Please try again later." });
    }

    const tokenHash = await sha256Hex(token);

    const { data: row } = await admin
      .from("email_verification_tokens")
      .select("id, user_id, organization_id, expires_at, consumed_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!row || row.consumed_at || new Date(row.expires_at) < new Date()) {
      return json(400, { error: GENERIC_INVALID });
    }

    const { error: consumeError } = await admin
      .from("email_verification_tokens")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("consumed_at", null);
    if (consumeError) {
      console.error("verify-email consume error:", consumeError.message);
      return json(500, { error: "Something went wrong. Please try again." });
    }

    const { data: userData } = await admin.auth.admin.getUserById(row.user_id);
    const email = userData?.user?.email ?? null;

    await admin.auth.admin.updateUserById(row.user_id, { email_confirm: true });

    await admin
      .from("organizations")
      .update({ status: "active_trial" })
      .eq("id", row.organization_id)
      .eq("status", "pending_verification");

    await admin.from("activities").insert({
      user_id: row.user_id,
      organization_id: row.organization_id,
      branch_id: null,
      action: "email.verified",
      entity_type: "profiles",
      entity_id: row.user_id,
      description: `Email verified${email ? ` for ${email}` : ""}`,
    });

    return json(200, { success: true, email });
  } catch (err) {
    console.error("verify-email unhandled error:", err);
    return json(500, { error: "Internal server error" });
  }
});
