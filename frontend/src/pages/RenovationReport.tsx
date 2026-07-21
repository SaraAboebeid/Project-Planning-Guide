import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import type { BuildingLookup, BuildingRecord } from "../types";
import {
  Building2, Leaf, DollarSign, Zap, CheckCircle2, Download,
  Award, TrendingDown, Package, FileText, AlertTriangle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";

function recordToLookup(r: BuildingRecord): BuildingLookup {
  const approxPerimeter = r.footprint_m2 ? 4 * Math.sqrt(r.footprint_m2) : null;
  return {
    address: r.address || null, height: r.height_m, floors: r.floors,
    area_atemp: null, footprint_m2: r.footprint_m2, use_cat: r.building_use,
    wall_perimeter_m: null,
    wall_area_m2: approxPerimeter && r.height_m ? approxPerimeter * r.height_m : null,
    roof_area_m2: r.footprint_m2, floor_area_m2: r.footprint_m2,
    year: r.year_built, energy: r.energy_kwh_m2, eclass: r.epc_class,
    tabula_period: r.tabula_period, tabula_u_wall: r.u_wall, tabula_u_roof: r.u_roof, tabula_u_win: r.u_window,
    has_epc: r.has_epc ?? false, lat: r.lat, lon: r.lon, dist_m: 0,
  };
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const COMP_COLORS: Record<string, string> = {
  "Walls": "#721CB8", "Windows": "#F59E0B", "Doors": "#4ECDC4",
  "Floor": "#4A90E2", "Roof": "#4ECDC4", "Balcony": "#96D74C",
  "Structure (Columns & Beams)": "#EF4444", "Vertical Extension (New Floor)": "#F97316",
};

function sek(n: number) { return `${Math.round(n).toLocaleString("sv-SE")} SEK/m²`; }
function kwh(n: number) { return `${Math.round(n)} kWh/m²·yr`; }
function kg(n: number)  { return `${Math.round(n)} kg CO₂e/m²·yr`; }

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
      background: `${color}22`, color, border: `1px solid ${color}44`,
    }}>{children}</span>
  );
}

function Card({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div style={{
      borderRadius: 14, padding: "18px 20px",
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${accent ? `${accent}33` : "rgba(255,255,255,0.08)"}`,
    }}>{children}</div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      {icon}
      <h2 style={{ fontSize: 15, fontWeight: 800, color: "#fff", margin: 0 }}>{title}</h2>
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────────────────────── */
export default function RenovationReport() {
  const navigate = useNavigate();
  const { project } = useWizardStore();

  const simResults   = project.renovationSimResults ?? [];
  const baselines    = project.renovationBaselineResults ?? [];
  const materials    = project.simulationMaterials ?? {};
  const components   = project.renovationEnvelopeComponents ?? [];
  const buildings    = useMemo(() => {
    if (project.lookedUpBuildings.length > 0) return project.lookedUpBuildings;
    if (project.lookedUpBuilding) return [project.lookedUpBuilding];
    if (project.bboxRows.length > 0) return project.bboxRows.map(recordToLookup);
    return [];
  }, [project.lookedUpBuildings, project.lookedUpBuilding, project.bboxRows]);

  const baseline = baselines[0] ?? null;
  const baselineEU = baseline?.energyUse ?? 0;

  /* ── Recommended packages ── */
  const bestEnergy  = simResults[0] ?? null;   // already sorted by saving desc
  const bestCost    = [...simResults].sort((a, b) => a.cost - b.cost)[0] ?? null;
  const bestCarbon  = [...simResults].sort((a, b) => b.carbonSaving - a.carbonSaving)[0] ?? null;
  const bestBalanced = useMemo(() => {
    if (!simResults.length) return null;
    const maxSaving = Math.max(...simResults.map(r => r.saving));
    const maxCarbon = Math.max(...simResults.map(r => r.carbonSaving));
    const minCost   = Math.min(...simResults.map(r => r.cost));
    const maxCost   = Math.max(...simResults.map(r => r.cost));
    return simResults.reduce((best, r) => {
      const score =
        (r.saving / (maxSaving || 1)) * 0.4 +
        (r.carbonSaving / (maxCarbon || 1)) * 0.3 +
        (1 - (r.cost - minCost) / ((maxCost - minCost) || 1)) * 0.3;
      const bScore =
        (best.saving / (maxSaving || 1)) * 0.4 +
        (best.carbonSaving / (maxCarbon || 1)) * 0.3 +
        (1 - (best.cost - minCost) / ((maxCost - minCost) || 1)) * 0.3;
      return score > bScore ? r : best;
    }, simResults[0]);
  }, [simResults]);

  const hasResults = simResults.length > 0;
  const hasBaseline = baselines.length > 0;

  /* ── Chart data ── */
  const chartData = useMemo(() => {
    const top = simResults.slice(0, 8);
    return [
      { name: "Baseline", energyUse: baselineEU, saving: 0, fill: "rgba(255,255,255,0.2)" },
      ...top.map((r, i) => ({
        name: `Pkg ${r.packageIndex}`,
        energyUse: r.energyUse,
        saving: r.saving,
        fill: i === 0 ? "#96D74C" : i === 1 ? "#4ECDC4" : "rgba(114,28,184,0.7)",
      })),
    ];
  }, [simResults, baselineEU]);

  /* ── Printable report (→ Save as PDF) ──────────────────────────────────────
     Opens a self-contained, print-styled document and calls print(); the browser's
     "Save as PDF" produces the file. No PDF library, no server round-trip, and
     the output stays selectable text rather than a screenshot. */
  function materialsOf(r: typeof simResults[0]): { component: string; desc: string; u?: number }[] {
    return Object.entries(r.components ?? {}).map(([component, c]) => ({
      component: component.replace("VertExt::", "New "),
      desc: c.description || c.code,
      u: c.uValue,
    }));
  }

  function downloadPdf() {
    const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]!));
    const sek = (n: number) => Math.round(n).toLocaleString("sv-SE") + " SEK";

    const bestBlock = (label: string, r: typeof simResults[0] | null | undefined, why: string) => {
      if (!r) return "";
      const mats = materialsOf(r);
      return `
      <div class="best">
        <div class="best-h">${esc(label)} <span class="why">${esc(why)}</span></div>
        <div class="best-n">Package ${r.packageIndex}</div>
        <table class="mat">
          <thead><tr><th>Component</th><th>Material / assembly</th><th>U-value</th></tr></thead>
          <tbody>
            ${mats.length
              ? mats.map((m) => `<tr><td>${esc(m.component)}</td><td>${esc(m.desc)}</td><td>${m.u != null ? m.u.toFixed(2) + " W/m²K" : "—"}</td></tr>`).join("")
              : `<tr><td colspan="3" class="muted">No component detail recorded for this package.</td></tr>`}
          </tbody>
        </table>
        <div class="kv">
          <span><b>${r.energyUse.toFixed(1)}</b> kWh/m²·yr</span>
          <span>saves <b>${r.saving.toFixed(1)}</b> kWh/m²·yr</span>
          <span><b>${sek(r.cost)}</b></span>
          <span><b>${Math.round(r.carbonSaving).toLocaleString("sv-SE")}</b> kg CO₂e saved</span>
        </div>
      </div>`;
    };

    const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(project.projectName || "Renovation Report")}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Inter, system-ui, sans-serif; color:#0f172a; margin:0; font-size:11pt; line-height:1.5; }
  h1 { font-size:20pt; margin:0 0 4px; }
  h2 { font-size:12pt; margin:22px 0 8px; padding-bottom:4px; border-bottom:2px solid #4ECDC4; }
  .sub { color:#64748b; font-size:10pt; margin-bottom:4px; }
  table { width:100%; border-collapse:collapse; font-size:9.5pt; margin-top:6px; }
  th { text-align:left; background:#f1f5f9; padding:5px 7px; font-size:8.5pt; text-transform:uppercase; letter-spacing:.04em; color:#475569; }
  td { padding:5px 7px; border-bottom:1px solid #e2e8f0; vertical-align:top; }
  .muted { color:#94a3b8; font-style:italic; }
  .best { border:1px solid #cbd5e1; border-left:4px solid #4ECDC4; border-radius:6px; padding:10px 13px; margin-bottom:10px; page-break-inside:avoid; }
  .best-h { font-weight:800; font-size:11pt; }
  .why { font-weight:500; color:#64748b; font-size:9pt; }
  .best-n { color:#64748b; font-size:9pt; margin-bottom:4px; }
  .mat th { background:#f8fafc; }
  .kv { margin-top:7px; display:flex; gap:16px; flex-wrap:wrap; font-size:9.5pt; color:#334155; }
  .foot { margin-top:26px; padding-top:8px; border-top:1px solid #e2e8f0; color:#94a3b8; font-size:8.5pt; }
  .no-print { margin-bottom:14px; }
  @media print { .no-print { display:none; } }
</style></head><body>
  <div class="no-print">
    <button onclick="window.print()" style="padding:9px 18px;font-size:13px;font-weight:700;border-radius:8px;border:1px solid #4ECDC4;background:#e6fffb;cursor:pointer">
      Save as PDF
    </button>
  </div>

  <h1>${esc(project.projectName || "Renovation Report")}</h1>
  <div class="sub">${esc(project.locationLabel || project.address || "Unknown location")} ·
    ${buildings.length} building${buildings.length !== 1 ? "s" : ""} ·
    ${esc(components.join(", ") || "no components")}</div>
  <div class="sub">Generated ${new Date().toLocaleString("sv-SE")}</div>

  <h2>Baseline (as-built)</h2>
  <table><thead><tr><th>Building</th><th>Energy class</th><th>Energy use</th><th>Heating</th></tr></thead><tbody>
  ${baselines.length ? baselines.map((b) => `<tr>
      <td>${esc(b.address)}</td><td>${esc(b.eClass ?? "—")}</td>
      <td>${b.energyUse.toFixed(1)} kWh/m²·yr</td><td>${b.heating.toFixed(1)} kWh/m²·yr</td></tr>`).join("")
    : `<tr><td colspan="4" class="muted">No baseline simulation recorded.</td></tr>`}
  </tbody></table>

  <h2>Recommended packages — and what they are made of</h2>
  ${bestBlock("Best energy saving", bestEnergy, "largest reduction in energy use")}
  ${bestBlock("Lowest cost", bestCost, "cheapest to build")}
  ${bestBlock("Lowest carbon", bestCarbon, "largest CO₂e saving")}
  ${bestBlock("Best balanced", bestBalanced, "weighted 40% energy / 30% carbon / 30% cost")}

  <h2>All simulated packages</h2>
  <table><thead><tr><th>#</th><th>Materials</th><th>Energy</th><th>Saving</th><th>Cost</th><th>CO₂e saved</th></tr></thead><tbody>
  ${simResults.length ? simResults.map((r) => `<tr>
      <td>${r.packageIndex}</td>
      <td>${esc(materialsOf(r).map((m) => `${m.component}: ${m.desc}`).join("; ") || "—")}</td>
      <td>${r.energyUse.toFixed(1)}</td><td>${r.saving.toFixed(1)}</td>
      <td>${sek(r.cost)}</td><td>${Math.round(r.carbonSaving).toLocaleString("sv-SE")}</td></tr>`).join("")
    : `<tr><td colspan="6" class="muted">No packages simulated.</td></tr>`}
  </tbody></table>

  <div class="foot">
    Energy from EnergyPlus (EPSM) single-zone shoebox simulation · U-values per EN ISO 6946 ·
    cost from Wikells Sektionsfakta · embodied carbon from Boverket Klimatdatabas ·
    baseline energy class from Boverket EPC. Cooling is not reported: the single-zone model
    does not reach the cooling setpoint.
  </div>
</body></html>`;

    const w = window.open("", "_blank");
    if (!w) { alert("Allow pop-ups for this site to generate the PDF."); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
  }

  /* ── Download report as JSON ── */
  function downloadReport() {
    const report = {
      generated: new Date().toISOString(),
      project: {
        name: project.projectName || "Unnamed Project",
        type: project.projectType,
        location: project.locationLabel || project.address,
        scale: project.scale,
        components,
        systems: project.systemsInScope,
        kpis: project.selectedKpis,
      },
      buildings: buildings.map((b, i) => ({
        address: b.address ?? `Building ${i + 1}`,
        year: b.year,
        area_m2: b.area_atemp,
        use: b.use_cat,
        energyClass: b.eclass,
        currentEnergyUse_kWh_m2_yr: b.energy,
      })),
      baseline: baselines,
      materialsSelected: materials,
      simulationResults: simResults,
      recommendations: {
        // Materials included: a recommendation that doesn't say what it is made
        // of isn't actionable.
        lowestEnergy:  bestEnergy  ? { packageIndex: bestEnergy.packageIndex,  materials: materialsOf(bestEnergy),  energyUse: bestEnergy.energyUse,  saving: bestEnergy.saving,  carbonSaving: bestEnergy.carbonSaving,  cost: bestEnergy.cost  } : null,
        lowestCost:    bestCost    ? { packageIndex: bestCost.packageIndex,    materials: materialsOf(bestCost),    cost: bestCost.cost,    saving: bestCost.saving    } : null,
        lowestCarbon:  bestCarbon  ? { packageIndex: bestCarbon.packageIndex,  materials: materialsOf(bestCarbon),  carbonSaving: bestCarbon.carbonSaving, cost: bestCarbon.cost  } : null,
        bestBalanced:  bestBalanced ? { packageIndex: bestBalanced.packageIndex, materials: materialsOf(bestBalanced), energyUse: bestBalanced.energyUse, cost: bestBalanced.cost, carbonSaving: bestBalanced.carbonSaving } : null,
      },
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "renovation_report.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Package detail card ── */
  function PackageCard({ result, label, accent, icon }: {
    result: typeof simResults[0];
    label: string;
    accent: string;
    icon: React.ReactNode;
  }) {
    return (
      <div style={{
        borderRadius: 14, padding: "16px 18px", flex: 1, minWidth: 220,
        background: `${accent}08`, border: `1px solid ${accent}33`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          {icon}
          <span style={{ fontSize: 11, fontWeight: 800, color: accent, textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 8 }}>Package #{result.packageIndex}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {Object.entries(result.components).map(([comp, item]) => (
            <div key={comp} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: COMP_COLORS[comp] ?? "#721CB8", flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", flex: 1 }}>{comp}</span>
              <Badge color={COMP_COLORS[comp] ?? "#721CB8"}>{item.code}</Badge>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.07)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8 }}>Energy use</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#F59E0B" }}>{kwh(result.energyUse)}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8 }}>Saving</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#96D74C" }}>−{kwh(result.saving)}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8 }}>CO₂e saved</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#60a5fa" }}>−{kg(result.carbonSaving)}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8 }}>Material cost</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.7)" }}>{sek(result.cost)}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 1050 }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, color: "rgba(255,255,255,0.3)", marginBottom: 6, textTransform: "uppercase" }}>
            Renovation Planning · Step 5
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#fff", margin: "0 0 6px" }}>
            {project.projectName || "Renovation Report"}
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: 0 }}>
            {project.locationLabel || project.address || "Unknown location"} · {buildings.length} building{buildings.length !== 1 ? "s" : ""} · {components.length} component{components.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            onClick={downloadPdf}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(78,205,196,0.55)",
              background: "rgba(78,205,196,0.16)", color: "#4ECDC4",
              fontSize: 13, fontWeight: 800, cursor: "pointer",
            }}
          >
            <Download size={14} /> Download PDF
          </button>
          <button
            onClick={downloadReport}
            title="Raw data for further analysis"
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >
            JSON
          </button>
        </div>
      </div>

      {/* ── No data warning ── */}
      {!hasResults && (
        <div style={{ borderRadius: 12, padding: "16px 20px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <AlertTriangle size={16} color="#F59E0B" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: "#F59E0B", margin: 0 }}>
            No simulation results yet. Go back to Step 4 and run "Send to Simulation" to generate package results.
          </p>
        </div>
      )}

      {/* ── 1. Project Summary ── */}
      <Card>
        <SectionTitle icon={<FileText size={15} color="#721CB8" />} title="Project Summary" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[
            { label: "Project type",   value: project.projectType ?? "—" },
            { label: "Scale",          value: project.scale ?? "—" },
            { label: "Location",       value: project.locationLabel || project.address || "—" },
            { label: "Components",     value: components.length > 0 ? components.join(", ") : "—" },
            { label: "Systems in scope", value: project.systemsInScope.length > 0 ? project.systemsInScope.join(", ") : "—" },
            { label: "KPIs",           value: project.selectedKpis.length > 0 ? project.selectedKpis.join(", ") : "—" },
          ].map(r => (
            <div key={r.label} style={{ borderRadius: 8, padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>{r.label}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.8)", lineHeight: 1.4 }}>{r.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── 2. Buildings ── */}
      {buildings.length > 0 && (
        <Card>
          <SectionTitle icon={<Building2 size={15} color="#4ECDC4" />} title="Buildings" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {buildings.map((b, i) => {
              const bl = baselines[i];
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr repeat(5, auto)", gap: 12, alignItems: "center", padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{b.address ?? `Building ${i + 1}`}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{b.use_cat ?? "—"} · {b.year ?? "—"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>Area</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{b.area_atemp ? `${b.area_atemp} m²` : "—"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>Energy class</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#F59E0B" }}>{b.eclass ?? "—"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>EPC energy</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{b.energy ? kwh(b.energy) : "—"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>EPSM baseline</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: bl ? "#F59E0B" : "rgba(255,255,255,0.25)" }}>{bl ? kwh(bl.energyUse) : "—"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>Baseline status</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: bl ? "#96D74C" : "rgba(255,255,255,0.25)" }}>{bl ? "✓ Done" : "Pending"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── 3. Materials selected ── */}
      {Object.keys(materials).length > 0 && (
        <Card>
          <SectionTitle icon={<Package size={15} color="#F59E0B" />} title="Materials Selected for Testing" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(materials).filter(([, codes]) => codes.length > 0).map(([comp, codes]) => (
              <div key={comp} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: COMP_COLORS[comp] ?? "#721CB8", flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", minWidth: 140 }}>{comp}</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, flex: 1 }}>
                  {codes.map(c => <Badge key={c} color={COMP_COLORS[comp] ?? "#721CB8"}>{c}</Badge>)}
                </div>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>{codes.length} option{codes.length !== 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", margin: "10px 0 0" }}>
            {simResults.length} package{simResults.length !== 1 ? "s" : ""} simulated (cartesian product of above selections)
          </p>
        </Card>
      )}

      {/* ── 4. Energy chart ── */}
      {hasResults && (
        <Card>
          <SectionTitle icon={<Zap size={15} color="#F59E0B" />} title="Energy Use Comparison" />
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: "0 0 16px" }}>
            Top {Math.min(simResults.length, 8)} packages vs as-built baseline ({kwh(baselineEU)})
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barSize={28}>
              <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} unit=" kWh" />
              <Tooltip
                contentStyle={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => [`${v} kWh/m²·yr`]}
              />
              <ReferenceLine y={baselineEU} stroke="rgba(239,68,68,0.5)" strokeDasharray="4 3" label={{ value: "Baseline", fill: "rgba(239,68,68,0.6)", fontSize: 10 }} />
              <Bar dataKey="energyUse" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* ── 5. Recommendations ── */}
      {hasResults && (
        <div>
          <SectionTitle icon={<Award size={15} color="#96D74C" />} title="Recommendations" />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {bestEnergy  && <PackageCard result={bestEnergy}   label="Best energy saving"  accent="#96D74C" icon={<Zap size={13} color="#96D74C" />} />}
            {bestCarbon  && bestCarbon.packageIndex !== bestEnergy?.packageIndex  && <PackageCard result={bestCarbon}  label="Lowest carbon"      accent="#60a5fa" icon={<Leaf size={13} color="#60a5fa" />} />}
            {bestCost    && bestCost.packageIndex !== bestEnergy?.packageIndex    && <PackageCard result={bestCost}    label="Lowest cost"        accent="#F59E0B" icon={<DollarSign size={13} color="#F59E0B" />} />}
            {bestBalanced && bestBalanced.packageIndex !== bestEnergy?.packageIndex && <PackageCard result={bestBalanced} label="Best balanced"    accent="#c084fc" icon={<Award size={13} color="#c084fc" />} />}
          </div>
        </div>
      )}

      {/* ── 6. Full results table ── */}
      {hasResults && (
        <Card>
          <SectionTitle icon={<TrendingDown size={15} color="#4ECDC4" />} title={`All ${simResults.length} Packages — Ranked by Energy Saving`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 130px 120px 120px 120px", gap: 10, padding: "3px 12px", marginBottom: 2 }}>
              {["", "Components", "Energy use", "Saving", "CO₂e saved", "Cost"].map((h, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8, textAlign: i > 1 ? "right" : "left" }}>{h}</span>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 130px 120px 120px 120px", gap: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>—</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Baseline</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)", textAlign: "right" }}>{kwh(baselineEU)}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "right" }}>—</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "right" }}>—</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", textAlign: "right" }}>—</span>
            </div>
            {simResults.map((r, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "28px 1fr 130px 120px 120px 120px", gap: 10,
                padding: "9px 12px", borderRadius: 10, alignItems: "center",
                background: i === 0 ? "rgba(150,215,76,0.05)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${i === 0 ? "rgba(150,215,76,0.2)" : "rgba(255,255,255,0.05)"}`,
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? "#96D74C" : "rgba(255,255,255,0.2)" }}>{i === 0 ? "★" : `#${i + 1}`}</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {Object.entries(r.components).map(([comp, item]) => (
                    <span key={comp} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 5, background: `${COMP_COLORS[comp] ?? "#721CB8"}22`, color: COMP_COLORS[comp] ?? "#721CB8", border: `1px solid ${COMP_COLORS[comp] ?? "#721CB8"}44` }}>
                      {comp}: {item.code}
                    </span>
                  ))}
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.65)", textAlign: "right" }}>{kwh(r.energyUse)}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#96D74C", textAlign: "right" }}>−{kwh(r.saving)}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa", textAlign: "right" }}>−{kg(r.carbonSaving)}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", textAlign: "right" }}>{sek(r.cost)}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontStyle: "italic", margin: "10px 0 0" }}>
            * Illustrative EPSM outputs. CO₂e savings at 0.2 kg CO₂e/kWh.
          </p>
        </Card>
      )}

      {/* ── 7. Recommendation summary text ── */}
      {hasResults && bestBalanced && (
        <Card accent="#96D74C">
          <SectionTitle icon={<CheckCircle2 size={15} color="#96D74C" />} title="Summary & Recommendation" />
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.7, margin: "0 0 12px" }}>
            Based on the EPSM simulation of <strong style={{ color: "#fff" }}>{simResults.length} renovation packages</strong> across{" "}
            <strong style={{ color: "#fff" }}>{components.join(", ")}</strong>, the analysis identifies the following recommended strategy:
          </p>
          <div style={{ borderRadius: 10, padding: "14px 16px", background: "rgba(150,215,76,0.07)", border: "1px solid rgba(150,215,76,0.2)", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#96D74C", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
              ★ Recommended Package #{bestBalanced.packageIndex} — Best Balance of Cost, Energy & Carbon
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {Object.entries(bestBalanced.components).map(([comp, item]) => (
                <span key={comp} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 7, background: `${COMP_COLORS[comp] ?? "#721CB8"}22`, color: COMP_COLORS[comp] ?? "#721CB8", border: `1px solid ${COMP_COLORS[comp] ?? "#721CB8"}44`, fontWeight: 600 }}>
                  {comp}: {item.code} — {item.description}
                </span>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: 0, lineHeight: 1.6 }}>
              This package achieves a <strong style={{ color: "#96D74C" }}>{kwh(bestBalanced.saving)} reduction</strong> in annual energy use
              (from {kwh(baselineEU)} to <strong style={{ color: "#F59E0B" }}>{kwh(bestBalanced.energyUse)}</strong>),
              saving an estimated <strong style={{ color: "#60a5fa" }}>{kg(bestBalanced.carbonSaving)}</strong> of embodied carbon per year,
              at a material cost of <strong style={{ color: "rgba(255,255,255,0.8)" }}>{sek(bestBalanced.cost)}</strong>.
            </p>
          </div>
          {bestCost && bestCost.packageIndex !== bestBalanced.packageIndex && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, margin: "0 0 6px" }}>
              If cost is the primary constraint, <strong style={{ color: "#F59E0B" }}>Package #{bestCost.packageIndex}</strong> offers the
              lowest material cost at <strong style={{ color: "#F59E0B" }}>{sek(bestCost.cost)}</strong> while still saving{" "}
              <strong style={{ color: "#96D74C" }}>{kwh(bestCost.saving)}</strong>.
            </p>
          )}
          {bestCarbon && bestCarbon.packageIndex !== bestBalanced.packageIndex && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, margin: 0 }}>
              For maximum carbon impact, <strong style={{ color: "#60a5fa" }}>Package #{bestCarbon.packageIndex}</strong> saves{" "}
              <strong style={{ color: "#60a5fa" }}>{kg(bestCarbon.carbonSaving)}</strong> of CO₂e per year.
            </p>
          )}
        </Card>
      )}



    </div>
  );
}
