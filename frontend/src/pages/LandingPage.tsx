import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import TopBar from "../components/TopBar";
import { COUNTRIES, countryCodeFromName, defaultCityFor, type CountryCode } from "../config/countryNav";
import ChatWidget from "../components/ChatWidget";

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

type StepStatus = "not-started" | "in-progress" | "review";

const STEP_STATUS_STYLE: Record<StepStatus, { dot: string; text: string }> = {
  "not-started": { dot: "rgba(255,255,255,0.45)", text: "rgba(255,255,255,0.68)" },
  "in-progress": { dot: "#37D39A", text: "#37D39A" },
  "review": { dot: "#5FA5FF", text: "#5FA5FF" },
};

// ── Data ───────────────────────────────────────────────────────────────────
// The real Renovation Planning wizard steps — each card matches the page it
// links to (Define Project → Building & Site Data → Baseline → Calculator →
// Report), so the home page describes what actually happens in the flow.
const WORKFLOW_STEPS = [
  {
    n: 1,
    shortLabel: "Step 1",
    name: "Define Project",
    desc: "Set the project type, systems in scope, KPIs and location.",
    status: "not-started" as StepStatus,
    path: "/step/1",
    icon: IC.deliverable,
  },
  {
    n: 2,
    shortLabel: "Step 2",
    name: "Building & Site Data",
    desc: "Load open building data (EUBUCCO + Boverket EPC) and select the buildings to renovate.",
    status: "not-started" as StepStatus,
    path: "/step/2",
    icon: IC.map,
  },
  {
    n: 3,
    shortLabel: "Step 3",
    name: "Baseline Simulation",
    desc: "Run an EnergyPlus baseline for the selected buildings — the as-built energy demand.",
    status: "not-started" as StepStatus,
    path: "/step/3",
    icon: IC.database,
  },
  {
    n: 4,
    shortLabel: "Step 4",
    name: "Calculator",
    desc: "Design envelope build-ups, combine them into packages, and simulate or optimise each against the baseline.",
    status: "not-started" as StepStatus,
    path: "/step/4",
    icon: IC.layers,
  },
  {
    n: 5,
    shortLabel: "Step 5",
    name: "Report",
    desc: "Recommended packages, cost, carbon, the city climate target, and a downloadable report.",
    status: "not-started" as StepStatus,
    path: "/step/5",
    icon: IC.report,
  },
];

// Per-city 3D hero camera views (feed the parameterized city_bg.html). Distinct
// per city so Sweden and the UK never show the same skyline.
type BgView = { lat: number; lon: number; height: number; heading: number };
const CITY_BG: Record<string, BgView> = {
  Gothenburg: { lat: 57.698500, lon: 11.957000, height: 360, heading: 45 }, // Feskekôrka — from across the Rosenlund canal (SW) looking NE at the church
  Stockholm:  { lat: 59.325100, lon: 18.071100, height: 700, heading: 30 },
  "Malmö":    { lat: 55.605000, lon: 13.003800, height: 650, heading: 20 },
  London:     { lat: 51.503300, lon: -0.078500, height: 700, heading: 345 },
  Rotherham:  { lat: 53.430200, lon: -1.356800, height: 520, heading: 20 },
};
const COUNTRY_BG: Record<CountryCode, BgView> = {
  se: CITY_BG.Gothenburg!,
  gb: CITY_BG.London!,
  be: { lat: 50.8467, lon: 4.3525, height: 700, heading: 20 }, // Brussels
  ie: { lat: 53.3498, lon: -6.2603, height: 700, heading: 20 }, // Dublin
};
function bgUrlFor(country: CountryCode, city: string): string {
  const v = CITY_BG[city] || COUNTRY_BG[country];
  const p = new URLSearchParams({
    lat: String(v.lat), lon: String(v.lon), height: String(v.height), heading: String(v.heading),
  });
  return `/city_bg.html?${p.toString()}`;
}

// ── Main component ─────────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate();
  const reset = useWizardStore((s) => s.reset);
  const setProject = useWizardStore((s) => s.setProject);

  // Seeded from the shared selection so a country/city picked on any other page
  // is still selected here — the top bar is one control, not one per page.
  const storedProject = useWizardStore.getState().project;
  const initialCountry = countryCodeFromName(storedProject.country);
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(initialCountry);
  const [selectedCity, setSelectedCity]       = useState(storedProject.city ?? defaultCityFor(initialCountry));
  const [boplatsListings, setBoplatsListings] = useState<string>("-");
  const [ukStats, setUkStats] = useState<{ buildings: number; withEpc: number; estimated: number; districts: number } | null>(null);
  // Live Sweden KPI counts from /api/country-profile (buildings / epc_match /
  // tabula_match), so the hero pills track the current buildings.json instead of
  // going stale after every pipeline rebuild. Falls back to the last-known values.
  const [seKpis, setSeKpis] = useState<Record<string, number> | null>(null);

  const country = COUNTRIES.find(c => c.id === selectedCountry)!;

  // Stat pills are country-specific: Sweden shows the Gothenburg dataset totals,
  // the UK shows the summed totals across its built districts (from
  // /api/uk/cities) so the hero numbers match the selected country.
  // Live count from the country-profile KPIs, falling back to the last-known
  // value when the backend is unreachable so a pill never shows a bare "—".
  const seVal = (key: string, fallback: string) =>
    seKpis && seKpis[key] != null ? seKpis[key]!.toLocaleString("en-US") : fallback;

  const statCards = selectedCountry === "gb"
    ? [
        { label: "buildings",      value: ukStats ? ukStats.buildings.toLocaleString("en-US") : "—", color: "#4A90E2" },
        { label: "EPC matched",    value: ukStats ? ukStats.withEpc.toLocaleString("en-US") : "—",   color: "#96D74C" },
        { label: "EHS estimated",  value: ukStats ? ukStats.estimated.toLocaleString("en-US") : "—", color: "#4ECDC4" },
        { label: "districts",      value: ukStats ? String(ukStats.districts) : "—",                 color: "#721CB8" },
      ]
    : [
        { label: "3D buildings",     value: seVal("buildings", "92,973"),     color: "#4A90E2" },
        { label: "EPC matched",      value: seVal("epc_match", "85,670"),     color: "#96D74C" },
        { label: "TABULA matched",   value: seVal("tabula_match", "26,257"),  color: "#4ECDC4" },
        { label: "Boplats listings", value: boplatsListings,                  color: "#721CB8" },
      ];

  useEffect(() => {
    let active = true;

    async function loadBoplatsCount() {
      try {
        const res = await fetch(`/boplats_data.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json() as Record<string, unknown[]>;
        const total = Object.values(data).reduce((sum, listings) => {
          return sum + (Array.isArray(listings) ? listings.length : 0);
        }, 0);

        if (active) {
          setBoplatsListings(total.toLocaleString("en-US"));
        }
      } catch {
        if (active) {
          setBoplatsListings("-");
        }
      }
    }

    loadBoplatsCount();
    return () => { active = false; };
  }, []);

  // UK district totals for the country-aware stat pills + per-band data for
  // the retrofit card; plus Sweden's coarse class share.
  useEffect(() => {
    let active = true;
    fetch("/api/uk/cities")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: { cities?: (Record<string, number> & { name: string; band_distribution?: Record<string, number> })[] }) => {
        if (!active) return;
        const cities = d.cities ?? [];
        const sum = (k: string) => cities.reduce((a, c) => a + (Number(c[k]) || 0), 0);
        setUkStats({ buildings: sum("buildings"), withEpc: sum("with_epc"), estimated: sum("estimated_from_ehs"), districts: cities.length });
      })
      .catch(() => { /* stat pills fall back to "—" for the UK */ });

    fetch("/api/country-profile?country=se")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((d: { viewer?: { kpis?: { key: string; value: number }[] } }) => {
        if (!active) return;
        if (d.viewer?.kpis) setSeKpis(Object.fromEntries(d.viewer.kpis.map((k) => [k.key, k.value])));
      })
      .catch(() => { /* SE stat pills fall back to last-known values if absent */ });
    return () => { active = false; };
  }, []);

  // Country/city are chosen once here on the landing page (the top-bar
  // pickers below), not asked again in the wizard - Step 1 used to have its
  // own separate "Country" question, but now that Sweden/UK/etc already have
  // dedicated pages there's no reason to ask twice. Every entry point into
  // the wizard resets project state first, so country/city must be set
  // *after* reset(), not before.
  const startAt = (path: string) => {
    reset();
    setProject({ country: country.name, city: selectedCity || null });
    navigate(path);
  };
  const handleStart = () => startAt("/step/1");

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
            onClick={() => startAt(step.path)}
          />
        ))}

        {/* Push settings to bottom */}
        <div className="flex-1" />
        <NavItem iconPath={IC.settings} label="Settings" />
      </aside>

      {/* ══ MAIN AREA ════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* ── Top header bar ─────────────────────────────────────────── */}
        {/* Shared with every other page — see components/TopBar.tsx. Kept
            controlled here because the hero's 3D camera follows the same
            country/city selection. */}
        <TopBar
          country={selectedCountry}
          city={selectedCity}
          onCountryChange={(id) => {
            const city = defaultCityFor(id);
            setSelectedCountry(id);
            setSelectedCity(city);
            setProject({ country: COUNTRIES.find((c) => c.id === id)?.name ?? null, city: city || null });
          }}
          onCityChange={(city) => { setSelectedCity(city); setProject({ city }); }}
        />

        {/* ── Hero (3D background) ────────────────────────────────────── */}
        <div className="flex-1 relative overflow-hidden">

          {/* 3D city background iframe — camera follows the selected country/city
              (key forces a reload so the camera actually moves on change) */}
          <iframe
            key={`${selectedCountry}:${selectedCity}`}
            src={bgUrlFor(selectedCountry, selectedCity)}
            className="absolute inset-0 w-full h-full border-0 pointer-events-none"
            title={`${selectedCity || country.name} 3D View`}
          />

          {/* Gradient overlay: strong left, fade to transparent right */}
          <div className="absolute inset-0 pointer-events-none"
               style={{ background: "linear-gradient(100deg, rgba(10,13,20,0.88) 0%, rgba(10,13,20,0.52) 45%, rgba(10,13,20,0.18) 100%)" }} />
          {/* Bottom gradient for step cards */}
          <div className="absolute bottom-0 left-0 right-0 h-44 pointer-events-none"
               style={{ background: "linear-gradient(to top, rgba(10,13,20,0.75) 0%, transparent 100%)" }} />

          {/* ── Stats overlay (top right) — country-aware ────────────── */}
          <div className="absolute top-4 right-4 flex gap-1.5 pointer-events-none z-10">
            {statCards.map(s => (
              <StatCard key={s.label} label={s.label} value={s.value} barColor={s.color} />
            ))}
          </div>



          {/* ── Hero content (left side) ─────────────────────────────── */}
          <div className="absolute inset-0 flex flex-col justify-center px-10 z-10 pointer-events-none">
            <div className="max-w-[520px]" style={{ pointerEvents: "auto" }}>

              {/* Badges row */}
              <div className="flex items-center gap-3 mb-5">
                <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/90
                                 bg-[#721CB8]/40 border border-[#721CB8]/50 backdrop-blur-sm
                                 px-2.5 py-1 rounded-md">
                  {(selectedCity || country.name)} Digital Twin
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
                  onClick={() => navigate("/viewer")}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold
                             text-white/80 cursor-pointer transition-all hover:text-white hover:border-white/30"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}
                >
                  <Icon d={IC.globe} size={14} />
                  Open 3D Viewer
                </button>
              </div>

            </div>
          </div>

          {/* ── Step overview strip (desktop) — sits above the "Ask the data"
              chat button (fixed bottom-5 right-5) so step 5 isn't clipped. ── */}
          <div className="absolute bottom-20 left-4 right-4 z-10 hidden xl:flex gap-2.5">
            {WORKFLOW_STEPS.map((step) => {
              const statusStyle = STEP_STATUS_STYLE[step.status];
              return (
                <button
                  key={step.n}
                  onClick={() => startAt(step.path)}
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

      </div>{/* end main area */}

      <ChatWidget />
    </div>
  );
}
