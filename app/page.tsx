"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Mode = "TIME" | "VOLUME";
type Pace = "HIGH" | "BALANCED" | "PREMIUM";
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

  if (days <= 0) {
    return minutes ? `${whole}h 30m` : `${whole}h`;
  }
  const parts: string[] = [`${days}d`];
  if (whole) parts.push(`${whole}h`);
  if (minutes) parts.push(`${minutes}m`);
  return parts.join(" ");
}

// This is what your public "Request a Quote" button should go to from the calculator UI
const QUOTE_URL = "https://headshotprosaz.com/professional-headshot-booth-phoenix/#quote";

const DISCLAIMER_TEXT =
  "Travel may apply outside the Phoenix metro area. Venue parking fees or accommodations may apply depending on the location and event schedule. Arizona sales tax (8.3%) added where applicable.";

const PRICING = {
  single: {
    halfDay: 2500,
    fullDay: 4000
  },
  multi: {
    day1: { halfDay: 2500, fullDay: 4000 },
    days2to3: { halfDay: 2350, fullDay: 3750 },
    days4plus: { halfDay: 2200, fullDay: 3500 }
  },
  addOns: {
    secondStation: { halfDay: 1500, fullDay: 2500 }, // per day
    lightRetouchPerStation: { halfDay: 500, fullDay: 1000 }, // per day, per station
    makeupArtist: { halfDay: 600, fullDay: 900 } // per day, per artist
  }
};

const PACE = {
  HIGH: { label: "High Volume", displayRange: [25, 35], conservative: 25 },
  BALANCED: { label: "Balanced", displayRange: [18, 25], conservative: 18 },
  PREMIUM: { label: "Premium Experience", displayRange: [12, 15], conservative: 12 }
} satisfies Record<Pace, { label: string; displayRange: [number, number]; conservative: number }>;

export default function Page() {
  const [mode, setMode] = useState<Mode>("TIME");

  // Time inputs
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [days, setDays] = useState(1);
  const [hoursPerDay, setHoursPerDay] = useState(4);

  // Demand toggle (prevents scary defaults)
  const [useDemandEstimate, setUseDemandEstimate] = useState(false);

  // Volume inputs (only used when useDemandEstimate === true)
  const [volumeInputMode, setVolumeInputMode] = useState<VolumeInputMode>("HEADSHOTS");
  const [expectedHeadshots, setExpectedHeadshots] = useState(150);
  const [attendees, setAttendees] = useState(600);
  const [participationRate, setParticipationRate] = useState(25); // %

  // Shared inputs
  const [pace, setPace] = useState<Pace>("HIGH");
  const [autoStations, setAutoStations] = useState(true);
  const [stationsOverride, setStationsOverride] = useState<1 | 2>(1);

  // Options
  const [addMakeup, setAddMakeup] = useState(false);
  const [makeupArtists, setMakeupArtists] = useState<1 | 2>(1); // scales with stations
  const [addLightRetouch, setAddLightRetouch] = useState(false);

  // Lead capture
  const [leadFirstName, setLeadFirstName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadIntent, setLeadIntent] = useState<LeadIntent>("budgeting");
  const [leadPhone, setLeadPhone] = useState("");

  // Email UI tweak (opens + scrolls to form)
  const [showEmailForm, setShowEmailForm] = useState(false);
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Derived: total hours
  const totalHours = useMemo(() => {
    const d = clamp(days, 1, 5);
    const hpd = clamp(hoursPerDay, 1, 8);
    return isMultiDay ? d * hpd : clamp(hoursPerDay, 1, 8);
  }, [isMultiDay, days, hoursPerDay]);

  // Per-day hour logic for pricing tier
  const perDayHours = useMemo(() => clamp(hoursPerDay, 1, 8), [hoursPerDay]);

  const dayTier = useMemo(() => {
    const d = isMultiDay ? clamp(days, 1, 5) : 1;
    if (d === 1) return "day1" as const;
    if (d <= 3) return "days2to3" as const;
    return "days4plus" as const;
  }, [isMultiDay, days]);

  const isHalfDayPerDay = perDayHours <= 4;
  const perDayLabel = isHalfDayPerDay ? "Half-Day (up to 4 hours)" : "Full-Day (up to 8 hours)";

  const perDayBaseRate = useMemo(() => {
    if (!isMultiDay) return isHalfDayPerDay ? PRICING.single.halfDay : PRICING.single.fullDay;
    const tier = PRICING.multi[dayTier];
    return isHalfDayPerDay ? tier.halfDay : tier.fullDay;
  }, [isMultiDay, dayTier, isHalfDayPerDay]);

  const perDaySecondStation = isHalfDayPerDay ? PRICING.addOns.secondStation.halfDay : PRICING.addOns.secondStation.fullDay;
  const perDayLightRetouch = isHalfDayPerDay
    ? PRICING.addOns.lightRetouchPerStation.halfDay
    : PRICING.addOns.lightRetouchPerStation.fullDay;
  const perDayMakeup = isHalfDayPerDay ? PRICING.addOns.makeupArtist.halfDay : PRICING.addOns.makeupArtist.fullDay;

  const paceMeta = PACE[pace];

  // Expected headshots (nullable when demand estimate is off)
  const computedExpectedHeadshots = useMemo(() => {
    if (!useDemandEstimate) return null;

    if (volumeInputMode === "HEADSHOTS") return clamp(expectedHeadshots, 1, 50000);
    const a = clamp(attendees, 1, 200000);
    const p = clamp(participationRate, 1, 90) / 100;
    return Math.max(1, Math.round(a * p));
  }, [useDemandEstimate, volumeInputMode, expectedHeadshots, attendees, participationRate]);

  // Station recommendation (only meaningful when demand is provided)
  const recommendedStations = useMemo(() => {
    if (!useDemandEstimate || computedExpectedHeadshots == null) return 1;

    const hours = totalHours;
    const capacityPerStation = hours * paceMeta.conservative;
    const needed = Math.ceil(computedExpectedHeadshots / Math.max(1, capacityPerStation));

    if (needed <= 1) return 1;
    if (needed === 2) return 2;
    return 3; // 3+ signals multi-station team
  }, [useDemandEstimate, computedExpectedHeadshots, totalHours, paceMeta]);

  const stations = useMemo(() => {
    if (!autoStations) return stationsOverride;
    // If 3+ recommended, keep UI in 2-station mode but show the "3+" banner
    return recommendedStations >= 3 ? 2 : (recommendedStations as 1 | 2);
  }, [autoStations, stationsOverride, recommendedStations]);

  // Makeup artists max = stations (so you can match 1:1 if you want)
  const makeupArtistsMax = useMemo(() => (stations === 2 ? 2 : 1), [stations]);

  useEffect(() => {
    if (makeupArtists > makeupArtistsMax) {
      setMakeupArtists(makeupArtistsMax as 1 | 2);
    }
  }, [makeupArtists, makeupArtistsMax]);

  // Capacity estimate range (display) based on pace range * total hours * stations
  const capacityRange = useMemo(() => {
    const [low, high] = paceMeta.displayRange;
    return {
      low: Math.floor(totalHours * low * stations),
      high: Math.floor(totalHours * high * stations)
    };
  }, [paceMeta, totalHours, stations]);

  // Pricing calculation (package-based)
  const totalDays = useMemo(() => (isMultiDay ? clamp(days, 1, 5) : 1), [isMultiDay, days]);

  const pricing = useMemo(() => {
    if (totalDays > 5 || perDayHours > 8) return { isCustom: true, total: 0, low: 0, high: 0 };

    const base = perDayBaseRate * totalDays;
    const stationAdd = stations === 2 ? perDaySecondStation * totalDays : 0;
    const lightRetouchAdd = addLightRetouch ? perDayLightRetouch * stations * totalDays : 0;

    // Makeup scales with makeup artist count (1 or 2)
    const makeupCount = addMakeup ? makeupArtists : 0;
    const makeupAdd = addMakeup ? perDayMakeup * makeupCount * totalDays : 0;

    const exactTotal = base + stationAdd + lightRetouchAdd + makeupAdd;

    // Planning range: -8% to +10%
    const low = Math.round(exactTotal * 0.92);
    const high = Math.round(exactTotal * 1.1);

    return { isCustom: false, total: exactTotal, low, high };
  }, [
    totalDays,
    perDayHours,
    perDayBaseRate,
    stations,
    addLightRetouch,
    addMakeup,
    makeupArtists,
    perDaySecondStation,
    perDayLightRetouch,
    perDayMakeup
  ]);

  // Demand confidence indicator (only if demand estimate is on)
  const demandStatus = useMemo(() => {
    if (!useDemandEstimate || computedExpectedHeadshots == null) return null;
    if (computedExpectedHeadshots <= capacityRange.low) return "good" as const;
    if (computedExpectedHeadshots > capacityRange.high) return "tight" as const;
    return "close" as const;
  }, [useDemandEstimate, computedExpectedHeadshots, capacityRange.low, capacityRange.high]);

  const showCustomBanner =
    recommendedStations >= 3 ||
    (useDemandEstimate &&
      computedExpectedHeadshots != null &&
      isMultiDay &&
      totalDays >= 3 &&
      computedExpectedHeadshots > capacityRange.high);

  const hoursLabel = useMemo(() => {
    if (!isMultiDay) return `${roundToHalf(perDayHours)} hours`;
    const d = clamp(days, 1, 5);
    const hpd = roundToHalf(perDayHours);
    return `${d} day${d === 1 ? "" : "s"} × ${hpd} hours/day`;
  }, [isMultiDay, perDayHours, days]);

  const expectedHeadshotsLabel = useMemo(() => {
    if (!useDemandEstimate || computedExpectedHeadshots == null) return "Not provided";
    if (volumeInputMode === "HEADSHOTS") return `${computedExpectedHeadshots} expected headshots`;
    return `${clamp(attendees, 1, 200000)} attendees @ ${clamp(participationRate, 1, 90)}% ≈ ${computedExpectedHeadshots} headshots`;
  }, [useDemandEstimate, volumeInputMode, computedExpectedHeadshots, attendees, participationRate]);

  const paceLabel = useMemo(() => {
    const r = paceMeta.displayRange;
    return `${paceMeta.label} (${r[0]}–${r[1]}/hr/station)`;
  }, [paceMeta]);

  async function sendEstimateEmail() {
    setSending(true);
    setSentOk(false);
    setSendError(null);

    try {
      const payload = {
        email: leadEmail.trim(),
        firstName: leadFirstName.trim() || undefined,
        phone: leadIntent === "ready_for_call" ? leadPhone.trim() || undefined : undefined,
        intent: leadIntent,

        estimateLow: pricing.low,
        estimateHigh: pricing.high,

        hoursLabel,
        expectedHeadshotsLabel,
        paceLabel,
        recommendedStations: recommendedStations >= 3 ? 3 : recommendedStations,
        recommendedStationCountUsed: stations,
        capacityLow: capacityRange.low,
        capacityHigh: capacityRange.high,
        disclaimerText: DISCLAIMER_TEXT
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

  function openEmailFormAndFocus() {
    setShowEmailForm(true);
    // wait for UI to render
    setTimeout(() => {
      emailInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      emailInputRef.current?.focus();
    }, 50);
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <header className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">
            Phoenix Conference Headshot Booth Cost Calculator &amp; Budget Planner
          </h1>
          <p className="text-slate-600 text-base sm:text-lg">
            Estimate a realistic budget range, recommended stations, and participant capacity for your event — without line-item confusion.
          </p>
        </header>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  className={`rounded-lg px-4 py-2 text-sm font-medium ${
                    mode === "TIME" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                  onClick={() => setMode("TIME")}
                >
                  I have a fixed time window
                </button>
                <button
                  className={`rounded-lg px-4 py-2 text-sm font-medium ${
                    mode === "VOLUME" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                  onClick={() => setMode("VOLUME")}
                >
                  I know how many people we expect
                </button>
              </div>

              <div className="text-sm text-slate-600">
                Pricing tier: <span className="font-medium text-slate-900">{perDayLabel}</span>
              </div>
            </div>

            <p className="mt-3 text-sm text-slate-600">
              Pricing is based on time on-site. Demand estimates help determine the recommended number of stations.
            </p>
          </div>

          <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2">
            {/* Left: Inputs */}
            <div className="space-y-6">
              {/* Time */}
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-slate-900">Time</h2>
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
                      <p className="mt-1 text-xs text-slate-500">
                        Pricing uses half-day (≤ 4h) or full-day (&gt; 4h up to 8h).
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-4 text-sm text-slate-600">
                  Total time: <span className="font-medium text-slate-900">{formatHoursToDaysHours(totalHours)}</span>
                </div>
              </div>

              {/* Pace */}
              <div className="rounded-xl border border-slate-200 p-4">
                <h2 className="text-base font-semibold text-slate-900">Pace</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Faster flow increases capacity. Premium pacing allows more coaching per person.
                </p>

                <div className="mt-4 grid gap-2">
                  {(["HIGH", "BALANCED", "PREMIUM"] as Pace[]).map((p) => {
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
                            Estimated pace: {meta.displayRange[0]}–{meta.displayRange[1]} headshots/hr per station
                          </div>
                        </div>
                        <div className={`h-4 w-4 rounded-full border ${isActive ? "border-slate-900 bg-slate-900" : "border-slate-300"}`} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Demand toggle (prevents scary default volume) */}
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Demand estimate</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Turn this on if you want station recommendations based on expected participation. Leave it off if you’re not sure yet.
                    </p>
                  </div>

                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={useDemandEstimate}
                      onChange={(e) => setUseDemandEstimate(e.target.checked)}
                    />
                    Use demand estimate
                  </label>
                </div>

                {useDemandEstimate ? (
                  <>
                    <div className="mt-4">
                      <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                        <button
                          className={`rounded-lg px-3 py-2 text-xs font-medium ${
                            volumeInputMode === "HEADSHOTS"
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                          onClick={() => setVolumeInputMode("HEADSHOTS")}
                        >
                          Expected headshots
                        </button>
                        <button
                          className={`rounded-lg px-3 py-2 text-xs font-medium ${
                            volumeInputMode === "ATTENDEES"
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                          onClick={() => setVolumeInputMode("ATTENDEES")}
                        >
                          Total attendees
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {volumeInputMode === "HEADSHOTS" ? (
                        <div className="sm:col-span-2">
                          <label className="text-sm font-medium text-slate-700">How many people do you want photographed?</label>
                          <input
                            type="number"
                            min={1}
                            value={expectedHeadshots}
                            onChange={(e) => setExpectedHeadshots(clamp(parseInt(e.target.value || "1", 10), 1, 50000))}
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                          />
                          <p className="mt-1 text-xs text-slate-500">We’ll recommend stations based on your time + pace.</p>
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
                            <p className="mt-1 text-xs text-slate-500">Typical range is 10–30%</p>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="mt-3 text-sm text-slate-600">
                      Estimated headshots: <span className="font-semibold text-slate-900">{computedExpectedHeadshots ?? "—"}</span>
                    </div>
                  </>
                ) : (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                    Demand estimate is off — station recommendations will default to 1 station until you turn it on.
                  </div>
                )}
              </div>

              {/* Stations */}
              <div className="rounded-xl border border-slate-200 p-4">
                <h2 className="text-base font-semibold text-slate-900">Stations</h2>
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
                      onChange={(e) => setStationsOverride(parseInt(e.target.value, 10) as 1 | 2)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      <option value={1}>1 station</option>
                      <option value={2}>2 stations</option>
                    </select>
                  )}
                </div>

                <p className="mt-2 text-xs text-slate-500">Station recommendation is conservative to avoid overpromising throughput.</p>
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
                          onChange={(e) => setMakeupArtists(parseInt(e.target.value, 10) as 1 | 2)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                        >
                          <option value={1}>1 makeup artist</option>
                          {makeupArtistsMax === 2 && <option value={2}>2 makeup artists (one per station)</option>}
                        </select>
                        <p className="text-xs text-slate-500">
                          Tip: If you have 2 headshot stations and want maximum flow, a second makeup artist can reduce bottlenecks.
                        </p>
                      </div>
                    )}
                  </div>

                  <label className="flex items-start gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300"
                      checked={addLightRetouch}
                      onChange={(e) => setAddLightRetouch(e.target.checked)}
                    />
                    <span>
                      <span className="font-medium text-slate-900">Light retouching (per station)</span>
                      <span className="block text-xs text-slate-500">One finished image per person, per station (per day).</span>
                    </span>
                  </label>
                </div>

                <div className="mt-3 text-xs text-slate-500">
                  Enhanced retouching available: <span className="font-medium text-slate-900">$50/image</span> (optional; can be offered to individuals).
                </div>
              </div>
            </div>

            {/* Right: Outputs */}
            <div className="space-y-6">
              {/* Estimated Investment FIRST */}
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
                        Planning-range estimate based on your inputs. Final quote confirmed after reviewing event flow and venue logistics.
                      </div>
                    </div>

                    {/* UI TWEAK CTA */}
                    {!showEmailForm && (
                      <button
                        onClick={openEmailFormAndFocus}
                        className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        Email me this estimate
                      </button>
                    )}

                    {/* Lead capture */}
                    {showEmailForm && (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                        <div className="text-sm font-semibold text-slate-900">Send My Conference Headshot Estimate</div>

                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <input
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                            placeholder="First name (optional)"
                            value={leadFirstName}
                            onChange={(e) => setLeadFirstName(e.target.value)}
                          />
                          <input
                            ref={emailInputRef}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                            placeholder="Email (required)"
                            value={leadEmail}
                            onChange={(e) => setLeadEmail(e.target.value)}
                            inputMode="email"
                          />
                        </div>

                        <div className="mt-3 flex flex-col gap-2 text-sm text-slate-700">
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="intent"
                              checked={leadIntent === "budgeting"}
                              onChange={() => setLeadIntent("budgeting")}
                            />
                            I’m budgeting / gathering quotes
                          </label>

                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="intent"
                              checked={leadIntent === "ready_for_call"}
                              onChange={() => setLeadIntent("ready_for_call")}
                            />
                            I’m ready for a quick planning call
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

                        <button
                          className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                          disabled={sending || !leadEmail.trim() || pricing.isCustom}
                          onClick={sendEstimateEmail}
                        >
                          {sending ? "Sending…" : "Send My Conference Headshot Estimate"}
                        </button>

                        {sentOk && (
                          <div className="mt-3 text-sm text-green-700">
                            Estimate sent — check your inbox. You can forward it to your team.
                          </div>
                        )}
                        {sendError && <div className="mt-3 text-sm text-red-700">{sendError}</div>}

                        <div className="mt-2 text-xs text-slate-500">
                          We’ll email your estimate so you can share it internally.
                        </div>
                      </div>
                    )}

                    <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                      <div className="font-medium text-slate-900">Includes</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        <li>On-site headshot booth setup (backdrop + lighting)</li>
                        <li>Professional headshot specialist &amp; guided posing</li>
                        <li>Lead capture + participant list (CSV)</li>
                        <li>Instant delivery via individual galleries</li>
                      </ul>

                      <div className="mt-3 text-xs text-slate-500">{DISCLAIMER_TEXT}</div>
                    </div>
                  </>
                )}

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <a
                    href={QUOTE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Request a Quote
                  </a>
                  <button
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                    className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                  >
                    Adjust Inputs
                  </button>
                </div>
              </div>

              {/* Recommended setup SECOND */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="text-base font-semibold text-slate-900">Recommended setup</h2>

                {recommendedStations >= 3 ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-sm font-semibold text-slate-900">Multi-station team recommended (3+)</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Based on your time, pace, and demand estimate, you’ll likely need 3+ stations to meet your goals.
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Stat label="Stations" value={`${stations}`} />
                    <Stat label="Pricing tier" value={isHalfDayPerDay ? "Half-Day" : "Full-Day"} />
                  </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Stat label="Estimated capacity" value={`${capacityRange.low}–${capacityRange.high}`} />
                  <Stat
                    label="Estimated headshots"
                    value={useDemandEstimate && computedExpectedHeadshots != null ? `${computedExpectedHeadshots}` : "Not provided"}
                  />
                </div>

                {demandStatus === "good" && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    ✅ Your estimated capacity comfortably covers expected demand.
                  </div>
                )}
                {demandStatus === "close" && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    ✅ Capacity looks solid — we’ll confirm event flow details on the quote call.
                  </div>
                )}
                {demandStatus === "tight" && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    ⚠ Capacity may be tight for your goal — consider an additional station or longer coverage.
                  </div>
                )}

                {showCustomBanner && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    If your event has complex logistics, 3+ stations, or unique deliverables, we’ll confirm a custom quote after a quick planning call.
                  </div>
                )}
              </div>

              {/* Notes THIRD */}
              <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
                <div className="font-medium text-slate-900">Notes</div>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Station recommendations are conservative to avoid overpromising throughput.</li>
                  <li>High-volume pacing prioritizes flow; premium pacing provides more coaching per person.</li>
                  <li>Multi-day events receive commitment pricing tiers (2–3 days / 4+ days).</li>
                </ul>
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