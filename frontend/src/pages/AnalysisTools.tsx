import { ExternalLink, Sun, Eye, Zap, Wrench, Leaf, Target, ChevronRight, Network, ScanSearch, ListOrdered, Scale } from "lucide-react";

/* Optional "method & equations" block for tools that document a formal model. */
interface Methodology {
  criteria?: { key: string; name: string; weight: string; vars: string; rule: string }[];
  equations: { label: string; tex: string }[];
  note: string;
  sources?: { label: string; cite: string; url?: string }[];
}

/* ── Tool definitions ─────────────────────────────────────────────── */

const TOOLS = [
  {
    id: "pvgis",
    title: "PVGIS",
    subtitle: "Solar Irradiance & PV Potential",
    color: "#E8880C",
    status: "integrated",
    icon: Sun,
    description:
      "The Photovoltaic Geographical Information System (PVGIS) is the EU Joint Research Centre solar database. This tool queries PVGIS to provide accurate solar irradiance data and photovoltaic energy yield estimates for any location in Europe and beyond.",
    features: [
      "Annual & monthly global irradiation (kWh/m²)",
      "PV system output estimation with system loss model",
      "Typical Meteorological Year (TMY) climate data",
      "Horizon/shading profile from terrain model",
      "Optimal tilt angle recommendation",
    ],
    link: "https://re.jrc.ec.europa.eu/pvg_tools/en/",
    linkLabel: "Open PVGIS",
    usedIn: ["Renewable Energy Planning", "Energy Community Planning"],
  },
  {
    id: "wwr",
    title: "WWR Estimation",
    subtitle: "Window-to-Wall Ratio Analysis",
    color: "#4ECDC4",
    status: "integrated",
    icon: Eye,
    description:
      "Estimates the Window-to-Wall Ratio (WWR) per facade orientation using a combination of street-view image analysis, building archetype matching from TABULA, and statistical defaults. WWR directly drives heat loss and solar gain calculations.",
    features: [
      "Per-facade WWR (N / E / S / W) breakdown",
      "Street-view proxy estimation via computer vision",
      "TABULA archetype-based defaults as fallback",
      "Uncertainty range reported alongside estimate",
      "Directly feeds U-value & SHGC calculations",
    ],
    link: null,
    linkLabel: null,
    usedIn: ["Renovation Planning", "Energy Community Planning"],
  },
  {
    id: "facade-defects",
    title: "Facade Defect Detection",
    subtitle: "AI Vision — Envelope Defect Detection",
    color: "#E6194B",
    status: "integrated",
    icon: ScanSearch,
    description:
      "A deep-learning object detector (MBDD2025 · Faster R-CNN ResNet50-FPN) that locates and classifies visible facade defects in imagery captured from the 3D viewer. Runs from the Facade Inspector's “Defects” button and returns per-facade defect counts to support renovation prioritisation across a building stock.",
    features: [
      "Five defect classes: crack, leakage, abscission, corrosion, bulge",
      "Faster R-CNN ResNet50-FPN object detector (best score 0.77)",
      "Runs on facade images captured in the 3D viewer",
      "Per-facade defect counts (N / E / S / W) with confidence",
      "On-host torch service, proxied single-origin through the backend",
    ],
    link: null,
    linkLabel: null,
    usedIn: ["Renovation Planning"],
  },
  {
    id: "epsm",
    title: "EPSM",
    subtitle: "Energy Performance Simulation Manager",
    color: "#721CB8",
    status: "external",
    icon: Zap,
    description:
      "A containerised web application for managing building energy simulations using EnergyPlus. EPSM streamlines evaluation of energy renovation strategies across large building stocks — enabling building owners, researchers, and engineers to optimise building performance through data-driven decision making.",
    features: [
      "EnergyPlus simulation engine (containerised)",
      "Component database — materials, constructions, templates",
      "Scenario builder with parameter combinations",
      "Batch simulations with real-time progress monitoring",
      "Interactive results: energy savings & cost-benefit",
    ],
    liveLink: "https://epsm.chalmers.se",
    liveLinkLabel: "Open EPSM",
    attribution: {
      heading: "DEVELOPED AT",
      headline: "Chalmers University of Technology",
      roles: [
        { role: "Lead Developer", name: "Sanjay Somanath" },
        { role: "Principal Investigator", name: "Alexander Hollberg" },
      ],
      contact: "sanjay.somanath@chalmers.se",
    },
    usedIn: ["Renovation Planning", "Energy Community Planning", "Renewable Energy Planning"],
  },
  {
    id: "optimization",
    title: "Optimization Model",
    subtitle: "Multi-Objective Retrofit Package Optimisation",
    color: "#B98BE8",
    status: "integrated",
    icon: Target,
    description:
      "A multi-objective mixed-integer linear programming (MILP) model that searches the full space of renovation package combinations on fast building physics, returns the Pareto-optimal trade-off front across cost, embodied carbon and energy, and hands the winning packages to EPSM for full EnergyPlus validation. Objectives are driven by the KPIs selected in the planning wizard.",
    features: [
      "MILP formulation over wall/roof/floor/window measure combinations",
      "Pareto front across cost, carbon and energy objectives",
      "Cost from Wikells Sektionsfakta, carbon from Boverket Klimatdatabas",
      "Degree-day envelope physics for fast full-combination search",
      "Winning packages validated in EPSM (EnergyPlus)",
    ],
    link: null,
    linkLabel: null,
    attribution: {
      heading: "ADAPTED FROM",
      headline: "Digital Twin for Positive Energy District",
      sub: "Chalmers University of Technology",
      roles: [
        { role: "Model developed by", name: "Jenny Enerbäck & Ann-Brith Strömberg" },
        { role: "Project lead", name: "Liane Thuvander" },
      ],
    },
    usedIn: ["Renovation Planning", "Energy Community Planning"],
  },
  {
    id: "mcda",
    title: "Retrofit Prioritization (MCDA)",
    subtitle: "Multi-Criteria Ranking — which buildings first",
    color: "#E8880C",
    status: "integrated",
    icon: ListOrdered,
    description:
      "A hybrid expert-rule + Multi-Criteria Decision Analysis (MCDA) model that ranks a building stock by retrofit priority. Each building is scored 0–100 under four criterion groups, combined into one weighted priority score. Weights are set directly or derived from expert pairwise judgements via the Analytic Hierarchy Process (AHP). Lives in Step 2; the top-ranked buildings are the ones carried into EPSM simulation first.",
    features: [
      "Four criteria: energy performance, façade condition, building characteristics, retrofit potential",
      "Transparent 0–100 expert-rule sub-scores, each with a per-building data confidence",
      "Weights via sliders/presets or AHP pairwise comparison (with a consistency check)",
      "Façade (F) uses the AI defect inspection — excluded until a building is inspected",
      "Ranking orders which buildings enter the EPSM simulation first",
    ],
    usedIn: ["Renovation Planning", "Energy Community Planning"],
  },
  {
    id: "regret",
    title: "Decision Under Uncertainty",
    subtitle: "Regret · Robustness · Hurwicz",
    color: "#4ECDC4",
    status: "integrated",
    icon: Scale,
    description:
      "When the future is unknown, a single 'best' package doesn't exist. This model scores each retrofit option (and the do-nothing baseline) by its multi-year net benefit under Low / Medium / High energy-price scenarios, then ranks the options with three classic decision rules that need no forecast: minimax regret, uncertainty range, and the Hurwicz criterion. Lives in Step 4 and is saved into the Step 5 report.",
    features: [
      "Options scored under Low / Medium / High energy-price futures",
      "Minimax regret — smallest worst-case 'wish I'd chosen the other' loss",
      "Uncertainty range (best − worst) — flags the most robust, least price-sensitive option",
      "Hurwicz criterion with an adjustable optimism weight α",
      "Do-nothing kept as a reference; the decision is made among the retrofits",
    ],
    usedIn: ["Renovation Planning", "Energy Community Planning"],
  },
  {
    id: "retrofit",
    title: "Retrofit Scenario Analyser",
    subtitle: "Renovation Measure Comparison & Optimisation",
    color: "#F97316",
    status: "integrated",
    icon: Wrench,
    description:
      "Compare renovation measure packages side-by-side to identify the most cost-effective path to your energy target. The tool evaluates individual and combined retrofit interventions — insulation, windows, HVAC, ventilation — and ranks them by energy savings, payback period, and CO₂ reduction.",
    features: [
      "Measure library: wall insulation, roof, windows, HVAC, ventilation",
      "Before/after energy use intensity (kWh/m²/yr) comparison",
      "Simple payback period and net present value (NPV)",
      "Package optimisation toward EPC target class",
      "Sensitivity to energy price and discount rate assumptions",
    ],
    link: null,
    linkLabel: null,
    usedIn: ["Renovation Planning", "Energy Community Planning"],
  },
  {
    id: "lca",
    title: "Life Cycle Assessment",
    subtitle: "Whole-Life Carbon & Environmental Impact",
    color: "#2FB477",
    status: "integrated",
    icon: Leaf,
    description:
      "Quantifies the environmental impact of a building or renovation project across its full life cycle — from material extraction and construction (embodied carbon) through operational energy use to end-of-life demolition and recycling. Follows EN 15978 and aligns with the Level(s) framework.",
    features: [
      "Embodied carbon (A1–A5, B4, C modules) per renovation package",
      "Operational carbon (B6) over 50-year reference study period",
      "Material quantity take-off linked to renovation packages",
      "Global Warming Potential (GWP) in kg CO₂-eq per m²",
      "EN 15978 compliant life cycle boundary reporting",
    ],
    link: null,
    linkLabel: null,
    usedIn: ["Renovation Planning", "Energy Community Planning", "Renewable Energy Planning"],
  },
  {
    id: "space-syntax",
    title: "Space Syntax",
    subtitle: "Street-Network Centrality (SMoG)",
    color: "#38BDF8",
    status: "integrated",
    icon: Network,
    description:
      "Space-syntax analysis of the street network — quantifying how each street contributes to movement and accessibility across the city. Computed live on the OpenStreetMap street graph and rendered as colour-graded streets directly in the 3D viewer's Urban Analysis. Method after the Spatial Morphology Group (SMoG), Chalmers.",
    features: [
      "Betweenness (choice) — through-movement potential",
      "Integration (closeness) — how central / accessible a street is",
      "Reach — extent of network reachable within a radius",
      "Computed live on the OSM street graph (networkx engine)",
      "Colour-graded street network rendered in the 3D viewer",
    ],
    link: null,
    linkLabel: null,
    attribution: {
      heading: "METHOD AFTER",
      headline: "Spatial Morphology Group (SMoG)",
      sub: "Chalmers University of Technology",
      roles: [
        { role: "Reference toolkit", name: "PST / Pstalgo (space-syntax analysis)" },
      ],
    },
    usedIn: ["Energy Community Planning", "Renovation Planning"],
  },
];

/* ── Status badge ───────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const isExt = status === "external";
  return (
    <span style={{
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: 1.2,
      padding: "3px 8px",
      borderRadius: 100,
      background: isExt ? "rgba(114,28,184,0.15)" : "rgba(78,205,196,0.12)",
      color: isExt ? "#a060e8" : "#4ECDC4",
      border: `1px solid ${isExt ? "rgba(114,28,184,0.3)" : "rgba(78,205,196,0.25)"}`,
    }}>
      {isExt ? "EXTERNAL TOOL" : "INTEGRATED"}
    </span>
  );
}

/* ── Single tool card ────────────────────────────────────────────────── */
function ToolCard({ tool }: { tool: typeof TOOLS[number] }) {
  const Icon = tool.icon;
  const t = tool as typeof TOOLS[3]; // cast for optional fields
  const meth = (tool as { methodology?: Methodology }).methodology;

  return (
    <div style={{
      borderRadius: 14,
      background: "rgba(255,255,255,0.025)",
      border: "1px solid rgba(255,255,255,0.07)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      transition: "box-shadow .2s",
      boxShadow: `0 0 0 0 ${tool.color}00`,
    }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 4px 24px ${tool.color}28`)}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
    >
      {/* Coloured top bar */}
      <div style={{ height: 4, background: tool.color }} />

      <div style={{ padding: "22px 24px", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: `${tool.color}18`,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <Icon size={20} color={tool.color} />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#f0f4ff", lineHeight: 1.2 }}>
                {tool.title}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                {tool.subtitle}
              </div>
            </div>
          </div>
          <StatusBadge status={tool.status} />
        </div>

        {/* Description */}
        <p style={{ fontSize: 13, lineHeight: 1.7, color: "rgba(255,255,255,0.6)", margin: 0 }}>
          {tool.description}
        </p>

        {/* Features */}
        <div style={{
          background: "rgba(255,255,255,0.03)",
          borderRadius: 10,
          padding: "12px 14px",
          border: "1px solid rgba(255,255,255,0.05)",
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.4, color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>
            KEY CAPABILITIES
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {tool.features.map(f => (
              <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                <ChevronRight size={12} color={tool.color} style={{ marginTop: 2, flexShrink: 0 }} />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Method & equations (tools that document a formal model) */}
        {meth && (
          <div style={{
            background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "12px 14px",
            border: `1px solid ${tool.color}22`,
          }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.4, color: `${tool.color}aa`, marginBottom: 12 }}>
              METHOD &amp; EQUATIONS
            </div>
            {/* Criteria hierarchy */}
            {meth.criteria && <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {meth.criteria.map((c) => (
                <div key={c.key} style={{ display: "flex", gap: 9 }}>
                  <span style={{ width: 16, flexShrink: 0, fontWeight: 800, color: tool.color, fontSize: 12 }}>{c.key}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12 }}>
                      <span style={{ color: "#f0f4ff", fontWeight: 600 }}>{c.name}</span>
                      <span style={{ color: tool.color, marginLeft: 6 }}>w = {c.weight}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{c.vars}</div>
                    <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)", marginTop: 1 }}>Score: {c.rule}</div>
                  </div>
                </div>
              ))}
            </div>}
            {/* Equations */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {meth.equations.map((eq) => (
                <div key={eq.label}>
                  <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.4)", marginBottom: 3 }}>{eq.label}</div>
                  <div style={{
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11.5, color: "#f0f4ff",
                    background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: "7px 10px", overflowX: "auto",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}>{eq.tex}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.42)", marginTop: 11, lineHeight: 1.55 }}>{meth.note}</div>
            {meth.sources && (
              <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.4, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
                  SOURCES &amp; ASSUMPTIONS
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {meth.sources.map((s) => (
                    <div key={s.label} style={{ fontSize: 10, lineHeight: 1.5 }}>
                      <span style={{ color: "#f0f4ff", fontWeight: 600 }}>{s.label}</span>
                      <span style={{ color: "rgba(255,255,255,0.45)" }}> — {s.cite}</span>
                      {s.url && (
                        <>
                          {" "}
                          <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: tool.color, textDecoration: "none" }}>↗</a>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Used in tags */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {tool.usedIn.map(u => (
            <span key={u} style={{
              fontSize: 10, padding: "3px 8px", borderRadius: 100,
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.45)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}>
              {u}
            </span>
          ))}
        </div>

        {/* Attribution block — shared shape for every credited tool (EPSM,
            Optimization Model, …). heading + bold headline + optional sub line
            + a list of role/name rows + an optional contact email. */}
        {t.attribution && (
          <div style={{
            background: `${tool.color}0d`,
            border: `1px solid ${tool.color}2a`,
            borderRadius: 10,
            padding: "12px 14px",
          }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.4, color: `${tool.color}aa`, marginBottom: 8 }}>
              {t.attribution.heading}
            </div>
            <div style={{ fontSize: 13, color: "#f0f4ff", fontWeight: 600 }}>
              {t.attribution.headline}
            </div>
            {t.attribution.sub && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                {t.attribution.sub}
              </div>
            )}
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 6, lineHeight: 1.6 }}>
              {t.attribution.roles.map((r) => (
                <div key={r.role}>
                  <span style={{ color: "rgba(255,255,255,0.75)" }}>{r.role}:</span> {r.name}
                </div>
              ))}
            </div>
            {t.attribution.contact && (
              <a
                href={`mailto:${t.attribution.contact}`}
                style={{ fontSize: 11, color: tool.color, textDecoration: "none", marginTop: 6, display: "inline-block", opacity: 0.8 }}
              >
                {t.attribution.contact}
              </a>
            )}
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Action links */}
        {(tool.link || (t as typeof TOOLS[3]).liveLink) && (
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            {(t as typeof TOOLS[3]).liveLink && (
              <a
                href={(t as typeof TOOLS[3]).liveLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 12, fontWeight: 600,
                  padding: "8px 14px", borderRadius: 8,
                  background: tool.color,
                  color: "#fff",
                  textDecoration: "none",
                  boxShadow: `0 0 14px ${tool.color}44`,
                }}
              >
                {(t as typeof TOOLS[3]).liveLinkLabel}
                <ExternalLink size={12} />
              </a>
            )}

          </div>
        )}
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────── */
export default function AnalysisTools() {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 8px" }}>
      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
          ANALYSIS MODULES
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#f0f4ff", margin: 0, lineHeight: 1.2 }}>
          Available Analysis Tools
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", marginTop: 8, maxWidth: 600, lineHeight: 1.6 }}>
          The tool integrates multiple specialised analysis engines to support evidence-based energy planning. 
          Below is a full catalogue of the analytical capabilities available.
        </p>

        {/* Summary pill row — derived from TOOLS so the counts can't fall out of
            sync with the catalogue when a tool is added or removed. */}
        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          {[
            { label: `${TOOLS.length} tools`, sub: "total", color: "#4ECDC4" },
            { label: `${TOOLS.filter(t => t.status === "integrated").length}`, sub: "integrated", color: "#2FB477" },
            { label: `${TOOLS.filter(t => t.status === "external").length}`, sub: "external", color: "#721CB8" },
          ].map(p => (
            <div key={p.label} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "7px 14px", borderRadius: 100,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}>
              <span style={{ fontWeight: 800, fontSize: 14, color: p.color }}>{p.label}</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{p.sub}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 2-column grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
        gap: 20,
      }}>
        {TOOLS.map(tool => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </div>
    </div>
  );
}
