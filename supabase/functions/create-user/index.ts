import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

/*
 * create-user
 *
 * Directly creates a staff account with an admin-chosen password (the new
 * user must change it on first sign-in). Callable by an org admin (their
 * own organization only) or a platform_admin (any organization).
 *
 * branch_id is required unless "admin" is among the new user's roles: a
 * brand-new organization has no branches yet, so platform_admin needs to
 * be able to create that org's first admin — organization_id is
 * required instead in that case (an org admin creating another admin
 * still gets their own organization pinned, same as every other role).
 *
 * A user can hold more than one role: `roles` is a non-empty array,
 * roles[0] becomes the primary profiles.role (login redirect, role
 * badge, every existing single-role check), and any remaining entries
 * are written to user_roles as additional roles.
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

const VALID_ROLES = new Set([
  "admin", "operations", "sales", "branch_manager", "finance", "customs",
  "planning", "documentation", "terminal", "examination", "warehouse", "transport",
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
      .select("role, is_active, organization_id, branch_id")
      .eq("id", callerId)
      .maybeSingle();

    if (!callerProfile) return json(403, { error: "Profile not found" });

    const callerIsPlatformAdmin = callerProfile.role === "platform_admin";
    if (
      !callerProfile.is_active ||
      (callerProfile.role !== "admin" && !callerIsPlatformAdmin)
    ) {
      return json(403, { error: "Only active admins can create users" });
    }

    // A "branch admin" is an org admin who is themselves tied to a branch;
    // a "general admin" is an org admin with no branch (or platform_admin).
    // A branch admin may only place users inside their own branch — the
    // check itself is enforced further down once the target branch is known.
    const callerIsBranchAdmin =
      !callerIsPlatformAdmin &&
      callerProfile.role === "admin" &&
      !!callerProfile.branch_id;

    let body: {
      email?: string;
      full_name?: string;
      roles?: string[];
      branch_id?: string | null;
      organization_id?: string;
      password?: string;
    };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    if (!body.email || !body.full_name || !body.roles?.length || !body.password) {
      return json(400, { error: "Missing required fields" });
    }
    if (!EMAIL_RE.test(body.email)) return json(400, { error: "Invalid email format" });
    if (body.full_name.length > 200) {
      return json(400, { error: "Full name must be 200 characters or fewer" });
    }
    for (const r of body.roles) {
      if (!VALID_ROLES.has(r)) return json(400, { error: `Invalid role: ${r}` });
    }
    if (body.password.length < 8) {
      return json(400, { error: "Password must be at least 8 characters" });
    }

    const roles = Array.from(new Set(body.roles));
    const primaryRole = roles[0];
    const additionalRoles = roles.slice(1);
    const hasAdminRole = roles.includes("admin");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let organizationId: string;
    let branchId: string | null = null;

    if (body.branch_id) {
      if (!UUID_RE.test(body.branch_id)) return json(400, { error: "Invalid branch_id" });

      // The new user's organization is derived from the branch they're
      // being placed in — never trusted from the request body — so an org
      // admin can't plant a user in a tenant other than their own by lying
      // about organization_id. Looked up with the service-role client so
      // this is checked against the real row, not an RLS-filtered view.
      const { data: targetBranch } = await admin
        .from("branches")
        .select("id, organization_id")
        .eq("id", body.branch_id)
        .is("deleted_at", null)
        .maybeSingle();

      if (!targetBranch) return json(400, { error: "Invalid branch_id" });
      if (
        !callerIsPlatformAdmin &&
        targetBranch.organization_id !== callerProfile.organization_id
      ) {
        return json(403, { error: "That branch belongs to another organization" });
      }
      // A branch admin cannot create users outside their own branch, even
      // within the same organization.
      if (callerIsBranchAdmin && body.branch_id !== callerProfile.branch_id) {
        return json(403, {
          error: "You can only create users in your own branch",
        });
      }
      organizationId = targetBranch.organization_id;
      branchId = body.branch_id;
    } else if (hasAdminRole) {
      // A branch-scoped admin must not mint a branchless (org-wide) admin —
      // that would hand out access wider than their own.
      if (callerIsBranchAdmin) {
        return json(403, {
          error: "You can only create users in your own branch",
        });
      }
      // No branch yet — only valid for a brand-new organization's first
      // admin. A platform_admin must say which org; an org admin creating
      // another admin gets their own organization pinned, same as always.
      const orgId = callerIsPlatformAdmin ? body.organization_id : callerProfile.organization_id;
      if (!orgId || !UUID_RE.test(orgId)) {
        return json(400, { error: "organization_id is required when no branch is given" });
      }
      const { data: org } = await admin
        .from("organizations")
        .select("id, is_active")
        .eq("id", orgId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!org) return json(404, { error: "Organization not found" });
      if (!org.is_active) return json(400, { error: "Organization is inactive" });
      organizationId = orgId;
    } else {
      return json(400, { error: "branch_id is required for this role" });
    }

    // Plan-based user limit (migration 064's org_user_count/org_user_limit —
    // NULL limit means unlimited, including organizations with no
    // subscription row at all, so pre-existing orgs are never retroactively
    // locked out).
    const { data: userLimit } = await admin.rpc("org_user_limit", { p_org_id: organizationId });
    if (userLimit !== null && userLimit !== undefined) {
      const { data: userCount } = await admin.rpc("org_user_count", { p_org_id: organizationId });
      if ((userCount ?? 0) >= userLimit) {
        return json(403, {
          error: "You have reached your plan's user limit.",
          code: "user_limit_reached",
        });
      }
    }

    const { data: authData, error: authError } = await admin.auth.admin
      .createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
      });

    if (authError || !authData.user) {
      console.error("createUser error:", authError?.message);
      return json(400, { error: "Failed to create user account" });
    }

    const newUserId = authData.user.id;

    const { error: insertError } = await admin.from("profiles").insert({
      id: newUserId,
      email: body.email,
      full_name: body.full_name,
      role: primaryRole,
      organization_id: organizationId,
      branch_id: branchId,
      is_active: true,
      must_change_password: true,
      created_by: callerId,
    });

    if (insertError) {
      console.error("profile insert error:", insertError.message);
      await admin.auth.admin.deleteUser(newUserId);
      return json(400, { error: "Failed to create user profile" });
    }

    if (additionalRoles.length > 0) {
      const { error: rolesError } = await admin
        .from("user_roles")
        .insert(additionalRoles.map((role) => ({ user_id: newUserId, role })));
      if (rolesError) {
        console.error("additional roles insert error:", rolesError.message);
        // Not fatal — the user exists with their primary role; the admin
        // can add the rest afterward from the Users page.
      }
    }

    await admin.from("activities").insert({
      user_id: callerId,
      branch_id: branchId,
      organization_id: branchId ? null : organizationId,
      action: "user.created",
      entity_type: "profiles",
      entity_id: newUserId,
      description: `Created user ${body.email} (${roles.join(", ")})`,
    });

    return json(200, { success: true, user_id: newUserId });
  } catch (err) {
    console.error("create-user unhandled error:", err);
    return json(500, { error: "Internal server error" });
  }
});
