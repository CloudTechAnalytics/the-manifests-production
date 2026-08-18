import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
import { corsHeaders } from "../_shared/cors.ts";

/*
 * update-organization-profile
 *
 * Same narrow-carve-out shape as update-org-quotation-settings: lets an
 * organization's own `admin` (the Organization Owner, in onboarding's "Org
 * Info" step) fix up address/city/phone/website/business_type — contact
 * details, not identity. name, slug, registration_number, and email stay
 * platform-admin-only (email in particular backs duplicate-registration
 * protection and the org's own login-adjacent identity, so it isn't opened
 * up here).
 *
 * Also doubles as the one place the onboarding wizard's "Ready" step (and
 * "skip setup") marks onboarding_completed_at — same admin-only guard,
 * no separate endpoint needed for a single-column timestamp write.
 */

const BUSINESS_TYPES = new Set([
  "freight_forwarding", "clearing_forwarding", "logistics",
  "shipping_agency", "customs_brokerage", "other",
]);

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Missing authorization header" });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: callerData, error: callerError } = await supabaseClient.auth.getUser();
    if (callerError || !callerData.user) return json(401, { error: "Unauthorized" });

    const { data: caller } = await supabaseClient
      .from("profiles")
      .select("role, is_active, organization_id")
      .eq("id", callerData.user.id)
      .maybeSingle();

    if (!caller || !caller.is_active || caller.role !== "admin" || !caller.organization_id) {
      return json(403, { error: "Only organization admins can change this setting" });
    }

    let body: {
      address?: unknown; city?: unknown; country?: unknown;
      phone?: unknown; website?: unknown; business_type?: unknown;
      mark_onboarding_complete?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    const update: Record<string, unknown> = {};
    if (body.mark_onboarding_complete === true) {
      update.onboarding_completed_at = new Date().toISOString();
    }
    for (const key of ["address", "city", "country", "phone", "website"] as const) {
      const value = body[key];
      if (value === undefined) continue;
      if (value !== null && typeof value !== "string") {
        return json(400, { error: `${key} must be a string or null` });
      }
      if (typeof value === "string" && value.length > 300) {
        return json(400, { error: `${key} is too long` });
      }
      update[key] = value === null ? null : value.trim();
    }
    if (body.business_type !== undefined) {
      if (typeof body.business_type !== "string" || !BUSINESS_TYPES.has(body.business_type)) {
        return json(400, { error: "Invalid business_type" });
      }
      update.business_type = body.business_type;
    }

    if (Object.keys(update).length === 0) {
      return json(400, { error: "No fields provided" });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error: updateError } = await admin
      .from("organizations")
      .update(update)
      .eq("id", caller.organization_id);

    if (updateError) {
      console.error("update-organization-profile error:", updateError.message);
      return json(400, { error: "Failed to update organization details" });
    }

    await admin.from("activities").insert({
      user_id: callerData.user.id,
      organization_id: caller.organization_id,
      action: "organization.profile_updated",
      entity_type: "organizations",
      entity_id: caller.organization_id,
      description: `Organization profile updated: ${Object.keys(update).join(", ")}`,
    });

    return json(200, { success: true });
  } catch (err) {
    console.error("update-organization-profile unhandled error:", err);
    return json(500, { error: "Internal server error" });
  }
});
