import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";

// ── Inline SVG icon set ────────────────────────────────────────────────────
function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d={d} />
    </svg>
  );
}
const IC = {
  home:        "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  map:         "M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z",
  database:    "M12 3C7.58 3 4 4.79 4 7s3.58 4 8 4 8-1.79 8-4-3.58-4-8-4zM4 9v3c0 2.21 3.58 4 8 4s8-1.79 8-4V9c0 2.21-3.58 4-8 4S4 11.21 4 9zm0 5v3c0 2.21 3.58 4 8 4s8-1.79 8-4v-3c0 2.21-3.58 4-8 4s-8-1.79-8-4z",
  layers:      "M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z",
  deliverable: "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z",
  timeline:    "M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z",
  budget:      "M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z",
  report:      "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z",
  settings:    "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  globe:       "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z",
  import:      "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
  compare:     "M10 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h5v2h2V1h-2v2zm0 15H5l5-6v6zm9-15h-5v2h5v13l-5-6v9h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z",
  generate:    "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  wind:        "M3.76 16.88C4.41 16.95 5 16.45 5 15.79v-.38C5 14.63 4.37 14 3.59 14c-1.19 0-1.78 1.42-.94 2.27.19.2.6.57 1.11.61zm9.71-15C12.22 1.31 11 2.44 11 3.78c0 .89.49 1.71 1.28 2.15l.72.41c.39.22.63.64.63 1.09C13.63 8.28 13 8.93 12.21 8.98c-.44.03-.82-.2-1.07-.52l-.82.82C10.79 9.82 11.36 10.12 12 10.12c1.33 0 2.41-1.08 2.41-2.42 0-.89-.49-1.71-1.28-2.15l-.72-.41A1.23 1.23 0 0 1 11.78 4c0-.41.2-.78.52-1.01l-.83-.11zm-5 3C7.22 4.31 6 5.44 6 6.78c0 .89.49 1.71 1.28 2.15l.72.41c.39.22.63.64.63 1.09C8.63 11.28 8 11.93 7.21 11.98c-.44.03-.82-.2-1.07-.52l-.82.82C5.79 12.82 6.36 13.12 7 13.12c1.33 0 2.41-1.08 2.41-2.42 0-.89-.49-1.71-1.28-2.15l-.72-.41A1.23 1.23 0 0 1 6.78 7c0-.41.2-.78.52-1.01l-.83-.11z",
};

// ── Nav sidebar item ────────────────────────────────────────────────────────
function NavItem({
  iconPath, label, active = false, onClick,
}: { iconPath: string; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`group flex flex-col items-center gap-1 w-full py-2.5 rounded-lg transition-all cursor-pointer border-0
        ${active
          ? "bg-white/12 text-white"
          : "text-white/40 hover:text-white/80 hover:bg-white/8"}`}
    >
      <Icon d={iconPath} size={19} />
      <span className="text-[9px] tracking-wide font-medium leading-none">{label}</span>
    </button>
  );
}

// ── Stat pill (top-right overlay) ────────────────────────────────────────────
function StatCard({ label, value, unit, barColor }: {
  label: string; value: string; unit?: string; bar?: number; barColor?: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      background: "rgba(13,17,23,0.55)",
      backdropFilter: "blur(8px)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 8, padding: "5px 10px",
    }}>
      <div style={{ width: 5, height: 5, borderRadius: "50%", background: barColor ?? "#96D74C", flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{value}</span>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{label}{unit ? ` ${unit}` : ""}</span>
    </div>
  );
}

// ── Shortcut button ────────────────────────────────────────────────────────
function Shortcut({ iconPath, label, onClick }: { iconPath: string; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl border border-white/10
                 bg-white/5 hover:bg-[#721CB8]/20 hover:border-[#721CB8]/50 text-white/50
                 hover:text-white transition-all cursor-pointer"
    >
      <Icon d={iconPath} size={16} />
      <span className="text-[10px] font-medium leading-none whitespace-nowrap">{label}</span>
    </button>
  );
}

type StepStatus = "not-started" | "in-progress" | "review";

const STEP_STATUS_STYLE: Record<StepStatus, { dot: string; text: string }> = {
  "not-started": { dot: "rgba(255,255,255,0.45)", text: "rgba(255,255,255,0.68)" },
  "in-progress": { dot: "#37D39A", text: "#37D39A" },
  "review": { dot: "#5FA5FF", text: "#5FA5FF" },
};

// ── Data ───────────────────────────────────────────────────────────────────
const WORKFLOW_STEPS = [
  {
    n: 1,
    shortLabel: "Step 1",
    name: "Project Brief",
    desc: "Define goals, scope, KPIs and location.",
    status: "not-started" as StepStatus,
    path: "/step/1",
    icon: IC.deliverable,
  },
  {
    n: 2,
    shortLabel: "Step 2",
    name: "Site Intelligence",
    desc: "Explore context, constraints and opportunities.",
    status: "in-progress" as StepStatus,
    path: "/step/2",
    icon: IC.layers,
  },
  {
    n: 3,
    shortLabel: "Step 3",
    name: "Data Confidence",
    desc: "Assess data quality, gaps and uncertainty.",
    status: "review" as StepStatus,
    path: "/step/3",
    icon: IC.database,
  },
  {
    n: 4,
    shortLabel: "Step 4",
    name: "Scenario Outputs",
    desc: "Compare alternatives and expected outcomes.",
    status: "not-started" as StepStatus,
    path: "/step/4",
    icon: IC.report,
  },
  {
    n: 5,
    shortLabel: "Step 5",
    name: "Roadmap and Budget",
    desc: "Plan timeline, resources and estimated cost.",
    status: "not-started" as StepStatus,
    path: "/step/5",
    icon: IC.timeline,
  },
];

const RECENT_ACTIVITY = [
  { icon: "🏢", text: "Boplats data refreshed",        time: "2h ago" },
  { icon: "🗺️", text: "Buildings layer updated",        time: "5h ago" },
  { icon: "🚌", text: "Mobility data refreshed",        time: "1d ago" },
];

// ── Country / city data ───────────────────────────────────────────────────
const COUNTRIES = [
  { id: "se", name: "Sweden",         cities: ["Stockholm", "Gothenburg", "Malmö"] },
  { id: "gb", name: "United Kingdom", cities: [] },
  { id: "be", name: "Belgium",        cities: [] },
  { id: "ie", name: "Ireland",        cities: [] },
];

const LIBRARY_TABS = [
  { label: "Pathways", path: "/pathways" },
  { label: "Data Explorer", path: "/data" },
  { label: "Analysis Tools", path: "/analysis" },
  { label: "Map", path: "map" },
  { label: "Sample Reports", path: "/reports" },
];

// ── Main component ─────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const reset = useWizardStore((s) => s.reset);

  const [selectedCountry, setSelectedCountry] = useState("se");
  const [selectedCity, setSelectedCity]       = useState("Gothenburg");

  const country = COUNTRIES.find(c => c.id === selectedCountry)!;

  const handleStart = () => { reset(); navigate("/step/1"); };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#0a0d14", fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ══ LEFT SIDEBAR ══════════════════════════════════════════════════ */}
      <aside className="w-[62px] shrink-0 flex flex-col items-center py-3 gap-0.5 z-30"
             style={{ background: "#0a0d14", borderRight: "1px solid rgba(255,255,255,0.07)" }}>
        {/* Logo mark */}
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#721CB8] to-[#421869] flex items-center justify-center mb-3 shadow-lg">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
        </div>

        {WORKFLOW_STEPS.map((step) => (
          <NavItem
            key={step.n}
            iconPath={step.icon}
            label={step.shortLabel}
            onClick={() => {
              reset();
              navigate(step.path);
            }}
          />
        ))}

        {/* Push settings to bottom */}
        <div className="flex-1" />
        <NavItem iconPath={IC.settings} label="Settings" />
      </aside>

      {/* ══ MAIN AREA ════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* ── Top header bar ─────────────────────────────────────────── */}
        <header className="h-11 shrink-0 flex items-center gap-3 px-5 z-30"
                style={{ background: "rgba(10,13,20,0.95)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {/* Branding */}
          <div className="flex items-center gap-3">
            <img src="/CTH_new_logo_white.png" alt="Chalmers" className="h-7 opacity-80" />
            <span className="w-px h-4 bg-white/15" />
            <img src="/CNL_new_logo_white.png"  alt="Chalmers Next Labs" className="h-7 opacity-80" />
          </div>

          {/* Library tabs */}
          <div className="hidden lg:flex items-center gap-1 rounded-xl p-1"
               style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {LIBRARY_TABS.map(tab => {
              const isActive = tab.path !== "map" && location.pathname === tab.path;
              return (
                <button
                  key={tab.label}
                  onClick={() => {
                    if (tab.path === "map") {
                      window.open("http://localhost:8765/gothenburg_3d.html", "_blank");
                      return;
                    }
                    navigate(tab.path);
                  }}
                  className="px-2.5 py-1 rounded-lg border-0 cursor-pointer text-[10px] font-semibold whitespace-nowrap transition-all"
                  style={{
                    background: isActive ? "rgba(114,28,184,0.35)" : "transparent",
                    color: isActive ? "#fff" : "rgba(255,255,255,0.45)",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Country + city selector */}
          <div className="flex items-center gap-1" style={{ marginLeft: "auto" }}>
            {/* Countries */}
            <div className="flex items-center gap-0.5 rounded-xl p-0.5"
                 style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
              {COUNTRIES.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedCountry(c.id); if (c.cities.length) setSelectedCity(c.cities[0]); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "4px 10px", borderRadius: 10, border: 0, cursor: "pointer",
                    fontSize: 11, fontWeight: selectedCountry === c.id ? 700 : 500,
                    background: selectedCountry === c.id ? "rgba(114,28,184,0.35)" : "transparent",
                    color: selectedCountry === c.id ? "#fff" : "rgba(255,255,255,0.38)",
                    transition: "all .15s",
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {/* City pills — only when country has cities */}
            {country.cities.length > 0 && (
              <>
                <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, margin: "0 2px" }}>›</span>
                <div className="flex items-center gap-0.5 rounded-xl p-0.5"
                     style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {country.cities.map(city => (
                    <button
                      key={city}
                      onClick={() => setSelectedCity(city)}
                      style={{
                        padding: "4px 10px", borderRadius: 10, border: 0, cursor: "pointer",
                        fontSize: 11, fontWeight: selectedCity === city ? 700 : 500,
                        background: selectedCity === city ? "rgba(78,205,196,0.2)" : "transparent",
                        color: selectedCity === city ? "#4ECDC4" : "rgba(255,255,255,0.38)",
                        transition: "all .15s",
                      }}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* User avatar */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#721CB8] to-[#421869]
                            flex items-center justify-center text-white text-[11px] font-bold shadow">
              SA
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="rgba(255,255,255,0.3)">
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </div>
        </header>

        {/* ── Hero (3D background) ────────────────────────────────────── */}
        <div className="flex-1 relative overflow-hidden">

          {/* 3D Lindholmen background iframe */}
          <iframe
            src="/lindholmen_bg.html"
            className="absolute inset-0 w-full h-full border-0 pointer-events-none"
            title="Lindholmen 3D View"
          />

          {/* Gradient overlay: strong left, fade to transparent right */}
          <div className="absolute inset-0 pointer-events-none"
               style={{ background: "linear-gradient(100deg, rgba(10,13,20,0.88) 0%, rgba(10,13,20,0.52) 45%, rgba(10,13,20,0.18) 100%)" }} />
          {/* Bottom gradient for step cards */}
          <div className="absolute bottom-0 left-0 right-0 h-44 pointer-events-none"
               style={{ background: "linear-gradient(to top, rgba(10,13,20,0.75) 0%, transparent 100%)" }} />

          {/* ── Stats overlay (top right) ────────────────────────────── */}
          <div className="absolute top-4 right-4 flex gap-1.5 pointer-events-none z-10">
            <StatCard label="3D buildings"     value="92,973"  barColor="#4A90E2" />
            <StatCard label="EPC matched"      value="87,712"  barColor="#96D74C" />
            <StatCard label="TABULA matched"   value="18,744"  barColor="#4ECDC4" />
            <StatCard label="Boplats listings" value="297"     barColor="#721CB8" />
          </div>



          {/* ── Hero content (left side) ─────────────────────────────── */}
          <div className="absolute inset-0 flex flex-col justify-center px-10 z-10 pointer-events-none">
            <div className="max-w-[520px]" style={{ pointerEvents: "auto" }}>

              {/* Badges row */}
              <div className="flex items-center gap-3 mb-5">
                <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/90
                                 bg-[#721CB8]/40 border border-[#721CB8]/50 backdrop-blur-sm
                                 px-2.5 py-1 rounded-md">
                  Gothenburg Digital Twin
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-white/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#96D74C] animate-pulse" />
                  Live data
                </span>
              </div>

              {/* Main heading */}
              <h1 className="text-[2.6rem] font-black text-white leading-[1.08] tracking-tight mb-3">
                Digital ToolBox
              </h1>
              <p className="text-[13px] text-white/50 leading-relaxed mb-7 max-w-[380px]">
                Explore site data, uncertainty, scenarios, deliverables,
                timeline, and cost through an interactive 3D workflow.
              </p>

              {/* CTA buttons */}
              <div className="flex items-center gap-3 mb-8">
                <button
                  onClick={handleStart}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold
                             text-white cursor-pointer border-0 transition-all hover:opacity-90 shadow-lg"
                  style={{ background: "linear-gradient(135deg, #421869 0%, #721CB8 100%)", boxShadow: "0 4px 20px rgba(114,28,184,0.45)" }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  Start Planning
                </button>
                <button
                  onClick={() => window.open("http://localhost:8765/gothenburg_3d.html", "_blank")}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold
                             text-white/80 cursor-pointer transition-all hover:text-white hover:border-white/30"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}
                >
                  <Icon d={IC.globe} size={14} />
                  Open 3D Viewer
                </button>
              </div>

              {/* Location pill */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg w-fit"
                   style={{ background: "rgba(10,13,20,0.45)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(8px)" }}>
                <span style={{ fontSize: 10 }}>📍</span>
                <span className="text-[10px] text-white/45">Lindholmen District</span>
                <span className="text-[10px] text-white/25">· Mixed-use redevelopment</span>
              </div>

            </div>
          </div>

          {/* ── Step overview strip (desktop) ────────────────────────── */}
          <div className="absolute bottom-4 left-4 right-4 z-10 hidden xl:flex gap-2.5">
            {WORKFLOW_STEPS.map((step) => {
              const statusStyle = STEP_STATUS_STYLE[step.status];
              return (
                <button
                  key={step.n}
                  onClick={() => {
                    reset();
                    navigate(step.path);
                  }}
                  className="flex-1 rounded-2xl p-3 text-left border transition-all cursor-pointer"
                  style={{
                    background: "rgba(13,17,40,0.82)",
                    borderColor: "rgba(114,28,184,0.34)",
                    boxShadow: "0 2px 14px rgba(0,0,0,0.35)",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold"
                          style={{ background: "rgba(114,28,184,0.38)", border: "1px solid rgba(114,28,184,0.7)", color: "#fff" }}>
                      {step.n}
                    </span>
                    <span style={{ color: "#8FF0E8" }}><Icon d={step.icon} size={15} /></span>
                    <span className="text-[11px] font-semibold text-white">{step.name}</span>
                  </div>
                  <p className="text-[10px] leading-relaxed text-white/60 mb-2.5">{step.desc}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: statusStyle.dot }} />
                    <span className="text-[10px] font-medium" style={{ color: statusStyle.text }}>
                      {step.status === "not-started" ? "Not started" : step.status === "in-progress" ? "In progress" : "Review"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

        </div>{/* end hero */}

        {/* ══ BOTTOM INFO STRIP ════════════════════════════════════════ */}
        <div className="shrink-0 flex gap-3 px-5 py-3 z-30"
             style={{ background: "rgba(10,13,20,0.97)", borderTop: "1px solid rgba(255,255,255,0.07)", minHeight: "120px" }}>

          {/* Active project */}
          <div className="flex-[1.2] rounded-xl px-4 py-3"
               style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="text-[9px] text-white/30 uppercase tracking-widest mb-2">Active project</div>
            <div className="text-[12px] font-semibold text-white/90 mb-0.5">Lindholmen Mixed-Use</div>
            <div className="text-[10px] text-white/35 mb-3">Updated 2h ago</div>
            <button
              onClick={handleStart}
              className="text-[10px] text-white/50 hover:text-white/80 border border-white/12
                         hover:border-white/25 px-3 py-1 rounded-lg transition-all cursor-pointer bg-transparent"
            >
              Change project ›
            </button>
          </div>

          {/* Recent activity */}
          <div className="flex-[2] rounded-xl px-4 py-3"
               style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="text-[9px] text-white/30 uppercase tracking-widest mb-2">Recent activity</div>
            <div className="flex flex-col gap-1.5">
              {RECENT_ACTIVITY.map((a) => (
                <div key={a.text} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px]">{a.icon}</span>
                    <span className="text-[11px] text-white/60">{a.text}</span>
                  </div>
                  <span className="text-[10px] text-white/25">{a.time}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Shortcuts */}
          <div className="flex-[1.5] rounded-xl px-4 py-3"
               style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="text-[9px] text-white/30 uppercase tracking-widest mb-2">Shortcuts</div>
            <div className="flex gap-2">
              <Shortcut iconPath={IC.import}   label="Import Data"        onClick={() => { reset(); navigate("/step/2"); }} />
              <Shortcut iconPath={IC.compare}  label="Compare Scenarios"  onClick={() => { reset(); navigate("/pathways"); }} />
              <Shortcut iconPath={IC.generate} label="Generate Report"    onClick={() => { reset(); navigate("/analysis"); }} />
            </div>
          </div>

          {/* Weather + wind */}
          <div className="flex-[1.2] rounded-xl px-4 py-3"
               style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="text-[9px] text-white/30 uppercase tracking-widest mb-1">Gothenburg</div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">⛅</span>
              <span className="text-[28px] font-bold text-white/90 leading-none">16°C</span>
            </div>
            <div className="text-[10px] text-white/35 mb-2">Partly cloudy</div>
            {/* Wind comfort mini chart */}
            <div>
              <div className="text-[9px] text-white/25 mb-1">Wind comfort (m/s)</div>
              <svg width="100%" height="28" viewBox="0 0 120 28" preserveAspectRatio="none">
                <polyline
                  points="0,20 15,16 30,14 45,18 60,10 75,8 90,12 105,9 120,7"
                  fill="none" stroke="rgba(150,215,76,0.7)" strokeWidth="1.5"
                  strokeLinejoin="round" strokeLinecap="round"
                />
                <polyline
                  points="0,20 15,16 30,14 45,18 60,10 75,8 90,12 105,9 120,7 120,28 0,28"
                  fill="rgba(150,215,76,0.08)" stroke="none"
                />
              </svg>
            </div>
          </div>

        </div>{/* end bottom strip */}

      </div>{/* end main area */}
    </div>
  );
}
