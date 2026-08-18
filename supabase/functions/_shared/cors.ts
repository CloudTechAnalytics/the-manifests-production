/*
 * Same CORS allowlist shape as every existing edge function
 * (create-user, invite-user, ...): only origins listed in APP_ORIGIN are
 * ever echoed back, so a state-changing request from an arbitrary origin
 * can't complete the preflight — this is the app's CSRF defense for edge
 * functions, reused here rather than reinvented.
 */
export function corsHeaders(req: Request): Record<string, string> {
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

export function appOrigin(): string {
  return (Deno.env.get("APP_ORIGIN") ?? "").split(",")[0].trim();
}

export function clientIp(req: Request): string {
  // Supabase Edge Functions run behind a proxy; the real client IP is the
  // first hop in X-Forwarded-For. Never trusted for authorization — only
  // used as a rate-limit bucket key, where a spoofed value only hurts the
  // spoofer's own bucket.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? "unknown";
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}
