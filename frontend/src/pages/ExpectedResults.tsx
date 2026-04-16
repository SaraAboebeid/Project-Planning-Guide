import { useState, useMemo, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import { ChevronDown, ChevronUp, FileText, Layers, ShieldCheck, Activity, Database, Zap, X } from "lucide-react";

const SensitivityPanel = lazy(() => import("../components/panels/SensitivityPanel"));
const TabulaPanel = lazy(() => import("../components/panels/TabulaPanel"));
const EpcPanel = lazy(() => import("../components/panels/EpcPanel"));

/* ── Deliverables catalog (ported from pages/4_Expected_Results.py) ── */

type Deliverable = [string, string]; // [name, description]

const DELIVERABLES: Record<string, Deliverable[]> = {
  // Energy Community
  "Building Geometry": [
    ["Building Footprint & Orientation", "Floor area, height, cardinal orientation for PV/shading analysis"],
    ["Roof / Façade Area Assessment", "Available surface area for solar installations"],
  ],
  "Energy Demand": [
    ["Annual Electricity Consumption", "Total kWh per year per building"],
    ["Annual Heating Demand", "Thermal energy demand (kWh)"],
    ["Monthly / Hourly Load Profiles", "Demand curves for sizing and simulation"],
  ],
  "PV System": [
    ["Incident Radiation Analysis", "Annual & seasonal solar irradiance maps (kWh/m²)"],
    ["Optimal PV Panel Placement & Coverage %", "Best tilt, azimuth, and usable area"],
    ["Energy Yield Estimate", "Annual PV production (kWh/yr)"],
    ["Self-Consumption Ratio", "Share of PV output consumed on-site"],
    ["Grid Export Profile", "Surplus electricity fed back to the grid"],
    ["ROI / Payback Period", "Return on investment and simple payback (years)"],
    ["LCOE (Levelized Cost of Energy)", "Cost per kWh produced over system lifetime"],
  ],
  "Battery Storage": [
    ["Optimal Battery Size", "Recommended capacity (kWh) and power (kW)"],
    ["Self-Consumption Improvement", "Increase in on-site use with storage"],
    ["Peak Shaving Potential", "Demand charge reduction estimate"],
    ["ROI / Payback Period", "Financial return timeline"],
  ],
  // Renovation
  "Building Condition": [
    ["Building Condition Assessment", "Current state of fabric, systems, and services"],
    ["Energy Performance Baseline", "Current EUI and carbon intensity"],
    ["EPC / Certification Impact", "Predicted rating improvement"],
  ],
  "Retrofit Measures": [
    ["Retrofit Measure Catalog", "Prioritized list of improvement interventions"],
    ["Energy Savings Potential", "kWh and % reduction per measure"],
    ["Carbon Reduction Pathway", "kgCO₂e savings per intervention"],
    ["Cost-Benefit Analysis", "CAPEX, payback, NPV per measure"],
    ["Embodied Carbon of Retrofit", "kgCO₂e from new materials and works"],
  ],
  // Renewable Energy
  "Site & Climate": [
    ["Wind & Solar Resource Assessment", "Irradiance / wind speed characterization"],
    ["Shading Analysis", "Impact of obstacles on energy yield"],
  ],
  "System Design": [
    ["Capacity & Layout Optimization", "Sizing and placement of generation assets"],
    ["Annual Energy Production", "Expected kWh/yr from the designed system"],
    ["Capacity Factor", "Actual vs rated output ratio"],
  ],
  "Financial": [
    ["ROI / Payback Period", "Return on investment timeline"],
    ["LCOE", "Levelized cost of energy over system lifetime"],
    ["Sensitivity to Key Parameters", "Impact of price / yield variation on returns"],
  ],
};

const CROSS_CUTTING: Deliverable[] = [
  ["Executive Summary", "High-level findings and recommendations for decision-makers"],
  ["Limitations & Assumptions", "Methodology caveats, data gaps, and proxy impacts"],
  ["Methodology Statement", "Tools, standards, and data sources used"],
];

function getSections(projectType: string | null, systems: string[]): [string, Deliverable[]][] {
  const sysSet = new Set(systems);
  const sections: [string, Deliverable[]][] = [];

  if (projectType === "Energy Community Planning") {
    sections.push(["Building Geometry", DELIVERABLES["Building Geometry"]]);
    sections.push(["Energy Demand", DELIVERABLES["Energy Demand"]]);
    if (sysSet.has("Rooftop PV") || sysSet.has("Community PV") || sysSet.has("Facade PV (BIPV)"))
      sections.push(["PV System", DELIVERABLES["PV System"]]);
    if (sysSet.has("Battery System"))
      sections.push(["Battery Storage", DELIVERABLES["Battery Storage"]]);
  } else if (projectType === "Renovation Planning") {
    sections.push(["Building Condition", DELIVERABLES["Building Condition"]]);
    sections.push(["Retrofit Measures", DELIVERABLES["Retrofit Measures"]]);
  } else if (projectType === "Renewable Energy Planning") {
    sections.push(["Site & Climate", DELIVERABLES["Site & Climate"]]);
    sections.push(["System Design", DELIVERABLES["System Design"]]);
    sections.push(["Financial", DELIVERABLES["Financial"]]);
  }

  return sections;
}

/* ── Data Explorer ── */

type PanelId = "sensitivity" | "tabula" | "epc";

const PANELS: { id: PanelId; label: string; icon: typeof Activity; color: string; desc: string }[] = [
  { id: "sensitivity", label: "Sensitivity Analysis", icon: Activity, color: "from-[#2b4a7e] to-[#2e9e96]", desc: "OAT parameter importance & response curves" },
  { id: "tabula", label: "TABULA Results", icon: Database, color: "from-[#f59e0b] to-[#ef4444]", desc: "Building archetype U-values & energy demand" },
  { id: "epc", label: "EPC Results", icon: Zap, color: "from-[#7da828] to-[#2e9e96]", desc: "Energy performance certificates & trends" },
];

function DataExplorer() {
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <p className="ppg-section-title">Data Explorer</p>
        <h3 className="text-lg font-bold text-slate-800">Analysis Results & Reference Data</h3>
        <p className="text-sm text-gray-500 mt-1">
          Click a card below to explore pre-computed analysis results interactively.
        </p>
      </div>

      {/* Toggle buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PANELS.map((p) => {
          const Icon = p.icon;
          const isActive = activePanel === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setActivePanel(isActive ? null : p.id)}
              className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                isActive
                  ? "border-teal shadow-md bg-white"
                  : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
              }`}
            >
              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${p.color} flex items-center justify-center mb-2.5`}>
                <Icon className="w-4.5 h-4.5 text-white" />
              </div>
              <h4 className="text-sm font-semibold text-slate-800">{p.label}</h4>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{p.desc}</p>
              {isActive && (
                <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                  <X className="w-3 h-3 text-gray-400" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Panel content */}
      {activePanel && (
        <div className="ppg-card animate-in fade-in duration-200">
          <Suspense fallback={<div className="text-center py-12 text-gray-400 text-sm">Loading…</div>}>
            {activePanel === "sensitivity" && <SensitivityPanel />}
            {activePanel === "tabula" && <TabulaPanel />}
            {activePanel === "epc" && <EpcPanel />}
          </Suspense>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */

export default function ExpectedResults() {
  const navigate = useNavigate();
  const { project, steps } = useWizardStore();
  const isReno = project.projectType === "Renovation Planning";

  const sections = useMemo(
    () => getSections(project.projectType, project.systemsInScope),
    [project.projectType, project.systemsInScope]
  );

  const totalDeliverables =
    sections.reduce((s, [, items]) => s + items.length, 0) + CROSS_CUTTING.length;

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(sections.map(([t]) => t))
  );
  const [crossExpanded, setCrossExpanded] = useState(false);

  const toggle = (key: string) =>
    setExpandedSections((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const prevPath = isReno ? "/step/4" : "/step/2";
  const nextPath = isReno ? "/step/6" : "/step/4";

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-800">Expected Results</h2>
      <p className="text-sm text-gray-500">
        Deliverables that will be included in the final report based on your project type and systems.
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border p-4 text-center bg-navy/10 border-navy/25">
          <FileText className="w-5 h-5 mx-auto mb-1 text-navy" />
          <div className="text-2xl font-bold text-navy">{totalDeliverables}</div>
          <div className="text-xs text-gray-500">Report Deliverables</div>
        </div>
        <div className="ppg-stat ppg-stat-teal">
          <Layers className="w-5 h-5 mx-auto mb-1 text-teal" />
          <div className="text-2xl font-bold text-teal">{sections.length}</div>
          <div className="text-xs text-gray-500">Analysis Sections</div>
        </div>
        <div className="ppg-stat ppg-stat-green">
          <ShieldCheck className="w-5 h-5 mx-auto mb-1 text-green" />
          <div className="text-2xl font-bold text-green">{CROSS_CUTTING.length}</div>
          <div className="text-xs text-gray-500">Cross-Cutting</div>
        </div>
      </div>

      {/* Sections */}
      {sections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
          No deliverables mapped for the current project configuration.
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map(([title, items]) => {
            const open = expandedSections.has(title);
            return (
              <div key={title} className="ppg-card overflow-hidden">
                <button
                  onClick={() => toggle(title)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50"
                >
                  <span className="font-semibold text-sm text-dark">
                    {title}{" "}
                    <span className="text-xs text-gray-400">({items.length} deliverables)</span>
                  </span>
                  {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                {open && (
                  <div className="px-5 pb-4 space-y-1">
                    {items.map(([name, desc]) => (
                      <div
                        key={name}
                        className="px-3 py-2 rounded-lg bg-[#f8fafc] border-l-[3px] border-teal"
                      >
                        <div className="text-sm font-semibold text-dark">{name}</div>
                        <div className="text-xs text-gray-500">{desc}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Cross-cutting */}
          <div className="ppg-card overflow-hidden">
            <button
              onClick={() => setCrossExpanded((p) => !p)}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50"
            >
              <span className="font-semibold text-sm text-dark">
                Cross-Cutting Deliverables{" "}
                <span className="text-xs text-gray-400">({CROSS_CUTTING.length} items)</span>
              </span>
              {crossExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {crossExpanded && (
              <div className="px-5 pb-4 space-y-1">
                {CROSS_CUTTING.map(([name, desc]) => (
                  <div
                    key={name}
                    className="px-3 py-2 rounded-lg bg-[#f8fafc] border-l-[3px] border-gray-400"
                  >
                    <div className="text-sm font-semibold text-dark">{name}</div>
                    <div className="text-xs text-gray-500">{desc}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Data Explorer ── */}
      <DataExplorer />

      {/* Navigation */}
      <div className="flex justify-between pt-4 pb-8">
        <button onClick={() => navigate(prevPath)} className="ppg-btn-secondary">← Back</button>
        <button onClick={() => navigate(nextPath)} className="ppg-btn-primary">Continue →</button>
      </div>
    </div>
  );
}
