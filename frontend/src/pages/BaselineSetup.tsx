import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore, type RenovationBaselineResult } from "../store/wizard";
import { api } from "../api/client";
import { seCityId } from "../config/countryNav";
import type { BuildingLookup, BuildingRecord } from "../types";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from "recharts";
import { Building2, Zap, Loader2, BarChart2, Thermometer, Droplets, Download, Lightbulb, Cpu } from "lucide-react";
import BaselineLoadProfile from "../components/BaselineLoadProfile";
import PeakDemandPanel from "../components/PeakDemandPanel";
import ModelScopeNotice from "../components/ModelScopeNotice";
import { makeBuildingKeys } from "../utils/retrofitPriority";
import { recordedUForSimulation } from "../utils/renovationRecommendations";
import { excludesHouseholdElectricity, reportedTotalKwhM2 } from "../utils/energyTotals";
import { useT } from "../i18n";

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
  const t = useT();
  const { project, setProject } = useWizardStore();

  const buildings = useMemo<BuildingLookup[]>(() => {
    // The Step 2 table (area, district or addresses) carries the user's
    // selection and edits, so it wins; the raw Step 1 lookups are the fallback.
    if (project.bboxRows.length > 0) return project.bboxRows.map(recordToLookup);
    if (project.lookedUpBuildings.length > 0) return project.lookedUpBuildings;
    if (project.lookedUpBuilding) return [project.lookedUpBuilding];
    return [];
  }, [project.lookedUpBuildings, project.lookedUpBuilding, project.bboxRows]);

  // Any data the user filled in Step 2 already lives in the building rows; this
  // per-building override map stays only as a harmless (usually empty) fallback.
  const supplementary = project.supplementaryData ?? {};

  const [simRunning, setSimRunning] = useState(false);
  const [simProgress, setSimProgress] = useState(0);
  const [simError, setSimError] = useState<string | null>(null);
  // Ref to the results section so we can auto-scroll when simulation completes
  const resultsRef = useRef<HTMLDivElement>(null);

  // Which buildings to run the baseline for. null means: fall back to the
  // Step 2 shortlist or all buildings by default. Keep a dedicated mode so the
  // UI can distinguish “Use Step 2 shortlist” from “Select all” even when both
  // resolve to the same set.
  const [selected, setSelected] = useState<Set<number> | null>(null);
  const [selectionMode, setSelectionMode] = useState<"step2" | "all" | "custom">("step2");
  // Sheds, garages and other outbuildings are usually unheated, so a heating
  // model says nothing useful about them: they are left out of "Select all"
  // and the Step 2 shortlist by default, but can still be ticked by hand.
  const outbuildingIdx = useMemo(() => new Set(buildings.flatMap((b, i) =>
    b.use_cat === "komplement" || (b.use_cat === "ovrigt" && (b.footprint_m2 ?? 0) < 50) ? [i] : [])), [buildings]);
  const allIdx = useMemo(() => new Set(buildings.flatMap((_, i) => outbuildingIdx.has(i) ? [] : [i])), [buildings, outbuildingIdx]);
  const prioritizedIdx = useMemo(() => {
    const idx = project.prioritizedBuildingIndices ?? [];
    const valid = idx.filter((i) => Number.isInteger(i) && i >= 0 && i < buildings.length && !outbuildingIdx.has(i));
    return valid.length ? new Set(valid) : null;
  }, [project.prioritizedBuildingIndices, buildings.length, outbuildingIdx]);
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
  /** Same keys the Step 2 façade panel stored its photos and glazing under. */
  const runKeys = useMemo(() => makeBuildingKeys(runList), [runList]);
  /** The Step 2 table edits of each building in runList (same order), sent with
   *  it so the model is built from the corrected data, not the server's copy. */
  const runEdits = useMemo(() => {
    const fromTable = project.bboxRows.length > 0;
    return buildings.flatMap((_, i) => effectiveSelected.has(i)
      ? [fromTable ? project.bboxRows[i]?.user_edits : undefined] : []);
  }, [buildings, effectiveSelected, project.bboxRows, project.lookedUpBuildings, project.lookedUpBuilding]);

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

  /** Hot water for a saved result. Results written before the DHW field existed
   *  stored 0, but the total is the sum of all five end uses by construction, so
   *  the residual recovers it exactly - and stays 0 for genuinely DHW-free runs.
   *  A function declaration, not a const: the charts below call it during render. */
  function dhwOf(r: RenovationBaselineResult) {
    return r.dhw || Math.max(0, Math.round((r.energyUse - r.heating - r.cooling - r.lighting - r.equipment) * 10) / 10);
  }
  /** Sweden reports building energy without household/business electricity
   *  (utils/energyTotals): no lighting/equipment shown, and results saved before
   *  that rule get it taken out of their total here (new ones store it as 0). */
  const showElec = !excludesHouseholdElectricity(project.country);
  function totalOf(r: RenovationBaselineResult) {
    return showElec ? r.energyUse : Math.round((r.energyUse - r.lighting - r.equipment) * 10) / 10;
  }

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
      "address",
      "total_energy_use_kWh_m2_yr", "heating_demand_kWh_m2_yr", "cooling_demand_kWh_m2_yr",
      "hot_water_demand_kWh_m2_yr", ...(showElec ? ["lighting_demand_kWh_m2_yr", "equipment_demand_kWh_m2_yr"] : []),
    ];
    const lines = [header.join(",")];
    for (const r of results) {
      lines.push([
        `"${(r.address ?? "").replace(/"/g, '""')}"`,
       totalOf(r), r.heating, r.cooling, dhwOf(r), ...(showElec ? [r.lighting, r.equipment] : []),
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
       totalEnergyUse_kWh_m2_yr: totalOf(r),
        heatingDemand_kWh_m2_yr: r.heating,
        coolingDemand_kWh_m2_yr: r.cooling,
        ...(showElec ? { lightingDemand_kWh_m2_yr: r.lighting, equipmentDemand_kWh_m2_yr: r.equipment } : {}),
        hotWaterDemand_kWh_m2_yr: dhwOf(r),
      })),
    };
    saveFile(JSON.stringify(payload, null, 2), "epsm_baseline_results.json", "application/json");
  }

  /** The request for building i of runList. Also its input signature: a
   *  result is only reused while the building is simulated with exactly these
   *  inputs (Step 2 edits, facade glazing, recorded renovations). */
  function specFor(b: BuildingLookup, i: number) {
    // Each building carries the glazing ratios read from its own facade photos in
    // Step 2 (utils/retrofitPriority.makeBuildingKeys gives the same key the
    // facade panel wrote them under). Facades with no photo keep the default ratio.
    const measured = project.facadeWwr?.[runKeys[i]!];
    const byOrientation = Object.fromEntries(
      Object.entries(measured ?? {}).map(([dir, v]) => [dir, v!.wwr]),
    );
    // U-values the user recorded for past renovations (Step 2).
    const recorded = recordedUForSimulation(project.buildingHistory?.[runKeys[i]!]);
    return {
      lat: b.lat, lon: b.lon, address: b.address,
      ...(Object.keys(byOrientation).length ? { wwr_by_orientation: byOrientation } : {}),
      ...(recorded ? { recorded_u: recorded } : {}),
      ...(runEdits[i] ? { edits: runEdits[i] } : {}),
    };
  }
  const coordKey = (x: { lat?: number | null; lon?: number | null }) =>
    `${(x.lat ?? 0).toFixed(6)},${(x.lon ?? 0).toFixed(6)}`;

  /** What a run has to do (2026-11-24, user: adding or removing one building
   *  re-ran all of them). `reuse[i]` = a stored result that is still current for
   *  building i; `toRun` = the buildings that need simulating (new, or inputs
   *  changed); `extra` = stored results for buildings no longer selected. */
  const runPlan = useMemo(() => {
    const specs = runList.map((b, i) => specFor(b, i));
    const sigs = specs.map((s) => JSON.stringify(s));
    const stored = new Map((results ?? []).map((r) => [coordKey(r), r]));
    const reuse = runList.map((b, i) => {
      const r = stored.get(coordKey(b));
      return r && r.inputSig === sigs[i] && r.batchId && r.batchIdx != null ? r : null;
    });
    const toRun = runList.map((_, i) => i).filter((i) => !reuse[i]);
    const selectedKeys = new Set(runList.map(coordKey));
    const extra = (results ?? []).filter((r) => !selectedKeys.has(coordKey(r))).length;
    return { specs, sigs, reuse, toRun, extra };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runList, results, runKeys, runEdits, project.facadeWwr, project.buildingHistory]);

  /** Baseline run. Only the buildings in runPlan.toRun are simulated (all of them
   *  with `force`); results still current are reused, and results for buildings
   *  no longer selected are dropped. The kept + new results are then merged into
   *  ONE batch on the server (no re-simulation) for the load-profile and peak
   *  panels, which read a single batch. Polls batch-status every second. */
  async function runBaseline(opts?: { force?: boolean }) {
    if (runList.length === 0) return;
    const { specs, sigs } = runPlan;
    const reuse = opts?.force ? runList.map(() => null) : runPlan.reuse;
    const toRun = opts?.force ? runList.map((_, i) => i) : runPlan.toRun;
    setSimRunning(true);
    setSimProgress(0);
    setSimError(null);
    const isUK = project.country === "United Kingdom";
    const isBE = project.country === "Belgium";

    try {
      const fresh: Record<number, RenovationBaselineResult> = {};
      let newBatch: string | null = null;
      if (toRun.length > 0) {
        const { batch_id } = await api.simulationBatchSubmit({
          country: isUK ? "gb" : isBE ? "be" : "se",
          // Sweden needs an explicit city_id; UK and Belgium omit it and the
          // server resolves the nearest district from lat/lon.
          ...(isUK || isBE ? {} : { city_id: seCityId(project.city) }),
          buildings: toRun.map((i) => specs[i]!),
          package_id: "baseline",
        });
        newBatch = batch_id;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const status = await api.simulationBatchStatus(batch_id);
          const done = (status.counts.completed ?? 0) + (status.counts.failed ?? 0);
          // Our own rows all flip at the very end of the batch; EPSM's own
          // progress moves during it. Take whichever is further, never go back.
          const rowPct = status.total ? Math.round((done / status.total) * 100) : 0;
          const epsmPct = typeof status.overall_progress === "number"
            ? Math.max(0, Math.min(100, Math.round(status.overall_progress)))
            : 0;
          setSimProgress((prev) => Math.max(prev, rowPct, epsmPct));
          if (status.overall_status === "completed" || status.overall_status === "failed" || done === status.total) {
            status.buildings.forEach((row, j) => {
              const i = toRun[j]!;
              const src = runList[i];
              const r = row.results;
              const ok = row.status === "completed";
              fresh[i] = {
                address: row.address ?? (src ? bKey(src, i) : `Building ${i + 1}`),
                lat: row.lat ?? src?.lat,
                lon: row.lon ?? src?.lon,
                // Only a finished result can be reused or merged later.
                ...(ok ? { batchId: batch_id, batchIdx: j, inputSig: sigs[i] } : {}),
                // Sweden: household/business electricity is simulated but not part
                // of the reported total or shown (utils/energyTotals).
                energyUse: reportedTotalKwhM2(r, project.country) ?? 0,
                heating: r?.heating_kwh_m2_yr ?? 0,
                cooling: r?.cooling_kwh_m2_yr ?? 0,
                lighting: excludesHouseholdElectricity(project.country) ? 0 : (r?.lighting_kwh_m2_yr ?? 0),
                equipment: excludesHouseholdElectricity(project.country) ? 0 : (r?.equipment_kwh_m2_yr ?? 0),
                // Hot water: the Sveby standard draw (or the building's EPC
                // figure) played back - an assumption, not a prediction - but it
                // puts the total on the same end-use basis as an energideklaration.
                dhw: r?.dhw_kwh_m2_yr ?? 0,
                // Infiltration is modelled but booked inside Heating.
                airLeakage: 0,
                eClass: src?.eclass ?? null,
                eClassFromEpc: !!src?.eclass,
                gasKwh: r?.gas_kwh ?? null,
                totalGasKwh: r?.total_gas_kwh ?? null,
                gasKwhPerDwelling: r?.gas_kwh_per_dwelling ?? null,
                dwellings: r?.dwellings ?? null,
                heatedAreaM2: r?.total_floor_area_m2 ?? null,
                heatingSystem: r?.heating_system ?? null,
                // Carried so the caveat stays attached to the number (pools, hospitals, industry).
                modelScope: r?.model_scope ?? src?.model_scope ?? null,
                heightCorrected: r?.height_corrected ?? null,
              };
            });
            break;
          }
          // 1 s: a building takes ~5 s in EPSM, so a 3 s poll added up to 60 % on top.
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      // Selection order; buildings no longer selected simply drop out.
      const merged = runList.map((_, i) => fresh[i] ?? reuse[i]).filter((r): r is RenovationBaselineResult => !!r);
      // One batch for the panels: the new batch when everything was just run,
      // otherwise the kept + new results copied into one (no simulation).
      let panelBatch: string | null = toRun.length === runList.length ? newBatch : null;
      if (!panelBatch) {
        const items = merged.filter((r) => r.batchId && r.batchIdx != null)
          .map((r) => ({ batch_id: r.batchId!, idf_idx: r.batchIdx! }));
        try { panelBatch = items.length ? (await api.simulationBatchMerge(items)).batch_id : newBatch; }
        catch { panelBatch = newBatch ?? project.baselineBatchId; }   // panels may then show part of the set
      }
      setProject({ baselineStatus: "done", renovationBaselineResults: merged, baselineBatchId: panelBatch });
      setSimRunning(false);
      setSimProgress(100);
      if (toRun.length > 0) {
        setTimeout(() => { resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 150);
      }
    } catch (err) {
      setSimError((err as Error).message);
      setSimRunning(false);
    }
  }

  /* Unticking a building only drops its row: when every selected building
     already has a current result, the run is just the server-side merge. Done
     automatically, so removing a building needs no click and no simulation. */
  useEffect(() => {
    if (project.baselineStatus !== "done" || simRunning || runList.length === 0) return;
    if (runPlan.toRun.length > 0 || runPlan.extra === 0) return;
    const h = setTimeout(() => { void runBaseline(); }, 400);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runPlan, project.baselineStatus, simRunning]);


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
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, color: "rgba(255,255,255,0.3)", marginBottom: 6, textTransform: "uppercase" }}>
          {t("Renovation Planning · Step 3")}
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: "0 0 6px" }}>
          {t("Select & Baseline")}
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: 0, lineHeight: 1.6 }}>
          {buildings.length !== 1
            ? t("Simulate the as-built performance of the selected buildings — the baseline every renovation package is measured against.")
            : t("Simulate the as-built performance of the selected building — the baseline every renovation package is measured against.")}
        </p>
      </div>

      {/* ── Buildings to simulate (compact list, no data-gap repetition) ── */}
      {buildings.length === 0 ? (
        <div style={{ borderRadius: 12, padding: "20px 24px", background: "rgba(232,136,12,0.08)", border: "1px solid rgba(232,136,12,0.3)" }}>
          <p style={{ fontSize: 13, color: "#E8880C", margin: 0 }}>
            {t("No buildings loaded yet — go back to Step 2 to select buildings.")}
          </p>
        </div>
      ) : (
        <div style={{ borderRadius: 14, padding: "14px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <Building2 size={14} color="#8B6EAD" />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
              {buildings.length !== 1
                ? t("{n} of {total} buildings selected", { n: effectiveSelected.size, total: buildings.length })
                : t("{n} of {total} building selected", { n: effectiveSelected.size, total: buildings.length })}
            </span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              {shortlistDiffersFromAll && (
              <button onClick={() => applySelection(new Set(prioritizedIdx!), "step2")}
                style={{
                  fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 99, cursor: "pointer",
                  background: selectionMode === "step2" ? "#8B6EAD" : "rgba(139,110,173,0.12)",
                  border: `1px solid ${selectionMode === "step2" ? "#8B6EAD" : "rgba(139,110,173,0.35)"}`,
                  color: selectionMode === "step2" ? "#0b1220" : "#8B6EAD",
                  boxShadow: selectionMode === "step2" ? "0 0 0 1px rgba(139,110,173,0.18)" : "none",
                }}>
                {t("Use Step 2 shortlist")}
              </button>
              )}
              <button onClick={() => applySelection(new Set(allIdx), "all")}
                style={{
                  fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 99, cursor: "pointer",
                  background: selectionMode === "all" ? "#8B6EAD" : "rgba(139,110,173,0.12)",
                  border: `1px solid ${selectionMode === "all" ? "#8B6EAD" : "rgba(139,110,173,0.35)"}`,
                  color: selectionMode === "all" ? "#0b1220" : "#8B6EAD",
                  boxShadow: selectionMode === "all" ? "0 0 0 1px rgba(139,110,173,0.18)" : "none",
                }}>
                {t("Select all")}
              </button>
              <button onClick={() => applySelection(new Set(), "custom")}
                style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 99, cursor: "pointer",
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)" }}>
                {t("Clear")}
              </button>
            </span>
          </div>
          {prioritizedIdx && (
            <p style={{ fontSize: 12, color: carriesFromStep2 ? "#fcd34d" : "rgba(255,255,255,0.45)", margin: "0 0 10px" }}>
              {(project.prioritizedBuildingCount || prioritizedIdx.size) === 1
                ? t("Step 2 flagged top priorities: {n} building. These are the default buildings that will run baseline energy simulation in Step 3.", { n: project.prioritizedBuildingCount || prioritizedIdx.size })
                : t("Step 2 flagged top priorities: {n} buildings. These are the default buildings that will run baseline energy simulation in Step 3.", { n: project.prioritizedBuildingCount || prioritizedIdx.size })}
            </p>
          )}
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: "0 0 10px" }}>
            {t("Click a building to include or exclude it from the baseline run.")}
            {outbuildingIdx.size > 0 && (
              <>{" "}{outbuildingIdx.size === 1
                ? t("{n} outbuilding (sheds, garages — usually unheated) is left out by default; click to include.", { n: outbuildingIdx.size })
                : t("{n} outbuildings (sheds, garages — usually unheated) are left out by default; click to include.", { n: outbuildingIdx.size })}</>
            )}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {buildingStatus.map((bs, idx) => {
              const on = effectiveSelected.has(idx);
              return (
                <button key={bs.key} onClick={() => toggleBuilding(idx)} title={on ? t("Click to exclude") : t("Click to include")}
                  style={{
                    fontSize: 12, padding: "4px 10px", borderRadius: 8, fontWeight: 600, cursor: "pointer",
                    display: "inline-flex", alignItems: "center", gap: 5,
                    background: on ? "#8B6EAD" : "rgba(255,255,255,0.03)",
                    color: on ? "#0b1220" : "rgba(255,255,255,0.4)",
                    border: `1px solid ${on ? "#8B6EAD" : "rgba(255,255,255,0.08)"}`,
                    maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                  <span style={{ fontSize: 11 }}>{on ? "✓" : "＋"}</span>{bs.key}
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
              onClick={() => runBaseline(baselineIsCurrent && runPlan.toRun.length === 0 ? { force: true } : undefined)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "11px 24px", borderRadius: 10, border: 0,
                background: canRunBaseline && !simRunning ? "linear-gradient(135deg,#5a9e1e,#2FB477)" : "rgba(255,255,255,0.06)",
                color: canRunBaseline && !simRunning ? "#0a0d14" : "rgba(255,255,255,0.2)",
                fontSize: 13, fontWeight: 700, cursor: canRunBaseline && !simRunning ? "pointer" : "not-allowed",
                boxShadow: canRunBaseline && !simRunning ? "0 4px 14px rgba(47,180,119,0.3)" : "none",
              }}
            >
              {simRunning ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Zap size={14} />}
              {simRunning ? t("Running…")
                : project.baselineStatus === "done" && runPlan.toRun.length > 0 && runPlan.toRun.length < runList.length
                ? (runPlan.toRun.length !== 1
                  ? t("Run baseline for the {n} new or changed buildings", { n: runPlan.toRun.length })
                  : t("Run baseline for the 1 new or changed building"))
                : baselineIsCurrent && runPlan.toRun.length === 0
                ? t("Re-run all {n} buildings", { n: runList.length })
                : isRerun
                ? (runList.length !== 1
                  ? t("Re-run baseline energy simulation (EPSM) for {n} buildings", { n: runList.length })
                  : t("Re-run baseline energy simulation (EPSM) for {n} building", { n: runList.length }))
                : (runList.length !== 1
                  ? t("Run baseline energy simulation (EPSM) for {n} buildings", { n: runList.length })
                  : t("Run baseline energy simulation (EPSM) for {n} building", { n: runList.length }))}
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
          <h3 style={{ fontSize: 14, fontWeight: 600, color: canRunBaseline ? "#fff" : "rgba(255,255,255,0.35)", margin: 0 }}>
            {t("Baseline Energy Simulation")}
          </h3>
          {baselineIsCurrent && !simRunning && (
            <span style={{
              marginLeft: "auto", fontSize: 12, fontWeight: 600, color: "#2FB477",
              background: "rgba(47,180,119,0.15)", padding: "2px 10px", borderRadius: 20,
            }}>
              ✓ {t("Baseline complete")}
            </span>
          )}
        </div>

        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: "0 0 16px", lineHeight: 1.55 }}>
          {simRunning
            ? t("Running EPSM simulation — please wait…")
            : canRunBaseline
              ? (runList.length !== 1
                ? t("Send {n} buildings to EPSM to compute the as-built baseline. Missing envelope details fall back to TABULA archetype defaults, so the run always completes.", { n: runList.length })
                : t("Send {n} building to EPSM to compute the as-built baseline. Missing envelope details fall back to TABULA archetype defaults, so the run always completes.", { n: runList.length }))
              : t("Select at least one building above to run the baseline.")}
        </p>

        {/* Progress bar while running - reflects real per-building EPSM
            completion counts from the batch, not a simulated timer */}
        {simRunning && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{project.country === "United Kingdom" || project.country === "Belgium"
                ? t("Running EnergyPlus for each building…")
                : t("Running the EPSM RC model for each building…")}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#2FB477" }}>{simProgress}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: "rgba(255,255,255,0.08)" }}>
              <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#5a9e1e,#2FB477)", width: `${simProgress}%`, transition: "width 0.25s" }} />
            </div>
          </div>
        )}

        {simError && !simRunning && (
          <div style={{ borderRadius: 8, padding: "10px 14px", background: "rgba(226,72,59,0.1)", border: "1px solid rgba(226,72,59,0.25)", marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: "#fca5a5" }}>⚠ {t("Baseline simulation failed: {error}", { error: simError })}</span>
          </div>
        )}

        {/* Real EPSM results — only for the selection they actually describe. */}
        {baselineIsCurrent && !simRunning && (
          <div ref={resultsRef} style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18, scrollMarginTop: 80 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.3)", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 }}>
              {t("EPSM Baseline Results")}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8 }}>
              <button
                onClick={downloadResults}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: "1px solid rgba(139,110,173,0.35)", background: "rgba(139,110,173,0.08)", color: "#8B6EAD",
                }}
              >
                <Download size={12} /> {t("Download JSON")}
              </button>
              <button
                onClick={downloadResultsCsv}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: "1px solid rgba(139,110,173,0.35)", background: "rgba(139,110,173,0.08)", color: "#8B6EAD",
                }}
              >
                <Download size={12} /> {t("Download CSV")}
              </button>
            </div>
            {/* Warnings about whether these numbers can be trusted. (The "Annual
                end-use comparison" bar chart that held them was removed 2026-11-24 at
                the user's request: the load-profile panel below shows the same split.) */}
            {(() => {
              const fixed = results.filter((r) => r.heightCorrected);
              if (fixed.length === 0) return null;
              return (
                <div style={{ fontSize: 12, lineHeight: 1.55, color: "#E8880C", background: "rgba(232,136,12,0.08)",
                  border: "1px solid rgba(232,136,12,0.35)", borderRadius: 10, padding: "9px 12px" }}>
                  <b>{t("Height corrected:")}</b>{" "}
                  {fixed.length === 1
                    ? t("the building outline was too low for the number of floors in the energy declaration, so this building was simulated at floors × 3.2 m instead —")
                    : t("the building outline was too low for the number of floors in the energy declaration, so {n} buildings were simulated at floors × 3.2 m instead —", { n: fixed.length })}{" "}
                  {fixed.map((r) => t("{address}: {floors} floors, {from} m → {to} m", { address: r.address, floors: r.heightCorrected!.floors, from: r.heightCorrected!.from_m, to: r.heightCorrected!.to_m })).join(" · ")}.{" "}
                  {t("The outline may belong to a lower wing or be linked to the wrong declaration, so treat these results with care.")}
                </div>
              );
            })()}
            {results.some((r) => r.modelScope?.level === "out_of_scope") && (
              <ModelScopeNotice
                scope={{
                  level: "out_of_scope",
                  reason: t(
                    "{n} of {total} buildings are types the model cannot represent (swimming pools, hospitals, industrial process buildings): {names}.",
                    { n: results.filter((r) => r.modelScope?.level === "out_of_scope").length, total: results.length,
                      names: results.filter((r) => r.modelScope?.level === "out_of_scope").map((r) => r.address).join(", ") },
                  ),
                }}
              />
            )}
            {/* One compact table, a row per building (was a card per building with
                a tile per end use - 2026-11-24, user: "can be more compact").
                All values are EPSM end-use output per m² heated area per year.
                Hot water: results saved before the hot-water field existed stored
                dhw: 0 even when the run included it; the total is the sum of all
                end uses by construction, so the residual recovers it exactly. */}
            {(() => {
              const noHouseholdEl = !showElec;   // Sweden: building energy without household electricity
              const r1 = (v: number) => Math.round(v * 10) / 10;
              const cols: { key: string; label: string; icon: React.ReactNode; color: string; get: (r: typeof results[number]) => number }[] = [
                { key: "total", label: "Total energy use", icon: <BarChart2 size={12} color="#E8880C" />, color: "#E8880C",
                  get: (r) => (noHouseholdEl ? r1(r.energyUse - r.lighting - r.equipment) : r.energyUse) },
                { key: "heat", label: "Heating", icon: <Thermometer size={12} color="#E2483B" />, color: "#fca5a5", get: (r) => r.heating },
                { key: "cool", label: "Cooling", icon: <Droplets size={12} color="#4A90E2" />, color: "#93c5fd", get: (r) => r.cooling },
                ...(noHouseholdEl ? [] : [
                  { key: "light", label: "Lighting", icon: <Lightbulb size={12} color="#E8880C" />, color: "#fcd34d", get: (r: typeof results[number]) => r.lighting },
                  { key: "equip", label: "Equipment", icon: <Cpu size={12} color="#2FB477" />, color: "#86efac", get: (r: typeof results[number]) => r.equipment },
                ]),
                { key: "dhw", label: "Hot water", icon: <Droplets size={12} color="#4A90E2" />, color: "#93c5fd",
                  get: (r) => r.dhw || Math.max(0, r1(r.energyUse - r.heating - r.cooling - r.lighting - r.equipment)) },
              ];
              const th: React.CSSProperties = { padding: "7px 10px", fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,0.5)", textAlign: "right", whiteSpace: "nowrap", borderBottom: "1px solid rgba(255,255,255,0.10)" };
              const td: React.CSSProperties = { padding: "6px 10px", fontSize: 13, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", borderBottom: "1px solid rgba(255,255,255,0.05)" };
              return (
                <div style={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ ...th, textAlign: "left" }}>{t("Building")}</th>
                        {cols.map((c) => (
                          <th key={c.key} style={th}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{c.icon}{t(c.label)}</span>
                          </th>
                        ))}
                      </tr>
                      <tr>
                        <th style={{ ...th, textAlign: "left", fontWeight: 400, paddingTop: 0, color: "rgba(255,255,255,0.35)" }} />
                        <th colSpan={cols.length} style={{ ...th, fontWeight: 400, paddingTop: 0, color: "rgba(255,255,255,0.35)" }}>kWh/m²·yr</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => (
                        <tr key={r.address}>
                          {/* (The EPC energy-class badge was removed: the class is the
                              declaration's, not this simulation's, and read as a result.) */}
                          <td style={{ ...td, textAlign: "left", color: "#fff", fontWeight: 500, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis" }} title={r.address}>
                            {r.address}
                            {/* UK gas-boiler runs: fuel actually burnt, which is what a gas meter reads. */}
                            {r.totalGasKwh != null && (
                              <div style={{ fontSize: 11.5, fontWeight: 400, color: "rgba(255,255,255,0.55)", whiteSpace: "normal" }}>
                                {t("Gas use:")} {t("{n} kWh/yr for the building", { n: Math.round(r.totalGasKwh).toLocaleString("en-GB") })}
                                {r.dwellings && r.dwellings > 0 ? <> · {t("{n} kWh/yr per home", { n: Math.round(r.totalGasKwh / r.dwellings).toLocaleString("en-GB") })}</> : null}
                                {r.heatedAreaM2 != null && <> · {t("simulated heated area {n} m²", { n: Math.round(r.heatedAreaM2).toLocaleString("en-GB") })}</>}
                              </div>
                            )}
                          </td>
                          {cols.map((c) => (
                            <td key={c.key} style={{ ...td, color: c.key === "total" ? c.color : "rgba(255,255,255,0.85)", fontWeight: c.key === "total" ? 600 : 400 }}>
                              {c.get(r)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
            {project.baselineBatchId && (
              <BaselineLoadProfile
                batchId={project.baselineBatchId}
                addresses={results.map((r, i) => r.address || t("Building {n}", { n: i + 1 }))}
              />
            )}
            {project.baselineBatchId && (
              <PeakDemandPanel scenarios={[{ label: t("Baseline"), batchId: project.baselineBatchId }]} />
            )}
            {project.country === "Belgium" ? (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontStyle: "italic", margin: 0 }}>
              {t("* Real EnergyPlus (EPSM) output with {weather} weather. Belgium has no open per-building EPCs, so the envelope is the TABULA Belgium archetype for the building's type and construction period, and the period is sampled from Statbel's municipal building stock unless OpenStreetMap records a year. Shared walls with neighbours are modelled as adiabatic. Heating is ideal loads (heat delivered, not fuel) and the model is not yet calibrated against Belgian EPB certificate statistics, so treat absolute values as indicative and compare packages relative to this baseline in Step 4.", { weather: project.city === "Liège" ? "Liège-Bierset" : "Uccle" })}
            </p>
            ) : project.country === "United Kingdom" ? (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontStyle: "italic", margin: 0 }}>
              {t("* Real EnergyPlus (EPSM) output for UK homes: a gas boiler with radiators (efficiency from the EPC heating rating), SAP intermittent heating calibrated to DESNZ metered postcode gas, hot water from SAP 2012 Appendix J, simulated at the heated area (the homes' EPC floor areas) rather than the gross OSM footprint. Per-m² figures are per heated m². Proceed to Step 4 to test refurbishment tiers.")}
            </p>
            ) : (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontStyle: "italic", margin: 0 }}>
              {t("* EPSM RC model output (ISO 13790 5R1C, hourly, a typical weather year), calibrated against our EnergyPlus model (median 1.01×). Non-flats built 2006 or later use EPSM's archetype constructions, air change and window share. Homes use Sveby 2.0 (2024) standard use. Hot water is what the building's own energy declaration reports where it gives a figure, otherwise Sveby's 21 kWh/m²·yr, added as given. Household and business electricity (appliances and lighting; 21 kWh/m²·yr in homes, of which 70% warms the building) is simulated because its heat lowers the heating need, but — as in Swedish energy declarations — it is not part of the total and not shown. Office, shop and school lighting is dimmed by daylight near the windows. Infiltration is modelled too and counted inside heating rather than as its own end use. Proceed to Step 4 to test renovation packages against this baseline.")}
            </p>
            )}
          </div>
        )}

      </div>



    </div>
  );
}
