import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { corsHeaders, appOrigin, clientIp, escapeHtml } from "../_shared/cors.ts";
import { sha256Hex, newToken } from "../_shared/tokens.ts";

/*
 * resend-verification
 *
 * Public. Always returns the same generic response whether or not the
 * email exists, already belongs to a verified account, or genuinely gets a
 * new link — no enumeration channel. The only exception is when
 * RESEND_API_KEY isn't configured at all (a local/dev environment, where
 * enumeration protection is moot): the response then also carries the
 * emailed link, same graceful-degradation behavior as invite-user and
 * register-organization, so the flow stays testable without a real inbox.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFICATION_TTL_HOURS = 48;
const GENERIC_MESSAGE = "If an account exists for that email and is awaiting verification, a new link has been sent.";

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    let body: { email?: string };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    const email = (body.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json(400, { error: "Invalid email format" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const ip = clientIp(req);
    const { data: ipOk } = await admin.rpc("check_rate_limit", {
      p_key: `resend-verification:ip:${ip}`, p_max: 10, p_window_seconds: 3600,
    });
    const { data: emailOk } = await admin.rpc("check_rate_limit", {
      p_key: `resend-verification:email:${email}`, p_max: 3, p_window_seconds: 3600,
    });
    if (ipOk === false || emailOk === false) {
      return json(429, { error: "Too many requests. Please try again later." });
    }

    const devFallback = !Deno.env.get("RESEND_API_KEY");

    const { data: profile } = await admin
      .from("profiles")
      .select("id, full_name, organization_id, organization:organizations(name, status)")
      .eq("email", email)
      .is("deleted_at", null)
      .maybeSingle();

    const orgStatus = (profile as any)?.organization?.status;
    if (!profile || orgStatus !== "pending_verification") {
      return json(200, { success: true, message: GENERIC_MESSAGE });
    }

    await admin
      .from("email_verification_tokens")
      .update({ consumed_at: new Date().toISOString() })
      .eq("user_id", profile.id)
      .is("consumed_at", null);

    const token = newToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000).toISOString();

    await admin.from("email_verification_tokens").insert({
      user_id: profile.id,
      organization_id: profile.organization_id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    const link = `${appOrigin()}/verify-email?token=${token}`;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      return json(200, { success: true, message: GENERIC_MESSAGE, emailed: false, link });
    }

    const orgName = (profile as any)?.organization?.name ?? "The Manifest";
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("EMAIL_FROM") ?? "The Manifest <onboarding@resend.dev>",
        to: [email],
        subject: "Verify your email to activate your Manifest trial",
        html: `
          <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#231F1B">
            <h1 style="font-size:20px;margin:0 0 16px">Verify your email</h1>
            <p style="font-size:14px;line-height:1.6;margin:0 0 24px">
              Here's a new verification link for <strong>${escapeHtml(orgName)}</strong>. It expires in ${VERIFICATION_TTL_HOURS} hours.
            </p>
            <a href="${link}" style="display:inline-block;background:#C89B3C;color:#231F1B;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px">
              Verify email
            </a>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      console.error("resend-verification resend error:", await emailRes.text());
    }

    return json(200, devFallback ? { success: true, message: GENERIC_MESSAGE, emailed: emailRes.ok, link } : { success: true, message: GENERIC_MESSAGE });
  } catch (err) {
    console.error("resend-verification unhandled error:", err);
    return json(500, { error: "Internal server error" });
  }
});
