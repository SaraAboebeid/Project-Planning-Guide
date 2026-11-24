import { useState, useEffect } from "react";
import { api, type OptimizeComponentInput, type OptimizeParams, type OptimizePoint, type OptimizeResponse } from "../api/client";
import { Loader2, ChevronDown, ChevronRight, Sparkles, Play } from "lucide-react";
import ParetoChart, { axesFromKpis, OBJECTIVES } from "./ParetoChart";
import ParallelCoordinates from "./ParallelCoordinates";
import { useT } from "../i18n";

/* The "pick the Pareto-optimal packages" step of the hybrid optimizer.
 * RenovationSimulator gathers the option matrix + economy/climate params from
 * the already-resolved geometry, cost, carbon and EPSM baseline; this panel
 * runs /api/optimize (fast degree-day physics over every combination), shows
 * the Pareto front, and hands each chosen winner back to be validated in EPSM. */

type SortKey = "energy_kwh_m2_yr" | "total_cost" | "total_carbon" | "initial_cost";

const TAG_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  // "cheapest" is the lowest LIFE-CYCLE cost (total_cost), so say that.
  "cheapest":       { bg: "rgba(184,163,208,0.18)", fg: "#9F86BB", label: "Lowest 50-yr cost" },
  "lowest-carbon":  { bg: "rgba(139,110,173,0.16)",  fg: "#8B6EAD", label: "Lowest carbon" },
  "lowest-energy":  { bg: "rgba(74,144,226,0.16)",  fg: "#4A90E2", label: "Lowest energy" },
};

export default function OptimizerPanel({
  input, onValidate, disabledReason, note, currency, validatedKeys, runningKeys = new Set<string>(), selectedKpis,
  result: extResult, loading: extLoading, error: extError, onOpenTable, onShowResults, scopeLabel,
}: {
  /** Opens the Results step - offered on a row once it has been simulated. */
  onShowResults?: () => void;
  /** Which building the figures are for, when there are several. */
  scopeLabel?: string;
  input: { components: OptimizeComponentInput[]; params: OptimizeParams } | null;
  onValidate: (point: OptimizePoint, opts?: { auto?: boolean }) => void;
  /** When given, the parent runs /api/optimize (so the Results table can list
   *  the same estimates) and this panel only draws the chart. */
  result?: OptimizeResponse | null;
  loading?: boolean;
  error?: string | null;
  /** Shown instead of the panel's own table: jump to the combined table. */
  onOpenTable?: () => void;
  disabledReason?: string;
  /** Shown under the header, e.g. build-ups left out for having no price. */
  note?: string;
  currency: "SEK" | "GBP" | "EUR";
  validatedKeys: Set<string>;
  /** Packages whose EnergyPlus run is still queued/running. */
  runningKeys?: Set<string>;
  selectedKpis: string[];
}) {
  const t = useT();
  const axes = axesFromKpis(selectedKpis);
  const [open, setOpen] = useState(true);
  const controlled = extResult !== undefined;
  const [ownLoading, setLoading] = useState(false);
  const [ownError, setError] = useState<string | null>(null);
  const [ownResult, setResult] = useState<OptimizeResponse | null>(null);
  const result = controlled ? extResult : ownResult;
  const loading = controlled ? !!extLoading : ownLoading;
  const error = controlled ? (extError ?? null) : ownError;
  const [sort, setSort] = useState<SortKey>("energy_kwh_m2_yr");

  const white = (o: number) => `rgba(255,255,255,${o})`;
  const fmtMoney = (n: number) =>
    (currency === "SEK"
      ? n.toLocaleString("sv-SE", { maximumFractionDigits: 0 }) + " SEK"
      : currency === "EUR"
        ? "€" + n.toLocaleString("nl-BE", { maximumFractionDigits: 0 })
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
    if (controlled) return;
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

  // No auto-run: EnergyPlus (EPSM) only runs when the user asks, via the
  // "Simulate in EnergyPlus" button on a row or a click on a chart point.

  return (
    <div style={{ borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
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
          <Sparkles size={16} color="#B8A3D0" />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{t("Optimisation & Screening · Pareto curve and estimated packages")}</span>
          {loading && <Loader2 size={13} color="#B8A3D0" style={{ animation: "spin 1s linear infinite" }} />}
          {result && !loading && (
            <span style={{ fontSize: 12, color: white(0.45) }}>
              {t("{n} optimal of {total}", { n: result.pareto_count, total: result.combinations_total.toLocaleString() })}
            </span>
          )}
        </button>

        <button onClick={() => setOpen((o) => !o)}
          style={{ background: "transparent", border: 0, cursor: "pointer", color: white(0.4), padding: 0, flexShrink: 0 }}
          title={open ? t("Collapse") : t("Expand")}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>
      {disabledReason && !open && (
        <div style={{ fontSize: 12, color: "#E8880C", padding: "0 18px 12px" }}>{disabledReason}</div>
      )}

      {open && (
        <div style={{ padding: "0 18px 18px" }}>
          <p style={{ fontSize: 12, color: white(0.5), margin: "0 0 12px", lineHeight: 1.6 }}>
            {t("As you pick materials, this scores ")}<b>{t("every combination")}</b>{t(" of your picks on the fast degree-day physics (no EnergyPlus) and plots the ")}<b>{t("Pareto-optimal")}</b>{t(" set live — the packages where you can't improve one objective without sacrificing another. Cost is ")}<b>{t("life-cycle over 50 years")}</b>{t(": material cost today plus the energy bill (at the energy price below, discounted) over the study period. Shortlist the promising ones: click a chart point or ")}<b>{t("Simulate")}</b>{t(" in the table below to verify that package in EnergyPlus (EPSM). Model after Enerbäck & Strömberg.")}
          </p>

          <details style={{ marginBottom: 14, fontSize: 12, color: white(0.6), lineHeight: 1.6 }}>
            <summary style={{ cursor: "pointer", color: "#B8A3D0", fontWeight: 600 }}>{t("How the optimisation works")}</summary>
            <div style={{ padding: "8px 0 0 14px" }}>
              <p style={{ margin: "0 0 8px" }}>
                <b>{t("In short:")}</b> {t("it tries every mix of the build-ups you saved and keeps the mixes where nothing else is cheaper, lower-carbon and lower-energy at the same time. It is a quick estimate to narrow the choice — simulate the winners in EnergyPlus to confirm them.")}
              </p>
              <ol style={{ margin: "0 0 8px", paddingLeft: 18 }}>
                <li style={{ marginBottom: 4 }}>
                  <b>{t("The choices.")}</b> {t("Each component offers your saved build-ups plus a free “keep as-built” option, so the optimiser can decide a part is not worth touching. Each option carries a U-value, a cost (price per m² × the component’s area) and embodied carbon. Build-ups with no price, or that insulate worse than what is there now, are left out — and listed when that happens. Parts you have not designed anything for, and air leakage/ventilation, still count as heat loss, unchanged.")}
                </li>
                <li style={{ marginBottom: 4 }}>
                  <b>{t("Energy.")}</b> {t("Heat loss = Σ area × U (W/K); yearly heating = heat loss × how cold the year is")}
                  {" "}({t("degree-days")}{input ? <>, {t("{n} here", { n: Math.round((input.params.f_dh * 1000) / 24).toLocaleString() })}</> : null}).
                  {" "}{t("That simple formula ignores sun and internal heat, so it is ")}<b>{t("calibrated to your Step 3 EnergyPlus baseline")}</b>{t(": “keep everything as-built” gives exactly the simulated heating. Only heating responds to better U-values; hot water and other loads stay fixed.")}
                </li>
                <li style={{ marginBottom: 4 }}>
                  <b>{t("50-year cost")}</b> = {t("material cost today + replacements + 50 years of energy bills")}
                  {input ? <> {t("at {price} {currency}/kWh", { price: input.params.energy_price, currency })}</> : null}, {t("discounted at {rate}/yr (money later is worth less than money now).", { rate: input ? `${Math.round(input.params.discount_rate * 1000) / 10}%` : "3%" })}
                  {" "}<b>{t("50-year carbon")}</b> = {t("embodied carbon + replacements + 50 years of energy × the heat carbon factor")}
                  {input ? <> ({input.params.carbon_factor_heat} kg CO₂e/kWh)</> : null}, {t("not discounted.")}
                </li>
                <li style={{ marginBottom: 4 }}>
                  <b>{t("Picking the winners.")}</b> {t("A package is dropped when another one is at least as good on cost, carbon and energy and better on at least one. What remains is the trade-off curve. The cheapest, lowest-carbon and lowest-energy packages are tagged; at most 24 are shown, always keeping those three. “Do nothing” is never counted as a package.")}
                </li>
                <li>
                  <b>{t("Confirm in EnergyPlus.")}</b> {t("Each package appears in the Results table as an “≈ estimate” until you press ")}<b>{t("Simulate")}</b>{t(", which replaces it with the full simulation.")}
                </li>
              </ol>
              <p style={{ margin: 0, color: white(0.5) }}>
                <b>{t("Keep in mind:")}</b> {t("the estimate is still somewhat optimistic about savings, so simulate the packages you care about. A new storey shows its cost and carbon but no energy effect here (EnergyPlus models it). Parts that wear out within 50 years are replaced in the totals (IVL service lives). With several buildings, the optimisation is done for one representative building and the same choices are applied to all.")}
              </p>
            </div>
          </details>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            {disabledReason && <span style={{ fontSize: 12, color: "#E8880C" }}>{disabledReason}</span>}
            {result && (
              <span style={{ fontSize: 12, color: white(0.45) }}>
                {t("{n} combinations evaluated · {m} Pareto-optimal", { n: result.combinations_total.toLocaleString(), m: result.pareto_count })}
                {result.truncated && t(" · search truncated (too many combinations — narrow the material list)")}
                {scopeLabel && <> · {t("figures for {scope}", { scope: scopeLabel })}</>}
              </span>
            )}
          </div>

          {note && (
            <div style={{ fontSize: 12, color: "#E8880C", marginBottom: 10, lineHeight: 1.5 }}>{note}</div>
          )}

          {error && (
            <div style={{ fontSize: 12, color: "#E2483B", marginBottom: 10 }}>{t("Optimization failed: {error}", { error })}</div>
          )}

          {/* Empty / computing states so the panel isn't blank before any pick */}
          {!result && !error && !disabledReason && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: white(0.4), padding: "8px 0" }}>
              {loading
                ? (<><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> {t("Computing trade-off curve…")}</>)
                : t("Pick one or more materials per component in the builder above — the curve appears here and updates as you go.")}
            </div>
          )}

          {result && pareto.length > 0 && (
            <>
              {/* The 2-D Pareto frontier (cost×GWP, colour = energy) is the primary,
                  full-width view; the parallel-coordinates plot is an opt-in advanced
                  toggle, and the Pareto can be maximised to a fullscreen overlay. */}
              <div style={{ marginBottom: 6, fontSize: 12, color: white(0.45) }}>
                {t("Axes from your Step-1 KPIs:")} <b style={{ color: "#fff" }}>{t(OBJECTIVES[axes.x].label)}</b> ×{" "}
                <b style={{ color: "#fff" }}>{t(OBJECTIVES[axes.y].label)}</b>, {t("coloured by")} <b style={{ color: "#fff" }}>{t(OBJECTIVES[axes.color].label)}</b>.
              </div>
              {/* Pareto frontier — full width. Parallel coordinates is an opt-in
                  advanced view (toggle); the Pareto can be maximised to fullscreen. */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: white(0.4), textTransform: "uppercase" }}>
                    {t("Pareto frontier")}
                  </div>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 7 }}>
                    <button onClick={() => setShowParallel(v => !v)}
                      style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 8, cursor: "pointer",
                        border: `1px solid ${showParallel ? "#8B6EAD" : "rgba(255,255,255,0.14)"}`,
                        background: showParallel ? "#8B6EAD" : "transparent", color: showParallel ? "#0b1220" : white(0.6) }}>
                      {showParallel ? t("Hide parallel view") : t("＋ Parallel view")}
                    </button>
                    <button onClick={() => setMaximized(true)} title={t("Maximise the chart")}
                      style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 8, cursor: "pointer",
                        border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: white(0.6) }}>
                      {t("⤢ Maximise")}
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
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: white(0.4), textTransform: "uppercase", marginBottom: 4 }}>
                    {t("Parallel coordinates · materials → KPIs")}
                  </div>
                  <div style={{ fontSize: 11.5, color: white(0.4), marginBottom: 8, lineHeight: 1.5, maxWidth: 720 }}>
                    {t("Each package is one line crossing every axis — the material choices and all three KPIs at once. Drag along an axis to filter. An advanced view for spotting patterns the 2-D Pareto can't show.")}
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
                    style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: "16px 20px", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{t("Pareto frontier")}</span>
                      <span style={{ fontSize: 12, color: white(0.45) }}>
                        {t(OBJECTIVES[axes.x].label)} × {t(OBJECTIVES[axes.y].label)}, {t("coloured by")} {t(OBJECTIVES[axes.color].label)}
                      </span>
                      <button onClick={() => setMaximized(false)}
                        style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 8, cursor: "pointer",
                          border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.05)", color: "#fff" }}>
                        {t("✕ Minimise")}
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

              {/* One table for every package lives in Results (estimates until
                  simulated); the chart view links to it instead of repeating it. */}
              {onOpenTable ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, padding: "10px 14px", borderRadius: 10,
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: white(0.6), flex: 1, lineHeight: 1.5 }}>
                    {t("Every package — with cost, carbon, 50-year cost and carbon, heating and total energy — is in one table under ")}<b style={{ color: "#fff" }}>{t("Results & comparison")}</b>{t(": estimates until simulated, EnergyPlus figures after. Click a point above to simulate it.")}
                  </span>
                  <button onClick={onOpenTable}
                    style={{ fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 8, cursor: "pointer",
                      border: "1px solid #8B6EAD", background: "rgba(139,110,173,0.14)", color: "#8B6EAD" }}>
                    {t("Open the packages table →")}
                  </button>
                </div>
              ) : (<>
              {/* The table IS the chart's points, so it sits in the same card under
                  a joining rule — one analysis, two read-outs. */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: white(0.4), textTransform: "uppercase", whiteSpace: "nowrap" }}>
                  {t("Estimated packages · the points above")}
                </span>
                <span style={{ flex: 1, height: 1, background: white(0.1) }} />
              </div>
              <div style={{ fontSize: 11.5, color: white(0.4), margin: "4px 0 0" }}>
                {t("Fast-model estimates to shortlist from — ")}<b>{t("Simulate")}</b>{t(" the promising ones; verified results appear in Simulation Results & Comparison.")}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, marginTop: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: white(0.4) }}>{t("Sort by:")}</span>
                {/* "Cost" here is life-cycle, unlike the capex-only Cost in 4.3 —
                    the two answer different questions and can rank differently. */}
                {([["energy_kwh_m2_yr", "Energy"], ["initial_cost", "Upfront cost"], ["total_cost", "50-yr cost"], ["total_carbon", "50-yr carbon"]] as const).map(([k, lbl]) => (
                  <button key={k} onClick={() => setSort(k)} style={{
                    fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 8, cursor: "pointer",
                    border: `1px solid ${sort === k ? "#8B6EAD" : "rgba(255,255,255,0.12)"}`,
                    background: sort === k ? "#8B6EAD" : "transparent",
                    color: sort === k ? "#0b1220" : white(0.55),
                  }}>{t(lbl)}</button>
                ))}
                {canShowAll && (
                  <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: white(0.4) }}>{t("Show:")}</span>
                    {([[false, t("Pareto-optimal ({n})", { n: result.pareto.length })], [true, t("All packages ({n})", { n: result.all_points!.length })]] as const).map(([v, lbl]) => (
                      <button key={String(v)} onClick={() => setShowAll(v)} style={{
                        fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 8, cursor: "pointer",
                        border: `1px solid ${showAll === v ? "#8B6EAD" : "rgba(255,255,255,0.12)"}`,
                        background: showAll === v ? "#8B6EAD" : "transparent",
                        color: showAll === v ? "#0b1220" : white(0.55),
                      }}>{lbl}</button>
                    ))}
                  </span>
                )}
              </div>
              {showAll && canShowAll && (
                <div style={{ fontSize: 11.5, color: white(0.35), marginBottom: 8 }}>
                  {t("Showing every evaluated package. Rows without a ")}<span style={{ color: "#8B6EAD" }}>{t("tag")}</span>{t(" are ")}<b>{t("dominated")}</b>{t(" — another package is better on cost, carbon and energy at once, so it's never the smart pick.")}
                </div>
              )}

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: white(0.45), textAlign: "left" }}>
                      <th style={{ padding: "6px 8px", fontWeight: 600 }}>{t("Package (selected options)")}</th>
                      <th style={{ padding: "6px 8px", fontWeight: 600, whiteSpace: "nowrap" }}>{t("Energy")}</th>
                      <th style={{ padding: "6px 8px", fontWeight: 600, whiteSpace: "nowrap" }}>{t("Upfront cost")}</th>
                      <th style={{ padding: "6px 8px", fontWeight: 600, whiteSpace: "nowrap" }}
                          title={t("Upfront cost + replacements + 50 years of energy at today's price, discounted (energy × price × annuity factor)")}>{t("50-yr cost (LCC)")}</th>
                      <th style={{ padding: "6px 8px", fontWeight: 600, whiteSpace: "nowrap" }}
                          title={t("Embodied carbon + replacements + 50 years of energy")}>{t("50-yr carbon")}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {/* baseline reference row */}
                    <tr style={{ borderTop: `1px solid ${white(0.08)}`, color: white(0.55) }}>
                      <td style={{ padding: "8px", fontStyle: "italic" }}>{t("Baseline (as-built)")}</td>
                      <td style={{ padding: "8px", whiteSpace: "nowrap" }}>{result.baseline.energy_kwh_m2_yr} kWh/m²/yr</td>
                      <td style={{ padding: "8px", whiteSpace: "nowrap" }}>—</td>
                      <td style={{ padding: "8px", whiteSpace: "nowrap" }}>{fmtMoney(result.baseline.total_cost)}</td>
                      <td style={{ padding: "8px", whiteSpace: "nowrap" }}>{Math.round(result.baseline.total_carbon).toLocaleString()} kg</td>
                      <td />
                    </tr>
                    {shown.map((pt, i) => {
                      const ptKey = pointKey(pt);
                      const simulated = ptKey !== "" && validatedKeys.has(ptKey);
                      const deltaPct = baseEnergy ? Math.round(((baseEnergy - pt.energy_kwh_m2_yr) / baseEnergy) * 100) : null;
                      const touched = Object.entries(pt.selection_labels).filter(([, v]) => v !== "Keep as-built");
                      return (
                        <tr key={i} style={{ borderTop: `1px solid ${white(0.06)}` }}>
                          <td style={{ padding: "8px", color: "#fff" }}>
                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: touched.length ? 4 : 0 }}>
                              {(pt.tags ?? []).map((tag) => {
                                const s = TAG_STYLE[tag];
                                return s ? (
                                  <span key={tag} style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: s.bg, color: s.fg }}>{t(s.label)}</span>
                                ) : null;
                              })}
                            </div>
                            {touched.length === 0 ? (
                              <span style={{ color: white(0.4), fontStyle: "italic" }}>{t("Keep everything as-built")}</span>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                {touched.map(([k, v]) => (
                                  <div key={k} style={{ fontSize: 12 }}>
                                    <span style={{ color: white(0.45) }}>{t(k.replace("VertExt::", ""))}:</span>{" "}
                                    <span style={{ color: white(0.85) }}>{v}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                            <div style={{ color: "#fff", fontWeight: 600 }}>{pt.energy_kwh_m2_yr} kWh/m²/yr</div>
                            {deltaPct != null && deltaPct > 0 && (
                              <div style={{ fontSize: 11.5, color: "#2FB477" }}>{t("−{n}% vs baseline", { n: deltaPct })}</div>
                            )}
                          </td>
                          <td style={{ padding: "8px", whiteSpace: "nowrap", color: white(0.8) }}>{fmtMoney(pt.initial_cost)}</td>
                          <td style={{ padding: "8px", whiteSpace: "nowrap", color: "#9F86BB", fontWeight: 600 }}>{fmtMoney(pt.total_cost)}</td>
                          <td style={{ padding: "8px", whiteSpace: "nowrap", color: white(0.8) }}>{Math.round(pt.total_carbon).toLocaleString()} kg</td>
                          <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                            {ptKey === "" ? null : runningKeys.has(ptKey) ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: "#E8880C" }}>
                                <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> {t("Running in EnergyPlus…")}
                              </span>
                            ) : simulated ? (
                              onShowResults ? (
                                <button onClick={onShowResults} title={t("Open the Results step")}
                                  style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600,
                                    padding: "5px 11px", borderRadius: 8, cursor: "pointer",
                                    border: "1px solid rgba(47,180,119,0.45)", background: "transparent", color: "#2FB477" }}>
                                  {t("✓ Simulated — see results in the next step →")}
                                </button>
                              ) : (
                                <span style={{ fontSize: 11.5, fontWeight: 600, color: "#2FB477" }}>{t("✓ Simulated — see results in the next step")}</span>
                              )
                            ) : (
                              <button onClick={() => onValidate(pt)}
                                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600,
                                  padding: "5px 11px", borderRadius: 8, cursor: "pointer",
                                  border: "1px solid rgba(47,180,119,0.45)", background: "rgba(47,180,119,0.14)", color: "#2FB477" }}>
                                <Play size={11} /> {t("Simulate in EnergyPlus")}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>)}

            </>
          )}
        </div>
      )}
    </div>
  );
}
