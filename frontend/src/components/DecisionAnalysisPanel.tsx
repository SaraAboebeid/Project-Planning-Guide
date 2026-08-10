import type { RegretResult } from "../utils/regretAnalysis";

/* Interactive regret / robustness decision analysis for Step 4. Presentational —
 * the parent owns the α + scenario-price state and the computed result. */

const white = (o: number) => `rgba(255,255,255,${o})`;
const fmtM = (v: number) => `${v < 0 ? "−" : ""}${(Math.abs(v) / 1e6).toFixed(2)}M`;

const PICK_STYLE: Record<string, { fg: string; bg: string; label: string; tip: string }> = {
  minimaxRegret: { fg: "#4ECDC4", bg: "rgba(78,205,196,0.16)", label: "Minimax regret", tip: "Smallest worst-case regret — safest against choosing wrong" },
  hurwicz:       { fg: "#B98BE8", bg: "rgba(185,139,232,0.16)", label: "Hurwicz",        tip: "Best α-weighted mix of best & worst case" },
  mostRobust:    { fg: "#96D74C", bg: "rgba(150,215,76,0.16)", label: "Most robust",     tip: "Smallest spread across scenarios — least sensitive to uncertainty" },
};

export default function DecisionAnalysisPanel({
  result, alpha, setAlpha, prices, setPrices,
}: {
  result: RegretResult;
  alpha: number; setAlpha: (n: number) => void;
  prices: number[]; setPrices: (p: number[]) => void;
}) {
  const { scenarios, options, bestPerScenario, picks } = result;
  const picksFor = (id: string) =>
    (Object.entries(picks) as [keyof typeof picks, string][]).filter(([, v]) => v === id).map(([k]) => k);

  const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 600, color: white(0.45), textAlign: "right", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "7px 8px", textAlign: "right", whiteSpace: "nowrap", color: white(0.8) };

  return (
    <div style={{ borderRadius: 14, padding: "16px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Decision under uncertainty — regret &amp; robustness</span>
      </div>
      <p style={{ fontSize: 11.5, color: white(0.4), margin: "0 0 14px", lineHeight: 1.6, maxWidth: 720 }}>
        Future energy prices are uncertain, so each option's payoff isn't a single number. Below, every retrofit option is scored by
        its <b style={{ color: white(0.6) }}>{result.studyPeriodYr}-yr net benefit</b> (energy saved × price − investment) under Low / Medium / High
        price scenarios, then ranked by three decision rules that don't need you to guess the future.
      </p>

      {/* Scenario price controls + Hurwicz α */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: white(0.35), textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Energy-price scenarios (SEK/kWh)</div>
          <div style={{ display: "flex", gap: 8 }}>
            {scenarios.map((s, i) => (
              <label key={s.key} style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, color: white(0.4) }}>
                {s.label}
                <input type="number" min={0} step={0.1} value={prices[i]}
                  onChange={(e) => { const p = [...prices]; p[i] = Math.max(0, Number(e.target.value)); setPrices(p); }}
                  style={{ width: 62, background: "#0d1117", border: `1px solid ${white(0.15)}`, borderRadius: 6, padding: "4px 6px", color: "#fff", fontSize: 12 }} />
              </label>
            ))}
          </div>
        </div>
        <div style={{ flex: "1 1 240px", minWidth: 220 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: white(0.35), textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
            Hurwicz optimism α = <span style={{ color: "#B98BE8" }}>{alpha.toFixed(2)}</span>
          </div>
          <input type="range" min={0} max={1} step={0.05} value={alpha} onChange={(e) => setAlpha(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#B98BE8" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: white(0.3) }}>
            <span>0 · pessimistic (worst-case)</span><span>optimistic (best-case) · 1</span>
          </div>
        </div>
      </div>

      {/* Combined benefit + decision-rule table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Retrofit option</th>
              {scenarios.map((s) => <th key={s.key} style={th}>{s.label}<br /><span style={{ fontWeight: 400, color: white(0.3) }}>net benefit</span></th>)}
              <th style={th} title="Best − worst across scenarios (sensitivity)">Range</th>
              <th style={th} title="Worst-case regret vs the best option in each scenario">Max regret</th>
              <th style={th} title="α·best + (1−α)·worst">Hurwicz</th>
            </tr>
          </thead>
          <tbody>
            {options.map((o) => {
              const tags = picksFor(o.id);
              const highlighted = tags.length > 0;
              return (
                <tr key={o.id} style={{ borderTop: `1px solid ${white(0.07)}`, background: highlighted ? "rgba(255,255,255,0.03)" : undefined }}>
                  <td style={{ padding: "7px 8px", color: o.isBaseline ? white(0.5) : "#fff", fontStyle: o.isBaseline ? "italic" : undefined }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{o.label}</span>
                      {tags.map((t) => (
                        <span key={t} title={PICK_STYLE[t].tip} style={{ fontSize: 8.5, fontWeight: 800, padding: "1px 6px", borderRadius: 99, color: PICK_STYLE[t].fg, background: PICK_STYLE[t].bg }}>
                          ★ {PICK_STYLE[t].label}
                        </span>
                      ))}
                    </div>
                  </td>
                  {o.benefits.map((b, si) => {
                    const isBest = b === bestPerScenario[si];
                    return <td key={si} style={{ ...td, color: isBest ? "#96D74C" : b < 0 ? "#fca5a5" : white(0.8), fontWeight: isBest ? 800 : 400 }}>{fmtM(b)}</td>;
                  })}
                  <td style={{ ...td, color: white(0.6) }}>{fmtM(o.range)}</td>
                  <td style={{ ...td, color: o.id === picks.minimaxRegret ? "#4ECDC4" : white(0.6), fontWeight: o.id === picks.minimaxRegret ? 800 : 400 }}>{fmtM(o.maxRegret)}</td>
                  <td style={{ ...td, color: o.id === picks.hurwicz ? "#B98BE8" : white(0.6), fontWeight: o.id === picks.hurwicz ? 800 : 400 }}>{fmtM(o.hurwicz)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Plain-language summary */}
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: white(0.6) }}>
        {(["minimaxRegret", "hurwicz", "mostRobust"] as const).map((k) => {
          const opt = options.find((o) => o.id === picks[k]);
          if (!opt) return null;
          return (
            <div key={k} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 7px", borderRadius: 99, color: PICK_STYLE[k].fg, background: PICK_STYLE[k].bg, whiteSpace: "nowrap" }}>★ {PICK_STYLE[k].label}</span>
              <span><b style={{ color: "#fff" }}>{opt.label}</b> — {PICK_STYLE[k].tip.toLowerCase()}.</span>
            </div>
          );
        })}
        <div style={{ fontSize: 10.5, color: white(0.3), marginTop: 4 }}>
          Values are {result.studyPeriodYr}-yr net present benefit (SEK, in millions). A negative number means the investment
          isn't repaid by energy savings under that scenario. This analysis is saved to the Step 5 report.
        </div>
      </div>
    </div>
  );
}
