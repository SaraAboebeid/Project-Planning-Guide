import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import RenovationPackages from "./RenovationPackages";
import { Hammer, Zap, Sun, Cpu, Users, BarChart2, Layers, TrendingUp } from "lucide-react";

/* ΓöÇΓöÇΓöÇ Data ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */

const PATHWAYS = [
  {
    key: "Renovation Planning",
    label: "Renovation",
    sub: "Planning",
    color: "#5A1790",
    bgActive: "#5A1790",
    borderActive: "#5A1790",
    Icon: Hammer,
    outputs: [
      { n: "01", text: "Package cost estimate (SEK/m┬▓)" },
      { n: "02", text: "Embodied carbon (kg COΓéée)" },
      { n: "03", text: "EPC energy class forecast" },
      { n: "04", text: "Simple payback period" },
      { n: "05", text: "Phased vs. full comparison" },
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
      { n: "01", text: "Roof area ΓåÆ kWp capacity" },
      { n: "02", text: "Annual yield (kWh/yr)" },
      { n: "03", text: "LCOE per scenario" },
      { n: "04", text: "Self-sufficiency ratio" },
      { n: "05", text: "Carbon payback time" },
    ],
  },
] as const;

const ENGINE_TAGS = [
  { label: "Sensitivity OAT",    color: "#4A90E2" },
  { label: "Global SA",          color: "#4A90E2" },
  { label: "Model Confidence",   color: "#E8880C" },
  { label: "Data Coverage",      color: "#2FB477" },
  { label: "TABULA Archetypes",  color: "#4ECDC4" },
  { label: "Wikells Cost DB",    color: "#5A1790" },
];

/* OAT sensitivity data ΓÇö from config/sensitivity_config.py OAT_PARAMETERS */
const OAT_PARAMS = [
  { key: "roof_shape_angle",    label: "Roof Shape & Angle",   rangeKwh: 211553, dataKey: "roof_shape_angle",    status: "missing"   as const },
  { key: "infiltration",        label: "Infiltration Rate",    rangeKwh: 139434, dataKey: "infiltration_rate",   status: "proxy"     as const },
  { key: "heating_setpoint",    label: "Heating Setpoint",     rangeKwh: 120565, dataKey: "setpoint",           status: "assumed"   as const },
  { key: "construction_package",label: "Construction Quality", rangeKwh: 78284,  dataKey: "construction_materials", status: "partial" as const },
  { key: "floors_total",        label: "Number of Floors",     rangeKwh: 72158,  dataKey: "num_floors",         status: "available" as const },
  { key: "footprint_length",    label: "Building Length",      rangeKwh: 63753,  dataKey: "footprint",          status: "available" as const },
  { key: "footprint_width",     label: "Building Width",       rangeKwh: 52824,  dataKey: "footprint",          status: "available" as const },
  { key: "window_to_wall_ratio",label: "Window-to-Wall Ratio", rangeKwh: 30601,  dataKey: "wwr",               status: "partial"   as const },
  { key: "glazing_package",     label: "Glazing Quality",      rangeKwh: 23350,  dataKey: "window_properties",  status: "partial"   as const },
];
const TOTAL_RANGE = OAT_PARAMS.reduce((s, p) => s + p.rangeKwh, 0);

const STATUS_COLOR: Record<string, string> = {
  available: "#2FB477",
  partial:   "#E8880C",
  proxy:     "#4A90E2",
  assumed:   "#E8880C",
  missing:   "rgba(255,80,80,0.85)",
};
const STATUS_LABEL: Record<string, string> = {
  available: "Available",
  partial:   "Partial",
  proxy:     "Proxy",
  assumed:   "Assumed",
  missing:   "Missing",
};

/* ΓöÇΓöÇΓöÇ EC pathway detail ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
function ECPathwayDetail() {
  const scenarios = [
    { id: "A", name: "Micro cluster",  buildings: "2ΓÇô4 bldgs",  pv: "20ΓÇô40 kWp",  self: "55ΓÇô70%", color: "#4ECDC4" },
    { id: "B", name: "Block sharing",  buildings: "5ΓÇô12 bldgs", pv: "50ΓÇô120 kWp", self: "70ΓÇô85%", color: "#4A90E2" },
    { id: "C", name: "District-scale", buildings: "13+ bldgs",  pv: "150+ kWp",   self: "85ΓÇô95%", color: "#2FB477" },
  ];
  const inputs = [
    "Annual electricity consumption per building (kWh/yr)",
    "Roof area available for PV (m┬▓)",
    "Existing PV or battery installations",
    "Grid connection capacity (kVA)",
    "Legal form: association, co-op or tenant-owner",
  ];
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.35)",
                    textTransform: "uppercase", letterSpacing: 2, marginBottom: 14 }}>
        Your active pathway ΓÇö Energy Community
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

/* ΓöÇΓöÇΓöÇ RE pathway detail ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
function REPathwayDetail() {
  const scenarios = [
    { id: "A", name: "Partial roof",  pct: "50%",  kWp: "~45 kWp",  yield: "~42 MWh/yr",  color: "#2FB477" },
    { id: "B", name: "Full roof",     pct: "90%",  kWp: "~80 kWp",  yield: "~75 MWh/yr",  color: "#4A90E2" },
    { id: "C", name: "Roof + fa├ºade", pct: "100%", kWp: "~110 kWp", yield: "~100 MWh/yr", color: "#E8880C" },
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
        Your active pathway ΓÇö Renewable Energy
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

/* ΓöÇΓöÇΓöÇ Sensitivity Analysis Panel ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
function SensitivityPanel() {
  return (
    <div style={{
      borderRadius: 14, padding: "16px 18px",
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
            background: "rgba(74,144,226,0.14)", border: "1px solid rgba(74,144,226,0.30)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <TrendingUp size={16} color="#4A90E2" />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#fff", letterSpacing: 0.3 }}>
              SENSITIVITY ANALYSIS ΓÇö OAT
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", marginTop: 1 }}>
              One-At-a-Time ┬╖ heating demand (kWh/yr) ┬╖ reference building
            </div>
          </div>
        </div>
        {/* Legend */}
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          {[
            { s: "available", l: "Available" },
            { s: "partial",   l: "Partial" },
            { s: "proxy",     l: "Proxy" },
            { s: "missing",   l: "Missing" },
          ].map(({ s, l }) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 7, height: 7, borderRadius: 2, background: STATUS_COLOR[s] }} />
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)" }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bar rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {OAT_PARAMS.map((p, i) => {
          const pct = (p.rangeKwh / TOTAL_RANGE) * 100;
          const barColor = STATUS_COLOR[p.status];
          const rank = i + 1;
          return (
            <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Rank */}
              <span style={{
                width: 18, flexShrink: 0, textAlign: "right",
                fontSize: 9, fontWeight: 800, color: rank <= 3 ? "#E8880C" : "rgba(255,255,255,0.20)",
              }}>#{rank}</span>

              {/* Label */}
              <span style={{
                width: 148, flexShrink: 0, fontSize: 11, fontWeight: 500,
                color: "rgba(255,255,255,0.70)", whiteSpace: "nowrap",
                overflow: "hidden", textOverflow: "ellipsis",
              }}>{p.label}</span>

              {/* Bar track */}
              <div style={{
                flex: 1, height: 8, borderRadius: 4,
                background: "rgba(255,255,255,0.05)", position: "relative", overflow: "hidden",
              }}>
                <div style={{
                  position: "absolute", top: 0, left: 0, bottom: 0,
                  width: `${pct}%`, borderRadius: 4,
                  background: barColor,
                  boxShadow: `0 0 8px ${barColor}55`,
                  transition: "width 0.6s ease",
                }} />
              </div>

              {/* Pct */}
              <span style={{
                width: 36, flexShrink: 0, textAlign: "right",
                fontSize: 11, fontWeight: 700, color: barColor,
              }}>{pct.toFixed(1)}%</span>

              {/* Range */}
              <span style={{
                width: 88, flexShrink: 0, textAlign: "right",
                fontSize: 10, color: "rgba(255,255,255,0.25)", fontVariantNumeric: "tabular-nums",
              }}>┬▒{(p.rangeKwh / 1000).toFixed(0)} MWh</span>

              {/* Status pill */}
              <span style={{
                width: 60, flexShrink: 0, textAlign: "center",
                padding: "1px 0", borderRadius: 4, fontSize: 9, fontWeight: 700,
                background: `${STATUS_COLOR[p.status]}18`,
                color: STATUS_COLOR[p.status],
                border: `1px solid ${STATUS_COLOR[p.status]}30`,
              }}>{STATUS_LABEL[p.status]}</span>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div style={{
        marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "flex-start", gap: 8,
      }}>
        <span style={{ fontSize: 18, lineHeight: 1.1 }}>≡ƒÆí</span>
        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", margin: 0, lineHeight: 1.6 }}>
          Bar width = % share of total model output range.
          Bar colour = data availability in your project.
          <strong style={{ color: "rgba(255,255,255,0.45)" }}> Missing or proxy parameters at the top create the largest confidence penalty.</strong>
        </p>
      </div>
    </div>
  );
}

/* ΓöÇΓöÇΓöÇ Visual connectors ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
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
      }}>Γû╝</div>
    </div>
  );
}

function DownArrow() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: 32, justifyContent: "center" }}>
      <div style={{ width: 1, flex: 1, background: "rgba(255,255,255,0.08)" }} />
      <div style={{ color: "rgba(255,255,255,0.22)", fontSize: 11, lineHeight: 1 }}>Γû╝</div>
    </div>
  );
}

/* ΓöÇΓöÇΓöÇ Roadmap ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
function ToolRoadmap({ activeType }: { activeType: string | null }) {
  const navigate = useNavigate();

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

      {/* ΓöÇΓöÇ LAYER 1: Pathway cards ΓöÇΓöÇ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {PATHWAYS.map((pw) => {
          const isActive = activeType === pw.key;
          const selectedText = pw.color === "#4ECDC4" ? "#0b1220" : "#fff";
          const Ic = pw.Icon;
          return (
            <div key={pw.key} style={{
              borderRadius: 16, padding: "16px 14px",
              background: isActive ? pw.bgActive : "rgba(255,255,255,0.02)",
              border: `2px solid ${isActive ? pw.borderActive : "rgba(255,255,255,0.06)"}`,
              transition: "all 0.2s", position: "relative",
              boxShadow: isActive ? `0 0 28px ${pw.color}22` : "none",
            }}>
              {isActive && (
                <div style={{
                  position: "absolute", top: 10, right: 10,
                  padding: "2px 7px", borderRadius: 5, fontSize: 9, fontWeight: 700,
                  background: pw.color, color: selectedText, letterSpacing: 1, textTransform: "uppercase",
                }}>Active</div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                  background: isActive ? pw.color : "rgba(255,255,255,0.05)",
                  border: isActive ? "none" : "1px solid rgba(255,255,255,0.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: isActive ? `0 4px 14px ${pw.color}44` : "none",
                }}>
                  <Ic size={18} color={isActive ? selectedText : "rgba(255,255,255,0.28)"} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.2,
                                color: isActive ? selectedText : "rgba(255,255,255,0.40)" }}>{pw.label}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginTop: 1 }}>{pw.sub}</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {pw.outputs.map((o) => (
                  <div key={o.n} style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                    <span style={{
                      fontSize: 8, fontWeight: 800, flexShrink: 0, marginTop: 1.5, letterSpacing: 0.5,
                      color: isActive ? selectedText : "rgba(255,255,255,0.18)",
                    }}>{o.n}</span>
                    <span style={{
                      fontSize: 11, lineHeight: 1.4,
                      color: isActive ? selectedText : "rgba(255,255,255,0.28)",
                    }}>{o.text}</span>
                  </div>
                ))}
              </div>
              {!isActive && (
                <button onClick={() => navigate("/step/1")} style={{
                  marginTop: 12, width: "100%", padding: "5px 0", borderRadius: 7,
                  border: "1px solid rgba(255,255,255,0.07)", background: "transparent",
                  color: "rgba(255,255,255,0.25)", fontSize: 9, fontWeight: 600,
                  cursor: "pointer", letterSpacing: 0.5,
                }}>SELECT IN STEP 1 Γåù</button>
              )}
            </div>
          );
        })}
      </div>

      <FlowConnector />

      {/* ΓöÇΓöÇ LAYER 2: Analysis Engine ΓöÇΓöÇ */}
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

      {/* ΓöÇΓöÇ LAYER 3: Sensitivity Analysis ΓöÇΓöÇ */}
      <SensitivityPanel />

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

/* ΓöÇΓöÇΓöÇ Main export ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */
export default function Scenarios() {
  const { project } = useWizardStore();

  /* Renovation Planning has its own rich cost-estimator UI */
  if (project.projectType === "Renovation Planning") {
    return <RenovationPackages />;
  }

  /* All other types (EC, RE, or no selection) → show the roadmap */
  return <ToolRoadmap activeType={project.projectType} />;
}
