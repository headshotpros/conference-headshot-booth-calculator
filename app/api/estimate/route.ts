// app/api/estimate/route.ts
import { Resend } from "resend";

type Payload = {
  email: string;
  firstName?: string;
  phone?: string;
  intent?: "budgeting" | "ready_for_call";

  // The key numbers we’ll include in the email
  estimateLow: number;
  estimateHigh: number;

  // Useful details for you + them
  hoursLabel: string; // e.g., "6 hours" or "2 days × 6 hours/day (12 total hours)"
  expectedHeadshotsLabel: string; // e.g., "120 expected headshots" or "600 attendees @ 25% = 150"
  paceLabel: string; // e.g., "High Volume (20–30/hr/station)"
  recommendedStations: number;

  capacityLow: number;
  capacityHigh: number;

  disclaimerText: string;

  /**
   * Optional: choose which quote page CTA the email button should link to.
   * - "booth" (default): Professional Headshot Booth Phoenix quote section
   * - "conference": Conference Headshots in Phoenix pricing section
   * - "company": Company Headshots quote section
   */
  quoteType?: "booth" | "conference" | "company";
};

const QUOTE_URLS: Record<NonNullable<Payload["quoteType"]>, string> = {
  booth: "https://headshotprosaz.com/professional-headshot-booth-phoenix/#quote",
  conference: "https://headshotprosaz.com/conference-headshots-in-phoenix/#pricing",
  company: "https://headshotprosaz.com/company-headshots-phoenix/#quote"
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

function clampInt(n: unknown, min: number, max: number) {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, Math.floor(x)));
}

function normalizeEmail(s: string) {
  return s.trim().toLowerCase();
}

export async function POST(req: Request) {
  try {
    const resendKey = process.env.RESEND_API_KEY;
    const from = process.env.FROM_EMAIL; // e.g. "Cari | Headshot Pros AZ <cari@headshotprosaz.com>"
    const notify = process.env.LEAD_NOTIFICATION_EMAIL; // e.g. "cari@headshotprosaz.com"
    const defaultQuoteUrl = process.env.QUOTE_URL; // optional override

    if (!resendKey || !from || !notify) {
      return Response.json(
        { error: "Missing RESEND_API_KEY, FROM_EMAIL, or LEAD_NOTIFICATION_EMAIL in environment variables." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as Payload;

    // Basic required fields
    const email = body?.email ? normalizeEmail(body.email) : "";
    if (!email || !email.includes("@")) {
      return Response.json({ error: "A valid email is required." }, { status: 400 });
    }

    // Validate/normalize numeric fields
    const estLowRaw = Number(body.estimateLow);
    const estHighRaw = Number(body.estimateHigh);
    if (!Number.isFinite(estLowRaw) || !Number.isFinite(estHighRaw) || estLowRaw < 0 || estHighRaw < 0) {
      return Response.json({ error: "Invalid estimate values." }, { status: 400 });
    }
    const estimateLow = Math.round(Math.min(estLowRaw, estHighRaw));
    const estimateHigh = Math.round(Math.max(estLowRaw, estHighRaw));

    const recommendedStations = clampInt(body.recommendedStations, 1, 99);
    const capacityLow = clampInt(body.capacityLow, 0, 1_000_000);
    const capacityHigh = clampInt(body.capacityHigh, 0, 1_000_000);

    // Validate text fields (keep them short + safe)
    const hoursLabel = (body.hoursLabel || "").toString().trim();
    const expectedHeadshotsLabel = (body.expectedHeadshotsLabel || "").toString().trim();
    const paceLabel = (body.paceLabel || "").toString().trim();
    const disclaimerText = (body.disclaimerText || "").toString().trim();

    if (!hoursLabel || !expectedHeadshotsLabel || !paceLabel) {
      return Response.json({ error: "Missing required detail labels (hoursLabel, expectedHeadshotsLabel, paceLabel)." }, { status: 400 });
    }

    // Pick the quote URL (booth default) unless overridden by env var
    const quoteType: NonNullable<Payload["quoteType"]> = body.quoteType || "booth";
    const quoteUrl = defaultQuoteUrl || QUOTE_URLS[quoteType];

    const resend = new Resend(resendKey);

    const firstName = body.firstName?.trim() || "";
    const greet = firstName ? `Hi ${escapeHtml(firstName)}!` : "Hi there!";

    const subject = "Your Conference Headshot Booth Estimate";

    // 1) Email to them
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif; line-height:1.45; color:#111; max-width:680px;">
        <p style="margin:0 0 14px 0;">${greet}</p>

        <h2 style="margin:0 0 10px 0;">Your Conference Headshot Booth Estimate</h2>

        <div style="border:1px solid #e5e7eb; border-radius:12px; padding:16px; background:#f9fafb; margin:14px 0;">
          <div style="font-size:14px; color:#374151;">Estimated Investment Range</div>
          <div style="font-size:28px; font-weight:700; margin-top:2px;">
            $${formatMoney(estimateLow)} – $${formatMoney(estimateHigh)}
          </div>

          <div style="margin-top:12px; font-size:14px; color:#111;">
            <div><strong>Coverage:</strong> ${escapeHtml(hoursLabel)}</div>
            <div><strong>Expected demand:</strong> ${escapeHtml(expectedHeadshotsLabel)}</div>
            <div><strong>Pace:</strong> ${escapeHtml(paceLabel)}</div>
            <div><strong>Recommended stations:</strong> ${recommendedStations}</div>
            <div><strong>Estimated capacity:</strong> ${capacityLow}–${capacityHigh} headshots</div>
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

        ${
          disclaimerText
            ? `<p style="margin:0; color:#6b7280; font-size:12px;">${escapeHtml(disclaimerText)}</p>`
            : ""
        }

        <hr style="border:none; border-top:1px solid #e5e7eb; margin:18px 0;" />

        <p style="margin:0; font-size:12px; color:#6b7280;">
          — Cari | Headshot Pros AZ
        </p>
      </div>
    `;

    await resend.emails.send({
      from,
      to: email,
      subject,
      html,
      reply_to: notify
    });

    // 2) Lead notification to you
    const leadHtml = `
      <div style="font-family:Arial,Helvetica,sans-serif; line-height:1.45; color:#111; max-width:680px;">
        <h2 style="margin:0 0 10px 0;">New Calculator Lead</h2>
        <p style="margin:0 0 6px 0;"><strong>Email:</strong> ${escapeHtml(email)}</p>
        ${firstName ? `<p style="margin:0 0 6px 0;"><strong>Name:</strong> ${escapeHtml(firstName)}</p>` : ""}
        ${body.phone ? `<p style="margin:0 0 6px 0;"><strong>Phone:</strong> ${escapeHtml(body.phone.trim())}</p>` : ""}
        ${body.intent ? `<p style="margin:0 0 6px 0;"><strong>Intent:</strong> ${escapeHtml(body.intent)}</p>` : ""}
        <p style="margin:0 0 6px 0;"><strong>Quote Link:</strong> <a href="${quoteUrl}" style="color:#111827;">${escapeHtml(quoteUrl)}</a></p>

        <div style="border:1px solid #e5e7eb; border-radius:12px; padding:12px; background:#f9fafb; margin:12px 0;">
          <p style="margin:0 0 6px 0;"><strong>Estimate:</strong> $${formatMoney(estimateLow)} – $${formatMoney(estimateHigh)}</p>
          <p style="margin:0 0 6px 0;"><strong>Coverage:</strong> ${escapeHtml(hoursLabel)}</p>
          <p style="margin:0 0 6px 0;"><strong>Expected demand:</strong> ${escapeHtml(expectedHeadshotsLabel)}</p>
          <p style="margin:0 0 6px 0;"><strong>Pace:</strong> ${escapeHtml(paceLabel)}</p>
          <p style="margin:0 0 6px 0;"><strong>Stations:</strong> ${recommendedStations}</p>
          <p style="margin:0;"><strong>Capacity:</strong> ${capacityLow}–${capacityHigh}</p>
        </div>
      </div>
    `;

    await resend.emails.send({
      from,
      to: notify,
      subject: "New Conference Headshot Booth Estimate Request",
      html: leadHtml
    });

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: "Failed to send estimate email." }, { status: 500 });
  }
}