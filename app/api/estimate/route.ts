import { Resend } from "resend";

type Payload = {
  email: string;
  firstName?: string;
  phone?: string;
  intent?: "budgeting" | "ready_for_call";
  timeline?: string;

  estimateLow: number;
  estimateHigh: number;

  hoursLabel: string;
  expectedHeadshotsLabel: string;
  paceLabel: string;
  recommendedStations: number;
  recommendedStationsLabel?: string;

  capacityLow: number;
  capacityHigh: number;

  disclaimerText: string;

  // Extra fields from the calculator UI
  boothType?: "CONVENTION" | "COMPANY";
  optInWorksheet?: boolean;
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

function boothTypeLabel(boothType?: "CONVENTION" | "COMPANY") {
  if (boothType === "COMPANY") return "Company Team Event";
  if (boothType === "CONVENTION") return "Conference / Expo Booth";
  return "Not specified";
}

function intentLabel(intent?: "budgeting" | "ready_for_call") {
  if (intent === "ready_for_call") return "Would like a quick planning call";
  if (intent === "budgeting") return "Budgeting / gathering quotes";
  return "Not specified";
}

export async function POST(req: Request) {
  try {
    const resendKey = process.env.RESEND_API_KEY;
    const from = process.env.FROM_EMAIL;
    const notify = process.env.LEAD_NOTIFICATION_EMAIL;
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
    const eventType = boothTypeLabel(body.boothType);
    const timeline = body.timeline?.trim() || "";

    const subject =
      body.boothType === "COMPANY"
        ? "Your Company Conference Headshot Estimate"
        : "Your Conference Headshot Booth Estimate";

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif; line-height:1.45; color:#111; max-width:680px;">
        <p style="margin:0 0 14px 0;">${greet}</p>

        <h2 style="margin:0 0 10px 0;">${escapeHtml(subject)}</h2>

        <div style="border:1px solid #e5e7eb; border-radius:12px; padding:16px; background:#f9fafb; margin:14px 0;">
          <div style="font-size:14px; color:#374151;">Estimated Budget Range</div>
          <div style="font-size:28px; font-weight:700; margin-top:2px;">
            $${formatMoney(body.estimateLow)} – $${formatMoney(body.estimateHigh)}
          </div>

          <div style="margin-top:12px; font-size:14px; color:#111;">
            <div><strong>Event type:</strong> ${escapeHtml(eventType)}</div>
            ${timeline ? `<div><strong>Event timeline:</strong> ${escapeHtml(timeline)}</div>` : ""}
            <div><strong>Coverage:</strong> ${escapeHtml(body.hoursLabel)}</div>
            <div><strong>Expected demand:</strong> ${escapeHtml(body.expectedHeadshotsLabel)}</div>
            <div><strong>Pace:</strong> ${escapeHtml(body.paceLabel)}</div>
            <div><strong>Recommended stations:</strong> ${escapeHtml(body.recommendedStationsLabel || String(body.recommendedStations))}</div>
            <div><strong>Estimated capacity:</strong> ${body.capacityLow}–${body.capacityHigh} headshots</div>
          </div>
        </div>

        <p style="margin:0 0 12px 0;">
          This estimate is designed to help with early event budgeting. Final quotes are confirmed after reviewing your event details.
        </p>

        <p style="margin:0 0 12px 0;">
          If you'd like, I can help refine the setup based on your event schedule and attendee flow.
        </p>

        <p style="margin:0 0 16px 0;">
          <strong>Does this look close to what you're planning, or would you like help refining the setup?</strong><br />
          Just reply and tell me a little about your event.
        </p>

        <p style="margin:0 0 12px 0; font-size:13px; color:#374151;">
          Feel free to forward this estimate to your team or event sponsors.
        </p>

        <p style="margin:0 0 12px 0; font-size:12px; color:#6b7280;">
          We’ll send your estimate and occasional headshot booth planning tips.
        </p>

        <p style="margin:0 0 14px 0; color:#6b7280; font-size:12px;">
          ${escapeHtml(body.disclaimerText)}
        </p>

        <div><table cellpadding="0" style="border-collapse:collapse;width:max-content;max-width:500px;"><tr><td></td></tr><tr><td><table cellpadding="0" style="border-collapse:collapse;font-size:14.4px;"><tr><td style="margin:0.1px;padding:0;"><table cellpadding="0" style="border-collapse:collapse;"><tr><td valign="top" style="margin:0.1px;padding:0 9px 0 0;position:relative;border-right:2px solid #DF9A2B;padding-right:10px;"><img src="https://img.mysignature.io/p/6/3/8/638ce43f-7759-510f-a924-f939937776e0.png?time=1727408661&amp;uid=554241&amp;sid=1350508" width="137" style="display:block;min-width:137px;" alt="HeadshotProsAZ"></td><td style="margin:0.1px;position:relative;padding-right:10px;padding-left:10px;" valign="top"><table cellpadding="0" style="border-collapse:collapse;"><tr><td style="position:relative;padding-bottom:10px;"><table cellpadding="0" style="border-collapse:collapse;position:relative;"><tr><td style="margin:0.1px;padding:0;font:17.3px/22.1px Verdana, Geneva, sans-serif;color:#000001;"><span style="font:17.3px/22.1px Verdana, Geneva, sans-serif;color:#DF9A2B;">Cari Hall</span></td></tr><tr><td style="margin:0.1px;padding:5px 0 0;font:14.4px/18.3px Verdana, Geneva, sans-serif;color:#4D5C63;">HeadshotProsAZ</td></tr></table></td></tr><tr><td style="position:relative;padding-bottom:10px;"><table cellpadding="0" style="border-collapse:collapse;"><tr><td style="margin:0.1px;padding:0;font:14.4px/18.3px Verdana, Geneva, sans-serif;color:#000001;"><span style="color:#4D5C63;">website </span><a href="https://mysig.io/61EN4MVk" style="color:#4D5C63;text-decoration:none;" target="_blank">HeadshotProsAZ.com</a></td></tr><tr><td style="margin:0.1px;padding:0;font:14.4px/18.3px Verdana, Geneva, sans-serif;color:#000001;"><span style="color:#4D5C63;">phone </span><a href="tel:480-300-2542" style="color:#4D5C63;text-decoration:none;" target="_blank">480-300-2542</a></td></tr><tr><td style="margin:0.1px;padding:0;font:14.4px/18.3px Verdana, Geneva, sans-serif;color:#000001;"><span style="color:#4D5C63;">email </span><a href="mailto:cari@headshotprosaz.com" style="color:#4D5C63;text-decoration:none;" target="_blank">cari@headshotprosaz.com</a></td></tr></table></td></tr><tr><td style="position:relative;"><table cellpadding="0" style="border-collapse:collapse;"><tr><td style="margin:0.1px;padding:0;font:14.4px/18.3px Verdana, Geneva, sans-serif;color:#000001;"><table cellpadding="0" style="border-collapse:collapse;"><tr><td style="margin:0.1px;padding:0 4px 0 0;font:14.4px/18.3px Verdana, Geneva, sans-serif;color:#000001;"><a href="https://mysig.io/Pem0q35Y" target="_blank"><img style="display:block;min-width:22px;" width="22" src="https://img.mysignature.io/s/a/6/4/a64236d6-9da2-5720-b7bb-9205e1a6cc6a.png?uid=554241&amp;sid=1350508&amp;time=1727408661" alt="HeadshotProsAZ"></a></td><td style="margin:0.1px;padding:0 4px 0 0;font:14.4px/18.3px Verdana, Geneva, sans-serif;color:#000001;"><a href="https://mysig.io/Xnjzr3Qn" target="_blank"><img style="display:block;min-width:22px;" width="22" src="https://img.mysignature.io/s/f/8/1/f81d2cb2-7540-52e8-b375-63bcb884c983.png?uid=554241&amp;sid=1350508&amp;time=1727408661" alt="HeadshotProsAZ"></a></td><td style="margin:0.1px;padding:0 4px 0 0;font:14.4px/18.3px Verdana, Geneva, sans-serif;color:#000001;"><a href="https://mysig.io/K7YdJDB8" target="_blank"><img style="display:block;min-width:22px;" width="22" src="https://img.mysignature.io/s/1/f/6/1f637bc9-fa1b-576c-8d5c-dd9dfde67880.png?uid=554241&amp;sid=1350508&amp;time=1727408661" alt="HeadshotProsAZ"></a></td></tr></table></td></tr></table></td></tr></table></td></tr></table></td></tr><tr><td><div><table width="100" cellspacing="0" cellpadding="0" border="0"><tr><td style="margin:0.1px;line-height:1px;font-size:1px;height:1px;">&nbsp;</td></tr></table></div></td></tr><tr><td></td></tr></table></div>
      </div>
    `;

    await resend.emails.send({
      from,
      to: body.email,
      subject,
      html
    });

    const leadHtml = `
      <div style="font-family:Arial,Helvetica,sans-serif; line-height:1.45; color:#111; max-width:680px;">
        <h2 style="margin:0 0 10px 0;">New Calculator Lead</h2>

        <p style="margin:0 0 6px 0;"><strong>Name:</strong> ${body.firstName ? escapeHtml(body.firstName) : "Not provided"}</p>
        <p style="margin:0 0 6px 0;"><strong>Email:</strong> ${escapeHtml(body.email)}</p>
        ${body.phone ? `<p style="margin:0 0 6px 0;"><strong>Phone:</strong> ${escapeHtml(body.phone)}</p>` : ""}
        <p style="margin:0 0 6px 0;"><strong>Intent:</strong> ${escapeHtml(intentLabel(body.intent))}</p>
        ${timeline ? `<p style="margin:0 0 6px 0;"><strong>Event Timeline:</strong> ${escapeHtml(timeline)}</p>` : ""}
        <p style="margin:0 0 6px 0;"><strong>Event Type:</strong> ${escapeHtml(eventType)}</p>
        <p style="margin:0 0 6px 0;"><strong>Worksheet Opt-In:</strong> ${body.optInWorksheet ? "Yes" : "No"}</p>

        <div style="border:1px solid #e5e7eb; border-radius:12px; padding:12px; background:#f9fafb; margin:12px 0;">
          <p style="margin:0 0 6px 0;"><strong>Estimate:</strong> $${formatMoney(body.estimateLow)} – $${formatMoney(body.estimateHigh)}</p>
          <p style="margin:0 0 6px 0;"><strong>Coverage:</strong> ${escapeHtml(body.hoursLabel)}</p>
          <p style="margin:0 0 6px 0;"><strong>Expected demand:</strong> ${escapeHtml(body.expectedHeadshotsLabel)}</p>
          <p style="margin:0 0 6px 0;"><strong>Pace:</strong> ${escapeHtml(body.paceLabel)}</p>
          <p style="margin:0 0 6px 0;"><strong>Stations:</strong> ${escapeHtml(body.recommendedStationsLabel || String(body.recommendedStations))}</p>
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
      html: leadHtml
    });

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: "Failed to send estimate email." }, { status: 500 });
  }
}