import { useState } from "react";
import { api, type OptimizeComponentInput, type OptimizeParams, type OptimizePoint, type OptimizeResponse } from "../api/client";
import { Loader2, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import ParetoChart, { axesFromKpis, OBJECTIVES } from "./ParetoChart";

/* The "pick the Pareto-optimal packages" step of the hybrid optimizer.
 * RenovationSimulator gathers the option matrix + economy/climate params from
 * the already-resolved geometry, cost, carbon and EPSM baseline; this panel
 * runs /api/optimize (fast degree-day physics over every combination), shows
 * the Pareto front, and hands each chosen winner back to be validated in EPSM. */

type SortKey = "energy_kwh_m2_yr" | "total_cost" | "total_carbon";

const TAG_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  "cheapest":       { bg: "rgba(150,215,76,0.16)",  fg: "#96D74C", label: "Cheapest" },
  "lowest-carbon":  { bg: "rgba(78,205,196,0.16)",  fg: "#4ECDC4", label: "Lowest carbon" },
  "lowest-energy":  { bg: "rgba(74,144,226,0.16)",  fg: "#4A90E2", label: "Lowest energy" },
};

export default function OptimizerPanel({
  input, onValidate, disabledReason, currency, validatedKeys, selectedKpis,
}: {
  input: { components: OptimizeComponentInput[]; params: OptimizeParams } | null;
  onValidate: (point: OptimizePoint) => void;
  disabledReason?: string;
  currency: "SEK" | "GBP";
  validatedKeys: Set<string>;
  selectedKpis: string[];
}) {
  const axes = axesFromKpis(selectedKpis);
  const [open, setOpen] = useState(false);
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

  const pareto = result ? [...result.pareto].sort((a, b) => a[sort] - b[sort]) : [];
  const baseEnergy = result?.baseline.energy_kwh_m2_yr ?? null;
  // Match RenovationSimulator's validatedKeys: touched components only (a
  // "__keep__" pick isn't part of the package that gets submitted to EPSM).
  const pointKey = (pt: OptimizePoint) =>
    Object.entries(pt.selections).filter(([, v]) => v !== "__keep__").sort().map(([k, v]) => `${k}=${v}`).join("|");

  return (
    <div style={{ borderRadius: 14, background: "rgba(114,28,184,0.06)", border: "1px solid rgba(114,28,184,0.28)", overflow: "hidden" }}>
      {/* The run action stays reachable whether or not the panel is expanded —
          it used to be hidden inside the collapsed body. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px" }}>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            display: "flex", alignItems: "center", gap: 10, textAlign: "left", flex: 1,
            cursor: "pointer", background: "transparent", border: "none", padding: 0,
          }}
        >
          <Sparkles size={16} color="#B98BE8" />
          <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Optimizer — best cost / carbon / energy trade-offs</span>
          {result && !open && (
            <span style={{ fontSize: 11, color: white(0.45) }}>
              {result.pareto_count} optimal of {result.combinations_total.toLocaleString()}
            </span>
          )}
        </button>

        <button
          onClick={() => { setOpen(true); run(); }}
          disabled={!canRun || loading}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 15px", borderRadius: 9,
            fontSize: 12, fontWeight: 800, flexShrink: 0,
            cursor: canRun && !loading ? "pointer" : "not-allowed",
            background: canRun ? "rgba(114,28,184,0.35)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${canRun ? "rgba(114,28,184,0.6)" : "rgba(255,255,255,0.1)"}`,
            color: canRun ? "#fff" : white(0.4),
          }}
        >
          {loading && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
          {result ? "Re-run" : "Run optimization"}
        </button>

        <button onClick={() => setOpen((o) => !o)}
          style={{ background: "transparent", border: 0, cursor: "pointer", color: white(0.4), padding: 0, flexShrink: 0 }}
          title={open ? "Collapse" : "Expand"}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>
      {disabledReason && !open && (
        <div style={{ fontSize: 11, color: "#F59E0B", padding: "0 18px 12px" }}>{disabledReason}</div>
      )}

      {open && (
        <div style={{ padding: "0 18px 18px" }}>
          <p style={{ fontSize: 12, color: white(0.5), margin: "0 0 12px", lineHeight: 1.6 }}>
            Searches <b>every material combination</b> across your components and scores each on the fast
            degree-day physics (no EnergyPlus), then returns the <b>Pareto-optimal</b> set — the packages where
            you can't improve one objective without sacrificing another. Pick any winner to validate its real
            energy in EPSM. Model after Enerbäck &amp; Strömberg.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            {disabledReason && <span style={{ fontSize: 11.5, color: "#F59E0B" }}>{disabledReason}</span>}
            {result && (
              <span style={{ fontSize: 11.5, color: white(0.45) }}>
                {result.combinations_total.toLocaleString()} combinations evaluated · {result.pareto_count} Pareto-optimal
                {result.truncated && " · search truncated (too many combinations — narrow the material list)"}
              </span>
            )}
          </div>

          {error && (
            <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 10 }}>Optimization failed: {error}</div>
          )}

          {result && pareto.length > 0 && (
            <>
              {/* Animated Pareto frontier — axes follow the KPIs picked in Step 1 */}
              <div style={{ marginBottom: 6, fontSize: 11, color: white(0.45) }}>
                Axes from your Step-1 KPIs: <b style={{ color: "#fff" }}>{OBJECTIVES[axes.x].label}</b> ×{" "}
                <b style={{ color: "#fff" }}>{OBJECTIVES[axes.y].label}</b>, coloured by <b style={{ color: "#fff" }}>{OBJECTIVES[axes.color].label}</b>.
              </div>
              <ParetoChart
                cloud={result.cloud}
                pareto={result.pareto}
                baseline={result.baseline}
                axes={axes}
                currency={currency}
                evaluated={result.unique_points}
                onValidate={onValidate}
                validatedKeys={validatedKeys}
                pointKey={pointKey}
              />

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, marginTop: 16 }}>
                <span style={{ fontSize: 11, color: white(0.4) }}>Sort by:</span>
                {([["energy_kwh_m2_yr", "Energy"], ["total_cost", "Cost"], ["total_carbon", "Carbon"]] as const).map(([k, lbl]) => (
                  <button key={k} onClick={() => setSort(k)} style={{
                    fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 8, cursor: "pointer",
                    border: `1px solid ${sort === k ? "rgba(185,139,232,0.6)" : "rgba(255,255,255,0.12)"}`,
                    background: sort === k ? "rgba(185,139,232,0.18)" : "transparent",
                    color: sort === k ? "#fff" : white(0.55),
                  }}>{lbl}</button>
                ))}
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: white(0.45), textAlign: "left" }}>
                      <th style={{ padding: "6px 8px", fontWeight: 600 }}>Package (selected options)</th>
                      <th style={{ padding: "6px 8px", fontWeight: 600, whiteSpace: "nowrap" }}>Energy</th>
                      <th style={{ padding: "6px 8px", fontWeight: 600, whiteSpace: "nowrap" }}>Cost (life-cycle)</th>
                      <th style={{ padding: "6px 8px", fontWeight: 600, whiteSpace: "nowrap" }}>Carbon (life-cycle)</th>
                      <th style={{ padding: "6px 8px", fontWeight: 600 }}></th>
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
                    {pareto.map((pt, i) => {
                      const key = pointKey(pt);
                      const validated = validatedKeys.has(key);
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
                              <div style={{ fontSize: 10.5, color: "#96D74C" }}>−{deltaPct}% vs baseline</div>
                            )}
                          </td>
                          <td style={{ padding: "8px", whiteSpace: "nowrap", color: white(0.8) }}>{fmtMoney(pt.total_cost)}</td>
                          <td style={{ padding: "8px", whiteSpace: "nowrap", color: white(0.8) }}>{Math.round(pt.total_carbon).toLocaleString()} kg</td>
                          <td style={{ padding: "8px" }}>
                            <button
                              onClick={() => onValidate(pt)}
                              disabled={validated}
                              style={{
                                fontSize: 11, fontWeight: 700, padding: "5px 11px", borderRadius: 8, whiteSpace: "nowrap",
                                cursor: validated ? "default" : "pointer",
                                border: `1px solid ${validated ? "rgba(150,215,76,0.5)" : "rgba(78,205,196,0.5)"}`,
                                background: validated ? "rgba(150,215,76,0.12)" : "rgba(78,205,196,0.12)",
                                color: validated ? "#96D74C" : "#4ECDC4",
                              }}
                            >
                              {validated ? "✓ In EPSM" : "Validate in EPSM →"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p style={{ fontSize: 10.5, color: white(0.35), marginTop: 10, lineHeight: 1.6 }}>
                Energy, cost and carbon here are the fast analytic estimate (Q = Q_fixed + H_tr·F_dh, discounted over{" "}
                {result.params_used.study_period_yr} yr). Validating a package runs the real EnergyPlus simulation and
                adds it to the comparison table below — the physics estimate and the EPSM result may differ slightly.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
