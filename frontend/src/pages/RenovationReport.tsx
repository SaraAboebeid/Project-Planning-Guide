import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore, FACADE_ORIENTATIONS, type FacadeOrientation } from "../store/wizard";
import { filterToBaselineShortlist } from "../utils/baselineShortlist";
import { climateGoalFor, assessAgainstGoal, assessBuildingsAgainstGoal } from "../config/climateGoals";
import ClimateGoalPanel from "../components/ClimateGoalPanel";
import ClimateGoalBuildingTable from "../components/ClimateGoalBuildingTable";
import type { BuildingLookup, BuildingRecord } from "../types";
import {
  Building2, Leaf, DollarSign, Zap, CheckCircle2, Download, ScanSearch,
  Award, TrendingDown, Package, FileText, AlertTriangle, Target, Flame,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";

/* Facade labels for the report. Kept here rather than imported from the Step 2
   panel so the report has no dependency on that component's UI internals. */
const FACADE_LABELS: Record<FacadeOrientation, string> = {
  north: "North", east: "East", south: "South", west: "West",
};
const FACADE_DEFECT_LABELS: Record<string, string> = {
  crack: "Crack", leakage: "Leakage / staining", abscission: "Spalling / abscission",
  corrosion: "Corrosion", bulge: "Bulge / deformation", other: "Other defect",
};

/* ── Inline SVG charts for the exported report ─────────────────────────────
   The report is a standalone HTML document opened from a Blob URL: no chart
   library is loaded and an <img> would need a server round-trip, so the charts
   are emitted as plain SVG. Light palette on purpose - the report prints. */

const escHtml = (v: unknown) =>
  String(v ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]!));

/** End-use colours, matching the Step 3/4 screens so the report is recognisable. */
const END_USE_STYLE: { key: string; label: string; color: string }[] = [
  { key: "heating",   label: "Heating",   color: "#E2483B" },
  { key: "dhw",       label: "Hot water", color: "#60a5fa" },
  { key: "cooling",   label: "Cooling",   color: "#4A90E2" },
  { key: "lighting",  label: "Lighting",  color: "#E8880C" },
  { key: "equipment", label: "Equipment", color: "#2FB477" },
];

function chartLegend(keys: string[]): string {
  const items = END_USE_STYLE.filter((e) => keys.includes(e.key));
  if (!items.length) return "";
  return '<div style="display:flex;gap:12px;flex-wrap:wrap;margin:4px 0 8px;font-size:8pt;color:#475569">'
    + items.map((e) =>
        `<span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${e.color};margin-right:4px"></span>${e.label}</span>`
      ).join("")
    + "</div>";
}

/** Horizontal stacked bars — one row per building, split by end use. */
type ChartTheme = { label: string; value: string };
/** Light for the printed report, dim-on-dark for the Step 5 screen. */
const PRINT_THEME: ChartTheme = { label: "#475569", value: "#0f172a" };
const SCREEN_THEME: ChartTheme = { label: "rgba(255,255,255,0.45)", value: "rgba(255,255,255,0.85)" };

function svgStackedBars(
  rows: { label: string; parts: { key: string; value: number }[] }[],
  unit: string,
  theme: ChartTheme = PRINT_THEME,
): string {
  if (!rows.length) return "";
  const W = 680, rowH = 20, gap = 8, labelW = 165, padR = 66;
  const barW = W - labelW - padR;
  const totals = rows.map((r) => r.parts.reduce((a, p) => a + p.value, 0));
  const max = Math.max(1, ...totals);
  const H = rows.length * (rowH + gap) + 4;
  const body = rows.map((r, i) => {
    const y = i * (rowH + gap);
    let x = labelW;
    const segs = r.parts.map((p) => {
      const w = (p.value / max) * barW;
      if (w <= 0) return "";
      const color = END_USE_STYLE.find((e) => e.key === p.key)?.color ?? "#94a3b8";
      const rect = `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${rowH}" fill="${color}"/>`;
      x += w;
      return rect;
    }).join("");
    const label = r.label.length > 26 ? r.label.slice(0, 25) + "…" : r.label;
    return `<text x="${labelW - 8}" y="${y + rowH / 2 + 3.5}" text-anchor="end" font-size="9" fill="${theme.label}">${escHtml(label)}</text>`
      + segs
      + `<text x="${(x + 6).toFixed(1)}" y="${y + rowH / 2 + 3.5}" font-size="9" font-weight="600" fill="${theme.value}">${totals[i]!.toFixed(1)}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Energy use by end use, ${escHtml(unit)}">${body}</svg>`;
}

/** Plain horizontal bars — package totals against the baseline. */
function svgCompareBars(
  rows: { label: string; value: number; highlight?: boolean }[],
  unit: string,
  theme: ChartTheme = PRINT_THEME,
): string {
  if (!rows.length) return "";
  const W = 680, rowH = 20, gap = 8, labelW = 200, padR = 90;
  const barW = W - labelW - padR;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const H = rows.length * (rowH + gap) + 4;
  const body = rows.map((r, i) => {
    const y = i * (rowH + gap);
    const w = Math.max(1, (r.value / max) * barW);
    const label = r.label.length > 32 ? r.label.slice(0, 31) + "…" : r.label;
    return `<text x="${labelW - 8}" y="${y + rowH / 2 + 3.5}" text-anchor="end" font-size="9" fill="${theme.label}">${escHtml(label)}</text>`
      + `<rect x="${labelW}" y="${y}" width="${w.toFixed(1)}" height="${rowH}" fill="${r.highlight ? "#94a3b8" : "#2FB477"}" rx="2"/>`
      + `<text x="${(labelW + w + 6).toFixed(1)}" y="${y + rowH / 2 + 3.5}" font-size="9" font-weight="600" fill="${theme.value}">${r.value.toFixed(1)} ${escHtml(unit)}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Total energy per package, ${escHtml(unit)}">${body}</svg>`;
}

/** "3× Crack, 1× Corrosion" - or a dash when nothing was flagged. */
function breakdownText(byClass: Record<string, number>): string {
  const parts = Object.entries(byClass ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${v}× ${FACADE_DEFECT_LABELS[k] ?? k}`);
  return parts.length ? parts.join(", ") : "—";
}

function recordToLookup(r: BuildingRecord): BuildingLookup {
  const approxPerimeter = r.footprint_m2 ? 4 * Math.sqrt(r.footprint_m2) : null;
  return {
    address: r.address || null, height: r.height_m, floors: r.floors,
    // The record carries Atemp from the EPC; dropping it made the report's
    // Area column read "—" for every bbox-selected building even though the
    // data was there. Fall back to footprint x floors, which is the same
    // heated-area convention Step 3/4 use for the shoebox.
    area_atemp: r.atemp ?? (r.footprint_m2 && r.floors ? Math.round(r.footprint_m2 * r.floors) : null),
    footprint_m2: r.footprint_m2, use_cat: r.building_use,
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
  "Walls": "var(--brand)", "Windows": "#E8880C", "Doors": "#4ECDC4",
  "Floor": "#4A90E2", "Roof": "#4ECDC4", "Balcony": "#2FB477",
  "Structure (Columns & Beams)": "#E2483B", "Vertical Extension (New Floor)": "#F97316",
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
    const all = project.lookedUpBuildings.length > 0
      ? project.lookedUpBuildings
      : project.lookedUpBuilding
        ? [project.lookedUpBuilding]
        : project.bboxRows.length > 0
          ? project.bboxRows.map(recordToLookup)
          : [];
    // The report describes the project Steps 3-4 analysed, which is the Step 3
    // shortlist - not everything that was selected back in Step 2.
    return filterToBaselineShortlist(all, project.renovationBaselineResults);
  }, [project.lookedUpBuildings, project.lookedUpBuilding, project.bboxRows, project.renovationBaselineResults]);

  const baseline = baselines[0] ?? null;
  const baselineEU = baseline?.energyUse ?? 0;

  /* ── Where the project actually is ────────────────────────────────────────
     A single street address is wrong for an area selection. Prefer the named
     neighbourhood; otherwise give the centre of whatever shape was drawn, so
     the report always states a locatable place rather than "Unknown location". */
  const locationText = useMemo(() => {
    const ll = (lat: number, lon: number) => `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

    // Centre of whatever was selected, and what that centre represents.
    let centre: { text: string; what: string } | null = null;
    if (project.selectionPolygon) {
      // Drawn polygon → centroid of its vertices ("lon,lat;lon,lat;…")
      const pts = project.selectionPolygon.split(";")
        .map((p) => p.split(",").map(Number))
        .filter((p) => p.length === 2 && p.every(Number.isFinite));
      if (pts.length) {
        const lon = pts.reduce((s, p) => s + p[0]!, 0) / pts.length;
        const lat = pts.reduce((s, p) => s + p[1]!, 0) / pts.length;
        centre = { text: ll(lat, lon), what: "centre of drawn area" };
      }
    }
    if (!centre && project.currentBbox) {
      const bb = project.currentBbox;
      centre = { text: ll((bb.north + bb.south) / 2, (bb.east + bb.west) / 2), what: "centre of selected area" };
    }
    if (!centre && project.lat != null && project.lon != null) {
      centre = { text: ll(project.lat, project.lon), what: "project location" };
    }

    // A drawn rectangle/polygon has no name of its own — but every building it
    // caught is tagged with its primärområde, so name the area from what's
    // actually inside it. Several neighbourhoods → name the dominant one and
    // say how many others the shape spans, rather than implying it's one place.
    let fromBuildings = "";
    const areas = project.bboxRows
      .map((r) => (r.primary_area || "").trim())
      .filter(Boolean);
    if (areas.length) {
      const counts = new Map<string, number>();
      areas.forEach((a) => counts.set(a, (counts.get(a) ?? 0) + 1));
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      fromBuildings = ranked.length > 1
        ? `${ranked[0]![0]} +${ranked.length - 1} more`
        : ranked[0]![0];
    }

    // A place name is the useful headline; the coordinates make it locatable.
    const name = project.district
      || (project.neighborhoodName?.trim() || "")
      || fromBuildings
      || (project.locationLabel?.trim() || "")
      || (project.address?.trim() || "");

    if (name && centre) return `${name} (${centre.text})`;
    if (name) return name;
    if (centre) return `${centre.text} (${centre.what})`;
    return "Unknown location";
  }, [project.district, project.neighborhoodName, project.selectionPolygon, project.bboxRows,
      project.currentBbox, project.locationLabel, project.address, project.lat, project.lon]);

  /* ── City climate target (Gothenburg: −30% by 2030) ────────────────────────
     Same helper Step 4 uses, so the report can't contradict what was shown when
     the packages were simulated. */
  const climateGoal = climateGoalFor(project.city, project.country);
  // simResults[].energyUse is a PORTFOLIO AVERAGE across buildings, so the goal
  // panel must measure it against the portfolio-average baseline — not
  // baselines[0] (one building), which made the panel disagree with the
  // per-building table on multi-building projects.
  const climateBaselineEU = baselines.length
    ? baselines.reduce((s, b) => s + b.energyUse, 0) / baselines.length
    : baselineEU;
  const goalAssessment = useMemo(() => {
    if (!climateGoal || !climateBaselineEU || !simResults.length) return null;
    return assessAgainstGoal(
      climateGoal,
      climateBaselineEU,
      simResults.map((r) => ({ label: `Package ${r.packageIndex}`, energyUse: r.energyUse })),
    );
  }, [climateGoal, climateBaselineEU, simResults]);

  // Per-building goal detail — each building's own target and how each package
  // lands against it. Uses the per-building results kept in renovationCalcPackages.
  const buildingGoal = useMemo(() => {
    if (!climateGoal) return null;
    return assessBuildingsAgainstGoal(climateGoal, project.renovationCalcPackages ?? []);
  }, [climateGoal, project.renovationCalcPackages]);

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

  /* Funnel counts — how the project narrowed from Step 2 to Step 4. `buildings`
     is already the Step 3 shortlist, so the pre-filter total comes from the raw
     Step 2 selection. */
  const selectedCount = project.bboxRows.length
    || project.lookedUpBuildings.length
    || (project.lookedUpBuilding ? 1 : 0);
  const prioritisedCount = project.prioritizedBuildingCount
    || project.prioritizedBuildingIndices.length
    || 0;

  /* Per-building package choices made in Step 4. When present they are the real
     recommendation — a portfolio-wide "best package" is an average that may suit
     none of the buildings individually. */
  const perBuildingPicks = useMemo(() => {
    const saved = project.selectedPackageByBuilding ?? {};
    if (!Object.keys(saved).length) return [];
    const pkgById = new Map(project.renovationCalcPackages.map((p) => [p.id, p]));
    return (project.renovationBaselineResults ?? [])
      .map((b) => {
        if (b.lat == null || b.lon == null) return null;
        const pkg = pkgById.get(saved[`${b.lat.toFixed(6)},${b.lon.toFixed(6)}`] ?? "");
        if (!pkg) return null;
        const row = pkg.buildings.find((x) => Math.abs(x.lat - b.lat!) < 1e-6 && Math.abs(x.lon - b.lon!) < 1e-6);
        return { address: b.address, pkg: pkg.name, baseline: b.energyUse, after: row?.totalKwhM2Yr ?? null };
      })
      .filter((x): x is { address: string; pkg: string; baseline: number; after: number | null } => x != null);
  }, [project.selectedPackageByBuilding, project.renovationCalcPackages, project.renovationBaselineResults]);

  const facadeEntries = useMemo(
    () => Object.entries(project.facadeDefects ?? {}).filter(([, sum]) => sum && sum.imageCount > 0),
    [project.facadeDefects],
  );

  /* Charts are built once and rendered twice: dim-on-dark on the Step 5 page,
     light in the printed report. Same data and same SVG, so the two cannot drift. */
  const baselineChartHtml = (theme: ChartTheme) => {
    if (!baselines.length) return "";
    const rows = baselines.map((b) => ({
      label: b.address || "Building",
      parts: [
        { key: "heating", value: b.heating ?? 0 },
        { key: "dhw", value: b.dhw || Math.max(0, (b.energyUse ?? 0) - (b.heating ?? 0) - (b.cooling ?? 0) - (b.lighting ?? 0) - (b.equipment ?? 0)) },
        { key: "cooling", value: b.cooling ?? 0 },
        { key: "lighting", value: b.lighting ?? 0 },
        { key: "equipment", value: b.equipment ?? 0 },
      ],
    }));
    const present = END_USE_STYLE.map((e) => e.key)
      .filter((k) => rows.some((r) => (r.parts.find((p) => p.key === k)?.value ?? 0) > 0));
    return chartLegend(present) + svgStackedBars(rows, "kWh/m²·yr", theme);
  };

  const packageChartHtml = (theme: ChartTheme) => {
    if (!simResults.length) return "";
    const rows = [
      ...(climateBaselineEU ? [{ label: "Baseline (as-built)", value: climateBaselineEU, highlight: true }] : []),
      ...simResults.map((r) => ({ label: `Package ${r.packageIndex}`, value: r.energyUse })),
    ];
    return svgCompareBars(rows, "kWh/m²·yr", theme);
  };

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
        fill: i === 0 ? "#2FB477" : i === 1 ? "#4ECDC4" : "rgba(var(--brand-rgb),0.7)",
      })),
    ];
  }, [simResults, baselineEU]);

  /* ── Printable report (→ Save as PDF) ──────────────────────────────────────
     Opens a self-contained, print-styled document and calls print(); the browser's
     "Save as PDF" produces the file. No PDF library, no server round-trip, and
     the output stays selectable text rather than a screenshot. */
  function materialsOf(r: typeof simResults[0]): { component: string; desc: string; u?: number; buildup?: string }[] {
    return Object.entries(r.components ?? {}).map(([component, c]) => ({
      component: component.replace("VertExt::", "New "),
      desc: c.description || c.code,
      u: c.uValue,
      buildup: layerText(c),
    }));
  }

  /** The full layer build-up as text (outside → inside), naming each material —
   *  e.g. "145 mm Timber stud layer · 145 mm Mineral wool batt · 9 mm Windproof
   *  board". Empty for catalogue assemblies (their description is already full). */
  function layerText(c: { layers?: { name: string; thicknessMm: number }[] }): string {
    return c.layers?.length ? c.layers.map((l) => `${l.thicknessMm} mm ${l.name}`).join(" · ") : "";
  }

  function downloadPdf() {
    const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]!));
    const sek = (n: number) => Math.round(n).toLocaleString("sv-SE") + " SEK";
    // Absolute origin so the logos resolve from the Blob-URL document (relative
    // paths there point at the blob, not the app). Logos are white → dark banner.
    const origin = window.location.origin;

    /* ── Facade condition (Step 2) ─────────────────────────────────────────
       Annotated photos live on the backend (/api/facade-image/<id>) because the
       wizard store is sessionStorage-backed and cannot hold images. Referencing
       them by absolute origin URL means the report window - which is rendered
       from a Blob URL - still resolves them. Photos that never got persisted
       simply do not appear; the counts still do. */
    /* ── The funnel, in the tool's own order ───────────────────────────────
       Step 2 selected N buildings and flagged M as priorities; Step 3 simulated
       the shortlist; Step 4 tested P packages against it. Stating that up front
       is what makes the rest of the report readable as one argument rather than
       a pile of tables. */
    const selectedCount = project.bboxRows.length
      || project.lookedUpBuildings.length
      || (project.lookedUpBuilding ? 1 : 0);
    const prioritisedCount = project.prioritizedBuildingCount
      || project.prioritizedBuildingIndices.length
      || 0;
    const simulatedCount = baselines.length;
    const packagesTested = simResults.length;

    const funnelBlock = `
  <h2>What was analysed</h2>
  <table><thead><tr><th>Stage</th><th>Buildings / packages</th><th>What happened</th></tr></thead><tbody>
    <tr><td>Step 2 — selection</td><td><b>${selectedCount}</b> building${selectedCount === 1 ? "" : "s"}</td>
        <td>Selected on the map and reviewed against the available data.</td></tr>
    ${prioritisedCount ? `<tr><td>Step 2 — prioritisation</td><td><b>${prioritisedCount}</b> flagged</td>
        <td>Ranked by energy performance, façade condition, characteristics and upgrade potential.</td></tr>` : ""}
    <tr><td>Step 3 — baseline</td><td><b>${simulatedCount}</b> simulated</td>
        <td>As-built performance from EnergyPlus, the baseline everything is measured against.</td></tr>
    <tr><td>Step 4 — packages</td><td><b>${packagesTested}</b> package${packagesTested === 1 ? "" : "s"}</td>
        <td>Each renovation package simulated against that baseline for energy, cost and carbon.</td></tr>
  </tbody></table>`;

    const baselineChart = baselines.length
      ? `<p class="sub">Energy use by end use, kWh/m²·yr.</p>${baselineChartHtml(PRINT_THEME)}`
      : "";
    const packageChart = simResults.length
      ? `<p class="sub">Total energy after renovation, kWh/m²·yr — baseline in grey.</p>${packageChartHtml(PRINT_THEME)}`
      : "";

    const facadeEntries = Object.entries(project.facadeDefects ?? {})
      .filter(([, sum]) => sum && sum.imageCount > 0);
    // The key is a cadastral/address hash, so prefer the label saved with the
    // summary; the key is only a last resort so a row is never nameless.
    const buildingLabelFor = (key: string) =>
      project.facadeDefects?.[key]?.label || key;

    const facadeReport = facadeEntries.length === 0 ? "" : [
      "<h2>Facade Defect Detection</h2>",
      '<p class="sub">Facade photos analysed by the MBDD2025 defect detector with an AI vision second opinion. '
        + "Boxes and labels are drawn on the images exactly as reviewed in Step 2. "
        + "Detection is a screening aid, not a structural survey.</p>",
      "<table><thead><tr><th>Building</th><th>Facade</th><th>Photos</th><th>Defects</th><th>Breakdown</th></tr></thead><tbody>",
      facadeEntries.map(([key, sum]) => {
        const label = buildingLabelFor(key);
        const orientations = FACADE_ORIENTATIONS.filter((o) => sum.byOrientation?.[o]?.imageCount);
        if (!orientations.length) {
          return "<tr><td>" + esc(label) + '</td><td class="muted">not recorded per facade</td><td>'
            + sum.imageCount + "</td><td>" + sum.defectCount + "</td><td>"
            + esc(breakdownText(sum.byClass)) + "</td></tr>";
        }
        return orientations.map((o, i) => {
          const os = sum.byOrientation![o]!;
          return "<tr>"
            + (i === 0 ? '<td rowspan="' + orientations.length + '">' + esc(label) + "</td>" : "")
            + "<td>" + FACADE_LABELS[o] + "</td><td>" + os.imageCount + "</td><td>" + os.defectCount + "</td><td>"
            + esc(breakdownText(os.byClass)) + "</td></tr>";
        }).join("");
      }).join(""),
      "</tbody></table>",
      facadeEntries.map(([key, sum]) => {
        const photos = sum.photos ?? [];
        if (!photos.length) return "";
        return '<h3 style="font-size:10.5pt;margin:12px 0 4px;color:#0f172a">' + esc(buildingLabelFor(key)) + "</h3>"
          + '<div class="fac-grid">'
          + photos.map((ph) => {
              const dets = ph.detections ?? [];
              return '<div class="fac-card">'
                + '<div class="fac-cap"><b>' + FACADE_LABELS[ph.orientation] + " facade</b> — " + esc(ph.name) + "</div>"
                + '<img src="' + origin + ph.url + '" alt="' + esc(FACADE_LABELS[ph.orientation] + " facade of " + buildingLabelFor(key)) + '" />'
                + (dets.length
                    ? '<ol class="fac-list">' + dets.map((d) =>
                        "<li>" + esc(FACADE_DEFECT_LABELS[d.label] ?? d.label)
                        + " — " + Math.round(d.score * 100) + "% confidence"
                        + (d.source === "ai" ? " (AI vision)" : " (ML model)")
                        + (d.note ? " — " + esc(d.note) : "")
                        + "</li>").join("") + "</ol>"
                    : '<div class="fac-clean">No defects detected on this photo.</div>')
                + "</div>";
            }).join("")
          + "</div>";
      }).join(""),
    ].join("");
    const team = "Sara Abouebeid · Holger Wallbaum · Liane Thuvander · Elena Malakhatka";

    const bestBlock = (label: string, r: typeof simResults[0] | null | undefined, why: string) => {
      if (!r) return "";
      const mats = materialsOf(r);
      return `
      <div class="best">
        <div class="best-h">${esc(label)} <span class="why">${esc(why)}</span></div>
        <div class="best-n">Package ${r.packageIndex}${r.buildingLabel ? ` · ${esc(r.buildingLabel)}` : " · all buildings"}</div>
        <table class="mat">
          <thead><tr><th>Component</th><th>Material / assembly</th><th>U-value</th></tr></thead>
          <tbody>
            ${mats.length
              ? mats.map((m) => `<tr><td>${esc(m.component)}</td><td>${esc(m.desc)}${m.buildup ? `<br><span class="buildup">${esc(m.buildup)}</span>` : ""}</td><td>${m.u != null ? m.u.toFixed(2) + " W/m²K" : "—"}</td></tr>`).join("")
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
  body { font-family: Inter, system-ui, sans-serif; color:#0f172a; margin:0; font-size:11pt; line-height:1.5; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
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
  .buildup { color:#475569; font-size:8pt; }
  .mat th { background:#f8fafc; }
  .kv { margin-top:7px; display:flex; gap:16px; flex-wrap:wrap; font-size:9.5pt; color:#334155; }
  .foot { margin-top:26px; padding-top:8px; border-top:1px solid #e2e8f0; color:#94a3b8; font-size:8.5pt; }
  .no-print { margin-bottom:14px; }
  @media print { .no-print { display:none; } }
  .fac-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; margin:8px 0 4px; }
  .fac-card { border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; break-inside:avoid; }
  .fac-card img { display:block; width:100%; height:auto; }
  .fac-cap { padding:5px 8px; font-size:8.5pt; color:#334155; background:#f8fafc; border-bottom:1px solid #e2e8f0; }
  .fac-cap b { color:#0f172a; }
  .fac-list { margin:0; padding:6px 8px 7px 20px; font-size:8pt; color:#475569; }
  .fac-clean { padding:6px 8px; font-size:8pt; color:#15803d; }
  .cover { background:#0d1117; color:#fff; border-radius:10px; padding:26px 30px; margin-bottom:14px; }
  .cover-logos { display:flex; align-items:center; gap:26px; margin-bottom:20px; }
  .cover-logos img { height:30px; width:auto; }
  .cover-kicker { font-size:9pt; letter-spacing:2px; text-transform:uppercase; color:#4ECDC4; font-weight:800; }
  .cover-title { font-size:23pt; font-weight:800; margin:5px 0 9px; line-height:1.12; }
  .cover-meta { font-size:9.5pt; color:#94a3b8; }
  .prepared { font-size:9pt; color:#475569; margin:0 0 18px; }
  .prepared b { color:#0f172a; }
  .prepared .lbl { text-transform:uppercase; letter-spacing:.08em; font-size:7.5pt; color:#94a3b8; margin-right:8px; }
</style></head><body>
  <div class="no-print">
    <button onclick="window.print()" style="padding:9px 18px;font-size:13px;font-weight:700;border-radius:8px;border:1px solid #4ECDC4;background:#e6fffb;cursor:pointer">
      Save as PDF
    </button>
  </div>

  <div class="cover">
    <div class="cover-logos">
      <img src="${origin}/CTH_new_logo_white.png" alt="Chalmers University of Technology" />
      <img src="${origin}/CNL_new_logo_white.png" alt="Chalmers Next Labs" />
    </div>
    <div class="cover-kicker">Building Renovation Analysis</div>
    <div class="cover-title">${esc(project.projectName || "Renovation Report")}</div>
    <div class="cover-meta">${esc(locationText)} · ${buildings.length} building${buildings.length !== 1 ? "s" : ""} · ${esc(components.join(", ") || "no components")} · Generated ${new Date().toLocaleString("sv-SE")}</div>
  </div>
  <div class="prepared"><span class="lbl">Prepared by</span><b>Chalmers Next Labs</b> — ${esc(team)}</div>

  ${funnelBlock}

  <h2>Baseline (as-built)</h2>
  <table><thead><tr><th>Building</th><th>Energy class</th><th>Energy use</th><th>Heating</th></tr></thead><tbody>
  ${baselines.length ? baselines.map((b) => `<tr>
      <td>${esc(b.address)}</td><td>${esc(b.eClass ?? "—")}</td>
      <td>${b.energyUse.toFixed(1)} kWh/m²·yr</td><td>${b.heating.toFixed(1)} kWh/m²·yr</td></tr>`).join("")
    : `<tr><td colspan="4" class="muted">No baseline simulation recorded.</td></tr>`}
  </tbody></table>
  ${baselineChart}

  ${facadeReport}

  <h2>Renovation packages tested</h2>
  <p class="sub">Every package below was simulated against the as-built baseline above, on the same buildings.</p>
  ${packageChart}

  ${perBuildingPicks.length ? `
  <h2>Chosen package per building</h2>
  <p class="sub">Selected building by building in Step 4 — where a portfolio-wide pick would average over real differences between them.</p>
  <table><thead><tr><th>Building</th><th>Chosen package</th><th>Baseline</th><th>After</th><th>Reduction</th></tr></thead><tbody>
  ${perBuildingPicks.map((r) => {
    const pct = r.after != null && r.baseline ? Math.round(((r.after - r.baseline) / r.baseline) * 100) : null;
    return `<tr><td>${esc(r.address)}</td><td>${esc(r.pkg)}</td>
      <td>${r.baseline.toFixed(1)}</td><td>${r.after == null ? "—" : r.after.toFixed(1)}</td>
      <td>${pct == null ? "—" : `${pct}%`}</td></tr>`;
  }).join("")}
  </tbody></table>
  <p class="sub" style="margin-top:4px">Energy in kWh/m²·yr.</p>` : ""}

  <h2>Recommended packages — and what they are made of</h2>
  ${bestBlock("Best energy saving", bestEnergy, "largest reduction in energy use")}
  ${bestBlock("Lowest cost", bestCost, "cheapest to build")}
  ${bestBlock("Lowest carbon", bestCarbon, "largest CO₂e saving")}
  ${bestBlock("Best balanced", bestBalanced, "weighted 40% energy / 30% carbon / 30% cost")}

  <h2>All simulated packages</h2>
  <table><thead><tr><th>#</th><th>Building</th><th>Materials</th><th>Energy</th><th>Saving</th><th>Cost</th><th>CO₂e saved</th></tr></thead><tbody>
  ${simResults.length ? simResults.map((r) => `<tr>
      <td>${r.packageIndex}</td>
      <td>${esc(r.buildingLabel ?? "all buildings")}</td>
      <td>${esc(materialsOf(r).map((m) => `${m.component}: ${m.buildup || m.desc}`).join("; ") || "—")}</td>
      <td>${r.energyUse.toFixed(1)}</td><td>${r.saving.toFixed(1)}</td>
      <td>${sek(r.cost)}</td><td>${Math.round(r.carbonSaving).toLocaleString("sv-SE")}</td></tr>`).join("")
    : `<tr><td colspan="7" class="muted">No packages simulated.</td></tr>`}
  </tbody></table>

  ${goalAssessment ? `
  <h2>${esc(goalAssessment.goal.city)} climate target</h2>
  <p class="sub">Target: reduce the as-built baseline energy demand by ${goalAssessment.goal.reductionPct}% by ${goalAssessment.goal.targetYear}. ${esc(goalAssessment.goal.source)}.</p>
  <p style="font-weight:700;margin:2px 0 6px;color:${goalAssessment.achievers.length ? "#15803d" : "#b45309"}">
    ${goalAssessment.achievers.length
      ? `✓ ${esc(goalAssessment.achievers[0]!.label)} reaches −${goalAssessment.achievers[0]!.reductionPct!.toFixed(0)}%, meeting the target${goalAssessment.achievers.length > 1 ? ` (${goalAssessment.achievers.length} packages meet it)` : ""}.`
      : goalAssessment.closest && goalAssessment.closest.reductionPct != null
        ? `No package reaches the −${goalAssessment.goal.reductionPct}% target yet — closest is ${esc(goalAssessment.closest.label)} at ${goalAssessment.closest.reductionPct >= 0 ? "−" : "+"}${Math.abs(goalAssessment.closest.reductionPct).toFixed(0)}%${goalAssessment.closest.reductionPct < 0 ? " (worse than baseline)" : ""}.`
        : ""}
  </p>
  <table><thead><tr><th>Package</th><th>Energy use</th><th>Reduction vs baseline</th><th>Meets −${goalAssessment.goal.reductionPct}% target</th></tr></thead><tbody>
  ${goalAssessment.rows.map((r) => `<tr>
      <td>${esc(r.label)}</td>
      <td>${r.energyUse.toFixed(1)} kWh/m²·yr</td>
      <td>${r.reductionPct == null ? "—" : `${r.reductionPct >= 0 ? "−" : "+"}${Math.abs(r.reductionPct).toFixed(0)}%`}</td>
      <td>${r.meets ? "✓ Yes" : "No"}</td></tr>`).join("")}
  </tbody></table>
  ${buildingGoal ? `
  <h3 style="font-size:10.5pt;margin:14px 0 4px">Per-building goal — each building's own −${buildingGoal.goal.reductionPct}% target</h3>
  <table><thead><tr><th>Building</th><th>Baseline</th><th>Goal −${buildingGoal.goal.reductionPct}%</th>${buildingGoal.columns.map((c) => `<th>${esc(c.label)}<br><span style="font-weight:400;color:#64748b">${c.met}/${c.total} meet</span></th>`).join("")}</tr></thead><tbody>
  ${buildingGoal.rows.map((r) => `<tr>
      <td>${esc(r.address)}</td>
      <td>${r.baselineEnergy.toFixed(0)}</td>
      <td>≤ ${r.targetEnergy.toFixed(0)}</td>
      ${r.cells.map((cell) => {
        const met = cell.tier === "meets" || cell.tier === "exceeds";
        const col = met ? "#15803d" : cell.tier === "below" ? "#b45309" : cell.tier === "worse" ? "#b91c1c" : "#64748b";
        const pct = cell.reductionPct == null ? "—"
          : cell.tier === "worse" ? `+${Math.abs(Math.round(cell.reductionPct))}%`
          : cell.tier === "below" ? `−${Math.round(cell.reductionPct)}% (${buildingGoal.goal.reductionPct - Math.round(cell.reductionPct)}pp short)`
          : `−${Math.round(cell.reductionPct)}%`;
        return `<td style="color:${col}">${cell.energy == null ? "—" : cell.energy.toFixed(0)}${met ? " ✓" : ""}<br><span style="font-size:8pt">${pct}</span></td>`;
      }).join("")}</tr>`).join("")}
  </tbody></table>
  <p class="sub" style="margin-top:4px">Values in kWh/m²·yr · pp = percentage points short of the −${buildingGoal.goal.reductionPct}% target.</p>` : ""}` : ""}

  <div class="foot">
    Energy from EnergyPlus (EPSM) single-zone shoebox simulation · U-values per EN ISO 6946 ·
    cost from Wikells Sektionsfakta · embodied carbon from Boverket Klimatdatabas ·
    ${project.supplierDiscountPct ? `All material costs are net of a ${project.supplierDiscountPct}% supplier discount entered in Step 4. ` : ""}Costs are installed capex (materials + labour); they exclude energy, maintenance and replacement.
    baseline energy class from Boverket EPC. Hot water is a Sveby standard draw profile played
    back through EnergyPlus, not a prediction. Cooling reads 0 because EPSM&#39;s end-use table
    carries only electricity and district heating; the hourly trace does show ideal-loads
    cooling, which a single-zone model with no openable windows overstates.
  </div>
  <script>window.addEventListener('load',function(){setTimeout(function(){try{window.print();}catch(e){}},400);});</script>
</body></html>`;

    // Render via a Blob URL rather than window.open("") + document.write — the
    // latter renders a blank page in modern browsers. A Blob URL loads as a real
    // document; the inline script above opens the print / Save-as-PDF dialog once
    // it has loaded, and the "Save as PDF" button in the page is the fallback.
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const w = window.open(url, "_blank");
    if (!w) { alert("Allow pop-ups for this site to generate the PDF."); URL.revokeObjectURL(url); return; }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  /* ── Download report as JSON ── */
  function downloadReport() {
    const report = {
      generated: new Date().toISOString(),
      project: {
        name: project.projectName || "Unnamed Project",
        type: project.projectType,
        location: locationText,
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
            <div key={comp} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: COMP_COLORS[comp] ?? "var(--brand)", flexShrink: 0, alignSelf: "center" }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", flexShrink: 0 }}>{comp}</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", flex: 1, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={layerText(item) || item.description}>
                {item.description || item.code}
              </span>
              {item.uValue != null && <Badge color={COMP_COLORS[comp] ?? "var(--brand)"}>U {item.uValue.toFixed(2)}</Badge>}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.07)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8 }}>Energy use</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#E8880C" }}>{kwh(result.energyUse)}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8 }}>Saving</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#2FB477" }}>−{kwh(result.saving)}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8 }}>CO₂e saved</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#4A90E2" }}>−{kg(result.carbonSaving)}</div>
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
            Everything from Steps 1-4, ready to share or save as PDF.
          </p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", margin: "4px 0 0" }}>
            {locationText} · {buildings.length} building{buildings.length !== 1 ? "s" : ""} · {components.length} component{components.length !== 1 ? "s" : ""}
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
        <div style={{ borderRadius: 12, padding: "16px 20px", background: "rgba(232,136,12,0.08)", border: "1px solid rgba(232,136,12,0.3)", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <AlertTriangle size={16} color="#E8880C" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: "#E8880C", margin: 0 }}>
            No simulation results yet. Go back to Step 4 and run "Send to Simulation" to generate package results.
          </p>
        </div>
      )}

      {/* ── 1. Project Summary ── */}
      <Card>
        <SectionTitle icon={<FileText size={15} color="var(--brand)" />} title="Project Summary" />
        {/* The funnel, in the tool's own order — how many buildings were selected,
            how many were prioritised, how many simulated, how many packages tested.
            Without it the rest of the report is a pile of tables with no thread. */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {[
            { n: selectedCount, label: `building${selectedCount === 1 ? "" : "s"} selected`, step: "Step 2" },
            ...(prioritisedCount ? [{ n: prioritisedCount, label: "flagged as priorities", step: "Step 2" }] : []),
            { n: baselines.length, label: "baseline simulated", step: "Step 3" },
            { n: simResults.length, label: `package${simResults.length === 1 ? "" : "s"} tested`, step: "Step 4" },
          ].map((f, i) => (
            <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {i > 0 && <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 14 }}>→</span>}
              <div style={{ borderRadius: 10, padding: "8px 14px", background: "rgba(78,205,196,0.07)", border: "1px solid rgba(78,205,196,0.22)" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#4ECDC4", lineHeight: 1.1 }}>{f.n}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>{f.label}</div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>{f.step}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[
            { label: "Project type",   value: project.projectType ?? "—" },
            { label: "Scale",          value: project.scale ?? "—" },
            { label: "Location",       value: locationText },
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
                    <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{b.area_atemp ? `${Math.round(b.area_atemp).toLocaleString("sv-SE")} m²` : "—"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>Energy class</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#E8880C" }}>{b.eclass ?? "—"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>EPC energy</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{b.energy ? kwh(b.energy) : "—"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>EPSM baseline</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: bl ? "#E8880C" : "rgba(255,255,255,0.25)" }}>{bl ? kwh(bl.energyUse) : "—"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>Baseline status</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: bl ? "#2FB477" : "rgba(255,255,255,0.25)" }}>{bl ? "✓ Done" : "Pending"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Baseline energy performance ──
          The same SVG the printed report draws, in the screen theme — the charts
          used to exist only in the PDF, so the page and the export disagreed
          about what the report contained. */}
      {baselines.length > 0 && (
        <Card>
          <SectionTitle icon={<Zap size={15} color="#E8880C" />} title="Baseline Energy Performance" />
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: "0 0 12px" }}>
            As-built energy use by end use, kWh/m²·yr — the baseline every package is measured against.
          </p>
          <div dangerouslySetInnerHTML={{ __html: baselineChartHtml(SCREEN_THEME) }} />
        </Card>
      )}

      {/* ── Facade condition ──
          The exported report has carried the annotated photos for a while; the
          on-screen report did not show them at all, so what Step 2 found was
          invisible here. */}
      {facadeEntries.length > 0 && (
        <Card>
          <SectionTitle icon={<ScanSearch size={15} color="#B98BE8" />} title="Facade Condition" />
          <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.4)", margin: "0 0 12px" }}>
            Photos analysed by the MBDD2025 defect detector with an AI vision second opinion — a screening aid, not a structural survey.
          </p>
          {facadeEntries.map(([key, sum]) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#fff" }}>{sum.label || key}</span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                  {sum.imageCount} photo{sum.imageCount === 1 ? "" : "s"} · {sum.defectCount} defect{sum.defectCount === 1 ? "" : "s"}
                </span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{breakdownText(sum.byClass)}</span>
              </div>
              {(sum.photos ?? []).length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                  {(sum.photos ?? []).map((ph) => (
                    <div key={ph.id} style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}>
                      <img src={ph.url} alt={`${FACADE_LABELS[ph.orientation]} facade of ${sum.label || key}`}
                           style={{ display: "block", width: "100%", height: "auto" }} />
                      <div style={{ padding: "6px 9px" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>
                          {FACADE_LABELS[ph.orientation]} facade
                        </div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                          {ph.detections.length
                            ? ph.detections.map((d) => `${FACADE_DEFECT_LABELS[d.label] ?? d.label} ${Math.round(d.score * 100)}%`).join(" · ")
                            : "No defects detected"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      {/* ── 3. Materials selected ── */}
      {Object.keys(materials).length > 0 && (
        <Card>
          <SectionTitle icon={<Package size={15} color="#E8880C" />} title="Materials Selected for Testing" />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(materials).filter(([, codes]) => codes.length > 0).map(([comp, codes]) => (
              <div key={comp} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: COMP_COLORS[comp] ?? "var(--brand)", flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", minWidth: 140 }}>{comp}</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, flex: 1 }}>
                  {codes.map(c => <Badge key={c} color={COMP_COLORS[comp] ?? "var(--brand)"}>{c}</Badge>)}
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
          <SectionTitle icon={<Zap size={15} color="#E8880C" />} title="Energy Use Comparison" />
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: "0 0 16px" }}>
            Top {Math.min(simResults.length, 8)} packages vs as-built baseline ({kwh(baselineEU)})
          </p>
          {/* Every package, matching the printed report exactly; the interactive
              chart below shows the top few with tooltips. */}
          <div dangerouslySetInnerHTML={{ __html: packageChartHtml(SCREEN_THEME) }} style={{ marginBottom: 14 }} />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barSize={28}>
              <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} unit=" kWh" />
              <Tooltip
                contentStyle={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => [`${v} kWh/m²·yr`]}
              />
              <ReferenceLine y={baselineEU} stroke="rgba(226,72,59,0.5)" strokeDasharray="4 3" label={{ value: "Baseline", fill: "rgba(226,72,59,0.6)", fontSize: 10 }} />
              <Bar dataKey="energyUse" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Per-building picks outrank the portfolio-wide recommendation below,
          so they come first when they exist. */}
      {perBuildingPicks.length > 0 && (
        <Card>
          <SectionTitle icon={<Building2 size={15} color="#4ECDC4" />} title="Chosen Package per Building" />
          <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.4)", margin: "0 0 10px" }}>
            Selected building by building in Step 4 — a single portfolio-wide pick would average over real differences between them.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {perBuildingPicks.map((r) => {
              const pct = r.after != null && r.baseline ? Math.round(((r.after - r.baseline) / r.baseline) * 100) : null;
              return (
                <div key={r.address} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                  padding: "8px 12px", borderRadius: 9, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", minWidth: 160 }}>{r.address}</span>
                  <span style={{ fontSize: 11.5, color: "#4ECDC4", flex: 1 }}>{r.pkg}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                    {r.baseline.toFixed(1)} → {r.after == null ? "—" : r.after.toFixed(1)} kWh/m²·yr
                  </span>
                  {pct != null && (
                    <span style={{ fontSize: 12, fontWeight: 800, color: pct < 0 ? "#2FB477" : "#E2483B" }}>{pct}%</span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── 5. Recommendations ── */}
      {hasResults && (
        <div>
          <SectionTitle icon={<Award size={15} color="#2FB477" />} title="Recommendations" />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {bestEnergy  && <PackageCard result={bestEnergy}   label="Best energy saving"  accent="#2FB477" icon={<Zap size={13} color="#2FB477" />} />}
            {bestCarbon  && bestCarbon.packageIndex !== bestEnergy?.packageIndex  && <PackageCard result={bestCarbon}  label="Lowest carbon"      accent="#4A90E2" icon={<Leaf size={13} color="#4A90E2" />} />}
            {bestCost    && bestCost.packageIndex !== bestEnergy?.packageIndex    && <PackageCard result={bestCost}    label="Lowest cost"        accent="#E8880C" icon={<DollarSign size={13} color="#E8880C" />} />}
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
                background: i === 0 ? "rgba(47,180,119,0.05)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${i === 0 ? "rgba(47,180,119,0.2)" : "rgba(255,255,255,0.05)"}`,
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? "#2FB477" : "rgba(255,255,255,0.2)" }}>{i === 0 ? "★" : `#${i + 1}`}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {/* Which building this package is for — identical materials on
                      two buildings were otherwise indistinguishable here. */}
                  <span style={{ fontSize: 10, fontWeight: 700, color: r.buildingLabel ? "#4ECDC4" : "rgba(255,255,255,0.35)" }}>
                    {r.buildingLabel ?? "All buildings"}
                  </span>
                  {Object.entries(r.components).map(([comp, item]) => (
                    <div key={comp} style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 5 }}>
                      <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 5, flexShrink: 0, background: `${COMP_COLORS[comp] ?? "var(--brand)"}22`, color: COMP_COLORS[comp] ?? "var(--brand)", border: `1px solid ${COMP_COLORS[comp] ?? "var(--brand)"}44` }}>
                        {comp}
                      </span>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>
                        {layerText(item) || item.description || item.code}
                        {item.uValue != null && <span style={{ color: "rgba(255,255,255,0.4)" }}> · U {item.uValue.toFixed(2)}</span>}
                      </span>
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.65)", textAlign: "right" }}>{kwh(r.energyUse)}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#2FB477", textAlign: "right" }}>−{kwh(r.saving)}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#4A90E2", textAlign: "right" }}>−{kg(r.carbonSaving)}</span>
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
        <Card accent="#2FB477">
          <SectionTitle icon={<CheckCircle2 size={15} color="#2FB477" />} title="Summary & Recommendation" />
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.7, margin: "0 0 12px" }}>
            Based on the EPSM simulation of <strong style={{ color: "#fff" }}>{simResults.length} renovation packages</strong> across{" "}
            <strong style={{ color: "#fff" }}>{components.join(", ")}</strong>, the analysis identifies the following recommended strategy:
          </p>
          <div style={{ borderRadius: 10, padding: "14px 16px", background: "rgba(47,180,119,0.07)", border: "1px solid rgba(47,180,119,0.2)", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#2FB477", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
              ★ Recommended Package #{bestBalanced.packageIndex} — Best Balance of Cost, Energy & Carbon
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {Object.entries(bestBalanced.components).map(([comp, item]) => (
                <span key={comp} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 7, background: `${COMP_COLORS[comp] ?? "var(--brand)"}22`, color: COMP_COLORS[comp] ?? "var(--brand)", border: `1px solid ${COMP_COLORS[comp] ?? "var(--brand)"}44`, fontWeight: 600 }}>
                  {comp}: {item.description}{layerText(item) ? ` (${layerText(item)})` : ""}
                </span>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: 0, lineHeight: 1.6 }}>
              This package achieves a <strong style={{ color: "#2FB477" }}>{kwh(bestBalanced.saving)} reduction</strong> in annual energy use
              (from {kwh(baselineEU)} to <strong style={{ color: "#E8880C" }}>{kwh(bestBalanced.energyUse)}</strong>),
              saving an estimated <strong style={{ color: "#4A90E2" }}>{kg(bestBalanced.carbonSaving)}</strong> of embodied carbon per year,
              at a material cost of <strong style={{ color: "rgba(255,255,255,0.8)" }}>{sek(bestBalanced.cost)}</strong>.
            </p>
          </div>
          {bestCost && bestCost.packageIndex !== bestBalanced.packageIndex && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, margin: "0 0 6px" }}>
              If cost is the primary constraint, <strong style={{ color: "#E8880C" }}>Package #{bestCost.packageIndex}</strong> offers the
              lowest material cost at <strong style={{ color: "#E8880C" }}>{sek(bestCost.cost)}</strong> while still saving{" "}
              <strong style={{ color: "#2FB477" }}>{kwh(bestCost.saving)}</strong>.
            </p>
          )}
          {bestCarbon && bestCarbon.packageIndex !== bestBalanced.packageIndex && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, margin: 0 }}>
              For maximum carbon impact, <strong style={{ color: "#4A90E2" }}>Package #{bestCarbon.packageIndex}</strong> saves{" "}
              <strong style={{ color: "#4A90E2" }}>{kg(bestCarbon.carbonSaving)}</strong> of CO₂e per year.
            </p>
          )}
        </Card>
      )}

      {/* ── City climate target ── */}
      {goalAssessment && (
        <Card>
          <SectionTitle icon={<Target size={15} color="#2FB477" />} title="City climate target" />
          <ClimateGoalPanel a={goalAssessment} />
          {buildingGoal && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
                Per-building goal
              </div>
              <ClimateGoalBuildingTable a={buildingGoal} />
            </div>
          )}
        </Card>
      )}

      {/* ── 8. Compare options across future energy prices ── */}
      {project.regretAnalysis && project.regretAnalysis.options.length >= 2 && (() => {
        const ra = project.regretAnalysis!;
        const fmtM = (v: number) => `${v < 0 ? "−" : ""}${(Math.abs(v) / 1e6).toFixed(2)}M`;
        const scenarioHint = (label: string, index: number) => {
          const l = label.toLowerCase();
          if (l.includes("low")) return "cheap energy future";
          if (l.includes("medium")) return "middle-price future";
          if (l.includes("high")) return "expensive energy future";
          return ["cheap energy future", "middle-price future", "expensive energy future"][index] ?? "price scenario";
        };
        const PICKS: Record<string, { fg: string; label: string; tip: string }> = {
          minimaxRegret: { fg: "#4ECDC4", label: "Safety-first", tip: "Chooses the option with the smallest worst-case disappointment" },
          hurwicz:       { fg: "#B98BE8", label: `Balanced choice (alpha=${ra.alpha.toFixed(2)})`, tip: "Blends worst and best case using your decision-style slider" },
          mostRobust:    { fg: "#2FB477", label: "Most stable", tip: "Smallest difference between low and high price outcomes" },
        };
        const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 600, color: "rgba(255,255,255,0.45)", textAlign: "right", whiteSpace: "nowrap" };
        const td: React.CSSProperties = { padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap", color: "rgba(255,255,255,0.8)" };
        return (
          <Card accent="#4ECDC4">
            <SectionTitle icon={<Award size={15} color="#4ECDC4" />} title="Compare Retrofit Choices Across Future Energy Prices" />
            <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)", lineHeight: 1.7, margin: "0 0 12px" }}>
              Each retrofit option is tested in three possible futures: Low (cheap energy), Medium (middle prices), and High (expensive energy).
              We then compare outcomes with three simple decision styles so you can choose without guessing one exact future.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {(["minimaxRegret", "hurwicz", "mostRobust"] as const).map((k) => {
                const opt = ra.options.find((o) => o.id === ra.picks[k]);
                if (!opt) return null;
                return (
                  <div key={k} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12.5, color: "rgba(255,255,255,0.7)" }}>
                    <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 99, color: PICKS[k].fg, background: `${PICKS[k].fg}22`, whiteSpace: "nowrap" }}>★ {PICKS[k].label}</span>
                    <span><strong style={{ color: "#fff" }}>{opt.label}</strong> - {PICKS[k].tip}.</span>
                  </div>
                );
              })}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: "left" }}>Retrofit option</th>
                    {ra.scenarios.map((s, i) => (
                      <th key={s.key} style={th} title={scenarioHint(s.label, i)}>
                        {s.label}
                        <br />
                        <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.3)" }}>{scenarioHint(s.label, i)} · {s.priceSek} SEK/kWh</span>
                      </th>
                    ))}
                    <th style={th} title="Best minus worst across scenarios">Outcome spread</th>
                    <th style={th} title="Worst miss compared with the best option in each scenario">Worst miss vs best</th>
                    <th style={th} title="alpha x best + (1 - alpha) x worst">Balanced score</th>
                  </tr>
                </thead>
                <tbody>
                  {ra.options.map((o) => (
                    <tr key={o.id} style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                      <td style={{ padding: "6px 8px", color: o.isBaseline ? "rgba(255,255,255,0.5)" : "#fff", fontStyle: o.isBaseline ? "italic" : undefined, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{o.label}</td>
                      {o.benefits.map((b, si) => {
                        const best = !o.isBaseline && b === ra.bestPerScenario[si];
                        return <td key={si} style={{ ...td, color: best ? "#2FB477" : o.isBaseline ? "rgba(255,255,255,0.4)" : b < 0 ? "#fca5a5" : "rgba(255,255,255,0.8)", fontWeight: best ? 800 : 400 }}>{fmtM(b)}</td>;
                      })}
                      <td style={td}>{o.isBaseline ? "—" : fmtM(o.range)}</td>
                      <td style={{ ...td, color: o.id === ra.picks.minimaxRegret ? "#4ECDC4" : "rgba(255,255,255,0.6)", fontWeight: o.id === ra.picks.minimaxRegret ? 800 : 400 }}>{o.isBaseline ? "—" : fmtM(o.maxRegret)}</td>
                      <td style={{ ...td, color: o.id === ra.picks.hurwicz ? "#B98BE8" : "rgba(255,255,255,0.6)", fontWeight: o.id === ra.picks.hurwicz ? 800 : 400 }}>{o.isBaseline ? "—" : fmtM(o.hurwicz)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", marginTop: 10, lineHeight: 1.6 }}>
              Values are {ra.studyPeriodYr}-year net present benefit (SEK, millions). Negative means the investment is not repaid by energy savings
              in that future. "Balanced score" is the Hurwicz method shown in plain language.
            </p>
          </Card>
        );
      })()}

      {/* ── 9. Heating system (HVAC) ── */}
      {project.heatingAnalysis && project.heatingAnalysis.results.length > 0 && (() => {
        const ha = project.heatingAnalysis!;
        const sel = ha.results.find((r) => r.id === ha.selectedId) ?? ha.results.find((r) => r.isBaseline) ?? ha.results[0];
        if (!sel) return null;
        const fsek = (v: number) => { const a = Math.abs(v); return a >= 1e6 ? `${(v / 1e6).toFixed(2)} M` : a >= 1e4 ? `${Math.round(v / 1e3)} k` : `${Math.round(v).toLocaleString("sv-SE")}`; };
        const th2: React.CSSProperties = { padding: "6px 8px", fontWeight: 600, color: "rgba(255,255,255,0.45)", textAlign: "right", whiteSpace: "nowrap" };
        const td2: React.CSSProperties = { padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap", color: "rgba(255,255,255,0.8)" };
        return (
          <Card accent="#E8880C">
            <SectionTitle icon={<Flame size={15} color="#E8880C" />} title="Heating System (HVAC)" />
            <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.65)", lineHeight: 1.7, margin: "0 0 12px" }}>
              On the building's <strong style={{ color: "#fff" }}>{Math.round(ha.heatingDemandKwhM2Yr)} kWh/m²·yr</strong> heat demand, the chosen system is{" "}
              <strong style={{ color: "#E8880C" }}>{sel.name}</strong>{sel.isBaseline ? " (the as-built baseline)" : ""} — delivering{" "}
              <strong style={{ color: "#fff" }}>{sel.deliveredKwhM2Yr} kWh/m²·yr</strong> at{" "}
              <strong style={{ color: "#fff" }}>{fsek(sel.operatingCostYrSek)} SEK/yr</strong> and{" "}
              <strong style={{ color: "#4A90E2" }}>{fsek(sel.carbonYrKg)} kg CO₂e/yr</strong>
              {sel.vsBaseline && !sel.isBaseline && <> ({sel.vsBaseline.opCostPct > 0 ? "+" : ""}{sel.vsBaseline.opCostPct}% cost, {sel.vsBaseline.carbonPct > 0 ? "+" : ""}{sel.vsBaseline.carbonPct}% carbon vs district heating)</>}.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ ...th2, textAlign: "left" }}>System</th>
                    <th style={th2}>SPF/eff.</th>
                    <th style={th2}>Delivered<br /><span style={{ fontWeight: 400, color: "rgba(255,255,255,0.3)" }}>kWh/m²·yr</span></th>
                    <th style={th2}>Op. cost/yr</th>
                    <th style={th2}>Carbon/yr<br /><span style={{ fontWeight: 400, color: "rgba(255,255,255,0.3)" }}>kg CO₂e</span></th>
                    <th style={th2}>Install</th>
                    <th style={th2}>{ha.results[0] ? "30-yr LCC" : "LCC"}</th>
                  </tr>
                </thead>
                <tbody>
                  {ha.results.map((s) => {
                    const isSel = s.id === ha.selectedId;
                    return (
                      <tr key={s.id} style={{ borderTop: "1px solid rgba(255,255,255,0.07)", background: isSel ? "rgba(78,205,196,0.10)" : s.isBaseline ? "rgba(232,136,12,0.05)" : undefined, boxShadow: isSel ? "inset 3px 0 0 #4ECDC4" : undefined }}>
                        <td style={{ padding: "6px 8px", color: "#fff" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                            {s.shortName}{isSel && <span style={{ fontSize: 8.5, color: "#4ECDC4", fontWeight: 800 }}>✓ chosen</span>}{s.isBaseline && <span style={{ fontSize: 8.5, color: "#E8880C" }}>baseline</span>}
                          </span>
                        </td>
                        <td style={td2}>{s.spf.toFixed(s.spf >= 1.5 ? 1 : 2)}</td>
                        <td style={td2}>{s.deliveredKwhM2Yr}</td>
                        <td style={td2}>{fsek(s.operatingCostYrSek)}</td>
                        <td style={td2}>{fsek(s.carbonYrKg)}</td>
                        <td style={td2}>{fsek(s.capexSek)}</td>
                        <td style={{ ...td2, color: s.id === ha.picks.lowestLcc ? "#2FB477" : "#fff", fontWeight: s.id === ha.picks.lowestLcc ? 800 : 400 }}>{fsek(s.lccSek)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", marginTop: 10, lineHeight: 1.6 }}>
              Heat demand from EnergyPlus (EPSM); system economics are a supply-side layer (delivered = demand ÷ SPF). Values are Swedish defaults — see the tool's Heating-system panel for sources.
            </p>
          </Card>
        );
      })()}

    </div>
  );
}
