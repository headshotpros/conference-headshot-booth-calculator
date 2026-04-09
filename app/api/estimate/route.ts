console.log("🔥 ROUTE HIT v2");
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
    const mailercloudKey = process.env.MAILERCLOUD_API_KEY;
    const from = process.env.FROM_EMAIL;
    const notify = process.env.LEAD_NOTIFICATION_EMAIL;

    const quoteUrl =
      process.env.QUOTE_URL ||
      "https://headshotprosaz.com/professional-headshot-booth-phoenix/#quote";

    if (!resendKey || !mailercloudKey || !from || !notify) {
      return Response.json(
        {
          error:
            "Missing RESEND_API_KEY, MAILERCLOUD_API_KEY, FROM_EMAIL, or LEAD_NOTIFICATION_EMAIL",
        },
        { status: 500 }
      );
    }

    const body = (await req.json()) as Payload;

    if (!body?.email || !body.email.includes("@")) {
      return Response.json(
        { error: "A valid email is required." },
        { status: 400 }
      );
    }

    const resend = new Resend(resendKey);

    const firstName = body.firstName?.trim() || "";
    const greet = firstName ? `Hi ${escapeHtml(firstName)}!` : "Hi there!";
    const eventType = boothTypeLabel(body.boothType);
    const timeline = body.timeline?.trim() || "";

// 🎯 Mailercloud list selection
const listId = body.boothType === "CONVENTION" ? "fHZHHa" : "uHZwHw";

console.log("Mailercloud starting...");
console.log("Mailercloud key exists:", !!mailercloudKey);
console.log("Mailercloud boothType:", body.boothType);
console.log("Mailercloud listId:", listId);

// 🚀 Add to Mailercloud (non-blocking)
try {
  const mcPayload = {
    email: body.email,
    name: firstName,
    listId: listId,
    resubscribe: true,
  };

  console.log("Mailercloud payload:", JSON.stringify(mcPayload));

  const mcRes = await fetch("https://cloudapi.mailercloud.com/v1/contacts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: mailercloudKey,
    },
    body: JSON.stringify(mcPayload),
  });

  const mcText = await mcRes.text();

  console.log("Mailercloud status:", mcRes.status);
  console.log("Mailercloud ok:", mcRes.ok);
  console.log("Mailercloud response:", mcText);
} catch (err) {
  console.error("Mailercloud request failed:", err);
}
    // 📧 Subject line
    const subject =
      body.boothType === "COMPANY"
        ? "Your Company Headshot Estimate"
        : "Your Conference Headshot Booth Estimate";

    // 📧 User email
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif; max-width:680px;">
        <p>${greet}</p>

        <h2>${escapeHtml(subject)}</h2>

        <div style="border:1px solid #e5e7eb; border-radius:12px; padding:16px; background:#f9fafb;">
          <div>Estimated Budget Range</div>
          <div style="font-size:28px; font-weight:bold;">
            $${formatMoney(body.estimateLow)} – $${formatMoney(body.estimateHigh)}
          </div>

          <div style="margin-top:12px;">
            <div><strong>Event type:</strong> ${escapeHtml(eventType)}</div>
            ${timeline ? `<div><strong>Timeline:</strong> ${escapeHtml(timeline)}</div>` : ""}
            <div><strong>Coverage:</strong> ${escapeHtml(body.hoursLabel)}</div>
            <div><strong>Expected demand:</strong> ${escapeHtml(body.expectedHeadshotsLabel)}</div>
            <div><strong>Session speed:</strong> ${escapeHtml(body.paceLabel)}</div>
            <div><strong>Stations:</strong> ${escapeHtml(
              body.recommendedStationsLabel || String(body.recommendedStations)
            )}</div>
            <div><strong>Estimated capacity:</strong> ${body.capacityLow}–${body.capacityHigh}</div>
          </div>
        </div>

        <p style="margin-top:12px;">
          Most of our work is in the Phoenix area, and we’d love to help if your event is local.
        </p>

        <p>
          Reply and tell me a little about your event — I’m happy to help refine the setup.
        </p>

        <p style="font-size:12px; color:#6b7280;">
          ${escapeHtml(body.disclaimerText)}
        </p>
      </div>
    `;

    await resend.emails.send({
      from,
      to: body.email,
      subject,
      html,
    });

    // 📧 Internal notification
    const leadHtml = `
      <div>
        <h2>New Calculator Lead</h2>
        <p><strong>Name:</strong> ${firstName || "Not provided"}</p>
        <p><strong>Email:</strong> ${body.email}</p>
        <p><strong>Event Type:</strong> ${eventType}</p>
        <p><strong>Estimate:</strong> $${formatMoney(body.estimateLow)} – $${formatMoney(body.estimateHigh)}</p>
      </div>
    `;

    await resend.emails.send({
      from,
      to: notify,
      subject: "New Headshot Estimate Lead",
      html: leadHtml,
    });

    return Response.json({ success: true });
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: "Failed to process request." },
      { status: 500 }
    );
  }
}
