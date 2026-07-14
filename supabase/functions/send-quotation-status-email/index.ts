import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(status: number, message: string) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

const STATUS_COPY: Record<string, { subject: string; heading: string; body: string }> = {
  draft: {
    subject: "Your quotation is being prepared",
    heading: "Quotation in progress",
    body: "We're preparing your freight quotation and will follow up shortly.",
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
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed");
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonError(401, "Missing authorization header");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: callerData, error: callerError } = await supabase.auth.getUser();
    if (callerError || !callerData.user) {
      return jsonError(401, "Unauthorized");
    }

    let body: { quotation_id?: string };
    try {
      body = await req.json();
    } catch {
      return jsonError(400, "Invalid JSON body");
    }

    if (!body.quotation_id || !UUID_RE.test(body.quotation_id)) {
      return jsonError(400, "Invalid quotation_id");
    }

    // RLS (branch scoping) applies here via the caller's own JWT — if they
    // can't see this quotation, this returns nothing.
    const { data: quotation, error: quoteError } = await supabase
      .from("quotations")
      .select(
        "id, quotation_number, status, total, currency, valid_until, customer:customers(company_name, email)"
      )
      .eq("id", body.quotation_id)
      .maybeSingle();

    if (quoteError || !quotation) {
      return jsonError(404, "Quotation not found");
    }

    const customer = quotation.customer as unknown as
      | { company_name: string; email: string | null }
      | null;

    if (!customer?.email) {
      return jsonError(400, "Customer has no email on file");
    }

    const copy = STATUS_COPY[quotation.status] ?? {
      subject: "Update on your quotation",
      heading: "Quotation update",
      body: "There has been an update to your quotation.",
    };

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return jsonError(500, "Email service is not configured");
    }

    const html = `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
        <h2 style="margin-bottom: 4px;">${copy.heading}</h2>
        <p>Hi ${customer.company_name},</p>
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

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("EMAIL_FROM") ?? "The Manifest <onboarding@resend.dev>",
        to: customer.email,
        subject: copy.subject,
        html,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error("Resend error:", errText);
      return jsonError(502, "Failed to send email");
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-quotation-status-email unhandled error:", err);
    return jsonError(500, "Internal server error");
  }
});
