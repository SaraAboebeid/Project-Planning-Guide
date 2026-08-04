import { useEffect, useMemo, useRef, useState } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Play, Pause } from "lucide-react";
import type { OptimizePoint, OptimizeCloudPoint } from "../api/client";

/* Animated Pareto frontier for the renovation optimizer. Mirrors the classic
 * cost-vs-GWP scatter+frontier plot, but the two axes and the colour axis are
 * chosen from the KPIs the user selected in Step 1. The cloud of evaluated
 * packages fills in over frames while the frontier tightens — the same "N of M
 * packages evaluated" reveal you'd get watching the optimizer run. */

export type ObjKey = "cost" | "carbon" | "energy";
type Metric = "total_cost" | "total_carbon" | "energy_kwh_m2_yr";

export const OBJECTIVES: Record<ObjKey, { metric: Metric; label: string; short: string; kpi: string; unit: string; money: boolean }> = {
  cost:   { metric: "total_cost",        label: "Life-cycle cost",         short: "Cost",   kpi: "Cost",                     unit: "",           money: true },
  carbon: { metric: "total_carbon",      label: "Global warming potential", short: "GWP",    kpi: "Global Warming Potential", unit: "kg CO₂e",    money: false },
  energy: { metric: "energy_kwh_m2_yr",  label: "Energy demand",           short: "Energy", kpi: "Energy Demand",            unit: "kWh/m²/yr",  money: false },
};

/** Pick X / Y / colour objectives from the Step-1 KPIs; falls back to the
 * canonical cost→X, GWP→Y, energy→colour when the KPIs don't disambiguate. */
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

export default function ParetoChart({
  cloud, pareto, baseline, axes, currency, evaluated, onValidate, validatedKeys, pointKey,
}: {
  cloud: OptimizeCloudPoint[];
  pareto: OptimizePoint[];
  baseline: { energy_kwh_m2_yr: number; total_cost: number; total_carbon: number };
  axes: { x: ObjKey; y: ObjKey; color: ObjKey };
  currency: "SEK" | "GBP";
  evaluated: number;
  onValidate: (p: OptimizePoint) => void;
  validatedKeys: Set<string>;
  pointKey: (p: OptimizePoint) => string;
}) {
  const xO = OBJECTIVES[axes.x], yO = OBJECTIVES[axes.y], cO = OBJECTIVES[axes.color];
  const white = (o: number) => `rgba(255,255,255,${o})`;

  const fmt = (v: number, o: typeof xO) =>
    o.money
      ? (currency === "SEK" ? `${Math.round(v).toLocaleString("sv-SE")} SEK` : `£${Math.round(v).toLocaleString("en-GB")}`)
      : `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}${o.unit ? " " + o.unit : ""}`;
  const tick = (v: number, o: typeof xO) =>
    o.money ? (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}k`) : `${Math.round(v)}`;

  // Colour normalisation over the full cloud (stable across the animation).
  const [cMin, cMax] = useMemo(() => {
    const cs = cloud.map((p) => p[cO.metric]);
    return cs.length ? [Math.min(...cs), Math.max(...cs)] : [0, 1];
  }, [cloud, cO.metric]);
  const colorOf = (v: number) => viridis(cMax > cMin ? (v - cMin) / (cMax - cMin) : 0.5);

  // Full cloud mapped to {x,y,c,fill} — reveal slices this progressively.
  const cloudData: Datum[] = useMemo(
    () => cloud.map((p) => ({ x: p[xO.metric], y: p[yO.metric], c: p[cO.metric], fill: colorOf(p[cO.metric]) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cloud, xO.metric, yO.metric, cO.metric, cMin, cMax]
  );

  // Fixed axis domains (4% pad) so the view doesn't jump as points appear.
  const domains = useMemo(() => {
    const xs = cloudData.map((d) => d.x), ys = cloudData.map((d) => d.y);
    xs.push(baseline[xO.metric]); ys.push(baseline[yO.metric]);
    const pad = (arr: number[]) => { const lo = Math.min(...arr), hi = Math.max(...arr); const p = (hi - lo) * 0.04 || hi * 0.04 || 1; return [lo - p, hi + p] as [number, number]; };
    return { x: pad(xs), y: pad(ys) };
  }, [cloudData, baseline, xO.metric, yO.metric]);

  /* ── Animation ── */
  const total = cloudData.length;
  const batch = Math.max(1, Math.ceil(total / 45));
  const [revealed, setRevealed] = useState(total);
  const [playing, setPlaying] = useState(false);
  /** Clicking a Pareto marker pins it here; the detail card below is a real,
   *  stationary target you can click — unlike the hover tooltip. */
  const [pinned, setPinned] = useState<OptimizePoint | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // New results → play the reveal from the start.
  useEffect(() => {
    if (total === 0) { setRevealed(0); return; }
    setRevealed(Math.min(batch, total));
    setPlaying(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  useEffect(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (!playing) return;
    timer.current = setInterval(() => {
      setRevealed((r) => {
        const next = r + batch;
        if (next >= total) { setPlaying(false); return total; }
        return next;
      });
    }, 200);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, total, batch]);

  const shown = cloudData.slice(0, revealed);
  const frontier = useMemo(() => pareto2D(shown), [shown]);

  // The 3-objective optimal packages, as clickable overlay markers. Only shown
  // once the reveal is far enough that they've "appeared".
  const optimalData: OptDatum[] = useMemo(
    () => pareto.map((p) => ({
      x: p[xO.metric], y: p[yO.metric], c: p[cO.metric], fill: colorOf(p[cO.metric]),
      point: p, validated: validatedKeys.has(pointKey(p)),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pareto, xO.metric, yO.metric, cO.metric, validatedKeys, cMin, cMax]
  );
  const showOptimal = revealed >= total;

  const baselineDatum = [{ x: baseline[xO.metric], y: baseline[yO.metric] }];

  const CloudDot = (props: { cx?: number; cy?: number; payload?: Datum }) =>
    props.cx != null && props.cy != null
      ? <circle cx={props.cx} cy={props.cy} r={3.1} fill={props.payload?.fill ?? "#888"} fillOpacity={0.6} />
      : null;
  const FrontierDot = (props: { cx?: number; cy?: number }) =>
    props.cx != null && props.cy != null
      ? <circle cx={props.cx} cy={props.cy} r={3.5} fill="#0d1117" stroke="#B98BE8" strokeWidth={2} />
      : null;
  const OptimalDot = (props: { cx?: number; cy?: number; payload?: OptDatum }) => {
    if (props.cx == null || props.cy == null) return null;
    const v = props.payload?.validated;
    return <circle cx={props.cx} cy={props.cy} r={7} fill={v ? "rgba(150,215,76,0.9)" : "rgba(78,205,196,0.18)"}
      stroke={v ? "#96D74C" : "#4ECDC4"} strokeWidth={2.2} style={{ cursor: "pointer" }} />;
  };
  const BaselineDot = (props: { cx?: number; cy?: number }) =>
    props.cx != null && props.cy != null
      ? <path d={`M ${props.cx} ${props.cy - 6} L ${props.cx + 6} ${props.cy} L ${props.cx} ${props.cy + 6} L ${props.cx - 6} ${props.cy} Z`}
          fill="rgba(255,255,255,0.85)" stroke="#0d1117" strokeWidth={1} />
      : null;

  const TooltipContent = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: Datum & Partial<OptDatum> }> }) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0]!.payload;
    const isOpt = "point" in d && d.point;
    return (
      <div style={{ background: "#0d1117", border: `1px solid ${white(0.15)}`, borderRadius: 8, padding: "8px 11px", fontSize: 11.5 }}>
        {isOpt && <div style={{ color: "#4ECDC4", fontWeight: 800, marginBottom: 4 }}>Pareto-optimal package</div>}
        <div style={{ color: "#fff" }}>{xO.short}: <b>{fmt(d.x, xO)}</b></div>
        <div style={{ color: "#fff" }}>{yO.short}: <b>{fmt(d.y, yO)}</b></div>
        <div style={{ color: white(0.7) }}>{cO.short}: {fmt(d.c, cO)}</div>
        {isOpt && (d as OptDatum).point && (
          <div style={{ marginTop: 5, color: white(0.55), maxWidth: 220 }}>
            {Object.entries((d as OptDatum).point.selection_labels).filter(([, v]) => v !== "Keep as-built").map(([k, v]) => (
              <div key={k}>{k.replace("VertExt::", "")}: {v}</div>
            ))}
            <div style={{ color: "#4ECDC4", marginTop: 3 }}>
              {(d as OptDatum).validated ? "✓ validated in EPSM" : "click to pin this package"}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (total === 0) return null;

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
        <button
          onClick={() => (revealed >= total ? (setRevealed(Math.min(batch, total)), setPlaying(true)) : setPlaying((p) => !p))}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 8, cursor: "pointer",
            fontSize: 11.5, fontWeight: 700, background: "rgba(185,139,232,0.16)", border: "1px solid rgba(185,139,232,0.5)", color: "#D9C3F2",
          }}
        >
          {playing ? <Pause size={12} /> : <Play size={12} />}{playing ? "Pause" : revealed >= total ? "Replay" : "Play"}
        </button>
        <span style={{ fontSize: 11.5, color: white(0.55) }}>
          <b style={{ color: "#fff" }}>{Math.min(revealed, total).toLocaleString()}</b> of {total.toLocaleString()} packages plotted
          {evaluated > total ? ` (sampled from ${evaluated.toLocaleString()})` : ""}
          {" · "}<span style={{ color: "#B98BE8" }}>{frontier.length} on the {xO.short.toLowerCase()}–{yO.short.toLowerCase()} frontier</span>
        </span>
      </div>

      {/* scrubber */}
      <input
        type="range" min={0} max={total} step={batch} value={Math.min(revealed, total)}
        onChange={(e) => { setPlaying(false); setRevealed(Math.min(total, Number(e.target.value))); }}
        style={{ width: "100%", accentColor: "#B98BE8", marginBottom: 6 }}
      />

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1, height: 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, bottom: 30, left: 12 }}>
              <CartesianGrid stroke={white(0.06)} />
              <XAxis
                type="number" dataKey="x" domain={domains.x} allowDataOverflow
                tick={{ fill: white(0.45), fontSize: 10 }} tickFormatter={(v) => tick(v, xO)}
                label={{ value: `${xO.label}${xO.unit ? ` (${xO.unit})` : xO.money ? ` (${currency})` : ""}`, position: "bottom", offset: 12, fill: white(0.55), fontSize: 11 }}
              />
              <YAxis
                type="number" dataKey="y" domain={domains.y} allowDataOverflow
                tick={{ fill: white(0.45), fontSize: 10 }} tickFormatter={(v) => tick(v, yO)} width={54}
                label={{ value: `${yO.short}${yO.unit ? ` (${yO.unit})` : ""}`, angle: -90, position: "insideLeft", fill: white(0.55), fontSize: 11 }}
              />
              <Tooltip content={<TooltipContent />} cursor={{ stroke: white(0.2) }} />
              <Scatter data={shown} shape={<CloudDot />} isAnimationActive={false} />
              <Scatter data={frontier} line={{ stroke: "#B98BE8", strokeWidth: 2.5 }} lineJointType="linear" shape={<FrontierDot />} isAnimationActive={false} legendType="none" />
              <Scatter data={baselineDatum} shape={<BaselineDot />} isAnimationActive={false} />
              {showOptimal && (
                <Scatter data={optimalData} shape={<OptimalDot />} isAnimationActive={false}
                  style={{ cursor: "pointer" }}
                  // Recharts hands back the datum wrapped in a props object on some
                  // versions and bare on others — read both, or the click silently
                  // does nothing (which is what the tooltip was inviting you to do).
                  onClick={(d: unknown) => {
                    const o = d as { point?: OptimizePoint; payload?: { point?: OptimizePoint } } | undefined;
                    const p = o?.point ?? o?.payload?.point;
                    // PIN the selection instead of acting on it directly. The
                    // hover tooltip disappears the moment the mouse moves, so a
                    // "click to validate" living inside it was unusable.
                    if (p) setPinned(p);
                  }} />
              )}
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* colour bar (3rd objective) + legend */}
        <div style={{ width: 70, display: "flex", flexDirection: "column", alignItems: "center", paddingBottom: 30, paddingTop: 8 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: white(0.5), textAlign: "center", marginBottom: 4 }}>{cO.short}</div>
          <div style={{ fontSize: 9, color: white(0.4) }}>{tick(cMax, cO)}</div>
          <div style={{ width: 12, flex: 1, borderRadius: 4, margin: "3px 0",
            background: `linear-gradient(to top, ${viridis(0)}, ${viridis(0.25)}, ${viridis(0.5)}, ${viridis(0.75)}, ${viridis(1)})` }} />
          <div style={{ fontSize: 9, color: white(0.4) }}>{tick(cMin, cO)}</div>
          <div style={{ fontSize: 8.5, color: white(0.35), marginTop: 2 }}>{cO.unit}</div>
        </div>
      </div>

      {/* Pinned package — a stationary target, unlike the hover tooltip */}
      {pinned && (() => {
        const isVal = validatedKeys.has(pointKey(pinned));
        const touched = Object.entries(pinned.selection_labels).filter(([, v]) => v !== "Keep as-built");
        return (
          <div style={{ marginTop: 8, padding: "11px 14px", borderRadius: 10,
            background: "rgba(78,205,196,0.08)", border: "1px solid rgba(78,205,196,0.35)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#4ECDC4", marginBottom: 4 }}>Selected package</div>
                {touched.length === 0
                  ? <div style={{ fontSize: 11.5, color: white(0.5), fontStyle: "italic" }}>Keep everything as-built</div>
                  : touched.map(([k, v]) => (
                      <div key={k} style={{ fontSize: 11.5, color: white(0.8) }}>
                        <span style={{ color: white(0.45) }}>{k.replace("VertExt::", "")}:</span> {v}
                      </div>
                    ))}
                <div style={{ fontSize: 11, color: white(0.55), marginTop: 5 }}>
                  {fmt(pinned[OBJECTIVES.energy.metric], OBJECTIVES.energy)}
                  {" · "}{fmt(pinned[OBJECTIVES.cost.metric], OBJECTIVES.cost)}
                  {" · "}{fmt(pinned[OBJECTIVES.carbon.metric], OBJECTIVES.carbon)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={() => onValidate(pinned)}
                  disabled={isVal}
                  style={{ padding: "8px 15px", borderRadius: 9, fontSize: 12, fontWeight: 800,
                    cursor: isVal ? "default" : "pointer",
                    border: `1px solid ${isVal ? "rgba(150,215,76,0.5)" : "rgba(78,205,196,0.55)"}`,
                    background: isVal ? "rgba(150,215,76,0.14)" : "rgba(78,205,196,0.18)",
                    color: isVal ? "#96D74C" : "#4ECDC4" }}>
                  {isVal ? "✓ Running in EPSM" : "Run this pick in EPSM →"}
                </button>
                <button onClick={() => setPinned(null)}
                  style={{ background: "transparent", border: 0, cursor: "pointer", color: white(0.4), fontSize: 16, lineHeight: 1 }}
                  title="Clear selection">×</button>
              </div>
            </div>
          </div>
        );
      })()}

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 10.5, color: white(0.5), marginTop: 2, paddingLeft: 8 }}>
        <span><span style={{ color: "#B98BE8" }}>—●</span> {xO.short}/{yO.short} frontier</span>
        <span><span style={{ color: "#4ECDC4" }}>◯</span> optimal package (click to select)</span>
        <span><span style={{ color: "#96D74C" }}>●</span> validated in EPSM</span>
        <span><span style={{ color: "#fff" }}>◆</span> baseline</span>
      </div>
    </div>
  );
}
