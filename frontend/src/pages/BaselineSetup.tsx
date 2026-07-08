import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import type { BuildingLookup, BuildingRecord } from "../types";
import { Building2, FileJson, Upload, Zap, X, Loader2, BarChart2, Thermometer, Droplets, Wind, Download } from "lucide-react";

/** Normalise a bbox BuildingRecord into the same shape as BuildingLookup */
function recordToLookup(r: BuildingRecord, idx: number): BuildingLookup {
  return {
    address:       r.address || null,
    height:        r.height_m,
    floors:        r.floors,
    area_atemp:    null,
    footprint_m2:  r.footprint_m2,
    use_cat:       r.building_use,
    year:          r.year_built,
    energy:        r.energy_kwh_m2,
    eclass:        r.epc_class,
    tabula_period: r.tabula_period,
    tabula_u_wall: r.u_wall,
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

  /* ── Dummy EPSM baseline results (seeded from building data) ── */
  const dummyResults = useMemo(() => {
    return buildings.length === 0
      ? [{ address: "Sample Building", energyUse: 142, heating: 88, cooling: 12, dhw: 24, airLeakage: 1.8, eClass: "D" as string | null, eClassFromEpc: false }]
      : buildings.map((b, i) => {
          const seed = (b.year ?? 1970) + i;
          const eu = b.energy ?? Math.round(90 + (seed % 80) + (b.tabula_u_wall ?? 0.5) * 60);
          const ht = Math.round(eu * 0.60);
          const cl = Math.round(eu * 0.08);
          const dh = Math.round(eu * 0.17);
          const al = parseFloat((0.8 + (seed % 20) / 10).toFixed(1));
          // Prefer the EPC energy class; only fall back to computed if unavailable
          const eClassFromEpc = !!b.eclass;
          const eClass = b.eclass ?? (eu > 200 ? "F" : eu > 160 ? "E" : eu > 130 ? "D" : eu > 100 ? "C" : "B");
          return { address: bKey(b, i), energyUse: eu, heating: ht, cooling: cl, dhw: dh, airLeakage: al, eClass, eClassFromEpc };
        });
  }, [buildings]);

  const eClassColor: Record<string, string> = { A: "#22c55e", B: "#86efac", C: "#96D74C", D: "#F59E0B", E: "#f97316", F: "#EF4444", G: "#dc2626" };

  function downloadResults() {
    const payload = {
      generated: new Date().toISOString(),
      simulation: "EPSM Baseline",
      buildings: dummyResults.map(r => ({
        address: r.address,
        energyClass: r.eClass,
        energyClassSource: r.eClassFromEpc ? "EPC" : "EPSM computed",
        totalEnergyUse_kWh_m2_yr: r.energyUse,
        heatingDemand_kWh_m2_yr: r.heating,
        coolingDemand_kWh_m2_yr: r.cooling,
        dhwDemand_kWh_m2_yr: r.dhw,
        airLeakage_ach: r.airLeakage,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "epsm_baseline_results.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function runBaseline() {
    setSimRunning(true);
    setSimProgress(0);
    let p = 0;
    const iv = setInterval(() => {
      p += Math.round(8 + Math.random() * 14);
      if (p >= 100) {
        clearInterval(iv);
        setSimProgress(100);
        setSimRunning(false);
        setProject({ baselineStatus: "done", renovationBaselineResults: dummyResults.map(r => ({
          address: r.address,
          energyUse: r.energyUse,
          heating: r.heating,
          cooling: r.cooling,
          dhw: r.dhw,
          airLeakage: r.airLeakage,
          eClass: r.eClass,
          eClassFromEpc: r.eClassFromEpc,
        })) });
      } else {
        setSimProgress(p);
      }
    }, 280);
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

  const allComplete = uploadSuccess || buildingStatus.every(s => s.complete);
  const totalMissing = buildingStatus.reduce((acc, s) => acc + s.missing.length, 0);

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
          Data Completion & Baseline
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: 0, lineHeight: 1.6 }}>
          Review missing building data from Step 2, upload any gaps as JSON,
          then run a baseline energy simulation in EPSM before testing renovation packages.
        </p>
      </div>

      {/* ── Summary strip ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          { label: "Buildings",           value: buildings.length || "—",         color: "#4ECDC4" },
          { label: "Missing fields",       value: totalMissing,                    color: totalMissing > 0 ? "#F59E0B" : "#96D74C" },
          { label: "Ready for baseline",   value: allComplete ? "Yes ✓" : "Not yet", color: allComplete ? "#96D74C" : "#EF4444" },
        ].map(s => (
          <div key={s.label} style={{ borderRadius: 12, padding: "14px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 700 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Data gap cards ── */}
      {buildings.length === 0 ? (
        <div style={{ borderRadius: 12, padding: "20px 24px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
          <p style={{ fontSize: 13, color: "#F59E0B", margin: 0 }}>
            No buildings loaded yet — go back to Step 2 to look up buildings.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 1.2, textTransform: "uppercase" }}>
            Data coverage per building
          </div>
          {buildingStatus.map(bs => (
            <div key={bs.key} style={{
              borderRadius: 14, padding: "16px 18px",
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${bs.complete ? "rgba(150,215,76,0.22)" : "rgba(245,158,11,0.22)"}`,
            }}>
              {/* Building header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <Building2 size={14} color={bs.complete ? "#96D74C" : "#F59E0B"} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {bs.key}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: bs.complete ? "#96D74C" : "#F59E0B", flexShrink: 0 }}>
                  {bs.covered}/{REQUIRED_FIELDS.length} present
                </span>
                <div style={{ width: 80, height: 4, borderRadius: 4, background: "rgba(255,255,255,0.1)", flexShrink: 0 }}>
                  <div style={{
                    height: "100%", borderRadius: 4,
                    background: bs.complete ? "#96D74C" : "#F59E0B",
                    width: `${(bs.covered / REQUIRED_FIELDS.length) * 100}%`,
                    transition: "width .3s",
                  }} />
                </div>
              </div>

              {/* Field chips */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {REQUIRED_FIELDS.map(f => {
                  const val = mergedVal(bs.b, f.key, bs.sup);
                  const present = val !== null && val !== undefined && val !== "";
                  const fromUpload = bs.sup[f.key] !== undefined && bs.sup[f.key] !== null;
                  return (
                    <span key={f.key} style={{
                      fontSize: 10, padding: "3px 9px", borderRadius: 7, fontWeight: 600,
                      background: present
                        ? fromUpload ? "rgba(96,165,250,0.15)" : "rgba(150,215,76,0.1)"
                        : f.priority === "high" ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
                      color: present
                        ? fromUpload ? "#93c5fd" : "#86efac"
                        : f.priority === "high" ? "#fca5a5" : "#fcd34d",
                      border: `1px solid ${present
                        ? fromUpload ? "rgba(96,165,250,0.3)" : "rgba(150,215,76,0.2)"
                        : f.priority === "high" ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.2)"}`,
                    }}>
                      {present ? "✓" : "✗"} {f.label}
                      {present && f.unit ? `: ${val}` : ""}
                      {fromUpload ? " ↑" : ""}
                    </span>
                  );
                })}
              </div>

              {/* High-priority missing list */}
              {bs.missing.filter(f => f.priority === "high").length > 0 && (
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", margin: "10px 0 0" }}>
                  <span style={{ color: "#fca5a5", fontWeight: 600 }}>Critical missing: </span>
                  {bs.missing.filter(f => f.priority === "high").map(f => f.label).join(", ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Upload section ── */}
      <div style={{ borderRadius: 14, padding: "20px 22px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <FileJson size={15} color="#4ECDC4" />
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: 0 }}>Upload Supplementary Data</h3>
          {Object.keys(supplementary).length > 0 && (
            <button
              onClick={() => { setProject({ supplementaryData: {} }); setUploadSuccess(false); }}
              style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.3)", background: "transparent", border: 0, cursor: "pointer" }}
            >
              <X size={11} /> Clear uploads
            </button>
          )}
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: "0 0 14px", lineHeight: 1.55 }}>
          Provide missing field values as a <strong style={{ color: "rgba(255,255,255,0.6)" }}>.json</strong> file.
          Fields are matched to buildings by <code style={{ fontSize: 11 }}>address</code> (or by position for a single building).
          Uploaded values appear in <span style={{ color: "#93c5fd" }}>blue ↑</span> above.
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

      {/* ── Baseline simulation ── */}
      <div style={{
        borderRadius: 14, padding: "20px 22px",
        background: allComplete ? "rgba(150,215,76,0.05)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${allComplete ? "rgba(150,215,76,0.25)" : "rgba(255,255,255,0.07)"}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          {simRunning
            ? <Loader2 size={15} color="#96D74C" style={{ animation: "spin 1s linear infinite" }} />
            : <Zap size={15} color={allComplete ? "#96D74C" : "rgba(255,255,255,0.2)"} />}
          <h3 style={{ fontSize: 14, fontWeight: 700, color: allComplete ? "#fff" : "rgba(255,255,255,0.35)", margin: 0 }}>
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
            : allComplete
              ? `Send ${buildings.length || 1} building${(buildings.length || 1) !== 1 ? "s" : ""} to EPSM to compute the as-built baseline before testing renovation packages.`
              : "Complete all critical missing fields above before running the baseline simulation."}
        </p>

        {/* Progress bar while running */}
        {simRunning && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Simulating buildings…</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#96D74C" }}>{simProgress}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: "rgba(255,255,255,0.08)" }}>
              <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#5a9e1e,#96D74C)", width: `${simProgress}%`, transition: "width 0.25s" }} />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {["Parsing geometry", "Applying U-values", "Computing heating loads", "Running annual sim", "Aggregating results"].map((s, i) => (
                <span key={s} style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 6, fontWeight: 600,
                  background: simProgress > i * 20 ? "rgba(150,215,76,0.12)" : "rgba(255,255,255,0.04)",
                  color: simProgress > i * 20 ? "#96D74C" : "rgba(255,255,255,0.25)",
                  border: `1px solid ${simProgress > i * 20 ? "rgba(150,215,76,0.25)" : "rgba(255,255,255,0.07)"}`,
                }}>{simProgress > i * 20 ? "✓" : "○"} {s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Dummy results */}
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
            {dummyResults.map(r => (
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
                {/* Metric grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  {[
                    { icon: <BarChart2 size={13} color="#F59E0B" />, label: "Total energy use", value: `${r.energyUse} kWh/m²·yr`, color: "#F59E0B" },
                    { icon: <Thermometer size={13} color="#ef4444" />, label: "Heating demand",   value: `${r.heating} kWh/m²·yr`,  color: "#fca5a5" },
                    { icon: <Droplets size={13} color="#60a5fa" />,    label: "DHW demand",       value: `${r.dhw} kWh/m²·yr`,     color: "#93c5fd" },
                    { icon: <Wind size={13} color="#a78bfa" />,        label: "Air leakage",      value: `${r.airLeakage} ach`,     color: "#c4b5fd" },
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
              * Results are illustrative EPSM outputs. Proceed to Step 4 to test renovation packages against this baseline.
            </p>
          </div>
        )}

        <button
          disabled={!allComplete || simRunning}
          onClick={runBaseline}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "11px 24px", borderRadius: 10, border: 0,
            background: allComplete && !simRunning ? "linear-gradient(135deg,#5a9e1e,#96D74C)" : "rgba(255,255,255,0.06)",
            color: allComplete && !simRunning ? "#0a0d14" : "rgba(255,255,255,0.2)",
            fontSize: 13, fontWeight: 800, cursor: allComplete && !simRunning ? "pointer" : "not-allowed",
            boxShadow: allComplete && !simRunning ? "0 4px 14px rgba(150,215,76,0.3)" : "none",
          }}
        >
          {simRunning ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Zap size={14} />}
          {simRunning ? "Running…" : project.baselineStatus === "done" ? "Re-run Baseline in EPSM" : "Run Baseline in EPSM"}
        </button>
      </div>



    </div>
  );
}
