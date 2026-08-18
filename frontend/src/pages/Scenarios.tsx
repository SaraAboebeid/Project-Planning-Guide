import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import { Hammer, Zap, Sun, Cpu, Users, BarChart2, Layers, TrendingUp } from "lucide-react";

/* ─── Project flow diagram ─────────────────────────────────────────── */

type SubNodeType = "input" | "db" | "estimate" | "engine" | "scenario" | "output";

const FLOW_DATA: Record<string, {
  color: string;
  steps: Array<{
    n: number; label: string; color: string; isHere?: boolean;
    subNodes: Array<{ label: string; type: SubNodeType }>;
  }>;
}> = {
  "Energy Community Planning": {
    color: "#4ECDC4",
    steps: [
      {
        n: 1, label: "Define Project", color: "var(--brand)",
        subNodes: [
          { label: "Project type: Energy Community", type: "input" },
          { label: "Systems: PV, Battery, Grid", type: "input" },
          { label: "KPIs: self-consumption, cost saving", type: "input" },
          { label: "Location: site drawn on map", type: "input" },
        ],
      },
      {
        n: 2, label: "Building Data & Prioritisation", color: "#4A90E2",
        subNodes: [
          { label: "EUBUCCO 3D geometry", type: "db" },
          { label: "Smart meter data (proxy)", type: "estimate" },
          { label: "PVGIS solar irradiance", type: "db" },
          { label: "DSO grid capacity (proxy)", type: "estimate" },
        ],
      },
      {
        n: 3, label: "Data Overview", color: "#4ECDC4",
        subNodes: [
          { label: "OAT Sensitivity analysis", type: "engine" },
          { label: "Data readiness: 68%", type: "output" },
          { label: "Model confidence: 61%", type: "output" },
        ],
      },
      {
        n: 4, label: "Scenarios", color: "#E8880C", isHere: true,
        subNodes: [
          { label: "A — Minimal PV (rooftop only)", type: "scenario" },
          { label: "B — PV + Battery storage", type: "scenario" },
          { label: "C — Full Energy Community", type: "scenario" },
        ],
      },
      {
        n: 5, label: "Timeline & Cost", color: "#2FB477",
        subNodes: [
          { label: "12-month project schedule", type: "output" },
          { label: "CAPEX estimate: 2.1M SEK", type: "output" },
          { label: "EC Feasibility Report (PDF)", type: "output" },
        ],
      },
    ],
  },
  "Renovation Planning": {
    color: "var(--brand)",
    steps: [
      {
        n: 1, label: "Define Project", color: "var(--brand)",
        subNodes: [
          { label: "Project type: Renovation", type: "input" },
          { label: "Systems: Envelope, HVAC, Windows", type: "input" },
          { label: "KPIs: EPC class, payback period", type: "input" },
          { label: "Location: address or bbox", type: "input" },
        ],
      },
      {
        n: 2, label: "Building Data & Prioritisation", color: "#4A90E2",
        subNodes: [
          { label: "EUBUCCO footprint + floors, EPC class", type: "db" },
          { label: "TABULA archetype match", type: "db" },
          { label: "Add / import own data (CSV / JSON / inline)", type: "input" },
          { label: "Facade defect detection — MBDD2025 + AI vision", type: "engine" },
          { label: "MCDA retrofit prioritization (E/F/C/R + AHP)", type: "output" },
        ],
      },
      {
        n: 3, label: "Select & Baseline", color: "#4ECDC4",
        subNodes: [
          { label: "EnergyPlus baseline via EPSM", type: "engine" },
          { label: "As-built heating / cooling / total", type: "output" },
          { label: "Per-building shoebox model", type: "engine" },
        ],
      },
      {
        n: 4, label: "Calculator", color: "#E8880C", isHere: true,
        subNodes: [
          { label: "Build packages (catalogue + layers)", type: "input" },
          { label: "Cost (Wikells) + carbon (Boverket)", type: "db" },
          { label: "Multi-objective optimizer — Pareto + parallel coords", type: "engine" },
          { label: "Energy simulation per package (EPSM)", type: "engine" },
          { label: "Regret / robustness decision analysis", type: "output" },
        ],
      },
      {
        n: 5, label: "Report", color: "#2FB477",
        subNodes: [
          { label: "Recommended packages + climate target", type: "output" },
          { label: "Energy, cost & carbon savings", type: "output" },
          { label: "Decision under uncertainty (regret)", type: "output" },
          { label: "Renovation Report (PDF)", type: "output" },
        ],
      },
    ],
  },
  "Renewable Energy Planning": {
    color: "#2FB477",
    steps: [
      {
        n: 1, label: "Define Project", color: "var(--brand)",
        subNodes: [
          { label: "Project type: Renewable Energy", type: "input" },
          { label: "Systems: PV, Wind, Storage", type: "input" },
          { label: "KPIs: annual yield, LCOE, payback", type: "input" },
          { label: "Location: roof or site drawn", type: "input" },
        ],
      },
      {
        n: 2, label: "Building Data & Prioritisation", color: "#4A90E2",
        subNodes: [
          { label: "EUBUCCO roof geometry", type: "db" },
          { label: "PVGIS annual irradiation", type: "db" },
          { label: "Shading analysis (proxy)", type: "estimate" },
          { label: "Grid connection point (proxy)", type: "estimate" },
        ],
      },
      {
        n: 3, label: "Data Overview", color: "#4ECDC4",
        subNodes: [
          { label: "OAT Sensitivity analysis", type: "engine" },
          { label: "Data readiness: 71%", type: "output" },
          { label: "Model confidence: 65%", type: "output" },
        ],
      },
      {
        n: 4, label: "Scenarios", color: "#E8880C", isHere: true,
        subNodes: [
          { label: "A — Rooftop PV (standard)", type: "scenario" },
          { label: "B — PV + battery storage", type: "scenario" },
          { label: "C — Max yield + export", type: "scenario" },
        ],
      },
      {
        n: 5, label: "Timeline & Cost", color: "#2FB477",
        subNodes: [
          { label: "9-month installation plan", type: "output" },
          { label: "RE Feasibility Report (PDF)", type: "output" },
        ],
      },
    ],
  },
};

const SUB_COLORS: Record<SubNodeType, string> = {
  input:    "var(--brand)",
  db:       "#4A90E2",
  estimate: "#E8880C",
  engine:   "#4ECDC4",
  scenario: "#E8880C",
  output:   "#2FB477",
};

const SUB_LABELS: Record<SubNodeType, string> = {
  input:    "USER INPUT",
  db:       "DATABASE",
  estimate: "ESTIMATED",
  engine:   "ENGINE",
  scenario: "SCENARIO",
  output:   "OUTPUT",
};

const PHASE_LABELS = [
  "1. DEFINE", "2. BUILDING DATA", "3. BASELINE", "4. CALCULATE", "5. REPORT",
];

const GRID9 = "1fr 28px 1fr 28px 1fr 28px 1fr 28px 1fr";

const TAB_COLORS: Record<string, string> = {
  "Energy Community Planning": "#4ECDC4",
  "Renovation Planning":       "var(--brand)",
  "Renewable Energy Planning": "#2FB477",
};

/* Pathways kept for later but not yet selectable — shown greyed, consistent with
   Step 1 where Energy Community / Renewable Energy are disabled project types. */
const DISABLED_PATHWAYS = new Set(["Energy Community Planning", "Renewable Energy Planning"]);

/* ─── Flow Diagram component ──────────────────────────────────────────── */
function ProjectFlowDiagram({ activeType, onTypeChange }: {
  activeType: string;
  onTypeChange: (t: string) => void;
}) {
  const navigate = useNavigate();
  const flow = FLOW_DATA[activeType];
  const tabs = Object.keys(FLOW_DATA);

  return (
    <div style={{
      borderRadius: 14,
      background: "rgba(255,255,255,0.015)",
      border: "1px solid rgba(255,255,255,0.07)",
      marginBottom: 20, overflow: "hidden",
    }}>
      {/* ── Header + Tabs ── */}
      <div style={{ padding: "14px 18px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{
          fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.28)",
          letterSpacing: 1.5, marginBottom: 10,
        }}>
          STEP-BY-STEP WORKFLOW
        </div>
        <div style={{ display: "flex", gap: 6, paddingBottom: 14 }}>
          {tabs.map(t => {
            const col = TAB_COLORS[t];
            const on = t === activeType;
            const disabled = DISABLED_PATHWAYS.has(t);
            return (
              <button key={t}
                onClick={disabled ? undefined : () => onTypeChange(t)}
                disabled={disabled}
                title={disabled ? "Coming soon — not available yet" : undefined}
                style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                cursor: disabled ? "not-allowed" : "pointer",
                border: `1px solid ${on && !disabled ? col : "rgba(255,255,255,0.10)"}`,
                background: on && !disabled ? `${col}22` : "transparent",
                color: disabled ? "rgba(255,255,255,0.24)" : on ? col : "rgba(255,255,255,0.38)",
                opacity: disabled ? 0.6 : 1,
                transition: "all 0.15s",
              }}>
                {t.replace(" Planning", "")}{disabled ? " · soon" : ""}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Diagram ── */}
      <div style={{ overflowX: "auto", padding: "18px 20px 22px" }}>
        <div style={{ minWidth: 800 }}>

          {/* Phase labels */}
          <div style={{ display: "grid", gridTemplateColumns: GRID9, marginBottom: 6 }}>
            {flow.steps.flatMap((step, idx) => {
              const ph = (
                <div key={`ph-${step.n}`} style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: 1.3,
                  color: step.color + "cc", textAlign: "center",
                  paddingBottom: 6, borderBottom: `2px solid ${step.color}30`,
                }}>
                  {PHASE_LABELS[idx]}
                </div>
              );
              return idx < flow.steps.length - 1
                ? [ph, <div key={`ph-sp-${idx}`} />]
                : [ph];
            })}
          </div>

          {/* Step nodes + arrows */}
          <div style={{ display: "grid", gridTemplateColumns: GRID9, alignItems: "center", marginTop: 12 }}>
            {flow.steps.flatMap((step, idx) => {
              const isHere = !!step.isHere;
              const node = (
                <div
                  key={`node-${step.n}`}
                  onClick={() => !isHere && navigate(`/step/${step.n}`)}
                  style={{
                    borderRadius: 10, padding: "12px 10px", position: "relative",
                    background: isHere ? `${step.color}18` : "rgba(255,255,255,0.03)",
                    border: `1px solid ${isHere ? step.color + "60" : step.color + "32"}`,
                    cursor: isHere ? "default" : "pointer",
                    boxShadow: isHere ? `0 0 24px ${step.color}20` : "none",
                    transition: "border-color 0.15s",
                  }}
                >
                  <div style={{
                    width: 24, height: 24, borderRadius: 7,
                    background: `${step.color}22`, border: `1px solid ${step.color}44`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 800, color: step.color, marginBottom: 8,
                  }}>{step.n}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>
                    {step.label}
                  </div>

                </div>
              );
              const arrow = idx < flow.steps.length - 1 ? (
                <div key={`arr-${idx}`} style={{ display: "flex", alignItems: "center" }}>
                  <div style={{
                    flex: 1, height: 1,
                    background: `linear-gradient(to right, ${step.color}50, ${flow.steps[idx + 1].color}50)`,
                  }} />
                  <div style={{
                    width: 0, height: 0,
                    borderTop: "4px solid transparent",
                    borderBottom: "4px solid transparent",
                    borderLeft: `5px solid ${flow.steps[idx + 1].color}70`,
                  }} />
                </div>
              ) : null;
              return arrow ? [node, arrow] : [node];
            })}
          </div>

          {/* Vertical dashed connectors */}
          <div style={{ display: "grid", gridTemplateColumns: GRID9 }}>
            {flow.steps.flatMap((step, idx) => {
              const conn = (
                <div key={`vc-${step.n}`} style={{ display: "flex", justifyContent: "center" }}>
                  <div style={{ width: 0, height: 14, borderLeft: `1px dashed ${step.color}40` }} />
                </div>
              );
              return idx < flow.steps.length - 1
                ? [conn, <div key={`vc-sp-${idx}`} />]
                : [conn];
            })}
          </div>

          {/* Sub-nodes */}
          <div style={{ display: "grid", gridTemplateColumns: GRID9, gap: "0 6px" }}>
            {flow.steps.flatMap((step, idx) => {
              const stack = (
                <div key={`sub-${step.n}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {step.subNodes.map((node, i) => {
                    const col = SUB_COLORS[node.type];
                    return (
                      <div key={i} style={{
                        borderRadius: 7, padding: "5px 8px",
                        background: `${col}0d`, border: `1px solid ${col}28`,
                      }}>
                        <div style={{
                          fontSize: 8, fontWeight: 700, color: col + "99",
                          letterSpacing: 0.8, marginBottom: 2,
                        }}>
                          {SUB_LABELS[node.type]}
                        </div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.62)", lineHeight: 1.35 }}>
                          {node.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
              return idx < flow.steps.length - 1
                ? [stack, <div key={`sub-sp-${idx}`} />]
                : [stack];
            })}
          </div>

          {/* ── Pathway deliverables row ── */}
          {(() => {
            const pw = PATHWAYS.find(p => p.key === activeType);
            if (!pw) return null;
            const Ic = pw.Icon;
            return (
              <div style={{
                marginTop: 14, paddingTop: 14,
                borderTop: `1px solid ${pw.color}25`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    background: `${pw.color}20`, border: `1px solid ${pw.color}45`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Ic size={12} color={pw.color} />
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 800, color: `${pw.color}cc`, letterSpacing: 1.3 }}>
                    PATHWAY DELIVERABLES
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 7 }}>
                  {pw.outputs.map((o) => (
                    <div key={o.n} style={{
                      borderRadius: 8, padding: "8px 10px",
                      background: `${pw.color}0d`, border: `1px solid ${pw.color}30`,
                    }}>
                      <div style={{
                        fontSize: 8, fontWeight: 800, color: pw.color,
                        letterSpacing: 0.8, marginBottom: 4,
                      }}>OUTPUT {o.n}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.68)", lineHeight: 1.4 }}>
                        {o.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Legend */}
          <div style={{
            display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap",
            borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 12, alignItems: "center",
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.22)", letterSpacing: 1 }}>
              LEGEND
            </div>
            {(Object.entries(SUB_LABELS) as [SubNodeType, string][]).map(([type, label]) => (
              <div key={type} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: 2,
                  background: SUB_COLORS[type] + "80", border: `1px solid ${SUB_COLORS[type]}60`,
                }} />
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.32)" }}>{label}</span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: 8 }}>
              <div style={{ width: 18, height: 1, background: "rgba(255,255,255,0.28)" }} />
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.32)" }}>Data Flow</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 18, height: 0, borderTop: "1px dashed rgba(255,255,255,0.28)" }} />
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.32)" }}>Tool Connection</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Data ─────────────────────────────────────────────────────────── */

const PATHWAYS = [
  {
    key: "Renovation Planning",
    label: "Renovation",
    sub: "Planning",
    color: "var(--brand)",
    bgActive: "var(--brand)",
    borderActive: "var(--brand)",
    Icon: Hammer,
    outputs: [
      { n: "01", text: "Retrofit priority ranking (MCDA)" },
      { n: "02", text: "Pareto-optimal package trade-offs" },
      { n: "03", text: "EnergyPlus energy · cost · carbon per package" },
      { n: "04", text: "City climate-target reduction (%)" },
      { n: "05", text: "Robust choice under price uncertainty" },
    ],
  },
  {
    key: "Energy Community Planning",
    label: "Energy Community",
    sub: "Planning",
    color: "#4ECDC4",
    bgActive: "#4ECDC4",
    borderActive: "#4ECDC4",
    Icon: Zap,
    outputs: [
      { n: "01", text: "Member building eligibility" },
      { n: "02", text: "Load-sharing scenarios" },
      { n: "03", text: "PV + battery system sizing" },
      { n: "04", text: "Self-consumption ratio" },
      { n: "05", text: "Grid import reduction" },
    ],
  },
  {
    key: "Renewable Energy Planning",
    label: "Renewable Energy",
    sub: "Planning",
    color: "#2FB477",
    bgActive: "rgba(47,180,119,0.10)",
    borderActive: "#2FB477",
    Icon: Sun,
    outputs: [
      { n: "01", text: "Roof area → kWp capacity" },
      { n: "02", text: "Annual yield (kWh/yr)" },
      { n: "03", text: "LCOE per scenario" },
      { n: "04", text: "Self-sufficiency ratio" },
      { n: "05", text: "Carbon payback time" },
    ],
  },
] as const;

const ENGINE_TAGS = [
  { label: "EnergyPlus / EPSM",     color: "#4ECDC4" },
  { label: "MCDA + AHP",            color: "#E8880C" },
  { label: "Facade ML (MBDD2025)",  color: "#E6194B" },
  { label: "Pareto optimizer",      color: "#B98BE8" },
  { label: "Regret / Hurwicz",      color: "#4A90E2" },
  { label: "Sensitivity OAT",       color: "#4A90E2" },
  { label: "TABULA Archetypes",     color: "#4ECDC4" },
  { label: "Wikells Cost DB",       color: "var(--brand)" },
  { label: "Boverket Klimatdb",     color: "#2FB477" },
  { label: "Nord Pool spot price",  color: "#4A90E2" },
];

/* ─── Per-project-type OAT sensitivity data ─────────────────────────── */
type OatStatus = "available" | "partial" | "proxy" | "assumed" | "missing";
interface OatParam {
  key: string; label: string; category: string;
  rangeKwh: number; status: OatStatus; insight: string;
}

const OAT_BY_TYPE: Record<string, { metric: string; unit: string; params: OatParam[] }> = {
  "Renovation Planning": {
    metric: "Heating demand spread", unit: "kWh/yr",
    params: [
      { key: "roof_shape_angle",     label: "Roof Shape & Angle",    category: "Geometry",    rangeKwh: 211553, status: "missing",   insight: "Roof geometry absent from cadastral — pitch and shape create the widest uncertainty window in the thermal model." },
      { key: "infiltration",         label: "Infiltration Rate",     category: "Envelope",    rangeKwh: 139434, status: "proxy",     insight: "No blower-door test data; TABULA proxy assumed — actual airtightness can deviate ±30% from archetype." },
      { key: "heating_setpoint",     label: "Heating Setpoint",      category: "Systems",     rangeKwh: 120565, status: "assumed",   insight: "21 °C assumed per Swedish norm BBR — measured setpoints in older stock often run 22–24 °C." },
      { key: "construction_package", label: "Construction Quality",  category: "Envelope",    rangeKwh: 78284,  status: "partial",   insight: "TABULA archetype matched but renovation history unknown — actual U-values may differ significantly." },
      { key: "floors_total",         label: "Number of Floors",      category: "Geometry",    rangeKwh: 72158,  status: "available", insight: "Floor count confirmed via EUBUCCO 3D model. Low residual uncertainty." },
      { key: "footprint_length",     label: "Building Length",       category: "Geometry",    rangeKwh: 63753,  status: "available", insight: "Footprint from EUBUCCO polygon — length measured automatically." },
      { key: "footprint_width",      label: "Building Width",        category: "Geometry",    rangeKwh: 52824,  status: "available", insight: "Footprint from EUBUCCO polygon — width measured automatically." },
      { key: "window_to_wall_ratio", label: "Window-to-Wall Ratio",  category: "Envelope",    rangeKwh: 30601,  status: "partial",   insight: "WWR estimated from imagery; the in-app Facade Inspector (WWR + MBDD2025 defect detection) on uploaded photos tightens this." },
      { key: "glazing_package",      label: "Glazing Quality",       category: "Envelope",    rangeKwh: 23350,  status: "partial",   insight: "Double-glazed assumed for pre-1990 stock; triple-glazing present in some post-renovation units." },
    ],
  },
  "Energy Community Planning": {
    metric: "Annual self-consumption spread", unit: "kWh/yr",
    params: [
      { key: "load_profile",        label: "Load Profile Accuracy", category: "Demand",      rangeKwh: 185000, status: "missing",   insight: "Hourly smart meter data unavailable — synthetic profiles from Nordpool proxies add the largest spread to self-consumption modelling." },
      { key: "pv_roof_area",        label: "Usable PV Roof Area",   category: "Supply",      rangeKwh: 162000, status: "partial",   insight: "Roof polygon from EUBUCCO available but usable area after obstructions (vents, lift shafts) needs on-site survey." },
      { key: "battery_capacity",    label: "Battery Capacity",      category: "Storage",     rangeKwh: 98000,  status: "partial",   insight: "Battery sizing strongly affects self-consumption ratio — optimal sizing requires measured load shape." },
      { key: "grid_connection",     label: "Grid Connection Limit", category: "Grid",        rangeKwh: 76000,  status: "proxy",     insight: "DSO connection capacity assumed from national average — actual fuse rating from DSO inquiry needed." },
      { key: "building_mix",        label: "Building Use Mix",      category: "Demand",      rangeKwh: 61000,  status: "available", insight: "Residential/commercial split available from EUBUCCO building use classification." },
      { key: "ev_demand",           label: "EV Charging Demand",    category: "Demand",      rangeKwh: 43000,  status: "assumed",   insight: "EV penetration assumed at 30% per Trafikverket 2025 forecast — actual uptake in this block unknown." },
      { key: "tariff_structure",    label: "Tariff & Net Metering", category: "Grid",        rangeKwh: 28000,  status: "assumed",   insight: "Swedish net-metering rules applied; local DSO tariff may differ — verify with Göteborg Energi." },
      { key: "meter_resolution",    label: "Smart Meter Resolution",category: "Data",        rangeKwh: 19000,  status: "missing",   insight: "15-min resolution ideal; only monthly billing data available for this block — degrades load-matching accuracy." },
    ],
  },
  "Renewable Energy Planning": {
    metric: "Annual yield spread", unit: "kWh/yr",
    params: [
      { key: "solar_irradiance",    label: "Solar Irradiance",      category: "Climate",     rangeKwh: 198000, status: "available", insight: "PVGIS TMY data used — carries ±8% inter-annual variability for Gothenburg latitude 57.7°N. High quality but not zero uncertainty." },
      { key: "roof_area_tilt",      label: "Roof Area & Tilt",      category: "Geometry",    rangeKwh: 175000, status: "partial",   insight: "Roof polygon available from EUBUCCO but exact usable area after penetrations and optimal tilt angle needs field survey." },
      { key: "shading",             label: "Shading Obstructions",  category: "Environment", rangeKwh: 142000, status: "missing",   insight: "Nearby building and tree shading not yet quantified — shadow analysis requires LiDAR or detailed 3D model of surroundings." },
      { key: "panel_efficiency",    label: "Panel Efficiency",      category: "Technology",  rangeKwh: 88000,  status: "partial",   insight: "Generic 20% efficiency assumed; actual module choice (mono/poly/bifacial) can shift yield ±10%." },
      { key: "inverter_efficiency", label: "Inverter Efficiency",   category: "Technology",  rangeKwh: 52000,  status: "assumed",   insight: "97% European efficiency assumed from IEC 61683 typical values — product selection not yet made." },
      { key: "temp_coefficient",    label: "Temperature Coefficient",category: "Technology", rangeKwh: 38000,  status: "assumed",   insight: "–0.35%/°C assumed from standard crystalline silicon — thin-film or bifacial modules differ." },
      { key: "grid_export",         label: "Grid Export Limit",     category: "Grid",        rangeKwh: 24000,  status: "proxy",     insight: "DSO export cap assumed at 100% of installed capacity — local constraint may curtail yield." },
      { key: "install_cost",        label: "Installation Cost",     category: "Cost",        rangeKwh: 17000,  status: "assumed",   insight: "2,800 SEK/kWp assumed from Wikells 2024 — actual quotes may vary ±15%." },
    ],
  },
};

const STATUS_COLOR: Record<OatStatus, string> = {
  available: "#2FB477",
  partial:   "#E8880C",
  proxy:     "#4A90E2",
  assumed:   "#a78bfa",
  missing:   "rgba(255,80,80,0.90)",
};
const STATUS_LABEL: Record<OatStatus, string> = {
  available: "Available",
  partial:   "Partial",
  proxy:     "Proxy",
  assumed:   "Assumed",
  missing:   "Missing",
};
const TIER_LABEL = (rank: number) =>
  rank <= 2 ? "CRITICAL" : rank <= 4 ? "HIGH" : rank <= 6 ? "MODERATE" : "LOWER";
const TIER_COLOR = (rank: number) =>
  rank <= 2 ? "rgba(255,80,80,0.85)" : rank <= 4 ? "#E8880C" : rank <= 6 ? "#4A90E2" : "#2FB477";

/* ─── EC pathway detail ─────────────────────────────────────────────── */
function ECPathwayDetail() {
  const scenarios = [
    { id: "A", name: "Micro cluster",  buildings: "2–4 bldgs",  pv: "20–40 kWp",  self: "55–70%", color: "#4ECDC4" },
    { id: "B", name: "Block sharing",  buildings: "5–12 bldgs", pv: "50–120 kWp", self: "70–85%", color: "#4A90E2" },
    { id: "C", name: "District-scale", buildings: "13+ bldgs",  pv: "150+ kWp",   self: "85–95%", color: "#2FB477" },
  ];
  const inputs = [
    "Annual electricity consumption per building (kWh/yr)",
    "Roof area available for PV (m²)",
    "Existing PV or battery installations",
    "Grid connection capacity (kVA)",
    "Legal form: association, co-op or tenant-owner",
  ];
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.35)",
                    textTransform: "uppercase", letterSpacing: 2, marginBottom: 14 }}>
        Your active pathway — Energy Community
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
        {scenarios.map((s) => (
          <div key={s.id} style={{
            borderRadius: 14, padding: "16px 14px",
            background: `${s.color}0d`, border: `1px solid ${s.color}40`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: `${s.color}22`, border: `1px solid ${s.color}55`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 900, fontSize: 15, color: s.color,
              }}>{s.id}</div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{s.name}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[{ k: "Members", v: s.buildings }, { k: "PV system", v: s.pv }, { k: "Self-consumption", v: s.self }]
                .map(({ k, v }) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.40)" }}>{k}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{v}</span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{
        borderRadius: 12, padding: "14px 16px",
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Users size={14} color="rgba(255,255,255,0.40)" />
          <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.55)" }}>
            Inputs needed to run this pathway
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {inputs.map((inp, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11,
                                  color: "rgba(255,255,255,0.55)" }}>
              <span style={{ color: "#4ECDC4", fontWeight: 800, fontSize: 10, marginTop: 1, flexShrink: 0 }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              {inp}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── RE pathway detail ─────────────────────────────────────────────── */
function REPathwayDetail() {
  const scenarios = [
    { id: "A", name: "Partial roof",  pct: "50%",  kWp: "~45 kWp",  yield: "~42 MWh/yr",  color: "#2FB477" },
    { id: "B", name: "Full roof",     pct: "90%",  kWp: "~80 kWp",  yield: "~75 MWh/yr",  color: "#4A90E2" },
    { id: "C", name: "Roof + façade", pct: "100%", kWp: "~110 kWp", yield: "~100 MWh/yr", color: "#E8880C" },
  ];
  const inputs = [
    "Roof area and orientation (azimuth, tilt)",
    "Annual electricity consumption (kWh/yr)",
    "Shading obstacles (nearby buildings, trees)",
    "Grid connection type and capacity",
    "Incentive scheme: ROT-avdrag, net metering",
  ];
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.35)",
                    textTransform: "uppercase", letterSpacing: 2, marginBottom: 14 }}>
        Your active pathway — Renewable Energy
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
        {scenarios.map((s) => (
          <div key={s.id} style={{
            borderRadius: 14, padding: "16px 14px",
            background: `${s.color}0d`, border: `1px solid ${s.color}40`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9,
                background: `${s.color}22`, border: `1px solid ${s.color}55`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 900, fontSize: 15, color: s.color,
              }}>{s.id}</div>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", display: "block" }}>{s.name}</span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.30)" }}>Roof coverage {s.pct}</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[{ k: "Capacity", v: s.kWp }, { k: "Annual yield", v: s.yield }].map(({ k, v }) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.40)" }}>{k}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{
        borderRadius: 12, padding: "14px 16px",
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <BarChart2 size={14} color="rgba(255,255,255,0.40)" />
          <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.55)" }}>
            Inputs needed to run this pathway
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {inputs.map((inp, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11,
                                  color: "rgba(255,255,255,0.55)" }}>
              <span style={{ color: "#2FB477", fontWeight: 800, fontSize: 10, marginTop: 1, flexShrink: 0 }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              {inp}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Sensitivity Analysis Panel ───────────────────────────────────── */
/* ─── Sensitivity Analysis Panel — per project type ────────────────── */
function SensitivityPanel({ activeType }: { activeType: string }) {
  const [expanded, setExpanded] = useState(false);
  const data = OAT_BY_TYPE[activeType] ?? OAT_BY_TYPE["Renovation Planning"];
  const params = data.params;
  const total = params.reduce((s, p) => s + p.rangeKwh, 0);
  const top3 = params.slice(0, 3);
  const rest = params.slice(3);
  const typeColor = activeType === "Renovation Planning" ? "var(--brand)"
    : activeType === "Energy Community Planning" ? "#4ECDC4" : "#2FB477";

  return (
    <div style={{
      borderRadius: 14, overflow: "hidden",
      background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.07)",
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: "14px 18px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
            background: `${typeColor}18`, border: `1px solid ${typeColor}40`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <TrendingUp size={16} color={typeColor} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#fff", letterSpacing: 0.4 }}>
              SENSITIVITY IMPACT MAP
            </div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", marginTop: 1 }}>
              One-At-a-Time (OAT) · {data.metric} · {params.length} parameters ranked
            </div>
          </div>
        </div>
        {/* Status legend */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {(["available","partial","proxy","assumed","missing"] as OatStatus[]).map(s => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <div style={{ width: 6, height: 6, borderRadius: 2, background: STATUS_COLOR[s] }} />
              <span style={{ fontSize: 8, color: "rgba(255,255,255,0.30)" }}>{STATUS_LABEL[s]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Heatmap impact strip ── */}
      <div style={{ padding: "12px 18px 0" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.22)", letterSpacing: 1, marginBottom: 6 }}>
          IMPACT DISTRIBUTION — {data.unit.toUpperCase()}
        </div>
        <div style={{ display: "flex", height: 22, borderRadius: 8, overflow: "hidden", gap: 1 }}>
          {params.map((p) => {
            const pct = (p.rangeKwh / total) * 100;
            const col = STATUS_COLOR[p.status];
            return (
              <div key={p.key} title={`${p.label}: ${pct.toFixed(1)}%`} style={{
                width: `${pct}%`, background: col,
                opacity: 0.85, flexShrink: 0,
                position: "relative", cursor: "default",
              }}>
                {pct > 9 && (
                  <span style={{
                    position: "absolute", inset: 0, display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 8, fontWeight: 800,
                    color: "rgba(0,0,0,0.55)",
                  }}>{pct.toFixed(0)}%</span>
                )}
              </div>
            );
          })}
        </div>
        {/* strip labels */}
        <div style={{ display: "flex", height: 16, gap: 1, marginTop: 2 }}>
          {params.map((p) => {
            const pct = (p.rangeKwh / total) * 100;
            return (
              <div key={p.key} style={{
                width: `${pct}%`, flexShrink: 0, overflow: "hidden",
                fontSize: 7, color: "rgba(255,255,255,0.28)", textAlign: "center",
                whiteSpace: "nowrap", textOverflow: "clip",
              }}>{pct > 6 ? p.label.split(" ")[0] : ""}</div>
            );
          })}
        </div>
      </div>

      {/* ── Top-3 impact cards ── */}
      <div style={{ padding: "14px 18px 0", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        {top3.map((p, i) => {
          const pct = (p.rangeKwh / total) * 100;
          const col = STATUS_COLOR[p.status];
          const tierCol = TIER_COLOR(i + 1);
          return (
            <div key={p.key} style={{
              borderRadius: 12, padding: "12px 13px", position: "relative", overflow: "hidden",
              background: `${tierCol}08`,
              border: `1px solid ${tierCol}30`,
              boxShadow: i === 0 ? `0 0 20px ${tierCol}18` : "none",
            }}>
              {/* glowing left edge */}
              <div style={{
                position: "absolute", top: 0, left: 0, bottom: 0, width: 3,
                background: tierCol, borderRadius: "12px 0 0 12px",
                boxShadow: `0 0 10px ${tierCol}88`,
              }} />
              <div style={{ marginLeft: 6 }}>
                {/* tier badge + rank */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
                  <span style={{
                    fontSize: 8, fontWeight: 800, letterSpacing: 0.8, padding: "1px 6px",
                    borderRadius: 4, background: `${tierCol}22`, color: tierCol,
                    border: `1px solid ${tierCol}40`,
                  }}>{TIER_LABEL(i + 1)}</span>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.22)" }}>#{i + 1}</span>
                </div>
                {/* label */}
                <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", lineHeight: 1.2, marginBottom: 4 }}>
                  {p.label}
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.30)", marginBottom: 8 }}>
                  {p.category}
                </div>
                {/* big % */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 8 }}>
                  <span style={{ fontSize: 24, fontWeight: 900, color: tierCol, lineHeight: 1 }}>
                    {pct.toFixed(1)}
                  </span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.30)" }}>% of spread</span>
                </div>
                {/* mini bar */}
                <div style={{
                  height: 4, borderRadius: 2, background: "rgba(255,255,255,0.07)", marginBottom: 10,
                }}>
                  <div style={{
                    height: "100%", width: `${pct}%`, borderRadius: 2,
                    background: col, boxShadow: `0 0 6px ${col}66`,
                    transition: "width 0.6s ease",
                  }} />
                </div>
                {/* status + mwh */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 4,
                    background: `${col}18`, color: col, border: `1px solid ${col}35`,
                  }}>{STATUS_LABEL[p.status]}</span>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
                    ±{(p.rangeKwh / 1000).toFixed(0)} MWh
                  </span>
                </div>
                {/* insight */}
                <p style={{
                  fontSize: 10, color: "rgba(255,255,255,0.38)", margin: 0, lineHeight: 1.5,
                  borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 8,
                }}>{p.insight}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Collapsible full list ── */}
      <div style={{ padding: "12px 18px 16px" }}>
        <button onClick={() => setExpanded(!expanded)} style={{
          width: "100%", padding: "7px 12px", borderRadius: 8, cursor: "pointer",
          background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
          color: "rgba(255,255,255,0.40)", fontSize: 10, fontWeight: 600, textAlign: "left",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span>All {params.length} parameters ranked</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"
            style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
            <path d="M7 10l5 5 5-5z" />
          </svg>
        </button>
        {expanded && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
            {params.map((p, i) => {
              const pct = (p.rangeKwh / total) * 100;
              const col = STATUS_COLOR[p.status];
              return (
                <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 20, flexShrink: 0, textAlign: "right", fontSize: 9, fontWeight: 800,
                    color: i < 2 ? TIER_COLOR(i + 1) : "rgba(255,255,255,0.18)",
                  }}>#{i + 1}</span>
                  <span style={{
                    width: 160, flexShrink: 0, fontSize: 10, fontWeight: 500,
                    color: "rgba(255,255,255,0.65)", whiteSpace: "nowrap",
                    overflow: "hidden", textOverflow: "ellipsis",
                  }}>{p.label}</span>
                  <div style={{
                    flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.04)",
                    position: "relative", overflow: "hidden",
                  }}>
                    <div style={{
                      position: "absolute", inset: 0, width: `${pct}%`,
                      background: col, borderRadius: 3, boxShadow: `0 0 6px ${col}44`,
                      transition: "width 0.5s ease",
                    }} />
                  </div>
                  <span style={{ width: 34, flexShrink: 0, textAlign: "right", fontSize: 10, fontWeight: 700, color: col }}>
                    {pct.toFixed(1)}%
                  </span>
                  <span style={{
                    width: 54, flexShrink: 0, textAlign: "right", fontSize: 9,
                    padding: "1px 6px", borderRadius: 4,
                    background: `${col}14`, color: col, border: `1px solid ${col}28`,
                    fontWeight: 600,
                  }}>{STATUS_LABEL[p.status]}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Visual connectors ─────────────────────────────────────────────── */
function FlowConnector() {
  return (
    <div style={{ position: "relative", height: 36, display: "flex",
                  alignItems: "center", justifyContent: "center" }}>
      <div style={{
        position: "absolute", top: "50%", left: "16.6%", right: "16.6%",
        height: 1, background: "rgba(255,255,255,0.08)", transform: "translateY(-50%)",
      }} />
      {[16.6, 50, 83.4].map((pct) => (
        <div key={pct} style={{
          position: "absolute", top: "50%", left: `${pct}%`,
          transform: "translate(-50%,-50%)",
          width: 6, height: 6, borderRadius: "50%",
          background: "rgba(255,255,255,0.18)",
        }} />
      ))}
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        width: 1, height: "50%", background: "rgba(255,255,255,0.08)",
        transform: "translateX(-50%)",
      }} />
      <div style={{
        position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
        color: "rgba(255,255,255,0.22)", fontSize: 11, lineHeight: 1,
      }}>▼</div>
    </div>
  );
}

function DownArrow() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: 32, justifyContent: "center" }}>
      <div style={{ width: 1, flex: 1, background: "rgba(255,255,255,0.08)" }} />
      <div style={{ color: "rgba(255,255,255,0.22)", fontSize: 11, lineHeight: 1 }}>▼</div>
    </div>
  );
}

/* ─── Roadmap ───────────────────────────────────────────────────────── */
function ToolRoadmap({ activeType }: { activeType: string | null }) {
  const { project } = useWizardStore();
  const [activeFlowType, setActiveFlowType] = useState<string>(() => {
    // Open on the user's type, but never on a disabled pathway (EC/RE) — default
    // to Renovation, the only enabled track.
    const t = project.projectType ?? "Renovation Planning";
    return DISABLED_PATHWAYS.has(t) ? "Renovation Planning" : t;
  });

  return (
    <div style={{ paddingBottom: 32 }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: 0 }}>Pathways</h2>
          <span style={{
            padding: "2px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
            background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.40)",
            border: "1px solid rgba(255,255,255,0.09)", letterSpacing: 1,
          }}>TOOL CAPABILITY MAP</span>
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: 0, lineHeight: 1.6 }}>
          Three intervention pathways, one analysis engine, one sensitivity model.
          Select your project type in Step 1 to activate a pathway.
        </p>
      </div>

      {/* ── STEP WORKFLOW ── */}
      <ProjectFlowDiagram activeType={activeFlowType} onTypeChange={setActiveFlowType} />

      {/* ── LAYER 2: Analysis Engine ── */}
      <div style={{
        borderRadius: 14, padding: "14px 18px",
        background: "rgba(74,144,226,0.06)", border: "1px solid rgba(74,144,226,0.20)",
        display: "flex", alignItems: "center", gap: 16,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: "rgba(74,144,226,0.14)", border: "1px solid rgba(74,144,226,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 14px rgba(74,144,226,0.18)",
        }}>
          <Cpu size={20} color="#4A90E2" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#fff", marginBottom: 8, letterSpacing: 0.3 }}>
            ANALYSIS ENGINE
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {ENGINE_TAGS.map((t) => (
              <span key={t.label} style={{
                padding: "2px 8px", borderRadius: 5, fontSize: 9, fontWeight: 700,
                background: `${t.color}14`, color: t.color,
                border: `1px solid ${t.color}28`, letterSpacing: 0.3,
              }}>{t.label}</span>
            ))}
          </div>
        </div>
      </div>

      <DownArrow />

      {/* ── LAYER 3: Sensitivity Analysis ── */}
      <SensitivityPanel activeType={activeFlowType} />

      {/* Pathway-specific content */}
      {activeType === "Energy Community Planning" && <ECPathwayDetail />}
      {activeType === "Renewable Energy Planning"  && <REPathwayDetail />}

      {!activeType && (
        <div style={{
          marginTop: 20, borderRadius: 12, padding: "14px 18px",
          background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.12)",
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <Layers size={18} color="rgba(255,255,255,0.25)" />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
            Return to <strong style={{ color: "rgba(255,255,255,0.55)" }}>Step 1</strong> and
            select a project type to activate a pathway above.
          </span>
        </div>
      )}

    </div>
  );
}

/* ─── Main export ───────────────────────────────────────────────────── */
export default function Scenarios() {
  const { project } = useWizardStore();

  /* The Pathways tab always shows the pathway roadmap, for every project type.
     (Renovation Planning used to divert here to RenovationPackages — a
     wizard-style "Step 4 – Deliverables" page that didn't belong on a
     standalone nav tab; the real renovation calculator is the wizard's Step 4,
     RenovationSimulator.) */
  return <ToolRoadmap activeType={project.projectType} />;
}
