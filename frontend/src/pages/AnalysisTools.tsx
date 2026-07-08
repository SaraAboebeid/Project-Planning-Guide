import { ExternalLink, Sun, Eye, Layers, Zap, ChevronRight } from "lucide-react";

/* ── Tool definitions ─────────────────────────────────────────────── */

const TOOLS = [
  {
    id: "pvgis",
    title: "PVGIS",
    subtitle: "Solar Irradiance & PV Potential",
    color: "#F59E0B",
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
    id: "facade",
    title: "Facade Inspection",
    subtitle: "Building Envelope Quality Assessment",
    color: "#4A90E2",
    status: "integrated",
    icon: Layers,
    description:
      "Automated visual assessment of building facade condition and material classification using street-level imagery. Produces a renovation urgency score and highlights degraded zones to support prioritisation across a building stock.",
    features: [
      "Material classification (brick, concrete, render, cladding)",
      "Condition rating per facade segment (0–100)",
      "Renovation urgency scoring with thresholds",
      "Crack, staining, and weathering detection",
      "Exportable facade quality report per building",
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
      lead: "Sanjay Somanath",
      pi: "Alexander Hollberg",
      institution: "Chalmers University of Technology",
      contact: "sanjay.somanath@chalmers.se",
    },
    usedIn: ["Renovation Planning", "Energy Community Planning", "Renewable Energy Planning"],
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

        {/* Attribution block (EPSM only) */}
        {t.attribution && (
          <div style={{
            background: `${tool.color}0d`,
            border: `1px solid ${tool.color}2a`,
            borderRadius: 10,
            padding: "12px 14px",
          }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.4, color: `${tool.color}aa`, marginBottom: 8 }}>
              DEVELOPED AT
            </div>
            <div style={{ fontSize: 13, color: "#f0f4ff", fontWeight: 600 }}>
              {t.attribution.institution}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 4, lineHeight: 1.6 }}>
              <span style={{ color: "rgba(255,255,255,0.75)" }}>Lead Developer:</span> {t.attribution.lead}
              <br />
              <span style={{ color: "rgba(255,255,255,0.75)" }}>Principal Investigator:</span> {t.attribution.pi}
            </div>
            <a
              href={`mailto:${t.attribution.contact}`}
              style={{ fontSize: 11, color: tool.color, textDecoration: "none", marginTop: 6, display: "inline-block", opacity: 0.8 }}
            >
              {t.attribution.contact}
            </a>
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

        {/* Summary pill row */}
        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          {[
            { label: "4 tools", sub: "total", color: "#4ECDC4" },
            { label: "3", sub: "integrated", color: "#96D74C" },
            { label: "1", sub: "external", color: "#721CB8" },
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
        gridTemplateColumns: "repeat(auto-fill, minmax(460px, 1fr))",
        gap: 20,
      }}>
        {TOOLS.map(tool => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </div>
    </div>
  );
}
