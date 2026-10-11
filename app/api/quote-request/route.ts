import { Resend } from "resend";

type QuotePayload = {
  name: string;
  company: string;
  email: string;
  phone: string;
  preferredContact?: "email" | "call" | "text" | "no_preference";
  eventWhen: string;
  eventWhere: string;
  notes?: string;

  boothType: "CONVENTION" | "COMPANY";
  estimateLow: number;
  estimateHigh: number;
  hoursLabel: string;
  expectedHeadshotsLabel: string;
  paceLabel: string;
  stations: number;
  stationsLabel?: string;
  capacityLow: number;
  capacityHigh: number;
  disclaimerText: string;

  isMultiDay: boolean;
  days: number;
  hoursPerDay: number;
  useParticipationEstimate: boolean;
  volumeInputMode: "HEADSHOTS" | "ATTENDEES";
  expectedHeadshots: number;
  attendees: number;
  participationRate: number;
  autoStations: boolean;
  addMakeup: boolean;
  makeupArtists: number;
  addEnhancedRetouch: boolean;
};

function escapeHtml(value: string | number | boolean | undefined | null) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function eventTypeLabel(type: QuotePayload["boothType"]) {
  return type === "COMPANY" ? "Company Team Event" : "Conference / Expo Booth";
}

function contactLabel(value?: QuotePayload["preferredContact"]) {
  if (value === "email") return "Email";
  if (value === "call") return "Call";
  if (value === "text") return "Text";
  return "No preference";
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function detailRow(label: string, value: string | number) {
  return `<tr>
    <td style="padding:7px 10px; border-bottom:1px solid #e5e7eb; color:#475569; width:38%;"><strong>${escapeHtml(label)}</strong></td>
    <td style="padding:7px 10px; border-bottom:1px solid #e5e7eb; color:#0f172a;">${escapeHtml(value)}</td>
  </tr>`;
}

export async function POST(req: Request) {
  try {
    const resendKey = process.env.RESEND_API_KEY;
    const from = process.env.FROM_EMAIL;
    const notify = process.env.LEAD_NOTIFICATION_EMAIL;

    if (!resendKey || !from || !notify) {
      return Response.json(
        { error: "Missing email configuration." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as QuotePayload;

    if (!body?.name?.trim()) {
      return Response.json({ error: "Name is required." }, { status: 400 });
    }
    if (!body?.company?.trim()) {
      return Response.json({ error: "Company is required." }, { status: 400 });
    }
    if (!body?.email?.includes("@")) {
      return Response.json({ error: "A valid email is required." }, { status: 400 });
    }
    if (!body?.phone?.trim()) {
      return Response.json({ error: "Phone is required." }, { status: 400 });
    }
    if (!body?.eventWhen?.trim()) {
      return Response.json({ error: "Please tell us when you are planning the headshots." }, { status: 400 });
    }
    if (!body?.eventWhere?.trim()) {
      return Response.json({ error: "Please tell us where you are planning the headshots." }, { status: 400 });
    }

    const resend = new Resend(resendKey);
    const eventType = eventTypeLabel(body.boothType);
    const preferredContact = contactLabel(body.preferredContact);

    const plannerRows = [
      detailRow("Planner", eventType),
      detailRow("Estimated budget", `${formatMoney(body.estimateLow)} – ${formatMoney(body.estimateHigh)}`),
      detailRow("Coverage", body.hoursLabel),
      detailRow("Session speed", body.paceLabel),
      detailRow("Photographer stations", body.stationsLabel || body.stations),
      detailRow("Estimated capacity", `${body.capacityLow}–${body.capacityHigh}`),
      ...(body.isMultiDay
        ? [detailRow("Days", body.days), detailRow("Hours per day", body.hoursPerDay)]
        : [detailRow("Hours on-site", body.hoursPerDay)]),
      ...(body.useParticipationEstimate
        ? [
            detailRow("Expected demand", body.expectedHeadshotsLabel),
            detailRow(
              "Headcount input method",
              body.volumeInputMode === "HEADSHOTS"
                ? "People who want headshots"
                : "Total attendees + participation"
            ),
            ...(body.volumeInputMode === "HEADSHOTS"
              ? [detailRow("People needing headshots", body.expectedHeadshots)]
              : [
                  detailRow("Total attendees", body.attendees),
                  detailRow("Expected participation", `${body.participationRate}%`),
                ]),
          ]
        : [detailRow("Expected headshot count", "Not provided")]),
      detailRow("Stations auto-recommended", yesNo(body.autoStations)),
      detailRow("Makeup artist option", body.addMakeup ? `Yes — ${body.makeupArtists} artist${body.makeupArtists === 1 ? "" : "s"}` : "No"),
      detailRow("Enhanced retouching", yesNo(body.addEnhancedRetouch)),
    ].join("");

    const contactRows = [
      detailRow("Name", body.name.trim()),
      detailRow("Company", body.company.trim()),
      detailRow("Email", body.email.trim()),
      detailRow("Phone", body.phone.trim()),
      detailRow("Preferred contact", preferredContact),
      detailRow("When", body.eventWhen.trim()),
      detailRow("Where", body.eventWhere.trim()),
      ...(body.notes?.trim() ? [detailRow("Notes", body.notes.trim())] : []),
    ].join("");

    const prospectSubject =
      body.boothType === "COMPANY"
        ? "We received your company headshot quote request"
        : "We received your conference headshot quote request";

    const prospectHtml = `
      <div style="font-family:Arial,Helvetica,sans-serif; max-width:720px; margin:0 auto; color:#0f172a;">
        <div style="border-top:5px solid #DF9A2B; padding-top:18px;">
          <p>Hi ${escapeHtml(body.name.trim().split(/\s+/)[0])},</p>
          <h2 style="margin-bottom:8px;">We received your quote request.</h2>
          <p style="color:#475569; line-height:1.6;">
            Thanks for planning your headshots with Headshot Pros AZ. Cari will review the details you sent and follow up with you.
            Here is a copy for your records so you do not have to recreate anything.
          </p>
        </div>

        <h3 style="margin:24px 0 8px;">Your contact + event details</h3>
        <table style="width:100%; border-collapse:collapse; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
          ${contactRows}
        </table>

        <h3 style="margin:24px 0 8px;">What you planned</h3>
        <table style="width:100%; border-collapse:collapse; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
          ${plannerRows}
        </table>

        <p style="margin-top:18px; font-size:12px; color:#64748b; line-height:1.5;">
          ${escapeHtml(body.disclaimerText)}
        </p>

        <p style="margin-top:24px;">
          Headshot Pros AZ<br />
          Arizona's Headshot Experts
        </p>
      </div>
    `;

    const ownerHtml = `
      <div style="font-family:Arial,Helvetica,sans-serif; max-width:760px; color:#0f172a;">
        <div style="border-top:5px solid #DF9A2B; padding-top:18px;">
          <h2 style="margin-bottom:6px;">New Custom Quote Request</h2>
          <div style="font-size:18px; color:#475569;">${escapeHtml(body.company.trim())} • ${escapeHtml(eventType)}</div>
        </div>

        <h3 style="margin:24px 0 8px;">Contact + event</h3>
        <table style="width:100%; border-collapse:collapse; border:1px solid #e5e7eb;">
          ${contactRows}
        </table>

        <h3 style="margin:24px 0 8px;">Planner details</h3>
        <table style="width:100%; border-collapse:collapse; border:1px solid #e5e7eb;">
          ${plannerRows}
        </table>

        <p style="margin-top:18px; font-size:12px; color:#64748b;">
          Submitted from the Headshot Pros AZ planning tool.
        </p>
      </div>
    `;

    const internalSubject = `New quote request — ${body.company.trim()} — ${body.name.trim()}`;

    await Promise.all([
      resend.emails.send({
        from,
        to: body.email.trim(),
        subject: prospectSubject,
        html: prospectHtml,
      }),
      resend.emails.send({
        from,
        to: notify,
        replyTo: body.email.trim(),
        subject: internalSubject,
        html: ownerHtml,
      }),
    ]);

    return Response.json({ success: true });
  } catch (err) {
    console.error("Quote request failed:", err);
    return Response.json(
      { error: "Failed to send quote request." },
      { status: 500 }
    );
  }
}
