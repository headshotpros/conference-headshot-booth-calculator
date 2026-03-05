"use client";

import React, { useMemo, useState } from "react";

type Mode = "TIME" | "VOLUME";
type Pace = "HIGH" | "BALANCED" | "PREMIUM";
type VolumeInputMode = "HEADSHOTS" | "ATTENDEES";

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
    // e.g., 3.5h
    return minutes ? `${whole}h 30m` : `${whole}h`;
  }
  // e.g., 1d 4h 30m
  const parts: string[] = [`${days}d`];
  if (whole) parts.push(`${whole}h`);
  if (minutes) parts.push(`${minutes}m`);
  return parts.join(" ");
}

const PRICING = {
  single: {
    halfDay: 2500,
    fullDay: 4000
  },
  multi: {
    // per-day rates
    day1: { halfDay: 2500, fullDay: 4000 },
    days2to3: { halfDay: 2350, fullDay: 3750 },
    days4plus: { halfDay: 2200, fullDay: 3500 }
  },
  addOns: {
    secondStation: { halfDay: 1500, fullDay: 2500 }, // per day
    lightRetouchPerStation: { halfDay: 500, fullDay: 1000 }, // per day, per station
    makeupArtist: { halfDay: 1000, fullDay: 1800 } // per day
  }
};

const PACE = {
  HIGH: { label: "High Volume", displayRange: [20, 30], conservative: 20 },
  BALANCED: { label: "Balanced", displayRange: [15, 22], conservative: 15 },
  PREMIUM: { label: "Premium Experience", displayRange: [12, 15], conservative: 12 }
} satisfies Record<Pace, { label: string; displayRange: [number, number]; conservative: number }>;

export default function Page() {
  const [mode, setMode] = useState<Mode>("TIME");

  // Time inputs
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [days, setDays] = useState(1);
  const [hoursPerDay, setHoursPerDay] = useState(4);

  // Volume inputs
  const [volumeInputMode, setVolumeInputMode] = useState<VolumeInputMode>("HEADSHOTS");
  const [expectedHeadshots, setExpectedHeadshots] = useState(150);
  const [attendees, setAttendees] = useState(600);
  const [participationRate, setParticipationRate] = useState(25); // %

  // Shared inputs
  const [pace, setPace] = useState<Pace>("HIGH");
  const [autoStations, setAutoStations] = useState(true);
  const [stationsOverride, setStationsOverride] = useState<1 | 2>(1);

  const [addMakeup, setAddMakeup] = useState(false);
  const [addLightRetouch, setAddLightRetouch] = useState(false);

  // Derived: total hours
  const totalHours = useMemo(() => {
    const d = clamp(days, 1, 5);
    const hpd = clamp(hoursPerDay, 1, 8);
    return isMultiDay ? d * hpd : clamp(hoursPerDay, 1, 8);
  }, [isMultiDay, days, hoursPerDay]);

  // Per-day hour logic for pricing tier
  const perDayHours = useMemo(() => {
    return clamp(hoursPerDay, 1, 8);
  }, [hoursPerDay]);

  const dayTier = useMemo(() => {
    const d = isMultiDay ? clamp(days, 1, 5) : 1;
    if (d === 1) return "day1" as const;
    if (d <= 3) return "days2to3" as const;
    return "days4plus" as const;
  }, [isMultiDay, days]);

  const isHalfDayPerDay = perDayHours <= 4;
  const perDayLabel = isHalfDayPerDay ? "Half-Day (up to 4 hours)" : "Full-Day (up to 8 hours)";
  const perDayBaseRate = useMemo(() => {
    if (!isMultiDay) {
      return isHalfDayPerDay ? PRICING.single.halfDay : PRICING.single.fullDay;
    }
    const tier = PRICING.multi[dayTier];
    return isHalfDayPerDay ? tier.halfDay : tier.fullDay;
  }, [isMultiDay, dayTier, isHalfDayPerDay]);

  const perDaySecondStation = isHalfDayPerDay ? PRICING.addOns.secondStation.halfDay : PRICING.addOns.secondStation.fullDay;
  const perDayLightRetouch = isHalfDayPerDay ? PRICING.addOns.lightRetouchPerStation.halfDay : PRICING.addOns.lightRetouchPerStation.fullDay;
  const perDayMakeup = isHalfDayPerDay ? PRICING.addOns.makeupArtist.halfDay : PRICING.addOns.makeupArtist.fullDay;

  const computedExpectedHeadshots = useMemo(() => {
    if (volumeInputMode === "HEADSHOTS") return clamp(expectedHeadshots, 1, 50000);
    const a = clamp(attendees, 1, 200000);
    const p = clamp(participationRate, 1, 90) / 100;
    return Math.max(1, Math.round(a * p));
  }, [volumeInputMode, expectedHeadshots, attendees, participationRate]);

  const paceMeta = PACE[pace];

  // Station recommendation
  const recommendedStations = useMemo(() => {
    const hours = totalHours;
    const conservativeThroughput = paceMeta.conservative; // per hour per station
    const capacityPerStation = hours * conservativeThroughput;
    const needed = Math.ceil(computedExpectedHeadshots / Math.max(1, capacityPerStation));

    if (needed <= 1) return 1;
    if (needed === 2) return 2;
    return 3; // 3+ signals custom
  }, [totalHours, paceMeta, computedExpectedHeadshots]);

  const stations = useMemo(() => {
    if (!autoStations) return stationsOverride;
    return recommendedStations >= 3 ? 2 : (recommendedStations as 1 | 2);
  }, [autoStations, stationsOverride, recommendedStations]);

  // Capacity estimate range (display) based on pace range * total hours * stations
  const capacityRange = useMemo(() => {
    const [low, high] = paceMeta.displayRange;
    const lowCap = Math.floor(totalHours * low * stations);
    const highCap = Math.floor(totalHours * high * stations);
    return { low: lowCap, high: highCap };
  }, [paceMeta, totalHours, stations]);

  // Pricing calculation (package-based)
  const totalDays = useMemo(() => (isMultiDay ? clamp(days, 1, 5) : 1), [isMultiDay, days]);

  const pricing = useMemo(() => {
    // If per-day hours > 8 (not allowed) or total > 40 hours (5 days * 8), we’d custom quote.
    if (totalDays > 5 || perDayHours > 8) {
      return { isCustom: true, total: 0, low: 0, high: 0 };
    }

    // Price is based on per-day package tier (half/full) * number of days,
    // plus add-ons per day (and per station where appropriate).
    const base = perDayBaseRate * totalDays;

    const stationAdd = (stations === 2 ? perDaySecondStation * totalDays : 0);

    const lightRetouchAdd = addLightRetouch ? (perDayLightRetouch * stations * totalDays) : 0;

    const makeupAdd = addMakeup ? (perDayMakeup * totalDays) : 0;

    const exactTotal = base + stationAdd + lightRetouchAdd + makeupAdd;

    // Estimate range: -8% to +10%
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
    perDaySecondStation,
    perDayLightRetouch,
    perDayMakeup
  ]);

  const showCustomBanner = recommendedStations >= 3 || (isMultiDay && totalDays >= 3 && computedExpectedHeadshots > capacityRange.high);

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <header className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">
            Conference Headshot Booth Cost Calculator
          </h1>
          <p className="text-slate-600 text-base sm:text-lg">
            Estimate budget, recommended stations, and participant capacity for your event — without line-item confusion.
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
          </div>

          <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2">
            {/* Left: Inputs */}
            <div className="space-y-6">
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
                        Capacity is calculated from your hours and pacing. Pricing uses half-day (≤ 4h) or full-day (&gt; 4h up to 8h).
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-4 text-sm text-slate-600">
                  Total time: <span className="font-medium text-slate-900">{formatHoursToDaysHours(totalHours)}</span>
                </div>
              </div>

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

              <div className="rounded-xl border border-slate-200 p-4">
                <h2 className="text-base font-semibold text-slate-900">Volume estimate</h2>

                <div className="mt-3 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    className={`rounded-lg px-3 py-2 text-xs font-medium ${
                      volumeInputMode === "HEADSHOTS" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`}
                    onClick={() => setVolumeInputMode("HEADSHOTS")}
                  >
                    Expected headshots
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
                        <label className="text-sm font-medium text-slate-700">Participation rate</label>
                        <input
                          type="number"
                          min={1}
                          max={90}
                          value={participationRate}
                          onChange={(e) => setParticipationRate(clamp(parseInt(e.target.value || "25", 10), 1, 90))}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                        />
                        <p className="mt-1 text-xs text-slate-500">Typical range is 15–40%</p>
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-3 text-sm text-slate-600">
                  Estimated headshots: <span className="font-semibold text-slate-900">{computedExpectedHeadshots}</span>
                </div>
              </div>

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

                <p className="mt-2 text-xs text-slate-500">
                  Station recommendation is conservative to avoid overpromising throughput.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <h2 className="text-base font-semibold text-slate-900">Options</h2>
                <div className="mt-3 space-y-2">
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
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="text-base font-semibold text-slate-900">Recommended setup</h2>

                {recommendedStations >= 3 ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="text-sm font-semibold text-slate-900">Multi-station team recommended (3+)</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Based on your time, pace, and volume, you’ll likely need 3+ stations to meet your goals.
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Stat label="Recommended stations" value={autoStations ? `${recommendedStations}` : `${stations}`} />
                    <Stat label="Pricing tier" value={isHalfDayPerDay ? "Half-Day" : "Full-Day"} />
                  </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Stat label="Estimated capacity" value={`${capacityRange.low}–${capacityRange.high}`} />
                  <Stat label="Estimated headshots" value={`${computedExpectedHeadshots}`} />
                </div>

                {showCustomBanner && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                    If your event has complex logistics, 3+ stations, or unique deliverables, we’ll confirm a custom quote after a quick planning call.
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <h2 className="text-base font-semibold text-slate-900">Estimated investment</h2>

                {pricing.isCustom ? (
                  <div className="mt-3 text-sm text-slate-700">
                    Please request a custom quote for this configuration.
                  </div>
                ) : (
                  <>
                    <div className="mt-3 flex items-end justify-between gap-4">
                      <div>
                        <div className="text-3xl font-semibold tracking-tight text-slate-900">
                          {formatMoney(pricing.low)} – {formatMoney(pricing.high)}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          Estimate based on your inputs. Final quote confirmed after reviewing event flow and venue logistics.
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                      <div className="font-medium text-slate-900">Includes</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        <li>On-site headshot booth setup (backdrop + lighting)</li>
                        <li>Professional headshot specialist & guided posing</li>
                        <li>Lead capture + participant list (CSV)</li>
                        <li>Instant delivery via individual galleries</li>
                      </ul>

                      <div className="mt-3 text-xs text-slate-500">
                        Travel/parking may apply outside the Phoenix metro. Arizona sales tax (8.3%) added where applicable.
                      </div>
                    </div>
                  </>
                )}

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <a
                    href="https://headshotprosaz.com/company-headshots-phoenix/#quote"
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