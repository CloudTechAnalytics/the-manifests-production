import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

/*
 * send-quotation-status-email
 *
 * Emails the customer on a quotation's record when its status changes.
 * The caller's own JWT is used for the quotation lookup, so RLS branch
 * scoping applies — if the caller can't see the quotation, this reports
 * "not found" rather than leaking its existence.
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STATUS_COPY: Record<string, { subject: string; heading: string; body: string }> = {
  draft: {
    subject: "Your quotation is being prepared",
    heading: "Quotation in progress",
    body: "We're preparing your freight quotation and will follow up shortly.",
  },
  pending_approval: {
    subject: "Your quotation is being reviewed",
    heading: "Quotation under review",
    body: "Your quotation is being reviewed internally and will be sent to you shortly.",
  },
  accepted: {
    subject: "Thank you for accepting your quotation",
    heading: "Quotation accepted",
    body: "Thanks for confirming — we're moving ahead with your shipment.",
  },
  sent: {
    subject: "Your quotation is ready for review",
    heading: "Quotation ready for review",
    body: "Please review the quotation details below and let us know if you'd like to proceed.",
  },
  approved: {
    subject: "Your quotation has been approved",
    heading: "Quotation approved",
    body: "Great news — your quotation has been approved. Our team will be in touch to arrange next steps.",
  },
  rejected: {
    subject: "Update on your quotation",
    heading: "Quotation not approved",
    body: "This quotation was not approved. Please contact us if you have any questions.",
  },
  expired: {
    subject: "Your quotation has expired",
    heading: "Quotation expired",
    body: "This quotation has passed its validity date. Please contact us for an updated quote.",
  },
};

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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: callerData, error: callerError } = await supabase.auth.getUser();
    if (callerError || !callerData.user) return json(401, { error: "Unauthorized" });

    let body: { quotation_id?: string; pdf_base64?: string; pdf_filename?: string };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    if (!body.quotation_id || !UUID_RE.test(body.quotation_id)) {
      return json(400, { error: "Invalid quotation_id" });
    }

    const { data: quotation, error: quoteError } = await supabase
      .from("quotations")
      .select(
        "id, quotation_number, status, total, currency, valid_until, customer:customers(company_name, email)",
      )
      .eq("id", body.quotation_id)
      .maybeSingle();

    if (quoteError || !quotation) return json(404, { error: "Quotation not found" });

    const customer = quotation.customer as unknown as
      | { company_name: string; email: string | null }
      | null;

    if (!customer?.email) return json(400, { error: "Customer has no email on file" });

    const copy = STATUS_COPY[quotation.status] ?? {
      subject: "Update on your quotation",
      heading: "Quotation update",
      body: "There has been an update to your quotation.",
    };

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) return json(500, { error: "Email service is not configured" });

    const html = `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
        <h2 style="margin-bottom: 4px;">${copy.heading}</h2>
        <p>Hi ${escapeHtml(customer.company_name)},</p>
        <p>${copy.body}</p>
        <table style="width:100%; border-collapse: collapse; margin-top: 16px;">
          <tr>
            <td style="padding:4px 0; color:#666;">Quotation Number</td>
            <td style="padding:4px 0; text-align:right;"><strong>${quotation.quotation_number ?? "-"}</strong></td>
          </tr>
          <tr>
            <td style="padding:4px 0; color:#666;">Status</td>
            <td style="padding:4px 0; text-align:right; text-transform:capitalize;"><strong>${quotation.status}</strong></td>
          </tr>
          <tr>
            <td style="padding:4px 0; color:#666;">Total</td>
            <td style="padding:4px 0; text-align:right;"><strong>${quotation.currency} ${Number(quotation.total).toLocaleString()}</strong></td>
          </tr>
          ${
            quotation.valid_until
              ? `<tr><td style="padding:4px 0; color:#666;">Valid Until</td><td style="padding:4px 0; text-align:right;"><strong>${quotation.valid_until}</strong></td></tr>`
              : ""
          }
        </table>
        <p style="margin-top: 24px; color: #999; font-size: 12px;">
          This is an automated message from The Manifest. Please do not reply directly to this email.
        </p>
      </div>
    `;

    const emailPayload: Record<string, unknown> = {
      from: Deno.env.get("EMAIL_FROM") ?? "The Manifest <onboarding@resend.dev>",
      to: customer.email,
      subject: copy.subject,
      html,
    };

    // Attached client-side (@react-pdf/renderer has Node dependencies not
    // safe on the Deno edge runtime) — optional, so a missing/failed PDF
    // never blocks the status email itself.
    if (body.pdf_base64) {
      emailPayload.attachments = [
        { filename: body.pdf_filename ?? "quotation.pdf", content: body.pdf_base64 },
      ];
    }

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    if (!emailRes.ok) {
      console.error("Resend error:", await emailRes.text());
      return json(502, { error: "Failed to send email" });
    }

    return json(200, { success: true });
  } catch (err) {
    console.error("send-quotation-status-email unhandled error:", err);
    return json(500, { error: "Internal server error" });
  }
});
