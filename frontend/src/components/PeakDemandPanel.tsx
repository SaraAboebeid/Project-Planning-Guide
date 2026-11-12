/* Peak demand from the hourly simulation results (backend /api/simulation-peaks).

   Two uses:
   • Step 3 — one scenario (the baseline): each building's peak heat and
     electricity, when it happens, and a duration curve.
   • Step 4 — several scenarios (baseline + simulated packages): how much each
     package lowers the combined peak, which is what a power (effekt) charge
     bills, and the two duration curves side by side.

   An EnergyPlus hour is an hourly mean and the weather a typical year, so real
   instantaneous peaks run somewhat higher; the panel says so. */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Activity } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { useT, useLang, translate } from "../i18n";
import { C } from "../config/colors";

// Validated pair (dataviz palette checker, dark surface #0d1117).
const BASE = "#9575CD";
const ALT = "#26A69A";

interface PeakStats {
  peak_kw: number; peak_hour?: number; peak_w_m2?: number | null; peak_daily_avg_kw?: number; peak_day?: number;
  annual_kwh?: number; full_load_hours?: number | null; hours_above_80pct?: number;
  duration_curve?: { hours: number; kw: number }[];
}
interface PeakBuilding { idf_idx: number; address: string | null; lat: number; lon: number; floor_area_m2: number | null; heat: PeakStats; electricity: PeakStats }
interface PeakResponse { batch_id: string; buildings: PeakBuilding[]; total: { buildings: number; floor_area_m2: number | null; heat: PeakStats; electricity: PeakStats } | null; without_hourly_data: number }

export interface PeakScenario { label: string; batchId: string }

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function whenLabel(hour?: number): string {
  if (hour == null) return "—";
  let day = Math.floor(hour / 24);
  for (let m = 0; m < 12; m++) {
    if (day < MONTH_DAYS[m]!) return `${day + 1} ${translate(MONTHS[m]!)} ${String(hour % 24).padStart(2, "0")}:00`;
    day -= MONTH_DAYS[m]!;
  }
  return "—";
}

async function fetchPeaks(batchId: string, points?: { lat: number; lon: number }[]): Promise<PeakResponse> {
  const q = points?.length ? `?points=${encodeURIComponent(points.map((p) => `${p.lat},${p.lon}`).join(";"))}` : "";
  const res = await fetch(`/api/simulation-peaks/${encodeURIComponent(batchId)}${q}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? `API ${res.status}`);
  return res.json();
}

export default function PeakDemandPanel({ scenarios, points }: {
  /** First entry is the reference (the baseline). */
  scenarios: PeakScenario[];
  /** Restrict to these buildings (Step 4 compares only the shortlisted ones). */
  points?: { lat: number; lon: number }[];
}) {
  const t = useT();
  const lang = useLang();
  const locale = lang === "sv" ? "sv-SE" : "en-GB";
  const n = (v: number | null | undefined, d = 0) => v == null ? "—" : v.toLocaleString(locale, { maximumFractionDigits: d });
  const [data, setData] = useState<Record<string, PeakResponse>>({});
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("total");       // Step 3: building idf_idx or "total"
  const [compareTo, setCompareTo] = useState<string | null>(null);  // Step 4: package batch id
  const key = scenarios.map((s) => s.batchId).join("|") + JSON.stringify(points ?? []);

  useEffect(() => {
    let alive = true;
    setError(null);
    Promise.all(scenarios.map((s) => fetchPeaks(s.batchId, points).then((r) => [s.batchId, r] as const)))
      .then((pairs) => { if (alive) setData(Object.fromEntries(pairs)); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const base = scenarios[0] ? data[scenarios[0].batchId] : undefined;
  const comparing = scenarios.length > 1;
  const alt = comparing ? data[compareTo ?? scenarios[1]!.batchId] : undefined;
  const altLabel = comparing ? (scenarios.find((s) => s.batchId === (compareTo ?? scenarios[1]!.batchId))?.label ?? "") : "";

  const curve = useMemo(() => {
    const pick = (r?: PeakResponse) => {
      if (!r) return undefined;
      if (!comparing && selected !== "total") return r.buildings.find((b) => String(b.idf_idx) === selected)?.heat.duration_curve;
      return r.total?.heat.duration_curve;
    };
    const a = pick(base), b = pick(alt);
    if (!a) return [];
    return a.map((p, i) => ({ hours: p.hours, base: p.kw, alt: b?.[i]?.kw }));
  }, [base, alt, selected, comparing]);

  if (error) return <div role="alert" style={{ fontSize: 12, color: C.bad }}>⚠ {error}</div>;
  if (!base) {
    return <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
      <Loader2 size={13} className="animate-spin" /> {t("Reading the hourly results…")}
    </div>;
  }
  if (!base.total) return <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{t("This run predates hourly output — re-run it to see peak demand.")}</div>;

  const th: React.CSSProperties = { padding: "6px 8px", textAlign: "right", fontWeight: 700, color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "6px 8px", textAlign: "right", color: "rgba(255,255,255,0.8)", whiteSpace: "nowrap" };
  const change = (now: number, ref: number) => {
    if (!ref) return "—";
    const pct = Math.round(((now - ref) / ref) * 100);
    return pct === 0 ? "±0%" : `${pct < 0 ? "▼" : "▲"} ${Math.abs(pct)}%`;
  };
  const changeColor = (now: number, ref: number) => (now < ref ? C.good : now > ref ? C.bad : "rgba(255,255,255,0.5)");

  return (
    <div style={{ borderRadius: 14, padding: "16px 18px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Activity size={18} color={BASE} style={{ marginTop: 2 }} />
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>{t(comparing ? "Peak demand — before and after" : "Peak demand")}</h3>
          <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)", margin: 0, lineHeight: 1.55 }}>
            {t(comparing
              ? "How much each package lowers the highest heat demand. Power charges and the size of the heating connection follow the peak, not the yearly total, so a package can save more money than its kWh suggest."
              : "The highest heat (space heating + hot water) and electricity demand over the year, from the hourly simulation. Power charges and the size of the heating connection follow these peaks, not the yearly total.")}
          </p>
        </div>
      </div>

      {comparing ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <th style={{ ...th, textAlign: "left" }}>{t("Scenario")}</th>
                <th style={th}>{t("Peak heat, kW")}</th>
                <th style={th}>{t("vs baseline")}</th>
                <th style={th}>{t("Highest daily average, kW")}</th>
                <th style={th}>{t("vs baseline")}</th>
                <th style={th}>{t("Peak electricity, kW")}</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s, i) => {
                const r = data[s.batchId]?.total;
                const ref = base.total!;
                return (
                  <tr key={s.batchId} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ ...td, textAlign: "left", fontWeight: i === 0 ? 800 : 600 }}>{s.label}</td>
                    {r ? (<>
                      <td style={td}>{n(r.heat.peak_kw, 1)}</td>
                      <td style={{ ...td, color: i === 0 ? "rgba(255,255,255,0.35)" : changeColor(r.heat.peak_kw, ref.heat.peak_kw), fontWeight: 700 }}>{i === 0 ? "—" : change(r.heat.peak_kw, ref.heat.peak_kw)}</td>
                      <td style={td}>{n(r.heat.peak_daily_avg_kw, 1)}</td>
                      <td style={{ ...td, color: i === 0 ? "rgba(255,255,255,0.35)" : changeColor(r.heat.peak_daily_avg_kw ?? 0, ref.heat.peak_daily_avg_kw ?? 0), fontWeight: 700 }}>{i === 0 ? "—" : change(r.heat.peak_daily_avg_kw ?? 0, ref.heat.peak_daily_avg_kw ?? 0)}</td>
                      <td style={td}>{n(r.electricity.peak_kw, 1)}</td>
                    </>) : <td colSpan={5} style={{ ...td, textAlign: "left", color: "rgba(255,255,255,0.4)" }}>{data[s.batchId] ? t("no hourly data") : t("Loading…")}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
            {base.total.buildings === 1
              ? t("One building, from its hourly results.")
              : t("All {n} buildings together, added up hour by hour — buildings that peak at different times are not double counted.", { n: base.total.buildings })}
          </div>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <th style={{ ...th, textAlign: "left" }}>{t("Building")}</th>
                <th style={th}>{t("Peak heat, kW")}</th>
                <th style={th}>W/m²</th>
                <th style={th}>{t("When")}</th>
                <th style={th}>{t("Highest daily average, kW")}</th>
                <th style={th} title={t("Yearly heat ÷ peak: the hours the building would need at full peak to use its yearly heat. Low = a spiky load.")}>{t("Full-load hours")}</th>
                <th style={th}>{t("Peak electricity, kW")}</th>
              </tr>
            </thead>
            <tbody>
              {[...base.buildings.map((b) => ({ id: String(b.idf_idx), label: b.address ?? t("Building {n}", { n: b.idf_idx + 1 }), s: b })),
                ...(base.buildings.length > 1 ? [{ id: "total", label: t("All buildings together"), s: { heat: base.total.heat, electricity: base.total.electricity } }] : [])].map(({ id, label, s }) => (
                <tr key={id} onClick={() => setSelected(id)} title={t("Show its duration curve")}
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", cursor: "pointer",
                    background: (selected === id || (base.buildings.length === 1 && id !== "total")) ? "rgba(255,255,255,0.04)" : undefined,
                    fontWeight: id === "total" ? 800 : 400 }}>
                  <td style={{ ...td, textAlign: "left", fontWeight: id === "total" ? 800 : 600 }}>{label}</td>
                  <td style={td}>{n(s.heat.peak_kw, 1)}</td>
                  <td style={td}>{n(s.heat.peak_w_m2, 0)}</td>
                  <td style={td}>{whenLabel(s.heat.peak_hour)}</td>
                  <td style={td}>{n(s.heat.peak_daily_avg_kw, 1)}</td>
                  <td style={td}>{n(s.heat.full_load_hours, 0)}</td>
                  <td style={td}>{n(s.electricity.peak_kw, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.75)" }}>
            {t("Heat demand duration curve — every hour of the year, highest first")}
          </div>
          {comparing && scenarios.length > 2 && (
            <select value={compareTo ?? scenarios[1]!.batchId} onChange={(e) => setCompareTo(e.target.value)} aria-label={t("Package to compare")}
              style={{ padding: "3px 8px", borderRadius: 7, fontSize: 11, background: "#0d1117", color: "#fff", border: "1px solid rgba(255,255,255,0.15)" }}>
              {scenarios.slice(1).map((s) => <option key={s.batchId} value={s.batchId}>{s.label}</option>)}
            </select>
          )}
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={curve} margin={{ top: 8, right: 14, bottom: 18, left: 8 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="hours" type="number" domain={[0, 8760]} ticks={[0, 1000, 2000, 4000, 6000, 8760]}
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }}
              label={{ value: t("hours of the year"), position: "insideBottom", offset: -10, fontSize: 10, fill: "rgba(255,255,255,0.45)" }} />
            <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }} width={48}
              label={{ value: "kW", angle: -90, position: "insideLeft", fontSize: 10, fill: "rgba(255,255,255,0.45)" }} />
            <Tooltip contentStyle={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, fontSize: 11 }}
              labelFormatter={(h) => t("{h} hours a year at or above", { h: Number(h).toLocaleString(locale) })}
              formatter={(v: number, name: string) => [`${v.toLocaleString(locale, { maximumFractionDigits: 1 })} kW`, name]} />
            {comparing && <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 10.5, paddingBottom: 6 }} />}
            <Line type="monotone" dataKey="base" name={scenarios[0]!.label} stroke={BASE} strokeWidth={2} dot={false} isAnimationActive={false} />
            {comparing && <Line type="monotone" dataKey="alt" name={altLabel} stroke={ALT} strokeWidth={2} dot={false} isAnimationActive={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
        {t("Heat = space heating + hot water; electricity = lighting and household appliances. Each value is an hourly average in a typical weather year, so the real peak on the coldest day of an actual winter is somewhat higher — use these figures to compare scenarios, not to size equipment.")}
        {base.without_hourly_data > 0 && ` ${t("{n} buildings have no hourly data (older runs) and are left out.", { n: base.without_hourly_data })}`}
      </div>
    </div>
  );
}
