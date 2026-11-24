import { useMemo, useState } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { OptimizePoint, OptimizeCloudPoint } from "../api/client";
import { useEngineT } from "../utils/engineName";

/* Trade-off chart for the renovation optimiser: every combination of the
 * user's saved build-ups as one dot, cost on one axis, carbon on the other,
 * energy as colour (the axes follow the Step 1 KPIs).
 *
 * Rewritten 2026-11-24: users did not understand the earlier version. The
 * legend used text glyphs (—●, ◯, ●, ◆) that did not look like the markers,
 * the y axis said "GWP", and a replay animation drew the cloud in. Now the
 * legend draws the SAME SVG markers as the plot, axes are in plain words, the
 * good corner is labelled, and everything is drawn at once. */

export type ObjKey = "cost" | "carbon" | "energy";
type Metric = "total_cost" | "total_carbon" | "energy_kwh_m2_yr";

export const OBJECTIVES: Record<ObjKey, { metric: Metric; label: string; short: string; kpi: string; unit: string; money: boolean }> = {
  cost:   { metric: "total_cost",        label: "50-year cost",   short: "50-year cost",   kpi: "Cost",                     unit: "",          money: true },
  carbon: { metric: "total_carbon",      label: "50-year carbon", short: "50-year carbon", kpi: "Global Warming Potential", unit: "kg CO₂e",   money: false },
  energy: { metric: "energy_kwh_m2_yr",  label: "Energy use",     short: "Energy use",     kpi: "Energy Demand",            unit: "kWh/m²·yr", money: false },
};

/** Pick X / Y / colour objectives from the Step-1 KPIs; falls back to the
 * canonical cost→X, carbon→Y, energy→colour when the KPIs don't disambiguate. */
export function axesFromKpis(kpis: string[]): { x: ObjKey; y: ObjKey; color: ObjKey } {
  const order: ObjKey[] = ["cost", "carbon", "energy"];
  const selected = order.filter((k) => kpis.includes(OBJECTIVES[k].kpi));
  const rest = order.filter((k) => !selected.includes(k));
  const seq = [...selected, ...rest];
  return { x: seq[0]!, y: seq[1]!, color: seq[2]! };
}

/* Viridis-ish continuous colour scale (perceptually ordered dark→bright). */
const VIRIDIS: [number, number, number][] = [
  [68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37],
];
function viridis(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (VIRIDIS.length - 1);
  const i = Math.floor(x), f = x - i;
  const a = VIRIDIS[i]!, b = VIRIDIS[Math.min(VIRIDIS.length - 1, i + 1)]!;
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}

/** 2-objective Pareto frontier (both minimised), returned left→right in X. */
function pareto2D<T extends { x: number; y: number }>(pts: T[]): T[] {
  const sorted = [...pts].sort((p, q) => (p.x - q.x) || (p.y - q.y));
  const out: T[] = [];
  let bestY = Infinity;
  for (const p of sorted) {
    if (p.y < bestY) { out.push(p); bestY = p.y; }
  }
  return out;
}

interface Datum { x: number; y: number; c: number; fill: string; }
interface OptDatum extends Datum { point: OptimizePoint; validated: boolean; }

/* Markers — the chart and the legend draw these same shapes. */
const CLOUD_R = 3.1, FRONT_R = 3.5, OPT_R = 7;
const FRONT_COLOR = "#B8A3D0", OPT_COLOR = "#8B6EAD", SIM_COLOR = "#2FB477";
const diamond = (cx: number, cy: number, r = 6) => `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`;

function LegendMark({ kind }: { kind: "cloud" | "front" | "opt" | "sim" | "base" }) {
  return (
    <svg width={kind === "front" ? 26 : 16} height={16} style={{ flexShrink: 0, verticalAlign: "middle" }} aria-hidden>
      {kind === "cloud" && (<>
        <circle cx={4} cy={8} r={CLOUD_R} fill={viridis(0.1)} fillOpacity={0.8} />
        <circle cx={12} cy={8} r={CLOUD_R} fill={viridis(0.9)} fillOpacity={0.8} />
      </>)}
      {kind === "front" && (<>
        <line x1={1} y1={8} x2={25} y2={8} stroke={FRONT_COLOR} strokeWidth={2.5} />
        <circle cx={13} cy={8} r={FRONT_R} fill="#0d1117" stroke={FRONT_COLOR} strokeWidth={2} />
      </>)}
      {kind === "opt" && <circle cx={8} cy={8} r={OPT_R - 1} fill="rgba(139,110,173,0.18)" stroke={OPT_COLOR} strokeWidth={2.2} />}
      {kind === "sim" && <circle cx={8} cy={8} r={OPT_R - 1} fill="rgba(47,180,119,0.9)" stroke={SIM_COLOR} strokeWidth={2.2} />}
      {kind === "base" && <path d={diamond(8, 8, 6)} fill="rgba(255,255,255,0.85)" stroke="#0d1117" strokeWidth={1} />}
    </svg>
  );
}

export default function ParetoChart({
  cloud, pareto, baseline, axes, currency, evaluated, onValidate, validatedKeys, pointKey, height = 340,
}: {
  cloud: OptimizeCloudPoint[];
  pareto: OptimizePoint[];
  baseline: { energy_kwh_m2_yr: number; total_cost: number; total_carbon: number };
  axes: { x: ObjKey; y: ObjKey; color: ObjKey };
  currency: "SEK" | "GBP" | "EUR";
  evaluated: number;
  onValidate: (p: OptimizePoint) => void;
  validatedKeys: Set<string>;
  pointKey: (p: OptimizePoint) => string;
  height?: number;
}) {
  const t = useEngineT();
  const xO = OBJECTIVES[axes.x], yO = OBJECTIVES[axes.y], cO = OBJECTIVES[axes.color];
  const white = (o: number) => `rgba(255,255,255,${o})`;
  const unitOf = (o: typeof xO) => (o.money ? currency : o.unit);

  const fmt = (v: number, o: typeof xO) =>
    o.money
      ? (currency === "SEK" ? `${Math.round(v).toLocaleString("sv-SE")} SEK`
        : currency === "EUR" ? `€${Math.round(v).toLocaleString("nl-BE")}` : `£${Math.round(v).toLocaleString("en-GB")}`)
      : `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}${o.unit ? " " + o.unit : ""}`;
  const tick = (v: number, o: typeof xO) =>
    o.money || Math.abs(v) >= 10000
      ? (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}k`)
      : `${Math.round(v)}`;

  // Colour normalisation over the full cloud.
  const [cMin, cMax] = useMemo(() => {
    const cs = cloud.map((p) => p[cO.metric]);
    return cs.length ? [Math.min(...cs), Math.max(...cs)] : [0, 1];
  }, [cloud, cO.metric]);
  const colorOf = (v: number) => viridis(cMax > cMin ? (v - cMin) / (cMax - cMin) : 0.5);

  const cloudData: Datum[] = useMemo(
    () => cloud.map((p) => ({ x: p[xO.metric], y: p[yO.metric], c: p[cO.metric], fill: colorOf(p[cO.metric]) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cloud, xO.metric, yO.metric, cO.metric, cMin, cMax]
  );

  const domains = useMemo(() => {
    const xs = cloudData.map((d) => d.x), ys = cloudData.map((d) => d.y);
    xs.push(baseline[xO.metric]); ys.push(baseline[yO.metric]);
    const pad = (arr: number[]) => { const lo = Math.min(...arr), hi = Math.max(...arr); const p = (hi - lo) * 0.04 || hi * 0.04 || 1; return [lo - p, hi + p] as [number, number]; };
    return { x: pad(xs), y: pad(ys) };
  }, [cloudData, baseline, xO.metric, yO.metric]);

  /** Clicking a shortlisted marker pins it; the card below is a stationary
   *  target you can click — unlike the hover tooltip. */
  const [pinned, setPinned] = useState<OptimizePoint | null>(null);
  const frontier = useMemo(() => pareto2D(cloudData), [cloudData]);

  const optimalData: OptDatum[] = useMemo(
    () => pareto.map((p) => ({
      x: p[xO.metric], y: p[yO.metric], c: p[cO.metric], fill: colorOf(p[cO.metric]),
      point: p, validated: validatedKeys.has(pointKey(p)),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pareto, xO.metric, yO.metric, cO.metric, validatedKeys, cMin, cMax]
  );
  const baselineDatum = [{ x: baseline[xO.metric], y: baseline[yO.metric] }];

  const CloudDot = (props: { cx?: number; cy?: number; payload?: Datum }) =>
    props.cx != null && props.cy != null
      ? <circle cx={props.cx} cy={props.cy} r={CLOUD_R} fill={props.payload?.fill ?? "#888"} fillOpacity={0.6} />
      : null;
  const FrontierDot = (props: { cx?: number; cy?: number }) =>
    props.cx != null && props.cy != null
      ? <circle cx={props.cx} cy={props.cy} r={FRONT_R} fill="#0d1117" stroke={FRONT_COLOR} strokeWidth={2} />
      : null;
  const OptimalDot = (props: { cx?: number; cy?: number; payload?: OptDatum }) => {
    if (props.cx == null || props.cy == null) return null;
    const v = props.payload?.validated;
    return <circle cx={props.cx} cy={props.cy} r={OPT_R} fill={v ? "rgba(47,180,119,0.9)" : "rgba(139,110,173,0.18)"}
      stroke={v ? SIM_COLOR : OPT_COLOR} strokeWidth={2.2} style={{ cursor: "pointer" }} />;
  };
  const BaselineDot = (props: { cx?: number; cy?: number }) =>
    props.cx != null && props.cy != null
      ? <path d={diamond(props.cx, props.cy)} fill="rgba(255,255,255,0.85)" stroke="#0d1117" strokeWidth={1} />
      : null;

  const TooltipContent = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: Datum & Partial<OptDatum> }> }) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0]!.payload;
    const isOpt = "point" in d && d.point;
    const isBase = !("fill" in d);
    return (
      <div style={{ background: "#0d1117", border: `1px solid ${white(0.15)}`, borderRadius: 8, padding: "8px 11px", fontSize: 12 }}>
        {isOpt && <div style={{ color: OPT_COLOR, fontWeight: 700, marginBottom: 4 }}>{t("Shortlisted combination")}</div>}
        {isBase && <div style={{ color: "#fff", fontWeight: 700, marginBottom: 4 }}>{t("Today's building (no renovation)")}</div>}
        <div style={{ color: "#fff" }}>{t(xO.short)}: <b>{fmt(d.x, xO)}</b></div>
        <div style={{ color: "#fff" }}>{t(yO.short)}: <b>{fmt(d.y, yO)}</b></div>
        {!isBase && <div style={{ color: white(0.7) }}>{t(cO.short)}: {fmt(d.c, cO)}</div>}
        {isOpt && (d as OptDatum).point && (
          <div style={{ marginTop: 5, color: white(0.55), maxWidth: 240 }}>
            {Object.entries((d as OptDatum).point.selection_labels).filter(([, v]) => v !== "Keep as-built").map(([k, v]) => (
              <div key={k}>{t(k.replace("VertExt::", ""))}: {v}</div>
            ))}
            <div style={{ color: OPT_COLOR, marginTop: 3 }}>
              {(d as OptDatum).validated ? t("✓ simulated in EnergyPlus") : t("click to select it")}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (cloudData.length === 0) return null;

  return (
    <div style={{ marginTop: 6 }}>
      {/* How to read it — before the chart, in plain words. */}
      <div style={{ fontSize: 12, color: white(0.6), lineHeight: 1.6, marginBottom: 8 }}>
        {t("Each dot is one combination of the build-ups you saved. Further left = lower {x}; further down = lower {y}; the colour shows {c} (darker = less). The best combinations sit towards the bottom-left.",
          { x: t(xO.short).toLowerCase(), y: t(yO.short).toLowerCase(), c: t(cO.short).toLowerCase() })}
        <span style={{ color: white(0.4) }}>
          {" "}{t("{n} combinations plotted", { n: cloudData.length.toLocaleString() })}
          {evaluated > cloudData.length ? t(" (a sample of {n})", { n: evaluated.toLocaleString() }) : ""}.
        </span>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1, height, position: "relative" }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, bottom: 30, left: 18 }}>
              <CartesianGrid stroke={white(0.06)} />
              <XAxis
                type="number" dataKey="x" domain={domains.x} allowDataOverflow
                tick={{ fill: white(0.45), fontSize: 11 }} tickFormatter={(v) => tick(v, xO)}
                label={{ value: `${t(xO.label)} (${unitOf(xO)})`, position: "bottom", offset: 12, fill: white(0.6), fontSize: 12 }}
              />
              <YAxis
                type="number" dataKey="y" domain={domains.y} allowDataOverflow
                tick={{ fill: white(0.45), fontSize: 11 }} tickFormatter={(v) => tick(v, yO)} width={58}
                label={{ value: `${t(yO.label)} (${unitOf(yO)})`, angle: -90, position: "insideLeft", offset: -6, fill: white(0.6), fontSize: 12, style: { textAnchor: "middle" } }}
              />
              <Tooltip content={<TooltipContent />} cursor={{ stroke: white(0.2) }} />
              <Scatter data={cloudData} shape={<CloudDot />} isAnimationActive={false} />
              <Scatter data={frontier} line={{ stroke: FRONT_COLOR, strokeWidth: 2.5 }} lineJointType="linear" shape={<FrontierDot />} isAnimationActive={false} legendType="none" />
              <Scatter data={baselineDatum} shape={<BaselineDot />} isAnimationActive={false} />
              <Scatter data={optimalData} shape={<OptimalDot />} isAnimationActive={false}
                style={{ cursor: "pointer" }}
                // Recharts hands back the datum wrapped in a props object on some
                // versions and bare on others — read both.
                onClick={(d: unknown) => {
                  const o = d as { point?: OptimizePoint; payload?: { point?: OptimizePoint } } | undefined;
                  const p = o?.point ?? o?.payload?.point;
                  if (p) setPinned(p);
                }} />
            </ScatterChart>
          </ResponsiveContainer>
          {/* The good corner, labelled where it is. */}
          <span style={{ position: "absolute", left: 92, bottom: 66, fontSize: 11, fontWeight: 600, color: white(0.4), pointerEvents: "none" }}>
            ↙ {t("better")}
          </span>
        </div>

        {/* colour scale for the third objective */}
        <div style={{ width: 74, display: "flex", flexDirection: "column", alignItems: "center", paddingBottom: 30, paddingTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: white(0.6), textAlign: "center", lineHeight: 1.3 }}>{t(cO.short)}</div>
          <div style={{ fontSize: 10, color: white(0.4), marginBottom: 4 }}>{unitOf(cO)}</div>
          <div style={{ fontSize: 11, color: white(0.45) }}>{tick(cMax, cO)} · {t("more")}</div>
          <div style={{ width: 12, flex: 1, borderRadius: 4, margin: "3px 0",
            background: `linear-gradient(to top, ${viridis(0)}, ${viridis(0.25)}, ${viridis(0.5)}, ${viridis(0.75)}, ${viridis(1)})` }} />
          <div style={{ fontSize: 11, color: white(0.45) }}>{tick(cMin, cO)} · {t("less")}</div>
        </div>
      </div>

      {/* Legend — the same markers as the plot. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "6px 16px",
        fontSize: 12, color: white(0.6), marginTop: 4, paddingLeft: 8 }}>
        <span style={{ display: "flex", gap: 7, alignItems: "center" }}><LegendMark kind="cloud" />
          {t("One combination of your build-ups (colour = {c})", { c: t(cO.short).toLowerCase() })}</span>
        <span style={{ display: "flex", gap: 7, alignItems: "center" }}><LegendMark kind="front" />
          {t("Lowest {y} you can get for each {x}", { y: t(yO.short).toLowerCase(), x: t(xO.short).toLowerCase() })}</span>
        <span style={{ display: "flex", gap: 7, alignItems: "center" }}><LegendMark kind="opt" />
          {t("Shortlisted: nothing else is better on cost, carbon and energy at once (click to select)")}</span>
        <span style={{ display: "flex", gap: 7, alignItems: "center" }}><LegendMark kind="sim" />
          {t("Shortlisted and simulated in EnergyPlus")}</span>
        <span style={{ display: "flex", gap: 7, alignItems: "center" }}><LegendMark kind="base" />
          {t("Today's building (no renovation)")}</span>
      </div>
      <div style={{ fontSize: 11.5, color: white(0.4), marginTop: 6, paddingLeft: 8, lineHeight: 1.5 }}>
        {t("A shortlisted circle can sit above the line: it may cost or emit a little more but use clearly less energy, which the line (cost and carbon only) does not show.")}
      </div>

      {/* Pinned package — a stationary target, unlike the hover tooltip */}
      {pinned && (() => {
        const isVal = validatedKeys.has(pointKey(pinned));
        const touched = Object.entries(pinned.selection_labels).filter(([, v]) => v !== "Keep as-built");
        return (
          <div style={{ marginTop: 10, padding: "11px 14px", borderRadius: 10,
            background: "rgba(139,110,173,0.08)", border: "1px solid rgba(139,110,173,0.35)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: OPT_COLOR, marginBottom: 4 }}>{t("Selected combination")}</div>
                {touched.length === 0
                  ? <div style={{ fontSize: 12, color: white(0.5), fontStyle: "italic" }}>{t("Keep everything as-built")}</div>
                  : touched.map(([k, v]) => (
                      <div key={k} style={{ fontSize: 12, color: white(0.8) }}>
                        <span style={{ color: white(0.45) }}>{t(k.replace("VertExt::", ""))}:</span> {v}
                      </div>
                    ))}
                <div style={{ fontSize: 12, color: white(0.55), marginTop: 5 }}>
                  {fmt(pinned[OBJECTIVES.energy.metric], OBJECTIVES.energy)}
                  {" · "}{fmt(pinned[OBJECTIVES.cost.metric], OBJECTIVES.cost)}
                  {" · "}{fmt(pinned[OBJECTIVES.carbon.metric], OBJECTIVES.carbon)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={() => onValidate(pinned)}
                  disabled={isVal}
                  style={{ padding: "8px 15px", borderRadius: 9, fontSize: 12, fontWeight: 700,
                    cursor: isVal ? "default" : "pointer",
                    border: `1px solid ${isVal ? "rgba(47,180,119,0.5)" : "rgba(139,110,173,0.55)"}`,
                    background: isVal ? "rgba(47,180,119,0.14)" : "rgba(139,110,173,0.18)",
                    color: isVal ? SIM_COLOR : OPT_COLOR }}>
                  {isVal ? t("✓ Simulated in EnergyPlus") : t("Simulate this in EnergyPlus →")}
                </button>
                <button onClick={() => setPinned(null)}
                  style={{ background: "transparent", border: 0, cursor: "pointer", color: white(0.4), fontSize: 16, lineHeight: 1 }}
                  title={t("Clear selection")}>×</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
