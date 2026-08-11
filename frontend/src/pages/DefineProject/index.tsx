import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../../store/wizard";
import { api } from "../../api/client";
import {
  PROJECT_TYPES,
  PROJECT_TYPE_DESCRIPTIONS,
  SYSTEMS_BY_PROJECT_TYPE,
  DISABLED_SYSTEMS,
  FOLLOW_UP_SYSTEMS,
  EC_FOLLOW_UP_QUESTIONS,
  EC_FOCUS_OPTIONS,
  ENVELOPE_COMPONENTS,
  UNIVERSAL_KPIS,
  EXPLORATION_OPTIONS,
  EXPLORATION_CONSTRAINTS,
  SCALE_OPTIONS_BY_TYPE,
  PORTFOLIO_OWNERS,
  BUILDING_USES,
  RE_ELECTRICITY_THRESHOLDS,
  BUILDING_DEVELOPMENT_OPTIONS,
  type ProjectType,
} from "../../config/projectConfig";

import LocationMap from "../../components/LocationMap";
import { useWizardStepNav, setWizardCanNext } from "../../components/wizardNav";

/* ── tiny reusable bits ─────────────────────────────────────────── */

function SectionDivider() {
  return <hr className="my-5 border-t border-gray-200" />;
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[0.98rem] font-semibold text-dark mb-1">
      {children}
      {required && <span className="text-red-600 ml-0.5">*</span>}
    </label>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`ppg-card mb-4 ${className}`}>
      {children}
    </div>
  );
}

/* Project types temporarily switched off. They (and every EC/RE page) are kept
   for future use — this just makes them non-selectable in Step 1, so no EC/RE
   project can be created and their downstream pages stay unreachable. To bring
   one back, remove it from this set. */
const DISABLED_PROJECT_TYPES = new Set<string>([
  "Energy Community Planning",
  "Renewable Energy Planning",
]);

/* ════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════════════ */

export default function DefineProject() {
  const { project, setProject, setStep } = useWizardStore();
  const navigate = useNavigate();

  // Leave the type unselected so Step 1 reveals questions sequentially (user
  // picks it first). Only clear a since-disabled (EC/RE) persisted type, so an
  // old project doesn't stay stuck on a track that can no longer be created —
  // the user then re-picks from the enabled options. Runs once.
  useEffect(() => {
    if (project.projectType && DISABLED_PROJECT_TYPES.has(project.projectType)) {
      setProject({ projectType: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  // Location validity (e.g. address outside the Gothenburg municipality) → gates Continue.
  const [locationValid, setLocationValid] = useState(true);
  const [buildingLoading, setBuildingLoading] = useState(false);
  const lookupDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // For auto-scrolling to each newly revealed question.
  const rootRef = useRef<HTMLDivElement>(null);
  const didMountRef = useRef(false);
  const prevRevealRef = useRef(0);

  /* ── Named neighborhoods (Gothenburg primärområden) for the picker ─── */
  const [districts, setDistricts] = useState<{ name: string; count: number }[]>([]);
  const [districtQuery, setDistrictQuery] = useState(project.district ?? project.neighborhoodName ?? "");
  const [districtOpen, setDistrictOpen] = useState(false);
  const isSweden = project.country !== "United Kingdom";

  useEffect(() => {
    if (project.scale === "Neighborhood" && isSweden && districts.length === 0) {
      api.listDistricts("se").then(r => setDistricts(r.districts)).catch(() => {});
    }
  }, [project.scale, isSweden, districts.length]);

  const districtMatches = districtQuery.trim()
    ? districts.filter(d => d.name.toLowerCase().includes(districtQuery.trim().toLowerCase())).slice(0, 12)
    : districts.slice(0, 12);

  const selectedDistrict = districts.find(x => x.name === project.district) ?? null;

  function pickDistrict(name: string) {
    setDistrictQuery(name);
    setDistrictOpen(false);
    setProject({
      neighborhoodName: name,
      district: name,
      bboxStats: null,
      currentBbox: null,
    });
  }

  /* ── Bbox lookup — fires when user finishes drawing a bbox ──── */
  async function handleBboxChange(bbox: { north: number; south: number; east: number; west: number } | null) {
    if (!bbox) {
      setProject({ bboxStats: null, lookedUpBuilding: null });
      return;
    }
    setBuildingLoading(true);
    try {
      const stats = await api.lookupBuildingsBbox(bbox.north, bbox.south, bbox.east, bbox.west);
      // A rectangle supersedes any previously drawn free-form polygon.
      setProject({ bboxStats: stats, lookedUpBuilding: null, currentBbox: bbox, selectionPolygon: null });
      // Sync bbox to 3D viewer via localStorage
      try { localStorage.setItem('ppg_bbox', JSON.stringify(bbox)); } catch { /* ignore */ }
    } catch {
      setProject({ bboxStats: null });
    } finally {
      setBuildingLoading(false);
    }
  }

  /* ── Polygon (any-shape) lookup — fires when a shape is finished/cleared ── */
  async function handlePolygonChange(
    polygon: string | null,
    bbox: { north: number; south: number; east: number; west: number } | null,
  ) {
    if (!polygon || !bbox) {
      setProject({ bboxStats: null, selectionPolygon: null });
      return;
    }
    setBuildingLoading(true);
    try {
      const stats = await api.lookupBuildingsBbox(bbox.north, bbox.south, bbox.east, bbox.west, polygon);
      setProject({ bboxStats: stats, lookedUpBuilding: null, currentBbox: bbox, selectionPolygon: polygon });
      try { localStorage.setItem('ppg_bbox', JSON.stringify(bbox)); } catch { /* ignore */ }
    } catch {
      setProject({ bboxStats: null, selectionPolygon: null });
    } finally {
      setBuildingLoading(false);
    }
  }

  /* ── Building lookup — fires when buildingPoints changes ─────── */
  useEffect(() => {
    const pts = project.buildingPoints;
    if (!pts || pts.length === 0) {
      setProject({ lookedUpBuilding: null, lookedUpBuildings: [] });
      return;
    }
    if (lookupDebounce.current) clearTimeout(lookupDebounce.current);
    lookupDebounce.current = setTimeout(async () => {
      setBuildingLoading(true);
      try {
        const results = await Promise.all(
          pts.map((p) => api.lookupBuilding(p.lat, p.lon, project.country))
        );
        // Also check the WWR database for the first building
        let savedWWR = null;
        try {
          const first = pts[0];
          if (first) {
            const wwrRes = await api.lookupWWR(first.lat, first.lon);
            if (wwrRes.found) savedWWR = wwrRes.record;
          }
        } catch { /* ignore — backend may not be running */ }
        setProject({ lookedUpBuilding: results[0] ?? null, lookedUpBuildings: results, savedWWR });
      } catch {
        setProject({ lookedUpBuilding: null, lookedUpBuildings: [] });
      } finally {
        setBuildingLoading(false);
      }
    }, 400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.buildingPoints]);

  // Country/city normally arrive already set from the landing page's
  // startAt() (see LandingPage.tsx) - this only covers reaching Step 1
  // directly (a bookmark, a refresh) without that handoff.
  useEffect(() => {
    if (!project.country) setProject({ country: "Sweden", city: "Gothenburg" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pt = project.projectType;

  /* ── derived lists ───────────────────────────────────────────── */
  const allSystems = pt ? SYSTEMS_BY_PROJECT_TYPE[pt] : [];
  const disabledSystems = (pt && DISABLED_SYSTEMS[pt]) || [];
  const selectableSystems = allSystems.filter(
    (s) => !disabledSystems.includes(s)
  );

  const scaleOptions = pt ? SCALE_OPTIONS_BY_TYPE[pt] : ["Building", "Neighborhood", "City"];

  /* ── handlers ────────────────────────────────────────────────── */

  function handleTypeChange(newType: ProjectType) {
    // Reset dependent fields when project type changes
    setProject({
      projectType: newType,
      buildingDevelopmentType: null,
      systemsInScope: [],
      selectedKpis: [],
      explorationApproaches: [],
      followUpAnswers: {},
      renovationEnvelopeComponents: [],
      ecEnergyFocus: [],
      scale: null,
      buildingUses: [],
    });
  }

  function toggleSystem(system: string) {
    const current = project.systemsInScope;
    const next = current.includes(system)
      ? current.filter((s) => s !== system)
      : [...current, system];
    // Also clean KPIs that depend on removed systems
    setProject({ systemsInScope: next });
  }

  function toggleKpi(kpi: string) {
    const next = project.selectedKpis.includes(kpi)
      ? project.selectedKpis.filter((k) => k !== kpi)
      : [...project.selectedKpis, kpi];
    setProject({ selectedKpis: next });
  }

  function toggleExploration(approach: string) {
    const next = project.explorationApproaches.includes(approach)
      ? project.explorationApproaches.filter((a) => a !== approach)
      : [...project.explorationApproaches, approach];
    setProject({ explorationApproaches: next });
  }

  function toggleEnvelopeComponent(comp: string) {
    const next = project.renovationEnvelopeComponents.includes(comp)
      ? project.renovationEnvelopeComponents.filter((c) => c !== comp)
      : [...project.renovationEnvelopeComponents, comp];
    setProject({ renovationEnvelopeComponents: next });
  }

  function toggleBuildingUse(use: string) {
    const next = project.buildingUses.includes(use)
      ? project.buildingUses.filter((u) => u !== use)
      : [...project.buildingUses, use];
    setProject({ buildingUses: next });
  }

  function handleContinue() {
    const missing: string[] = [];
    if (!pt) missing.push("project type");
    if (!project.systemsInScope.length) missing.push("at least one system in scope");
    if (!project.explorationApproaches.length) missing.push("at least one exploration approach");
    if (!project.selectedKpis.length) missing.push("at least one KPI");
    if (!project.scale) missing.push("project scale");
    if (pt === "Energy Community Planning" && !project.ecEnergyFocus.length) {
      missing.push("energy focus");
    }
    if (missing.length) {
      setValidationErrors(missing);
      return;
    }
    if (!locationValid) return; // address outside the covered area — blocked
    setValidationErrors([]);
    setStep(2);
    navigate("/step/2");
  }

  // The wizard footer's Continue runs this page's validation + advance.
  useWizardStepNav({ onNext: handleContinue });

  // Gate the footer Continue button while the location is invalid; always
  // re-enable it when leaving Step 1.
  useEffect(() => {
    setWizardCanNext(locationValid);
    return () => setWizardCanNext(true);
  }, [locationValid]);

  /* ── follow-up helpers ───────────────────────────────────────── */
  const followUps = (pt && FOLLOW_UP_SYSTEMS[pt]) || {};
  const systemsSet = new Set(project.systemsInScope);

  // Check if any PV trigger is selected (for RE and EC follow-ups)
  const pvTriggers = new Set(["Rooftop PV", "Community PV", "Facade PV"]);
  const hasPvSelected = [...pvTriggers].some((t) => systemsSet.has(t));

  /* ── progressive reveal conditions ────────────────────────────── */
  // For Renovation Planning, Building Envelope is always in scope — auto-select it
  if (pt === "Renovation Planning" && !systemsSet.has("Building Envelope (Windows, Roof, Walls, Floors)")) {
    setProject({ systemsInScope: ["Building Envelope (Windows, Roof, Walls, Floors)"] });
  }
  const needsBuildingDevType = pt === "Energy Community Planning" || pt === "Renewable Energy Planning";
  const showBuildingDevType  = needsBuildingDevType;
  const showSystems          = !!pt && pt !== "Renovation Planning" && !!project.buildingDevelopmentType;
  const showEcFocus        = pt === "Energy Community Planning" && project.systemsInScope.length > 0;
  // "Systems answered" for the reveal chain. For Renovation the coarse envelope
  // system is auto-selected (above) for downstream use, so gate on the user's own
  // component picks instead — otherwise the next question would appear instantly.
  const systemsChosen      = pt === "Renovation Planning"
                              ? project.renovationEnvelopeComponents.length > 0
                              : project.systemsInScope.length > 0;
  const showExploration    = !!pt && systemsChosen
                              && (pt !== "Energy Community Planning" || project.ecEnergyFocus.length > 0);
  const showKpis           = showExploration && project.explorationApproaches.length > 0;
  const showScale          = showKpis && project.selectedKpis.length > 0;
  // Country/city are chosen once on the landing page (see LandingPage.tsx's
  // startAt()), not asked again here - Step 1 used to have its own separate
  // Country question, redundant now that Sweden/UK/etc have dedicated pages.
  const showProjectName    = showScale && !!project.scale;
  const showLocation       = showProjectName;

  /* ── auto-scroll to each newly revealed question ──────────────── */
  // Count how many follow-up questions are currently revealed; when that grows,
  // smoothly bring the newest one (the last .animate-fadeIn card) into view.
  const revealCount =
    (showBuildingDevType ? 1 : 0) +
    (pt === "Renovation Planning" || showSystems ? 1 : 0) +
    (showEcFocus ? 1 : 0) +
    (showExploration ? 1 : 0) +
    (showKpis ? 1 : 0) +
    (showScale ? 1 : 0) +
    (showProjectName ? 1 : 0);
  useEffect(() => {
    if (didMountRef.current && revealCount > prevRevealRef.current && rootRef.current) {
      const cards = rootRef.current.querySelectorAll<HTMLElement>(".animate-fadeIn");
      cards[cards.length - 1]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    prevRevealRef.current = revealCount;
    didMountRef.current = true;
  }, [revealCount]);

  /* ── progress tracker ──────────────────────────────────────── */
  // Each entry: [label, isDone]
  const progressSteps: [string, boolean][] = [
    ["Project type",       !!pt],
    ...(needsBuildingDevType
      ? [["Building type", !!project.buildingDevelopmentType] as [string, boolean]]
      : []),
    [pt === "Renovation Planning" ? "Components" : "Systems in scope", systemsChosen],
    ...(pt === "Energy Community Planning"
      ? [["Energy focus", project.ecEnergyFocus.length > 0] as [string, boolean]]
      : []),
    ["Exploration",        project.explorationApproaches.length > 0],
    ["KPIs",              project.selectedKpis.length > 0],
    ["Scale",             !!project.scale],
    ["Project name",      !!project.projectName.trim()],
    ["Location",          !!project.address.trim()],
  ];
  const totalSteps = progressSteps.length;
  const doneSteps  = progressSteps.filter(([, done]) => done).length;
  const pct        = Math.round((doneSteps / totalSteps) * 100);
  // Next pending label
  const nextStep   = progressSteps.find(([, done]) => !done);

  /* ════════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════════ */

  return (
    <div ref={rootRef} className="space-y-2">

      {/* ── PROJECT TYPE (with slim inline progress hint) ── */}
      <Card>
        {/* slim progress hint */}
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100">
          <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: pct === 100
                  ? "#509724"
                  : "linear-gradient(90deg,#995BD5,#721CB8)",
              }}
            />
          </div>
          <span className="text-xs text-muted whitespace-nowrap">
            <span className="font-semibold text-dark">{doneSteps}</span>
            {"\u00a0/\u00a0"}{totalSteps}
            {nextStep && pct < 100 && (
              <> &middot; next: <span className="font-medium text-dark">{nextStep[0]}</span></>
            )}
            {pct === 100 && (
              <span className="text-green font-semibold"> &middot; complete ✓</span>
            )}
          </span>
        </div>

        <Label required>Project Type</Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
          {PROJECT_TYPES.map((t) => {
            const disabled = DISABLED_PROJECT_TYPES.has(t);
            const selected = pt === t && !disabled;
            const ICONS: Record<string, React.ReactNode> = {
              "Energy Community Planning": (
                <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                  <rect x="6" y="28" width="10" height="16" rx="1" stroke="#4ECDC4" strokeWidth="1.5" fill="none"/>
                  <rect x="21" y="20" width="10" height="24" rx="1" stroke="#4ECDC4" strokeWidth="1.5" fill="none"/>
                  <rect x="36" y="24" width="10" height="20" rx="1" stroke="#4ECDC4" strokeWidth="1.5" fill="none"/>
                  <path d="M2 44h48" stroke="#4ECDC4" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="26" cy="10" r="5" stroke="#96D74C" strokeWidth="1.5" fill="none"/>
                  <path d="M26 5v-3M26 18v-3M17 10h-3M38 10h-3" stroke="#96D74C" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M19.5 7.5l-2-2M34.5 12.5l-2-2M19.5 12.5l-2 2M34.5 7.5l-2 2" stroke="#96D74C" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              ),
              "Renovation Planning": (
                <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                  <rect x="10" y="18" width="32" height="26" rx="1" stroke="#721CB8" strokeWidth="1.5" fill="none"/>
                  <path d="M6 20L26 6l20 14" stroke="#721CB8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <rect x="20" y="30" width="12" height="14" rx="1" stroke="#721CB8" strokeWidth="1.5" fill="none"/>
                  <rect x="13" y="24" width="8" height="8" rx="0.5" stroke="#4ECDC4" strokeWidth="1.5" fill="none"/>
                  <rect x="31" y="24" width="8" height="8" rx="0.5" stroke="#4ECDC4" strokeWidth="1.5" fill="none"/>
                </svg>
              ),
              "Renewable Energy Planning": (
                <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                  <path d="M26 8v6M26 38v6M8 26H2M50 26h-6" stroke="#96D74C" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="26" cy="26" r="10" stroke="#96D74C" strokeWidth="1.5" fill="none"/>
                  <path d="M32 14c2-4 6-6 8-4s0 6-4 8" stroke="#4ECDC4" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                  <path d="M38 32c4 2 6 6 4 8s-6 0-8-4" stroke="#4ECDC4" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                  <path d="M14 32c-4 2-6 6-4 8s6 0 8-4" stroke="#4ECDC4" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                </svg>
              ),
            };
            return (
              <button
                key={t}
                onClick={() => { if (!disabled) handleTypeChange(t); }}
                disabled={disabled}
                title={disabled ? "Coming soon — not available yet" : undefined}
                style={{
                  background: selected ? "rgba(78,205,196,0.10)" : "rgba(13,17,40,0.85)",
                  border: `2px solid ${selected ? "#4ECDC4" : "rgba(255,255,255,0.10)"}`,
                  borderRadius: 16,
                  padding: "24px 20px",
                  textAlign: "center",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.5 : 1,
                  position: "relative",
                  transition: "all 0.18s",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                  boxShadow: selected ? "0 0 0 1px #4ECDC4, 0 4px 20px rgba(78,205,196,0.25)" : "none",
                }}
                onMouseEnter={e => {
                  if (!selected && !disabled) (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(78,205,196,0.35)";
                }}
                onMouseLeave={e => {
                  if (!selected && !disabled) (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.10)";
                }}
              >
                {/* Indicator top-right — a "Soon" pill for disabled types */}
                {disabled ? (
                  <span style={{
                    position: "absolute", top: 12, right: 12,
                    fontSize: 9, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase",
                    padding: "3px 8px", borderRadius: 999,
                    background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.55)",
                    border: "1px solid rgba(255,255,255,0.14)",
                  }}>Soon</span>
                ) : (
                  <div style={{
                    position: "absolute", top: 12, right: 12,
                    width: 22, height: 22, borderRadius: "50%",
                    border: `2px solid ${selected ? "#4ECDC4" : "rgba(255,255,255,0.25)"}`,
                    background: selected ? "#4ECDC4" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {selected && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                      </svg>
                    )}
                  </div>
                )}

                {/* Icon */}
                {ICONS[t]}

                {/* Label + desc */}
                <div>
                  <div style={{
                    fontSize: 14, fontWeight: 700,
                    color: selected ? "#fff" : "rgba(255,255,255,0.85)",
                    marginBottom: 8, lineHeight: 1.3,
                  }}>
                    {t}
                  </div>
                  <p style={{
                    fontSize: 12, color: "rgba(255,255,255,0.45)",
                    lineHeight: 1.55, margin: 0,
                  }}>
                    {PROJECT_TYPE_DESCRIPTIONS[t]}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* ── BUILDING DEVELOPMENT TYPE (EC + RE only) ── */}
      {showBuildingDevType && (
        <Card className="animate-fadeIn">
          <Label required>Are the buildings existing or new development?</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {BUILDING_DEVELOPMENT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setProject({ buildingDevelopmentType: opt.value })}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                  project.buildingDevelopmentType === opt.value
                    ? "bg-[#4ECDC4] text-[#0b1220] border-[#4ECDC4]"
                    : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* ── RENOVATION ENVELOPE COMPONENTS ── */}
      {pt === "Renovation Planning" && (
        <Card className="animate-fadeIn">
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.90)", marginBottom: 4 }}>
              Renovation components
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.40)" }}>
              Select the building elements included in your assessment.
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {(() => {
              const COMP_META: Record<string, { subtitle?: string; icon: React.ReactNode }> = {
                "Walls": {
                  icon: <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="3" y="5" width="22" height="18" rx="1" stroke="currentColor" strokeWidth="1.5"/><line x1="3" y1="11" x2="25" y2="11" stroke="currentColor" strokeWidth="1.5"/><line x1="3" y1="17" x2="25" y2="17" stroke="currentColor" strokeWidth="1.5"/><line x1="10" y1="5" x2="10" y2="11" stroke="currentColor" strokeWidth="1.5"/><line x1="18" y1="11" x2="18" y2="17" stroke="currentColor" strokeWidth="1.5"/><line x1="10" y1="17" x2="10" y2="23" stroke="currentColor" strokeWidth="1.5"/></svg>
                },
                "Windows": {
                  icon: <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="4" y="4" width="20" height="20" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><line x1="14" y1="4" x2="14" y2="24" stroke="currentColor" strokeWidth="1.5"/><line x1="4" y1="14" x2="24" y2="14" stroke="currentColor" strokeWidth="1.5"/></svg>
                },
                "Roof": {
                  icon: <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M4 14L14 4l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><rect x="7" y="14" width="14" height="10" rx="0.5" stroke="currentColor" strokeWidth="1.5"/><line x1="14" y1="14" x2="14" y2="24" stroke="currentColor" strokeWidth="1.5"/></svg>
                },
                "Floor": {
                  icon: <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="4" y="8" width="20" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.5"/><rect x="4" y="14" width="20" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.5"/><rect x="4" y="20" width="20" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.5"/></svg>
                },
                "Doors": {
                  icon: <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="7" y="4" width="14" height="20" rx="1" stroke="currentColor" strokeWidth="1.5"/><circle cx="18" cy="14" r="1.2" fill="currentColor"/><line x1="7" y1="24" x2="3" y2="24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="21" y1="24" x2="25" y2="24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                },
                "Balcony": {
                  icon: <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="4" y="12" width="20" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.5"/><line x1="8" y1="15" x2="8" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="14" y1="15" x2="14" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="20" y1="15" x2="20" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="4" y1="22" x2="24" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><rect x="8" y="6" width="12" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.5"/></svg>
                },
                "Vertical Extension (New Floor)": {
                  subtitle: "New Floor",
                  icon: <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="5" y="14" width="18" height="9" rx="0.5" stroke="currentColor" strokeWidth="1.5"/><path d="M5 14l4-5h10l4 5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M14 5v4M11 7l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                },
              };
              return ENVELOPE_COMPONENTS.map((comp) => {
                const meta = COMP_META[comp] ?? { icon: null };
                const selected = project.renovationEnvelopeComponents.includes(comp);
                const displayName = meta.subtitle
                  ? comp.replace(/ \(.*\)/, "")
                  : comp;
                return (
                  <button
                    key={comp}
                    onClick={() => toggleEnvelopeComponent(comp)}
                    style={{
                      background: selected ? "rgba(78,205,196,0.10)" : "rgba(13,17,40,0.80)",
                      border: `1.5px solid ${selected ? "#4ECDC4" : "rgba(255,255,255,0.10)"}`,
                      borderRadius: 10,
                      padding: "12px 12px",
                      cursor: "pointer",
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      textAlign: "left",
                      transition: "all 0.15s",
                      color: selected ? "#4ECDC4" : "rgba(255,255,255,0.55)",
                    }}
                    onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(78,205,196,0.35)"; }}
                    onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.10)"; }}
                  >
                    {/* Icon */}
                    <span style={{ flexShrink: 0 }}>{meta.icon}</span>
                    {/* Text */}
                    <span>
                      <div style={{ fontSize: 13, fontWeight: 600, color: selected ? "#fff" : "rgba(255,255,255,0.80)", lineHeight: 1.2 }}>
                        {displayName}
                      </div>
                      {meta.subtitle && (
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                          {meta.subtitle}
                        </div>
                      )}
                    </span>
                    {/* Indicator */}
                    <div style={{
                      position: "absolute", top: 8, right: 8,
                      width: 20, height: 20, borderRadius: "50%",
                      border: `2px solid ${selected ? "#4ECDC4" : "rgba(255,255,255,0.25)"}`,
                      background: selected ? "#4ECDC4" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      {selected && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="#0a0d14">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                      )}
                    </div>
                  </button>
                );
              });
            })()}
          </div>
        </Card>
      )}

      {/* ── SYSTEMS IN SCOPE ── */}
      {showSystems && (
        <Card className="animate-fadeIn">
          <Label required>
            {pt === "Energy Community Planning"
              ? "Entities in Scope"
              : "Systems in Scope"}
          </Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {selectableSystems.map((sys) => (
              <button
                key={sys}
                onClick={() => toggleSystem(sys)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                  systemsSet.has(sys)
                    ? "bg-[#4ECDC4] text-[#0b1220] border-[#4ECDC4]"
                    : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                }`}
              >
                {sys}
              </button>
            ))}
          </div>
          {disabledSystems.length > 0 && (
            <p className="text-xs text-gray-400 mt-2">
              🔒 Coming soon: {disabledSystems.join(", ")}
            </p>
          )}

          {/* Follow-up: Battery for RE PV systems */}
          {Object.entries(followUps).map(([fuSystem, cfg]) => {
            const triggered = cfg.triggers.some((t) => systemsSet.has(t));
            if (!triggered) return null;
            const answer = project.followUpAnswers[fuSystem] ?? false;
            return (
              <div key={fuSystem} className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium">{cfg.question}</p>
                <p className="text-xs text-gray-500 mb-2">{cfg.help}</p>
                <div className="flex gap-3">
                  {["Yes", "No"].map((opt) => (
                    <button
                      key={opt}
                      onClick={() =>
                        setProject({
                          followUpAnswers: {
                            ...project.followUpAnswers,
                            [fuSystem]: opt === "Yes",
                          },
                          systemsInScope:
                            opt === "Yes" && !systemsSet.has(fuSystem)
                              ? [...project.systemsInScope, fuSystem]
                              : opt === "No"
                              ? project.systemsInScope.filter((s) => s !== fuSystem)
                              : project.systemsInScope,
                        })
                      }
                      className={`px-4 py-1 rounded-lg text-sm font-medium border ${
                        (opt === "Yes") === answer
                          ? "bg-[#4ECDC4] text-[#0b1220] border-[#4ECDC4]"
                          : "bg-white border-gray-300"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}



          {/* EC follow-ups: existing PV / battery */}
          {pt === "Energy Community Planning" && (
            <>
              {hasPvSelected && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium">
                    {EC_FOLLOW_UP_QUESTIONS.existing_pv?.question}
                  </p>
                  <p className="text-xs text-gray-500 mb-2">
                    {EC_FOLLOW_UP_QUESTIONS.existing_pv?.help}
                  </p>
                  <div className="flex gap-3">
                    {[true, false].map((val) => (
                      <button
                        key={String(val)}
                        onClick={() => setProject({ ecExistingPv: val })}
                        className={`px-4 py-1 rounded-lg text-sm font-medium border ${
                          project.ecExistingPv === val
                            ? "bg-[#4ECDC4] text-[#0b1220] border-[#4ECDC4]"
                            : "bg-white border-gray-300"
                        }`}
                      >
                        {val ? "Yes" : "No"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {systemsSet.has("Battery System") && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium">
                    {EC_FOLLOW_UP_QUESTIONS.existing_battery?.question}
                  </p>
                  <p className="text-xs text-gray-500 mb-2">
                    {EC_FOLLOW_UP_QUESTIONS.existing_battery?.help}
                  </p>
                  <div className="flex gap-3">
                    {[true, false].map((val) => (
                      <button
                        key={String(val)}
                        onClick={() => setProject({ ecExistingBattery: val })}
                        className={`px-4 py-1 rounded-lg text-sm font-medium border ${
                          project.ecExistingBattery === val
                            ? "bg-[#4ECDC4] text-[#0b1220] border-[#4ECDC4]"
                            : "bg-white border-gray-300"
                        }`}
                      >
                        {val ? "Yes" : "No"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* RE electricity threshold */}
          {pt === "Renewable Energy Planning" && hasPvSelected && (
            <div className="mt-4">
              <SectionDivider />
              <Label>What is your electricity target?</Label>
              <p className="text-xs text-gray-500 mb-2">
                Energy balance — PV covers 100% of annual demand. Surplus — PV exceeds
                demand. Partial coverage — PV covers a share.
              </p>
              <div className="flex gap-2">
                {RE_ELECTRICITY_THRESHOLDS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() =>
                      setProject({ reElectricityThreshold: opt })
                    }
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                      project.reElectricityThreshold === opt
                        ? "bg-[#4ECDC4] text-[#0b1220] border-[#4ECDC4]"
                        : "bg-white border-gray-300"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── EC ENERGY FOCUS ── */}
      {showEcFocus && (
        <Card>
          <Label required>Energy System in Scope</Label>
          <div className="flex gap-2 mt-2">
            {EC_FOCUS_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  const next = project.ecEnergyFocus.includes(opt)
                    ? project.ecEnergyFocus.filter((f) => f !== opt)
                    : [...project.ecEnergyFocus, opt];
                  setProject({ ecEnergyFocus: next });
                }}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
                  project.ecEnergyFocus.includes(opt)
                    ? "bg-[#4ECDC4] text-[#0b1220] border-[#4ECDC4]"
                    : "bg-white text-gray-600 border-gray-300"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* ── EXPLORATION APPROACHES ── */}
      {showExploration && (
        <Card className="animate-fadeIn">
          <Label required>How would you like to explore this?</Label>
          <div className="space-y-2 mt-2">
            {EXPLORATION_OPTIONS.map((approach) => {
              const cfg = EXPLORATION_CONSTRAINTS[approach];
              if (!cfg) return null;
              const selected = project.explorationApproaches.includes(approach);
              return (
                <button
                  key={approach}
                  onClick={() => toggleExploration(approach)}
                  className={`w-full text-left rounded-xl border-2 px-4 py-3 transition ${
                    selected
                      ? "border-[#4ECDC4] bg-[#4ECDC4]/5"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-dark">
                      {approach}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {cfg.description}
                  </p>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── KPIs ── */}
      {showKpis && (
        <Card className="animate-fadeIn">
          <Label required>Key Performance Indicators</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {UNIVERSAL_KPIS.map((kpi) => (
              <button
                key={kpi}
                onClick={() => toggleKpi(kpi)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                  project.selectedKpis.includes(kpi)
                    ? "bg-[#4ECDC4] text-[#0b1220] border-[#4ECDC4]"
                    : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                }`}
                style={{ color: project.selectedKpis.includes(kpi) ? "#fff" : "rgba(255,255,255,0.80)" }}
              >
                {kpi}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* ── SCALE ── */}
      {showScale && <Card className={`animate-fadeIn ${districtOpen ? "relative z-40" : ""}`}>
        <Label required>Scale</Label>
        {pt === "Energy Community Planning" && (
          <p className="text-xs text-gray-500 mb-2">
            Energy Community Planning is available at Neighborhood or Portfolio scale
          </p>
        )}
        <div className="flex gap-3 mt-1">
          {scaleOptions.map((opt) => (
            <button
              key={opt}
              onClick={() => setProject({ scale: opt, buildingUses: [] })}
              className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                project.scale === opt
                  ? "bg-[#4ECDC4] text-[#0b1220] border-[#4ECDC4]"
                  : "bg-white border-gray-300 hover:border-gray-400"
              }`}
            >
              {opt === "Building" ? "Building(s)" : opt}
            </button>
          ))}
        </div>

        {/* Neighborhood name — searchable picker of real Gothenburg
            primärområden (SE); typing "lindholm" resolves "Lindholmen" and
            auto-selects all its buildings in Step 2. UK keeps free text. */}
        {project.scale === "Neighborhood" && (
          <div className="mt-4">
            <Label>Neighborhood name</Label>
            {isSweden && districts.length > 0 ? (
              <div className="relative">
                <input
                  type="text"
                  value={districtQuery}
                  onChange={(e) => { setDistrictQuery(e.target.value); setDistrictOpen(true); if (project.district) setProject({ district: null }); }}
                  onFocus={() => setDistrictOpen(true)}
                  onBlur={() => setTimeout(() => setDistrictOpen(false), 150)}
                  placeholder="e.g. Lindholmen, Majorna, Gamlestaden"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:ring-2 focus:ring-teal focus:border-teal mt-1"
                />
                {districtOpen && districtMatches.length > 0 && (
                  <ul className="absolute z-50 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-white/10 bg-[#11161d] shadow-xl shadow-black/40">
                    {districtMatches.map((d) => (
                      <li key={d.name}>
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); pickDistrict(d.name); }}
                          className="flex w-full items-center justify-between px-4 py-2 text-sm hover:bg-white/10 text-left"
                        >
                          <span className="text-white/85">{d.name}</span>
                          <span className="text-xs text-white/40">{d.count.toLocaleString()} buildings</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {selectedDistrict ? (
                  <p className="text-xs text-emerald-700 mt-1">
                    ✓ <span className="font-semibold">{selectedDistrict.name}</span> — all {selectedDistrict.count.toLocaleString()} buildings will be loaded in Step 2.
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">Pick a Gothenburg neighborhood to auto-select every building within it.</p>
                )}
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={project.neighborhoodName}
                  onChange={(e) => setProject({ neighborhoodName: e.target.value })}
                  placeholder="e.g. Canary Wharf"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:ring-2 focus:ring-teal focus:border-teal mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">Name the neighborhood/district this project covers.</p>
              </>
            )}
          </div>
        )}

        {/* Property owner — shown at Portfolio scale. Placeholder registry for
            now; the building→owner mapping is filled in later. */}
        {project.scale === "Portfolio" && (
          <div className="mt-4">
            <Label>Property owner</Label>
            <select
              value={project.propertyOwner ?? ""}
              onChange={(e) => setProject({ propertyOwner: e.target.value || null })}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:ring-2 focus:ring-teal focus:border-teal mt-1"
              style={{ backgroundColor: "#11161d", color: "#fff" }}
            >
              <option value="" style={{ backgroundColor: "#11161d", color: "#fff" }}>Select a property owner…</option>
              {PORTFOLIO_OWNERS.map((owner) => (
                <option key={owner} value={owner} style={{ backgroundColor: "#11161d", color: "#fff" }}>{owner}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Placeholder list — buildings will be mapped to their owner later; this scopes the portfolio to one owner.
            </p>
          </div>
        )}
      </Card>}

      {/* ── PROJECT NAME ── */}
      {showProjectName && <Card className="animate-fadeIn">
        <Label>Project Name</Label>
        <input
          type="text"
          value={project.projectName}
          onChange={(e) => setProject({ projectName: e.target.value })}
          placeholder="e.g. Lindholmen Retrofit Study"
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:ring-2 focus:ring-teal focus:border-teal mt-1"
        />
      </Card>}

      {/* ── LOCATION ── */}
      {/* District-by-name (SE neighborhood) selects buildings directly, so the
          bbox-draw map is redundant and hidden in that case. */}
      {showLocation && !(project.scale === "Neighborhood" && isSweden && project.district) && (
        <Card className="animate-fadeIn">
          <Label>Project Location</Label>
          <LocationMap
            scale={project.scale}
            country={project.country}
            city={project.city}
            onAddressChange={(addr) => setProject({ address: addr })}
            onPointsChange={(pts) => setProject({ buildingPoints: pts })}
            onBboxChange={handleBboxChange}
            onPolygonChange={handlePolygonChange}
            onLocationValidityChange={(valid) => setLocationValid(valid)}
          />

          {/* Building lookup status */}
          {buildingLoading && (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <svg className="animate-spin w-3.5 h-3.5 text-purple-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Looking up building data…
            </div>
          )}
          {!buildingLoading && project.lookedUpBuildings && project.lookedUpBuildings.length > 1 && (
            <div className="mt-2 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <span>✓</span>
              <span><span className="font-semibold">{project.lookedUpBuildings.length} buildings found</span>. Full data shown in Step 2.</span>
            </div>
          )}
          {!buildingLoading && project.lookedUpBuilding && (!project.lookedUpBuildings || project.lookedUpBuildings.length <= 1) && (
            <div className="mt-2 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <span>✓</span>
              <span>Building found — <span className="font-semibold">{project.lookedUpBuilding.address ?? "EUBUCCO match"}</span>. Full data shown in Step 2.</span>
            </div>
          )}
          {!buildingLoading && project.bboxStats && (
            <div className="mt-2 flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <span>✓</span>
              <span><span className="font-semibold">{project.bboxStats.count.toLocaleString()} buildings</span> found in area. Full data shown in Step 2.</span>
            </div>
          )}
        </Card>
      )}

      {/* ── VALIDATION ERRORS ── */}
      {validationErrors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold mb-1">Please complete the following:</p>
          <ul className="list-disc list-inside">
            {validationErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
}