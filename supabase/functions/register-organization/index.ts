import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { corsHeaders, appOrigin, clientIp, escapeHtml } from "../_shared/cors.ts";
import { sha256Hex, newToken } from "../_shared/tokens.ts";
import { checkPasswordPolicy } from "../_shared/password-policy.ts";

/*
 * register-organization
 *
 * Public, unauthenticated (no session yet — this is how one gets created).
 * Validates the wizard's Business + Account steps, rate-limits by IP and
 * by email, creates the owner's auth user unconfirmed (email_confirm:
 * false — this alone is what makes Supabase Auth itself refuse
 * signInWithPassword until verify-email flips it), then calls the
 * provision_organization() RPC to create the organization, Head Office
 * branch, default departments, owner profile, trial subscription, consent
 * record, and audit log rows in one transaction (migration 064).
 *
 * Safe under refresh / double-click / resubmit / lost connection (spec
 * Test E): a profile already existing for the given email is treated as
 * "resume", not an error; a concurrent double-submit that both reach
 * auth.admin.createUser races at the Supabase Auth layer (email is
 * globally unique there) — the loser is recovered by finding the winner's
 * auth user and either resuming its already-committed provisioning or
 * safely retrying, never creating a second organization or owner.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BUSINESS_TYPES = new Set([
  "freight_forwarding", "clearing_forwarding", "logistics",
  "shipping_agency", "customs_brokerage", "other",
]);
const VERIFICATION_TTL_HOURS = 48;

interface RegisterBody {
  business_name?: string;
  business_type?: string;
  country?: string;
  city?: string;
  business_email?: string;
  business_phone?: string;
  registration_number?: string;
  website?: string;
  expected_users?: number;
  expected_monthly_shipments?: number;
  referral_source?: string;
  owner_first_name?: string;
  owner_last_name?: string;
  owner_email?: string;
  owner_phone?: string;
  password?: string;
  confirm_password?: string;
  terms_accepted?: boolean;
  privacy_accepted?: boolean;
}

function clampInt(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return null;
  return Math.floor(n);
}

async function findAuthUserIdByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase();
  // Bounded pagination — enough headroom for real usage without an
  // unbounded loop if something is badly wrong.
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < 1000) break;
  }
  return null;
}

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
    let body: RegisterBody;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    const businessName = (body.business_name ?? "").trim();
    const businessType = (body.business_type ?? "").trim();
    const country = (body.country ?? "").trim();
    const city = (body.city ?? "").trim();
    const businessEmail = (body.business_email ?? "").trim().toLowerCase();
    const businessPhone = (body.business_phone ?? "").trim();
    const ownerFirstName = (body.owner_first_name ?? "").trim();
    const ownerLastName = (body.owner_last_name ?? "").trim();
    const ownerEmail = (body.owner_email ?? "").trim().toLowerCase();
    const ownerPhone = (body.owner_phone ?? "").trim();
    const password = body.password ?? "";

    if (!businessName || businessName.length > 200) {
      return json(400, { error: "Business name is required (max 200 characters)" });
    }
    if (!BUSINESS_TYPES.has(businessType)) {
      return json(400, { error: "Invalid business type" });
    }
    if (!country) return json(400, { error: "Country is required" });
    if (!city) return json(400, { error: "State / City is required" });
    if (!EMAIL_RE.test(businessEmail)) return json(400, { error: "Invalid business email" });
    if (!businessPhone) return json(400, { error: "Business phone number is required" });
    if (!ownerFirstName || !ownerLastName) {
      return json(400, { error: "Owner first and last name are required" });
    }
    if (!EMAIL_RE.test(ownerEmail)) return json(400, { error: "Invalid work email" });
    if (!ownerPhone) return json(400, { error: "Owner phone number is required" });
    if (body.confirm_password !== undefined && password !== body.confirm_password) {
      return json(400, { error: "Passwords do not match" });
    }
    const pw = checkPasswordPolicy(password);
    if (!pw.ok) return json(400, { error: pw.reason });
    if (!body.terms_accepted || !body.privacy_accepted) {
      return json(400, { error: "You must accept the Terms of Service and Privacy Policy" });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Rate limit: by IP and by the email being registered.
    const ip = clientIp(req);
    const { data: ipOk } = await admin.rpc("check_rate_limit", {
      p_key: `register:ip:${ip}`, p_max: 8, p_window_seconds: 3600,
    });
    if (ipOk === false) {
      return json(429, { error: "Too many registration attempts. Please try again later." });
    }
    const { data: emailOk } = await admin.rpc("check_rate_limit", {
      p_key: `register:email:${ownerEmail}`, p_max: 3, p_window_seconds: 3600,
    });
    if (emailOk === false) {
      return json(429, { error: "Too many registration attempts for this email. Please try again later." });
    }

    const { data: settings } = await admin
      .from("platform_settings")
      .select("self_registration_enabled, terms_version, privacy_version")
      .eq("id", true)
      .maybeSingle();

    if (settings && settings.self_registration_enabled === false) {
      return json(403, { error: "Self-service registration is currently unavailable. Please contact sales." });
    }
    const termsVersion = settings?.terms_version ?? "v1";
    const privacyVersion = settings?.privacy_version ?? "v1";

    // Existing account for this email? Either resume a still-unverified
    // signup (resend rather than duplicate) or refuse a genuine duplicate.
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id, organization_id, organization:organizations(status)")
      .eq("email", ownerEmail)
      .is("deleted_at", null)
      .maybeSingle();

    let ownerUserId: string;

    if (existingProfile) {
      const orgStatus = (existingProfile as any).organization?.status;
      if (orgStatus !== "pending_verification") {
        return json(409, {
          error: "An account with this email already exists. Sign in, or contact support if you believe this is a mistake.",
        });
      }
      ownerUserId = existingProfile.id as string;
    } else {
      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email: ownerEmail,
        password,
        email_confirm: false,
      });

      if (authError || !authData.user) {
        // A concurrent duplicate submit can lose the auth-layer race here
        // (email is globally unique in auth.users) — recover the winner's
        // user id instead of failing the loser's request outright.
        const recovered = await findAuthUserIdByEmail(admin, ownerEmail);
        if (!recovered) {
          console.error("register-organization createUser error:", authError?.message);
          return json(409, {
            error: "An account with this email already exists. Sign in, or contact support if you believe this is a mistake.",
          });
        }
        ownerUserId = recovered;
      } else {
        ownerUserId = authData.user.id;
      }
    }

    const { data: provision, error: provisionError } = await admin.rpc("provision_organization", {
      p_owner_user_id: ownerUserId,
      p_owner_email: ownerEmail,
      p_owner_full_name: `${ownerFirstName} ${ownerLastName}`.trim(),
      p_owner_phone: ownerPhone,
      p_org_name: businessName,
      p_business_type: businessType,
      p_country: country,
      p_city: city,
      p_business_email: businessEmail,
      p_phone: businessPhone,
      p_registration_number: body.registration_number?.trim() || null,
      p_website: body.website?.trim() || null,
      p_expected_users: clampInt(body.expected_users),
      p_expected_monthly_shipments: clampInt(body.expected_monthly_shipments),
      p_referral_source: body.referral_source?.trim() || null,
      p_terms_version: termsVersion,
      p_privacy_version: privacyVersion,
      p_ip_address: ip,
    });

    let organizationId: string;

    if (provisionError || !provision) {
      // A genuine concurrent race (two requests both created the same auth
      // user's profile) resolves at the database's unique constraint, not
      // inside the RPC's own idempotency check. If a profile now exists
      // for this user despite the error, some request already succeeded —
      // treat that as success rather than erroring the caller.
      const { data: recoveredProfile } = await admin
        .from("profiles")
        .select("organization_id")
        .eq("id", ownerUserId)
        .maybeSingle();

      if (recoveredProfile?.organization_id) {
        organizationId = recoveredProfile.organization_id as string;
      } else {
        console.error("register-organization provisioning error:", provisionError?.message);
        // Don't leave an orphaned, unlinked auth user behind.
        await admin.auth.admin.deleteUser(ownerUserId).catch(() => {});
        if (provisionError?.message === "duplicate_business_email" || provisionError?.message === "duplicate_registration_number") {
          return json(409, {
            error: "We couldn't find a match for that business email or registration number in our records, but a similar organization may already be registered. Please contact support if you believe this is a mistake.",
          });
        }
        return json(500, { error: "Failed to set up your organization. Please try again." });
      }
    } else {
      organizationId = (provision as any).organization_id as string;
    }

    // Soft, non-blocking signal only — never used to reject registration.
    const { count: similarNameCount } = await admin
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .ilike("name", `%${businessName}%`)
      .is("deleted_at", null)
      .neq("id", organizationId);

    // Supersede any still-live token for this user (mirrors invite-user's
    // "re-inviting supersedes any live invite" behavior).
    await admin
      .from("email_verification_tokens")
      .update({ consumed_at: new Date().toISOString() })
      .eq("user_id", ownerUserId)
      .is("consumed_at", null);

    const token = newToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000).toISOString();

    const { error: tokenError } = await admin.from("email_verification_tokens").insert({
      user_id: ownerUserId,
      organization_id: organizationId,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });
    if (tokenError) {
      console.error("register-organization token insert error:", tokenError.message);
      return json(500, { error: "Registration succeeded but sending the verification email failed. Use Resend on the next screen." });
    }

    const link = `${appOrigin()}/verify-email?token=${token}`;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      return json(200, {
        success: true,
        organization_id: organizationId,
        emailed: false,
        link,
        similar_name_warning: (similarNameCount ?? 0) > 0,
      });
    }

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("EMAIL_FROM") ?? "The Manifest <onboarding@resend.dev>",
        to: [ownerEmail],
        subject: "Verify your email to activate your Manifest trial",
        html: `
          <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#231F1B">
            <h1 style="font-size:20px;margin:0 0 16px">Welcome to The Manifest, ${escapeHtml(ownerFirstName)}</h1>
            <p style="font-size:14px;line-height:1.6;margin:0 0 12px">
              You're almost set up. Verify your email to activate <strong>${escapeHtml(businessName)}</strong>'s trial.
            </p>
            <p style="font-size:14px;line-height:1.6;margin:0 0 24px">
              This link expires in ${VERIFICATION_TTL_HOURS} hours.
            </p>
            <a href="${link}" style="display:inline-block;background:#C89B3C;color:#231F1B;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px">
              Verify email
            </a>
            <p style="font-size:12px;color:#8A8178;line-height:1.6;margin:24px 0 0">
              If you didn't request this, you can ignore this email.
            </p>
          </div>
        `,
      }),
    });

    if (!emailRes.ok) {
      console.error("register-organization resend error:", await emailRes.text());
      return json(200, {
        success: true,
        organization_id: organizationId,
        emailed: false,
        link,
        similar_name_warning: (similarNameCount ?? 0) > 0,
      });
    }

    return json(200, {
      success: true,
      organization_id: organizationId,
      emailed: true,
      similar_name_warning: (similarNameCount ?? 0) > 0,
    });
  } catch (err) {
    console.error("register-organization unhandled error:", err);
    return json(500, { error: "Internal server error" });
  }
});
