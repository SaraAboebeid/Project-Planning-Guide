import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore, type RenovationBaselineResult } from "../store/wizard";
import { api } from "../api/client";
import type { BuildingLookup, BuildingRecord } from "../types";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from "recharts";
import { Building2, Zap, Loader2, BarChart2, Thermometer, Droplets, Download, Lightbulb, Cpu } from "lucide-react";
import BaselineLoadProfile from "../components/BaselineLoadProfile";

const END_USE_COLORS = {
  heating: "#E2483B",
  dhw: "#93c5fd",
  cooling: "#4A90E2",
  lighting: "#E8880C",
  equipment: "#2FB477",
  total: "#d1d5db",
} as const;

/** Normalise a bbox BuildingRecord into the same shape as BuildingLookup */
function recordToLookup(r: BuildingRecord, idx: number): BuildingLookup {
  // bbox rows never carry a real polygon (only /api/building does), so wall
  // area here is the same square-approximation fallback used elsewhere for
  // this same reason - see frontend/src/utils/componentAreas.ts.
  const approxPerimeter = r.footprint_m2 ? 4 * Math.sqrt(r.footprint_m2) : null;
  return {
    address:       r.address || null,
    height:        r.height_m,
    floors:        r.floors,
    area_atemp:    null,
    footprint_m2:  r.footprint_m2,
    wall_perimeter_m: null,
    wall_area_m2:  approxPerimeter && r.height_m ? approxPerimeter * r.height_m : null,
    roof_area_m2:  r.footprint_m2,
    floor_area_m2: r.footprint_m2,
    use_cat:       r.building_use,
    year:          r.year_built,
    energy:        r.energy_kwh_m2,
    eclass:        r.epc_class,
    tabula_period: r.tabula_period,
    tabula_u_wall: r.u_wall,
    tabula_u_roof: r.u_roof,
    tabula_u_win:  r.u_window,
    has_epc:       r.has_epc ?? false,
    lat:           r.lat,
    lon:           r.lon,
    dist_m:        0,
  };
}

/* ─── Fields required for baseline EPSM simulation ───────────────────────── */
const REQUIRED_FIELDS: {
  key: keyof BuildingLookup;
  label: string;
  unit?: string;
  priority: "high" | "medium";
}[] = [
  { key: "height",        label: "Building height",     unit: "m",      priority: "high" },
  { key: "floors",        label: "Floors",                              priority: "high" },
  { key: "area_atemp",    label: "Heated floor area",   unit: "m²",     priority: "high" },
  { key: "footprint_m2",  label: "Footprint area",      unit: "m²",     priority: "medium" },
  { key: "use_cat",       label: "Use category",                        priority: "high" },
  { key: "year",          label: "Construction year",                   priority: "high" },
  { key: "tabula_period", label: "Tabula typology",                     priority: "medium" },
  { key: "tabula_u_wall", label: "U-value walls",       unit: "W/m²K",  priority: "high" },
  { key: "tabula_u_win",  label: "U-value windows",     unit: "W/m²K",  priority: "high" },
];

function bKey(b: BuildingLookup, idx: number) {
  return b.address ?? `Building ${idx + 1}`;
}

function mergedVal(
  building: BuildingLookup,
  key: keyof BuildingLookup,
  sup: Record<string, unknown>,
): unknown {
  if (sup[key] !== undefined && sup[key] !== null) return sup[key];
  return building[key];
}

/* ─── Main page ───────────────────────────────────────────────────────────── */
export default function BaselineSetup() {
  const navigate = useNavigate();
  const { project, setProject } = useWizardStore();

  const buildings = useMemo<BuildingLookup[]>(() => {
    if (project.lookedUpBuildings.length > 0) return project.lookedUpBuildings;
    if (project.lookedUpBuilding) return [project.lookedUpBuilding];
    if (project.bboxRows.length > 0) return project.bboxRows.map(recordToLookup);
    return [];
  }, [project.lookedUpBuildings, project.lookedUpBuilding, project.bboxRows]);

  // Any data the user filled in Step 2 already lives in the building rows; this
  // per-building override map stays only as a harmless (usually empty) fallback.
  const supplementary = project.supplementaryData ?? {};

  const [simRunning, setSimRunning] = useState(false);
  const [simProgress, setSimProgress] = useState(0);
  const [simError, setSimError] = useState<string | null>(null);
  const [resultView, setResultView] = useState<"all" | "building">("all");
  const [activeResultAddress, setActiveResultAddress] = useState<string | null>(null);
  // Ref to the results section so we can auto-scroll when simulation completes
  const resultsRef = useRef<HTMLDivElement>(null);

  // Which buildings to run the baseline for. null means: fall back to the
  // Step 2 shortlist or all buildings by default. Keep a dedicated mode so the
  // UI can distinguish “Use Step 2 shortlist” from “Select all” even when both
  // resolve to the same set.
  const [selected, setSelected] = useState<Set<number> | null>(null);
  const [selectionMode, setSelectionMode] = useState<"step2" | "all" | "custom">("step2");
  const allIdx = useMemo(() => new Set(buildings.map((_, i) => i)), [buildings]);
  const prioritizedIdx = useMemo(() => {
    const idx = project.prioritizedBuildingIndices ?? [];
    const valid = idx.filter((i) => Number.isInteger(i) && i >= 0 && i < buildings.length);
    return valid.length ? new Set(valid) : null;
  }, [project.prioritizedBuildingIndices, buildings.length]);
  const effectiveSelected = selected ?? prioritizedIdx ?? allIdx;
  const carriesFromStep2 = selectionMode === "step2" && prioritizedIdx != null;
  /* "Use Step 2 shortlist" is only worth offering when it differs from "Select
     all" — with no shortlist, or one covering every building, the two buttons
     did exactly the same thing. */
  const shortlistDiffersFromAll = prioritizedIdx != null && prioritizedIdx.size < buildings.length;

  useEffect(() => {
    setSelected(null);
    setSelectionMode("step2");
  }, [project.prioritizedBuildingIndices, buildings.length]);

  const runList = useMemo(
    () => buildings.filter((_, i) => effectiveSelected.has(i)),
    [buildings, effectiveSelected],
  );

  function applySelection(nextSet: Set<number>, mode: "step2" | "all" | "custom") {
    setSelected(nextSet);
    setSelectionMode(mode);
  }

  function toggleBuilding(i: number) {
    setSelectionMode("custom");
    setSelected((prev) => {
      const base = prev ?? new Set(effectiveSelected);
      const next = new Set(base);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  const results = project.renovationBaselineResults;

  useEffect(() => {
    if (!results.length) {
      setActiveResultAddress(null);
      return;
    }
    if (!activeResultAddress || !results.some((r) => r.address === activeResultAddress)) {
      setActiveResultAddress(results[0]?.address ?? null);
    }
  }, [activeResultAddress, results]);

  /** Hot water for a saved result. Results written before the DHW field existed
   *  stored 0, but the total is the sum of all five end uses by construction, so
   *  the residual recovers it exactly - and stays 0 for genuinely DHW-free runs.
   *  A function declaration, not a const: the charts below call it during render. */
  function dhwOf(r: RenovationBaselineResult) {
    return r.dhw || Math.max(0, Math.round((r.energyUse - r.heating - r.cooling - r.lighting - r.equipment) * 10) / 10);
  }

  const allBuildingsChartData = useMemo(
    () => results.map((r) => ({
      name: r.address,
      shortName: r.address.length > 28 ? `${r.address.slice(0, 28)}…` : r.address,
      heating: r.heating,
      dhw: dhwOf(r),
      cooling: r.cooling,
      lighting: r.lighting,
      equipment: r.equipment,
      total: r.energyUse,
    })),
    [results],
  );

  const activeBuildingResult = useMemo(
    () => results.find((r) => r.address === activeResultAddress) ?? results[0] ?? null,
    [activeResultAddress, results],
  );

  const activeBuildingChartData = useMemo(() => {
    if (!activeBuildingResult) return [];
    return [
      { key: "Heating", value: activeBuildingResult.heating, color: END_USE_COLORS.heating },
      { key: "Hot water", value: dhwOf(activeBuildingResult), color: END_USE_COLORS.dhw },
      { key: "Cooling", value: activeBuildingResult.cooling, color: END_USE_COLORS.cooling },
      { key: "Lighting", value: activeBuildingResult.lighting, color: END_USE_COLORS.lighting },
      { key: "Equipment", value: activeBuildingResult.equipment, color: END_USE_COLORS.equipment },
      { key: "Total", value: activeBuildingResult.energyUse, color: END_USE_COLORS.total },
    ];
  }, [activeBuildingResult]);

  const eClassColor: Record<string, string> = { A: "#2FB477", B: "#2FB477", C: "#2FB477", D: "#E8880C", E: "#f97316", F: "#E2483B", G: "#dc2626" };

  /** Trigger a browser download for an in-memory file. */
  function saveFile(contents: string, filename: string, mime: string) {
    const blob = new Blob([contents], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Same figures as the JSON export, one row per building. Quoted addresses
   *  because Swedish street names carry commas often enough to corrupt a CSV. */
  function downloadResultsCsv() {
    const header = [
      "address", "energy_class", "energy_class_source",
      "total_energy_use_kWh_m2_yr", "heating_demand_kWh_m2_yr", "cooling_demand_kWh_m2_yr",
      "hot_water_demand_kWh_m2_yr", "lighting_demand_kWh_m2_yr", "equipment_demand_kWh_m2_yr",
    ];
    const lines = [header.join(",")];
    for (const r of results) {
      lines.push([
        `"${(r.address ?? "").replace(/"/g, '""')}"`,
        r.eClass ?? "", r.eClassFromEpc ? "EPC" : "not available",
        r.energyUse, r.heating, r.cooling, dhwOf(r), r.lighting, r.equipment,
      ].join(","));
    }
    saveFile(lines.join("\n"), "epsm_baseline_results.csv", "text/csv;charset=utf-8");
  }

  function downloadResults() {
    const payload = {
      generated: new Date().toISOString(),
      simulation: "EPSM Baseline",
      buildings: results.map(r => ({
        address: r.address,
        energyClass: r.eClass,
        energyClassSource: r.eClassFromEpc ? "EPC" : "not available",
        totalEnergyUse_kWh_m2_yr: r.energyUse,
        heatingDemand_kWh_m2_yr: r.heating,
        coolingDemand_kWh_m2_yr: r.cooling,
        lightingDemand_kWh_m2_yr: r.lighting,
        equipmentDemand_kWh_m2_yr: r.equipment,
        hotWaterDemand_kWh_m2_yr: dhwOf(r),
      })),
    };
    saveFile(JSON.stringify(payload, null, 2), "epsm_baseline_results.json", "application/json");
  }

  /** Real batch EPSM run - one shoebox IDF per building, submitted together
   * (see backend's /api/simulation-batch-submit, which hands EPSM a LIST of
   * IDF files it runs as independent parallel tasks under one batch_id).
   * Polls batch-status every 3s until every building is completed/failed. */
  async function runBaseline() {
    if (runList.length === 0) return;
    setSimRunning(true);
    setSimProgress(0);
    setSimError(null);
    const isUK = project.country === "United Kingdom";

    try {
      const { batch_id } = await api.simulationBatchSubmit({
        country: isUK ? "gb" : "se",
        // Sweden needs an explicit city_id (only "gothenburg" is mapped); UK omits
        // it and the server resolves the nearest district from lat/lon.
        ...(isUK ? {} : { city_id: "gothenburg" }),
        buildings: runList.map((b) => ({ lat: b.lat, lon: b.lon, address: b.address })),
        package_id: "baseline",
      });

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const status = await api.simulationBatchStatus(batch_id);
        const done = (status.counts.completed ?? 0) + (status.counts.failed ?? 0);
        // Our own rows all flip at the very end of the batch, so counting them
        // pinned the bar at 0% for the whole run. EPSM's own progress moves
        // during it; take whichever is further along, and never go backwards.
        const rowPct = status.total ? Math.round((done / status.total) * 100) : 0;
        const epsmPct = typeof status.overall_progress === "number"
          ? Math.max(0, Math.min(100, Math.round(status.overall_progress)))
          : 0;
        setSimProgress((prev) => Math.max(prev, rowPct, epsmPct));

        if (status.overall_status === "completed" || status.overall_status === "failed" || done === status.total) {
          const mapped: RenovationBaselineResult[] = status.buildings.map((row, i) => {
            const src = runList[i];
            const r = row.results;
            return {
              address: row.address ?? (src ? bKey(src, i) : `Building ${i + 1}`),
              lat: row.lat ?? src?.lat,
              lon: row.lon ?? src?.lon,
              energyUse: r?.total_kwh_m2_yr ?? 0,
              heating: r?.heating_kwh_m2_yr ?? 0,
              cooling: r?.cooling_kwh_m2_yr ?? 0,
              lighting: r?.lighting_kwh_m2_yr ?? 0,
              equipment: r?.equipment_kwh_m2_yr ?? 0,
              // Real EnergyPlus "Water Systems" output. The shoebox draws hot
              // water from a stand-alone water heater sized to the Sveby
              // standard intensity for the building's use category, so this is
              // a played-back assumption rather than a prediction - but it puts
              // our total on the same end-use basis as an energideklaration.
              dhw: r?.dhw_kwh_m2_yr ?? 0,
              // Infiltration IS modelled (ZoneInfiltration:DesignFlowRate), but
              // EnergyPlus books it inside Heating rather than as its own end
              // use, so there is no separate figure to report.
              airLeakage: 0,
              eClass: src?.eclass ?? null,
              eClassFromEpc: !!src?.eclass,
            };
          });
          setProject({ baselineStatus: "done", renovationBaselineResults: mapped, baselineBatchId: batch_id });
          setSimRunning(false);
          setSimProgress(100);
          // Auto-scroll to results
          setTimeout(() => {
            resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 150);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    } catch (err) {
      setSimError((err as Error).message);
      setSimRunning(false);
    }
  }


  const buildingStatus = useMemo(() =>
    buildings.map((b, idx) => {
      const key = bKey(b, idx);
      const sup = supplementary[key] ?? {};
      const missing = REQUIRED_FIELDS.filter(f => {
        const v = mergedVal(b, f.key, sup);
        return v === null || v === undefined || v === "";
      });
      const covered = REQUIRED_FIELDS.length - missing.length;
      const highMissing = missing.filter(f => f.priority === "high").length;
      return { b, key, sup, missing, covered, complete: highMissing === 0 };
    }),
    [buildings, supplementary],
  );

  // The batch baseline only needs each building's lat/lon; missing envelope
  // details fall back to TABULA archetype defaults in the shoebox IDF, so the
  // run always completes. No need to gate on "all fields present" anymore.
  const canRunBaseline = runList.length > 0;

  /* Results persist across visits, so returning to Step 3 used to show a full
     set of baseline results for a selection the user had never run — including
     after they changed which buildings are selected. Compare what is stored
     against what is selected now, on coordinates (exact) with an address
     fallback for results saved before coordinates were recorded. */
  const baselineMatchesSelection = useMemo(() => {
    const stored = project.renovationBaselineResults ?? [];
    if (stored.length === 0 || runList.length === 0) return false;
    if (stored.length !== runList.length) return false;
    // Pick ONE comparison basis for both sides. Deciding per item would make a
    // legacy result (address only) unable to ever match a selection that has
    // coordinates, silently discarding a baseline that is actually current.
    const haveCoords =
      stored.every((r) => r.lat != null && r.lon != null) &&
      runList.every((b) => b.lat != null && b.lon != null);
    const key = (x: { lat?: number | null; lon?: number | null; address?: string | null }) =>
      haveCoords ? `${x.lat!.toFixed(6)},${x.lon!.toFixed(6)}` : (x.address ?? "").trim().toLowerCase();
    const storedKeys = new Set(stored.map(key));
    return runList.every((b) => storedKeys.has(key(b)));
  }, [project.renovationBaselineResults, runList]);

  // "Done" only counts when it describes the CURRENT selection.
  const baselineIsCurrent = project.baselineStatus === "done" && baselineMatchesSelection;
  // Re-run is only meaningful once a stored baseline exists for a different set
  // of buildings; otherwise this is simply a run.
  const isRerun = project.baselineStatus === "done"
    && (project.renovationBaselineResults?.length ?? 0) > 0
    && !baselineMatchesSelection;

  /* Baselines simulated before baselineBatchId existed have no pointer to their
     own EPSM run, so the load-profile panel had nothing to fetch and simply did
     not render - which reads as "the feature is missing" rather than "this run
     predates it". The trace is in the database either way, so resolve the id
     from the first building's coordinates and heal the stored project. */
  const [lookupTried, setLookupTried] = useState(false);
  useEffect(() => {
    if (project.baselineStatus !== "done" || project.baselineBatchId || lookupTried) return;
    const first = runList[0];
    if (!first) return;
    setLookupTried(true);
    api.baselineBatchLookup(first.lat, first.lon)
      .then((r) => { if (r.found && r.batch_id) setProject({ baselineBatchId: r.batch_id }); })
      .catch(() => { /* no profile available for this run - panel stays hidden */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.baselineStatus, project.baselineBatchId, runList, lookupTried]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1000 }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* ── Header ── */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, color: "rgba(255,255,255,0.3)", marginBottom: 6, textTransform: "uppercase" }}>
          Renovation Planning · Step 3
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>
          Baseline Simulation
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: 0, lineHeight: 1.6 }}>
          Simulate the as-built performance of the selected building{buildings.length !== 1 ? "s" : ""} —
          the baseline every renovation package is measured against.
        </p>
      </div>

      {/* ── Buildings to simulate (compact list, no data-gap repetition) ── */}
      {buildings.length === 0 ? (
        <div style={{ borderRadius: 12, padding: "20px 24px", background: "rgba(232,136,12,0.08)", border: "1px solid rgba(232,136,12,0.3)" }}>
          <p style={{ fontSize: 13, color: "#E8880C", margin: 0 }}>
            No buildings loaded yet — go back to Step 2 to select buildings.
          </p>
        </div>
      ) : (
        <div style={{ borderRadius: 14, padding: "14px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <Building2 size={14} color="#4ECDC4" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
              {effectiveSelected.size} of {buildings.length} building{buildings.length !== 1 ? "s" : ""} selected
            </span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              {shortlistDiffersFromAll && (
              <button onClick={() => applySelection(new Set(prioritizedIdx!), "step2")}
                style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, cursor: "pointer",
                  background: selectionMode === "step2" ? "#4ECDC4" : "rgba(78,205,196,0.12)",
                  border: `1px solid ${selectionMode === "step2" ? "#4ECDC4" : "rgba(78,205,196,0.35)"}`,
                  color: selectionMode === "step2" ? "#0b1220" : "#4ECDC4",
                  boxShadow: selectionMode === "step2" ? "0 0 0 1px rgba(78,205,196,0.18)" : "none",
                }}>
                Use Step 2 shortlist
              </button>
              )}
              <button onClick={() => applySelection(new Set(allIdx), "all")}
                style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, cursor: "pointer",
                  background: selectionMode === "all" ? "#4ECDC4" : "rgba(78,205,196,0.12)",
                  border: `1px solid ${selectionMode === "all" ? "#4ECDC4" : "rgba(78,205,196,0.35)"}`,
                  color: selectionMode === "all" ? "#0b1220" : "#4ECDC4",
                  boxShadow: selectionMode === "all" ? "0 0 0 1px rgba(78,205,196,0.18)" : "none",
                }}>
                Select all
              </button>
              <button onClick={() => applySelection(new Set(), "custom")}
                style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, cursor: "pointer",
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)" }}>
                Clear
              </button>
            </span>
          </div>
          {prioritizedIdx && (
            <p style={{ fontSize: 11, color: carriesFromStep2 ? "#fcd34d" : "rgba(255,255,255,0.45)", margin: "0 0 10px" }}>
              Step 2 flagged top priorities: {project.prioritizedBuildingCount || prioritizedIdx.size} building{(project.prioritizedBuildingCount || prioritizedIdx.size) === 1 ? "" : "s"}. These are the default buildings that will run baseline energy simulation in Step 3.
            </p>
          )}
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "0 0 10px" }}>
            Click a building to include or exclude it from the baseline run.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {buildingStatus.map((bs, idx) => {
              const on = effectiveSelected.has(idx);
              return (
                <button key={bs.key} onClick={() => toggleBuilding(idx)} title={on ? "Click to exclude" : "Click to include"}
                  style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: 8, fontWeight: 600, cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 5,
                    background: on ? "#4ECDC4" : "rgba(255,255,255,0.03)",
                    color: on ? "#0b1220" : "rgba(255,255,255,0.4)",
                    border: `1px solid ${on ? "#4ECDC4" : "rgba(255,255,255,0.08)"}`,
                    maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                  <span style={{ fontSize: 10 }}>{on ? "✓" : "＋"}</span>{bs.key}
                </button>
              );
            })}
          </div>
          {/* The run button belongs with the selection it acts on - it reads
              "for N buildings", so putting it anywhere else made the user scroll
              away from the chips to find out what N referred to. */}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            <button
              disabled={!canRunBaseline || simRunning}
              onClick={runBaseline}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "11px 24px", borderRadius: 10, border: 0,
                background: canRunBaseline && !simRunning ? "linear-gradient(135deg,#5a9e1e,#2FB477)" : "rgba(255,255,255,0.06)",
                color: canRunBaseline && !simRunning ? "#0a0d14" : "rgba(255,255,255,0.2)",
                fontSize: 13, fontWeight: 800, cursor: canRunBaseline && !simRunning ? "pointer" : "not-allowed",
                boxShadow: canRunBaseline && !simRunning ? "0 4px 14px rgba(47,180,119,0.3)" : "none",
              }}
            >
              {simRunning ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Zap size={14} />}
              {simRunning ? "Running…" : `${isRerun ? "Re-run" : "Run"} baseline energy simulation (EPSM) for ${runList.length} building${runList.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Baseline simulation ── */}
      <div style={{
        borderRadius: 14, padding: "20px 22px",
        background: canRunBaseline ? "rgba(47,180,119,0.05)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${canRunBaseline ? "rgba(47,180,119,0.25)" : "rgba(255,255,255,0.07)"}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          {simRunning
            ? <Loader2 size={15} color="#2FB477" style={{ animation: "spin 1s linear infinite" }} />
            : <Zap size={15} color={canRunBaseline ? "#2FB477" : "rgba(255,255,255,0.2)"} />}
          <h3 style={{ fontSize: 14, fontWeight: 700, color: canRunBaseline ? "#fff" : "rgba(255,255,255,0.35)", margin: 0 }}>
            Baseline Energy Simulation
          </h3>
          {baselineIsCurrent && !simRunning && (
            <span style={{
              marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#2FB477",
              background: "rgba(47,180,119,0.15)", padding: "2px 10px", borderRadius: 20,
            }}>
              ✓ Baseline complete
            </span>
          )}
        </div>

        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: "0 0 16px", lineHeight: 1.55 }}>
          {simRunning
            ? "Running EPSM simulation — please wait…"
            : canRunBaseline
              ? `Send ${runList.length} building${runList.length !== 1 ? "s" : ""} to EPSM to compute the as-built baseline. Missing envelope details fall back to TABULA archetype defaults, so the run always completes.`
              : "Select at least one building above to run the baseline."}
        </p>

        {/* Progress bar while running - reflects real per-building EPSM
            completion counts from the batch, not a simulated timer */}
        {simRunning && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Running EnergyPlus for each building…</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#2FB477" }}>{simProgress}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: "rgba(255,255,255,0.08)" }}>
              <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#5a9e1e,#2FB477)", width: `${simProgress}%`, transition: "width 0.25s" }} />
            </div>
          </div>
        )}

        {simError && !simRunning && (
          <div style={{ borderRadius: 8, padding: "10px 14px", background: "rgba(226,72,59,0.1)", border: "1px solid rgba(226,72,59,0.25)", marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: "#fca5a5" }}>⚠ Baseline simulation failed: {simError}</span>
          </div>
        )}

        {/* Real EPSM results — only for the selection they actually describe. */}
        {baselineIsCurrent && !simRunning && (
          <div ref={resultsRef} style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18, scrollMarginTop: 80 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 }}>
              EPSM Baseline Results
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8 }}>
              <button
                onClick={downloadResults}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  border: "1px solid rgba(78,205,196,0.35)", background: "rgba(78,205,196,0.08)", color: "#4ECDC4",
                }}
              >
                <Download size={12} /> Download JSON
              </button>
              <button
                onClick={downloadResultsCsv}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  border: "1px solid rgba(78,205,196,0.35)", background: "rgba(78,205,196,0.08)", color: "#4ECDC4",
                }}
              >
                <Download size={12} /> Download CSV
              </button>
            </div>
            <div style={{
              borderRadius: 12, padding: "14px 16px",
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Annual end-use comparison</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
                    Compare all buildings together, or inspect one building's annual EPSM end-use split. For monthly and hourly profiles, see the load-profile panel below.
                  </div>
                </div>
                <div style={{ display: "inline-flex", borderRadius: 10, padding: 3, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
                  <button
                    onClick={() => setResultView("all")}
                    style={{
                      border: 0, cursor: "pointer", borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700,
                      background: resultView === "all" ? "rgba(78,205,196,0.18)" : "transparent",
                      color: resultView === "all" ? "#4ECDC4" : "rgba(255,255,255,0.55)",
                    }}
                  >
                    All buildings
                  </button>
                  <button
                    onClick={() => setResultView("building")}
                    style={{
                      border: 0, cursor: "pointer", borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700,
                      background: resultView === "building" ? "rgba(78,205,196,0.18)" : "transparent",
                      color: resultView === "building" ? "#4ECDC4" : "rgba(255,255,255,0.55)",
                    }}
                  >
                    One building
                  </button>
                </div>
              </div>

              {resultView === "building" && activeBuildingResult && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 700 }}>Building</span>
                  <select
                    value={activeBuildingResult.address}
                    onChange={(e) => setActiveResultAddress(e.target.value)}
                    style={{
                      minWidth: 240, padding: "6px 10px", borderRadius: 8, fontSize: 11,
                      color: "#fff", background: "#0d1117", border: "1px solid rgba(255,255,255,0.12)",
                    }}
                  >
                    {results.map((r) => <option key={r.address} value={r.address}>{r.address}</option>)}
                  </select>
                </div>
              )}

              {/* Row pitch drives the panel height, so it shrinks with the bars
                  rather than leaving a tall band of empty space. At 28px per
                  building a 20-building portfolio is ~600px instead of ~1120. */}
              <div style={{ width: "100%", height: resultView === "all" ? Math.max(130, results.length * 28 + 46) : 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  {resultView === "all" ? (
                    <BarChart data={allBuildingsChartData} layout="vertical" barSize={20} margin={{ top: 8, right: 20, left: 10, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                      <XAxis type="number" stroke="rgba(255,255,255,0.35)" tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }} unit=" kWh/m²·yr" />
                      <YAxis type="category" dataKey="shortName" width={180} stroke="rgba(255,255,255,0.25)" tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 10 }} />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.03)" }}
                        contentStyle={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff" }}
                        formatter={(value: number, name: string) => [`${Number(value).toFixed(1)} kWh/m²·yr`, name]}
                        labelFormatter={(_, payload) => (payload?.[0]?.payload?.name as string) ?? ""}
                      />
                      <Bar dataKey="heating" stackId="enduse" fill={END_USE_COLORS.heating} radius={[0, 0, 0, 0]} name="Heating" />
                      <Bar dataKey="dhw" stackId="enduse" fill={END_USE_COLORS.dhw} radius={[0, 0, 0, 0]} name="Hot water" />
                      <Bar dataKey="cooling" stackId="enduse" fill={END_USE_COLORS.cooling} radius={[0, 0, 0, 0]} name="Cooling" />
                      <Bar dataKey="lighting" stackId="enduse" fill={END_USE_COLORS.lighting} radius={[0, 0, 0, 0]} name="Lighting" />
                      <Bar dataKey="equipment" stackId="enduse" fill={END_USE_COLORS.equipment} radius={[0, 4, 4, 0]} name="Equipment" />
                    </BarChart>
                  ) : (
                    <BarChart data={activeBuildingChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="key" stroke="rgba(255,255,255,0.35)" tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 10 }} />
                      <YAxis stroke="rgba(255,255,255,0.35)" tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }} unit=" kWh/m²·yr" />
                      <Tooltip
                        contentStyle={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff" }}
                        formatter={(value: number) => `${Number(value).toFixed(1)} kWh/m²·yr`}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {activeBuildingChartData.map((d) => <Cell key={d.key} fill={d.color} />)}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                {[
                  { label: "Heating", color: END_USE_COLORS.heating },
                  { label: "Cooling", color: END_USE_COLORS.cooling },
                  { label: "Lighting", color: END_USE_COLORS.lighting },
                  { label: "Equipment", color: END_USE_COLORS.equipment },
                ].map((item) => (
                  <div key={item.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
                    <span style={{ width: 9, height: 9, borderRadius: 999, background: item.color, display: "inline-block" }} />
                    {item.label}
                  </div>
                ))}
              </div>
            </div>
            {results.map(r => (
              <div key={r.address} style={{
                borderRadius: 12, padding: "14px 16px",
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
              }}>
                {/* Building name + energy class */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Building2 size={13} color="rgba(255,255,255,0.4)" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.address}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {r.eClassFromEpc && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: "#4A90E2", background: "rgba(96,165,250,0.12)", padding: "1px 6px", borderRadius: 5, border: "1px solid rgba(96,165,250,0.25)" }}>from EPC</span>
                    )}
                    <span style={{
                      fontSize: 13, fontWeight: 900, padding: "2px 12px", borderRadius: 8,
                      background: `${eClassColor[r.eClass ?? "D"] ?? "#E8880C"}22`,
                      color: eClassColor[r.eClass ?? "D"] ?? "#E8880C",
                      border: `1px solid ${eClassColor[r.eClass ?? "D"] ?? "#E8880C"}55`,
                    }}>Energy class {r.eClass ?? "—"}</span>
                  </div>
                </div>
                {/* Metric grid - all six are real EPSM end-use output. Hot water
                    is EnergyPlus's "Water Systems" end use, driven by a Sveby
                    standard draw profile (see tools/idf/defaults.py). */}
                {/* Results saved before the hot-water field existed stored dhw: 0
                    even when the run itself included it. The total is the sum of
                    all five end uses by construction, so the residual recovers it
                    exactly - and stays 0 for genuinely DHW-free older runs. */}
                {/* Fixed six columns, not auto-fit: with a min track width the
                    sixth tile (hot water) wrapped onto its own line and looked
                    like a separate, lesser thing. minmax(0,1fr) lets them
                    compress instead of wrapping. */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 8 }}>
                  {[
                    { icon: <BarChart2 size={13} color="#E8880C" />, label: "Total energy use", value: `${r.energyUse} kWh/m²·yr`, color: "#E8880C" },
                    { icon: <Thermometer size={13} color="#E2483B" />, label: "Heating demand",   value: `${r.heating} kWh/m²·yr`,  color: "#fca5a5" },
                    { icon: <Droplets size={13} color="#4A90E2" />,    label: "Cooling demand",   value: `${r.cooling} kWh/m²·yr`,  color: "#93c5fd" },
                    { icon: <Lightbulb size={13} color="#E8880C" />,   label: "Lighting",         value: `${r.lighting} kWh/m²·yr`, color: "#fcd34d" },
                    { icon: <Cpu size={13} color="#2FB477" />,          label: "Equipment",        value: `${r.equipment} kWh/m²·yr`, color: "#86efac" },
                    { icon: <Droplets size={13} color="#4A90E2" />,     label: "Hot water",
                      value: `${r.dhw || Math.max(0, Math.round((r.energyUse - r.heating - r.cooling - r.lighting - r.equipment) * 10) / 10)} kWh/m²·yr`,
                      color: "#93c5fd" },
                  ].map(m => (
                    <div key={m.label} style={{ borderRadius: 8, padding: "10px 10px", minWidth: 0, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5, minWidth: 0 }}>{m.icon}<span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.label}</span></div>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: m.color, whiteSpace: "nowrap",
                                    overflow: "hidden", textOverflow: "ellipsis" }} title={m.value}>{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {project.baselineBatchId && (
              <BaselineLoadProfile
                batchId={project.baselineBatchId}
                addresses={results.map((r, i) => r.address || `Building ${i + 1}`)}
              />
            )}
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontStyle: "italic", margin: 0 }}>
              * Real EnergyPlus (EPSM) output. Hot water is simulated from a Sveby standard draw profile for the
              building's use category (25 kWh/m²·yr for dwellings — the Göteborg EPC median is 23.6), so it is a
              standard assumption played back through EnergyPlus, not a prediction: it will not vary between two
              dwellings of the same size. Infiltration is modelled too, but EnergyPlus reports it inside heating
              rather than as its own end use. Proceed to Step 4 to test renovation packages against this baseline.
            </p>
          </div>
        )}

      </div>



    </div>
  );
}
