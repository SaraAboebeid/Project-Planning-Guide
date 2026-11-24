/* Peak demand from the hourly simulation results (backend /api/simulation-peaks).

   Two uses:
   • Step 3 — one scenario (the baseline): each building's peak heat and
     electricity, and when it happens.
   • Step 4 — several scenarios (baseline + simulated packages): how much each
     package lowers the combined peak, which is what a power (effekt) charge
     bills. (The heat-demand duration curve was removed 2026-11-24, user request.)

   An EnergyPlus hour is an hourly mean and the weather a typical year, so real
   instantaneous peaks run somewhat higher; the panel says so. */

import { useEffect, useState } from "react";
import { Loader2, Activity } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { useLang, translate } from "../i18n";
import { useEngineT } from "../utils/engineName";
import { C } from "../config/colors";

// Validated pair (dataviz palette checker, dark surface #0d1117).
const BASE = "#A08BB7";
const PKG = "#644686";
const SHAVED = "#E8880C";

interface PeakStats {
  peak_kw: number; peak_hour?: number; peak_w_m2?: number | null; peak_daily_avg_kw?: number; peak_day?: number;
  annual_kwh?: number; full_load_hours?: number | null; hours_above_80pct?: number;
  duration_curve?: { hours: number; kw: number }[];
}
interface PeakBuilding { idf_idx: number; address: string | null; lat: number; lon: number; floor_area_m2: number | null; heat: PeakStats; electricity: PeakStats }
interface PeakResponse { batch_id: string; buildings: PeakBuilding[]; total: { buildings: number; floor_area_m2: number | null; heat: PeakStats; electricity: PeakStats; heat_hourly?: number[] } | null; without_hourly_data: number }

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

async function fetchPeaks(batchId: string, points?: { lat: number; lon: number }[], series = false): Promise<PeakResponse> {
  const qs = [points?.length ? `points=${encodeURIComponent(points.map((p) => `${p.lat},${p.lon}`).join(";"))}` : "", series ? "series=true" : ""].filter(Boolean);
  const q = qs.length ? `?${qs.join("&")}` : "";
  const res = await fetch(`/api/simulation-peaks/${encodeURIComponent(batchId)}${q}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? `API ${res.status}`);
  return res.json();
}

export default function PeakDemandPanel({ scenarios, points, preferredBatchId }: {
  /** First entry is the reference (the baseline). */
  scenarios: PeakScenario[];
  /** Restrict to these buildings (Step 4 compares only the shortlisted ones). */
  points?: { lat: number; lon: number }[];
  /** The package shown first in the hourly plot (e.g. the one chosen for the building). */
  preferredBatchId?: string | null;
}) {
  const t = useEngineT();
  const lang = useLang();
  const locale = lang === "sv" ? "sv-SE" : "en-GB";
  const n = (v: number | null | undefined, d = 0) => v == null ? "—" : v.toLocaleString(locale, { maximumFractionDigits: d });
  const [data, setData] = useState<Record<string, PeakResponse>>({});
  const [error, setError] = useState<string | null>(null);
  const key = scenarios.map((s) => s.batchId).join("|") + JSON.stringify(points ?? []);

  useEffect(() => {
    let alive = true;
    setError(null);
    Promise.all(scenarios.map((s) => fetchPeaks(s.batchId, points, scenarios.length > 1).then((r) => [s.batchId, r] as const)))
      .then((pairs) => { if (alive) setData(Object.fromEntries(pairs)); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const base = scenarios[0] ? data[scenarios[0].batchId] : undefined;
  const comparing = scenarios.length > 1;
  const [pick, setPick] = useState<string | null>(null);
  const [range, setRange] = useState<"peak" | "year">("peak");

  if (error) return <div role="alert" style={{ fontSize: 12, color: C.bad }}>⚠ {error}</div>;
  if (!base) {
    return <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
      <Loader2 size={13} className="animate-spin" /> {t("Reading the hourly results…")}
    </div>;
  }
  if (!base.total) return <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{t("This run predates hourly output — re-run it to see peak demand.")}</div>;

  const th: React.CSSProperties = { padding: "6px 8px", textAlign: "right", fontWeight: 600, color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap" };
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
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>{t(comparing ? "Peak demand — before and after" : "Peak demand")}</h3>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0, lineHeight: 1.55 }}>
            {t(comparing
              ? "How much each package lowers the highest heat demand. Power charges and the size of the heating connection follow the peak, not the yearly total, so a package can save more money than its kWh suggest."
              : "The highest heat (space heating + hot water) and electricity demand over the year, from the hourly simulation. Power charges and the size of the heating connection follow these peaks, not the yearly total.")}
          </p>
        </div>
      </div>

      {comparing ? (() => {
        /* Peak shaving, drawn (2026-11-24, user request): today's hourly heat
           demand against one package's, over the coldest fortnight (hourly) or
           the whole year (each day's highest hour). The orange band between the
           two is the demand the package takes away; the dashed lines are the two
           peaks, which is what a power charge bills. */
        const ref = base.total!.heat;
        const baseH = base.total!.heat_hourly;
        const pkgs = scenarios.slice(1).map((s) => {
          const r = data[s.batchId]?.total;
          return r ? { id: s.batchId, label: s.label, peak: r.heat.peak_kw, daily: r.heat.peak_daily_avg_kw ?? null, hourly: r.heat_hourly } : null;
        }).filter((x): x is NonNullable<typeof x> => x != null);
        const best = [...pkgs].sort((a, b) => a.peak - b.peak)[0];
        const sel = pkgs.find((x) => x.id === pick) ?? pkgs.find((x) => x.id === preferredBatchId) ?? best;
        const pct = (v: number) => (ref.peak_kw ? Math.round(((v - ref.peak_kw) / ref.peak_kw) * 100) : 0);
        if (!sel || !baseH || !sel.hourly) {
          return <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            <Loader2 size={13} className="animate-spin" /> {t("Reading the hourly results…")}</div>;
        }
        const pk = sel.hourly;
        let rows: { x: number; label: string; base: number; pkg: number; shaved: number }[];
        if (range === "peak") {
          const at = ref.peak_hour ?? baseH.indexOf(Math.max(...baseH));
          const from = Math.max(0, Math.min(baseH.length - 14 * 24, at - 7 * 24));
          rows = Array.from({ length: Math.min(14 * 24, baseH.length) }, (_, k) => {
            const h = from + k, b = baseH[h] ?? 0, q = pk[h] ?? 0;
            return { x: h, label: whenLabel(h), base: b, pkg: Math.min(q, b), shaved: Math.max(0, b - q) };
          });
        } else {
          rows = Array.from({ length: Math.floor(baseH.length / 24) }, (_, d) => {
            const b = Math.max(...baseH.slice(d * 24, d * 24 + 24)), q = Math.max(...pk.slice(d * 24, d * 24 + 24));
            return { x: d * 24, label: whenLabel(d * 24).replace(/ \d\d:00$/, ""), base: b, pkg: Math.min(q, b), shaved: Math.max(0, b - q) };
          });
        }
        const tickEvery = range === "peak" ? 48 : 30;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{t("Package")}</span>
              <select value={sel.id} onChange={(e) => setPick(e.target.value)}
                style={{ padding: "5px 9px", borderRadius: 8, fontSize: 12, fontWeight: 600, maxWidth: 520,
                  background: "#11161d", color: "#fff", border: "1px solid rgba(255,255,255,0.15)" }}>
                {[...pkgs].sort((a, b) => a.peak - b.peak).map((x) => (
                  <option key={x.id} value={x.id} style={{ backgroundColor: "#11161d", color: "#fff" }}>
                    {`${pct(x.peak)}% · ${x.label}`}
                  </option>
                ))}
              </select>
              <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }}>
                {([["peak", "Coldest two weeks"], ["year", "Whole year"]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setRange(k)}
                    style={{ padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                      border: `1px solid ${range === k ? "#8B6EAD" : "rgba(255,255,255,0.12)"}`,
                      background: range === k ? "#8B6EAD" : "transparent", color: range === k ? "#0b1220" : "rgba(255,255,255,0.6)" }}>
                    {t(l)}
                  </button>
                ))}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>
              {t("The highest hour drops from {a} kW to {b} kW", { a: n(ref.peak_kw, 0), b: n(sel.peak, 0) })}
              <b style={{ color: sel.peak < ref.peak_kw ? C.good : C.bad, marginLeft: 6 }}>({pct(sel.peak)}%)</b>
              {ref.peak_daily_avg_kw != null && sel.daily != null && (
                <span style={{ color: "rgba(255,255,255,0.5)" }}>{" · "}{t("highest daily average {a} → {b} kW", { a: n(ref.peak_daily_avg_kw, 0), b: n(sel.daily, 0) })}</span>
              )}
            </div>
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} margin={{ top: 18, right: 16, bottom: 4, left: 4 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" interval={tickEvery - 1} tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }}
                    tickFormatter={(v: string) => v.replace(/ \d\d:00$/, "")} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11 }} width={52}
                    label={{ value: range === "peak" ? t("Heat demand, kW") : t("Highest hour of the day, kW"), angle: -90, position: "insideLeft", fill: "rgba(255,255,255,0.55)", fontSize: 11.5, style: { textAnchor: "middle" } }} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]!.payload as (typeof rows)[number];
                    return (
                      <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "8px 11px", fontSize: 12 }}>
                        <div style={{ color: "#fff", fontWeight: 700, marginBottom: 3 }}>{d.label}</div>
                        <div style={{ color: "rgba(255,255,255,0.75)" }}>{t("Today")}: <b>{n(d.base, 1)} kW</b></div>
                        <div style={{ color: "rgba(255,255,255,0.75)" }}>{t("With the package")}: <b>{n(d.pkg, 1)} kW</b></div>
                        <div style={{ color: SHAVED }}>{t("Shaved off")}: <b>{n(d.shaved, 1)} kW</b></div>
                      </div>
                    );
                  }} />
                  {/* stacked: package demand + the part it removes = today's demand */}
                  <Area type="monotone" dataKey="pkg" stackId="d" stroke="none" fill={PKG} fillOpacity={0.45} isAnimationActive={false} />
                  <Area type="monotone" dataKey="shaved" stackId="d" stroke="none" fill={SHAVED} fillOpacity={0.55} isAnimationActive={false} />
                  <Line type="monotone" dataKey="base" stroke={BASE} strokeWidth={1.4} dot={false} isAnimationActive={false} />
                  <ReferenceLine y={ref.peak_kw} stroke={BASE} strokeDasharray="5 4"
                    label={{ value: t("today's peak {v} kW", { v: n(ref.peak_kw, 0) }), position: "insideTopRight", fill: "rgba(255,255,255,0.6)", fontSize: 11 }} />
                  <ReferenceLine y={sel.peak} stroke={PKG} strokeDasharray="5 4"
                    label={{ value: t("with the package {v} kW", { v: n(sel.peak, 0) }), position: "insideBottomLeft", fill: "rgba(255,255,255,0.6)", fontSize: 11 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
              <span><span style={{ display: "inline-block", width: 18, height: 2, background: BASE, verticalAlign: "middle", marginRight: 6 }} />{t("Today (no renovation)")}</span>
              <span><span style={{ display: "inline-block", width: 12, height: 12, background: PKG, opacity: 0.6, verticalAlign: "middle", marginRight: 6, borderRadius: 2 }} />{t("With the package")}</span>
              <span><span style={{ display: "inline-block", width: 12, height: 12, background: SHAVED, opacity: 0.7, verticalAlign: "middle", marginRight: 6, borderRadius: 2 }} />{t("Shaved off by the package")}</span>
            </div>
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.4)" }}>
              {base.total!.buildings === 1
                ? t("One building, from its hourly results.")
                : t("All {n} buildings together, added up hour by hour — buildings that peak at different times are not double counted.", { n: base.total!.buildings })}
            </div>
          </div>
        );
      })() : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
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
                <tr key={id}
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", fontWeight: id === "total" ? 800 : 400 }}>
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

      <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
        {t("Heat = space heating + hot water; electricity = lighting and household appliances. Each value is an hourly average in a typical weather year, so the real peak on the coldest day of an actual winter is somewhat higher — use these figures to compare scenarios, not to size equipment.")}
        {base.without_hourly_data > 0 && ` ${t("{n} buildings have no hourly data (older runs) and are left out.", { n: base.without_hourly_data })}`}
      </div>
    </div>
  );
}
