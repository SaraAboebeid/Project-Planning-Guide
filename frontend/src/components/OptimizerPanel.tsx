import { useState, useEffect, useRef } from "react";
import { api, type OptimizeComponentInput, type OptimizeParams, type OptimizePoint, type OptimizeResponse } from "../api/client";
import { Loader2, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import ParetoChart, { axesFromKpis, OBJECTIVES } from "./ParetoChart";
import ParallelCoordinates from "./ParallelCoordinates";

/* The "pick the Pareto-optimal packages" step of the hybrid optimizer.
 * RenovationSimulator gathers the option matrix + economy/climate params from
 * the already-resolved geometry, cost, carbon and EPSM baseline; this panel
 * runs /api/optimize (fast degree-day physics over every combination), shows
 * the Pareto front, and hands each chosen winner back to be validated in EPSM. */

type SortKey = "energy_kwh_m2_yr" | "total_cost" | "total_carbon";

const TAG_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  "cheapest":       { bg: "rgba(47,180,119,0.16)",  fg: "#2FB477", label: "Cheapest" },
  "lowest-carbon":  { bg: "rgba(78,205,196,0.16)",  fg: "#4ECDC4", label: "Lowest carbon" },
  "lowest-energy":  { bg: "rgba(74,144,226,0.16)",  fg: "#4A90E2", label: "Lowest energy" },
};

export default function OptimizerPanel({
  input, onValidate, disabledReason, currency, validatedKeys, selectedKpis,
}: {
  input: { components: OptimizeComponentInput[]; params: OptimizeParams } | null;
  onValidate: (point: OptimizePoint, opts?: { auto?: boolean }) => void;
  disabledReason?: string;
  currency: "SEK" | "GBP";
  validatedKeys: Set<string>;
  selectedKpis: string[];
}) {
  const axes = axesFromKpis(selectedKpis);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizeResponse | null>(null);
  const [sort, setSort] = useState<SortKey>("energy_kwh_m2_yr");

  const white = (o: number) => `rgba(255,255,255,${o})`;
  const fmtMoney = (n: number) =>
    (currency === "SEK"
      ? n.toLocaleString("sv-SE", { maximumFractionDigits: 0 }) + " SEK"
      : "£" + n.toLocaleString("en-GB", { maximumFractionDigits: 0 }));

  const canRun = !!input && input.components.length > 0 && !disabledReason;

  async function run() {
    if (!input) return;
    setLoading(true); setError(null);
    try {
      const res = await api.optimize({ ...input, max_results: 24 });
      setResult(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Live: recompute the trade-off curve whenever the picked materials / building
  // change — no manual "optimize" click. The search is the fast degree-day
  // physics (no EnergyPlus), so it's cheap to re-run on every selection change;
  // debounced so rapid ticking doesn't fire a request per keystroke.
  useEffect(() => {
    if (!canRun) { setResult(null); return; }
    const t = setTimeout(() => { run(); }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const pareto = result ? [...result.pareto].sort((a, b) => a[sort] - b[sort]) : [];
  // "Show all" reveals every evaluated package (not just the Pareto-optimal front)
  // when the run is small enough that the backend returned them all.
  const [showAll, setShowAll] = useState(false);
  const [showParallel, setShowParallel] = useState(false);  // parallel-coordinates is opt-in (advanced)
  const [maximized, setMaximized] = useState(false);         // Pareto fullscreen overlay
  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMaximized(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maximized]);
  const canShowAll = !!result && (result.all_points?.length ?? 0) > result.pareto.length;
  const shown = (showAll && result?.all_points?.length ? [...result.all_points] : (result?.pareto ?? []))
    .sort((a, b) => a[sort] - b[sort]);
  const pcPoints = showAll && result?.all_points?.length ? result.all_points : (result?.pareto ?? []);
  const baseEnergy = result?.baseline.energy_kwh_m2_yr ?? null;
  // Match RenovationSimulator's validatedKeys: touched components only (a
  // "__keep__" pick isn't part of the package that gets submitted to EPSM).
  const pointKey = (pt: OptimizePoint) =>
    Object.entries(pt.selections).filter(([, v]) => v !== "__keep__").sort().map(([k, v]) => `${k}=${v}`).join("|");

  // Auto-run the lowest-energy Pareto pick in EPSM once the curve settles, so the
  // Results table and the Step-5 report fill in WITHOUT any manual click. Debounced
  // and de-duped by point key so it fires once per settled best pick; the page
  // replaces the previous auto-package, so exploring never piles up runs.
  const lastAutoKey = useRef<string | null>(null);
  useEffect(() => {
    if (!result || result.pareto.length === 0) return;
    const best = [...result.pareto].sort((a, b) => a.energy_kwh_m2_yr - b.energy_kwh_m2_yr)[0];
    if (!best) return;
    const key = pointKey(best);
    if (key === "" || lastAutoKey.current === key || validatedKeys.has(key)) return;
    const t = setTimeout(() => {
      lastAutoKey.current = key;
      onValidate(best, { auto: true });
    }, 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, validatedKeys]);

  return (
    <div style={{ borderRadius: 14, background: "rgba(var(--brand-rgb),0.06)", border: "1px solid rgba(var(--brand-rgb),0.28)", overflow: "hidden" }}>
      {/* No "optimize" button — the curve recomputes live as materials are
          picked (see the effect above). The header just shows status. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px" }}>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            display: "flex", alignItems: "center", gap: 10, textAlign: "left", flex: 1,
            cursor: "pointer", background: "transparent", border: "none", padding: 0,
          }}
        >
          <Sparkles size={16} color="#B98BE8" />
          <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Optimization · Pareto curve — updates live as you pick materials</span>
          {loading && <Loader2 size={13} color="#B98BE8" style={{ animation: "spin 1s linear infinite" }} />}
          {result && !loading && (
            <span style={{ fontSize: 11, color: white(0.45) }}>
              {result.pareto_count} optimal of {result.combinations_total.toLocaleString()}
            </span>
          )}
        </button>

        <button onClick={() => setOpen((o) => !o)}
          style={{ background: "transparent", border: 0, cursor: "pointer", color: white(0.4), padding: 0, flexShrink: 0 }}
          title={open ? "Collapse" : "Expand"}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>
      {disabledReason && !open && (
        <div style={{ fontSize: 11, color: "#E8880C", padding: "0 18px 12px" }}>{disabledReason}</div>
      )}

      {open && (
        <div style={{ padding: "0 18px 18px" }}>
          <p style={{ fontSize: 12, color: white(0.5), margin: "0 0 12px", lineHeight: 1.6 }}>
            As you pick materials, this scores <b>every combination</b> of your picks on the fast degree-day
            physics (no EnergyPlus) and plots the <b>Pareto-optimal</b> set live — the packages where you can't
            improve one objective without sacrificing another. The best pick <b>runs automatically</b> in
            EnergyPlus (EPSM) so the Results table and the report fill in on their own — or pin any other
            point on the chart to run that one too. Model after Enerbäck &amp; Strömberg.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            {disabledReason && <span style={{ fontSize: 11.5, color: "#E8880C" }}>{disabledReason}</span>}
            {result && (
              <span style={{ fontSize: 11.5, color: white(0.45) }}>
                {result.combinations_total.toLocaleString()} combinations evaluated · {result.pareto_count} Pareto-optimal
                {result.truncated && " · search truncated (too many combinations — narrow the material list)"}
              </span>
            )}
          </div>

          {error && (
            <div style={{ fontSize: 12, color: "#E2483B", marginBottom: 10 }}>Optimization failed: {error}</div>
          )}

          {/* Empty / computing states so the panel isn't blank before any pick */}
          {!result && !error && !disabledReason && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: white(0.4), padding: "8px 0" }}>
              {loading
                ? (<><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Computing trade-off curve…</>)
                : "Pick one or more materials per component in the builder above — the curve appears here and updates as you go."}
            </div>
          )}

          {result && pareto.length > 0 && (
            <>
              {/* The 2-D Pareto frontier (cost×GWP, colour = energy) is the primary,
                  full-width view; the parallel-coordinates plot is an opt-in advanced
                  toggle, and the Pareto can be maximised to a fullscreen overlay. */}
              <div style={{ marginBottom: 6, fontSize: 11, color: white(0.45) }}>
                Axes from your Step-1 KPIs: <b style={{ color: "#fff" }}>{OBJECTIVES[axes.x].label}</b> ×{" "}
                <b style={{ color: "#fff" }}>{OBJECTIVES[axes.y].label}</b>, coloured by <b style={{ color: "#fff" }}>{OBJECTIVES[axes.color].label}</b>.
              </div>
              {/* Pareto frontier — full width. Parallel coordinates is an opt-in
                  advanced view (toggle); the Pareto can be maximised to fullscreen. */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: white(0.4), textTransform: "uppercase" }}>
                    Pareto frontier
                  </div>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 7 }}>
                    <button onClick={() => setShowParallel(v => !v)}
                      style={{ fontSize: 10.5, fontWeight: 700, padding: "4px 10px", borderRadius: 8, cursor: "pointer",
                        border: `1px solid ${showParallel ? "var(--brand-deep)" : "rgba(255,255,255,0.14)"}`,
                        background: showParallel ? "var(--brand-deep)" : "transparent", color: showParallel ? "#fff" : white(0.6) }}>
                      {showParallel ? "Hide parallel view" : "＋ Parallel view"}
                    </button>
                    <button onClick={() => setMaximized(true)} title="Maximise the chart"
                      style={{ fontSize: 10.5, fontWeight: 700, padding: "4px 10px", borderRadius: 8, cursor: "pointer",
                        border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: white(0.6) }}>
                      ⤢ Maximise
                    </button>
                  </div>
                </div>
                <ParetoChart
                  cloud={result.cloud} pareto={result.pareto} baseline={result.baseline}
                  axes={axes} currency={currency} evaluated={result.unique_points}
                  onValidate={onValidate} validatedKeys={validatedKeys} pointKey={pointKey}
                  height={420}
                />
              </div>

              {/* Parallel coordinates — opt-in advanced view */}
              {showParallel && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: white(0.4), textTransform: "uppercase", marginBottom: 4 }}>
                    Parallel coordinates · materials → KPIs
                  </div>
                  <div style={{ fontSize: 10.5, color: white(0.4), marginBottom: 8, lineHeight: 1.5, maxWidth: 720 }}>
                    Each package is one line crossing every axis — the material choices and all three KPIs at once. Drag along an axis to filter. An advanced view for spotting patterns the 2-D Pareto can&apos;t show.
                  </div>
                  <ParallelCoordinates
                    pareto={pcPoints} currency={currency} colorBy={axes.color}
                    onValidate={onValidate} validatedKeys={validatedKeys} pointKey={pointKey}
                  />
                </div>
              )}

              {/* Fullscreen Pareto overlay */}
              {maximized && (
                <div onClick={() => setMaximized(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(5,7,12,0.9)", display: "flex", flexDirection: "column", padding: 20 }}>
                  <div onClick={e => e.stopPropagation()}
                    style={{ background: "#0d1117", border: "1px solid rgba(var(--brand-rgb),0.4)", borderRadius: 14, padding: "16px 20px", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>Pareto frontier</span>
                      <span style={{ fontSize: 11, color: white(0.45) }}>
                        {OBJECTIVES[axes.x].label} × {OBJECTIVES[axes.y].label}, coloured by {OBJECTIVES[axes.color].label}
                      </span>
                      <button onClick={() => setMaximized(false)}
                        style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 8, cursor: "pointer",
                          border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.05)", color: "#fff" }}>
                        ✕ Minimise
                      </button>
                    </div>
                    <div style={{ flex: 1, minHeight: 0 }}>
                      <ParetoChart
                        cloud={result.cloud} pareto={result.pareto} baseline={result.baseline}
                        axes={axes} currency={currency} evaluated={result.unique_points}
                        onValidate={onValidate} validatedKeys={validatedKeys} pointKey={pointKey}
                        height={Math.max(360, (typeof window !== "undefined" ? window.innerHeight : 800) - 200)}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, marginTop: 16, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: white(0.4) }}>Sort by:</span>
                {/* "Cost" here is life-cycle, unlike the capex-only Cost in 4.3 —
                    the two answer different questions and can rank differently. */}
                {([["energy_kwh_m2_yr", "Energy"], ["total_cost", "Cost"], ["total_carbon", "Carbon"]] as const).map(([k, lbl]) => (
                  <button key={k} onClick={() => setSort(k)} style={{
                    fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 8, cursor: "pointer",
                    border: `1px solid ${sort === k ? "var(--brand-deep)" : "rgba(255,255,255,0.12)"}`,
                    background: sort === k ? "var(--brand-deep)" : "transparent",
                    color: sort === k ? "#fff" : white(0.55),
                  }}>{lbl}</button>
                ))}
                {canShowAll && (
                  <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: white(0.4) }}>Show:</span>
                    {([[false, `Pareto-optimal (${result.pareto.length})`], [true, `All packages (${result.all_points!.length})`]] as const).map(([v, lbl]) => (
                      <button key={String(v)} onClick={() => setShowAll(v)} style={{
                        fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 8, cursor: "pointer",
                        border: `1px solid ${showAll === v ? "#4ECDC4" : "rgba(255,255,255,0.12)"}`,
                        background: showAll === v ? "#4ECDC4" : "transparent",
                        color: showAll === v ? "#0b1220" : white(0.55),
                      }}>{lbl}</button>
                    ))}
                  </span>
                )}
              </div>
              {showAll && canShowAll && (
                <div style={{ fontSize: 10.5, color: white(0.35), marginBottom: 8 }}>
                  Showing every evaluated package. Rows without a <span style={{ color: "#4ECDC4" }}>tag</span> are
                  <b> dominated</b> — another package is better on cost, carbon <i>and</i> energy at once, so it's never the smart pick.
                </div>
              )}

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: white(0.45), textAlign: "left" }}>
                      <th style={{ padding: "6px 8px", fontWeight: 600 }}>Package (selected options)</th>
                      <th style={{ padding: "6px 8px", fontWeight: 600, whiteSpace: "nowrap" }}>Energy</th>
                      <th style={{ padding: "6px 8px", fontWeight: 600, whiteSpace: "nowrap" }}
                          title="Life-cycle cost = installed capex + discounted energy over the study period (op_cost = demand x energy price x annuity factor). NOT the same as the capex-only Cost column in the results table below.">Cost (life-cycle)</th>
                      <th style={{ padding: "6px 8px", fontWeight: 600, whiteSpace: "nowrap" }}>Carbon (life-cycle)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* baseline reference row */}
                    <tr style={{ borderTop: `1px solid ${white(0.08)}`, color: white(0.55) }}>
                      <td style={{ padding: "8px", fontStyle: "italic" }}>Baseline (as-built)</td>
                      <td style={{ padding: "8px", whiteSpace: "nowrap" }}>{result.baseline.energy_kwh_m2_yr} kWh/m²/yr</td>
                      <td style={{ padding: "8px", whiteSpace: "nowrap" }}>{fmtMoney(result.baseline.total_cost)}</td>
                      <td style={{ padding: "8px", whiteSpace: "nowrap" }}>{Math.round(result.baseline.total_carbon).toLocaleString()} kg</td>
                      <td />
                    </tr>
                    {shown.map((pt, i) => {
                      const deltaPct = baseEnergy ? Math.round(((baseEnergy - pt.energy_kwh_m2_yr) / baseEnergy) * 100) : null;
                      const touched = Object.entries(pt.selection_labels).filter(([, v]) => v !== "Keep as-built");
                      return (
                        <tr key={i} style={{ borderTop: `1px solid ${white(0.06)}` }}>
                          <td style={{ padding: "8px", color: "#fff" }}>
                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: touched.length ? 4 : 0 }}>
                              {(pt.tags ?? []).map((t) => {
                                const s = TAG_STYLE[t];
                                return s ? (
                                  <span key={t} style={{ fontSize: 9.5, fontWeight: 800, padding: "1px 7px", borderRadius: 99, background: s.bg, color: s.fg }}>{s.label}</span>
                                ) : null;
                              })}
                            </div>
                            {touched.length === 0 ? (
                              <span style={{ color: white(0.4), fontStyle: "italic" }}>Keep everything as-built</span>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                {touched.map(([k, v]) => (
                                  <div key={k} style={{ fontSize: 11 }}>
                                    <span style={{ color: white(0.45) }}>{k.replace("VertExt::", "")}:</span>{" "}
                                    <span style={{ color: white(0.85) }}>{v}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                            <div style={{ color: "#fff", fontWeight: 700 }}>{pt.energy_kwh_m2_yr} kWh/m²/yr</div>
                            {deltaPct != null && deltaPct > 0 && (
                              <div style={{ fontSize: 10.5, color: "#2FB477" }}>−{deltaPct}% vs baseline</div>
                            )}
                          </td>
                          <td style={{ padding: "8px", whiteSpace: "nowrap", color: white(0.8) }}>{fmtMoney(pt.total_cost)}</td>
                          <td style={{ padding: "8px", whiteSpace: "nowrap", color: white(0.8) }}>{Math.round(pt.total_carbon).toLocaleString()} kg</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </>
          )}
        </div>
      )}
    </div>
  );
}
