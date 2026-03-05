import { Resend } from "resend";

type Payload = {
  email: string;
  firstName?: string;
  phone?: string;
  intent?: "budgeting" | "ready_for_call";

  estimateLow: number;
  estimateHigh: number;

  hoursLabel: string; // e.g., "6 hours" or "2 days × 6 hours/day"
  expectedHeadshotsLabel: string; // e.g., "120 expected headshots" or "600 attendees @ 25% ≈ 150 headshots"
  paceLabel: string; // e.g., "High Volume (25–35/hr/station)"
  recommendedStations: number;

  capacityLow: number;
  capacityHigh: number;

  disclaimerText: string;
};

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export async function POST(req: Request) {
  try {
    const resendKey = process.env.RESEND_API_KEY;
    const from = process.env.FROM_EMAIL; // e.g. "Cari | Headshot Pros AZ <cari@headshotprosaz.com>"
    const notify = process.env.LEAD_NOTIFICATION_EMAIL; // e.g. "cari@headshotprosaz.com"
    const quoteUrl =
      process.env.QUOTE_URL ||
      "https://headshotprosaz.com/professional-headshot-booth-phoenix/#quote";

    if (!resendKey || !from || !notify) {
      return Response.json(
        { error: "Missing RESEND_API_KEY, FROM_EMAIL, or LEAD_NOTIFICATION_EMAIL in environment variables." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as Payload;

    if (!body?.email || !body.email.includes("@")) {
      return Response.json({ error: "A valid email is required." }, { status: 400 });
    }

    const resend = new Resend(resendKey);

    const firstName = body.firstName?.trim() || "";
    const greet = firstName ? `Hi ${escapeHtml(firstName)}!` : "Hi there!";

    const subject = "Your Conference Headshot Booth Estimate";

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif; line-height:1.45; color:#111; max-width:680px;">
        <p style="margin:0 0 14px 0;">${greet}</p>

        <h2 style="margin:0 0 10px 0;">Your Conference Headshot Booth Estimate</h2>

        <div style="border:1px solid #e5e7eb; border-radius:12px; padding:16px; background:#f9fafb; margin:14px 0;">
          <div style="font-size:14px; color:#374151;">Estimated Investment Range</div>
          <div style="font-size:28px; font-weight:700; margin-top:2px;">
            $${formatMoney(body.estimateLow)} – $${formatMoney(body.estimateHigh)}
          </div>

          <div style="margin-top:12px; font-size:14px; color:#111;">
            <div><strong>Coverage:</strong> ${escapeHtml(body.hoursLabel)}</div>
            <div><strong>Expected demand:</strong> ${escapeHtml(body.expectedHeadshotsLabel)}</div>
            <div><strong>Pace:</strong> ${escapeHtml(body.paceLabel)}</div>
            <div><strong>Recommended stations:</strong> ${body.recommendedStations}</div>
            <div><strong>Estimated capacity:</strong> ${body.capacityLow}–${body.capacityHigh} headshots</div>
          </div>
        </div>

        <p style="margin:0 0 10px 0;">
          This estimate is designed to give you a realistic planning range. Final pricing is confirmed with a quick event walkthrough.
        </p>

        <p style="margin:0 0 16px 0;">
          <a href="${quoteUrl}" style="display:inline-block; background:#111827; color:#fff; text-decoration:none; padding:10px 14px; border-radius:10px; font-weight:600;">
            Request a Formal Quote
          </a>
        </p>

        <p style="margin:0 0 10px 0; color:#374151; font-size:13px;">
          Feel free to forward this email to your team.
        </p>

        <p style="margin:0; color:#6b7280; font-size:12px;">
          ${escapeHtml(body.disclaimerText)}
        </p>

        <hr style="border:none; border-top:1px solid #e5e7eb; margin:18px 0;" />

        <p style="margin:0; font-size:12px; color:#6b7280;">
          — Cari | Headshot Pros AZ
        </p>
      </div>
    `;

    // 1) Email to them
    await resend.emails.send({
      from,
      to: body.email,
      subject,
      html,
    });

    // 2) Lead notification to you
    const leadHtml = `
      <div style="font-family:Arial,Helvetica,sans-serif; line-height:1.45; color:#111; max-width:680px;">
        <h2 style="margin:0 0 10px 0;">New Calculator Lead</h2>
        <p style="margin:0 0 6px 0;"><strong>Email:</strong> ${escapeHtml(body.email)}</p>
        ${body.firstName ? `<p style="margin:0 0 6px 0;"><strong>Name:</strong> ${escapeHtml(body.firstName)}</p>` : ""}
        ${body.phone ? `<p style="margin:0 0 6px 0;"><strong>Phone:</strong> ${escapeHtml(body.phone)}</p>` : ""}
        ${body.intent ? `<p style="margin:0 0 6px 0;"><strong>Intent:</strong> ${escapeHtml(body.intent)}</p>` : ""}

        <div style="border:1px solid #e5e7eb; border-radius:12px; padding:12px; background:#f9fafb; margin:12px 0;">
          <p style="margin:0 0 6px 0;"><strong>Estimate:</strong> $${formatMoney(body.estimateLow)} – $${formatMoney(body.estimateHigh)}</p>
          <p style="margin:0 0 6px 0;"><strong>Coverage:</strong> ${escapeHtml(body.hoursLabel)}</p>
          <p style="margin:0 0 6px 0;"><strong>Expected demand:</strong> ${escapeHtml(body.expectedHeadshotsLabel)}</p>
          <p style="margin:0 0 6px 0;"><strong>Pace:</strong> ${escapeHtml(body.paceLabel)}</p>
          <p style="margin:0 0 6px 0;"><strong>Stations:</strong> ${body.recommendedStations}</p>
          <p style="margin:0;"><strong>Capacity:</strong> ${body.capacityLow}–${body.capacityHigh}</p>
        </div>

        <p style="margin:0;">
          <a href="${quoteUrl}" style="color:#111827;">Open quote link</a>
        </p>
      </div>
    `;

    await resend.emails.send({
      from,
      to: notify,
      subject: "New Conference Headshot Estimate Request",
      html: leadHtml,
    });

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: "Failed to send estimate email." }, { status: 500 });
  }
}