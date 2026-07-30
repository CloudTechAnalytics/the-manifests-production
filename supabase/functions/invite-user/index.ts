import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

/*
 * invite-user
 *
 * Creates an invitation and emails a join link. Used both for a
 * platform_admin inviting an organization's first admin, and for an org
 * admin inviting their own staff.
 *
 * Only the SHA-256 of the token is stored; the raw token exists solely in
 * the emailed link, so read access to the invitations table can never be
 * used to accept someone else's invite.
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

// platform_admin is deliberately absent: it is never scoped to one
// organization, so it cannot be granted through an org invitation.
const VALID_ROLES = new Set([
  "admin", "operations", "sales", "branch_manager", "finance", "customs",
  "planning", "documentation", "terminal", "examination", "warehouse", "transport",
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_TTL_DAYS = 7;

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
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
      .select("id, role, is_active, organization_id")
      .eq("id", callerData.user.id)
      .maybeSingle();

    if (!caller || !caller.is_active) return json(403, { error: "Profile not found" });

    const isPlatformAdmin = caller.role === "platform_admin";
    const isOrgAdmin = caller.role === "admin";
    if (!isPlatformAdmin && !isOrgAdmin) {
      return json(403, { error: "Only admins can invite users" });
    }

    let body: {
      email?: string;
      full_name?: string;
      role?: string;
      branch_id?: string | null;
      organization_id?: string;
    };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    const email = (body.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json(400, { error: "Invalid email format" });
    if (!body.role || !VALID_ROLES.has(body.role)) {
      return json(400, { error: "Invalid role" });
    }
    if (body.full_name && body.full_name.length > 200) {
      return json(400, { error: "Full name must be 200 characters or fewer" });
    }

    // A platform_admin may invite into any organization; an org admin is
    // pinned to its own, whatever the request body claims.
    const orgId = isPlatformAdmin
      ? body.organization_id
      : caller.organization_id;
    if (!orgId || !UUID_RE.test(orgId)) {
      return json(400, { error: "Invalid organization_id" });
    }

    const { data: org } = await supabaseClient
      .from("organizations")
      .select("id, name, is_active")
      .eq("id", orgId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!org) return json(404, { error: "Organization not found" });
    if (!org.is_active) return json(400, { error: "Organization is inactive" });

    // A branch, when given, must belong to the invited organization —
    // otherwise an invite could straddle two tenants.
    const branchId = body.branch_id ?? null;
    if (branchId !== null) {
      if (!UUID_RE.test(branchId)) return json(400, { error: "Invalid branch_id" });
      const { data: branch } = await supabaseClient
        .from("branches")
        .select("id")
        .eq("id", branchId)
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!branch) {
        return json(400, { error: "Branch does not belong to that organization" });
      }
    } else if (body.role !== "admin") {
      // Every non-admin role's RLS access is entirely branch-scoped (via
      // can_access_branch(branch_id)) — an invite accepted with no branch
      // would produce a profile locked out of everything. The frontend
      // already enforces this (users/page.tsx's validateInviteForm), but
      // the endpoint itself should refuse it too, same as create-user.
      return json(400, { error: "branch_id is required for this role" });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Refuse if this email already has an account in this organization.
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) {
      return json(409, { error: "That email already belongs to this organization" });
    }

    // Re-inviting supersedes any live invite rather than colliding with
    // the partial unique index on (organization_id, lower(email)).
    await admin
      .from("invitations")
      .update({ deleted_at: new Date().toISOString() })
      .eq("organization_id", orgId)
      .eq("email", email)
      .is("accepted_at", null)
      .is("deleted_at", null);

    const token = newToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(
      Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: invite, error: inviteError } = await admin
      .from("invitations")
      .insert({
        organization_id: orgId,
        branch_id: branchId,
        email,
        full_name: body.full_name?.trim() ?? null,
        role: body.role,
        token_hash: tokenHash,
        invited_by: caller.id,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (inviteError) {
      console.error("invite insert error:", inviteError.message);
      return json(400, { error: "Failed to create invitation" });
    }

    await admin.from("activities").insert({
      user_id: caller.id,
      branch_id: branchId,
      organization_id: isPlatformAdmin ? orgId : null,
      action: "invitation.sent",
      entity_type: "invitation",
      entity_id: invite.id,
      description: `Invited ${email} as ${body.role}`,
    });

    // The link points at the first allowlisted origin — the canonical app URL.
    const appUrl = (Deno.env.get("APP_ORIGIN") ?? "").split(",")[0].trim();
    const link = `${appUrl}/accept-invite?token=${token}`;

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      // The invite is valid even if email is not configured, so hand the
      // link back rather than failing outright.
      return json(200, {
        success: true,
        invitation_id: invite.id,
        emailed: false,
        link,
      });
    }

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("EMAIL_FROM") ??
          "The Manifest <onboarding@resend.dev>",
        to: [email],
        subject: `You've been invited to ${org.name} on The Manifest`,
        html: `
          <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#231F1B">
            <h1 style="font-size:20px;margin:0 0 16px">You've been invited to ${escapeHtml(org.name)}</h1>
            <p style="font-size:14px;line-height:1.6;margin:0 0 12px">
              You've been invited to join <strong>${escapeHtml(org.name)}</strong> on The Manifest as
              <strong>${escapeHtml(body.role)}</strong>.
            </p>
            <p style="font-size:14px;line-height:1.6;margin:0 0 24px">
              Click below to set your password and sign in. This link expires in ${INVITE_TTL_DAYS} days.
            </p>
            <a href="${link}" style="display:inline-block;background:#C89B3C;color:#231F1B;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px">
              Accept invitation
            </a>
            <p style="font-size:12px;color:#8A8178;line-height:1.6;margin:24px 0 0">
              If you weren't expecting this, you can ignore this email.
            </p>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      console.error("resend error:", await emailRes.text());
      return json(200, {
        success: true,
        invitation_id: invite.id,
        emailed: false,
        link,
      });
    }

    return json(200, { success: true, invitation_id: invite.id, emailed: true });
  } catch (err) {
    console.error("invite-user unhandled error:", err);
    return json(500, { error: "Internal server error" });
  }
});
