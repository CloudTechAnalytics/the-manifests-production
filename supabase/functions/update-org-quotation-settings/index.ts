import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

/*
 * update-org-quotation-settings
 *
 * Lets an organization's own `admin` toggle quotation_approval_required
 * and set the two approval-escalation thresholds
 * (quotation_discount_threshold_percent, quotation_amount_threshold) —
 * the only fields on `organizations` a tenant admin can change
 * themselves; everything else (name, slug, branding) stays
 * platform-admin-only via the existing RLS policy. Going through a
 * dedicated function instead of widening that policy means this can't
 * accidentally become a door to every other column on the row.
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
      quotation_approval_required?: unknown;
      quotation_discount_threshold_percent?: unknown;
      quotation_amount_threshold?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    const update: Record<string, unknown> = {};
    const descriptionParts: string[] = [];

    if (body.quotation_approval_required !== undefined) {
      if (typeof body.quotation_approval_required !== "boolean") {
        return json(400, { error: "quotation_approval_required must be a boolean" });
      }
      update.quotation_approval_required = body.quotation_approval_required;
      descriptionParts.push(
        body.quotation_approval_required ? "enabled required approval" : "disabled required approval",
      );
    }

    for (
      const [key, label] of [
        ["quotation_discount_threshold_percent", "discount threshold"],
        ["quotation_amount_threshold", "amount threshold"],
      ] as const
    ) {
      const value = body[key];
      if (value === undefined) continue;
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
        return json(400, { error: `${key} must be a non-negative number or null` });
      }
      update[key] = value;
      descriptionParts.push(value === null ? `cleared ${label}` : `set ${label} to ${value}`);
    }

    if (Object.keys(update).length === 0) {
      return json(400, { error: "No settings provided" });
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
      console.error("update-org-quotation-settings error:", updateError.message);
      return json(400, { error: "Failed to update this setting" });
    }

    await admin.from("activities").insert({
      user_id: callerData.user.id,
      organization_id: caller.organization_id,
      action: "organization.quotation_approval_setting_changed",
      entity_type: "organizations",
      entity_id: caller.organization_id,
      description: `Quotation settings updated: ${descriptionParts.join(", ")}`,
    });

    return json(200, { success: true });
  } catch (err) {
    console.error("update-org-quotation-settings unhandled error:", err);
    return json(500, { error: "Internal server error" });
  }
});
