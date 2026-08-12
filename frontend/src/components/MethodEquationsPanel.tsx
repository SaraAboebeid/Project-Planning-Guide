/* Analysis methods & equations — the formal models behind the tool's analysis
   steps (MCDA retrofit prioritisation, decision-under-uncertainty). These live
   in the Data Explorer alongside the optimization assumptions & equations, so
   every assumption and equation in the tool sits in one reference place. The
   optimization model has its own block (OptimizationAssumptions). Each model is
   a collapsible card sharing one style with the optimization block. */
import { CollapsibleCard, EquationRow } from "./CollapsibleCard";

const white = (o: number) => `rgba(255,255,255,${o})`;

interface Method {
  title: string;
  subtitle: string;
  color: string;
  criteria?: { key: string; name: string; weight: string; vars: string; rule: string }[];
  equations: { label: string; tex: string }[];
  note: string;
  sources?: { label: string; cite: string; url?: string }[];
}

const METHODS: Method[] = [
  {
    title: "Retrofit Prioritization (MCDA)",
    subtitle: "Multi-Criteria Ranking — which buildings first",
    color: "#E8880C",
    criteria: [
      { key: "E", name: "Energy performance", weight: "0.35", vars: "Energy class, kWh/m²·yr, heating demand, CO₂", rule: "kWh/m²·yr benchmarked 60→250 (or EPC class when unmetered)" },
      { key: "F", name: "Façade / envelope condition", weight: "0.30", vars: "Cracks, spalling, leakage, corrosion, bulges", rule: "AI defect load, severity-weighted & saturating; excluded until inspected" },
      { key: "C", name: "Building characteristics", weight: "0.15", vars: "Age, construction type, façade / floor area", rule: "0.6 × vintage + 0.4 × size percentile" },
      { key: "R", name: "Retrofit potential", weight: "0.20", vars: "Expected saving, cost, payback, feasibility", rule: "Energy headroom above target + U-value poorness + scale" },
    ],
    equations: [
      { label: "Weighted priority score", tex: "Pᵢ = w_E·Eᵢ + w_F·Fᵢ + w_C·Cᵢ + w_R·Rᵢ" },
      { label: "Default weights (Σw = 1)", tex: "P = 0.35·E + 0.30·F + 0.15·C + 0.20·R" },
      { label: "AHP weights — geometric-mean priority", tex: "wₖ = (∏ⱼ aₖⱼ)^(1/n) ⁄ Σᵢ (∏ⱼ aᵢⱼ)^(1/n)" },
      { label: "AHP consistency ratio", tex: "CR = CI ⁄ RI,   CI = (λmax − n)/(n − 1),   RI = 0.90 (n = 4);   consistent if CR ≤ 0.10" },
    ],
    note: "Every sub-score carries a data-confidence; a criterion without data (e.g. an un-inspected façade) is dropped and its weight re-normalised across the remaining criteria, so the composite stays comparable.",
  },
  {
    title: "Decision Under Uncertainty",
    subtitle: "Regret · Robustness · Hurwicz",
    color: "#4ECDC4",
    equations: [
      { label: "Net benefit of an option in a scenario", tex: "benefit = (energy saved × area) × price × annuity − investment" },
      { label: "Regret (opportunity loss)", tex: "regretᵢ,ₛ = maxⱼ(benefitⱼ,ₛ) − benefitᵢ,ₛ" },
      { label: "Minimax regret rule", tex: "choose i that minimises  maxₛ regretᵢ,ₛ" },
      { label: "Uncertainty range (sensitivity)", tex: "rangeᵢ = maxₛ benefitᵢ,ₛ − minₛ benefitᵢ,ₛ" },
      { label: "Hurwicz criterion", tex: "Hᵢ = α · (best case) + (1 − α) · (worst case)" },
    ],
    note: "α is your risk attitude: α = 0 weighs only the worst case (cautious), α = 1 only the best case (optimistic), α = 0.5 balances them. A small range means the option is robust to price uncertainty; a small max regret means it's safe against choosing wrong.",
    sources: [
      { label: "Energy price — today's reference (SE3, Gothenburg)", cite: "Nord Pool day-ahead spot, fetched live via elprisetjustnu.se (spot only, excl. VAT / grid fee / energy tax); 0.8 SEK/kWh fallback if the feed is down. Low/Medium/High are user-set scenarios around it.", url: "https://www.elprisetjustnu.se" },
      { label: "Real discount rate — 3%", cite: "EU cost-optimal framework (Delegated Reg. 244/2012), societal real rate used by Boverket for building energy LCC", url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32012R0244" },
      { label: "Study period — 30 years", cite: "Net-present-value horizon; annuity factor = Σ 1/(1+r)^t over the period" },
    ],
  },
];

export default function MethodEquationsPanel() {
  return (
    <div style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: "#fff", margin: "0 0 4px 0" }}>Analysis methods &amp; equations</h2>
      <p style={{ fontSize: 12, color: white(0.45), margin: "0 0 14px 0" }}>
        The formal models behind the tool's analysis steps — how each score is computed. Click a card to expand it.
        The optimization model (its assumptions, equations &amp; methods) is in the <b style={{ color: white(0.65) }}>Optimization Model</b> card below.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {METHODS.map((m) => (
          <CollapsibleCard key={m.title} title={m.title} subtitle={m.subtitle} color={m.color}>
            {/* Criteria hierarchy */}
            {m.criteria && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "4px 0 14px" }}>
                {m.criteria.map((c) => (
                  <div key={c.key} style={{ display: "flex", gap: 9 }}>
                    <span style={{ width: 16, flexShrink: 0, fontWeight: 800, color: m.color, fontSize: 12 }}>{c.key}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12 }}>
                        <span style={{ color: "#f0f4ff", fontWeight: 600 }}>{c.name}</span>
                        <span style={{ color: m.color, marginLeft: 6 }}>w = {c.weight}</span>
                      </div>
                      <div style={{ fontSize: 10.5, color: white(0.4), marginTop: 1 }}>{c.vars}</div>
                      <div style={{ fontSize: 10.5, color: white(0.55), marginTop: 1 }}>Score: {c.rule}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Equations */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: m.criteria ? 0 : 4 }}>
              {m.equations.map((eq) => (
                <EquationRow key={eq.label} label={eq.label} tex={eq.tex} />
              ))}
            </div>

            <div style={{ fontSize: 10, color: white(0.42), marginTop: 11, lineHeight: 1.55 }}>{m.note}</div>

            {m.sources && (
              <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.4, color: white(0.3), marginBottom: 8 }}>
                  SOURCES &amp; ASSUMPTIONS
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {m.sources.map((s) => (
                    <div key={s.label} style={{ fontSize: 10, lineHeight: 1.5 }}>
                      <span style={{ color: "#f0f4ff", fontWeight: 600 }}>{s.label}</span>
                      <span style={{ color: white(0.45) }}> — {s.cite}</span>
                      {s.url && (
                        <>
                          {" "}
                          <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: m.color, textDecoration: "none" }}>↗</a>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CollapsibleCard>
        ))}
      </div>
    </div>
  );
}
