import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { OptimizePoint } from "../api/client";
import { OBJECTIVES, type ObjKey } from "./ParetoChart";

/* Parallel-coordinates view of the optimiser's Pareto set. Each package is one
 * line threading through its chosen material per component (categorical axes),
 * then landing on Energy / GWP / Cost (numeric axes). Complements the 2-D Pareto
 * scatter by showing every dimension at once — and which material combinations
 * produce each trade-off. Interactive: hover to highlight, drag on a numeric axis
 * to filter, click a line to validate that package in EPSM. */

const VIRIDIS: [number, number, number][] = [
  [68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37],
];
function viridis(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (VIRIDIS.length - 1);
  const i = Math.floor(x), f = x - i;
  const a = VIRIDIS[i]!, b = VIRIDIS[Math.min(VIRIDIS.length - 1, i + 1)]!;
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}

type NumAxis = { kind: "num"; key: ObjKey; title: string };
type CatAxis = { kind: "cat"; key: string; title: string; values: string[] };
type Axis = NumAxis | CatAxis;

const metricOf = (pt: OptimizePoint, k: ObjKey): number =>
  k === "energy" ? pt.energy_kwh_m2_yr : k === "carbon" ? pt.total_carbon : pt.total_cost;

export default function ParallelCoordinates({
  pareto, currency, colorBy = "energy", onValidate, validatedKeys, pointKey,
}: {
  pareto: OptimizePoint[];
  currency: "SEK" | "GBP";
  colorBy?: ObjKey;
  onValidate?: (pt: OptimizePoint) => void;
  validatedKeys?: Set<string>;
  pointKey?: (pt: OptimizePoint) => string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(560);
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const [hover, setHover] = useState<number | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  // Per-numeric-axis brush as a [min,max] value range (null = no filter).
  const [brush, setBrush] = useState<Partial<Record<ObjKey, [number, number]>>>({});
  const drag = useRef<{ key: ObjKey; y0: number } | null>(null);

  // Build the axes: categorical component axes (only those that actually vary),
  // then the three numeric objective axes in the classic order.
  const axes = useMemo<Axis[]>(() => {
    if (!pareto.length) return [];
    const compKeys: string[] = [];
    for (const k of Object.keys(pareto[0]!.selection_labels)) compKeys.push(k);
    const cats: CatAxis[] = compKeys.map((key) => {
      const seen = new Set<string>();
      for (const p of pareto) seen.add(p.selection_labels[key] ?? "Keep as-built");
      return { kind: "cat" as const, key, title: key, values: [...seen].sort() };
    }).filter((a) => a.values.length >= 2); // drop axes where nothing varies
    const nums: NumAxis[] = (["energy", "carbon", "cost"] as ObjKey[])
      .map((key) => ({ kind: "num" as const, key, title: OBJECTIVES[key].short }));
    return [...cats, ...nums];
  }, [pareto]);

  // Value ranges for the numeric axes.
  const ranges = useMemo(() => {
    const r: Partial<Record<ObjKey, [number, number]>> = {};
    for (const a of axes) if (a.kind === "num") {
      const vals = pareto.map((p) => metricOf(p, a.key));
      r[a.key] = [Math.min(...vals), Math.max(...vals)];
    }
    return r;
  }, [axes, pareto]);

  if (!pareto.length || axes.length < 2) {
    return <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", padding: "20px 0", textAlign: "center" }}>
      Not enough variation across packages to plot.
    </div>;
  }

  // Geometry. Guarantee a minimum per-axis spacing so labels stay readable;
  // the wrapper scrolls horizontally when there are many axes.
  const marginL = 8, marginR = 8, top = 26, bottom = 46;
  const minGap = 108;
  const innerMin = (axes.length - 1) * minGap;
  const svgW = Math.max(w, marginL + marginR + innerMin);
  const H = 300;
  const plotTop = top, plotBot = H - bottom, plotH = plotBot - plotTop;
  const xOf = (i: number) => marginL + (axes.length === 1 ? 0 : (i / (axes.length - 1)) * (svgW - marginL - marginR));

  const catY = (ax: CatAxis, v: string) => {
    const idx = Math.max(0, ax.values.indexOf(v));
    return ax.values.length <= 1 ? plotTop + plotH / 2 : plotTop + (idx / (ax.values.length - 1)) * plotH;
  };
  const numY = (key: ObjKey, val: number) => {
    const [lo, hi] = ranges[key] ?? [0, 1];
    return hi <= lo ? plotTop + plotH / 2 : plotTop + ((hi - val) / (hi - lo)) * plotH; // top = max
  };
  const yToVal = (key: ObjKey, y: number) => {
    const [lo, hi] = ranges[key] ?? [0, 1];
    const t = (plotBot - y) / plotH; // bottom=0 → lo, top=1 → hi
    return lo + t * (hi - lo);
  };

  const fmt = (key: ObjKey, v: number) =>
    key === "cost"
      ? (currency === "SEK" ? `${(v / 1e6).toFixed(2)}M` : `£${(v / 1e6).toFixed(2)}M`)
      : key === "carbon" ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;

  const passes = (pt: OptimizePoint) =>
    (Object.entries(brush) as [ObjKey, [number, number]][]).every(([k, rng]) =>
      !rng || (metricOf(pt, k) >= rng[0] && metricOf(pt, k) <= rng[1]));

  const colorRange = ranges[colorBy] ?? [0, 1];
  const colorOf = (pt: OptimizePoint) => {
    const [lo, hi] = colorRange;
    return viridis(hi > lo ? (metricOf(pt, colorBy) - lo) / (hi - lo) : 0.5);
  };
  const pathOf = (pt: OptimizePoint) =>
    axes.map((ax, i) => {
      const x = xOf(i);
      const y = ax.kind === "cat" ? catY(ax, pt.selection_labels[ax.key] ?? "Keep as-built") : numY(ax.key, metricOf(pt, ax.key));
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");

  // Brush drag on a numeric axis.
  const axisIdx = (key: ObjKey) => axes.findIndex((a) => a.kind === "num" && a.key === key);
  const onAxisDown = (key: ObjKey, e: RPointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const scale = H / rect.height;
    drag.current = { key, y0: (e.clientY - rect.top) * scale };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onAxisMove = (e: RPointerEvent<SVGRectElement>) => {
    if (!drag.current) return;
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const scale = H / rect.height;
    const y1 = Math.max(plotTop, Math.min(plotBot, (e.clientY - rect.top) * scale));
    const a = yToVal(drag.current.key, Math.min(drag.current.y0, y1));
    const b = yToVal(drag.current.key, Math.max(drag.current.y0, y1));
    setBrush((prev) => ({ ...prev, [drag.current!.key]: [Math.min(a, b), Math.max(a, b)] as [number, number] }));
  };
  const onAxisUp = (key: ObjKey) => {
    const r = brush[key];
    if (r && Math.abs(numY(key, r[0]) - numY(key, r[1])) < 4) setBrush((p) => ({ ...p, [key]: undefined }));
    drag.current = null;
  };

  const anyBrush = Object.values(brush).some(Boolean);

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <div style={{ overflowX: "auto" }}>
        <svg width={svgW} height={H} viewBox={`0 0 ${svgW} ${H}`} style={{ display: "block", maxWidth: "100%", cursor: "crosshair" }}
          onMouseLeave={() => { setHover(null); setTip(null); }}>
          {/* axes */}
          {axes.map((ax, i) => {
            const x = xOf(i);
            const isNum = ax.kind === "num";
            return (
              <g key={ax.kind + ax.key}>
                <line x1={x} y1={plotTop} x2={x} y2={plotBot} stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
                <text x={x} y={plotTop - 12} fill="rgba(255,255,255,0.75)" fontSize={10} fontWeight={700} textAnchor="middle">
                  {isNum ? ax.title : ax.title.length > 16 ? ax.title.slice(0, 15) + "…" : ax.title}
                </text>
                {isNum && ranges[ax.key] && (
                  <>
                    <text x={x} y={plotTop - 1} fill="rgba(255,255,255,0.4)" fontSize={8.5} textAnchor="middle">{fmt(ax.key, ranges[ax.key]![1])}</text>
                    <text x={x} y={plotBot + 11} fill="rgba(255,255,255,0.4)" fontSize={8.5} textAnchor="middle">{fmt(ax.key, ranges[ax.key]![0])}</text>
                  </>
                )}
                {/* categorical tick labels */}
                {ax.kind === "cat" && ax.values.map((v) => (
                  <text key={v} x={x + (i === 0 ? 5 : i === axes.length - 1 ? -5 : 5)} y={catY(ax, v) + 3}
                    fill="rgba(255,255,255,0.4)" fontSize={8} textAnchor={i === axes.length - 1 ? "end" : "start"}>
                    {v.length > 15 ? v.slice(0, 14) + "…" : v}
                  </text>
                ))}
                {/* brush handle for numeric axes */}
                {isNum && (
                  <>
                    {brush[ax.key] && (
                      <rect x={x - 5} y={numY(ax.key, brush[ax.key]![1])} width={10}
                        height={Math.max(2, numY(ax.key, brush[ax.key]![0]) - numY(ax.key, brush[ax.key]![1]))}
                        fill="rgba(185,139,232,0.35)" stroke="#B98BE8" strokeWidth={1} rx={2} />
                    )}
                    <rect x={x - 7} y={plotTop} width={14} height={plotH} fill="transparent" style={{ cursor: "ns-resize" }}
                      onPointerDown={(e) => onAxisDown(ax.key, e)} onPointerMove={onAxisMove} onPointerUp={() => onAxisUp(ax.key)} />
                  </>
                )}
              </g>
            );
          })}

          {/* package lines */}
          {pareto.map((pt, idx) => {
            const ok = passes(pt);
            const isHover = hover === idx;
            const validated = validatedKeys && pointKey ? validatedKeys.has(pointKey(pt)) : false;
            const dim = anyBrush && !ok;
            return (
              <path key={idx} d={pathOf(pt)} fill="none"
                stroke={dim ? "rgba(255,255,255,0.05)" : colorOf(pt)}
                strokeWidth={isHover ? 3 : validated ? 2.4 : 1.4}
                strokeOpacity={dim ? 0.5 : isHover ? 1 : anyBrush ? 0.95 : 0.7}
                strokeDasharray={validated && !dim ? "1 0" : undefined}
                style={{ transition: "stroke-width .08s" }} />
            );
          })}

          {/* invisible hit-lines for hover / click (skip filtered-out ones) */}
          {pareto.map((pt, idx) => passes(pt) && (
            <path key={"h" + idx} d={pathOf(pt)} fill="none" stroke="transparent" strokeWidth={9}
              style={{ cursor: onValidate ? "pointer" : "default" }}
              onMouseEnter={() => setHover(idx)}
              onMouseMove={(e) => setTip({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
              onMouseLeave={() => { setHover(null); setTip(null); }}
              onClick={() => onValidate?.(pt)} />
          ))}
        </svg>
      </div>

      {/* hover tooltip */}
      {hover != null && tip && pareto[hover] && (
        <div style={{
          position: "absolute", left: Math.min(tip.x + 12, (wrapRef.current?.clientWidth ?? 400) - 200), top: tip.y + 8,
          pointerEvents: "none", zIndex: 5, maxWidth: 230,
          background: "rgba(13,17,23,0.97)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "8px 10px",
          fontSize: 10.5, color: "rgba(255,255,255,0.8)", boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 5, fontWeight: 700 }}>
            <span style={{ color: "#4A90E2" }}>{Math.round(pareto[hover]!.energy_kwh_m2_yr)} kWh/m²</span>
            <span style={{ color: "#4ECDC4" }}>{(pareto[hover]!.total_carbon / 1000).toFixed(1)}k kg</span>
            <span style={{ color: "#2FB477" }}>{fmt("cost", pareto[hover]!.total_cost)}</span>
          </div>
          {Object.entries(pareto[hover]!.selection_labels).filter(([, v]) => v !== "Keep as-built").map(([k, v]) => (
            <div key={k} style={{ color: "rgba(255,255,255,0.55)" }}><span style={{ color: "rgba(255,255,255,0.35)" }}>{k}:</span> {v}</div>
          ))}
        </div>
      )}

      {/* footer: filter hint / clear */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
        <span>Drag on Energy / GWP / Cost axes to filter · hover a line for details</span>
        {anyBrush && (
          <button onClick={() => setBrush({})} style={{
            marginLeft: "auto", fontSize: 10, color: "#B98BE8", background: "transparent",
            border: "1px solid rgba(185,139,232,0.4)", borderRadius: 6, padding: "1px 8px", cursor: "pointer",
          }}>Clear filters</button>
        )}
      </div>
    </div>
  );
}
