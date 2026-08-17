import { useState, useMemo, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import { ChevronDown, ChevronUp, FileText, Layers, ShieldCheck, Activity, Database, Zap, X, Calendar } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const SensitivityPanel = lazy(() => import("../components/panels/SensitivityPanel"));
const TabulaPanel = lazy(() => import("../components/panels/TabulaPanel"));
const EpcPanel = lazy(() => import("../components/panels/EpcPanel"));

/* ── Timeline constants (from Timeline.tsx) ── */
const EFFORT_BASE: Record<string, number> = {
  "Energy & Carbon Performance": 60,
  "Renewable Energy & Local Production": 50,
  "Climate Resilience": 70,
  "Retrofit & Transformation": 65,
  "Urban Design Support": 55,
  "Infrastructure Planning": 60,
  "Equity & Social Impact": 50,
};
const SCALE_MULT: Record<string, number> = { Building: 1.0, Neighborhood: 1.8, City: 2.5 };
const PHASE_SPLIT: [string, number][] = [
  ["Scoping", 0.1],
  ["Data Collection", 0.3],
  ["Modeling & Simulation", 0.35],
  ["Validation & QA", 0.15],
  ["Reporting", 0.1],
];
const TL_COLORS = ["#33528A", "#33A9A0", "#8AB62E", "#C4E81D", "#597001"];

function fmt(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

interface TimelineRow { task: string; start: string; finish: string; hours: number; owner: string; }

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
    sections.push(["Building Geometry", DELIVERABLES["Building Geometry"]!]);
    sections.push(["Energy Demand", DELIVERABLES["Energy Demand"]!]);
    if (sysSet.has("Rooftop PV") || sysSet.has("Community PV") || sysSet.has("Facade PV"))
      sections.push(["PV System", DELIVERABLES["PV System"]!]);
    if (sysSet.has("Battery System"))
      sections.push(["Battery Storage", DELIVERABLES["Battery Storage"]!]);
  } else if (projectType === "Renovation Planning") {
    sections.push(["Building Condition", DELIVERABLES["Building Condition"]!]);
    sections.push(["Retrofit Measures", DELIVERABLES["Retrofit Measures"]!]);
  } else if (projectType === "Renewable Energy Planning") {
    sections.push(["Site & Climate", DELIVERABLES["Site & Climate"]!]);
    sections.push(["System Design", DELIVERABLES["System Design"]!]);
    sections.push(["Financial", DELIVERABLES["Financial"]!]);
  }

  return sections;
}

/* ── Data Explorer ── */

type PanelId = "sensitivity" | "tabula" | "epc";

const PANELS: { id: PanelId; label: string; icon: typeof Activity; color: string; desc: string }[] = [
  { id: "sensitivity", label: "Sensitivity Analysis", icon: Activity, color: "from-[#2b4a7e] to-[#2e9e96]", desc: "OAT parameter importance & response curves" },
  { id: "tabula", label: "TABULA Results", icon: Database, color: "from-[#E8880C] to-[#E2483B]", desc: "Building archetype U-values & energy demand" },
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
  const { project } = useWizardStore();

  /* ── Tab state ── */
  const [activeTab, setActiveTab] = useState<"deliverables" | "timeline">("deliverables");

  /* ── Deliverables ── */
  const sections = useMemo(
    () => getSections(project.projectType, project.systemsInScope),
    [project.projectType, project.systemsInScope]
  );
  const totalDeliverables =
    sections.reduce((s, [, items]) => s + items.length, 0) + CROSS_CUTTING.length;
  const [openSection, setOpenSection] = useState<string | null>(() => sections[0]?.[0] ?? "__cross__");
  const toggle = (key: string) =>
    setOpenSection((prev) => (prev === key ? null : key));

  /* ── Timeline ── */
  const baseHours = EFFORT_BASE["Retrofit & Transformation"] ?? 55;
  const scaleMult = SCALE_MULT[project.scale ?? "Building"] ?? 1.0;
  const dataCovPct = 50;
  const completenessMult = 1.0 + (1.0 - dataCovPct / 100) * 0.7;
  const totalHours = Math.round(baseHours * scaleMult * completenessMult);

  const [phaseHours, setPhaseHours] = useState<Record<string, number>>(
    () => Object.fromEntries(PHASE_SPLIT.map(([p, frac]) => [p, Math.round(totalHours * frac)]))
  );
  const [startDate, setStartDate] = useState(fmt(new Date()));
  const [rows, setRows] = useState<TimelineRow[]>([]);

  const userTotalHours = useMemo(() => Object.values(phaseHours).reduce((a, b) => a + b, 0), [phaseHours]);
  const userWeeks = Math.max(1, Math.round(userTotalHours / 30));
  const maxPhaseHrs = Math.max(...Object.values(phaseHours), 1);

  function generateTimeline() {
    let current = new Date(startDate);
    const newRows: TimelineRow[] = [];
    for (const [phase, hrs] of Object.entries(phaseHours)) {
      const weeks = Math.max(1, Math.round(hrs / 30));
      const finish = addDays(current, weeks * 7);
      newRows.push({ task: phase, start: fmt(current), finish: fmt(finish), hours: hrs, owner: "" });
      current = finish;
    }
    setRows(newRows);
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-800">Expected Results &amp; Timeline</h2>
      <p className="text-sm text-gray-500">
        Review the deliverables included in your report and generate a project schedule.
      </p>

      {/* Tab switcher */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("deliverables")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "deliverables"
              ? "border-[#2b4a7e] text-[#2b4a7e]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <FileText className="w-4 h-4 inline mr-1.5" />Deliverables
        </button>
        <button
          onClick={() => setActiveTab("timeline")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "timeline"
              ? "border-[#2b4a7e] text-[#2b4a7e]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Calendar className="w-4 h-4 inline mr-1.5" />Timeline
        </button>
      </div>

      {/* ── DELIVERABLES TAB ── */}
      {activeTab === "deliverables" && (
        <>
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
                const open = openSection === title;
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
                          <div key={name} className="px-3 py-2 rounded-lg bg-[#f8fafc] border-l-[3px] border-teal">
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
                  onClick={() => setOpenSection((p) => (p === "__cross__" ? null : "__cross__"))}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50"
                >
                  <span className="font-semibold text-sm text-dark">
                    Cross-Cutting Deliverables{" "}
                    <span className="text-xs text-gray-400">({CROSS_CUTTING.length} items)</span>
                  </span>
                  {openSection === "__cross__" ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                {openSection === "__cross__" && (
                  <div className="px-5 pb-4 space-y-1">
                    {CROSS_CUTTING.map(([name, desc]) => (
                      <div key={name} className="px-3 py-2 rounded-lg bg-[#f8fafc] border-l-[3px] border-gray-400">
                        <div className="text-sm font-semibold text-dark">{name}</div>
                        <div className="text-xs text-gray-500">{desc}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Data Explorer */}
          <DataExplorer />
        </>
      )}

      {/* ── TIMELINE TAB ── */}
      {activeTab === "timeline" && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { value: `${userTotalHours} hrs`, label: "Estimated Effort", cls: "ppg-stat-navy", textCls: "text-[#2b4a7e]" },
              { value: `${userWeeks} wk`, label: "Duration", cls: "ppg-stat-teal", textCls: "text-[#2e9e96]" },
              { value: String(PHASE_SPLIT.length), label: "Phases", cls: "ppg-stat-green", textCls: "text-[#7da828]" },
            ].map((c) => (
              <div key={c.label} className={`ppg-stat ${c.cls}`}>
                <div className={`text-2xl font-bold ${c.textCls}`}>{c.value}</div>
                <div className="text-xs text-slate-500">{c.label}</div>
              </div>
            ))}
          </div>

          {/* Phase editor */}
          <div className="ppg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-dark">Effort Breakdown</h3>
              <button
                onClick={() => setPhaseHours(Object.fromEntries(PHASE_SPLIT.map(([p, f]) => [p, Math.round(totalHours * f)])))}
                className="text-xs text-teal hover:underline"
              >
                Reset to estimates
              </button>
            </div>
            <div className="space-y-3">
              {PHASE_SPLIT.map(([phase]) => {
                const hrs = phaseHours[phase] ?? 0;
                const pct = (hrs / maxPhaseHrs) * 100;
                return (
                  <div key={phase} className="grid grid-cols-[2fr_1fr_4fr] gap-3 items-center">
                    <span className="text-sm font-medium">{phase}</span>
                    <input
                      type="number" min={0} value={hrs}
                      onChange={(e) => setPhaseHours((prev) => ({ ...prev, [phase]: Number(e.target.value) }))}
                      className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm text-center"
                    />
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-teal rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              <strong>Total:</strong> {userTotalHours} hours &nbsp;|&nbsp;{" "}
              <strong>Duration:</strong> ~{userWeeks} weeks (at 30 hrs/week)
            </p>
          </div>

          {/* Date + generate */}
          <div className="flex items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project Start</label>
              <input
                type="date" value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <button onClick={generateTimeline} className="px-5 py-2 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy/90">
              Generate Timeline
            </button>
            <button onClick={() => setRows([])} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">
              Clear
            </button>
          </div>

          {/* Timeline table */}
          {rows.length > 0 && (
            <div className="ppg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>{["Task", "Start", "Finish", "Hours", "Owner"].map((h) => (
                    <th key={h} className="px-4 py-2 text-left font-medium text-gray-600">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-4 py-2 font-medium">{r.task}</td>
                      <td className="px-4 py-2 text-gray-500">{r.start}</td>
                      <td className="px-4 py-2 text-gray-500">{r.finish}</td>
                      <td className="px-4 py-2">{r.hours}</td>
                      <td className="px-4 py-2">
                        <input
                          type="text" value={r.owner} placeholder="—"
                          onChange={(e) => { const next = [...rows]; next[i] = { ...r, owner: e.target.value }; setRows(next); }}
                          className="w-full bg-transparent text-sm outline-none"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Gantt bar chart */}
          {rows.length > 0 && (
            <div className="ppg-card p-5">
              <h3 className="font-semibold text-dark mb-3">Project Gantt</h3>
              <ResponsiveContainer width="100%" height={rows.length * 55 + 60}>
                <BarChart data={rows.map((r) => ({ name: r.task, hours: r.hours }))} layout="vertical" margin={{ left: 120 }}>
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={120} />
                  <Tooltip />
                  <Bar dataKey="hours" radius={[0, 6, 6, 0]}>
                    {rows.map((_, i) => <Cell key={i} fill={TL_COLORS[i % TL_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4 pb-8">
        <button onClick={() => navigate("/step/3")} className="ppg-btn-secondary">← Back</button>
        <button onClick={() => navigate("/step/5")} className="ppg-btn-primary">Continue →</button>
      </div>
    </div>
  );
}
