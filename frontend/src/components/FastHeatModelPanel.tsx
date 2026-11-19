/* Step 2 — heating need from the fast hourly model (backend/rc_engine.py),
   for the selected buildings and for the whole city.

   The fast model uses the same building inputs as the EnergyPlus run in Step 3
   (outline, height, U-values, windows, weather) but solves a simple
   resistance–capacitance network instead of a full simulation: ~0.2 s per
   building, within ±15 % of EnergyPlus for 97 % of the buildings it was checked
   on. That is quick enough to screen every building in a city, which is what the
   lower half of this panel shows.

   Plain language first: each building gets "needs more heat than N of 100
   buildings in the city"; the numbers sit underneath. */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Zap } from "lucide-react";
import { rcCity, rcCityRun, rcSimulate, rcWeatherYears, shareHigher, type RcCityStatus, type RcResult, type WeatherYears } from "../api/rc";
import { useT, useLang } from "../i18n";
import { C, tint } from "../config/colors";

export interface FastHeatBuilding {
  key: string;
  label: string;
  lat?: number | null;
  lon?: number | null;
}

const MAX_BUILDINGS = 500;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function rankWord(higher: number): { label: string; icon: string; color: string } {
  if (higher >= 75) return { label: "Low heat need", icon: "▲", color: C.good };
  if (higher <= 25) return { label: "High heat need", icon: "▼", color: C.bad };
  return { label: "Typical heat need", icon: "●", color: "rgba(255,255,255,0.75)" };
}

export default function FastHeatModelPanel({ buildings, cityId }: { buildings: FastHeatBuilding[]; cityId: string }) {
  const t = useT();
  const lang = useLang();
  const locale = lang === "sv" ? "sv-SE" : "en-GB";
  const fmt = (n: number, d = 0) => n.toLocaleString(locale, { maximumFractionDigits: d, minimumFractionDigits: d });

  const located = useMemo(() => buildings.filter((b) => b.lat != null && b.lon != null).slice(0, MAX_BUILDINGS), [buildings]);
  const payload = useMemo(() => located.map((b) => ({ address: b.label, lat: b.lat!, lon: b.lon! })), [located]);

  const [results, setResults] = useState<RcResult[] | null>(null);       // typical year
  const [error, setError] = useState<string | null>(null);
  // Optional actual weather year (SMHI observations) shown next to the typical year.
  const [year, setYear] = useState<number | null>(null);
  const [years, setYears] = useState<WeatherYears | null>(null);
  const [yearResults, setYearResults] = useState<RcResult[] | null>(null);
  const [yearError, setYearError] = useState<string | null>(null);
  useEffect(() => { rcWeatherYears(cityId).then(setYears).catch(() => setYears(null)); }, [cityId]);
  useEffect(() => {
    let alive = true;
    setYearResults(null); setYearError(null);
    if (!year || !payload.length) return;
    rcSimulate(cityId, payload, year)
      .then((r) => { if (alive) { setYearResults(r.results); rcWeatherYears(cityId).then(setYears).catch(() => {}); } })
      .catch((e) => { if (alive) setYearError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [cityId, payload, year]);
  const [city, setCity] = useState<RcCityStatus | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let alive = true;
    setResults(null); setError(null);
    if (!payload.length) { setResults([]); return; }
    rcSimulate(cityId, payload)
      .then((r) => { if (alive) setResults(r.results); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [cityId, payload]);

  // City screening: fetch once; the effect below re-polls while a run is in progress.
  useEffect(() => {
    let alive = true;
    rcCity(cityId).then((c) => { if (alive) setCity(c); }).catch(() => { /* the city part is optional */ });
    return () => { alive = false; };
  }, [cityId]);

  const startCity = async () => {
    setStarting(true);
    try { await rcCityRun(cityId); setCity(await rcCity(cityId)); }
    finally { setStarting(false); }
  };
  // Poll every 10 s while a city run is in progress.
  useEffect(() => {
    if (city?.status?.state !== "running") return;
    const id = setTimeout(() => rcCity(cityId).then(setCity).catch(() => {}), 10_000);
    return () => clearTimeout(id);
  }, [city, cityId]);

  const pct = city?.result?.heat_kwh_m2_percentiles;
  const ok = (results ?? []).filter((r) => r.heating_kwh_m2_yr != null);
  const totalsOf = (rs: RcResult[]) => ({
    heat: rs.reduce((s, r) => s + (r.heating_kwh ?? 0), 0),
    area: rs.reduce((s, r) => s + (r.floor_area_m2 ?? 0), 0),
    peak: rs.reduce((s, r) => s + (r.peak_heating_kw ?? 0), 0),
  });
  const selTotals = ok.length ? totalsOf(ok) : null;
  const yearOk = (yearResults ?? []).filter((r) => r.heating_kwh_m2_yr != null);
  const yearTotals = yearOk.length ? totalsOf(yearOk) : null;
  const yearNote = years?.suggested.find((y) => y.year === year)?.note;
  const yearOptions = years ? Array.from({ length: years.last_year - years.first_year + 1 }, (_, i) => years.last_year - i) : [];

  const card = { padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)" } as const;
  const muted = { fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, margin: 0 }}>
        {t("How much heat does each building need to stay at 21 °C through a typical year? This is a quick estimate from a simplified hourly model that uses the same building data as the full energy simulation in Step 3 — it takes a fraction of a second per building and is usually within 15 % of the full simulation. Space heating only; hot water is added in Step 3.")}
      </p>

      {/* ── Weather: typical year, or an actual year from SMHI ── */}
      {years && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
          <span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>{t("Also show a real year:")}</span>
          {years.suggested.map((y) => (
            <button key={y.year} onClick={() => setYear(year === y.year ? null : y.year)} title={t(y.note)}
              aria-pressed={year === y.year}
              style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
                       color: year === y.year ? "#0b0f14" : C.selected,
                       background: year === y.year ? C.selected : tint(C.selected, 0.1),
                       border: `1px solid ${tint(C.selected, 0.45)}` }}>
              {y.year} · {t(y.note)}
            </button>
          ))}
          <select value={year ?? ""} onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
            aria-label={t("Weather year")}
            style={{ background: "#11161d", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "4px 8px", fontSize: 12 }}>
            <option value="">{t("Typical year only")}</option>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}
      {year && !yearResults && !yearError && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", ...muted }}>
          <Loader2 size={13} className="animate-spin" />
          {years?.ready.some((r) => r.year === year)
            ? t("Calculating with the weather of {y}…", { y: year })
            : t("Building the {y} weather file from SMHI observations (about 30 seconds the first time)…", { y: year })}
        </div>
      )}
      {yearError && <div role="alert" style={{ fontSize: 12, color: C.bad }}>⚠ {yearError}</div>}
      {year && yearTotals && selTotals && (() => {
        const dHeat = Math.round((yearTotals.heat / Math.max(1, selTotals.heat) - 1) * 100);
        const dPeak = Math.round((yearTotals.peak / Math.max(1, selTotals.peak) - 1) * 100);
        const more = dHeat >= 0;
        return (
          <div style={{ ...card, borderColor: tint(more ? C.warn : C.info, 0.45), background: tint(more ? C.warn : C.info, 0.07), fontSize: 12.5, color: "rgba(255,255,255,0.85)", lineHeight: 1.6 }}>
            <strong>{more ? "▲" : "▼"} {more
              ? t("With the weather of {y}, these buildings need {pct}% more heat than in a typical year.", { y: year, pct: Math.abs(dHeat) })
              : t("With the weather of {y}, these buildings need {pct}% less heat than in a typical year.", { y: year, pct: Math.abs(dHeat) })}</strong>{" "}
            {t("Coldest-hour demand: {a} kW in {y}, against {b} kW in a typical year ({sign}{d}%).", { a: fmt(yearTotals.peak), y: year, b: fmt(selTotals.peak), sign: dPeak >= 0 ? "+" : "−", d: Math.abs(dPeak) })}
            {yearNote ? <> {t("{y}: {note}.", { y: year, note: t(yearNote) })}</> : null}
            <div style={{ ...muted, fontSize: 11, marginTop: 4 }}>
              {t("Real weather from SMHI station observations, gaps filled from nearby stations and ERA5 (smhi2epw). Use it to check heating capacity in a hard winter; the typical year stays the basis for annual energy and costs.")}
            </div>
          </div>
        );
      })()}

      {/* ── Selected buildings ── */}
      {error && <div role="alert" style={{ fontSize: 12, color: C.bad }}>⚠ {error}</div>}
      {!error && !results && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
          <Loader2 size={13} className="animate-spin" /> {t("Estimating heat need for {n} buildings…", { n: payload.length })}
        </div>
      )}
      {results && selTotals && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            [t("Heat need, selection"), `${fmt(selTotals.heat / 1000)} MWh/${t("yr")}`],
            [t("Per heated m²"), `${fmt(selTotals.heat / Math.max(1, selTotals.area))} kWh/m²`],
            [t("Coldest-hour demand (all added up)"), `${fmt(selTotals.peak)} kW`],
          ].map(([k, v]) => (
            <div key={k} style={{ ...card, flex: "1 1 180px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{k}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{v}</div>
            </div>
          ))}
        </div>
      )}
      {results && results.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ color: "rgba(255,255,255,0.55)", textAlign: "left" }}>
                <th style={{ padding: "4px 8px" }}>{t("Building")}</th>
                <th style={{ padding: "4px 8px" }}>{t("Compared with the city")}</th>
                <th style={{ padding: "4px 8px", textAlign: "right" }}>{year ? t("Typical year") : t("Heat need")} (kWh/m²·{t("yr")})</th>
                {year && <th style={{ padding: "4px 8px", textAlign: "right" }}>{t("In {y}", { y: year })} (kWh/m²·{t("yr")})</th>}
                <th style={{ padding: "4px 8px", textAlign: "right" }}>{t("Coldest hour")} (kW)</th>
                <th style={{ padding: "4px 8px", textAlign: "right" }}>{t("Heated area")} (m²)</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => {
                const v = r.heating_kwh_m2_yr;
                const higher = v != null ? shareHigher(pct, v) : null;
                const w = higher != null ? rankWord(higher) : null;
                return (
                  <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: "5px 8px", color: "#fff", fontWeight: 600 }}>{located[i]?.label ?? r.address}</td>
                    <td style={{ padding: "5px 8px" }}>
                      {r.error
                        ? <span style={{ color: "rgba(255,255,255,0.45)" }}>{t("Could not be estimated")}</span>
                        : w
                          ? <span><span style={{ color: w.color, fontWeight: 700 }}>{w.icon} {t(w.label)}</span>
                              <span style={{ color: "rgba(255,255,255,0.6)" }}> · {t("needs more heat than {n} of 100 buildings", { n: 100 - higher! })}</span></span>
                          : <span style={{ color: "rgba(255,255,255,0.45)" }}>—</span>}
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "right", color: "#fff" }}>{v != null ? fmt(v) : "—"}</td>
                    {year && <td style={{ padding: "5px 8px", textAlign: "right", color: "#fff" }}>{yearResults?.[i]?.heating_kwh_m2_yr != null ? fmt(yearResults[i]!.heating_kwh_m2_yr!) : "…"}</td>}
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{r.peak_heating_kw != null ? fmt(r.peak_heating_kw, 1) : "—"}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right" }}>{r.floor_area_m2 != null ? fmt(r.floor_area_m2) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {buildings.length > located.length && (
            <div style={{ ...muted, marginTop: 6 }}>{t("Showing the first {n} buildings.", { n: located.length })}</div>
          )}
        </div>
      )}

      {/* ── Whole city ── */}
      <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: "#fff" }}>{t("The whole city")}</div>
        {!city?.result && city?.status?.state === "running" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", ...muted }}>
            <Loader2 size={13} className="animate-spin" />
            {t("Estimating every building in the city: {done} of {total} done…", { done: fmt(city.status.done), total: fmt(city.status.total) })}
          </div>
        )}
        {!city?.result && city?.status?.state !== "running" && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={muted}>{t("No city-wide estimate yet. It runs every heated building through the same model — about 15 minutes for Gothenburg.")}</span>
            <button onClick={startCity} disabled={starting}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                       color: C.selected, background: tint(C.selected, 0.12), border: `1px solid ${tint(C.selected, 0.4)}`, cursor: "pointer" }}>
              <Zap size={13} /> {t("Estimate the whole city")}
            </button>
          </div>
        )}
        {city?.result && <CitySummary s={city.result} fmt={fmt} />}
        {city?.result && city.status?.state === "running" && (
          <div style={muted}>{t("A newer estimate is being calculated: {done} of {total} done.", { done: fmt(city.status.done), total: fmt(city.status.total) })}</div>
        )}
      </div>
    </div>
  );
}

function CitySummary({ s, fmt }: { s: NonNullable<RcCityStatus["result"]>; fmt: (n: number, d?: number) => string }) {
  const t = useT();
  const T = s.totals;
  const maxM = Math.max(...s.monthly_mwh, 1);
  const peakDay = Math.floor(T.peak_hour / 24);
  const peakDate = new Date(Date.UTC(2021, 0, 1 + peakDay));
  const muted = { fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 } as const;
  const groupTable = (title: string, rows: typeof s.by_use, label: (g: string) => string) => (
    <div style={{ flex: "1 1 260px", minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.75)", marginBottom: 4 }}>{title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <tbody>
          {rows.slice(0, 8).map((g) => (
            <tr key={g.group} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <td style={{ padding: "3px 6px", color: "#fff" }}>{label(g.group)}</td>
              <td style={{ padding: "3px 6px", textAlign: "right" }}>{fmt(g.buildings)} {t("bldgs")}</td>
              <td style={{ padding: "3px 6px", textAlign: "right", color: "#fff" }}>{fmt(g.heat_mwh / 1000, 0)} GWh</td>
              <td style={{ padding: "3px 6px", textAlign: "right" }}>{g.heat_kwh_m2 != null ? `${fmt(g.heat_kwh_m2)} kWh/m²` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      <p style={{ ...muted, margin: 0 }}>
        {t("{n} heated buildings need about {gwh} GWh of space heat in a typical year ({kwh} kWh per m²). On the coldest hour they need {peak} MW together; averaged over the coldest day, {day} MW.",
          { n: fmt(s.buildings), gwh: fmt(T.heat_mwh / 1000), kwh: fmt(T.heat_kwh_m2 ?? 0), peak: fmt(T.peak_mw), day: fmt(T.peak_daily_avg_mw) })}
        {" "}{T.sum_of_peaks_mw > T.peak_mw * 1.03
          ? t("That is less than the {sum} MW you get by adding up each building's own coldest hour, because they don't all peak at the same time.", { sum: fmt(T.sum_of_peaks_mw) })
          : t("Almost every building peaks in the same cold hour, so the city peak is about the sum of the buildings' own peaks. The model has no occupant behaviour or night set-backs, which spread real peaks out somewhat.")}
        {" "}{t("Coldest hour: {date}.", { date: peakDate.toLocaleDateString(undefined, { day: "numeric", month: "long", timeZone: "UTC" }) })}
      </p>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.75)", marginBottom: 6 }}>{t("Heat need by month")} (GWh)</div>
        <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 90 }} role="img"
          aria-label={s.monthly_mwh.map((v, i) => `${t(MONTHS[i]!)} ${fmt(v / 1000, 1)} GWh`).join(", ")}>
          {s.monthly_mwh.map((v, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }} title={`${t(MONTHS[i]!)}: ${fmt(v / 1000, 1)} GWh`}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>{fmt(v / 1000)}</span>
              <div style={{ width: "100%", height: Math.max(2, (v / maxM) * 60), background: C.info, borderRadius: "3px 3px 0 0" }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>{t(MONTHS[i]!)}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {groupTable(t("By construction era"), s.by_era, (g) => t(g))}
        {groupTable(t("By district (largest first)"), s.by_district, (g) => g)}
      </div>
      <div style={{ ...muted, fontSize: 11 }}>
        {t("Outbuildings and small unheated buildings are left out. Weather: {w}. Calculated {d}.", { w: s.weather, d: new Date(s.created).toLocaleDateString() })}
      </div>
    </>
  );
}
