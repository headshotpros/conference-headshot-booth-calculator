"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type BoothType = "CONVENTION" | "COMPANY";
type Mode = "TIME" | "VOLUME";
type Pace = "HIGH" | "STANDARD" | "PREFERRED";
type VolumeInputMode = "HEADSHOTS" | "ATTENDEES";
type LeadIntent = "budgeting" | "ready_for_call";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
function roundToHalf(n: number) {
  return Math.round(n * 2) / 2;
}
function formatMoney(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function formatHoursToDaysHours(totalHours: number) {
  const days = Math.floor(totalHours / 8);
  const remainder = totalHours - days * 8;
  const whole = Math.floor(remainder);
  const half = remainder - whole >= 0.5 ? 0.5 : 0;
  const minutes = half === 0.5 ? 30 : 0;

  if (days <= 0) return minutes ? `${whole}h 30m` : `${whole}h`;
  const parts: string[] = [`${days}d`];
  if (whole) parts.push(`${whole}h`);
  if (minutes) parts.push(`${minutes}m`);
  return parts.join(" ");
}

// Public quote link button from this calculator
const QUOTE_URL = "https://headshotprosaz.com/professional-headshot-booth-phoenix/#quote";
const COMPANY_HEADSHOTS_QUOTE_URL = "https://headshotprosaz.com/company-headshots-phoenix/#quote";

const DISCLAIMER_TEXT =
  "Travel may apply outside the Phoenix metro area. Venue parking fees or accommodations may apply depending on the location and event schedule. Arizona sales tax (8.3%) added where applicable.";

/**
 * Always-on "real world" buffer applied to capacity + wait-time calculations.
 * This keeps estimates conservative (breaks, natural pacing variation, traffic bursts).
 */
const REAL_WORLD_BUFFER = 0.9; // 10% conservative buffer, always-on

/**
 * Base pricing ranges (per day, 1 photographer station)
 * Half day (≤4 hours/day): $2,250–$2,700 (typical $2,500)
 * Full day (>4 up to 8/day): $3,500–$4,000 (typical $3,750)
 */
const BASE_PRICING = {
  halfDay: { low: 2250, mid: 2500, high: 2700 },
  fullDay: { low: 3500, mid: 3750, high: 4000 }
};

// Multi-day commitment discounts
function multiDayDiscount(days: number) {
  if (days >= 4) return 0.1; // 10% off per day
  if (days >= 2) return 0.06; // 6% off per day
  return 0;
}

// Add-ons (kept minimal / non-line-item-y)
const ADDONS = {
  secondStation: { halfDay: 1500, fullDay: 2500 }, // per day (adds a 2nd photographer station)
  enhancedRetouchPerStation: { halfDay: 500, fullDay: 1000 }, // per day, per station
  makeupArtist: { halfDay: 600, fullDay: 900 } // per day, per makeup artist
};

// Pace = minutes/person + people/hour (range)
const PACE = {
  HIGH: {
    label: "Express Headshot Booth",
    minutesRange: [2, 3] as [number, number],
    perHourRange: [20, 30] as [number, number],
    conservativePerHour: 20
  },
  STANDARD: {
    label: "Professional Headshot Experience",
    minutesRange: [4, 5] as [number, number],
    perHourRange: [12, 15] as [number, number],
    conservativePerHour: 12
  },
  PREFERRED: {
    label: "Premium Headshot Experience",
    minutesRange: [7, 10] as [number, number],
    perHourRange: [6, 9] as [number, number],
    conservativePerHour: 6
  }
} satisfies Record<
  Pace,
  {
    label: string;
    minutesRange: [number, number];
    perHourRange: [number, number];
    conservativePerHour: number;
  }
>;

export default function Page() {
  // Step 1: event type
  const [boothType, setBoothType] = useState<BoothType>("CONVENTION");

  // Top toggle: do they know time or volume first?
  const [mode, setMode] = useState<Mode>("TIME");

  // Time inputs
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [days, setDays] = useState(1);
  const [hoursPerDay, setHoursPerDay] = useState(4);

  // Participation / volume inputs
  const [volumeInputMode, setVolumeInputMode] = useState<VolumeInputMode>("ATTENDEES");
  const [expectedHeadshots, setExpectedHeadshots] = useState(80);
  const [attendees, setAttendees] = useState(600);
  const [participationRate, setParticipationRate] = useState(25); // %

  // OFF by default
  const [useParticipationEstimate, setUseParticipationEstimate] = useState(false);

  // Pace
  const [pace, setPace] = useState<Pace>("HIGH");

  // Photographer stations
  const [autoStations, setAutoStations] = useState(true);
  const [stationsOverride, setStationsOverride] = useState<1 | 2 | 3>(1);

  // Options
  const [addMakeup, setAddMakeup] = useState(false);
  const [makeupArtists, setMakeupArtists] = useState<1 | 2 | 3>(1);

  // Light retouching is included.
  const [addEnhancedRetouch, setAddEnhancedRetouch] = useState(false);

  // Lead capture
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [leadFirstName, setLeadFirstName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadIntent, setLeadIntent] = useState<LeadIntent>("budgeting");
  const [leadPhone, setLeadPhone] = useState("");
  const [eventTimeline, setEventTimeline] = useState("");
  const [optInWorksheet, setOptInWorksheet] = useState(true);

  const firstNameInputRef = useRef<HTMLInputElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const participationSectionRef = useRef<HTMLDivElement | null>(null);

  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // When booth type changes, set sensible defaults (and default input mode!)
  useEffect(() => {
    if (boothType === "CONVENTION") {
      setMode("TIME");
      setPace("HIGH");
      setVolumeInputMode("ATTENDEES"); // convention default
      setParticipationRate(25);
      setAttendees(600);
      setExpectedHeadshots(120);
      setUseParticipationEstimate(false);
    } else {
      setMode("VOLUME");
      setPace("STANDARD");
      setVolumeInputMode("HEADSHOTS"); // company default
      setExpectedHeadshots(40);
      setAttendees(200);
      setParticipationRate(60);
      setUseParticipationEstimate(false);
    }

    setShowEmailForm(false);
    setSentOk(false);
    setSendError(null);
    setEventTimeline("");
  }, [boothType]);

  // Derived: total hours
  const totalHours = useMemo(() => {
    const d = clamp(days, 1, 5);
    const hpd = clamp(hoursPerDay, 1, 8);
    return isMultiDay ? d * hpd : clamp(hoursPerDay, 1, 8);
  }, [isMultiDay, days, hoursPerDay]);

  const totalDays = useMemo(() => (isMultiDay ? clamp(days, 1, 5) : 1), [isMultiDay, days]);
  const perDayHours = useMemo(() => clamp(hoursPerDay, 1, 8), [hoursPerDay]);
  const isHalfDayPerDay = perDayHours <= 4;
  const perDayLabel = isHalfDayPerDay ? "Half-Day (up to 4 hours/day)" : "Full-Day (up to 8 hours/day)";

  const paceMeta = PACE[pace];

  const computedExpectedHeadshots = useMemo(() => {
    if (!useParticipationEstimate) return null;

    if (volumeInputMode === "HEADSHOTS") return clamp(expectedHeadshots, 1, 50000);
    const a = clamp(attendees, 1, 200000);
    const p = clamp(participationRate, 1, 90) / 100;
    return Math.max(1, Math.round(a * p));
  }, [useParticipationEstimate, volumeInputMode, expectedHeadshots, attendees, participationRate]);

  // Recommended photographer stations
  const recommendedStations = useMemo(() => {
    if (!useParticipationEstimate || computedExpectedHeadshots == null) return 1;

    const bufferedThroughput = paceMeta.conservativePerHour;
    const capacityPerStation = totalHours * bufferedThroughput;
    const needed = Math.ceil(computedExpectedHeadshots / Math.max(1, capacityPerStation));

    if (needed <= 1) return 1;
    if (needed === 2) return 2;
    return 3; // 3+ signals multi-station team
  }, [useParticipationEstimate, computedExpectedHeadshots, totalHours, paceMeta]);

  const recommendedStationsLabel = useMemo(() => {
    return recommendedStations >= 3 ? "3+" : `${recommendedStations}`;
  }, [recommendedStations]);

  const stations = useMemo(() => {
    if (!autoStations) return stationsOverride;
    return recommendedStations >= 3 ? 3 : (recommendedStations as 1 | 2 | 3);
  }, [autoStations, stationsOverride, recommendedStations]);

  const stationsLabel = useMemo(() => {
    return autoStations ? recommendedStationsLabel : `${stations}`;
  }, [autoStations, recommendedStationsLabel, stations]);

  // Makeup artists max = photographer stations
  const makeupArtistsMax = useMemo(() => Math.min(stations, 3) as 1 | 2 | 3, [stations]);
  useEffect(() => {
    if (makeupArtists > makeupArtistsMax) setMakeupArtists(makeupArtistsMax as 1 | 2 | 3);
  }, [makeupArtists, makeupArtistsMax]);

  // Capacity estimate range (display) — uses REAL_WORLD_BUFFER
  const capacityRange = useMemo(() => {
    const [low, high] = paceMeta.perHourRange;
    const lowCap = Math.floor(totalHours * (low * REAL_WORLD_BUFFER) * stations);
    const highCap = Math.floor(totalHours * (high * REAL_WORLD_BUFFER) * stations);
    return { low: lowCap, high: highCap };
  }, [paceMeta, totalHours, stations]);

  // If demand exceeds capacity, we should not show misleading cost/headshot
  const demandExceedsCapacity = useMemo(() => {
    if (!useParticipationEstimate || computedExpectedHeadshots == null) return false;
    return computedExpectedHeadshots > capacityRange.high;
  }, [useParticipationEstimate, computedExpectedHeadshots, capacityRange.high]);

  // Pricing: base range + add-ons + multiday discount
  const pricing = useMemo(() => {
    if (totalDays > 5 || perDayHours > 8) return { isCustom: true, low: 0, mid: 0, high: 0, discount: 0 };

    const base = isHalfDayPerDay ? BASE_PRICING.halfDay : BASE_PRICING.fullDay;

    const discount = multiDayDiscount(totalDays);
    const mult = 1 - discount;

    const baseLowPerDay = Math.round(base.low * mult);
    const baseMidPerDay = Math.round(base.mid * mult);
    const baseHighPerDay = Math.round(base.high * mult);

    const secondStationPerDay = isHalfDayPerDay ? ADDONS.secondStation.halfDay : ADDONS.secondStation.fullDay;
    const enhancedRetouchPerStationPerDay = isHalfDayPerDay
      ? ADDONS.enhancedRetouchPerStation.halfDay
      : ADDONS.enhancedRetouchPerStation.fullDay;
    const makeupPerArtistPerDay = isHalfDayPerDay ? ADDONS.makeupArtist.halfDay : ADDONS.makeupArtist.fullDay;

    const additionalStations = Math.max(0, stations - 1);
    const addStation = secondStationPerDay * additionalStations;
    const addEnhanced = addEnhancedRetouch ? enhancedRetouchPerStationPerDay * stations : 0;
    const addMakeupCost = addMakeup ? makeupPerArtistPerDay * makeupArtists : 0;

    const low = (baseLowPerDay + addStation + addEnhanced + addMakeupCost) * totalDays;
    const mid = (baseMidPerDay + addStation + addEnhanced + addMakeupCost) * totalDays;
    const high = (baseHighPerDay + addStation + addEnhanced + addMakeupCost) * totalDays;

    return { isCustom: false, low, mid, high, discount };
  }, [totalDays, perDayHours, isHalfDayPerDay, stations, addEnhancedRetouch, addMakeup, makeupArtists]);

  // Wait time estimate (buffered)
  const waitTimeStatus = useMemo(() => {
    if (!useParticipationEstimate || computedExpectedHeadshots == null) return null;

    const demand = computedExpectedHeadshots;
    const lowCap = capacityRange.low;
    const highCap = capacityRange.high;

    if (demand <= Math.floor(lowCap * 0.85)) return "green" as const;
    if (demand > highCap) return "red" as const;
    return "yellow" as const;
  }, [useParticipationEstimate, computedExpectedHeadshots, capacityRange.low, capacityRange.high]);

  const waitTimeCopy = useMemo(() => {
    if (!waitTimeStatus) {
      return {
        title: "Add your expected headshot count",
        detail: "Turn on 'how many people need headshots' above to see a wait-time prediction."
      };
    }

    if (waitTimeStatus === "green") {
      return { title: "Smooth flow", detail: "Most people should move through quickly with a comfortable buffer." };
    }
    if (waitTimeStatus === "yellow") {
      return { title: "Busy periods likely", detail: "Short lines may form during peak times (breaks, lunch, after sessions)." };
    }
    return { title: "Lines expected", detail: "Add a photographer station or extend coverage to reduce wait times." };
  }, [waitTimeStatus]);

  // Cost per headshot: only show when it makes sense
  const costPerHeadshot = useMemo(() => {
    if (pricing.isCustom) return null;
    if (!useParticipationEstimate || computedExpectedHeadshots == null || computedExpectedHeadshots <= 0) return null;
    if (demandExceedsCapacity) return null;

    const low = Math.round(pricing.low / computedExpectedHeadshots);
    const high = Math.round(pricing.high / computedExpectedHeadshots);
    return { low, high };
  }, [pricing, useParticipationEstimate, computedExpectedHeadshots, demandExceedsCapacity]);

  // Under-20 note (company style)
  const under20Note = useMemo(() => {
    if (boothType !== "COMPANY") return null;
    if (!useParticipationEstimate || computedExpectedHeadshots == null) return null;
    if (computedExpectedHeadshots >= 20) return null;

    return {
      title: "Small team?",
      body: "For groups under 20, we typically quote using our company headshot structure (it’s often a better fit than booth pricing)."
    };
  }, [boothType, useParticipationEstimate, computedExpectedHeadshots]);

  const hoursLabel = useMemo(() => {
    if (!isMultiDay) return `${roundToHalf(perDayHours)} hours`;
    const d = clamp(days, 1, 5);
    const hpd = roundToHalf(perDayHours);
    return `${d} day${d === 1 ? "" : "s"} × ${hpd} hours/day`;
  }, [isMultiDay, perDayHours, days]);

  const expectedHeadshotsLabel = useMemo(() => {
    if (!useParticipationEstimate || computedExpectedHeadshots == null) return "Not provided";
    if (volumeInputMode === "HEADSHOTS") return `${computedExpectedHeadshots} people expected to get headshots`;
    return `${clamp(attendees, 1, 200000)} attendees @ ${clamp(participationRate, 1, 90)}% ≈ ${computedExpectedHeadshots} headshots`;
  }, [useParticipationEstimate, volumeInputMode, computedExpectedHeadshots, attendees, participationRate]);

  const paceLabel = useMemo(() => {
    const m = paceMeta.minutesRange;
    const r = paceMeta.perHourRange;
    return `${paceMeta.label} (${m[0]}–${m[1]} min/person, ~${r[0]}–${r[1]}/hr/station)`;
  }, [paceMeta]);

  function scrollToParticipationAndEnable() {
    setUseParticipationEstimate(true);
    setTimeout(() => {
      participationSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function onModeChange(next: Mode) {
    setMode(next);
    if (next === "VOLUME") scrollToParticipationAndEnable();
  }

  function openEmailFormAndFocusFirstName() {
    setShowEmailForm(true);
    setSentOk(false);
    setSendError(null);
    setTimeout(() => {
      firstNameInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      firstNameInputRef.current?.focus();
    }, 50);
  }

  async function sendEstimateEmail() {
    setSending(true);
    setSentOk(false);
    setSendError(null);

    try {
      const payload = {
        email: leadEmail.trim(),
        firstName: leadFirstName.trim(),
        phone: leadIntent === "ready_for_call" ? leadPhone.trim() || undefined : undefined,
        intent: leadIntent,
        timeline: eventTimeline || undefined,

        estimateLow: pricing.low,
        estimateHigh: pricing.high,

        hoursLabel,
        expectedHeadshotsLabel,
        paceLabel,
        recommendedStations: stations,
        recommendedStationsLabel: stationsLabel,
        capacityLow: capacityRange.low,
        capacityHigh: capacityRange.high,
        disclaimerText: DISCLAIMER_TEXT,

        boothType,
        optInWorksheet
      };
      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const out = await res.json();
      if (!res.ok) throw new Error(out?.error || "Failed to send estimate");

      setSentOk(true);
    } catch (e: any) {
      setSendError(e?.message || "Failed to send estimate");
    } finally {
      setSending(false);
    }
  }

  const deliverables = useMemo(() => {
    if (boothType === "CONVENTION") {
      return [
        "On-site headshot booth setup (backdrop + lighting)",
        "High-volume headshot workflow with quick posing and expression guidance",
        "Instant delivery via email with individual gallery links",
        "Optional lead capture + participant list export (CSV)",
        "Optional sponsor or company branding added to galleries and delivery pages"
      ];
    }
    return [
      "Mobile studio setup at your location (backdrop + lighting)",
      "Posing & expression coaching for a consistent, professional look",
      "Streamlined file naming by participant (with provided list)",
      "Flexible workflow — scheduled time slots or walk-up flow to keep teams moving smoothly",
      "Instant delivery via email with individual gallery links",
      "Optional company branding added to galleries and delivery pages"
    ];
  }, [boothType]);

  const title = boothType === "CONVENTION" ? "Conference Headshot Booth Cost Calculator" : "Company Conference Headshot Cost Calculator";

  const planningInsight = useMemo(() => {
    if (boothType === "CONVENTION") {
      return {
        title: "ROI planning insight (for conventions)",
        body:
          "Headshots are a high-value attendee perk and a strong sponsor activation. When the booth is easy to find and the wait stays manageable, participation climbs — and attendees leave with a “gift” they’ll actually use (a new profile photo) that keeps your brand top-of-mind after the event."
      };
    }
    return {
      title: "ROI planning insight (for company conferences)",
      body:
        "Team headshots reduce friction (no individual scheduling) and create consistent, professional images across leadership and staff. A great experience also helps employees feel valued and confident — which shows up in the photos and in how they represent the company afterward."
    };
  }, [boothType]);

  const canSendEmail = leadFirstName.trim().length > 0 && leadEmail.trim().includes("@");

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <header className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="text-slate-600 text-base sm:text-lg">
            {boothType === "CONVENTION"
              ? "Plan your conference headshot booth — including budget range, recommended photographer stations, estimated capacity, and wait times."
              : "Plan your company headshot session — including budget range, recommended photographer stations, estimated capacity, and wait times."}
          </p>
        </header>

        {/* Step 1: Choose event type */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4 sm:p-6">
            <h2 className="text-base font-semibold text-slate-900">Step 1: Who are the headshots for?</h2>
          </div>

          <div className="grid gap-3 p-4 sm:p-6 sm:grid-cols-2">
            <button
              onClick={() => setBoothType("CONVENTION")}
              className={`rounded-2xl border p-4 text-left transition ${
                boothType === "CONVENTION" ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <div className="text-sm font-semibold text-slate-900">Conference / Expo Booth</div>
              <div className="mt-1 text-sm text-slate-600">Headshots for attendees or sponsors — high-volume flow where wait times matter.</div>
            </button>

            <button
              onClick={() => setBoothType("COMPANY")}
              className={`rounded-2xl border p-4 text-left transition ${
                boothType === "COMPANY" ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <div className="text-sm font-semibold text-slate-900">Company Team Event</div>
              <div className="mt-1 text-sm text-slate-600">Headshots for your employees — often scheduled so everyone can be photographed efficiently.</div>
            </button>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  className={`rounded-lg px-4 py-2 text-sm font-medium ${
                    mode === "TIME" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                  onClick={() => onModeChange("TIME")}
                >
                  I know my time window
                </button>
                <button
                  className={`rounded-lg px-4 py-2 text-sm font-medium ${
                    mode === "VOLUME" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                  onClick={() => onModeChange("VOLUME")}
                >
                  I know how many people need headshots
                </button>
              </div>

              <div className="text-sm text-slate-600">
                Pricing tier: <span className="font-medium text-slate-900">{perDayLabel}</span>
              </div>
            </div>

            <p className="mt-3 text-sm text-slate-600">
              Pricing is based on time on-site. If you add an estimated headshot count, we’ll recommend photographer stations and estimate wait time.
            </p>
          </div>

          <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2">
            {/* Left: Inputs */}
            <div className="space-y-6">
              {/* Time */}
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-slate-900">Time on-site</h2>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={isMultiDay}
                      onChange={(e) => setIsMultiDay(e.target.checked)}
                    />
                    Multi-day
                  </label>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {isMultiDay ? (
                    <>
                      <div>
                        <label className="text-sm font-medium text-slate-700">Days</label>
                        <input
                          type="number"
                          min={1}
                          max={5}
                          value={days}
                          onChange={(e) => setDays(clamp(parseInt(e.target.value || "1", 10), 1, 5))}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                        />
                        <p className="mt-1 text-xs text-slate-500">1–5 days</p>
                      </div>

                      <div>
                        <label className="text-sm font-medium text-slate-700">Hours per day</label>
                        <input
                          type="number"
                          min={1}
                          max={8}
                          step={0.5}
                          value={hoursPerDay}
                          onChange={(e) => setHoursPerDay(clamp(roundToHalf(parseFloat(e.target.value || "4")), 1, 8))}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                        />
                        <p className="mt-1 text-xs text-slate-500">0.5-hour increments</p>
                      </div>
                    </>
                  ) : (
                    <div className="sm:col-span-2">
                      <label className="text-sm font-medium text-slate-700">Hours on-site</label>
                      <input
                        type="number"
                        min={1}
                        max={8}
                        step={0.5}
                        value={hoursPerDay}
                        onChange={(e) => setHoursPerDay(clamp(roundToHalf(parseFloat(e.target.value || "4")), 1, 8))}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                      />
                      <p className="mt-1 text-xs text-slate-500">Half-day pricing applies up to 4 hours. Full-day pricing applies over 4 hours (up to 8).</p>
                    </div>
                  )}
                </div>

                <div className="mt-4 text-sm text-slate-600">
                  Total time: <span className="font-medium text-slate-900">{formatHoursToDaysHours(totalHours)}</span>
                  {isMultiDay && totalDays >= 2 && <span className="ml-2 text-xs text-slate-500">(multi-day pricing applied)</span>}
                </div>
              </div>

              {/* Pace */}
              <div className="rounded-xl border border-slate-200 p-4">
                <h2 className="text-base font-semibold text-slate-900">Headshot experience speed</h2>
                <p className="mt-1 text-sm text-slate-600">Faster flow increases capacity. Slower pacing allows more coaching per person.</p>

                <div className="mt-4 grid gap-2">
                  {(["HIGH", "STANDARD", "PREFERRED"] as Pace[]).map((p) => {
                    const meta = PACE[p];
                    const isActive = pace === p;
                    return (
                      <button
                        key={p}
                        onClick={() => setPace(p)}
                        className={`flex items-center justify-between rounded-xl border px-3 py-3 text-left ${
                          isActive ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{meta.label}</div>
                          <div className="text-xs text-slate-600">
                            {meta.minutesRange[0]}–{meta.minutesRange[1]} minutes per person • ~{meta.perHourRange[0]}–{meta.perHourRange[1]} per hour per station
                          </div>
                        </div>
                        <div className={`h-4 w-4 rounded-full border ${isActive ? "border-slate-900 bg-slate-900" : "border-slate-300"}`} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Participation / demand */}
              <div ref={participationSectionRef} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      {boothType === "CONVENTION" ? "How many people do you expect will get headshots?" : "How many people need headshots?"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Turn this on to get staffing recommendations and a wait time estimate. Leave it off if you’re not sure yet.
                    </p>
                  </div>

                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={useParticipationEstimate}
                      onChange={(e) => setUseParticipationEstimate(e.target.checked)}
                    />
                    Use estimate
                  </label>
                </div>

                {useParticipationEstimate ? (
                  <>
                    <div className="mt-4">
                      <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                        <button
                          className={`rounded-lg px-3 py-2 text-xs font-medium ${
                            volumeInputMode === "HEADSHOTS" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                          }`}
                          onClick={() => setVolumeInputMode("HEADSHOTS")}
                        >
                          People who want headshots
                        </button>
                        <button
                          className={`rounded-lg px-3 py-2 text-xs font-medium ${
                            volumeInputMode === "ATTENDEES" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                          }`}
                          onClick={() => setVolumeInputMode("ATTENDEES")}
                        >
                          Total attendees
                        </button>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {boothType === "CONVENTION"
                          ? "Total attendees = everyone at the event. We’ll estimate headshots using a participation percentage."
                          : "People who want headshots = how many team members you want photographed."}
                      </p>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {volumeInputMode === "HEADSHOTS" ? (
                        <div className="sm:col-span-2">
                          <label className="text-sm font-medium text-slate-700">Estimated headshots needed</label>
                          <input
                            type="number"
                            min={1}
                            value={expectedHeadshots}
                            onChange={(e) => setExpectedHeadshots(clamp(parseInt(e.target.value || "1", 10), 1, 50000))}
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                          />
                          <p className="mt-1 text-xs text-slate-500">Adjust this to see how staffing and wait times change.</p>
                        </div>
                      ) : (
                        <>
                          <div>
                            <label className="text-sm font-medium text-slate-700">Estimated total attendees</label>
                            <input
                              type="number"
                              min={1}
                              value={attendees}
                              onChange={(e) => setAttendees(clamp(parseInt(e.target.value || "1", 10), 1, 200000))}
                              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-slate-700">Estimated participation</label>
                            <input
                              type="number"
                              min={1}
                              max={90}
                              value={participationRate}
                              onChange={(e) => setParticipationRate(clamp(parseInt(e.target.value || "25", 10), 1, 90))}
                              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                            />
                            <p className="mt-1 text-xs text-slate-500">
  {boothType === "CONVENTION"
    ? "If you’re unsure, start with 20–30% and adjust."
    : "If you’re unsure, start with 60–80% for internal team events and adjust."}
</p>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="mt-3 text-sm text-slate-600">
                      Estimated headshots: <span className="font-semibold text-slate-900">{computedExpectedHeadshots ?? "—"}</span>
                    </div>

                    {under20Note && (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                        <div className="font-semibold text-slate-900">{under20Note.title}</div>
                        <div className="mt-1 text-slate-600">{under20Note.body}</div>
                        <a
                          href={COMPANY_HEADSHOTS_QUOTE_URL}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          View small-team options
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                    Headshot estimate is off — we’ll still show budget range, but staffing and wait-time predictions will be limited.
                  </div>
                )}
              </div>

              {/* Photographer stations */}
              <div className="rounded-xl border border-slate-200 p-4">
                <h2 className="text-base font-semibold text-slate-900">Photographer stations</h2>
                <p className="mt-1 text-sm text-slate-600">A “station” is one photographer + one lighting setup.</p>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={autoStations}
                      onChange={(e) => setAutoStations(e.target.checked)}
                    />
                    Auto-recommend
                  </label>

                  {!autoStations && (
                    <select
                      value={stationsOverride}
                      onChange={(e) => setStationsOverride(parseInt(e.target.value, 10) as 1 | 2 | 3)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      <option value={1}>1 photographer station</option>
                      <option value={2}>2 photographer stations</option>
                      <option value={3}>3 photographer stations</option>
                    </select>
                  )}
                </div>

                <p className="mt-2 text-xs text-slate-500">Recommendation is conservative to avoid overpromising throughput.</p>
              </div>

              {/* Options */}
              <div className="rounded-xl border border-slate-200 p-4">
                <h2 className="text-base font-semibold text-slate-900">Options</h2>

                <div className="mt-3 space-y-3">
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-slate-300"
                        checked={addMakeup}
                        onChange={(e) => setAddMakeup(e.target.checked)}
                      />
                      <span>
                        <span className="font-medium text-slate-900">Makeup artist touch-up station</span>
                        <span className="block text-xs text-slate-500">Quick touch-ups to keep participants camera-ready.</span>
                      </span>
                    </label>

                    {addMakeup && (
                      <div className="ml-7 grid gap-2">
                        <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Makeup artists</label>
                        <select
                          value={makeupArtists}
                          onChange={(e) => setMakeupArtists(parseInt(e.target.value, 10) as 1 | 2 | 3)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                        >
                          <option value={1}>1 makeup artist</option>
                          {makeupArtistsMax >= 2 && <option value={2}>2 makeup artists</option>}
                          {makeupArtistsMax >= 3 && <option value={3}>3 makeup artists (one per station)</option>}
                        </select>
                        <p className="text-xs text-slate-500">
                          Additional makeup artists help reduce bottlenecks and keep participants camera-ready.
                        </p>
                      </div>
                    )}
                  </div>

                  <label className="flex items-start gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                      checked={addEnhancedRetouch}
                      onChange={(e) => setAddEnhancedRetouch(e.target.checked)}
                    />
                    <span>
                      <span className="font-medium text-slate-900">Enhanced retouching (optional)</span>
                      <span className="block text-xs text-slate-500">A step up from the included polish — cleaner, more refined final look.</span>
                    </span>
                  </label>
                </div>

                <div className="mt-3 text-xs text-slate-500">
                  Light retouching is included for the booth workflow. (More detailed edits can be discussed after reviewing your event needs.)
                </div>
              </div>
            </div>

            {/* Right: Outputs */}
            <div className="space-y-6">
              {/* Budget */}
              <div className="rounded-xl border border-slate-200 p-4">
                <h2 className="text-base font-semibold text-slate-900">Estimated budget range</h2>

                {pricing.isCustom ? (
                  <div className="mt-3 text-sm text-slate-700">Please request a custom quote for this configuration.</div>
                ) : (
                  <>
                    <div className="mt-3">
                      <div className="text-3xl font-semibold tracking-tight text-slate-900">
                        {formatMoney(pricing.low)} – {formatMoney(pricing.high)}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Use this tool to estimate a budget range for your event. We’ll provide a personalized quote after reviewing your event details.
                      </div>

                      {pricing.discount > 0 && (
                        <div className="mt-2 text-xs text-slate-500">Multi-day pricing applied ({Math.round(pricing.discount * 100)}% off per day).</div>
                      )}
                    </div>

                    {!showEmailForm && (
                      <button
                        onClick={openEmailFormAndFocusFirstName}
                        className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        Save my estimate
                      </button>
                    )}

                    {showEmailForm && (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                        <h3 className="text-lg font-semibold text-slate-900">Save Your Results</h3>
                        <p className="mt-2 text-sm text-slate-600">
                          Want to save or share this estimate with your team? Enter your email and we’ll send the results instantly.
                        </p>

                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <input
                            ref={firstNameInputRef}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                            placeholder="First name"
                            value={leadFirstName}
                            onChange={(e) => setLeadFirstName(e.target.value)}
                          />
                          <input
                            ref={emailInputRef}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                            placeholder="Email"
                            value={leadEmail}
                            onChange={(e) => setLeadEmail(e.target.value)}
                            inputMode="email"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") sendEstimateEmail();
                            }}
                          />
                        </div>

                        <div className="mt-3 flex flex-col gap-2 text-sm text-slate-700">
                          <label className="flex items-center gap-2">
                            <input type="radio" name="intent" checked={leadIntent === "budgeting"} onChange={() => setLeadIntent("budgeting")} />
                            I’m budgeting / gathering quotes
                          </label>

                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="intent"
                              checked={leadIntent === "ready_for_call"}
                              onChange={() => setLeadIntent("ready_for_call")}
                            />
                            I’d like a quick planning call
                          </label>
                        </div>

                        {leadIntent === "ready_for_call" && (
                          <div className="mt-3">
                            <input
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                              placeholder="Phone (optional)"
                              value={leadPhone}
                              onChange={(e) => setLeadPhone(e.target.value)}
                              inputMode="tel"
                            />
                          </div>
                        )}

                        <div className="mt-4">
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            When is your event? <span className="text-slate-400">(optional)</span>
                          </label>

                          <div className="space-y-1 text-sm text-slate-700">
                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="timeline"
                                value="Next 30 days"
                                checked={eventTimeline === "Next 30 days"}
                                onChange={(e) => setEventTimeline(e.target.value)}
                              />
                              Next 30 days
                            </label>

                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="timeline"
                                value="1–3 months"
                                checked={eventTimeline === "1–3 months"}
                                onChange={(e) => setEventTimeline(e.target.value)}
                              />
                              1–3 months
                            </label>

                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="timeline"
                                value="3–6 months"
                                checked={eventTimeline === "3–6 months"}
                                onChange={(e) => setEventTimeline(e.target.value)}
                              />
                              3–6 months
                            </label>

                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="timeline"
                                value="More than 6 months"
                                checked={eventTimeline === "More than 6 months"}
                                onChange={(e) => setEventTimeline(e.target.value)}
                              />
                              More than 6 months
                            </label>

                            <label className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="timeline"
                                value="Just researching"
                                checked={eventTimeline === "Just researching"}
                                onChange={(e) => setEventTimeline(e.target.value)}
                              />
                              Just researching
                            </label>
                          </div>
                        </div>

                        <label className="mt-3 flex items-start gap-3 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-slate-300"
                            checked={optInWorksheet}
                            onChange={(e) => setOptInWorksheet(e.target.checked)}
                          />
                          <span>
                            <span className="font-medium text-slate-900">Also send me the planner worksheet + tips</span>
                            <span className="block text-xs text-slate-500">
                              Helpful planning resources for {boothType === "CONVENTION" ? "convention booths" : "company headshot events"}.
                            </span>
                          </span>
                        </label>

                        <button
                          className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                          disabled={sending || !canSendEmail || pricing.isCustom}
                          onClick={sendEstimateEmail}
                        >
                          {sending ? "Sending…" : "Save my estimate"}
                        </button>

                        <p className="mt-2 text-xs text-slate-500">
                          We&apos;ll send your estimate and occasional headshot booth planning tips.
                        </p>

                        {sentOk && <div className="mt-3 text-sm text-green-700">Sent! Check your inbox — you can forward it to your team.</div>}
                        {sendError && <div className="mt-3 text-sm text-red-700">{sendError}</div>}
                      </div>
                    )}

                    {/* Includes */}
                    <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                      <div className="font-medium text-slate-900">What this typically includes</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {deliverables.map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>

                      {boothType === "CONVENTION" && (
                        <div className="mt-3 text-sm text-slate-700">A workflow designed specifically for conferences, trade shows, and large team events.</div>
                      )}

                      <div className="mt-3 text-xs text-slate-500">{DISCLAIMER_TEXT}</div>
                    </div>
                  </>
                )}

                {/* Bottom CTAs */}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={openEmailFormAndFocusFirstName}
                    className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Save my estimate
                  </button>

                  <a
                    href={QUOTE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                  >
                    Request a custom quote
                  </a>
                </div>
              </div>

              {/* Capacity & Staffing */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="text-base font-semibold text-slate-900">Suggested headshot booth setup</h2>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Stat label="Recommended photographer stations" value={stationsLabel} />
                  <Stat label="Pacing" value={paceMeta.label} />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Stat label="Estimated coverage" value={`${capacityRange.low}–${capacityRange.high} attendees`} />
                  <Stat
                    label="Estimated headshots needed"
                    value={useParticipationEstimate && computedExpectedHeadshots != null ? `${computedExpectedHeadshots}` : "Not provided"}
                  />
                </div>

                {demandExceedsCapacity && (
                  <div className="mt-3 rounded-lg border border-rose-200 bg-white p-3 text-sm text-slate-700">
                    <div className="font-semibold text-slate-900">Heads up: your headshots needed exceed estimated capacity.</div>
                    <div className="mt-1 text-slate-600">
                      To photograph everyone, consider adding a photographer station, extending hours, or choosing a faster pacing option.
                    </div>
                  </div>
                )}

                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-sm font-semibold text-slate-900">Capacity note</div>
                  <div className="mt-1 text-sm text-slate-600">Estimated capacity assumes a steady flow of attendees during the session.</div>
                  <div className="mt-1 text-sm text-slate-600">Actual numbers may vary depending on participation and booth traffic.</div>
                </div>

                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-sm font-semibold text-slate-900">Wait Time Estimate</div>
                  <div className="mt-1 flex items-start gap-2">
                    <Badge status={waitTimeStatus} />
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{waitTimeCopy.title}</div>
                      <div className="text-sm text-slate-600">{waitTimeCopy.detail}</div>
                      <div className="mt-1 text-xs text-slate-500">Includes a conservative buffer for real-world pacing.</div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-sm font-semibold text-slate-900">Estimated cost per headshot</div>
                  {costPerHeadshot ? (
                    <>
                      <div className="mt-1 text-sm text-slate-700">
                        {formatMoney(costPerHeadshot.low)} – {formatMoney(costPerHeadshot.high)} per headshot
                      </div>
                      <div className="mt-1 text-xs text-slate-500">Based on your estimated headshots (not total attendees).</div>
                    </>
                  ) : demandExceedsCapacity ? (
                    <div className="mt-1 text-sm text-slate-600">
                      Not shown because the headshots needed exceed capacity. Add stations or time to get a usable per-headshot estimate.
                    </div>
                  ) : (
                    <div className="mt-1 text-sm text-slate-600">
                      Add how many people you expect will get headshots above to see a per-headshot estimate.
                    </div>
                  )}
                </div>

                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-sm font-semibold text-slate-900">{planningInsight.title}</div>
                  <div className="mt-1 text-sm text-slate-600">{planningInsight.body}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-10 text-xs text-slate-500">
          © {new Date().getFullYear()} Headshot Pros AZ — calculator estimates are informational and not a binding quote.
        </footer>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function Badge({ status }: { status: "green" | "yellow" | "red" | null }) {
  if (!status) {
    return <span className="mt-1 inline-block h-3 w-3 rounded-full border border-slate-300 bg-slate-100" />;
  }
  const cls =
    status === "green"
      ? "border-emerald-600 bg-emerald-500"
      : status === "yellow"
      ? "border-amber-600 bg-amber-500"
      : "border-rose-600 bg-rose-500";
  return <span className={`mt-1 inline-block h-3 w-3 rounded-full border ${cls}`} />;
}