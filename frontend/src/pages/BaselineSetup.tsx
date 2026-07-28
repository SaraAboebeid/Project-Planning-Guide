import { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore, type RenovationBaselineResult } from "../store/wizard";
import { api } from "../api/client";
import type { BuildingLookup, BuildingRecord } from "../types";
import { Building2, FileJson, Upload, Zap, X, Loader2, BarChart2, Thermometer, Droplets, Download } from "lucide-react";

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

  const supplementary = project.supplementaryData ?? {};

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [simRunning, setSimRunning] = useState(false);
  const [simProgress, setSimProgress] = useState(0);
  const [simError, setSimError] = useState<string | null>(null);

  // Which buildings to run the baseline for. null = all (the default); a Set
  // once the user starts (de)selecting. Lets you run all, or just a subset.
  const [selected, setSelected] = useState<Set<number> | null>(null);
  const allIdx = useMemo(() => new Set(buildings.map((_, i) => i)), [buildings]);
  const effectiveSelected = selected ?? allIdx;
  const runList = useMemo(
    () => buildings.filter((_, i) => effectiveSelected.has(i)),
    [buildings, effectiveSelected],
  );
  function toggleBuilding(i: number) {
    setSelected((prev) => {
      const base = prev ?? new Set(allIdx);
      const next = new Set(base);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  const results = project.renovationBaselineResults;

  const eClassColor: Record<string, string> = { A: "#22c55e", B: "#86efac", C: "#96D74C", D: "#F59E0B", E: "#f97316", F: "#EF4444", G: "#dc2626" };

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
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "epsm_baseline_results.json";
    a.click();
    URL.revokeObjectURL(url);
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
        setSimProgress(Math.round((done / status.total) * 100));

        if (status.overall_status === "completed" || status.overall_status === "failed" || done === status.total) {
          const mapped: RenovationBaselineResult[] = status.buildings.map((row, i) => {
            const src = runList[i];
            const r = row.results;
            return {
              address: row.address ?? (src ? bKey(src, i) : `Building ${i + 1}`),
              energyUse: r?.total_kwh_m2_yr ?? 0,
              heating: r?.heating_kwh_m2_yr ?? 0,
              cooling: r?.cooling_kwh_m2_yr ?? 0,
              // The shoebox IDF model doesn't simulate domestic hot water or
              // infiltration separately from the 4 end-uses EPSM reports
              // (Heating/Cooling/Lighting/Equipment) - real 0s, not filler.
              dhw: 0,
              airLeakage: 0,
              eClass: src?.eclass ?? null,
              eClassFromEpc: !!src?.eclass,
            };
          });
          setProject({ baselineStatus: "done", renovationBaselineResults: mapped });
          setSimRunning(false);
          setSimProgress(100);
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

  /* ── JSON upload handler ── */
  function handleFile(file: File) {
    setUploadError(null);
    setUploadSuccess(false);
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const raw = JSON.parse(e.target!.result as string);
        let entries: Record<string, unknown>[] = [];
        if (Array.isArray(raw)) entries = raw;
        else if (raw.buildings && Array.isArray(raw.buildings)) entries = raw.buildings;
        else entries = [raw];
        if (entries.length === 0) throw new Error("No entries found in file.");

        const next: Record<string, Record<string, unknown>> = { ...supplementary };

        if (entries.length === 1 && buildings.length === 1) {
          // single building — map by position
          const k = bKey(buildings[0], 0);
          next[k] = { ...(next[k] ?? {}), ...entries[0] };
        } else {
          for (const entry of entries) {
            const addr = String(entry.address ?? "");
            const matched = buildings.find((b, i) => {
              const bAddr = (b.address ?? `Building ${i + 1}`).toLowerCase();
              return bAddr.includes(addr.toLowerCase()) || addr.toLowerCase().includes(bAddr);
            });
            if (matched) {
              const k = bKey(matched, buildings.indexOf(matched));
              next[k] = { ...(next[k] ?? {}), ...entry };
            } else if (addr) {
              next[addr] = { ...(next[addr] ?? {}), ...entry };
            }
          }
        }
        setProject({ supplementaryData: next });
        setUploadSuccess(true);
      } catch (err) {
        setUploadError(`Parse error: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
  }

  /* ── Example JSON snippet ── */
  const exampleJson = useMemo(() => {
    if (buildings.length === 0) {
      return JSON.stringify({ height: 12.5, floors: 4, area_atemp: 850, footprint_m2: 215, use_cat: "Residential", year: 1968, tabula_period: "1961-1980", tabula_u_wall: 0.5, tabula_u_win: 2.8 }, null, 2);
    }
    if (buildings.length === 1) {
      return JSON.stringify({ height: 12.5, floors: 4, area_atemp: 850, footprint_m2: 215, use_cat: "Residential", year: 1968, tabula_period: "1961-1980", tabula_u_wall: 0.5, tabula_u_win: 2.8 }, null, 2);
    }
    return JSON.stringify({
      buildings: buildings.slice(0, 3).map((b, i) => ({
        address: b.address ?? `Building ${i + 1}`,
        height: null,
        floors: null,
        area_atemp: null,
        use_cat: null,
        year: null,
        tabula_u_wall: null,
        tabula_u_win: null,
      })),
    }, null, 2);
  }, [buildings]);

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
          Run a real EnergyPlus (EPSM) baseline for the building{buildings.length !== 1 ? "s" : ""} selected in Step 2 —
          the as-built energy performance you'll compare renovation packages against in Step 4.
        </p>
      </div>

      {/* ── Buildings to simulate (compact list, no data-gap repetition) ── */}
      {buildings.length === 0 ? (
        <div style={{ borderRadius: 12, padding: "20px 24px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
          <p style={{ fontSize: 13, color: "#F59E0B", margin: 0 }}>
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
              <button onClick={() => setSelected(null)}
                style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, cursor: "pointer",
                  background: "rgba(78,205,196,0.12)", border: "1px solid rgba(78,205,196,0.35)", color: "#4ECDC4" }}>
                Select all
              </button>
              <button onClick={() => setSelected(new Set())}
                style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, cursor: "pointer",
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)" }}>
                Clear
              </button>
            </span>
          </div>
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
                    background: on ? "rgba(78,205,196,0.14)" : "rgba(255,255,255,0.03)",
                    color: on ? "#4ECDC4" : "rgba(255,255,255,0.4)",
                    border: `1px solid ${on ? "#4ECDC4" : "rgba(255,255,255,0.08)"}`,
                    maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                  <span style={{ fontSize: 10 }}>{on ? "✓" : "＋"}</span>{bs.key}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Optional: supplementary data upload (collapsed - data coverage
             itself was already reviewed in Step 2) ── */}
      <details style={{ borderRadius: 14, padding: "14px 18px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <summary style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none", listStyle: "none" }}>
          <FileJson size={14} color="#4ECDC4" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>Optional: upload supplementary data</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: "auto" }}>fill any gaps as JSON ▾</span>
        </summary>
        <div style={{ marginTop: 14 }}>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: "0 0 14px", lineHeight: 1.55 }}>
          Provide any missing field values as a <strong style={{ color: "rgba(255,255,255,0.6)" }}>.json</strong> file.
          Fields are matched to buildings by <code style={{ fontSize: 11 }}>address</code> (or by position for a single building).
          {Object.keys(supplementary).length > 0 && (
            <button
              onClick={() => { setProject({ supplementaryData: {} }); setUploadSuccess(false); }}
              style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.4)", background: "transparent", border: 0, cursor: "pointer" }}
            >
              <X size={11} /> Clear uploads
            </button>
          )}
        </p>

        {/* Drop zone */}
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          style={{
            border: "2px dashed rgba(78,205,196,0.3)", borderRadius: 12,
            padding: "24px 20px", textAlign: "center", cursor: "pointer",
            background: "rgba(78,205,196,0.04)", marginBottom: 12,
          }}
        >
          <Upload size={20} color="rgba(78,205,196,0.55)" style={{ margin: "0 auto 8px", display: "block" }} />
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: "0 0 3px" }}>Drop a JSON file here, or click to browse</p>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", margin: 0 }}>.json only</p>
          <input
            ref={fileRef} type="file" accept=".json,application/json"
            style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
        </div>

        {uploadError && (
          <div style={{ borderRadius: 8, padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: "#fca5a5" }}>⚠ {uploadError}</span>
          </div>
        )}
        {uploadSuccess && (
          <div style={{ borderRadius: 8, padding: "10px 14px", background: "rgba(150,215,76,0.08)", border: "1px solid rgba(150,215,76,0.22)", marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: "#96D74C" }}>✓ Data merged successfully.</span>
          </div>
        )}

        {/* Format hint */}
        <details>
          <summary style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", cursor: "pointer", userSelect: "none" }}>
            Show expected JSON format
          </summary>
          <pre style={{
            marginTop: 10, padding: "12px 14px", borderRadius: 10,
            fontSize: 10.5, lineHeight: 1.65,
            background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.07)",
            color: "rgba(255,255,255,0.5)", overflowX: "auto", margin: "10px 0 0",
          }}>
            {exampleJson}
          </pre>
          {buildings.length > 1 && (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>
              For multiple buildings, wrap in <code style={{ fontSize: 10 }}>{`{"buildings": [...]}`}</code> and include an <code style={{ fontSize: 10 }}>address</code> field in each entry to match buildings.
              For a single building, just supply the fields at the top level.
            </p>
          )}
        </details>
        </div>
      </details>

      {/* ── Baseline simulation ── */}
      <div style={{
        borderRadius: 14, padding: "20px 22px",
        background: canRunBaseline ? "rgba(150,215,76,0.05)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${canRunBaseline ? "rgba(150,215,76,0.25)" : "rgba(255,255,255,0.07)"}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          {simRunning
            ? <Loader2 size={15} color="#96D74C" style={{ animation: "spin 1s linear infinite" }} />
            : <Zap size={15} color={canRunBaseline ? "#96D74C" : "rgba(255,255,255,0.2)"} />}
          <h3 style={{ fontSize: 14, fontWeight: 700, color: canRunBaseline ? "#fff" : "rgba(255,255,255,0.35)", margin: 0 }}>
            Baseline Energy Simulation
          </h3>
          {project.baselineStatus === "done" && !simRunning && (
            <span style={{
              marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#96D74C",
              background: "rgba(150,215,76,0.15)", padding: "2px 10px", borderRadius: 20,
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
              <span style={{ fontSize: 11, fontWeight: 700, color: "#96D74C" }}>{simProgress}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: "rgba(255,255,255,0.08)" }}>
              <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#5a9e1e,#96D74C)", width: `${simProgress}%`, transition: "width 0.25s" }} />
            </div>
          </div>
        )}

        {simError && !simRunning && (
          <div style={{ borderRadius: 8, padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: "#fca5a5" }}>⚠ Baseline simulation failed: {simError}</span>
          </div>
        )}

        {/* Real EPSM results */}
        {project.baselineStatus === "done" && !simRunning && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 }}>
              EPSM Baseline Results
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
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
                      <span style={{ fontSize: 9, fontWeight: 700, color: "#60a5fa", background: "rgba(96,165,250,0.12)", padding: "1px 6px", borderRadius: 5, border: "1px solid rgba(96,165,250,0.25)" }}>from EPC</span>
                    )}
                    <span style={{
                      fontSize: 13, fontWeight: 900, padding: "2px 12px", borderRadius: 8,
                      background: `${eClassColor[r.eClass ?? "D"] ?? "#F59E0B"}22`,
                      color: eClassColor[r.eClass ?? "D"] ?? "#F59E0B",
                      border: `1px solid ${eClassColor[r.eClass ?? "D"] ?? "#F59E0B"}55`,
                    }}>Energy class {r.eClass ?? "—"}</span>
                  </div>
                </div>
                {/* Metric grid - Total/Heating/Cooling are real EPSM output; the
                    shoebox model doesn't simulate DHW or infiltration separately */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {[
                    { icon: <BarChart2 size={13} color="#F59E0B" />, label: "Total energy use", value: `${r.energyUse} kWh/m²·yr`, color: "#F59E0B" },
                    { icon: <Thermometer size={13} color="#ef4444" />, label: "Heating demand",   value: `${r.heating} kWh/m²·yr`,  color: "#fca5a5" },
                    { icon: <Droplets size={13} color="#60a5fa" />,    label: "Cooling demand",   value: `${r.cooling} kWh/m²·yr`,  color: "#93c5fd" },
                  ].map(m => (
                    <div key={m.label} style={{ borderRadius: 8, padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>{m.icon}<span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8 }}>{m.label}</span></div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: m.color }}>{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontStyle: "italic", margin: 0 }}>
              * Real EnergyPlus (EPSM) output. Domestic hot water and infiltration aren't modelled by the current
              shoebox geometry, so they're omitted rather than shown as a guess. Proceed to Step 4 to test renovation
              packages against this baseline.
            </p>
          </div>
        )}

        <button
          disabled={!canRunBaseline || simRunning}
          onClick={runBaseline}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "11px 24px", borderRadius: 10, border: 0,
            background: canRunBaseline && !simRunning ? "linear-gradient(135deg,#5a9e1e,#96D74C)" : "rgba(255,255,255,0.06)",
            color: canRunBaseline && !simRunning ? "#0a0d14" : "rgba(255,255,255,0.2)",
            fontSize: 13, fontWeight: 800, cursor: canRunBaseline && !simRunning ? "pointer" : "not-allowed",
            boxShadow: canRunBaseline && !simRunning ? "0 4px 14px rgba(150,215,76,0.3)" : "none",
          }}
        >
          {simRunning ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Zap size={14} />}
          {simRunning ? "Running…" : `${project.baselineStatus === "done" ? "Re-run" : "Run"} baseline energy simulation (EPSM) for ${runList.length} building${runList.length !== 1 ? "s" : ""}`}
        </button>
      </div>



    </div>
  );
}
