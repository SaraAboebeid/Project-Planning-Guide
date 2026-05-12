import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../../store/wizard";
import { api } from "../../api/client";
import type { BuildingLookup } from "../../types";
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
  COUNTRY_OPTIONS,
  BUILDING_USES,
  RE_ELECTRICITY_THRESHOLDS,
  type ProjectType,
} from "../../config/projectConfig";

import LocationMap from "../../components/LocationMap";

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

/* ── Building preview card (shown in Step 1 after geocoding) ──── */

// Fields critical for each project type
const CRITICAL_BY_TYPE: Record<string, string[]> = {
  "Renovation Planning":       ["year", "eclass", "tabula_u_wall", "tabula_u_win", "use_cat", "floors"],
  "Energy Community Planning": ["footprint_m2", "floors", "height", "use_cat", "eclass", "energy"],
  "Renewable Energy Planning": ["footprint_m2", "floors", "height", "use_cat"],
};

function FieldChip({
  label, value, critical,
}: { label: string; value: string | number | null | undefined; critical: boolean }) {
  const hasVal = value !== null && value !== undefined;
  const base = "flex flex-col px-2.5 py-2 rounded-lg border text-[11px]";
  const colors = hasVal
    ? critical
      ? "bg-purple-50 border-purple-200 text-purple-900"
      : "bg-emerald-50 border-emerald-200 text-emerald-800"
    : critical
      ? "bg-red-50 border-red-200 text-red-700"
      : "bg-slate-50 border-slate-200 text-slate-500";
  return (
    <div className={`${base} ${colors}`}>
      <span className="font-semibold leading-tight">{hasVal ? String(value) : "—"}</span>
      <span className="text-[10px] opacity-70 mt-0.5">{label}{critical && " ★"}</span>
    </div>
  );
}

function BuildingPreviewCard({ b, projectType }: { b: BuildingLookup; projectType: string | null }) {
  const critical = new Set(projectType ? (CRITICAL_BY_TYPE[projectType] ?? []) : []);
  const fields: { key: keyof BuildingLookup; label: string }[] = [
    { key: "use_cat",       label: "Use" },
    { key: "year",          label: "Year built" },
    { key: "floors",        label: "Floors" },
    { key: "height",        label: "Height (m)" },
    { key: "footprint_m2",  label: "Footprint (m²)" },
    { key: "eclass",        label: "Energy class" },
    { key: "energy",        label: "Energy (kWh/m²)" },
    { key: "tabula_u_wall", label: "U-wall (W/m²K)" },
    { key: "tabula_u_win",  label: "U-win (W/m²K)" },
  ];

  const missingCritical = fields.filter(f => critical.has(f.key) && (b[f.key] === null || b[f.key] === undefined));

  return (
    <div className="mt-4 rounded-xl border border-purple-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-purple-50 border-b border-purple-100">
        <div className="flex items-center gap-2">
          <span className="text-base">🏗️</span>
          <span className="text-xs font-semibold text-purple-900">
            Building found in EUBUCCO — {b.dist_m} m away
          </span>
          {b.has_epc && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-bold border border-emerald-200">EPC ✓</span>
          )}
        </div>
        {b.address && <span className="text-[10px] text-purple-700 truncate max-w-[200px]">{b.address}</span>}
      </div>

      {/* Fields grid */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 p-3">
        {fields.map(f => (
          <FieldChip
            key={String(f.key)}
            label={f.label}
            value={b[f.key] as string | number | null}
            critical={critical.has(f.key)}
          />
        ))}
      </div>

      {/* Missing critical data warning */}
      {missingCritical.length > 0 && (
        <div className="mx-3 mb-3 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          <span className="text-sm mt-0.5">⚠️</span>
          <span>
            <span className="font-semibold">Missing critical data for {projectType}:</span>{" "}
            {missingCritical.map(f => f.label).join(", ")}.
            {" "}Step 2 will show fallback options.
          </span>
        </div>
      )}

      {/* 3D Inspector link */}
      <div className="px-3 pb-3">
        <a
          href={`http://127.0.0.1:8765/gothenburg_3d.html`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-purple-700 hover:text-purple-900 underline underline-offset-2"
        >
          📷 Open 3D Facade Inspector →
        </a>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════════════ */

export default function DefineProject() {
  const { project, setProject, setStep } = useWizardStore();
  const navigate = useNavigate();
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [buildingLoading, setBuildingLoading] = useState(false);
  const lookupDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Building lookup — fires when buildingPoints changes ─────── */
  useEffect(() => {
    const pts = project.buildingPoints;
    if (!pts || pts.length === 0) {
      setProject({ lookedUpBuilding: null });
      return;
    }
    // Use first point for lookup
    const { lat, lon } = pts[0];
    if (lookupDebounce.current) clearTimeout(lookupDebounce.current);
    lookupDebounce.current = setTimeout(async () => {
      setBuildingLoading(true);
      try {
        const b = await api.lookupBuilding(lat, lon);
        setProject({ lookedUpBuilding: b });
      } catch {
        setProject({ lookedUpBuilding: null });
      } finally {
        setBuildingLoading(false);
      }
    }, 400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.buildingPoints]);

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
    if (!project.country) missing.push("country");
    if (pt === "Energy Community Planning" && !project.ecEnergyFocus.length) {
      missing.push("energy focus");
    }
    if (missing.length) {
      setValidationErrors(missing);
      return;
    }
    setValidationErrors([]);
    setStep(2);
    navigate("/step/2");
  }

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
  const showSystems        = !!pt && pt !== "Renovation Planning";
  const showEcFocus        = pt === "Energy Community Planning" && project.systemsInScope.length > 0;
  const showExploration    = !!pt && project.systemsInScope.length > 0
                              && (pt !== "Energy Community Planning" || project.ecEnergyFocus.length > 0);
  const showKpis           = showExploration && project.explorationApproaches.length > 0;
  const showScale          = showKpis && project.selectedKpis.length > 0;
  const showBuildingUses   = project.scale === "Neighborhood";
  const showCountry        = showScale && !!project.scale;
  const showProjectName    = showCountry && !!project.country;
  const showLocation       = showProjectName;

  /* ── progress tracker ──────────────────────────────────────── */
  // Each entry: [label, isDone]
  const progressSteps: [string, boolean][] = [
    ["Project type",       !!pt],
    ["Systems in scope",   project.systemsInScope.length > 0],
    ...(pt === "Energy Community Planning"
      ? [["Energy focus", project.ecEnergyFocus.length > 0] as [string, boolean]]
      : []),
    ["Exploration",        project.explorationApproaches.length > 0],
    ["KPIs",              project.selectedKpis.length > 0],
    ["Scale",             !!project.scale],
    ...(project.scale === "Neighborhood"
      ? [["Building uses", project.buildingUses.length > 0] as [string, boolean]]
      : []),
    ["Country",           !!project.country],
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
    <div className="space-y-2">

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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
          {PROJECT_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => handleTypeChange(t)}
              className={`rounded-xl border-2 p-4 text-left transition ${
                pt === t
                  ? "border-teal bg-teal/10"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="font-semibold text-dark text-sm">{t}</span>
              <p className="text-xs text-gray-500 mt-1">
                {PROJECT_TYPE_DESCRIPTIONS[t]}
              </p>
            </button>
          ))}
        </div>
      </Card>

      {/* ── RENOVATION ENVELOPE COMPONENTS (shown directly, no systems toggle needed) ── */}
      {pt === "Renovation Planning" && (
        <Card className="animate-fadeIn">
          <Label required>Which components are included in the renovation?</Label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {ENVELOPE_COMPONENTS.map((comp) => (
              <label key={comp} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={project.renovationEnvelopeComponents.includes(comp)}
                  onChange={() => toggleEnvelopeComponent(comp)}
                  className="rounded border-gray-300 text-teal focus:ring-teal"
                />
                {comp}
              </label>
            ))}
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
                    ? "bg-navy text-white border-navy"
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
                          ? "bg-teal text-white border-teal"
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
                            ? "bg-teal text-white border-teal"
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
                            ? "bg-teal text-white border-teal"
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
                Net zero — PV covers 100% of annual demand. Surplus — PV exceeds
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
                        ? "bg-navy text-white border-navy"
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
                    ? "bg-navy text-white border-navy"
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
                      ? "border-teal bg-teal/5"
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
                    ? "bg-green text-white border-green"
                    : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                }`}
              >
                {kpi}
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* ── SCALE ── */}
      {showScale && <Card className="animate-fadeIn">
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
                  ? "bg-navy text-white border-navy"
                  : "bg-white border-gray-300 hover:border-gray-400"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </Card>}

      {/* ── BUILDING USES (Neighborhood) ── */}
      {showBuildingUses && (
        <Card className="animate-fadeIn">
          <div className="flex items-center justify-between mb-2">
            <Label>Building Uses Included</Label>
            <div className="flex gap-2">
              <button
                onClick={() => setProject({ buildingUses: [...BUILDING_USES] })}
                className="text-xs text-teal hover:underline"
              >
                Select all
              </button>
              <button
                onClick={() => setProject({ buildingUses: [] })}
                className="text-xs text-gray-400 hover:underline"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {BUILDING_USES.map((use) => (
              <label
                key={use}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={project.buildingUses.includes(use)}
                  onChange={() => toggleBuildingUse(use)}
                  className="rounded border-gray-300 text-teal focus:ring-teal"
                />
                {use}
              </label>
            ))}
          </div>
          {project.buildingUses.length > 0 && (
            <p className="text-xs text-teal mt-2">
              {project.buildingUses.length} building type(s) selected
            </p>
          )}
        </Card>
      )}

      {/* ── COUNTRY ── */}
      {showCountry && <Card className="animate-fadeIn">
        <Label required>Country</Label>
        <div className="flex gap-2 mt-1">
          {COUNTRY_OPTIONS.map((c) => {
            const isDisabled = c === "Belgium" || c === "Ireland" || c === "United Kingdom";
            return (
              <button
                key={c}
                onClick={() => !isDisabled && setProject({ country: c })}
                disabled={isDisabled}
                title={isDisabled ? "Coming soon" : undefined}
                className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                  isDisabled
                    ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                    : project.country === c
                    ? "bg-navy text-white border-navy"
                    : "bg-white border-gray-300 hover:border-gray-400"
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>
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
      {showLocation && (
        <Card className="animate-fadeIn">
          <Label>Project Location</Label>
          <LocationMap
            scale={project.scale}
            onAddressChange={(addr) => setProject({ address: addr })}
            onPointsChange={(pts) => setProject({ buildingPoints: pts })}
          />

          {/* Building lookup preview */}
          {buildingLoading && (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <svg className="animate-spin w-3.5 h-3.5 text-purple-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Looking up building data…
            </div>
          )}

          {!buildingLoading && project.lookedUpBuilding && (
            <BuildingPreviewCard b={project.lookedUpBuilding} projectType={pt} />
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

      {/* ── NAVIGATION ── */}
      <div className="flex justify-between items-center pt-4 pb-8">
        <button onClick={() => navigate("/")} className="ppg-btn-secondary">← Back</button>
        <button onClick={handleContinue} className="ppg-btn-primary">Continue →</button>
      </div>
    </div>
  );
}