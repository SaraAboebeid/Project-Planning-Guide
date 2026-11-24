import { Fragment, useEffect, useMemo, useState } from "react";
import { api, type PvgisEstimate } from "../api/client";
import { useNavigate } from "react-router-dom";
import { useWizardStore, FACADE_ORIENTATIONS, type FacadeOrientation } from "../store/wizard";
import { filterToBaselineShortlist } from "../utils/baselineShortlist";
import { buildingUseLabel } from "../utils/useLabels";
import { excludesHouseholdElectricity } from "../utils/energyTotals";
import { climateGoalFor, assessAgainstGoal, assessBuildingsAgainstGoal, assessRating, isScorable, goalStatement, requiredPct, goalTitle } from "../config/climateGoals";
import ClimateGoalPanel, { ClimateGoalInfo, ClimateGoalRatingPanel } from "../components/ClimateGoalPanel";
import ClimateGoalBuildingTable from "../components/ClimateGoalBuildingTable";
import type { BuildingLookup, BuildingRecord } from "../types";
import { fmtGBP, UK_COST_CARBON_SOURCE_NOTE } from "../config/ukCostCarbon";
import {
  Building2, Leaf, DollarSign, Zap, CheckCircle2, Download, ScanSearch,
  Award, TrendingDown, Package, FileText, AlertTriangle, Target, Flame, Sun, CalendarClock,
} from "lucide-react";

/* Money in the staged plan's own currency (k / M for large sums). */
const stagedMoney = (v: number, cur: string) => {
  const f = (x: number, d = 0) => new Intl.NumberFormat(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }).format(x);
  return Math.abs(v) >= 1e6 ? `${f(v / 1e6, 1)} M${cur}` : Math.abs(v) >= 1e4 ? `${f(v / 1e3)} k${cur}` : `${f(v)} ${cur}`;
};
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { useT, useLang, translate } from "../i18n";

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
        `<span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${e.color};margin-right:4px"></span>${translate(e.label)}</span>`
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${escHtml(translate("Energy use by end use, {unit}", { unit }))}">${body}</svg>`;
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
  // A package that uses MORE energy than the baseline must not look like a win.
  const base = rows.find((r) => r.highlight)?.value ?? null;
  const fillOf = (r: { value: number; highlight?: boolean }) =>
    r.highlight ? "#94a3b8" : base != null && r.value > base ? "#E2483B" : "#2FB477";
  const body = rows.map((r, i) => {
    const y = i * (rowH + gap);
    const w = Math.max(1, (r.value / max) * barW);
    const label = r.label.length > 32 ? r.label.slice(0, 31) + "…" : r.label;
    return `<text x="${labelW - 8}" y="${y + rowH / 2 + 3.5}" text-anchor="end" font-size="9" fill="${theme.label}">${escHtml(label)}</text>`
      + `<rect x="${labelW}" y="${y}" width="${w.toFixed(1)}" height="${rowH}" fill="${fillOf(r)}" rx="2"/>`
      + `<text x="${(labelW + w + 6).toFixed(1)}" y="${y + rowH / 2 + 3.5}" font-size="9" font-weight="600" fill="${theme.value}">${r.value.toFixed(1)} ${escHtml(unit)}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${escHtml(translate("Total energy per package, {unit}", { unit }))}">${body}</svg>`;
}

/** "3× Crack, 1× Corrosion" - or a dash when nothing was flagged. */
function breakdownText(byClass: Record<string, number>): string {
  const parts = Object.entries(byClass ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${v}× ${FACADE_DEFECT_LABELS[k] ? translate(FACADE_DEFECT_LABELS[k]!) : k}`);
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
  "Walls": "var(--brand)", "Windows": "#E8880C", "Doors": "#8B6EAD",
  "Floor": "#4A90E2", "Roof": "#8B6EAD", "Balcony": "#2FB477",
  "Structure (Columns & Beams)": "#E2483B", "Vertical Extension (New Floor)": "#F97316",
};
/** Rooftop PV assumptions - the same as the 3D viewer's Rooftop PV button and the
 *  backend's /api/pvgis-estimate; shown under the solar table on screen and in
 *  the downloaded report. */
const PV_ASSUMPTIONS = [
  "Calculation: PVGIS v5.2 by the EU Joint Research Centre, using its satellite-based solar radiation data for each building's location.",
  "Roof covered with panels: set per building with the slider (default 80% of the footprint, leaving the rest for edges, hatches and equipment). Production scales in proportion: the building's PVGIS yield per kWp × the system size.",
  "System size: 0.2 kWp per m² of usable roof (about 5 m² of roof per kWp).",
  "Panels: crystalline silicon, tilted 35° and facing south.",
  "System losses: 14% (cables, inverter, dirt and temperature effects).",
  "Not modelled: the real roof shape and slope, obstructions (chimneys, vents) and shading from neighbouring buildings or trees — treat it as a screening estimate.",
];

/** "VertExt::Roof" → "New roof": the new storey's parts, in words. */
const compLabel = (comp: string) =>
  comp.startsWith("VertExt::") ? translate(`New ${comp.slice("VertExt::".length).toLowerCase()}`) : translate(comp);
const compColor = (comp: string) =>
  comp.startsWith("VertExt::") ? COMP_COLORS["Vertical Extension (New Floor)"]! : (COMP_COLORS[comp] ?? "var(--brand)");

/** Fill a translated sentence's {placeholders} with React nodes (e.g. <strong>
 *  figures), so whole sentences are translated rather than word fragments. */
function rich(text: string, parts: Record<string, React.ReactNode>): React.ReactNode[] {
  return text.split(/(\{\w+\})/g).map((seg, i) => {
    const key = /^\{(\w+)\}$/.exec(seg)?.[1];
    return key != null && key in parts ? <Fragment key={i}>{parts[key]}</Fragment> : seg;
  });
}

function kwh(n: number) { return `${Math.round(n)} kWh/m²·yr`; }
// One decimal below 10: on Gothenburg's low-carbon heat a saving is ~1-2 kg/m²·yr.
function kg(n: number)  { return `${Math.abs(n) < 10 ? (Math.round(n * 10) / 10).toFixed(1) : Math.round(n)} kg CO₂e/m²·yr`; }

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
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
      <h2 style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: 0 }}>{title}</h2>
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────────────────────── */
export default function RenovationReport() {
  const navigate = useNavigate();
  const { project, setProject } = useWizardStore();
  const t = useT();
  // Memoised labels below are built in the current language, so they recompute on a switch.
  const lang = useLang();
  // UK projects are costed in GBP from UK sources; everything else is Swedish.
  const isUK = project.country === "United Kingdom";
  // Belgium: no cost data yet (packages carry no cost), numbers in en-GB style.
  const isBE = project.country === "Belgium";
  const isLiege = isBE && project.city === "Liège";
  const numLocale = isUK || isBE ? "en-GB" : "sv-SE";
  // Package costs are whole-project totals, not per m².
  const money = (n: number) => (isBE ? "—" : isUK ? fmtGBP(n) : `${Math.round(n).toLocaleString("sv-SE")} SEK`);
  // Belgium: packages carry no carbon figure, so there is no saving to report.
  const co2Saved = (n: number) => (isBE ? "—" : `−${kg(n)}`);

  const simResults   = project.renovationSimResults ?? [];
  const baselines    = project.renovationBaselineResults ?? [];
  const materials    = project.simulationMaterials ?? {};
  const components   = project.renovationEnvelopeComponents ?? [];
  const buildings    = useMemo(() => {
    const all = project.bboxRows.length > 0
      ? project.bboxRows.map(recordToLookup)
      : project.lookedUpBuildings.length > 0
        ? project.lookedUpBuildings
        : project.lookedUpBuilding
          ? [project.lookedUpBuilding]
          : [];
    // The report describes the project Steps 3-4 analysed, which is the Step 3
    // shortlist - not everything that was selected back in Step 2.
    return filterToBaselineShortlist(all, project.renovationBaselineResults);
  }, [project.lookedUpBuildings, project.lookedUpBuilding, project.bboxRows, project.renovationBaselineResults]);

  /* Annual rooftop PV potential (PVGIS) for the analysed buildings: the result
     saved from the 3D viewer where there is one, otherwise computed now with the
     viewer's assumptions (backend /api/pvgis-estimate). */
  const [pv, setPv] = useState<{ results: PvgisEstimate[]; assumptions: Record<string, string | number> } | null>(null);
  const [pvLoading, setPvLoading] = useState(false);
  const pvKey = baselines.map((b) => `${b.address}@${b.lat},${b.lon}`).join("|");
  useEffect(() => {
    const items = baselines
      .filter((b) => b.lat != null && b.lon != null)
      .map((b) => ({
        lat: b.lat!, lon: b.lon!, address: b.address,
        footprint_m2: buildings.find((x) => x.address === b.address)?.footprint_m2 ?? null,
      }));
    if (!items.length) { setPv(null); return; }
    let alive = true;
    setPvLoading(true);
    api.pvgisEstimate(items)
      .then((r) => { if (alive) setPv(r); })
      .catch(() => { if (alive) setPv(null); })
      .finally(() => { if (alive) setPvLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pvKey]);
  /* Share of each roof covered with panels, set per building with a slider
     (default 80%, the viewer's assumption). PVGIS output is linear in system
     size, so the building's specific yield (kWh per kWp) is simply rescaled:
     production = footprint × coverage × 0.2 kWp/m² × kWh/kWp. */
  const PV_DEFAULT_COV = 80;
  const [pvCov, setPvCov] = useState<Record<string, number>>({});
  const pvRows = (pv?.results ?? []).map((r, i) => {
    const key = `${r.address ?? "b"}#${i}`;
    const cov = pvCov[key] ?? PV_DEFAULT_COV;
    if (r.annual_kwh == null || !r.kWp) return { ...r, key, cov };
    const footprint = buildings.find((x) => x.address === r.address)?.footprint_m2 ?? (r.roof_area_m2 ?? 0) / 0.8;
    const yieldPerKwp = r.specific_kwh_kwp ?? r.annual_kwh / r.kWp;
    const roof = footprint * cov / 100;
    const kWp = Math.round(roof * 0.2 * 10) / 10;
    return { ...r, key, cov, roof_area_m2: Math.round(roof), kWp, annual_kwh: kWp * yieldPerKwp };
  });
  const pvOk = pvRows.filter((r) => r.annual_kwh != null);
  const pvTotalKwh = pvOk.reduce((s, r) => s + (r.annual_kwh ?? 0), 0);
  const pvTotalKwp = pvOk.reduce((s, r) => s + (r.kWp ?? 0), 0);

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
        centre = { text: ll(lat, lon), what: t("centre of drawn area") };
      }
    }
    if (!centre && project.currentBbox) {
      const bb = project.currentBbox;
      centre = { text: ll((bb.north + bb.south) / 2, (bb.east + bb.west) / 2), what: t("centre of selected area") };
    }
    if (!centre && project.lat != null && project.lon != null) {
      centre = { text: ll(project.lat, project.lon), what: t("project location") };
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
        ? t("{name} +{n} more", { name: ranked[0]![0], n: ranked.length - 1 })
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
    return t("Unknown location");
  }, [project.district, project.neighborhoodName, project.selectionPolygon, project.bboxRows,
      project.currentBbox, project.locationLabel, project.address, project.lat, project.lon, lang]);

  /* ── City climate target (Gothenburg: −30% by 2030) ────────────────────────
     Same helper Step 4 uses, so the report can't contradict what was shown when
     the packages were simulated. */
  const climateGoal = useMemo(() => climateGoalFor(project.city, project.country), [project.city, project.country]);
  const staged = project.stagedPlan?.result ?? null;
  const stagedSettings = project.stagedPlan?.settings ?? null;
  // simResults[].energyUse is a PORTFOLIO AVERAGE across buildings, so the goal
  // panel must measure it against the portfolio-average baseline — not
  // baselines[0] (one building), which made the panel disagree with the
  // per-building table on multi-building projects.
  const climateBaselineEU = baselines.length
    ? baselines.reduce((s, b) => s + b.energyUse, 0) / baselines.length
    : baselineEU;
  const goalAssessment = useMemo(() => {
    if (!climateGoal || !isScorable(climateGoal) || !climateBaselineEU || !simResults.length) return null;
    return assessAgainstGoal(
      climateGoal,
      climateBaselineEU,
      simResults.map((r) => ({ label: t("Package {n}", { n: r.packageIndex }), energyUse: r.energyUse })),
    );
  }, [climateGoal, climateBaselineEU, simResults, lang]);

  // Per-building goal detail — each building's own target and how each package
  // lands against it. Uses the per-building results kept in renovationCalcPackages.
  const buildingGoal = useMemo(() => {
    if (!climateGoal || !isScorable(climateGoal)) return null;
    return assessBuildingsAgainstGoal(climateGoal, project.renovationCalcPackages ?? []);
  }, [climateGoal, project.renovationCalcPackages]);

  // Rating goal (EPC band) - same estimate Step 4 shows.
  const ratingGoal = useMemo(() => {
    if (climateGoal?.kind !== "rating") return null;
    const src = (project.bboxRows ?? []).length
      ? project.bboxRows.map((b) => ({ address: b.address, lat: b.lat, lon: b.lon, sap: b.sap ?? null, band: b.epc_class }))
      : [...(project.lookedUpBuildings ?? []), ...(project.lookedUpBuilding ? [project.lookedUpBuilding] : [])]
          .map((b) => ({ address: b.address ?? "", lat: b.lat, lon: b.lon, sap: b.sap ?? null, band: b.eclass }));
    return assessRating(climateGoal, project.renovationCalcPackages ?? [], src);
  }, [climateGoal, project.renovationCalcPackages, project.bboxRows, project.lookedUpBuildings, project.lookedUpBuilding]);

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
      label: b.address || t("Building"),
      parts: [
        { key: "heating", value: b.heating ?? 0 },
        { key: "dhw", value: b.dhw || Math.max(0, (b.energyUse ?? 0) - (b.heating ?? 0) - (b.cooling ?? 0) - (b.lighting ?? 0) - (b.equipment ?? 0)) },
        { key: "cooling", value: b.cooling ?? 0 },
        // Sweden leaves household/business electricity out (utils/energyTotals).
        ...(excludesHouseholdElectricity(project.country) ? [] : [
          { key: "lighting", value: b.lighting ?? 0 },
          { key: "equipment", value: b.equipment ?? 0 },
        ]),
      ],
    }));
    const present = END_USE_STYLE.map((e) => e.key)
      .filter((k) => rows.some((r) => (r.parts.find((p) => p.key === k)?.value ?? 0) > 0));
    return chartLegend(present) + svgStackedBars(rows, "kWh/m²·yr", theme);
  };

  const packageChartHtml = (theme: ChartTheme) => {
    if (!simResults.length) return "";
    const rows = [
      ...(climateBaselineEU ? [{ label: t("Baseline (as-built)"), value: climateBaselineEU, highlight: true }] : []),
      ...simResults.map((r) => ({ label: t("Package {n}", { n: r.packageIndex }), value: r.energyUse })),
    ];
    return svgCompareBars(rows, "kWh/m²·yr", theme);
  };

  const hasResults = simResults.length > 0;
  const hasBaseline = baselines.length > 0;

  /* ── Chart data ── */
  const chartData = useMemo(() => {
    const top = simResults.slice(0, 8);
    // Colour says what the bar MEANS, not its rank: green = best package,
    // blue = also saves energy, red = uses MORE than the as-built baseline.
    // (Ranks 3+ used the pink brand tint, which read as neither.)
    const base = climateBaselineEU;
    return [
      { name: t("Baseline"), energyUse: Math.round(base * 10) / 10, saving: 0, fill: "#94a3b8" },
      ...top.map((r, i) => ({
        name: t("Pkg {n}", { n: r.packageIndex }),
        energyUse: r.energyUse,
        saving: r.saving,
        fill: base && r.energyUse > base ? "#E2483B" : i === 0 ? "#2FB477" : "#4A90E2",
      })),
    ];
  }, [simResults, climateBaselineEU, lang]);

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
    const sek = (n: number) => isUK ? fmtGBP(n) : Math.round(n).toLocaleString(numLocale) + " SEK";
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
  <h2>${t("What was analysed")}</h2>
  <table><thead><tr><th>${t("Stage")}</th><th>${t("Buildings / packages")}</th><th>${t("What happened")}</th></tr></thead><tbody>
    <tr><td>${t("Step 2 — selection")}</td><td><b>${selectedCount}</b> ${selectedCount === 1 ? t("building") : t("buildings")}</td>
        <td>${t("Selected on the map and reviewed against the available data.")}</td></tr>
    ${prioritisedCount ? `<tr><td>${t("Step 2 — prioritisation")}</td><td>${t("<b>{n}</b> flagged", { n: prioritisedCount })}</td>
        <td>${t("Ranked by energy performance, façade condition and building characteristics.")}</td></tr>` : ""}
    <tr><td>${t("Step 3 — baseline")}</td><td>${t("<b>{n}</b> simulated", { n: simulatedCount })}</td>
        <td>${t("As-built performance from EnergyPlus, the baseline everything is measured against.")}</td></tr>
    <tr><td>${t("Step 4 — packages")}</td><td><b>${packagesTested}</b> ${packagesTested === 1 ? t("package") : t("packages")}</td>
        <td>${t("Each renovation package simulated against that baseline for energy, cost and carbon.")}</td></tr>
  </tbody></table>`;

    const baselineChart = baselines.length
      ? `<p class="sub">${t("Energy use by end use, kWh/m²·yr.")}</p>${baselineChartHtml(PRINT_THEME)}`
      : "";
    const packageChart = simResults.length
      ? `<p class="sub">${t("Total energy after renovation, kWh/m²·yr — baseline in grey.")}</p>${packageChartHtml(PRINT_THEME)}`
      : "";

    const facadeEntries = Object.entries(project.facadeDefects ?? {})
      .filter(([, sum]) => sum && sum.imageCount > 0);
    // The key is a cadastral/address hash, so prefer the label saved with the
    // summary; the key is only a last resort so a row is never nameless.
    const buildingLabelFor = (key: string) =>
      project.facadeDefects?.[key]?.label || key;

    const facadeReport = facadeEntries.length === 0 ? "" : [
      "<h2>" + t("Facade Defect Detection") + "</h2>",
      '<p class="sub">' + t("Facade photos analysed by the MBDD2025 defect detector with an AI vision second opinion.") + " "
        + t("Boxes and labels are drawn on the images exactly as reviewed in Step 2.") + " "
        + t("Detection is a screening aid, not a structural survey.") + "</p>",
      "<table><thead><tr><th>" + t("Building") + "</th><th>" + t("Facade") + "</th><th>" + t("Photos") + "</th><th>" + t("Defects") + "</th><th>" + t("Breakdown") + "</th></tr></thead><tbody>",
      facadeEntries.map(([key, sum]) => {
        const label = buildingLabelFor(key);
        const orientations = FACADE_ORIENTATIONS.filter((o) => sum.byOrientation?.[o]?.imageCount);
        if (!orientations.length) {
          return "<tr><td>" + esc(label) + '</td><td class="muted">' + t("not recorded per facade") + "</td><td>"
            + sum.imageCount + "</td><td>" + sum.defectCount + "</td><td>"
            + esc(breakdownText(sum.byClass)) + "</td></tr>";
        }
        return orientations.map((o, i) => {
          const os = sum.byOrientation![o]!;
          return "<tr>"
            + (i === 0 ? '<td rowspan="' + orientations.length + '">' + esc(label) + "</td>" : "")
            + "<td>" + t(FACADE_LABELS[o]) + "</td><td>" + os.imageCount + "</td><td>" + os.defectCount + "</td><td>"
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
                + '<div class="fac-cap"><b>' + t("{side} facade", { side: t(FACADE_LABELS[ph.orientation]) }) + "</b> — " + esc(ph.name) + "</div>"
                + '<img src="' + origin + ph.url + '" alt="' + esc(t("{side} facade of {building}", { side: t(FACADE_LABELS[ph.orientation]), building: buildingLabelFor(key) })) + '" />'
                + (dets.length
                    ? '<ol class="fac-list">' + dets.map((d) =>
                        "<li>" + esc(FACADE_DEFECT_LABELS[d.label] ? t(FACADE_DEFECT_LABELS[d.label]!) : d.label)
                        + " — " + t("{pct}% confidence", { pct: Math.round(d.score * 100) })
                        + (d.source === "ai" ? " " + t("(AI vision)") : " " + t("(ML model)"))
                        + (d.note ? " — " + esc(d.note) : "")
                        + "</li>").join("") + "</ol>"
                    : '<div class="fac-clean">' + t("No defects detected on this photo.") + "</div>")
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
        <div class="best-n">${t("Package {n}", { n: r.packageIndex })}${r.buildingLabel ? ` · ${esc(r.buildingLabel)}` : ` · ${t("all buildings")}`}</div>
        <table class="mat">
          <thead><tr><th>${t("Component")}</th><th>${t("Material / assembly")}</th><th>${t("U-value")}</th></tr></thead>
          <tbody>
            ${mats.length
              ? mats.map((m) => `<tr><td>${esc(t(m.component))}</td><td>${esc(m.desc)}${m.buildup ? `<br><span class="buildup">${esc(m.buildup)}</span>` : ""}</td><td>${m.u != null ? m.u.toFixed(2) + " W/m²K" : "—"}</td></tr>`).join("")
              : `<tr><td colspan="3" class="muted">${t("No component detail recorded for this package.")}</td></tr>`}
          </tbody>
        </table>
        <div class="kv">
          <span><b>${r.energyUse.toFixed(1)}</b> kWh/m²·yr</span>
          <span>${t("saves <b>{n}</b> kWh/m²·yr", { n: r.saving.toFixed(1) })}</span>
          <span><b>${money(r.cost)}</b></span>
          ${isBE ? "" : `<span><b>${Math.round(r.carbonSaving).toLocaleString(numLocale)}</b> ${t("kg CO₂e saved")}</span>`}
        </div>
      </div>`;
    };

    const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<title>${esc(project.projectName || t("Renovation Report"))}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Inter, system-ui, sans-serif; color:#0f172a; margin:0; font-size:11pt; line-height:1.5; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  h1 { font-size:20pt; margin:0 0 4px; }
  h2 { font-size:12pt; margin:22px 0 8px; padding-bottom:4px; border-bottom:2px solid #8B6EAD; }
  .sub { color:#64748b; font-size:10pt; margin-bottom:4px; }
  table { width:100%; border-collapse:collapse; font-size:9.5pt; margin-top:6px; }
  th { text-align:left; background:#f1f5f9; padding:5px 7px; font-size:8.5pt; text-transform:uppercase; letter-spacing:.04em; color:#475569; }
  td { padding:5px 7px; border-bottom:1px solid #e2e8f0; vertical-align:top; }
  .muted { color:#94a3b8; font-style:italic; }
  .best { border:1px solid #cbd5e1; border-left:4px solid #8B6EAD; border-radius:6px; padding:10px 13px; margin-bottom:10px; page-break-inside:avoid; }
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
  .cover-kicker { font-size:9pt; letter-spacing:2px; text-transform:uppercase; color:#8B6EAD; font-weight:800; }
  .cover-title { font-size:23pt; font-weight:800; margin:5px 0 9px; line-height:1.12; }
  .cover-meta { font-size:9.5pt; color:#94a3b8; }
  .prepared { font-size:9pt; color:#475569; margin:0 0 18px; }
  .prepared b { color:#0f172a; }
  .prepared .lbl { text-transform:uppercase; letter-spacing:.08em; font-size:7.5pt; color:#94a3b8; margin-right:8px; }
</style></head><body>
  <div class="no-print">
    <button onclick="window.print()" style="padding:9px 18px;font-size:13px;font-weight:700;border-radius:8px;border:1px solid #8B6EAD;background:#f2eef6;cursor:pointer">
      ${t("Save as PDF")}
    </button>
  </div>

  <div class="cover">
    <div class="cover-logos">
      <img src="${origin}/CTH_new_logo_white.png" alt="Chalmers University of Technology" />
      <img src="${origin}/CNL_new_logo_white.png" alt="Chalmers Next Labs" />
    </div>
    <div class="cover-kicker">${t("Building Renovation Analysis")}</div>
    <div class="cover-title">${esc(project.projectName || t("Renovation Report"))}</div>
    <div class="cover-meta">${esc(locationText)} · ${buildings.length} ${buildings.length !== 1 ? t("buildings") : t("building")} · ${esc(components.map((c) => t(c)).join(", ") || t("no components"))} · ${t("Generated")} ${new Date().toLocaleString(numLocale)}</div>
  </div>
  <div class="prepared"><span class="lbl">${t("Prepared by")}</span><b>Chalmers Next Labs</b> — ${esc(team)}</div>

  ${funnelBlock}

  <h2>${t("Baseline (as-built)")}</h2>
  <table><thead><tr><th>${t("Building")}</th><th>${t("Energy class")}</th><th>${t("Energy use")}</th><th>${t("Heating")}</th>${isUK ? `<th>${t("Gas per home")}</th>` : ""}</tr></thead><tbody>
  ${baselines.length ? baselines.map((b) => `<tr>
      <td>${esc(b.address)}</td><td>${esc(b.eClass ?? "—")}</td>
      <td>${b.energyUse.toFixed(1)} kWh/m²·yr</td><td>${b.heating.toFixed(1)} kWh/m²·yr</td>${isUK
        ? `<td>${b.totalGasKwh != null ? `${Math.round(b.totalGasKwh / Math.max(1, b.dwellings ?? 1)).toLocaleString("en-GB")} kWh/yr` : "—"}</td>` : ""}</tr>`).join("")
    : `<tr><td colspan="${isUK ? 5 : 4}" class="muted">${t("No baseline simulation recorded.")}</td></tr>`}
  </tbody></table>
  ${baselineChart}

  ${pvOk.length ? `
  <h2>${t("Solar production potential (rooftop PV)")}</h2>
  <p class="sub">${t("About <b>{mwh} MWh of electricity a year</b> from {kwp} kWp on the roofs of {n} {buildings}.", { mwh: (pvTotalKwh / 1000).toLocaleString("sv-SE", { maximumFractionDigits: 1 }), kwp: pvTotalKwp.toLocaleString("sv-SE", { maximumFractionDigits: 1 }), n: pvOk.length, buildings: pvOk.length === 1 ? t("building") : t("buildings") })}</p>
  <table><thead><tr><th>${t("Building")}</th><th>${t("Roof covered")}</th><th>${t("Panel area")}</th><th>${t("System size")}</th><th>${t("Annual production")}</th></tr></thead><tbody>
  ${pvOk.map((r) => `<tr><td>${esc(r.address ?? t("Building"))}</td><td>${r.cov}%</td><td>${r.roof_area_m2?.toLocaleString("sv-SE")} m²</td><td>${r.kWp?.toLocaleString("sv-SE")} kWp</td><td><b>${Math.round(r.annual_kwh!).toLocaleString("sv-SE")} kWh/yr</b></td></tr>`).join("")}
  ${pvOk.length > 1 ? `<tr><td><b>${t("Total")}</b></td><td></td><td>${pvOk.reduce((s, r) => s + (r.roof_area_m2 ?? 0), 0).toLocaleString("sv-SE")} m²</td><td>${pvTotalKwp.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kWp</td><td><b>${Math.round(pvTotalKwh).toLocaleString("sv-SE")} kWh/yr</b></td></tr>` : ""}
  </tbody></table>
  <p class="sub"><b>${t("Assumptions")}</b></p>
  <ul class="muted">${PV_ASSUMPTIONS.map((a) => `<li>${esc(t(a))}</li>`).join("")}</ul>` : ""}

  ${facadeReport}

  <h2>${t("Renovation packages tested")}</h2>
  <p class="sub">${t("Every package below was simulated against the as-built baseline above, on the same buildings.")}</p>
  ${packageChart}

  ${perBuildingPicks.length ? `
  <h2>${t("Chosen package per building")}</h2>
  <p class="sub">${t("Selected building by building in Step 4 — where a portfolio-wide pick would average over real differences between them.")}</p>
  <table><thead><tr><th>${t("Building")}</th><th>${t("Chosen package")}</th><th>${t("Baseline")}</th><th>${t("After")}</th><th>${t("Reduction")}</th></tr></thead><tbody>
  ${perBuildingPicks.map((r) => {
    const pct = r.after != null && r.baseline ? Math.round(((r.after - r.baseline) / r.baseline) * 100) : null;
    return `<tr><td>${esc(r.address)}</td><td>${esc(r.pkg)}</td>
      <td>${r.baseline.toFixed(1)}</td><td>${r.after == null ? "—" : r.after.toFixed(1)}</td>
      <td>${pct == null ? "—" : `${pct}%`}</td></tr>`;
  }).join("")}
  </tbody></table>
  <p class="sub" style="margin-top:4px">${t("Energy in kWh/m²·yr.")}</p>` : ""}

  <h2>${t("Recommended packages — and what they are made of")}</h2>
  ${bestBlock(t("Best energy saving"), bestEnergy, t("largest reduction in energy use"))}
  ${bestBlock(t("Lowest cost"), bestCost, t("cheapest to build"))}
  ${bestBlock(t("Lowest carbon"), bestCarbon, t("largest CO₂e saving"))}
  ${bestBlock(t("Best balanced"), bestBalanced, t("weighted 40% energy / 30% carbon / 30% cost"))}

  <h2>${t("All simulated packages")}</h2>
  <table><thead><tr><th>#</th><th>${t("Building")}</th><th>${t("Materials")}</th><th>${t("Energy")}</th><th>${t("Saving")}</th><th>${t("Cost")}</th><th>${t("CO₂e saved")}</th></tr></thead><tbody>
  ${simResults.length ? simResults.map((r) => `<tr>
      <td>${r.packageIndex}</td>
      <td>${esc(r.buildingLabel ?? t("all buildings"))}</td>
      <td>${esc(materialsOf(r).map((m) => `${t(m.component)}: ${m.buildup || m.desc}`).join("; ") || "—")}</td>
      <td>${r.energyUse.toFixed(1)}</td><td>${r.saving.toFixed(1)}</td>
      <td>${money(r.cost)}</td><td>${isBE ? "—" : Math.round(r.carbonSaving).toLocaleString(numLocale)}</td></tr>`).join("")
    : `<tr><td colspan="7" class="muted">${t("No packages simulated.")}</td></tr>`}
  </tbody></table>

  ${goalAssessment ? `
  <h2>${esc(goalTitle(goalAssessment.goal))}</h2>
  <p class="sub">${esc(goalStatement(goalAssessment.goal))} ${t("Official target:")} ${esc(t(goalAssessment.goal.basis))} ${t("Source:")} ${esc(goalAssessment.goal.source)}${goalAssessment.goal.sourceUrl ? ` (${esc(goalAssessment.goal.sourceUrl)})` : ""}.</p>
  <p style="font-weight:700;margin:2px 0 6px;color:${goalAssessment.achievers.length ? "#15803d" : "#b45309"}">
    ${goalAssessment.achievers.length
      ? `✓ ${t("{pkg} reaches −{pct}%, meeting the target", { pkg: esc(goalAssessment.achievers[0]!.label), pct: goalAssessment.achievers[0]!.reductionPct!.toFixed(0) })}${goalAssessment.achievers.length > 1 ? ` ${t("({n} packages meet it)", { n: goalAssessment.achievers.length })}` : ""}.`
      : goalAssessment.closest && goalAssessment.closest.reductionPct != null
        ? `${t("No package reaches the −{target}% target yet — closest is {pkg} at {pct}", { target: goalAssessment.goal.reductionPct, pkg: esc(goalAssessment.closest.label), pct: `${goalAssessment.closest.reductionPct >= 0 ? "−" : "+"}${Math.abs(goalAssessment.closest.reductionPct).toFixed(0)}%` })}${goalAssessment.closest.reductionPct < 0 ? ` ${t("(worse than baseline)")}` : ""}.`
        : ""}
  </p>
  <table><thead><tr><th>${t("Package")}</th><th>${t("Energy use")}</th><th>${t("Reduction vs baseline")}</th><th>${t("Meets −{pct}% target", { pct: goalAssessment.goal.reductionPct })}</th></tr></thead><tbody>
  ${goalAssessment.rows.map((r) => `<tr>
      <td>${esc(r.label)}</td>
      <td>${r.energyUse.toFixed(1)} kWh/m²·yr</td>
      <td>${r.reductionPct == null ? "—" : `${r.reductionPct >= 0 ? "−" : "+"}${Math.abs(r.reductionPct).toFixed(0)}%`}</td>
      <td>${r.meets ? `✓ ${t("Yes")}` : t("No")}</td></tr>`).join("")}
  </tbody></table>
  ${buildingGoal ? `
  <h3 style="font-size:10.5pt;margin:14px 0 4px">${t("Per-building goal")} — ${buildingGoal.goal.kind === "absolute" ? t("every building to ≤ {kwh} kWh/m²·yr", { kwh: buildingGoal.goal.targetKwhM2 ?? "" }) : t("each building's own −{pct}% target", { pct: buildingGoal.goal.reductionPct })}</h3>
  <table><thead><tr><th>${t("Building")}</th><th>${t("Baseline")}</th><th>${buildingGoal.goal.kind === "absolute" ? t("Goal ≤ {kwh}", { kwh: buildingGoal.goal.targetKwhM2 ?? "" }) : t("Goal −{pct}%", { pct: buildingGoal.goal.reductionPct })}</th>${buildingGoal.columns.map((c) => `<th>${esc(c.label)}<br><span style="font-weight:400;color:#64748b">${t("{met}/{total} meet", { met: c.met, total: c.total })}</span></th>`).join("")}</tr></thead><tbody>
  ${buildingGoal.rows.map((r) => `<tr>
      <td>${esc(r.address)}</td>
      <td>${r.baselineEnergy.toFixed(0)}</td>
      <td>≤ ${r.targetEnergy.toFixed(0)}</td>
      ${r.cells.map((cell) => {
        const met = cell.tier === "meets" || cell.tier === "exceeds";
        const col = met ? "#15803d" : cell.tier === "below" ? "#b45309" : cell.tier === "worse" ? "#b91c1c" : "#64748b";
        const pct = cell.reductionPct == null ? "—"
          : cell.tier === "worse" ? `+${Math.abs(Math.round(cell.reductionPct))}%`
          : cell.tier === "below" ? `−${Math.round(cell.reductionPct)}% (${t("{pp}pp short", { pp: requiredPct(buildingGoal.goal, r.baselineEnergy) - Math.round(cell.reductionPct) })})`
          : `−${Math.round(cell.reductionPct)}%`;
        return `<td style="color:${col}">${cell.energy == null ? "—" : cell.energy.toFixed(0)}${met ? " ✓" : ""}<br><span style="font-size:8pt">${pct}</span></td>`;
      }).join("")}</tr>`).join("")}
  </tbody></table>
  <p class="sub" style="margin-top:4px">${t("Values in kWh/m²·yr · pp = percentage points short of the building's target.")}</p>` : ""}` : ""}
  ${climateGoal && !isScorable(climateGoal) ? `
  <h2>${esc(goalTitle(climateGoal))}</h2>
  <p class="sub">${esc(goalStatement(climateGoal))} ${climateGoal.headline ? `${t("Headline goal:")} ${esc(t(climateGoal.headline))}. ` : ""}${t("Official target:")} ${esc(t(climateGoal.basis))} ${t("Source:")} ${esc(climateGoal.source)}${climateGoal.sourceUrl ? ` (${esc(climateGoal.sourceUrl)})` : ""}.</p>
  ${ratingGoal ? `
  <p style="font-weight:700;margin:2px 0 6px">${t("Buildings at band {band} or better: {met}/{total} today", { band: esc(climateGoal.targetRating ?? ""), met: ratingGoal.metToday, total: ratingGoal.rows.length })}${ratingGoal.columns.map((c) => ` · ${esc(c.label)}: ${c.met}/${c.total} ${t("(est.)")}`).join("")}</p>
  <table><thead><tr><th>${t("Building")}</th><th>${t("Today (certificate)")}</th>${ratingGoal.columns.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>
  ${ratingGoal.rows.map((r) => `<tr><td>${esc(r.address)}${r.from === "band" ? " *" : ""}</td><td>${r.nowBand} (SAP ${r.nowSap})</td>${r.cells.map((c) =>
      `<td style="color:${c.meets ? "#15803d" : "#b45309"}">${c.band ? `${c.band} (SAP ${c.sap})${c.meets ? " ✓" : ""}` : "—"}</td>`).join("")}</tr>`).join("")}
  </tbody></table>
  <p class="sub" style="margin-top:4px">${t("Package bands are estimates: each building's certificate SAP, moved by the simulated change in fuel use (SAP 2012 energy-cost factor).")}${ratingGoal.rows.some((r) => r.from === "band") ? ` * ${t("No certificate SAP — starts from the middle of its band.")}` : ""}</p>` : ""}` : ""}
  ${staged ? `
  <h2>${t("Staged plan")}</h2>
  <p class="sub">${t("{y} years from {s}, budget {b}. {f} of {m} measures fit ({c} of {p}).", { y: stagedSettings!.years, s: stagedSettings!.startYear, b: stagedMoney(stagedSettings!.budget, staged.currency), f: staged.fitted, m: staged.measures, c: stagedMoney(staged.fittedCost, staged.currency), p: stagedMoney(staged.planCost, staged.currency) })}${staged.robustness ? ` ${esc(staged.robustness)}` : ""}</p>
  ${staged.milestones.length ? `<ul style="margin:2px 0 8px;padding-left:18px">${staged.milestones.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
  <table><thead><tr><th>${t("Year")}</th><th>${t("Spend")}</th><th>${t("Spent so far / budget released")}</th><th>${t("Measures done this year")}</th><th>${t("Energy bills per year")}</th><th>${t("CO₂ per year (t)")}</th></tr></thead><tbody>
  ${staged.rows.map((r) => `<tr${r.final ? ' style="font-weight:700"' : ""}><td>${r.final ? `${r.year} (${t("after the plan")})` : r.year}</td><td>${r.spend ? stagedMoney(r.spend, staged.currency) : "–"}</td><td>${r.final ? "" : `${stagedMoney(r.cum, staged.currency)} / ${stagedMoney(r.budgetCum, staged.currency)}`}</td><td>${esc(r.done)}</td><td>${stagedMoney(r.bill, staged.currency)}</td><td>${r.co2T.toFixed(1)}</td></tr>`).join("")}
  </tbody></table>
  ${staged.unscheduled.length ? `<p class="sub" style="color:#b91c1c">${t("Does not fit in the budget")}: ${esc(staged.unscheduled.join(" · "))}</p>` : ""}
  ${staged.done.length ? `<p class="sub">${t("Already done (kept fixed)")}: ${esc(staged.done.join(" · "))}</p>` : ""}` : ""}

  <div class="foot">
    ${t("Energy from EnergyPlus (EPSM) single-zone shoebox simulation")} · ${isBE
      ? `${t("as-built and refurbished U-values from TABULA Belgium (VITO, EPISCOPE)")} · ${t("weather: {station} TMYx", { station: isLiege ? "Liège-Bierset" : "Uccle" })} ·
    ${isLiege
      ? t("footprints from the PICC and heights from Bâtiments 3D LoD1 (SPW, CC BY 4.0), addresses from BeST (BOSA, CC BY 4.0)")
      : t("footprints and addresses from UrbIS (paradigm.brussels, CC0), heights from UrbIS 3D")}; ${t("construction period sampled from Statbel's building stock unless OpenStreetMap records a year.")}
    ${t("Belgium publishes no open per-building EPCs, so there is no baseline energy class.")}
    ${t("No open Belgian retrofit cost or carbon data is wired in yet, so packages are not costed.")}
    ${t("Heating is ideal loads (heat delivered, not fuel); the model is not yet calibrated against Belgian EPB certificate statistics.")}`
      : isUK
      ? `${t("as-built and refurbished U-values from TABULA GB (BRE, EPISCOPE)")} · ${t("weather: {station} TMYx", { station: "Doncaster/Sheffield" })} ·
    ${esc(UK_COST_CARBON_SOURCE_NOTE)}
    ${t("Baseline energy class, SAP, floor area and heating from the MHCLG EPC register (OGL v3.0), matched to buildings via OS Open UPRN; buildings without a certificate carry a band estimated from the English Housing Survey 2024-25.")}
    ${t("Hot water uses the tool's Swedish Sveby draw profile, not a UK SAP assumption.")}`
      : `${t("U-values per EN ISO 6946")} ·
    ${t("cost from Wikells Sektionsfakta")} · ${t("embodied carbon A1–A5 (production, transport, installation incl. waste) from Boverket Klimatdatabas; replacements and end-of-life not included")} ·
    ${project.supplierDiscountPct ? `${t("All material costs are net of a {pct}% supplier discount entered in Step 4.", { pct: project.supplierDiscountPct })} ` : ""}${t("Costs are installed capex (materials + labour); they exclude energy, maintenance and replacement.")}
    ${t("baseline energy class from Boverket EPC.")} ${t("Homes use Sveby 2.0 standard use: hot water as reported in the building's energy declaration, otherwise Sveby's 21 kWh/m²·yr.")}
    ${t("Household and business electricity is simulated for its heat but, as in Swedish energy declarations, not counted in the totals or shown.")}`} ${t("Cooling reads 0 because EPSM's end-use table carries only electricity and district heating; the hourly trace does show ideal-loads cooling, which a single-zone model with no openable windows overstates.")}
  </div>
  <script>window.addEventListener('load',function(){setTimeout(function(){try{window.print();}catch(e){}},400);});</script>
</body></html>`;

    // Render via a Blob URL rather than window.open("") + document.write — the
    // latter renders a blank page in modern browsers. A Blob URL loads as a real
    // document; the inline script above opens the print / Save-as-PDF dialog once
    // it has loaded, and the "Save as PDF" button in the page is the fallback.
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const w = window.open(url, "_blank");
    if (!w) { alert(t("Allow pop-ups for this site to generate the PDF."));URL.revokeObjectURL(url); return; }
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
          <span style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: 1 }}>{label}</span>
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 8 }}>{t("Package {n}", { n: result.packageIndex })}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {Object.entries(result.components).map(([comp, item]) => (
            <div key={comp} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: compColor(comp), flexShrink: 0, alignSelf: "center" }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", flexShrink: 0 }}>{compLabel(comp)}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", flex: 1, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={layerText(item) || item.description}>
                {item.description || item.code}
              </span>
              {item.uValue != null && <Badge color={compColor(comp)}>U {item.uValue.toFixed(2)}</Badge>}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.07)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8 }}>{t("Energy use")}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#E8880C" }}>{kwh(result.energyUse)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8 }}>{t("Saving")}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#2FB477" }}>−{kwh(result.saving)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8 }}>{t("CO₂e saved")}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#4A90E2" }}>{co2Saved(result.carbonSaving)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8 }}>{t("Material cost")}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>{money(result.cost)}</div>
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
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, color: "rgba(255,255,255,0.3)", marginBottom: 6, textTransform: "uppercase" }}>
            {t("Renovation Planning · Step 5")}
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#fff", margin: "0 0 6px" }}>
            {project.projectName || t("Renovation Report")}
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: 0 }}>
            {t("Everything from Steps 1-4, ready to share or save as PDF.")}
          </p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", margin: "4px 0 0" }}>
            {locationText} · {buildings.length} {buildings.length !== 1 ? t("buildings") : t("building")} · {components.length} {components.length !== 1 ? t("components") : t("component")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            onClick={downloadPdf}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(139,110,173,0.55)",
              background: "rgba(139,110,173,0.16)", color: "#8B6EAD",
              fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}
          >
            <Download size={14} /> {t("Download PDF")}
          </button>
          <button
            onClick={downloadReport}
            title={t("Raw data for further analysis")}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
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
            {t("No simulation results yet. Go back to Step 4 and press \"Simulate\" on a package to generate its results.")}
          </p>
        </div>
      )}

      {/* ── 1. Project Summary ── */}
      <Card>
        <SectionTitle icon={<FileText size={15} color="var(--brand)" />} title={t("Project Summary")} />
        {/* The funnel, in the tool's own order — how many buildings were selected,
            how many were prioritised, how many simulated, how many packages tested.
            Without it the rest of the report is a pile of tables with no thread. */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {[
            { n: selectedCount, label: selectedCount === 1 ? t("building selected") : t("buildings selected"), step: t("Step {n}", { n: 2 }) },
            ...(prioritisedCount ? [{ n: prioritisedCount, label: t("flagged as priorities"), step: t("Step {n}", { n: 2 }) }] : []),
            { n: baselines.length, label: t("baseline simulated"), step: t("Step {n}", { n: 3 }) },
            { n: simResults.length, label: simResults.length === 1 ? t("package tested") : t("packages tested"), step: t("Step {n}", { n: 4 }) },
          ].map((f, i) => (
            <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {i > 0 && <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 14 }}>→</span>}
              <div style={{ borderRadius: 10, padding: "8px 14px", background: "rgba(139,110,173,0.07)", border: "1px solid rgba(139,110,173,0.22)" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: "#8B6EAD", lineHeight: 1.1 }}>{f.n}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{f.label}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{f.step}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[
            { label: t("Project type"),   value: project.projectType ? t(project.projectType) : "—" },
            { label: t("Scale"),          value: project.scale ? t(project.scale) : "—" },
            { label: t("Location"),       value: locationText },
            { label: t("Components"),     value: components.length > 0 ? components.map((c) => t(c)).join(", ") : "—" },
            { label: t("Systems in scope"), value: project.systemsInScope.length > 0 ? project.systemsInScope.map((s) => t(s)).join(", ") : "—" },
            { label: t("KPIs"),           value: project.selectedKpis.length > 0 ? project.selectedKpis.map((k) => t(k)).join(", ") : "—" },
          ].map(r => (
            <div key={r.label} style={{ borderRadius: 8, padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>{r.label}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.8)", lineHeight: 1.4 }}>{r.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── 2. Buildings ── */}
      {buildings.length > 0 && (
        <Card>
          <SectionTitle icon={<Building2 size={15} color="#8B6EAD" />} title={t("Buildings")} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {buildings.map((b, i) => {
              const bl = baselines[i];
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr repeat(4, auto)", gap: 12, alignItems: "center", padding: "10px 14px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{b.address ?? t("Building {n}", { n: i + 1 })}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{project.country !== "Sweden" ? buildingUseLabel(b.use_cat) : (b.use_cat ?? "—")} · {b.year ?? "—"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>{t("Area")}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{b.area_atemp ? `${Math.round(b.area_atemp).toLocaleString(numLocale)} m²` : "—"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>{isUK && !b.has_epc && b.eclass ? t("Energy class (est.)") : t("Energy class")}</div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#E8880C" }}>{b.eclass ?? "—"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>{t("EPSM baseline")}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: bl ? "#E8880C" : "rgba(255,255,255,0.25)" }}>{bl ? kwh(bl.energyUse) : "—"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>{t("Baseline status")}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: bl ? "#2FB477" : "rgba(255,255,255,0.25)" }}>{bl ? `✓ ${t("Done")}` : t("Pending")}</div>
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
          <SectionTitle icon={<Zap size={15} color="#E8880C" />} title={t("Baseline Energy Performance")} />
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: "0 0 12px" }}>
            {t("As-built energy use by end use, kWh/m²·yr — the baseline every package is measured against.")}
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
          <SectionTitle icon={<ScanSearch size={15} color="#B8A3D0" />} title={t("Facade Condition")} />
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: "0 0 12px" }}>
            {t("Photos analysed by the MBDD2025 defect detector with an AI vision second opinion — a screening aid, not a structural survey.")}
          </p>
          {facadeEntries.map(([key, sum]) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "#fff" }}>{sum.label || key}</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                  {sum.imageCount} {sum.imageCount === 1 ? t("photo") : t("photos")} · {sum.defectCount} {sum.defectCount === 1 ? t("defect") : t("defects")}
                </span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>{breakdownText(sum.byClass)}</span>
              </div>
              {(sum.photos ?? []).length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                  {(sum.photos ?? []).map((ph) => (
                    <div key={ph.id} style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}>
                      <img src={ph.url} alt={t("{side} facade of {building}", { side: t(FACADE_LABELS[ph.orientation]), building: sum.label || key })}
                           style={{ display: "block", width: "100%", height: "auto" }} />
                      <div style={{ padding: "6px 9px" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
                          {t("{side} facade", { side: t(FACADE_LABELS[ph.orientation]) })}
                        </div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                          {ph.detections.length
                            ? ph.detections.map((d) => `${FACADE_DEFECT_LABELS[d.label] ? t(FACADE_DEFECT_LABELS[d.label]!) : d.label} ${Math.round(d.score * 100)}%`).join(" · ")
                            : t("No defects detected")}
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
          <SectionTitle icon={<Package size={15} color="#E8880C" />} title={t("Materials Selected for Testing")} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(materials).filter(([, codes]) => codes.length > 0).map(([comp, codes]) => (
              <div key={comp} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: COMP_COLORS[comp] ?? "var(--brand)", flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", minWidth: 140 }}>{t(comp)}</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, flex: 1 }}>
                  {codes.map(c => <Badge key={c} color={COMP_COLORS[comp] ?? "var(--brand)"}>{c}</Badge>)}
                </div>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>{codes.length} {codes.length !== 1 ? t("options") : t("option")}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", margin: "10px 0 0" }}>
            {simResults.length} {simResults.length !== 1 ? t("packages") : t("package")} {t("simulated (cartesian product of above selections)")}
          </p>
        </Card>
      )}

      {/* ── 4. Energy chart ── */}
      {hasResults && (
        <Card>
          <SectionTitle icon={<Zap size={15} color="#E8880C" />} title={t("Energy Use Comparison")} />
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: "0 0 16px" }}>
            {t("Top {n} packages vs as-built baseline ({kwh})", { n: Math.min(simResults.length, 8), kwh: kwh(Math.round(climateBaselineEU * 10) / 10) })}
            {" · "}<span style={{ color: "#2FB477" }}>■</span> {t("best")}
            {" "}<span style={{ color: "#4A90E2" }}>■</span> {t("saves energy")}
            {" "}<span style={{ color: "#E2483B" }}>■</span> {t("uses more than today")}
          </p>
          {/* Every package, matching the printed report exactly; the interactive
              chart below shows the top few with tooltips. */}
          <div dangerouslySetInnerHTML={{ __html: packageChartHtml(SCREEN_THEME) }} style={{ marginBottom: 14 }} />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barSize={28}>
              <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }} axisLine={false} tickLine={false} unit=" kWh" />
              <Tooltip
                cursor={{ fill: "rgba(148,163,184,0.15)" }}
                contentStyle={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#fff", fontWeight: 600 }}
                itemStyle={{ color: "#fff" }}
                formatter={(v: number) => [`${v} kWh/m²·yr`]}
              />
              <ReferenceLine y={climateBaselineEU} stroke="rgba(226,72,59,0.5)" strokeDasharray="4 3" label={{ value: t("Baseline"), fill: "rgba(226,72,59,0.6)", fontSize: 11 }} />
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
          <SectionTitle icon={<Building2 size={15} color="#8B6EAD" />} title={t("Chosen Package per Building")} />
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: "0 0 10px" }}>
            {t("Selected building by building in Step 4 — a single portfolio-wide pick would average over real differences between them.")}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {perBuildingPicks.map((r) => {
              const pct = r.after != null && r.baseline ? Math.round(((r.after - r.baseline) / r.baseline) * 100) : null;
              return (
                <div key={r.address} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                  padding: "8px 12px", borderRadius: 9, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#fff", minWidth: 160 }}>{r.address}</span>
                  <span style={{ fontSize: 12, color: "#8B6EAD", flex: 1 }}>{r.pkg}</span>
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                    {r.baseline.toFixed(1)} → {r.after == null ? "—" : r.after.toFixed(1)} kWh/m²·yr
                  </span>
                  {pct != null && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: pct < 0 ? "#2FB477" : "#E2483B" }}>{pct}%</span>
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
          <SectionTitle icon={<Award size={15} color="#2FB477" />} title={t("Recommendations")} />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {bestEnergy  && <PackageCard result={bestEnergy}   label={t("Best energy saving")}  accent="#2FB477" icon={<Zap size={13} color="#2FB477" />} />}
            {bestCarbon  && bestCarbon.packageIndex !== bestEnergy?.packageIndex  && <PackageCard result={bestCarbon}  label={t("Lowest carbon")}      accent="#4A90E2" icon={<Leaf size={13} color="#4A90E2" />} />}
            {bestCost    && bestCost.packageIndex !== bestEnergy?.packageIndex    && <PackageCard result={bestCost}    label={t("Lowest cost")}        accent="#E8880C" icon={<DollarSign size={13} color="#E8880C" />} />}
            {bestBalanced && bestBalanced.packageIndex !== bestEnergy?.packageIndex && <PackageCard result={bestBalanced} label={t("Best balanced")}    accent="#bfacd4" icon={<Award size={13} color="#bfacd4" />} />}
          </div>
        </div>
      )}

      {/* ── 6. Full results table ── */}
      {hasResults && (
        <Card>
          <SectionTitle icon={<TrendingDown size={15} color="#8B6EAD" />} title={t("All {n} Packages — Ranked by Energy Saving", { n: simResults.length })} />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "grid", gridTemplateColumns: "78px 1fr 130px 120px 120px 130px", gap: 10, padding: "3px 12px", marginBottom: 2 }}>
              {["Package", "Components", "Energy use", "Saving", "CO₂e saved", "Cost"].map((h, i) => (
                <span key={i} style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8, textAlign: i > 1 ? "right" : "left" }}>{t(h)}</span>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "78px 1fr 130px 120px 120px 130px", gap: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>—</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>{t("Baseline")}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.4)", textAlign: "right" }}>{kwh(baselineEU)}</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", textAlign: "right" }}>—</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", textAlign: "right" }}>—</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", textAlign: "right" }}>—</span>
            </div>
            {simResults.map((r, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "78px 1fr 130px 120px 120px 130px", gap: 10,
                padding: "9px 12px", borderRadius: 10, alignItems: "center",
                background: i === 0 ? "rgba(47,180,119,0.05)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${i === 0 ? "rgba(47,180,119,0.2)" : "rgba(255,255,255,0.05)"}`,
              }}>
                {/* The package's own number - the same one the chart and the cards use -
                    with ★ on the biggest saving (rows are ranked by saving). */}
                <span style={{ fontSize: 12, fontWeight: 700, color: i === 0 ? "#2FB477" : "rgba(255,255,255,0.55)", whiteSpace: "nowrap" }}
                  title={i === 0 ? t("Biggest energy saving") : t("Rank {n} by energy saving", { n: i + 1 })}>
                  {i === 0 ? "★ " : ""}{t("Package {n}", { n: r.packageIndex })}
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {/* Which building this package is for — identical materials on
                      two buildings were otherwise indistinguishable here. */}
                  <span style={{ fontSize: 11, fontWeight: 600, color: r.buildingLabel ? "#8B6EAD" : "rgba(255,255,255,0.35)" }}>
                    {r.buildingLabel ?? t("All buildings")}
                  </span>
                  {Object.entries(r.components).map(([comp, item]) => (
                    <div key={comp} style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 5 }}>
                      <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 5, flexShrink: 0, background: `${compColor(comp)}22`, color: compColor(comp), border: `1px solid ${compColor(comp)}44` }}>
                        {compLabel(comp)}
                      </span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
                        {layerText(item) || item.description || item.code}
                        {item.uValue != null && <span style={{ color: "rgba(255,255,255,0.4)" }}> · U {item.uValue.toFixed(2)}</span>}
                      </span>
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.65)", textAlign: "right" }}>{kwh(r.energyUse)}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#2FB477", textAlign: "right" }}>−{kwh(r.saving)}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#4A90E2", textAlign: "right" }}>{co2Saved(r.carbonSaving)}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", textAlign: "right" }}>{money(r.cost)}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontStyle: "italic", margin: "10px 0 0" }}>
            * {t("EnergyPlus (EPSM) results; packages are numbered as in Step 4, ★ marks the biggest energy saving.")}{" "}
            {isBE
              ? t("Cost and CO₂e are not reported for Belgium: no open Belgian retrofit cost or carbon data is wired in yet.")
              : `${t("CO₂e saved is operational, per m² a year, at the heating carbon factor used in Step 4")}${isUK ? "" : ` ${t("(Gothenburg district heating, 0.022 kg CO₂e/kWh)")}`}. ${t("Cost is the package's total material cost.")}`}
          </p>
        </Card>
      )}

      {/* ── 7. Recommendation summary text ── */}
      {hasResults && bestBalanced && (
        <Card accent="#2FB477">
          <SectionTitle icon={<CheckCircle2 size={15} color="#2FB477" />} title={t("Summary & Recommendation")} />
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.7, margin: "0 0 12px" }}>
            {rich(t("Based on the EPSM simulation of {packages} across {components}, the analysis identifies the following recommended strategy:"), {
              packages: <strong style={{ color: "#fff" }}>{t("{n} renovation packages", { n: simResults.length })}</strong>,
              components: <strong style={{ color: "#fff" }}>{components.map((c) => t(c)).join(", ")}</strong>,
            })}
          </p>
          <div style={{ borderRadius: 10, padding: "14px 16px", background: "rgba(47,180,119,0.07)", border: "1px solid rgba(47,180,119,0.2)", marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#2FB477", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
              ★ {t("Recommended Package #{n} — Best Balance of Cost, Energy & Carbon", { n: bestBalanced.packageIndex })}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {Object.entries(bestBalanced.components).map(([comp, item]) => (
                <span key={comp} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 7, background: `${compColor(comp)}22`, color: compColor(comp), border: `1px solid ${compColor(comp)}44`, fontWeight: 600 }}>
                  {compLabel(comp)}: {item.description}{layerText(item) ? ` (${layerText(item)})` : ""}
                </span>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: 0, lineHeight: 1.6 }}>
              {isBE ? (<>
                {rich(t("This package achieves a {saving} reduction in annual energy use (from {from} to {to})."), {
                  saving: <strong style={{ color: "#2FB477" }}>{kwh(bestBalanced.saving)}</strong>,
                  from: kwh(baselineEU),
                  to: <strong style={{ color: "#E8880C" }}>{kwh(bestBalanced.energyUse)}</strong>,
                })}{" "}
                {t("Cost and carbon are not assessed for Belgium yet, so this ranking is by energy alone.")}
              </>) : (
                rich(t("This package achieves a {saving} reduction in annual energy use (from {from} to {to}), saving an estimated {carbon} of operational carbon per year, at a material cost of {cost}."), {
                  saving: <strong style={{ color: "#2FB477" }}>{kwh(bestBalanced.saving)}</strong>,
                  from: kwh(baselineEU),
                  to: <strong style={{ color: "#E8880C" }}>{kwh(bestBalanced.energyUse)}</strong>,
                  carbon: <strong style={{ color: "#4A90E2" }}>{kg(bestBalanced.carbonSaving)}</strong>,
                  cost: <strong style={{ color: "rgba(255,255,255,0.8)" }}>{money(bestBalanced.cost)}</strong>,
                })
              )}
            </p>
          </div>
          {!isBE && bestCost && bestCost.packageIndex !== bestBalanced.packageIndex && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, margin: "0 0 6px" }}>
              {rich(t("If cost is the primary constraint, {pkg} offers the lowest material cost at {cost} while still saving {saving}."), {
                pkg: <strong style={{ color: "#E8880C" }}>{t("Package #{n}", { n: bestCost.packageIndex })}</strong>,
                cost: <strong style={{ color: "#E8880C" }}>{money(bestCost.cost)}</strong>,
                saving: <strong style={{ color: "#2FB477" }}>{kwh(bestCost.saving)}</strong>,
              })}
            </p>
          )}
          {!isBE && bestCarbon && bestCarbon.packageIndex !== bestBalanced.packageIndex && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.6, margin: 0 }}>
              {rich(t("For maximum carbon impact, {pkg} saves {carbon} of CO₂e per year."), {
                pkg: <strong style={{ color: "#4A90E2" }}>{t("Package #{n}", { n: bestCarbon.packageIndex })}</strong>,
                carbon: <strong style={{ color: "#4A90E2" }}>{kg(bestCarbon.carbonSaving)}</strong>,
              })}
            </p>
          )}
        </Card>
      )}

      {/* ── City climate target (moved here from Step 4) ── */}
      {ratingGoal && (
        <Card>
          <SectionTitle icon={<Target size={15} color="#2FB477" />} title={t("City climate target")} />
          <ClimateGoalRatingPanel a={ratingGoal} />
        </Card>
      )}
      {climateGoal && (climateGoal.kind === "info" || (climateGoal.kind === "rating" && !ratingGoal)) && (
        <Card>
          <SectionTitle icon={<Target size={15} color="#2FB477" />} title={t("City climate target")} />
          <ClimateGoalInfo goal={climateGoal} />
        </Card>
      )}
      {goalAssessment && (
        <Card>
          <SectionTitle icon={<Target size={15} color="#2FB477" />} title={t("City climate target")} />
          <ClimateGoalPanel a={goalAssessment} />
          {buildingGoal && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
                {t("Per-building goal")}
              </div>
              <ClimateGoalBuildingTable a={buildingGoal} />
            </div>
          )}
        </Card>
      )}

      {/* ── Staged plan (Step 4.5) ── */}
      {staged && stagedSettings && (
        <Card accent="#B8A3D0">
          <SectionTitle icon={<CalendarClock size={15} color="#B8A3D0" />} title={t("Staged plan")} />
          <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)", margin: "0 0 8px" }}>
            {t("{y} years from {s}, budget {b}. {f} of {m} measures fit ({c} of {p}).", { y: stagedSettings.years, s: stagedSettings.startYear, b: stagedMoney(stagedSettings.budget, staged.currency), f: staged.fitted, m: staged.measures, c: stagedMoney(staged.fittedCost, staged.currency), p: stagedMoney(staged.planCost, staged.currency) })}
            {staged.robustness ? ` ${staged.robustness}` : ""}
          </p>
          {staged.milestones.length > 0 && (
            <ul style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 12.5, color: "rgba(255,255,255,0.8)" }}>
              {staged.milestones.map((m) => <li key={m} style={{ color: m.startsWith("✓") ? "#2FB477" : "#F87171" }}>{m}</li>)}
            </ul>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, color: "rgba(255,255,255,0.85)" }}>
              <thead><tr style={{ color: "rgba(255,255,255,0.5)" }}>
                <th style={{ textAlign: "left", padding: 6 }}>{t("Year")}</th><th style={{ textAlign: "right", padding: 6 }}>{t("Spend")}</th>
                <th style={{ textAlign: "left", padding: 6 }}>{t("Measures done this year")}</th>
                <th style={{ textAlign: "right", padding: 6 }}>{t("Energy bills per year")}</th><th style={{ textAlign: "right", padding: 6 }}>{t("CO₂ per year (t)")}</th>
              </tr></thead>
              <tbody>
                {staged.rows.map((r) => (
                  <tr key={r.year} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", fontWeight: r.final ? 700 : undefined }}>
                    <td style={{ padding: 6 }}>{r.final ? `${r.year} (${t("after the plan")})` : r.year}</td>
                    <td style={{ padding: 6, textAlign: "right" }}>{r.spend ? stagedMoney(r.spend, staged.currency) : "–"}</td>
                    <td style={{ padding: 6 }}>{r.done}</td>
                    <td style={{ padding: 6, textAlign: "right" }}>{stagedMoney(r.bill, staged.currency)}</td>
                    <td style={{ padding: 6, textAlign: "right" }}>{r.co2T.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {staged.unscheduled.length > 0 && <p style={{ fontSize: 12, color: "#FCA5A5", margin: "8px 0 0" }}>{t("Does not fit in the budget")}: {staged.unscheduled.join(" · ")}</p>}
        </Card>
      )}

      {/* ── Solar production potential (PVGIS) ── */}
      {(pvLoading || pvOk.length > 0 || (pv?.results.length ?? 0) > 0) && (
        <Card accent="#E8B10C">
          <SectionTitle icon={<Sun size={15} color="#E8B10C" />} title={t("Solar Production Potential (Rooftop PV)")} />
          {pvLoading && !pv ? (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0 }}>{t("Fetching PVGIS estimates for the buildings…")}</p>
          ) : (
            <>
              <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, margin: "0 0 10px" }}>
                {pvOk.length > 0 && rich(t("Panels on the roofs of the {n} {buildings} could produce about {production} from {kwp} kWp installed.", {
                  n: pvOk.length, buildings: pvOk.length === 1 ? t("building") : t("buildings"),
                  kwp: pvTotalKwp.toLocaleString("sv-SE", { maximumFractionDigits: 1 }),
                }), {
                  production: <strong style={{ color: "#E8B10C" }}>{t("{mwh} MWh of electricity a year", { mwh: (pvTotalKwh / 1000).toLocaleString("sv-SE", { maximumFractionDigits: 1 }) })}</strong>,
                })}
              </p>
              {pvOk.length > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 8px", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                  <span>{t("Set all roofs to")}</span>
                  <input type="range" min={0} max={100} step={5}
                    value={pvRows[0]?.cov ?? PV_DEFAULT_COV}
                    onChange={(e) => { const v = Number(e.target.value); setPvCov(Object.fromEntries(pvRows.map((r) => [r.key, v]))); }}
                    style={{ width: 160, accentColor: "#E8B10C" }} />
                  <span style={{ color: "#E8B10C", fontWeight: 600, minWidth: 34 }}>{pvRows[0]?.cov ?? PV_DEFAULT_COV}%</span>
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>{t("covered with panels — or adjust each building below")}</span>
                </div>
              )}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: "rgba(255,255,255,0.45)" }}>
                      {["Building", "Roof covered with panels", "Panel area", "System size", "Annual production"].map((h, i) => (
                        <th key={h} style={{ padding: "6px 8px", fontWeight: 600, textAlign: i ? "right" : "left", whiteSpace: "nowrap" }}>{t(h)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pvRows.map((r, i) => (
                      <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                        <td style={{ padding: "6px 8px", color: "#fff" }}>
                          {r.address ?? t("Building")}
                          {r.source === "saved" && <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11.5 }}> · {t("saved from the 3D viewer")}</span>}
                        </td>
                        {r.annual_kwh == null ? (
                          <td colSpan={4} style={{ padding: "6px 8px", textAlign: "right", color: "rgba(255,255,255,0.4)" }}>— {r.error ?? t("no result")}</td>
                        ) : (<>
                          <td style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                            <input type="range" min={0} max={100} step={5} value={r.cov}
                              onChange={(e) => setPvCov((m) => ({ ...m, [r.key]: Number(e.target.value) }))}
                              aria-label={r.address ? t("Share of {address} roof covered with panels", { address: r.address }) : t("Share of the roof covered with panels")}
                              style={{ width: 110, verticalAlign: "middle", accentColor: "#E8B10C" }} />
                            <span style={{ display: "inline-block", minWidth: 38, color: "#E8B10C", fontWeight: 600 }}>{r.cov}%</span>
                          </td>
                          <td style={{ padding: "6px 8px", textAlign: "right", color: "rgba(255,255,255,0.7)" }}>{r.roof_area_m2?.toLocaleString("sv-SE")} m²</td>
                          <td style={{ padding: "6px 8px", textAlign: "right", color: "rgba(255,255,255,0.7)" }}>{r.kWp?.toLocaleString("sv-SE")} kWp</td>
                          <td style={{ padding: "6px 8px", textAlign: "right", color: "#E8B10C", fontWeight: 600 }}>{Math.round(r.annual_kwh).toLocaleString("sv-SE")} kWh/yr</td>
                       </>)}
                      </tr>
                    ))}
                    {pvOk.length > 1 && (
                      <tr style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }}>
                        <td style={{ padding: "6px 8px", color: "#fff", fontWeight: 600 }}>{t("Total")}</td>
                        <td />
                        <td style={{ padding: "6px 8px", textAlign: "right", color: "rgba(255,255,255,0.7)" }}>{pvOk.reduce((s, r) => s + (r.roof_area_m2 ?? 0), 0).toLocaleString("sv-SE")} m²</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: "rgba(255,255,255,0.7)" }}>{pvTotalKwp.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kWp</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: "#E8B10C", fontWeight: 700 }}>{Math.round(pvTotalKwh).toLocaleString("sv-SE")} kWh/yr</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {/* Assumptions behind every row (same as the 3D viewer's Rooftop PV button). */}
              <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>{t("Assumptions")}</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>
                  {PV_ASSUMPTIONS.map((a) => <li key={a}>{t(a)}</li>)}
                </ul>
              </div>
            </>
          )}
        </Card>
      )}

      {/* ── 9. Heating system (HVAC) ── */}
      {project.heatingAnalysis && project.heatingAnalysis.results.length > 0 && (() => {
        const ha = project.heatingAnalysis!;
        const sel = ha.results.find((r) => r.id === ha.selectedId) ?? ha.results.find((r) => r.isBaseline) ?? ha.results[0];
        if (!sel) return null;
        const fsek = (v: number) => { const a = Math.abs(v); return a >= 1e6 ? `${(v / 1e6).toFixed(2)} M` : a >= 1e4 ? `${Math.round(v / 1e3)} k` : `${Math.round(v).toLocaleString(numLocale)}`; };
        const hcur = ha.currency ?? "SEK";
        const th2: React.CSSProperties = { padding: "6px 8px", fontWeight: 600, color: "rgba(255,255,255,0.45)", textAlign: "right", whiteSpace: "nowrap" };
        const td2: React.CSSProperties = { padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap", color: "rgba(255,255,255,0.8)" };
        return (
          <Card accent="#E8880C">
            <SectionTitle icon={<Flame size={15} color="#E8880C" />} title={t("Heating System (HVAC)")} />
            <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.65)", lineHeight: 1.7, margin: "0 0 12px" }}>
              {rich(t("On the building's {demand} heat demand, the chosen system is {system}{note} — delivering {delivered} at {cost} and {carbon}"), {
                demand: <strong style={{ color: "#fff" }}>{Math.round(ha.heatingDemandKwhM2Yr)} kWh/m²·yr</strong>,
                system: <strong style={{ color: "#E8880C" }}>{sel.name}</strong>,
                note: sel.isBaseline ? ` ${t("(the as-built baseline)")}` : "",
                delivered: <strong style={{ color: "#fff" }}>{sel.deliveredKwhM2Yr} kWh/m²·yr</strong>,
                cost: <strong style={{ color: "#fff" }}>{fsek(sel.operatingCostYrSek)} {hcur}/yr</strong>,
                carbon: <strong style={{ color: "#4A90E2" }}>{fsek(sel.carbonYrKg)} kg CO₂e/yr</strong>,
              })}
              {sel.vsBaseline && !sel.isBaseline && <> ({t("{cost}% cost, {carbon}% carbon vs {ref}", { cost: `${sel.vsBaseline.opCostPct > 0 ? "+" : ""}${sel.vsBaseline.opCostPct}`, carbon: `${sel.vsBaseline.carbonPct > 0 ? "+" : ""}${sel.vsBaseline.carbonPct}`, ref: hcur === "GBP" ? t("the existing gas boiler") : t("district heating") })})</>}.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ ...th2, textAlign: "left" }}>{t("System")}</th>
                    <th style={th2}>{t("SPF/eff.")}</th>
                    <th style={th2}>{t("Delivered")}<br /><span style={{ fontWeight: 400, color: "rgba(255,255,255,0.3)" }}>kWh/m²·yr</span></th>
                    <th style={th2}>{t("Op. cost/yr")}</th>
                    <th style={th2}>{t("Carbon/yr")}<br /><span style={{ fontWeight: 400, color: "rgba(255,255,255,0.3)" }}>kg CO₂e</span></th>
                    <th style={th2}>{t("Install")}</th>
                    <th style={th2}>{ha.results[0] ? t("50-yr LCC") : t("LCC")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ha.results.map((s) => {
                    const isSel = s.id === ha.selectedId;
                    return (
                      <tr key={s.id} style={{ borderTop: "1px solid rgba(255,255,255,0.07)", background: isSel ? "rgba(139,110,173,0.10)" : s.isBaseline ? "rgba(232,136,12,0.05)" : undefined, boxShadow: isSel ? "inset 3px 0 0 #8B6EAD" : undefined }}>
                        <td style={{ padding: "6px 8px", color: "#fff" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                            {s.shortName}{isSel && <span style={{ fontSize: 8.5, color: "#8B6EAD", fontWeight: 700 }}>✓ {t("chosen")}</span>}{s.isBaseline && <span style={{ fontSize: 8.5, color: "#E8880C" }}>{t("baseline")}</span>}
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
            <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.35)", marginTop: 10, lineHeight: 1.6 }}>
              {t("Heat demand from EnergyPlus (EPSM); system economics are a supply-side layer (delivered = demand ÷ SPF).")} {t("Values are {defaults} — see the tool's Heating-system panel for sources.", { defaults: hcur === "GBP" ? t("UK defaults (Ofgem price cap, DESNZ carbon factors and install costs)") : t("Swedish defaults") })}
            </p>
          </Card>
        );
      })()}

    </div>
  );
}
