import { useState, useMemo, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore, type RenovationCalcPackage, type RenovationCalcBuildingResult, type RenovationCalcSelection } from "../store/wizard";
import HeatingSystemPanel from "../components/HeatingSystemPanel";
import { ukHvacCatalogue, type UkRetailTariffs } from "../config/hvacSystemsUK";
import { computeRegret, annuityFactor, type RegretOptionInput } from "../utils/regretAnalysis";
import { api } from "../api/client";
import { seCityId } from "../config/countryNav";
import { lineItemsFor, type AreaLineItem } from "../config/componentAreaLineItems";
import { resolveBuildingGeometry, computeAreaForLineItem, quantityUnitLabel, effectiveWwr, type ResolvedBuildingGeometry } from "../utils/componentAreas";
import { filterToBaselineShortlist } from "../utils/baselineShortlist";
import type { BuildingLookup, BuildingRecord } from "../types";
import { itemsForLineItem, estimateCarbon, recommendationsForLineItem, type RecTag } from "../utils/materialRecommendation";
import { computePriorities, makeBuildingKeys, DEFAULT_WEIGHTS } from "../utils/retrofitPriority";
import {
  loadUkArchetypes, loadBeArchetypes, findUkArchetype, REFURB_TIERS,
  type TabulaArchetypeGB, type RefurbTierKey,
} from "../utils/ukArchetype";
import { fmtGBP, ukTierCostCarbon, ukMeasureOptions, UK_COST_CARBON_SOURCE_NOTE, UK_COST_PRICE_BASIS, type UkQuantities, type UkMeasureOption } from "../config/ukCostCarbon";
import { useWizardStepNav, setWizardNextInfo } from "../components/wizardNav";
import OptimizerPanel from "../components/OptimizerPanel";
import AssemblyBuilder from "../components/AssemblyBuilder";
import { ASSUMPTIONS, MODEL_ASSUMPTIONS } from "../config/optimizationAssumptions";
import { computeAssemblyU, MATERIAL_BY_ID, type AssemblyLayer, type ComponentKind } from "../config/assemblyLayers";
import { computeAssemblyCarbon, nearestWikellsAssembly } from "../utils/assemblyCosting";
import { parseAssemblyParts } from "../config/materialProperties";
import type { OptimizeComponentInput, OptimizeParams, OptimizePoint, OptimizeResponse } from "../api/client";
import type { WikellsItem } from "../config/wikellsData";
import {
  catalogueAssembliesFor, catalogueNote, layerMaterialsFor, layerPresetsFor,
  catalogueLayerCostCarbon, catalogueLayerNote, catalogueLayerInfo, type CatalogueAssembly,
  EXISTING_LAYER_ID,
} from "../config/materialCatalogue";
import type { BoverketResource, WWRRecord } from "../types";
import {
  Loader2, CheckCircle2, XCircle, Plus, RefreshCw, ChevronDown, ChevronRight, Play, Layers, Settings,
  ScatterChart, BarChart3, SlidersHorizontal,
} from "lucide-react";

/* Sweden/Gothenburg is the only geometry+cost+carbon-complete dataset - UK
 * buildings resolve via /api/uk/building and get real EPSM energy
 * simulation. There's no UK per-component catalogue equivalent to
 * Wikells, so UK packages use TABULA GB's whole-building refurbishment tiers
 * in place of a material picker, costed per measure from openly licensed
 * sources (see config/ukCostCarbon.ts).
 *
 * Every package here is submitted as ONE EPSM batch across every building
 * selected in Step 2 (see backend's /api/simulation-batch-submit) - not
 * just the first one - so a package's cost/carbon/energy are per-building
 * (footprint/wall area differ per building) and the comparison table shows
 * portfolio aggregates with a per-building breakdown on expand. */
const UK_TIER_SELECTIONS_KEY = "UK::RefurbTier";

const COMPONENT_COLORS: Record<string, string> = {
  "Walls": "var(--brand)", "Windows": "#E8880C", "Doors": "#4ECDC4", "Floor": "#4A90E2",
  "Roof": "#4ECDC4", "Balcony": "#2FB477", "Vertical Extension (New Floor)": "#F97316",
};

/* Package totals run to millions, where every digit past the first few is false
   precision - the unit rates are catalogue averages and the quantities come from
   a shoebox. Show MSEK to one decimal above a million, kSEK above ten thousand,
   and exact SEK only for the per-m2 rates where the digits are real. */
/* Step 4 keeps every cost in the `costSEK` fields whatever the country, and the
   page sets the currency they actually hold (SEK, or GBP / EUR from the UK and
   Belgian catalogues) once per render - see the component body. */
let MONEY: "SEK" | "GBP" | "EUR" = "SEK";
function fmtSEK(n: number): string {
  const abs = Math.abs(n);
  if (MONEY !== "SEK") {
    const sym = MONEY === "GBP" ? "£" : "€";
    const loc = MONEY === "GBP" ? "en-GB" : "nl-BE";
    if (abs >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 10_000) return `${sym}${Math.round(n / 1_000).toLocaleString(loc)}k`;
    return sym + n.toLocaleString(loc, { maximumFractionDigits: 0 });
  }
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MSEK`;
  if (abs >= 10_000) return `${Math.round(n / 1_000).toLocaleString("sv-SE")} kSEK`;
  return n.toLocaleString("sv-SE", { maximumFractionDigits: 0 }) + " SEK";
}

/* Comparison-table layout. Cooling is deliberately absent: the single-zone
   shoebox never reaches the 25 °C setpoint, so it always reports 0 and a column
   of zeros just reads as a broken number. */
// expand · package · cost · carbon · 30-yr cost · 30-yr carbon · heating · total · status
const TABLE_COLS     = "24px 1.5fr 92px 92px 96px 96px 84px 110px 118px";
const BREAKDOWN_COLS = "1.5fr 92px 92px 96px 96px 84px 110px 118px";

/** A designed package not simulated yet: the optimizer's estimate. */
type EstRow = {
  kind: "est"; id: string; pt: OptimizePoint; key: string;
  parts: [string, string][];
  cost: number | null; carbon: number | null;
  total: number | null; heat: number | null; pareto: boolean;
};

const ROW_TAG_STYLE: Record<string, { bg: string; fg: string }> = {
  "Cheapest":          { bg: "rgba(47,180,119,0.16)", fg: "#2FB477" },
  "Lowest 30-yr cost": { bg: "rgba(185,139,232,0.18)", fg: "#9B6BD6" },
  "Lowest carbon":     { bg: "rgba(78,205,196,0.16)", fg: "#2BA59C" },
  "Lowest energy":     { bg: "rgba(74,144,226,0.16)", fg: "#4A90E2" },
};

/** Change against the baseline, shown under a value. Down = less energy = good. */
function vsBaseline(value: number | null, base: number | null, isBaseline: boolean) {
  if (isBaseline) {
    return <span style={{ display: "block", fontSize: 9.5, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>baseline</span>;
  }
  if (value == null || base == null || base === 0) return null;
  const pct = Math.round(((value - base) / base) * 100);
  if (pct === 0) {
    return <span style={{ display: "block", fontSize: 9.5, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>±0% vs baseline</span>;
  }
  const better = pct < 0;
  return (
    <span style={{ display: "block", fontSize: 9.5, fontWeight: 700, marginTop: 2, color: better ? "#2FB477" : "#E2483B" }}>
      {better ? "▼" : "▲"} {Math.abs(pct)}% vs baseline
    </span>
  );
}

/* One saved build-up for one component. The library holds as many as you like
   per component — 2 wall configs x 3 floor configs = 6 packages. */
interface ComponentConfig {
  id: string;
  componentKey: string;
  name: string;
  source: "catalogue" | "layers";
  wikellsCode?: string;
  layers?: AssemblyLayer[];
  uValue: number | null;
  costPerM2: number | null;
  costFromCode?: string;
  costDeltaU?: number;
  carbonPerM2: number | null;
  carbonUnmatched?: string[];
  /** Added to the existing component, or replacing it (see RenovationCalcSelection.mode). */
  mode?: "add" | "replace";
}

/* Step 4 is a sequence — buildings, then designs, then packages, then results.
   Numbering it makes that legible; without it the page reads as five unrelated
   cards of equal weight and you can't tell what to do first. `state` dims a
   stage that isn't reachable yet and says what unlocks it. */
/* This page IS wizard step 4. Section badges are numbered against it ("4.1",
   "4.2", …) rather than "1", "2", … which collided visually with the step
   number itself - a circled "3" next to "Results" while the breadcrumb read
   "Step 4". A module constant rather than the store's currentStep: the page is
   fixed to its step, so it should not depend on transient navigation state. */
const STEP_NUMBER = 4;

/* Step 4 is four views, not one long page: Materials & packages, Optimisation,
   Results, Systems. On arrival they show as cards (title, what it is for, and a
   live status line - what has been done, or why a view is not usable yet); once
   one is open they shrink to a strip so switching is one click. */
interface Step4View {
  n: number; title: string; desc: string; icon: React.ReactNode;
  status: string; disabled?: boolean;
}
function Step4Hub({ views, active, onSelect }: {
  views: Step4View[]; active: number | null; onSelect: (n: number | null) => void;
}) {
  // Always a slim bar (the 2×2 card overview read as a separate page). Each
  // view's status is its tooltip; the active view's status shows under the bar.
  const TEAL = "#4ECDC4";
  const current = views.find((v) => v.n === active);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: 4, borderRadius: 12,
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
      {views.map((v) => {
        const on = v.n === active;
        return (
          <button key={v.n} type="button" onClick={() => !v.disabled && onSelect(v.n)} title={v.status}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 9,
              cursor: v.disabled ? "not-allowed" : "pointer", opacity: v.disabled ? 0.45 : 1,
              border: `1px solid ${on ? `${TEAL}88` : "transparent"}`,
              background: on ? `${TEAL}1c` : "transparent",
              color: on ? "#fff" : "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: on ? 800 : 600 }}>
            <span style={{ color: on ? TEAL : "rgba(255,255,255,0.45)", display: "flex" }}>{v.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>{`${STEP_NUMBER}.${v.n}`}</span>
            {v.title}
          </button>
        );
      })}
    </div>
    {current && (
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", padding: "0 6px" }}>
        {current.desc} · <span style={{ color: TEAL, fontWeight: 600 }}>{current.status}</span>
      </div>
    )}
    </div>
  );
}

/** Which components can be composed from layers (windows/doors cannot). */
function kindForKey(key: string): ComponentKind | null {
  if (key === "Walls" || key === "VertExt::Walls") return "wall";
  if (key === "Roof" || key === "VertExt::Roof") return "roof";
  if (key === "Floor" || key === "VertExt::Floor") return "floor";
  return null;
}
function uLabel(u?: number) {
  if (!u) return null;
  if (u <= 0.13) return { label: "Excellent", color: "#2FB477" };
  if (u <= 0.20) return { label: "Good", color: "#4ECDC4" };
  if (u <= 0.30) return { label: "Standard", color: "#E8880C" };
  return { label: "Basic", color: "#E2483B" };
}

function ukOverridesFromTier(tier: TabulaArchetypeGB[RefurbTierKey] | undefined | null): Record<string, number> {
  const overrides: Record<string, number> = {};
  if (!tier) return overrides;
  if (tier.u_wall != null) overrides.u_wall_override = tier.u_wall;
  if (tier.u_roof != null) overrides.u_roof_override = tier.u_roof;
  if (tier.u_window != null) overrides.u_win_override = tier.u_window;
  if (tier.u_floor != null) overrides.u_floor_override = tier.u_floor;
  // u_door has no counterpart: the EnergyPlus shoebox models no door surface.
  return overrides;
}

function overridesFromSeSelections(
  selections: Record<string, RenovationCalcSelection>,
  itemByCode: Record<string, WikellsItem>
): Record<string, number> {
  const overrides: Record<string, number> = {};
  for (const [key, sel] of Object.entries(selections)) {
    // A layer-composed assembly wins: its U comes from the actual build-up
    // (EN ISO 6946) rather than a catalogue row, so it REPLACES the catalogue
    // U-value when rebuilding the shoebox IDF.
    const u = sel.customUValue ?? itemByCode[sel.wikellsCode]?.uValue;
    if (!u) continue;
    if (key === "Walls" || key === "VertExt::Walls") overrides.u_wall_override = u;
    if (key === "Roof" || key === "VertExt::Roof") overrides.u_roof_override = u;
    if (key === "Windows") overrides.u_win_override = u;
    if (key === "Floor" || key === "VertExt::Floor") overrides.u_floor_override = u;
  }
  return overrides;
}

/** Components a package REPLACES rather than adds to - windows always, and any
 *  build-up designed in "replace" mode. Sent with the U overrides so the backend
 *  applies the designed U as is (no UK/BE never-worse clamp). */
function replacedComponents(selections: Record<string, RenovationCalcSelection>): string[] {
  const out = new Set<string>();
  for (const [key, sel] of Object.entries(selections)) {
    const comp = key.replace("VertExt::", "");
    if (comp === "Windows") out.add("window");
    else if (sel.mode === "replace") {
      if (comp === "Walls") out.add("wall");
      if (comp === "Roof") out.add("roof");
      if (comp === "Floor") out.add("floor");
    }
  }
  return [...out];
}

/** The envelope U-values a package actually applies to the shoebox, for display
 *  in the results table. Surfacing these makes an uninsulated pick self-evident:
 *  a "timber stud 95 M0" wall (U 1.75) or a bare "standing seam metal roof"
 *  (U 2.86) is a WORSE envelope than the building already has, so its energy
 *  goes UP — the override replaces the baseline U, it never adds to it. Without
 *  this line a +130% result looks like a bug instead of the physics it is. */
/** The per-component assembly a package applies, resolved to readable names +
 *  U-values — feeds the expandable "what's in this package" breakdown so a wall
 *  of look-alike truncated labels ("145 mm ins. · U 0.18 + 1…") can be opened. */
function packageMaterials(
  pkg: RenovationCalcPackage,
  itemByCode: Record<string, WikellsItem>,
): { component: string; material: string; u: number | null; layers?: { name: string; thicknessMm: number; category?: string }[] }[] {
  const pretty = (key: string) =>
    key.startsWith("VertExt::") ? `New ${key.slice("VertExt::".length).toLowerCase()}` : key;
  return Object.entries(pkg.selections).map(([key, sel]) => {
    const it = itemByCode[sel.wikellsCode];
    // Layer-composed assemblies carry their full build-up; resolve each layer's
    // material name + thickness so "which insulation?" is answered in full.
    const layers = sel.layers?.length
      ? sel.layers.map((l) => ({
          name: MATERIAL_BY_ID[l.materialId]?.label ?? catalogueLayerInfo(l.materialId)?.label ?? l.materialId,
          thicknessMm: l.thicknessMm,
          category: MATERIAL_BY_ID[l.materialId]?.category ?? catalogueLayerInfo(l.materialId)?.category,
        }))
      : undefined;
    return {
      component: pretty(key),
      material: sel.customLabel ?? it?.description ?? sel.wikellsCode,
      u: sel.customUValue ?? it?.uValue ?? null,
      layers,
    };
  });
}

function appliedUValues(
  pkg: RenovationCalcPackage,
  itemByCode: Record<string, WikellsItem>,
): { label: string; u: number }[] {
  const o = overridesFromSeSelections(pkg.selections, itemByCode);
  return [
    { label: "wall", u: o.u_wall_override },
    { label: "roof", u: o.u_roof_override },
    { label: "window", u: o.u_win_override },
    { label: "floor", u: o.u_floor_override },
  ].filter((x): x is { label: string; u: number } => x.u != null);
}

/* Baseline (as-built) U-values the shoebox falls back to when a building has no
   per-component U — mirrors tools/idf/defaults.py (DEFAULT_U_*). Maps a Sweden
   area-line-item key to the U-override component's baseline U-value; null means
   the line item isn't a U-override component (e.g. Doors, Balcony). */
/** Shared empty list so "no configurations yet" keeps a stable identity. */
const EMPTY_CONFIGS: ComponentConfig[] = [];

/** Wikells writes assemblies in trade shorthand. Expand the parts that are not
 *  guessable — "EW" (exterior wall), "CLT" (cross-laminated timber) and the
 *  M-number, which materialProperties.ts already decodes as the nominal
 *  insulation thickness in mm. The original string stays in the tooltip. */
function readableAssembly(description: string): string {
  return description
    .replace(/^EW/, "Exterior wall:")
    .replace(/^IW/, "Interior wall:")
    .replace(/CLT (\d+)/g, "$1 mm cross-laminated timber (CLT)")
    .replace(/M(\d+)\+(\d+)/g, "$1+$2 mm insulation")
    .replace(/M(\d+)/g, "$1 mm insulation");
}

function baselineUForKey(key: string, geo?: ResolvedBuildingGeometry | null): number | null {
  // The building's own TABULA U where it has one; the shoebox defaults
  // (tools/idf/defaults.py) only as a fallback. Scoring every building against
  // the same generic baseline made the "recommended for this building"
  // shortlist identical everywhere, which is not what it claims to be.
  if (key === "Walls" || key === "VertExt::Walls") return geo?.tabulaUWall ?? 0.40;
  if (key === "Roof" || key === "VertExt::Roof") return geo?.tabulaURoof ?? 0.30;
  if (key === "Windows") return geo?.tabulaUWin ?? 1.80;
  if (key === "Floor" || key === "VertExt::Floor") return 0.40;
  return null;
}

/** Where a package's cost and carbon come from, for the Results footnotes:
 *  a TABULA tier or a DESNZ-optimiser pick (installed costs), or materials picked
 *  from the UK/BE catalogue (material only), or Sweden's Wikells. */
function pkgCostSource(p: RenovationCalcPackage): "desnz" | "catalogue" | "wikells" | null {
  if (p.isBaseline) return null;
  const sels = Object.entries(p.selections);
  if (sels.some(([k, s]) => k === UK_TIER_SELECTIONS_KEY || s.wikellsCode?.startsWith("uk:"))) return "desnz";
  if (sels.some(([, s]) => /^(gb|be):/.test(s.wikellsCode ?? "")
    || (s.layers ?? []).some((l) => l.materialId === "existing" || l.materialId.startsWith("cat:")))) return "catalogue";
  return "wikells";
}

function assumptionValue(country: "SE" | "UK" | "BE", key: string): number | null {
  return ASSUMPTIONS[country].find((a) => a.key === key)?.value ?? null;
}

/** Is this row still in flight - i.e. is a batch actively working on it? */
function isBuildingRunning(b: RenovationCalcBuildingResult) {
  return b.status === "queued" || b.status === "running";
}

/** A row is done when the backend said so, or when it already carries simulated
 * numbers and nothing is actively re-running it. The status string alone is not
 * enough: the baseline rehydrated from Step 3 results is never pushed to
 * "completed" by a poll, so a leftover "idle" would keep the Results row
 * spinning forever even though the numbers were right there. */
function isBuildingSettled(b: RenovationCalcBuildingResult) {
  return b.status === "completed"
    || (b.status !== "failed" && !isBuildingRunning(b) && b.totalKwhM2Yr != null);
}

/** Aggregate a package's per-building rows into portfolio-level figures for
 * the comparison table - energy is averaged (it's a per-m² rate, comparable
 * across differently-sized buildings), cost/carbon are summed (portfolio
 * totals, not rates). */
function pkgAggregate(pkg: RenovationCalcPackage) {
  const n = pkg.buildings.length;
  const completed = pkg.buildings.filter(isBuildingSettled).length;
  const failed = pkg.buildings.filter((b) => b.status === "failed").length;
  // Unfinished rows split two ways, and the Status column must not conflate
  // them: a package with a live batch really is simulating (spinner), while one
  // that was never submitted is simply not run yet (no spinner - there is
  // nothing to wait for).
  const running = pkg.buildings.filter((b) => isBuildingRunning(b) || (pkg.batchId != null && !isBuildingSettled(b) && b.status !== "failed")).length;
  const avg = (xs: (number | null)[]) => {
    const vals = xs.filter((x): x is number => x != null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  };
  const sumOrNull = (xs: (number | null)[]) =>
    xs.some((x) => x != null) ? Math.round(xs.reduce((a: number, x) => a + (x ?? 0), 0)) : null;
  return {
    n, completed, failed, running, pending: n - completed - failed,
    avgHeatingKwhM2Yr: avg(pkg.buildings.map((b) => b.heatingKwhM2Yr)),
    avgCoolingKwhM2Yr: avg(pkg.buildings.map((b) => b.coolingKwhM2Yr)),
    avgTotalKwhM2Yr: avg(pkg.buildings.map((b) => b.totalKwhM2Yr)),
    totalCostSEK: sumOrNull(pkg.buildings.map((b) => b.costSEK)),
    totalCarbonKgCO2e: sumOrNull(pkg.buildings.map((b) => b.carbonKgCO2e)),
  };
}

/* ─── Material picker for one area line item (single-select) ──────────────────
   Two tiers: a short "Recommended for this building" shortlist (improvers that
   match the project's KPIs, or the best U when no KPI is set), then the full
   catalogue. Every row is scored against the building's own baseline U so an
   assembly that would WORSEN the envelope (the M0 / bare-cladding trap that
   produced the +130% result) is flagged red before it can be picked, not after
   the simulation comes back. */
function LineItemPicker({
  item, items, selectedCodes, onToggle, recommendations, boverketResources, baselineU,
}: {
  item: AreaLineItem;
  /** Codes already saved as configurations — the tick shows real state. */
  selectedCodes: string[];
  items: WikellsItem[];
  onToggle: (code: string) => void;
  recommendations: Record<string, RecTag[]>;
  boverketResources: BoverketResource[];
  /** The building's current U for this component; drives improve/worsen flags. */
  baselineU: number | null;
}) {
  const color = COMPONENT_COLORS[item.parentComponent] ?? "var(--brand)";
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  if (items.length === 0) {
    return <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>No catalogue materials found for this item.</p>;
  }

  // Recommended shortlist: whatever the KPI logic tagged (already filtered to
  // improvers), plus — as a floor — the single best-U improver, so the section
  // is never empty when a sensible upgrade exists.
  const improvers = baselineU != null
    ? items.filter((i) => i.uValue != null && i.uValue <= baselineU)
    : items.filter((i) => i.uValue != null);
  const bestImprover = improvers.length
    ? [...improvers].sort((a, b) => (a.uValue! - b.uValue!))[0]
    : null;
  const recCodes = new Set(Object.keys(recommendations));
  if (bestImprover) recCodes.add(bestImprover.code);
  const worsensOf = (i: WikellsItem) =>
    (baselineU != null && i.uValue != null && i.uValue > baselineU ? 1 : 0);
  const recommended = items.filter((i) => recCodes.has(i.code)).sort((a, b) => (a.uValue ?? 99) - (b.uValue ?? 99));
  // Improvers first (by U), then the worse-than-baseline "red" rows pushed to the
  // very end — you never want a worsening option sitting above a genuine upgrade.
  const rest = items.filter((i) => !recCodes.has(i.code))
    .sort((a, b) => worsensOf(a) - worsensOf(b) || (a.uValue ?? 99) - (b.uValue ?? 99));

  const Row = (it: WikellsItem) => {
    const carbon = estimateCarbon(it, boverketResources);
    const ul = uLabel(it.uValue);
    const tags = recommendations[it.code] ?? [];
    const p = parseAssemblyParts(it.description);
    // Relative to THIS building: does the pick help or hurt? worsens is the guard.
    const worsens = baselineU != null && it.uValue != null && it.uValue > baselineU;
    const improves = baselineU != null && it.uValue != null && it.uValue <= baselineU;
    const chips: { label: string; color: string }[] = [];
    if (p.frame) chips.push({ label: p.frame, color: "#E8880C" });
    if (p.insulationMm != null) {
      chips.push(p.insulationMm === 0
        ? { label: "no insulation", color: "#E2483B" }
        : { label: `${p.insulationMm} mm ${p.insulationType ?? "insulation"}`, color: "#4ECDC4" });
    }
    if (p.cladding) chips.push({ label: p.cladding, color: "#4A90E2" });
    const hovered = hoveredCode === it.code;
    const checked = selectedCodes.includes(it.code);
    const isRec = recCodes.has(it.code);
    return (
      // The tick means "saved as one of my configurations" — ticking creates
      // it, unticking removes it.
      <button
        key={it.code}
        onClick={() => onToggle(it.code)}
        onMouseEnter={() => setHoveredCode(it.code)}
        onMouseLeave={() => setHoveredCode(null)}
        onFocus={() => setHoveredCode(it.code)}
        onBlur={() => setHoveredCode(null)}
        title={checked ? "Remove this configuration"
          : worsens ? `${it.description}\n\n⚠ U ${it.uValue} is worse than the building's current ~${baselineU} — this would RAISE energy use.`
          : (it as CatalogueAssembly).sourceNote ? `${it.description}\n\n${(it as CatalogueAssembly).sourceNote}`
          : it.description}
        style={{
          width: "100%", display: "grid",
          gridTemplateColumns: "18px 34px minmax(0,1fr) 96px 58px 74px",
          gap: 8, alignItems: "center", textAlign: "left",
          padding: "6px 9px", borderRadius: 8, cursor: "pointer",
          border: `1px solid ${checked ? "rgba(78,205,196,0.45)" : worsens ? "rgba(226,72,59,0.32)" : isRec ? "rgba(47,180,119,0.4)" : hovered ? `${color}55` : "transparent"}`,
          background: checked ? "rgba(78,205,196,0.12)" : hovered ? `${color}18` : worsens ? "rgba(226,72,59,0.06)" : isRec ? "rgba(47,180,119,0.07)" : "rgba(255,255,255,0.02)",
        }}
      >
        <span style={{
          width: 15, height: 15, borderRadius: 4, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 10, fontWeight: 900, color: "#0b1220",
          border: `2px solid ${checked ? "#4ECDC4" : hovered ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.2)"}`,
          background: checked ? "#4ECDC4" : "transparent",
        }}>{checked ? "✓" : ""}</span>
        <span style={{ fontSize: 9.5, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", overflow: "hidden" }}>{it.code.replace(/^(gb|be):/, "")}</span>

        <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 11, color: hovered ? "#fff" : "rgba(255,255,255,0.7)", lineHeight: 1.25,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title={it.description}>{readableAssembly(it.description)}</span>
          <span style={{ display: "flex", gap: 3, overflow: "hidden", whiteSpace: "nowrap", alignItems: "center" }}>
            {tags.map((t) => {
              const bal = t === "Balanced";
              const c = bal ? "#E9B949" : "#2FB477";
              return (
                <span key={t} style={{ fontSize: 8.5, fontWeight: 800, color: c, background: `${c}24`,
                  border: `1px solid ${c}66`, borderRadius: 6, padding: "0 4px", flexShrink: 0 }}>★ {t}</span>
              );
            })}
            {worsens && (
              <span style={{ fontSize: 8.5, fontWeight: 800, color: "#E2483B", background: "rgba(226,72,59,0.14)",
                border: "1px solid rgba(226,72,59,0.4)", borderRadius: 6, padding: "0 4px", flexShrink: 0 }}>▲ raises energy</span>
            )}
            {improves && !tags.length && (
              <span style={{ fontSize: 8.5, fontWeight: 700, color: "#4ECDC4", flexShrink: 0 }}>improves</span>
            )}
            {chips.map((c) => (
              <span key={c.label} style={{
                fontSize: 8.5, fontWeight: 700, color: c.color, background: `${c.color}1e`,
                border: `1px solid ${c.color}44`, borderRadius: 6, padding: "0 4px", flexShrink: 0,
              }}>{c.label}</span>
            ))}
          </span>
        </span>

        <span style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,0.5)", textAlign: "right" }}>
          {(it as CatalogueAssembly).costMissing
            ? <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 600 }} title="No price in the materials catalogue">price n/a</span>
            : `${fmtSEK(it.costSEK)}/${item.quantityKind === "area" ? "m²" : "st"}`}
        </span>
        <span style={{ textAlign: "right" }}>
          {ul && (
            <span style={{ fontSize: 9, fontWeight: 700, color: worsens ? "#E2483B" : ul.color, background: `${worsens ? "#E2483B" : ul.color}22`, borderRadius: 7, padding: "1px 5px" }}>
              U {it.uValue}
            </span>
          )}
        </span>
        <span style={{ fontSize: 9, fontWeight: 700, color: "#4A90E2", textAlign: "right" }}>
          ~{carbon.value} kg
        </span>
      </button>
    );
  };

  const SectionLabel = ({ children }: { children: ReactNode }) => (
    <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,0.35)", margin: "8px 2px 4px" }}>
      {children}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", maxHeight: 320, overflowY: "auto", overflowX: "hidden" }}>
      {baselineU != null && (
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: "0 2px 4px", lineHeight: 1.5 }}>
          This building's current {item.label.toLowerCase()} ≈ <strong style={{ color: "#fff" }}>U {baselineU.toFixed(2)}</strong>.
          {" "}<span style={{ color: "#4ECDC4" }}>Lower U = better.</span>{" "}
          <span style={{ color: "#E2483B" }}>Red rows are worse than what's already there.</span>
        </div>
      )}
      {recommended.length > 0 && (
        <>
          <SectionLabel>✦ Recommended for this building</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{recommended.map(Row)}</div>
        </>
      )}
      <SectionLabel>All materials ({items.length})</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>{rest.map(Row)}</div>
    </div>
  );
}

/** Element areas a UK tier is costed on: opaque wall, roof (footprint) and glazing. */
function ukQuantitiesFor(g: ResolvedBuildingGeometry, wwr: WWRRecord | null): UkQuantities {
  const r = effectiveWwr(g, wwr);
  return {
    wallNetM2: g.wallAreaM2 != null ? g.wallAreaM2 * (1 - r) : null,
    roofM2: g.footprintM2,
    windowM2: g.wallAreaM2 != null ? g.wallAreaM2 * r : null,
  };
}

/** UK optimiser element areas, measured on the building as SIMULATED: the
 *  footprint is scaled to the heated area (tools/idf/generate_idf.py), so walls
 *  shrink with the square root of that factor and roof/floor with the factor. */
function ukOptimiserAreas(g: ResolvedBuildingGeometry, wwr: WWRRecord | null) {
  const floors = Math.max(1, g.floors ?? 1);
  const footprint = g.footprintM2 ?? 0;
  const heated = g.heatedAreaM2 ?? footprint * floors;
  const scale = footprint > 0 ? heated / (footprint * floors) : 1;
  const r = effectiveWwr(g, wwr);
  const wallGross = (g.wallAreaM2 ?? 0) * Math.sqrt(scale);
  return { heated, Walls: wallGross * (1 - r), Windows: wallGross * r, Roof: heated / floors, Floor: heated / floors };
}

const UK_OPT_COMPONENTS = ["Walls", "Roof", "Windows", "Floor"] as const;

function ukOptionsFor(g: ResolvedBuildingGeometry, wwr: WWRRecord | null): Record<string, UkMeasureOption[]> {
  const a = ukOptimiserAreas(g, wwr);
  const cur = g.currentU ?? { wall: null, roof: null, win: null, floor: null };
  const current: Record<string, number> = {
    Walls: cur.wall ?? g.tabulaUWall ?? 1.6, Roof: cur.roof ?? g.tabulaURoof ?? 2.3,
    Windows: cur.win ?? g.tabulaUWin ?? 2.8, Floor: cur.floor ?? g.tabulaUFloor ?? 0.7,
  };
  // Cavity walls were standard from about 1930; earlier houses are mostly solid brick.
  const cavity = (g.yearBuilt ?? 1950) >= 1930;
  return Object.fromEntries(UK_OPT_COMPONENTS.map((k) => [k, ukMeasureOptions(k, current[k]!, a[k], cavity)]));
}

/* ─── UK refurbishment-tier picker (whole-building, not per-component) ────── */
function UkTierPicker({
  archetype, selectedTier, onSelect, quantities, buildingCount, uSource, country = "gb",
}: {
  archetype: TabulaArchetypeGB | null;
  selectedTier: RefurbTierKey | null;
  onSelect: (tier: RefurbTierKey) => void;
  quantities: UkQuantities | null;
  buildingCount: number;
  uSource: string | null;
  /** "be": TABULA Belgium tiers - no open Belgian cost data, so no £/€ estimate. */
  country?: "gb" | "be";
}) {
  const isBE = country === "be";
  if (!archetype && isBE) {
    return (
      <div style={{ borderRadius: 12, padding: "14px 16px", background: "rgba(232,136,12,0.1)", border: "1px solid rgba(232,136,12,0.25)" }}>
        <p style={{ fontSize: 12, color: "#E8880C", margin: 0 }}>
          No TABULA Belgium archetype matched this building (TABULA BE covers dwellings only) - envelope U-value
          overrides aren't available, but a baseline EnergyPlus simulation can still run on the as-built defaults.
        </p>
      </div>
    );
  }
  if (!archetype) {
    return (
      <div style={{ borderRadius: 12, padding: "14px 16px", background: "rgba(232,136,12,0.1)", border: "1px solid rgba(232,136,12,0.25)" }}>
        <p style={{ fontSize: 12, color: "#E8880C", margin: 0 }}>
          No TABULA GB archetype matched this building's type/era - envelope U-value overrides aren't available, but a
          baseline EnergyPlus simulation can still run on the as-built defaults.
        </p>
      </div>
    );
  }
  const eraLabel = uSource === "known_year" ? "known construction year" : uSource === "ehs_sampled_period" ? "estimated era"
    : uSource === "statbel_sampled_period" ? "estimated era (Statbel)" : "era unknown";
  const eraColor = uSource === "known_year" ? "#2FB477" : "#E8880C";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ borderRadius: 10, padding: "10px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <span>As-built (TABULA {archetype.type_label}, {archetype.period_label}) - matched from building 1{buildingCount > 1 ? ` of ${buildingCount}` : ""}</span>
          <span style={{ color: eraColor, background: `${eraColor}22`, padding: "1px 7px", borderRadius: 8, fontWeight: 700, textTransform: "none", letterSpacing: 0 }}>
            {eraLabel}
          </span>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {(["u_wall", "u_roof", "u_window", "u_floor"] as const).map((k) => (
            archetype.as_built[k] != null && (
              <span key={k} style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                {k.replace("u_", "U-")}: <b style={{ color: "rgba(255,255,255,0.8)" }}>{archetype.as_built[k]}</b>
              </span>
            )
          ))}
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
            TABULA estimate: <b style={{ color: "rgba(255,255,255,0.8)" }}>{archetype.as_built.kwh_m2_yr} kWh/m²/yr</b>
          </span>
        </div>
      </div>

      {REFURB_TIERS.map(({ key, label }) => {
        const tier = archetype[key];
        if (!tier) return null;  // TABULA BE omits some tiers for recent periods
        const checked = selectedTier === key;
        const color = "var(--brand)";
        const est = quantities && !isBE ? ukTierCostCarbon(archetype.as_built, tier, quantities) : null;
        const estCost = est?.costGbp ?? null;
        const estCarbon = est?.carbonKgCo2e ?? null;
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            style={{
              width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 10, cursor: "pointer",
              border: `1px solid ${checked ? `${color}55` : "rgba(255,255,255,0.08)"}`,
              background: checked ? `${color}18` : "rgba(255,255,255,0.03)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{
                width: 15, height: 15, borderRadius: "50%", flexShrink: 0,
                border: `2px solid ${checked ? color : "rgba(255,255,255,0.2)"}`,
                background: checked ? color : "transparent",
              }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: checked ? "#fff" : "rgba(255,255,255,0.75)" }}>{label}</span>
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", paddingLeft: 23 }}>
              {(["u_wall", "u_roof", "u_window", "u_door"] as const).map((k) => (
                tier[k] != null && (
                  <span key={k} style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                    {k.replace("u_", "U-")}: <b style={{ color: "rgba(255,255,255,0.8)" }}>{tier[k]}</b>
                  </span>
                )
              ))}
              <span style={{ fontSize: 11, color: "#4A90E2" }}>
                TABULA estimate: <b>{tier.kwh_m2_yr} kWh/m²/yr</b>
              </span>
              {estCost != null && estCarbon != null && (
                <span style={{ fontSize: 11, color: "#E8880C" }}>
                  ~{fmtGBP(estCost)} · ~{estCarbon.toLocaleString("en-GB")} kg CO₂e <i>(building 1, {UK_COST_PRICE_BASIS})</i>
                </span>
              )}
            </div>
            {est && est.lines.length > 0 && (
              <div style={{ paddingLeft: 23, marginTop: 5, display: "flex", flexDirection: "column", gap: 1 }}>
                {est.lines.map((l) => (
                  <span key={l.element} style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                    {l.element}: {l.measure}
                    {l.quantityM2 != null ? ` · ${Math.round(l.quantityM2).toLocaleString("en-GB")} m²` : ""}
                    {l.costGbp != null ? ` · ${fmtGBP(l.costGbp)}` : ""}
                    {l.carbonKgCo2e != null ? ` · ${Math.round(l.carbonKgCo2e).toLocaleString("en-GB")} kg CO₂e` : ""}
                    {l.note ? ` (${l.note})` : ""}
                  </span>
                ))}
              </div>
            )}
          </button>
        );
      })}
      {isBE ? (
      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", margin: 0 }}>
        TABULA Belgium (VITO): standard = upgrade towards EPBD new-build requirements, ambitious = towards a low-energy
        standard. No open Belgian retrofit cost dataset is wired in yet, so packages show no cost.
        The energy columns below come from an EnergyPlus simulation using this tier's U-values, applied to every selected building.
      </p>
      ) : (
      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", margin: 0 }}>
        {UK_COST_CARBON_SOURCE_NOTE} Quantities come from the building's footprint, wall area and window-to-wall ratio.
        The energy columns below come from an EnergyPlus simulation using this tier's U-values, applied to every selected building.
      </p>
      )}
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────────────────────── */
export default function RenovationSimulator() {
  const navigate = useNavigate();
  const { project, setProject } = useWizardStore();

  const isUK = project.country === "United Kingdom";
  // Belgium reuses the UK's TABULA-tier flow; UK-only parts (DESNZ £, tariffs,
  // HVAC catalogue, optimiser) stay behind isUK.
  const isBE = project.country === "Belgium";
  const COUNTRY = isUK ? "gb" : isBE ? "be" : "se";
  MONEY = isUK ? "GBP" : isBE ? "EUR" : "SEK";   // what fmtSEK prints for this project

  const components = project.renovationEnvelopeComponents.length > 0
    ? project.renovationEnvelopeComponents
    : ["Walls", "Roof", "Windows"];
  const lineItems = useMemo(() => lineItemsFor(components), [components]);

  /* What's actually in scope decides which Step-4 sections render. "Heating
     system" has no envelope line item, so a heating-only scope has an empty
     lineItems — in that case we hide the whole envelope flow (design configs,
     packages, Pareto optimizer, results) and show only the HVAC comparison.
     Conversely the HVAC panel appears only when heating is in scope (whether
     picked in Step 1 or added here in Step 4). */
  const hasEnvelope = lineItems.length > 0;
  const hasHeating  = components.includes("Heating system");

  /* Every building selected in Step 2 - not just the first one. For a bbox /
     neighbourhood selection they are ordered by MCDA retrofit priority (energy +
     façade condition + characteristics + potential) so EPSM runs — and results
     list — the highest-priority buildings first. */
  const buildings = useMemo(() => {
    if (project.lookedUpBuildings.length > 0) return project.lookedUpBuildings;
    if (project.lookedUpBuilding) return [project.lookedUpBuilding];
    const rows = project.bboxRows;
    if (rows.length <= 1) return rows;
    const keys = makeBuildingKeys(rows);
    const items = rows.map((row, i) => ({ row, key: keys[i]!, label: row.address || `Building ${i + 1}` }));
    const ranked = computePriorities(items, project.facadeDefects ?? {}, DEFAULT_WEIGHTS);
    return ranked.map(r => r.row);
  }, [project.lookedUpBuildings, project.lookedUpBuilding, project.bboxRows, project.facadeDefects]);

  /* Step 3 decides which buildings the project is about; Step 4 must not widen
     that. Running every package over the whole Step 2 selection meant 39
     EnergyPlus runs per package where the user had shortlisted 3. */
  // Explicit type argument: `buildings` is BuildingLookup[] | BuildingRecord[]
  // (a union of arrays), which generic inference cannot unify on its own.
  const shortlisted = useMemo(
    () => filterToBaselineShortlist<BuildingLookup | BuildingRecord>(
      buildings as (BuildingLookup | BuildingRecord)[],
      project.renovationBaselineResults,
    ),
    [buildings, project.renovationBaselineResults],
  );

  const geometries = useMemo(
    () => shortlisted.map((b) => resolveBuildingGeometry(b)).filter((g): g is ResolvedBuildingGeometry => g !== null),
    [shortlisted]
  );

  const [wwrByIndex, setWwrByIndex] = useState<Record<number, WWRRecord | null>>({});
  const [manualOverrides, setManualOverrides] = useState<Record<string, number>>({});
  const [boverketByComponent, setBoverketByComponent] = useState<Record<string, BoverketResource[]>>({});
  const [activeItemKey, setActiveItemKey] = useState<string>(lineItems[0]?.key ?? "");
  // Kept for the UK tier flow and for scoping the optimizer's candidate set; the
  // Sweden package flow is driven by the saved configuration library instead.
  const [draftSelection, setDraftSelection] = useState<Record<string, string[]>>({});
  // How many packages the current selection will generate (product of counts).
  const packageCombos = useMemo(() => {
    const withSel = lineItems.filter((li) => (draftSelection[li.key]?.length ?? 0) > 0);
    return withSel.reduce((n, li) => n * (draftSelection[li.key]?.length ?? 1), withSel.length ? 1 : 0);
  }, [lineItems, draftSelection]);
  /* ── Configuration library ────────────────────────────────────────────────
     Named build-ups the user designs per component. Packages are the cartesian
     product across components that have at least one configuration. */
  // Build-from-layers leads: composing an assembly from real layers (with a live
  // U-value) is the honest way to design a retrofit; the catalogue is the "or
  // pick a ready-made assembly" fallback. Windows/doors can't be layer-composed,
  // so effectiveDraftMode below falls back to catalogue for them.
  const [draftMode, setDraftMode] = useState<"layers" | "catalogue">("catalogue");
  const [draftLayers, setDraftLayers] = useState<AssemblyLayer[]>([]);
  const [draftName, setDraftName] = useState("");
  const [excludedCombos, setExcludedCombos] = useState<Set<string>>(new Set());

  const [ukArchetype, setUkArchetype] = useState<TabulaArchetypeGB | null>(null);
  const [ukTier, setUkTier] = useState<RefurbTierKey | null>(null);
  // Live day-ahead spot price (SE) for the optimizer's operating-cost term;
  // falls back to the documented assumption value if the feed is unavailable.
  const [livePriceSek, setLivePriceSek] = useState<number | null>(null);
  // UK: price-cap retail tariffs for the city's region (Octopus Energy API), GBP/kWh incl. VAT.
  const [ukTariffs, setUkTariffs] = useState<(UkRetailTariffs & { zone: string | null }) | null>(null);
  const [packageName, setPackageName] = useState("");
  const [expandedPkg, setExpandedPkg] = useState<string | null>(null);
  // Which Step 4 view is open: 1 Materials & packages · 2 Optimisation ·
  // 3 Results · 4 Systems, picked from the bar at the top of the step.
  // Coming BACK from Step 5 reopens the view the user left from (saved by
  // handleSaveAndContinue); arriving from Step 3 opens the first view.
  const firstView = hasEnvelope ? 1 : hasHeating ? 4 : 3;
  const [openStage, setOpenStage] = useState<number | null>(() => {
    try {
      const v = sessionStorage.getItem("step4.returnView");
      return v ? Number(v) : firstView;
    } catch { return firstView; }
  });
  // Consumed once (in an effect: StrictMode runs state initialisers twice).
  useEffect(() => { try { sessionStorage.removeItem("step4.returnView"); } catch { /* ignore */ } }, []);
  const justRanRef = useRef(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  // Results can be read two ways: by package (portfolio aggregate per design) or
  // by building (every address as a row, baseline next to each package so you can
  // compare a single building across all designs). The matrix is what a user means
  // by "show me each building by name and how each package changes it".
  const [resultView, setResultView] = useState<"package" | "building">("package");
  // A ref, not state: React StrictMode double-invokes effects in dev without
  // an intervening re-render, so a useState guard here would let both
  // invocations see the same stale "not yet initialized" value and both
  // submit a baseline batch. A ref mutation is synchronous and immediately
  // visible to the second invocation.
  const initializedRef = useRef(false);
  const pollHandles = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const packages = project.renovationCalcPackages;

  // Which building(s) a new package applies to: "all" or a specific index.
  // Entries carry the ORIGINAL building index so per-building lookups (wwr,
  // cost/carbon) stay correct even when a package targets a single building.
  // Which buildings a package is built for: every building in the Step 3
  // shortlist, or one of them. Chosen in 4.1 next to the assemblies, because it
  // changes what the quantities and costs below refer to.
  const [targetIdx, setTargetIdx] = useState<number | "all">("all");

  /* Saved build-ups are per building: the assemblies that suit a 1960s block are
     not the ones that suit its neighbour, and a single shared list meant
     switching building in 4.1 still showed - and still had ticked - the previous
     building's configurations. "All buildings" keeps its own set. */
  // Restored from the project, and written back on every change: they used to
  // live only in this page, so leaving Step 4 and returning wiped every saved
  // build-up and only the already-simulated packages survived.
  const [configsByBuilding, setConfigsByBuilding] = useState<Record<string, ComponentConfig[]>>(
    () => (useWizardStore.getState().project.renovationConfigs ?? {}) as Record<string, ComponentConfig[]>);
  useEffect(() => {
    setProject({ renovationConfigs: configsByBuilding });
  }, [configsByBuilding]); // eslint-disable-line react-hooks/exhaustive-deps
  const cfgKey = targetIdx === "all" ? "all" : String(targetIdx);
  /* Stable identity matters here: `?? []` handed back a NEW array on every
     render for a building with no saved configs, which invalidated every memo
     downstream — including the optimizer's `input`. Its effect keys off that
     object, so the Pareto front was re-requested (after a 450 ms debounce) on
     each render, making the curve slow to settle and the Run button feel like it
     needed several clicks while the tree re-rendered underneath it. */
  const configs = useMemo(
    () => configsByBuilding[cfgKey] ?? EMPTY_CONFIGS,
    [configsByBuilding, cfgKey],
  );
  const setConfigs = (updater: ComponentConfig[] | ((prev: ComponentConfig[]) => ComponentConfig[])) =>
    setConfigsByBuilding((prev) => ({
      ...prev,
      [cfgKey]: typeof updater === "function" ? updater(prev[cfgKey] ?? []) : updater,
    }));
  type GeoEntry = { g: ResolvedBuildingGeometry; idx: number };
  const allEntries: GeoEntry[] = useMemo(() => geometries.map((g, i) => ({ g, idx: i })), [geometries]);
  const targetEntries: GeoEntry[] = targetIdx === "all" ? allEntries : (geometries[targetIdx] ? [{ g: geometries[targetIdx]!, idx: targetIdx }] : allEntries);
  const targetSuffix = () => targetIdx === "all" ? "" : ` · ${geometries[targetIdx]?.address ?? `Building ${targetIdx + 1}`}`;

  const stopPoll = useCallback((packageId: string) => {
    const h = pollHandles.current[packageId];
    if (h) { clearInterval(h); delete pollHandles.current[packageId]; }
  }, []);

  const pollBatch = useCallback((packageId: string, batchId: string) => {
    stopPoll(packageId);
    let consecutiveErrors = 0;
    const tick = async () => {
      try {
        const status = await api.simulationBatchStatus(batchId);
        consecutiveErrors = 0;
        setProject({
          renovationCalcPackages: useWizardStore.getState().project.renovationCalcPackages.map((p) => {
            if (p.id !== packageId) return p;
            return {
              ...p,
              buildings: p.buildings.map((b, i) => {
                const row = status.buildings[i];
                if (!row) return b;
                return {
                  ...b,
                  status: (row.status as RenovationCalcBuildingResult["status"]) ?? b.status,
                  heatingKwhM2Yr: row.results?.heating_kwh_m2_yr ?? b.heatingKwhM2Yr,
                  coolingKwhM2Yr: row.results?.cooling_kwh_m2_yr ?? b.coolingKwhM2Yr,
                  totalKwhM2Yr: row.results?.total_kwh_m2_yr ?? b.totalKwhM2Yr,
                  totalGasKwh: row.results?.total_gas_kwh ?? b.totalGasKwh ?? null,
                  dwellings: row.results?.dwellings ?? b.dwellings ?? null,
                  error: row.error ?? b.error,
                };
              }),
            };
          }),
        });
        // Stop on "nothing is still in flight" rather than on an explicit
        // completed/failed list - an unrecognised status from the backend would
        // otherwise poll (and spin) forever.
        if (status.buildings.every((b) => b.status !== "queued" && b.status !== "running")) {
          stopPoll(packageId);
        }
      } catch {
        // A hiccup or two is normal and worth riding out, but a batch the
        // backend no longer knows about (404 after the sim database was reset)
        // never recovers - polling it forever just spins the Status column with
        // no way for the user to tell anything is wrong. Surface it instead.
        if (++consecutiveErrors >= 5) {
          stopPoll(packageId);
          setProject({
            renovationCalcPackages: useWizardStore.getState().project.renovationCalcPackages.map((p) =>
              p.id !== packageId ? p : {
                ...p,
                buildings: p.buildings.map((b) => isBuildingSettled(b) ? b : {
                  ...b, status: "failed" as const,
                  error: b.error ?? "Lost contact with this simulation batch - re-run it.",
                }),
              }
            ),
          });
        }
      }
    };
    tick();
    pollHandles.current[packageId] = setInterval(tick, 4000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopPoll]);

  const submitBatch = useCallback(async (packageId: string, overrides: Record<string, number>, packageLabel: string | undefined, entries: GeoEntry[]) => {
    try {
      // Which components this package replaces (windows; "replace"-mode build-ups),
      // read from the package itself - every caller stores it before submitting.
      const pkgSel = useWizardStore.getState().project.renovationCalcPackages.find((p) => p.id === packageId)?.selections;
      const replace = pkgSel ? replacedComponents(pkgSel) : [];
      const { batch_id } = await api.simulationBatchSubmit({
        country: COUNTRY,
        ...(isUK || isBE ? {} : { city_id: seCityId(project.city) }),
        buildings: entries.map(({ g }) => ({ lat: g.lat, lon: g.lon, address: g.address })),
        package_id: packageId, package_label: packageLabel ?? null,
        ...overrides,
        ...(replace.length ? { replace_components: replace } : {}),
      });
      // Flip the rows to "queued" in the SAME update that stores the batch id.
      // Leaving them "idle" opened a hole: if the tab closed before the first
      // poll landed, the resume-on-mount check (which looked for queued/running)
      // skipped the package and nothing ever polled it again - the batch would
      // finish in EPSM while the Results row span forever.
      setProject({
        renovationCalcPackages: useWizardStore.getState().project.renovationCalcPackages.map((p) =>
          p.id === packageId
            ? { ...p, batchId: batch_id, buildings: p.buildings.map((b) => ({ ...b, status: "queued" as const })) }
            : p
        ),
      });
      pollBatch(packageId, batch_id);
    } catch (err) {
      setProject({
        renovationCalcPackages: useWizardStore.getState().project.renovationCalcPackages.map((p) =>
          p.id === packageId
            ? { ...p, buildings: p.buildings.map((b) => ({ ...b, status: "failed" as const, error: (err as Error).message })) }
            : p
        ),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometries, isUK, isBE, pollBatch]);

  function makeBuildingRows(
    entries: GeoEntry[],
    costCarbonFor?: (g: ResolvedBuildingGeometry, i: number) => { costSEK: number | null; carbonKgCO2e: number | null }
  ): RenovationCalcBuildingResult[] {
    return entries.map(({ g, idx }) => {
      const cc = costCarbonFor ? costCarbonFor(g, idx) : { costSEK: null, carbonKgCO2e: null };
      return {
        address: g.address ?? `Building ${idx + 1}`, lat: g.lat, lon: g.lon, status: "idle",
        heatingKwhM2Yr: null, coolingKwhM2Yr: null, totalKwhM2Yr: null,
        costSEK: cc.costSEK, carbonKgCO2e: cc.carbonKgCO2e, error: null,
      };
    });
  }

  /** Copy Step 3's finished baseline across when it covers these buildings.
   *  Returns false when there is nothing to copy. Never submits anything. */
  const seedBaselineFromStep3 = useCallback(() => {
    if (geometries.length === 0) return false;
    const entries = geometries.map((g, i) => ({ g, idx: i }));

    // Prefer Step 3 baseline results — they're already simulated; no need to
    // re-submit a new EPSM batch. Match by position (Step 3 iterates the same
    // geometry list in the same order).
    const step3 = useWizardStore.getState().project.renovationBaselineResults;
    if (step3 && step3.length === geometries.length) {
      const pkg: RenovationCalcPackage = {
        id: "baseline", name: "Baseline (as-built)", color: "rgba(255,255,255,0.4)", isBaseline: true,
        selections: {}, batchId: null,
        buildings: entries.map(({ g, idx }) => ({
          address: g.address ?? `Building ${idx + 1}`,
          lat: g.lat, lon: g.lon,
          status: "completed" as const,
          heatingKwhM2Yr: step3[idx]?.heating ?? null,
          coolingKwhM2Yr: step3[idx]?.cooling ?? null,
          totalKwhM2Yr: step3[idx]?.energyUse ?? null,
          costSEK: null, carbonKgCO2e: null, error: null,
        })),
      };
      setProject({ renovationCalcPackages: [...useWizardStore.getState().project.renovationCalcPackages.filter((p) => p.id !== "baseline"), pkg] });
      return true;
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometries]);

  /** Explicit user action only - this is what starts an EnergyPlus batch. */
  const submitBaseline = useCallback(() => {
    if (geometries.length === 0) return;
    const entries = geometries.map((g, i) => ({ g, idx: i }));

    // Submits a fresh EPSM batch — only ever reached from the Run button.
    const pkg: RenovationCalcPackage = {
      id: "baseline", name: "Baseline (as-built)", color: "rgba(255,255,255,0.4)", isBaseline: true,
      selections: {}, batchId: null, buildings: makeBuildingRows(entries),
    };
    setProject({ renovationCalcPackages: [...useWizardStore.getState().project.renovationCalcPackages.filter((p) => p.id !== "baseline"), pkg] });
    submitBatch("baseline", {}, undefined, entries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometries, submitBatch]);

  /* ── fetch WWR (per building) + Boverket/TABULA data + submit baseline ── */
  useEffect(() => {
    if (geometries.length === 0 || initializedRef.current) return;
    initializedRef.current = true;

    Promise.all(
      geometries.map((g) => api.lookupWWR(g.lat, g.lon).then((r) => (r.found ? r.record : null)).catch(() => null))
    ).then((records) => setWwrByIndex(Object.fromEntries(records.map((r, i) => [i, r] as const))));

    if (isUK || isBE) {
      (isBE ? loadBeArchetypes() : loadUkArchetypes()).then((archetypes) => {
        // tabulaPeriodUsed (not tabulaPeriod) always carries whichever period actually
        // drove the backend's own TABULA lookup - real known year OR an EHS-sampled
        // era - so this matches the SAME archetype the building's as-built u-values
        // came from, rather than falling back to an arbitrary one when the era was
        // sampled (the common case - tabulaPeriod itself stays null for those).
        const g0 = geometries[0]!;
        setUkArchetype(findUkArchetype(archetypes, g0.useCat, g0.tabulaPeriodUsed ?? g0.tabulaPeriod,
          { u_wall: g0.tabulaUWall, u_roof: g0.tabulaURoof, u_window: g0.tabulaUWin, u_floor: g0.tabulaUFloor }));
      }).catch(() => { /* no archetype match available */ });
    } else {
      const uniqueComponents = Array.from(new Set(lineItems.map((li) => li.boverketComponent)));
      Promise.all(uniqueComponents.map((c) => api.boverketMaterials(c).then((res) => [c, res] as const).catch(() => [c, []] as const)))
        .then((pairs) => setBoverketByComponent(Object.fromEntries(pairs)));
    }

    const existing = useWizardStore.getState().project.renovationCalcPackages;
    const baseline = existing.find((p) => p.isBaseline);
    // A baseline carried over from an earlier visit can be stranded: no batchId
    // to poll and rows still missing results. Nothing would ever move it, so the
    // status column spun indefinitely. Re-seed it - from Step 3's results if they
    // exist by now, otherwise a fresh EPSM batch.
    const stranded = baseline != null && baseline.batchId === null
      && baseline.buildings.some((b) => b.totalKwhM2Yr == null && b.status !== "failed");
    if (!baseline || stranded) {
      // Reusing Step 3's finished numbers is free; STARTING a batch is not, and
      // must never happen just because the page was opened. The fallback that
      // submits one now sits behind the explicit "Run baseline" button below.
      seedBaselineFromStep3();
    }
    // Resume polling for every package with a live batch that has not settled.
    // Keyed on "not settled" rather than "queued || running" so a package left
    // in any other in-between state still gets picked back up - the backend only
    // reconciles finished EPSM results while this endpoint is being polled, so a
    // package nobody polls stays queued in the database indefinitely.
    for (const pkg of existing) {
      if (pkg.batchId && pkg.buildings.some((b) => !isBuildingSettled(b) && b.status !== "failed")) {
        pollBatch(pkg.id, pkg.batchId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometries.length]);

  useEffect(() => {
    const handles = pollHandles.current;
    return () => { Object.values(handles).forEach(clearInterval); };
  }, []);

  useEffect(() => {
    let active = true;
    if (isUK) {
      api.energyPrice("gb", project.city).then((r) => {
        if (!active || !r.retail) return;
        setUkTariffs({
          electricityGbpPerKwh: r.retail.electricity.unit_gbp_per_kwh,
          gasGbpPerKwh: r.retail.gas.unit_gbp_per_kwh,
          zone: r.zone ?? null,
        });
      }).catch(() => {});
    } else if (!isBE) {
      api.energyPrice("se").then((r) => {
        if (active && r.live && r.average_price != null) setLivePriceSek(r.average_price);
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [isUK, isBE, project.city]);
  const ukHvac = useMemo(() => (isUK ? ukHvacCatalogue(ukTariffs) : undefined), [isUK, ukTariffs]);

  /* ── derived: items/areas/recommendations for the active line item (Sweden only) ── */
  const activeItem = lineItems.find((li) => li.key === activeItemKey) ?? lineItems[0];
  // Supplier discount the owner gets off catalogue material prices — deducted from
  // every material cost downstream (picker display, saved configs, packages, optimizer)
  // because we discount the catalogue at the source here.
  const discountMul = 1 - Math.min(90, Math.max(0, project.supplierDiscountPct || 0)) / 100;
  const discountItems = (items: WikellsItem[]) =>
    project.supplierDiscountPct ? items.map((it) => ({ ...it, costSEK: it.costSEK != null ? it.costSEK * discountMul : it.costSEK })) : items;
  /* Everything in the picker describes the building selected in 4.1: its
     quantities, its as-built U, and therefore its recommendations. "All
     buildings" uses the first as the representative one. */
  const pickedIdx = targetIdx === "all" ? 0 : targetIdx;
  const pickedGeo = geometries[pickedIdx] ?? geometries[0] ?? null;
  /* Sweden picks complete Wikells assemblies. The UK and Belgium pick from their
     own materials catalogues, turned into options for THIS building: the
     insulation added to its current U, priced and carbon-rated per m² from the
     workbook (config/materialCatalogue.ts). Same item shape, so everything
     downstream - picker, recommendations, build-ups, packages - is shared. */
  const catalogueFor = (li: AreaLineItem): WikellsItem[] =>
    isUK || isBE
      ? catalogueAssembliesFor(isUK ? "gb" : "be", li.key, baselineUForKey(li.key, pickedGeo))
      : itemsForLineItem(li);
  const activeCatalogue = activeItem ? discountItems(catalogueFor(activeItem)) : [];
  // UK / Belgium layer builder: the catalogue's materials plus this building's
  // existing construction as the first layer (config/materialCatalogue.ts).
  const layerCountry = isUK ? "gb" as const : isBE ? "be" as const : null;
  const activeLayerKind = activeItem ? kindForKey(activeItem.key) : null;
  /* Two ways to renovate a wall/roof/floor, in every country: ADD to what is
     there (the existing construction is the first layer, so the U includes it),
     or REPLACE it with a new build-up (U from the new layers alone). Both reach
     EnergyPlus as that component's U; "replace" also lifts the UK/BE clamp. */
  const [layerMode, setLayerMode] = useState<"add" | "replace">("add");
  const activeLayerMaterials = useMemo(
    () => (activeItem && activeLayerKind
      ? layerMaterialsFor(layerCountry ?? "se", activeLayerKind, baselineUForKey(activeItem.key, pickedGeo), layerMode)
      : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layerCountry, activeItem?.key, activeLayerKind, pickedGeo, layerMode]);
  const activeBoverket = activeItem ? (boverketByComponent[activeItem.boverketComponent] ?? []) : [];

  const activeRecommendations = useMemo(
    () => (activeItem ? recommendationsForLineItem(activeCatalogue, activeBoverket, project.selectedKpis, baselineUForKey(activeItem.key, pickedGeo)) : {}),
    // pickedGeo included: the recommendations are scored against THAT building's
    // as-built U, so they must recompute when the 4.1 selection changes.
    [activeItem, activeCatalogue, activeBoverket, project.selectedKpis, pickedGeo]
  );
  const activeQuantity = activeItem && pickedGeo
    ? computeAreaForLineItem(activeItem, pickedGeo, wwrByIndex[pickedIdx] ?? null, manualOverrides)
    : null;

  const itemByCode = useMemo(() => {
    const mul = 1 - Math.min(90, Math.max(0, project.supplierDiscountPct || 0)) / 100;
    const all = lineItems.flatMap((li) =>
      catalogueFor(li).map((it) => ({ ...it, costSEK: it.costSEK != null ? it.costSEK * mul : it.costSEK })));
    return Object.fromEntries(all.map((i) => [i.code, i]));
    // catalogueFor depends on the country and (UK/BE) on the picked building's U.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineItems, project.supplierDiscountPct, isUK, isBE, pickedGeo]);

  const boverketAll = useMemo(() => Object.values(boverketByComponent).flat(), [boverketByComponent]);


  /* ── Configuration library: save / delete / derive packages ─────────────── */
  const allItems = useMemo(() => Object.values(itemByCode), [itemByCode]);

  function saveCatalogueConfig(code: string) {
    if (!activeItem) return;
    const it = itemByCode[code];
    if (!it) return;
    setConfigs((cs) => [...cs, {
      id: `cfg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      componentKey: activeItem.key,
      name: draftName.trim() || matShort(it),
      source: "catalogue", wikellsCode: code,
      // A Wikells row is a complete construction (replaces the component); a UK/BE
      // catalogue option is insulation ADDED to it; windows are always replaced.
      mode: activeItem.key === "Windows" || (!isUK && !isBE) ? "replace" : "add",
      uValue: it.uValue ?? null,
      // A UK/BE material with no price in the catalogue stays "cost —", never free.
      costPerM2: (it as CatalogueAssembly).costMissing ? null : (it.costSEK ?? null),
      carbonPerM2: estimateCarbon(it, boverketAll).value ?? null,
    }]);
    setDraftName("");
  }

  function saveLayerConfig() {
    if (!activeItem) return;
    const kind = kindForKey(activeItem.key);
    if (!kind || draftLayers.length === 0) return;
    // UK / Belgium: layers come from the country catalogue and are priced and
    // carbon-rated layer by layer from it (structural layers in "replace" mode are
    // not in the workbook and are listed as such).
    const verb = layerMode === "add" ? "+" : "new";
    if (layerCountry && activeLayerMaterials) {
      const byId = Object.fromEntries(activeLayerMaterials.map((m) => [m.id, m]));
      const u = computeAssemblyU(draftLayers, kind, byId);
      const cc = catalogueLayerCostCarbon(layerCountry, draftLayers);
      const added = draftLayers.filter((l) => byId[l.materialId]?.category === "insulation")
        .map((l) => `${l.thicknessMm} mm ${byId[l.materialId]!.label.toLowerCase()}`).join(" + ") || "custom";
      setConfigs((cs) => [...cs, {
        id: `cfg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        componentKey: activeItem.key,
        name: draftName.trim() || `${verb} ${added} · U ${u.uValue?.toFixed(2) ?? "—"}`,
        source: "layers", layers: draftLayers, uValue: u.uValue, mode: layerMode,
        costPerM2: cc.costPerM2, carbonPerM2: cc.carbonPerM2,
        carbonUnmatched: [...cc.unpriced.map((n) => `${n} (no price)`), ...cc.noCarbon.map((n) => `${n} (no carbon)`)],
      }]);
      setDraftLayers([]); setDraftName("");
      return;
    }
    // Sweden: U from the stack (with the existing construction in "add" mode);
    // carbon per layer from Boverket (the existing layer adds none).
    const byIdSE = activeLayerMaterials ? Object.fromEntries(activeLayerMaterials.map((m) => [m.id, m])) : undefined;
    const u = computeAssemblyU(draftLayers, kind, byIdSE);
    const carbon = computeAssemblyCarbon(draftLayers, boverketAll);
    // Cost is quoted from the nearest REAL Wikells assembly (Wikells prices
    // complete sections, never single layers). It is matched on the NEW layers
    // only — the existing construction is excluded — so the same materials cost
    // the same whether added or used to rebuild; add/replace changes U and energy only.
    const newLayers = draftLayers.filter((l) => l.materialId !== EXISTING_LAYER_ID);
    const uNew = newLayers.length ? computeAssemblyU(newLayers, kind, byIdSE).uValue : null;
    const cost = nearestWikellsAssembly(uNew, kind, allItems);
    // Name the actual insulation (mineral wool, EPS, wood fibre …) not a generic
    // "mm ins." — with look-alike U-values the material is what tells packages apart.
    const insLayers = draftLayers.filter((l) => l.materialId.startsWith("mw_")
      || ["eps", "xps", "pir", "cellulose", "wood_fibre"].includes(l.materialId));
    const insName = insLayers.length
      ? insLayers.map((l) => `${l.thicknessMm} mm ${(MATERIAL_BY_ID[l.materialId]?.label ?? "insulation").toLowerCase()}`).join(" + ")
      : "custom";
    setConfigs((cs) => [...cs, {
      id: `cfg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      componentKey: activeItem.key,
      name: draftName.trim() || `${verb} ${insName} · U ${u.uValue?.toFixed(2) ?? "—"}`,
      source: "layers", layers: draftLayers, uValue: u.uValue, mode: layerMode,
      costPerM2: cost?.costSEK ?? null, costFromCode: cost?.code, costDeltaU: cost?.deltaU,
      carbonPerM2: carbon.total, carbonUnmatched: carbon.unmatched,
    }]);
    setDraftLayers([]); setDraftName("");
  }

  const removeConfig = (id: string) => setConfigs((cs) => cs.filter((c) => c.id !== id));

  /** Tick = save this catalogue assembly as a configuration; untick = remove it. */
  function toggleCatalogueConfig(code: string) {
    if (!activeItem) return;
    const existing = configs.find(
      (c) => c.componentKey === activeItem.key && c.source === "catalogue" && c.wikellsCode === code,
    );
    if (existing) removeConfig(existing.id);
    else saveCatalogueConfig(code);
  }

  /** Catalogue codes already saved for the active component — drives the ticks. */
  const activeCatalogueCodes = useMemo(
    () => (activeItem
      ? configs.filter((c) => c.componentKey === activeItem.key && c.source === "catalogue")
               .map((c) => c.wikellsCode!).filter(Boolean)
      : []),
    [configs, activeItem],
  );

  /* Packages = cartesian product across components that have configurations. */
  const configuredComponents = useMemo(
    () => lineItems
      .map((item) => ({ item, cfgs: configs.filter((c) => c.componentKey === item.key) }))
      .filter((x) => x.cfgs.length > 0),
    [lineItems, configs],
  );

  const packageCombosList = useMemo(() => {
    let combos: ComponentConfig[][] = [[]];
    for (const { cfgs } of configuredComponents) {
      combos = combos.flatMap((c) => cfgs.map((cfg) => [...c, cfg]));
    }
    return configuredComponents.length ? combos : [];
  }, [configuredComponents]);

  /** Every building that has saved build-ups, with its own package combinations.
   *  4.1 designs one building at a time; 4.2 has to show the whole picture. */
  const combosByBuilding = useMemo(() => {
    const combosFor = (cfgs: ComponentConfig[]) => {
      const grouped = lineItems
        .map((item) => cfgs.filter((c) => c.componentKey === item.key))
        .filter((a) => a.length > 0);
      if (!grouped.length) return [] as ComponentConfig[][];
      let combos: ComponentConfig[][] = [[]];
      for (const g of grouped) combos = combos.flatMap((c) => g.map((cfg) => [...c, cfg]));
      return combos;
    };
    return Object.entries(configsByBuilding)
      .filter(([, cfgs]) => cfgs.length > 0)
      .map(([key, cfgs]) => ({
        key,
        label: key === "all"
          ? `All buildings (${geometries.length})`
          : geometries[Number(key)]?.address ?? `Building ${Number(key) + 1}`,
        combos: combosFor(cfgs),
      }))
      .filter((b) => b.combos.length > 0);
  }, [configsByBuilding, lineItems, geometries]);

  const totalCombosAllBuildings = combosByBuilding.reduce((n, b) => n + b.combos.length, 0);

  // Stage section refs for auto-scrolling when a view opens
  const stageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const prevOpenStage = useRef(openStage);

  // (There is no auto-advance between views any more: with four views chosen from
  // the overview, moving the user on its own - which once collapsed the Pareto
  // chart a second after it drew - only ever surprised them. The one deliberate
  // move left is Run → Results.)

  // Auto-scroll to the newly opened stage
  useEffect(() => {
    if (openStage !== prevOpenStage.current) {
      prevOpenStage.current = openStage;
      if (openStage !== null) {
        const el = stageRefs.current[openStage];
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [openStage]);

  const comboKey = (combo: ComponentConfig[]) => combo.map((c) => c.id).join("+");
  const activeCombos = packageCombosList.filter((c) => !excludedCombos.has(comboKey(c)));

  /* ── add a new package ─────────────────────────────────────────────────── */
  const PACKAGE_COLORS = ["var(--brand)", "#4ECDC4", "#E8880C", "#2FB477", "#F97316", "#5FA5FF"];

  // Short material label for auto-naming, e.g. "300 blown glass wool".
  function matShort(it?: WikellsItem): string {
    if (!it) return "?";
    return it.description
      .replace(/^(EW |IW |Intermediate floor |Attic floor |Ground floor |Terrace slab )/i, "")
      .replace(/\s+with .*$/i, "")
      .trim()
      .slice(0, 30);
  }

  // Build ONE package per combination of the materials selected across
  // components (cartesian product). Pick 2 walls + 2 roofs → 4 packages, each
  // auto-named from the chosen materials.
  function addPackage() {
    if (geometries.length === 0) return;
    if (isUK || isBE) {
      addUkPackage();
      return;
    }
    const chosen = lineItems
      .map((item) => ({ item, codes: draftSelection[item.key] ?? [] }))
      .filter((c) => c.codes.length > 0);
    if (chosen.length === 0) return;

    let combos: Array<Record<string, string>> = [{}];
    for (const { item, codes } of chosen) {
      combos = combos.flatMap((combo) => codes.map((code) => ({ ...combo, [item.key]: code })));
    }

    const existing = packages.filter((p) => !p.isBaseline).length;
    const prefix = packageName.trim();
    const stamp = Date.now();

    const newPkgs: RenovationCalcPackage[] = combos.map((combo, k) => {
      const selections: Record<string, RenovationCalcSelection> = Object.fromEntries(
        Object.entries(combo).map(([key, code]) => [key, { wikellsCode: code, quantity: 0 } as RenovationCalcSelection]),
      );
      const autoName = chosen.map(({ item }) => matShort(itemByCode[combo[item.key]!])).join(" + ");
      const name = (prefix ? `${prefix} — ${autoName}` : autoName) + targetSuffix();
      const color = PACKAGE_COLORS[(existing + k) % PACKAGE_COLORS.length]!;
      const buildingRows = makeBuildingRows(targetEntries, (g, i) => {
        let costSEK = 0, carbonKgCO2e = 0, any = false;
        for (const { item } of chosen) {
          const sel = selections[item.key];
          if (!sel) continue;
          const quantity = computeAreaForLineItem(item, g, wwrByIndex[i] ?? null, manualOverrides);
          if (quantity == null) continue;
          const wikellsItem = itemByCode[sel.wikellsCode];
          if (wikellsItem) {
            any = true;
            costSEK += wikellsItem.costSEK * quantity;
            carbonKgCO2e += estimateCarbon(wikellsItem, boverketAll).value * quantity;
          }
        }
        return any ? { costSEK: Math.round(costSEK), carbonKgCO2e: Math.round(carbonKgCO2e) } : { costSEK: null, carbonKgCO2e: null };
      });
      return { id: `pkg-${stamp}-${k}-${Math.round(Math.random() * 1e6)}`, name, color, isBaseline: false, selections, batchId: null, buildings: buildingRows };
    });

    setProject({ renovationCalcPackages: [...packages, ...newPkgs] });
    // Pressing Run means "show me the outcome" - open Results and scroll to it,
    // instead of leaving the user on the builder wondering where the run went.
    justRanRef.current = true;
    setOpenStage(3);
    setTimeout(() => stageRefs.current[3]?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    setPackageName("");
    setDraftSelection({});
    newPkgs.forEach((pkg) => submitBatch(pkg.id, overridesFromSeSelections(pkg.selections, itemByCode), pkg.name, targetEntries));
  }

  /** Simulate every selected combination: one EPSM batch per package, across all
   *  targeted buildings. A layer-composed configuration passes its computed U
   *  through `customUValue`, which replaces the catalogue U in the IDF. */
  function simulateAllBuildings() {
    if (!combosByBuilding.length) return;
    const stamp = Date.now();
    let seq = packages.filter((p) => !p.isBaseline).length;
    const newPkgs: RenovationCalcPackage[] = [];
    const entriesFor = (key: string): GeoEntry[] =>
      key === "all" ? allEntries : (geometries[Number(key)] ? [{ g: geometries[Number(key)]!, idx: Number(key) }] : allEntries);

    for (const b of combosByBuilding) {
      const entries = entriesFor(b.key);
      for (const combo of b.combos) {
        const selections: Record<string, RenovationCalcSelection> = Object.fromEntries(
          combo.map((c) => [c.componentKey, {
            wikellsCode: c.wikellsCode ?? "", quantity: 0,
            ...(c.uValue != null ? { customUValue: c.uValue } : {}),
            ...(c.name ? { customLabel: c.name } : {}),
            ...(c.layers ? { layers: c.layers } : {}),
            ...(c.mode ? { mode: c.mode } : {}),
          } as RenovationCalcSelection]),
        );
        const name = `${combo.map((c) => c.name).join(" + ")} · ${b.label}`;
        newPkgs.push({
          id: `pkg-${stamp}-${seq}-${Math.round(Math.random() * 1e6)}`,
          name, color: PACKAGE_COLORS[seq % PACKAGE_COLORS.length]!, isBaseline: false,
          selections, batchId: null,
          buildings: makeBuildingRows(entries, (g, i) => configsCostCarbon(combo, g, i)),
        });
        seq++;
      }
    }

    setProject({ renovationCalcPackages: [...packages, ...newPkgs] });
    justRanRef.current = true;
    setOpenStage(3);
    setTimeout(() => stageRefs.current[3]?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    newPkgs.forEach((pkg, k) => {
      const key = combosByBuilding.flatMap((b) => b.combos.map(() => b.key))[k]!;
      submitBatch(pkg.id, overridesFromSeSelections(pkg.selections, itemByCode), pkg.name, entriesFor(key));
    });
  }

  /** Cost and carbon of a set of saved build-ups on one building. A material
   *  with no price makes the package cost UNKNOWN (null → "—"), never £0 — a
   *  missing catalogue price must not make a package look free. */
  function configsCostCarbon(cfgs: ComponentConfig[], g: ResolvedBuildingGeometry, i: number) {
    let cost = 0, carbon = 0, anyQty = false, anyCarbon = false, unpriced = false;
    for (const cfg of cfgs) {
      const li = lineItems.find((l) => l.key === cfg.componentKey);
      if (!li) continue;
      const qty = computeAreaForLineItem(li, g, wwrByIndex[i] ?? null, manualOverrides);
      if (qty == null) continue;
      anyQty = true;
      if (cfg.costPerM2 != null) cost += cfg.costPerM2 * qty; else unpriced = true;
      if (cfg.carbonPerM2 != null) { carbon += cfg.carbonPerM2 * qty; anyCarbon = true; }
    }
    return {
      costSEK: anyQty && !unpriced ? Math.round(cost) : null,
      carbonKgCO2e: anyCarbon ? Math.round(carbon) : null,
    };
  }

  /** onlyNew: submit just the designed combinations that have no run yet
   *  (the Results view's button), instead of re-running all of them. */
  function simulateConfiguredPackages(onlyNew = false) {
    const combos = onlyNew ? unsimulatedCombos : activeCombos;
    if (geometries.length === 0 || combos.length === 0) return;
    const existing = packages.filter((p) => !p.isBaseline).length;
    const stamp = Date.now();

    const newPkgs: RenovationCalcPackage[] = combos.map((combo, k) => {
      const selections: Record<string, RenovationCalcSelection> = {};
      combo.forEach((cfg) => {
        selections[cfg.componentKey] = {
          wikellsCode: cfg.wikellsCode ?? "",
          quantity: 0,
          configId: cfg.id,
          ...(cfg.source === "layers" && cfg.uValue != null
            ? { customUValue: cfg.uValue, customLabel: cfg.name, layers: cfg.layers }
            : {}),
          ...(cfg.mode ? { mode: cfg.mode } : {}),
        };
      });
      const name = combo.map((c) => c.name).join(" + ") + targetSuffix();
      const color = PACKAGE_COLORS[(existing + k) % PACKAGE_COLORS.length]!;
      const buildingRows = makeBuildingRows(targetEntries, (g, i) => configsCostCarbon(combo, g, i));
      return {
        id: `pkg-${stamp}-${k}-${Math.round(Math.random() * 1e6)}`,
        name, color, isBaseline: false, selections, batchId: null, buildings: buildingRows,
      };
    });

    setProject({ renovationCalcPackages: [...packages, ...newPkgs] });
    // Pressing Run means "show me the outcome" - open Results and scroll to it,
    // instead of leaving the user on the builder wondering where the run went.
    justRanRef.current = true;
    setOpenStage(3);
    setTimeout(() => stageRefs.current[3]?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    newPkgs.forEach((pkg) =>
      submitBatch(pkg.id, overridesFromSeSelections(pkg.selections, itemByCode), pkg.name, targetEntries));
  }

  function addUkPackage() {
    if (geometries.length === 0 || !ukArchetype || !ukTier) return;
    const tier = ukArchetype[ukTier];
    const tierMeta = REFURB_TIERS.find((t) => t.key === ukTier)!;

    const id = `pkg-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const name = (packageName.trim() || tierMeta.label) + targetSuffix();
    const color = PACKAGE_COLORS[packages.filter((p) => !p.isBaseline).length % PACKAGE_COLORS.length]!;

    // UK money is GBP; the package row's field is still named costSEK (shared
    // with Sweden) and every UK display formats it as £.
    const buildingRows = makeBuildingRows(targetEntries, (g, idx) => {
      // Belgium: no open retrofit cost/carbon source wired in yet - show "—", not a UK figure.
      if (isBE) return { costSEK: null, carbonKgCO2e: null };
      const est = ukTierCostCarbon(ukArchetype.as_built, tier, ukQuantitiesFor(g, wwrByIndex[idx] ?? null));
      return { costSEK: est.costGbp, carbonKgCO2e: est.carbonKgCo2e };
    });

    const pkg: RenovationCalcPackage = {
      id, name, color, isBaseline: false,
      selections: { [UK_TIER_SELECTIONS_KEY]: { wikellsCode: ukTier, quantity: 1 } },
      batchId: null, buildings: buildingRows,
    };
    setProject({ renovationCalcPackages: [...packages, pkg] });
    setPackageName("");
    setUkTier(null);
    // Same as the Swedish Run: open Results so the run is visible.
    justRanRef.current = true;
    setOpenStage(3);
    setTimeout(() => stageRefs.current[3]?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    submitBatch(id, ukOverridesFromTier(tier), name, targetEntries);
  }

  function retryPackage(pkg: RenovationCalcPackage) {
    if (geometries.length === 0) return;
    let overrides: Record<string, number> = {};
    if (isUK || isBE) {
      const sel = pkg.selections[UK_TIER_SELECTIONS_KEY];
      const tierKey = sel?.wikellsCode as RefurbTierKey | undefined;
      const tier = tierKey && ukArchetype ? ukArchetype[tierKey] : null;
      overrides = ukOverridesFromTier(tier);
    } else {
      overrides = overridesFromSeSelections(pkg.selections, itemByCode);
    }
    // Retry the SAME buildings this package targets (matched back to their geometry).
    const entries: GeoEntry[] = pkg.buildings
      .map((b) => {
        const idx = geometries.findIndex((g) => g.lat === b.lat && g.lon === b.lon);
        return idx >= 0 ? { g: geometries[idx]!, idx } : null;
      })
      .filter((e): e is GeoEntry => e !== null);
    if (entries.length === 0) return;
    setProject({
      renovationCalcPackages: useWizardStore.getState().project.renovationCalcPackages.map((p) =>
        p.id === pkg.id ? { ...p, buildings: p.buildings.map((b) => ({ ...b, status: "queued" as const, error: null })) } : p
      ),
    });
    submitBatch(pkg.id, overrides, pkg.name, entries);
  }

  const saved = project.selectedPackageByBuilding ?? {};
  const baselinePkg = packages.find((p) => p.isBaseline);
  const baselineRunning = !!baselinePkg?.buildings.some(isBuildingRunning);
  const baselineAgg = baselinePkg ? pkgAggregate(baselinePkg) : null;

  // The city climate target is assessed in Step 5 (Report), from the packages
  // simulated here - see config/climateGoals.ts.

  /* ── Regret / robustness decision analysis (Step 4 → Step 5 report) ──────────
     Score each package + the do-nothing baseline by its 30-yr net benefit under
     Low/Medium/High energy-price scenarios, then rank by minimax regret, range
     and Hurwicz. Uncertain future prices → no single "best"; these rules help. */
  // Prices and decision style are now chosen in Step 5; these are the defaults it starts from.
  const regretAlpha = 0.5;
  const [regretPrices, setRegretPrices] = useState<number[]>([0.5, 1.0, 2.0]); // SEK/kWh Low/Med/High (GBP for UK)
  /* UK homes mostly heat with gas, so one electricity price would overvalue
     heating savings ~3x. Blend the two retail tariffs by the baseline's heating
     share of total energy: heating at the gas price, the rest at electricity. */
  const ukBlend = useMemo(() => {
    if (!isUK || !ukHvac) return null;
    const total = baselineAgg?.avgTotalKwhM2Yr, heat = baselineAgg?.avgHeatingKwhM2Yr;
    if (total == null || heat == null || total <= 0) return null;
    const share = Math.min(1, Math.max(0, heat / total));
    const gas = ukHvac.carriers.gas!.tariffSek, elec = ukHvac.carriers.electricity!.tariffSek;
    return { price: Math.round((share * gas + (1 - share) * elec) * 1000) / 1000, share, gas, elec };
  }, [isUK, ukHvac, baselineAgg?.avgTotalKwhM2Yr, baselineAgg?.avgHeatingKwhM2Yr]);
  const ukScenarioSeeded = useRef(false);
  useEffect(() => {
    if (!ukBlend || ukScenarioSeeded.current) return;
    ukScenarioSeeded.current = true;
    const p = ukBlend.price;
    setRegretPrices([0.5, 1, 2].map((m) => Math.round(p * m * 100) / 100));
  }, [ukBlend]);
  const totalFloorAreaM2 = useMemo(
    () => geometries.reduce((a, g) => a + (g.footprintM2 ?? 0) * Math.max(1, Math.round((g.height ?? 3.2) / 3.2)), 0),
    [geometries],
  );
  const regretOptions = useMemo<RegretOptionInput[]>(() => {
    const base = baselineAgg?.avgTotalKwhM2Yr;
    if (base == null) return [];
    const opts: RegretOptionInput[] = [{ id: "baseline", label: "Keep as-built (do nothing)", energyKwhM2: base, investmentSek: 0, isBaseline: true }];
    for (const p of packages) {
      if (p.isBaseline) continue;
      const agg = pkgAggregate(p);
      if (agg.avgTotalKwhM2Yr == null) continue; // only options that have an energy result
      opts.push({ id: p.id, label: p.name, energyKwhM2: agg.avgTotalKwhM2Yr, investmentSek: agg.totalCostSEK ?? 0 });
    }
    return opts;
  }, [packages, baselineAgg?.avgTotalKwhM2Yr]);
  const regretResult = useMemo(() => {
    if (regretOptions.length < 2 || baselineAgg?.avgTotalKwhM2Yr == null || totalFloorAreaM2 <= 0) return null;
    if (isUK && !ukBlend) return null;
    if (isBE) return null;
    const scenarios = [
      { key: "low", label: "Low", priceSek: regretPrices[0]! },
      { key: "med", label: "Medium", priceSek: regretPrices[1]! },
      { key: "high", label: "High", priceSek: regretPrices[2]! },
    ];
    const af = annuityFactor(assumptionValue(isUK ? "UK" : "SE", "discount_rate") ?? 0.03, 30);
    const res = computeRegret(regretOptions, scenarios,
      { baselineEnergyKwhM2: baselineAgg.avgTotalKwhM2Yr, totalFloorAreaM2, annuityFactor: af }, regretAlpha, 30, "");
    if (!isUK || !ukBlend) return res;
    return {
      ...res, currency: "GBP" as const,
      priceBasis: `Blended £/kWh: ${Math.round(ukBlend.share * 100)}% of baseline energy is heating at the gas price (£${ukBlend.gas}/kWh), `
        + `the rest at electricity (£${ukBlend.elec}/kWh) — Ofgem price cap, ${ukTariffs?.zone ?? "Yorkshire"}. Package costs are 2020 prices, ex VAT.`,
    };
  }, [isUK, isBE, ukBlend, ukTariffs?.zone, regretOptions, baselineAgg?.avgTotalKwhM2Yr, totalFloorAreaM2, regretPrices, regretAlpha]);
  // Persist to the store for Step 5, which now shows (and recomputes) the price
  // scenarios: the result for the report, and the INPUTS so the user can change
  // the future prices and decision style there. Only when the content changes,
  // and never overwriting the prices/alpha the user set in Step 5.
  const regretSigRef = useRef<string>("");
  useEffect(() => {
    if (!regretResult) return;
    const af = annuityFactor(assumptionValue(isUK ? "UK" : "SE", "discount_rate") ?? 0.03, 30);
    const inputs = {
      options: regretOptions,
      config: { baselineEnergyKwhM2: baselineAgg?.avgTotalKwhM2Yr ?? 0, totalFloorAreaM2, annuityFactor: af },
      defaultPrices: regretPrices,
      currentPrice: isUK ? (ukBlend?.price ?? 0) : (livePriceSek ?? assumptionValue("SE", "energy_price") ?? 0.8),
      currency: (isUK ? "GBP" : "SEK") as "SEK" | "GBP",
      priceBasis: regretResult.priceBasis,
      studyPeriodYr: 30,
    };
    const sig = JSON.stringify(inputs);
    if (sig === regretSigRef.current) return;
    regretSigRef.current = sig;
    const prev = useWizardStore.getState().project.regretInputs;
    setProject({
      regretAnalysis: { ...regretResult, generatedAt: new Date().toISOString() },
      regretInputs: { ...inputs, settings: prev?.settings },
    });
  }, [regretResult, regretOptions, regretPrices, baselineAgg?.avgTotalKwhM2Yr, totalFloorAreaM2,
      isUK, ukBlend?.price, livePriceSek, setProject]);

  /* ── Multi-objective optimizer input (Sweden) ────────────────────────────
     Build the per-component option matrix + economy/climate params from the
     already-resolved geometry, cost, carbon and EPSM baseline. The optimizer
     searches every combination on the fast physics; winners are validated in
     EPSM via validateOptimizerPick below. */
  const optimizerInput = useMemo((): { input: { components: OptimizeComponentInput[]; params: OptimizeParams } | null; disabledReason?: string; note?: string } => {
    const repIdx = targetIdx === "all" ? 0 : targetIdx;
    // UK with no saved build-ups: the DESNZ measure set (installed costs). Once
    // materials are picked from the catalogue, the UK optimises over those -
    // the same as Sweden and Belgium, further down.
    if (isUK && configs.length === 0) {
      const g = geometries[repIdx];
      if (!g) return { input: null, disabledReason: "No building resolved yet." };
      const baseTotal = baselinePkg?.buildings[repIdx]?.totalKwhM2Yr ?? null;
      if (baseTotal == null) return { input: null, disabledReason: "Waiting for the baseline EnergyPlus run to finish…" };
      const areas = ukOptimiserAreas(g, wwrByIndex[repIdx] ?? null);
      if (!areas.heated) return { input: null, disabledReason: "Heated floor area unknown for this building." };
      const opts = ukOptionsFor(g, wwrByIndex[repIdx] ?? null);
      const cur = g.currentU;
      const baseU: Record<string, number> = {
        Walls: cur?.wall ?? g.tabulaUWall ?? 1.6, Roof: cur?.roof ?? g.tabulaURoof ?? 2.3,
        Windows: cur?.win ?? g.tabulaUWin ?? 2.8, Floor: cur?.floor ?? g.tabulaUFloor ?? 0.7,
      };
      const comps: OptimizeComponentInput[] = UK_OPT_COMPONENTS
        .filter((k) => (opts[k] ?? []).length > 0 && areas[k] > 0)
        .map((k) => ({
          key: k, area_m2: Math.round(areas[k]), baseline_u: baseU[k]!,
          options: opts[k]!.map((o) => ({ code: `uk:${o.code}`, label: o.label, u_value: o.uValue, cost: o.costGbp, carbon: o.carbonKgCo2e })),
        }));
      if (comps.length === 0) return { input: null, disabledReason: "This building's certificates already describe insulated fabric - no measure would lower its U-values." };
      // The optimiser values USEFUL heat: a gas-heated home pays gas / boiler efficiency per kWh of heat.
      const eff = assumptionValue("UK", "boiler_efficiency") ?? 0.85;
      const gas = ukHvac?.carriers.gas;
      const params: OptimizeParams = {
        f_dh: (24 * (assumptionValue("UK", "degree_days") ?? 2108)) / 1000,
        energy_price: Math.round(((gas?.tariffSek ?? assumptionValue("UK", "gas_price") ?? 0.079) / eff) * 1000) / 1000,
        carbon_factor_heat: Math.round(((gas?.carbonKgPerKwh ?? assumptionValue("UK", "carbon_factor_heat") ?? 0.213) / eff) * 1000) / 1000,
        discount_rate: assumptionValue("UK", "discount_rate") ?? 0.035,
        study_period_yr: 30,
        floor_area_m2: Math.round(areas.heated),
        baseline_total_kwh_m2_yr: baseTotal,
        baseline_heating_kwh_m2_yr: baselinePkg?.buildings[repIdx]?.heatingKwhM2Yr ?? undefined,
      };
      return { input: { components: comps, params } };
    }
    const repGeo = geometries[repIdx];
    if (!repGeo) return { input: null, disabledReason: "No building resolved yet." };
    const baseTotal = baselinePkg?.buildings[repIdx]?.totalKwhM2Yr ?? null;
    if (baseTotal == null) return { input: null, disabledReason: "Waiting for the baseline EnergyPlus run to finish…" };
    const footprint = repGeo.footprintM2 ?? 0;
    const floors = Math.max(1, Math.round((repGeo.height ?? 3.2) / 3.2));
    const floorArea = footprint * floors;
    if (!floorArea) return { input: null, disabledReason: "Building floor area unknown for this building." };

    const comps: OptimizeComponentInput[] = [];
    const unpricedNames: string[] = [];
    for (const li of lineItems) {
      const baseU = baselineUForKey(li.key, geometries[repIdx] ?? pickedGeo);
      if (baseU == null) continue; // not a U-override component
      const area = computeAreaForLineItem(li, repGeo, wwrByIndex[repIdx] ?? null, manualOverrides);
      if (area == null || area <= 0) continue;
      // Vary over EVERY saved configuration for this component — both single
      // catalogue rows AND layer-composed assemblies — exactly the same set that
      // the packages are built from, so the optimizer evaluates all combinations
      // (3 walls × 5 roofs = 15), not just the catalogue subset. Each config
      // already carries its own U / cost / carbon (per m²), computed when saved.
      // A build-up with no price can't be traded off on cost (it would enter as
      // free and win "Cheapest") — leave it out and say so under the chart.
      const compConfigs = configs.filter((c) => c.componentKey === li.key && c.uValue != null && c.costPerM2 != null);
      for (const c of configs) if (c.componentKey === li.key && c.costPerM2 == null) unpricedNames.push(c.name);
      if (compConfigs.length === 0) continue;
      const options = compConfigs.map((c) => ({
        code: c.id,                         // config id — unique; assemblies have no single Wikells code
        label: c.name,
        u_value: c.uValue!,
        cost: Math.round((c.costPerM2 ?? 0) * area),
        carbon: Math.round((c.carbonPerM2 ?? 0) * area),
      }));
      comps.push({ key: li.key, area_m2: Math.round(area), baseline_u: baseU, options });
    }
    const unpricedNote = unpricedNames.length
      ? `Left out of the trade-off — no price in the materials catalogue: ${unpricedNames.join(" · ")}. They can still be simulated in EnergyPlus for energy and carbon.`
      : undefined;
    if (comps.length === 0)
      return { input: null, disabledReason: unpricedNote ?? "Save build-ups per component in the builder above — the trade-off curve appears here and updates as you go." };

    // The rest of the heat loss, kept as-built: envelope parts with no build-up
    // saved, plus air leakage/ventilation. Without them ALL of the simulated
    // heating was blamed on the walls/roof being retrofitted, and the curve
    // promised savings (−57 %) that EnergyPlus then didn't find (−26 %).
    const present = new Set(comps.map((c) => c.key.replace("VertExt::", "")));
    const allAreas = ukOptimiserAreas(repGeo, wwrByIndex[repIdx] ?? null);
    const cur = repGeo.currentU;
    const fallbackU: Record<string, number | null | undefined> = {
      Walls: cur?.wall ?? repGeo.tabulaUWall, Roof: cur?.roof ?? repGeo.tabulaURoof,
      Windows: cur?.win ?? repGeo.tabulaUWin, Floor: cur?.floor ?? repGeo.tabulaUFloor,
    };
    for (const k of UK_OPT_COMPONENTS) {
      if (present.has(k) || !(allAreas[k] > 0)) continue;
      const u = baselineUForKey(k, repGeo) ?? fallbackU[k];
      if (u == null) continue;
      comps.push({ key: k, area_m2: Math.round(allAreas[k]), baseline_u: u, options: [] });
    }
    // Ventilation + infiltration as a fixed conductance: 0.34 Wh/m³K × 0.5 ach × volume.
    const volume = (repGeo.heatedAreaM2 ?? floorArea) * 2.5;
    if (volume > 0) comps.push({ key: "Air leakage (kept)", area_m2: Math.round(volume), baseline_u: 0.34 * (MODEL_ASSUMPTIONS.find((a) => a.key === "air_change")?.value ?? 0.5), options: [] });

    // Economy + climate of the project's own country. UK and Belgian homes mostly
    // burn gas: the price and carbon of USEFUL heat are the gas figures over an
    // 85% boiler efficiency, as in the UK DESNZ branch above.
    const eff = assumptionValue(isUK ? "UK" : "BE", "boiler_efficiency") ?? 0.85;
    const ukGas = ukHvac?.carriers.gas;
    const params: OptimizeParams = isUK ? {
      f_dh: (24 * (assumptionValue("UK", "degree_days") ?? 2108)) / 1000,
      energy_price: Math.round(((ukGas?.tariffSek ?? assumptionValue("UK", "gas_price") ?? 0.079) / eff) * 1000) / 1000,
      carbon_factor_heat: Math.round(((ukGas?.carbonKgPerKwh ?? assumptionValue("UK", "carbon_factor_heat") ?? 0.183) / eff) * 1000) / 1000,
      discount_rate: assumptionValue("UK", "discount_rate") ?? 0.035,
      study_period_yr: 30,
      floor_area_m2: Math.round(repGeo.heatedAreaM2 ?? floorArea),
      baseline_total_kwh_m2_yr: baseTotal,
      baseline_heating_kwh_m2_yr: baselinePkg?.buildings[repIdx]?.heatingKwhM2Yr ?? undefined,
    } : isBE ? {
      f_dh: (24 * (project.city === "Liège" ? 2001 : (assumptionValue("BE", "degree_days") ?? 1820))) / 1000,
      energy_price: Math.round(((assumptionValue("BE", "energy_price") ?? 0.078) / eff) * 1000) / 1000,
      carbon_factor_heat: Math.round(((assumptionValue("BE", "carbon_factor_heat") ?? 0.202) / eff) * 1000) / 1000,
      discount_rate: assumptionValue("BE", "discount_rate") ?? 0.03,
      study_period_yr: 30,
      floor_area_m2: Math.round(repGeo.heatedAreaM2 ?? floorArea),
      baseline_total_kwh_m2_yr: baseTotal,
      baseline_heating_kwh_m2_yr: baselinePkg?.buildings[repIdx]?.heatingKwhM2Yr ?? undefined,
    } : {
      f_dh: (24 * (assumptionValue("SE", "degree_days") ?? 3300)) / 1000,
      energy_price: livePriceSek ?? assumptionValue("SE", "energy_price") ?? 0.8,
      carbon_factor_heat: assumptionValue("SE", "carbon_factor_heat") ?? 0.022,
      discount_rate: assumptionValue("SE", "discount_rate") ?? 0.03,
      study_period_yr: 30,
      floor_area_m2: Math.round(floorArea),
      baseline_total_kwh_m2_yr: baseTotal,
      baseline_heating_kwh_m2_yr: baselinePkg?.buildings[repIdx]?.heatingKwhM2Yr ?? undefined,
    };
    return { input: { components: comps, params }, note: unpricedNote };
  }, [isUK, isBE, project.city, ukHvac, targetIdx, geometries, baselinePkg, lineItems, configs, wwrByIndex, manualOverrides, boverketAll, livePriceSek]);

  // 30-year life-cycle cost for the Results table, on the SAME energy price and
  // discount rate as the optimizer: material cost today + the simulated energy
  // bill over 30 years, discounted (annuity factor). Step 5 varies the price.
  const lccPrice: number | null = optimizerInput.input?.params.energy_price
    ?? (isUK ? (ukBlend?.price ?? null)
      : isBE ? (assumptionValue("BE", "energy_price") ?? 0.078) / (assumptionValue("BE", "boiler_efficiency") ?? 0.85)
      : (livePriceSek ?? assumptionValue("SE", "energy_price") ?? 0.8));
  const lccAF = annuityFactor(optimizerInput.input?.params.discount_rate
    ?? assumptionValue(isUK ? "UK" : isBE ? "BE" : "SE", "discount_rate") ?? 0.03, 30);
  // 30-year carbon on the optimizer's own factor: embodied + 30 years of energy.
  const lcCarbonFactor: number | null = optimizerInput.input?.params.carbon_factor_heat
    ?? (isUK ? (assumptionValue("UK", "carbon_factor_heat") ?? 0.213) / (assumptionValue("UK", "boiler_efficiency") ?? 0.85)
      : isBE ? (assumptionValue("BE", "carbon_factor_heat") ?? 0.202) / (assumptionValue("BE", "boiler_efficiency") ?? 0.85)
      : (assumptionValue("SE", "carbon_factor_heat") ?? 0.022));
  const lcCarbon30 = (embodied: number | null, kwhM2: number | null): number | null =>
    embodied == null || kwhM2 == null || lcCarbonFactor == null || totalFloorAreaM2 <= 0
      ? null
      : Math.round(embodied + kwhM2 * totalFloorAreaM2 * lcCarbonFactor * 30);

  // The optimizer runs here (not inside the chart panel) so the Results table
  // can list every not-yet-simulated package with its estimate, whichever view
  // is open. Debounced: it re-runs as build-ups are saved.
  const [optResult, setOptResult] = useState<OptimizeResponse | null>(null);
  const [optLoading, setOptLoading] = useState(false);
  const [optError, setOptError] = useState<string | null>(null);
  useEffect(() => {
    const inp = optimizerInput.input;
    if (!inp || optimizerInput.disabledReason) { setOptResult(null); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setOptLoading(true); setOptError(null);
      try {
        const res = await api.optimize({ ...inp, max_results: 24 });
        if (!cancelled) setOptResult(res);
      } catch (e) {
        if (!cancelled) setOptError((e as Error).message);
      } finally {
        if (!cancelled) setOptLoading(false);
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(t); };
  }, [optimizerInput]);

  const lcc30 = (costNow: number | null, kwhM2: number | null): number | null =>
    costNow == null || kwhM2 == null || lccPrice == null || totalFloorAreaM2 <= 0
      ? null
      : Math.round(costNow + kwhM2 * totalFloorAreaM2 * lccPrice * lccAF);

  // Which optimizer picks are already validated (as a package) — keyed by the
  // touched (non-"keep") component→material selections, matching the panel.
  // Key a validated package by the config ids it used (matching the optimizer
  // option codes) so the panel can flag which Pareto points are already run.
  const pkgKey = (p: RenovationCalcPackage) =>
    Object.entries(p.selections)
      .filter(([k]) => baselineUForKey(k) != null)
      .map(([k, s]) => `${k}=${s.configId ?? s.wikellsCode}`)
      .sort()
      .join("|");
  // Running = queued/running in EPSM, or just created and still being submitted
  // (batchId not back yet) — otherwise the row flashed "✓ Simulated" on click.
  const isPkgRunning = (p: RenovationCalcPackage) =>
    p.buildings.some((b) => b.status === "queued" || b.status === "running")
    || (p.batchId === null && p.buildings.some((b) => b.status !== "completed" && b.status !== "failed"));
  const validatedKeys = useMemo(
    () => new Set(packages.filter((p) => !p.isBaseline).map(pkgKey)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [packages]
  );
  const runningKeys = useMemo(
    () => new Set(packages.filter((p) => !p.isBaseline && isPkgRunning(p)).map(pkgKey)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [packages]
  );
  // Packages simulated before unpriced materials were treated as unknown stored
  // £0 — clear that cost once so the table says "—" instead of "free".
  useEffect(() => {
    const cfgById = new Map(Object.values(configsByBuilding).flat().map((c) => [c.id, c]));
    let changed = false;
    const next = packages.map((p) => {
      if (p.isBaseline || p.buildings.every((b) => b.costSEK == null)) return p;
      const unpriced = Object.values(p.selections).some((s) => {
        const c = s.configId ? cfgById.get(s.configId) : undefined;
        return !!c && c.costPerM2 == null;
      });
      if (!unpriced) return p;
      changed = true;
      return { ...p, buildings: p.buildings.map((b) => ({ ...b, costSEK: null })) };
    });
    if (changed) setProject({ renovationCalcPackages: next });
  }, [packages, configsByBuilding, setProject]);

  // Same key for a designed (saved) combination, so Results can list the ones
  // not simulated yet and Run can submit only those.
  const comboSimKey = (combo: ComponentConfig[]) =>
    combo.filter((c) => baselineUForKey(c.componentKey) != null)
      .map((c) => `${c.componentKey}=${c.id}`).sort().join("|");
  const unsimulatedCombos = activeCombos.filter((c) => !validatedKeys.has(comboSimKey(c)));

  // Turn one Pareto winner into a real package + EPSM run (drops into the
  // comparison table below alongside any hand-built packages). The optimizer's
  // option codes are ComponentConfig ids, so resolve each back to its saved
  // build-up (single Wikells row OR layer-composed assembly).
  function validateOptimizerPick(point: OptimizePoint, opts?: { auto?: boolean }) {
    if (geometries.length === 0) return;
    // UK with no saved build-ups optimises over the DESNZ measures ("uk:" codes);
    // once build-ups are saved, the options are config ids like everywhere else.
    if (isUK && configs.length === 0) return validateUkOptimizerPick(point, opts);
    const cfgById = new Map(configs.map((c) => [c.id, c]));
    const touched = Object.entries(point.selections)
      .filter(([, code]) => code !== "__keep__")
      .map(([key, code]) => [key, cfgById.get(code)] as const)
      .filter((e): e is readonly [string, ComponentConfig] => !!e[1]);
    if (touched.length === 0) return;
    const selections: Record<string, RenovationCalcSelection> = Object.fromEntries(
      touched.map(([key, cfg]) => [key, {
        wikellsCode: cfg.wikellsCode ?? "",
        quantity: 0,
        configId: cfg.id,
        ...(cfg.source === "layers" && cfg.uValue != null
          ? { customUValue: cfg.uValue, customLabel: cfg.name, layers: cfg.layers }
          : {}),
        ...(cfg.mode ? { mode: cfg.mode } : {}),
      } as RenovationCalcSelection])
    );
    const autoName = touched.map(([, cfg]) => cfg.name).join(" + ");
    const name = autoName + targetSuffix();
    const existing = packages.filter((p) => !p.isBaseline).length;
    const color = PACKAGE_COLORS[existing % PACKAGE_COLORS.length]!;
    const buildingRows = makeBuildingRows(targetEntries, (g, i) => configsCostCarbon(touched.map(([, cfg]) => cfg), g, i));
    const id = `pkg-opt-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const pkg: RenovationCalcPackage = { id, name, color, isBaseline: false, selections, batchId: null, buildings: buildingRows, ...(opts?.auto ? { auto: true } : {}) };
    // Auto picks REPLACE the previous auto-package so exploring the curve doesn't
    // pile up dozens of near-identical "Optimal" runs; manual picks always add.
    // Scoped to THIS building: dropping every auto package meant optimising one
    // building silently deleted another building's optimal pick, which breaks the
    // per-building workflow the rest of Step 4 now follows.
    const sameTarget = (p: RenovationCalcPackage) => {
      if (targetIdx === "all") return p.buildings.length === geometries.length;
      const g = geometries[targetIdx];
      return !!g && p.buildings.length === 1
        && Math.abs(p.buildings[0]!.lat - g.lat) < 1e-6
        && Math.abs(p.buildings[0]!.lon - g.lon) < 1e-6;
    };
    const kept = opts?.auto ? packages.filter((p) => !p.auto || !sameTarget(p)) : packages;
    // Stay on the chart: the row flips to "Running in EnergyPlus…" and then
    // "✓ Simulated", and the package appears under Results.
    justRanRef.current = true;
    setProject({ renovationCalcPackages: [...kept, pkg] });
    submitBatch(id, overridesFromSeSelections(selections, itemByCode), name, targetEntries);
  }

  /** UK Pareto pick -> package: each chosen measure becomes a U-value override,
   *  re-costed per building on that building's own simulated areas. */
  function validateUkOptimizerPick(point: OptimizePoint, opts?: { auto?: boolean }) {
    const repIdx = targetIdx === "all" ? 0 : targetIdx;
    const rep = geometries[repIdx];
    if (!rep) return;
    const repOpts = ukOptionsFor(rep, wwrByIndex[repIdx] ?? null);
    const touched = Object.entries(point.selections)
      .filter(([, code]) => code.startsWith("uk:"))
      .map(([key, code]) => [key, (repOpts[key] ?? []).find((o) => `uk:${o.code}` === code)] as const)
      .filter((e): e is readonly [string, UkMeasureOption] => !!e[1]);
    if (touched.length === 0) return;
    const selections: Record<string, RenovationCalcSelection> = Object.fromEntries(
      touched.map(([key, o]) => [key, { wikellsCode: `uk:${o.code}`, quantity: 0, customUValue: o.uValue, customLabel: o.label }]),
    );
    const name = touched.map(([, o]) => o.label).join(" + ") + targetSuffix();
    const color = PACKAGE_COLORS[packages.filter((p) => !p.isBaseline).length % PACKAGE_COLORS.length]!;
    const buildingRows = makeBuildingRows(targetEntries, (g, i) => {
      const own = ukOptionsFor(g, wwrByIndex[i] ?? null);
      let cost = 0, carbon = 0, any = false;
      for (const [key, o] of touched) {
        const m = (own[key] ?? []).find((x) => x.code === o.code);
        if (m) { cost += m.costGbp; carbon += m.carbonKgCo2e; any = true; }
      }
      return any ? { costSEK: Math.round(cost), carbonKgCO2e: Math.round(carbon) } : { costSEK: null, carbonKgCO2e: null };
    });
    const id = `pkg-opt-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const pkg: RenovationCalcPackage = { id, name, color, isBaseline: false, selections, batchId: null, buildings: buildingRows, ...(opts?.auto ? { auto: true } : {}) };
    const kept = opts?.auto ? packages.filter((p) => !p.auto) : packages;
    justRanRef.current = true;   // stay on the chart (see validateOptimizerPick)
    setProject({ renovationCalcPackages: [...kept, pkg] });
    submitBatch(id, overridesFromSeSelections(selections, itemByCode), name, targetEntries);
  }

  function handleSaveAndContinue() {
    setProject({
      renovationSimResults: packages.filter((p) => !p.isBaseline).map((p, i) => {
        const agg = pkgAggregate(p);
        const total = agg.avgTotalKwhM2Yr ?? baselineAgg?.avgTotalKwhM2Yr ?? 0;
        const baseTotal = baselineAgg?.avgTotalKwhM2Yr ?? total;
        const saving = Math.max(0, Math.round(baseTotal - total));
        const carbonSaving = agg.totalCarbonKgCO2e != null && baselineAgg?.totalCarbonKgCO2e != null
          ? Math.max(0, Math.round(baselineAgg.totalCarbonKgCO2e - agg.totalCarbonKgCO2e))
          : Math.round(saving * 0.2);
        return {
          packageIndex: i + 1,
          name: p.name,
          buildingLabel: p.buildings.length === 1 ? (p.buildings[0]?.address ?? null) : null,
          components: Object.fromEntries(Object.entries(p.selections).map(([k, s]) => {
            if (isBE && k === UK_TIER_SELECTIONS_KEY) {
              const tier = REFURB_TIERS.find((t) => t.key === s.wikellsCode);
              const u = ukArchetype?.[s.wikellsCode as RefurbTierKey];
              return ["Envelope", {
                code: s.wikellsCode,
                description: `${tier?.label ?? s.wikellsCode} (TABULA Belgium${ukArchetype ? `, ${ukArchetype.type_label}` : ""})`,
                costSEK: 0,
                uValue: u?.u_wall,
              }];
            }
            const it = itemByCode[s.wikellsCode];
            const layers = s.layers?.length
              ? s.layers.map((l) => ({
                  name: MATERIAL_BY_ID[l.materialId]?.label ?? catalogueLayerInfo(l.materialId)?.label ?? l.materialId,
                  thicknessMm: l.thicknessMm,
                  category: MATERIAL_BY_ID[l.materialId]?.category ?? catalogueLayerInfo(l.materialId)?.category,
                }))
              : undefined;
            return [k, {
              code: s.wikellsCode,
              // Layer-composed assemblies carry their name/U on the selection, not
              // in the Wikells catalogue — prefer those so the report isn't blank.
              description: s.customLabel ?? it?.description ?? s.wikellsCode,
              costSEK: it?.costSEK ?? 0,
              uValue: s.customUValue ?? it?.uValue,
              layers,
            }];
          })),
          energyUse: total, saving, carbonSaving,
          cost: agg.totalCostSEK ?? 0,
        };
      }),
    });
    try { sessionStorage.setItem("step4.returnView", String(openStage ?? 3)); } catch { /* storage blocked */ }
    navigate("/step/5");
  }

  /* ── One table for every package ─────────────────────────────────────────
     Simulated packages (EnergyPlus figures) and every designed package that
     hasn't run yet (the optimizer's degree-day estimate, marked "≈"), with the
     same columns: cost, carbon, 30-yr cost, 30-yr carbon, heating, total. */
  const optPointKey = (pt: OptimizePoint) =>
    Object.entries(pt.selections).filter(([, v]) => v !== "__keep__").sort().map(([k, v]) => `${k}=${v}`).join("|");
  const estimateRows: EstRow[] = useMemo(() => {
    const baseTot = baselineAgg?.avgTotalKwhM2Yr ?? null;
    if (!optResult || baseTot == null) return [];
    const baseOpt = optResult.baseline.energy_kwh_m2_yr;
    const baseHeat = baselineAgg?.avgHeatingKwhM2Yr ?? null;
    const paretoKeys = new Set(optResult.pareto.map(optPointKey));
    const pts = optResult.all_points?.length ? optResult.all_points : optResult.pareto;
    const cfgById = new Map(configs.map((c) => [c.id, c]));
    const out: EstRow[] = [];
    const seen = new Set<string>();
    for (const pt of pts) {
      const key = optPointKey(pt);
      if (!key || seen.has(key) || validatedKeys.has(key)) continue;
      seen.add(key);
      const touched = Object.entries(pt.selections).filter(([, c]) => c !== "__keep__");
      // Cost/carbon summed over the same buildings a run would cover, exactly as
      // the package row will show them once simulated.
      let cost: number | null = 0, carbon: number | null = 0;
      const cfgs = touched.map(([, c]) => cfgById.get(c)).filter((c): c is ComponentConfig => !!c);
      if (cfgs.length === touched.length) {
        for (const { g, idx } of targetEntries) {
          const r = configsCostCarbon(cfgs, g, idx);
          cost = cost == null || r.costSEK == null ? null : cost + r.costSEK;
          carbon = carbon == null || r.carbonKgCO2e == null ? null : carbon + r.carbonKgCO2e;
        }
      } else if (touched.every(([, c]) => c.startsWith("uk:"))) {
        for (const { g, idx } of targetEntries) {
          const own = ukOptionsFor(g, wwrByIndex[idx] ?? null);
          for (const [k, c] of touched) {
            const m = (own[k] ?? []).find((x) => `uk:${x.code}` === c);
            if (m) { cost = (cost ?? 0) + m.costGbp; carbon = (carbon ?? 0) + m.carbonKgCo2e; }
          }
        }
      } else { cost = null; carbon = null; }
      // The estimate's saving, applied to the simulated baseline (the optimizer
      // models one representative building; the table averages all of them).
      const total = baseOpt > 0 ? Math.round((baseTot * pt.energy_kwh_m2_yr / baseOpt) * 10) / 10 : null;
      const heat = total != null && baseHeat != null ? Math.max(0, Math.round((baseHeat - (baseTot - total)) * 10) / 10) : null;
      out.push({
        kind: "est", id: `est:${key}`, pt, key,
        parts: touched.map(([k]) => [k.replace("VertExt::", ""), pt.selection_labels[k] ?? k] as [string, string]),
        cost: cost == null ? null : Math.round(cost), carbon: carbon == null ? null : Math.round(carbon),
        total, heat, pareto: paretoKeys.has(key),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optResult, validatedKeys, configs, targetEntries, baselineAgg?.avgTotalKwhM2Yr, baselineAgg?.avgHeatingKwhM2Yr, wwrByIndex]);

  const [resultSort, setResultSort] = useState<"default" | "energy" | "cost" | "lcc" | "lcCarbon">("default");
  // Results is about EnergyPlus-verified outcomes; unsimulated estimates are
  // opt-in (they live in Optimisation & Screening, next to the chart).
  const [includeEstimates, setIncludeEstimates] = useState(false);
  const shownEstimates = includeEstimates ? estimateRows : [];
  type PkgRow = { kind: "pkg"; id: string; pkg: RenovationCalcPackage };
  const rowMetrics = (r: PkgRow | EstRow) => {
    if (r.kind === "est") return { cost: r.cost, carbon: r.carbon, total: r.total, lcc: lcc30(r.cost, r.total), lcc_c: lcCarbon30(r.carbon, r.total) };
    const a = pkgAggregate(r.pkg);
    const cost = r.pkg.isBaseline ? 0 : a.totalCostSEK;
    const carbon = r.pkg.isBaseline ? 0 : a.totalCarbonKgCO2e;
    return { cost, carbon, total: a.avgTotalKwhM2Yr, lcc: lcc30(cost, a.avgTotalKwhM2Yr), lcc_c: lcCarbon30(carbon, a.avgTotalKwhM2Yr) };
  };
  const tableRows: (PkgRow | EstRow)[] = (() => {
    const base = packages.filter((p) => p.isBaseline).map((pkg): PkgRow => ({ kind: "pkg", id: pkg.id, pkg }));
    const sims = packages.filter((p) => !p.isBaseline).map((pkg): PkgRow => ({ kind: "pkg", id: pkg.id, pkg }));
    const ests = [...shownEstimates].sort((a, b) => (a.total ?? 1e9) - (b.total ?? 1e9));
    let rest: (PkgRow | EstRow)[] = [...sims, ...ests];
    if (resultSort !== "default") {
      const k = resultSort === "energy" ? "total" : resultSort === "cost" ? "cost" : resultSort === "lcc" ? "lcc" : "lcc_c";
      rest = [...rest].sort((a, b) => (rowMetrics(a)[k] ?? Infinity) - (rowMetrics(b)[k] ?? Infinity));
    }
    return [...base, ...rest];
  })();
  // Tags compare PACKAGES only — "do nothing" is the baseline, never "cheapest".
  const rowTags: Record<string, string[]> = (() => {
    const cands = tableRows.filter((r) => !(r.kind === "pkg" && r.pkg.isBaseline));
    const out: Record<string, string[]> = {};
    const tag = (k: "cost" | "lcc" | "lcc_c" | "total", label: string) => {
      let best: { id: string; v: number } | null = null;
      for (const r of cands) {
        const v = rowMetrics(r)[k];
        if (v != null && (!best || v < best.v)) best = { id: r.id, v };
      }
      if (best && cands.length > 1) (out[best.id] ??= []).push(label);
    };
    tag("cost", "Cheapest"); tag("lcc", "Lowest 30-yr cost"); tag("lcc_c", "Lowest carbon"); tag("total", "Lowest energy");
    return out;
  })();

  const canAddPackage = isUK || isBE ? ukTier != null : packageCombos > 0;

  // Inside a Step 4 view, the footer's Continue walks to the next view
  // (Materials → Optimisation → Results → Systems) and Back walks back through
  // them; only past the last / first view does it leave Step 4.
  const systemsAvailable = hasHeating && !isBE && baselineAgg?.avgHeatingKwhM2Yr != null;
  const VIEW_NEXT: Record<number, { n: number; label: string; hint: string } | null> = {
    1: hasEnvelope ? { n: 2, label: "Optimisation & Screening", hint: "evaluate every combination with the fast model and shortlist packages to simulate." }
                   : { n: 3, label: "Simulation Results & Comparison", hint: "simulate your packages in EnergyPlus and compare the verified outcomes." },
    2: { n: 3, label: "Simulation Results & Comparison", hint: "compare the EnergyPlus-verified outcomes of the packages you simulated." },
    3: systemsAvailable ? { n: 4, label: "Systems", hint: "compare heating-system alternatives for the selected renovation scenarios." } : null,
    4: null,
  };
  const nextView = openStage != null ? VIEW_NEXT[openStage] ?? null : null;
  useEffect(() => {
    setWizardNextInfo(nextView ? { label: nextView.label, hint: nextView.hint } : null);
  }, [nextView?.label, nextView?.hint]);
  useEffect(() => () => setWizardNextInfo(null), []);
  const onFooterNext = useCallback(() => {
    if (nextView) { setOpenStage(nextView.n); return; }
    handleSaveAndContinue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextView?.n, handleSaveAndContinue]);
  const onFooterBack = useCallback(() => {
    const prev = Object.entries(VIEW_NEXT).find(([, v]) => v?.n === openStage)?.[0];
    if (prev != null && openStage !== firstView) { setOpenStage(Number(prev)); return; }
    navigate("/step/3");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openStage, firstView, navigate, hasEnvelope]);
  useWizardStepNav({ onNext: onFooterNext, onBack: onFooterBack });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1100 }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, color: "rgba(255,255,255,0.3)", marginBottom: 6, textTransform: "uppercase" }}>
          Renovation Planning · Step 4
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>Renovation Calculator</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: 0, lineHeight: 1.6 }}>
          <>Pick materials per component, combine them into packages, and simulate each against the baseline to compare energy, cost and carbon
            {geometries.length > 1 ? ` — across the ${geometries.length} buildings from Step 3.` : "."}</>
        </p>
      </div>

      {geometries.length === 0 && (
        <div style={{ borderRadius: 12, padding: "14px 16px", background: "rgba(232,136,12,0.1)", border: "1px solid rgba(232,136,12,0.25)" }}>
          <p style={{ fontSize: 12, color: "#E8880C", margin: 0 }}>No buildings resolved yet — go back to Step 1/2 and select a location.</p>
        </div>
      )}

      {geometries.length > 0 && (
        <>
          <div ref={(el) => { stageRefs.current[1] = el; }} style={{ scrollMarginTop: 80 }} />
          {/* The four views of Step 4 - cards on arrival, a slim strip once inside one. */}
          <Step4Hub
            active={openStage}
            onSelect={setOpenStage}
            views={(() => {
              const designed = packages.filter((p) => !p.isBaseline);
              const done = designed.filter((p) => pkgAggregate(p).avgTotalKwhM2Yr != null);
              const base = baselineAgg?.avgTotalKwhM2Yr ?? null;
              const best = base ? Math.max(...done.map((p) => Math.round(((base - (pkgAggregate(p).avgTotalKwhM2Yr ?? base)) / base) * 100)), -Infinity) : -Infinity;
              const running = designed.some((p) => p.buildings.some((b) => b.status === "queued" || b.status === "running"));
              return [
                { n: 1, title: "Materials & Packages", desc: "Choose materials and build combinations", icon: <Layers size={19} />,
                  status: base == null ? "Baseline not run yet — run it here first"
                    : configs.length ? `${configuredComponents.map((c) => `${c.cfgs.length} ${c.item.label.toLowerCase()}`).join(" · ")} saved · ${packageCombosList.length} package${packageCombosList.length === 1 ? "" : "s"}`
                    : `As-built ${base} kWh/m²·yr · pick materials per component` },
                { n: 2, title: "Optimisation & Screening", desc: "All combinations on the fast model — shortlist for simulation", icon: <ScatterChart size={19} />,
                  disabled: !hasEnvelope || !!optimizerInput.disabledReason,
                  status: !hasEnvelope ? "No envelope components selected in Step 1"
                    : optimizerInput.disabledReason ?? `${optimizerInput.input?.components.length ?? 0} components · trade-offs over every combination` },
                { n: 3, title: "Simulation Results & Comparison", desc: "EnergyPlus-verified outcomes of simulated packages", icon: <BarChart3 size={19} />,
                  disabled: designed.length === 0,
                  status: running ? "Simulations running — results fill in automatically"
                    : done.length ? `${done.length} package${done.length === 1 ? "" : "s"} vs baseline${best > -Infinity ? ` · best −${best}% energy` : ""}`
                    : "Run a package to compare it with the baseline" },
                { n: 4, title: "Systems", desc: "Heating-system alternatives for the selected scenarios", icon: <SlidersHorizontal size={19} />,
                  disabled: !hasHeating || isBE || base == null,
                  status: isBE ? "Not available for Belgium yet"
                    : !hasHeating ? "Add “Heating system” to the components in Step 1"
                    : base == null ? "Needs the baseline" : "Compare heating systems on this building's demand" },
              ];
            })()}
          />
        </>
      )}

      {/* Nothing to compare against until a baseline exists. It is copied from
          Step 3 when that covers these buildings; otherwise running it is an
          explicit choice, because it starts an EnergyPlus batch. */}
      {geometries.length > 0 && openStage === 1 && baselineAgg?.avgTotalKwhM2Yr == null && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "13px 16px", borderRadius: 12,
          background: "rgba(232,136,12,0.08)", border: "1px solid rgba(232,136,12,0.28)" }}>
          <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)", flex: 1, minWidth: 240 }}>
            No as-built baseline for these buildings yet — run it in Step 3, or run it here.
          </span>
          <button
            onClick={submitBaseline}
            disabled={baselineRunning}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 9, border: 0,
              background: baselineRunning ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#5a9e1e,#2FB477)",
              color: baselineRunning ? "rgba(255,255,255,0.35)" : "#0a0d14",
              fontSize: 12.5, fontWeight: 800, cursor: baselineRunning ? "not-allowed" : "pointer" }}>
            {baselineRunning
              ? <><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Running baseline…</>
              : <><Play size={13} /> Run baseline energy simulation (EPSM)</>}
          </button>
        </div>
      )}

      {geometries.length > 0 && hasEnvelope && (
        <>

          {/* Supplier discount — the % the property owner gets off catalogue material
              prices; deducted from every material cost (Wikells is Sweden-only). */}
          {openStage === 1 && (<>
          {/* Applies-to selector: small and inline, because it is a qualifier on
              the design work rather than a step of its own — the panel it
              replaced took a third of the stage. */}
          {geometries.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>These assemblies are for</span>
              <select
                value={targetIdx === "all" ? "all" : String(targetIdx)}
                onChange={(e) => setTargetIdx(e.target.value === "all" ? "all" : Number(e.target.value))}
                style={{ padding: "5px 9px", borderRadius: 8, fontSize: 11.5, fontWeight: 700,
                  background: "#0d1117", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", maxWidth: 280 }}>
                <option value="all">All buildings ({geometries.length})</option>
                {geometries.map((g, i) => (
                  <option key={`${g.lat},${g.lon}`} value={i}>{g.address ?? `Building ${i + 1}`}</option>
                ))}
              </select>
              <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)" }}>
                {targetIdx === "all"
                  ? "one package, applied to every building"
                  : "a package built just for this building"}
              </span>
            </div>
          )}

          {/* Supplier discount sits behind a gear rather than as a banner at the top
              of the stage: it only applies to owners with negotiated Swedish supplier
              rates, and it was the first thing in the way of the material-picking
              flow. It now sits with the prices it modifies. */}
          {!isUK && !isBE && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginBottom: 8, position: "relative" }}>
              {(project.supplierDiscountPct || 0) > 0 && (
                <span style={{ fontSize: 10.5, color: "#2FB477", fontWeight: 700 }}>
                  prices net of −{project.supplierDiscountPct}%
                </span>
              )}
              <button
                onClick={() => setDiscountOpen((o) => !o)}
                title="Supplier discount — deducted from catalogue material prices"
                style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: 0, cursor: "pointer",
                  color: (project.supplierDiscountPct || 0) > 0 ? "#2FB477" : "rgba(255,255,255,0.35)", fontSize: 11, padding: 2 }}>
                <Settings size={13} /> Supplier discount
              </button>
              {discountOpen && (
                <>
                  <div onClick={() => setDiscountOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
                  <div style={{ position: "absolute", top: 24, right: 0, zIndex: 40, width: 290, padding: "12px 14px", borderRadius: 10,
                    background: "#0d1117", border: "1px solid rgba(255,255,255,0.15)", boxShadow: "0 12px 30px rgba(0,0,0,0.5)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", flex: 1 }}>Supplier discount</div>
                      <button onClick={() => setDiscountOpen(false)} title="Close"
                        style={{ background: "transparent", border: 0, cursor: "pointer", color: "rgba(255,255,255,0.45)", padding: 0, lineHeight: 1 }}>
                        <XCircle size={14} />
                      </button>
                    </div>
                    <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", marginBottom: 9, lineHeight: 1.5 }}>
                      Deducted from every catalogue material price (cost only — carbon is unaffected).
                      Re-pick materials or rebuild packages to apply it to existing ones.
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="number" min={0} max={90} step={1}
                        value={project.supplierDiscountPct || 0}
                        onChange={(e) => setProject({ supplierDiscountPct: Math.min(90, Math.max(0, Number(e.target.value) || 0)) })}
                        style={{ width: 78, padding: "6px 8px", borderRadius: 8, textAlign: "right",
                          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 13, fontWeight: 700 }}
                      />
                      <span style={{ fontSize: 14, fontWeight: 800, color: "#2FB477" }}>%</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Component tabs + material picker (quantities shown are for building 1; each
              building's own quantity is computed at submission time from its own geometry) */}
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {/* Grouped by what they belong to: the existing building vs a new
                  storey. Flattened, "Walls" and "New Walls" sat adjacent with
                  nothing explaining the difference. */}
              {(() => {
                const groups = new Map<string, typeof lineItems>();
                lineItems.forEach((li) => {
                  const g = li.key.startsWith("VertExt::") ? "Vertical extension (new floor)" : "Existing building";
                  const arr = groups.get(g); if (arr) arr.push(li); else groups.set(g, [li]);
                });
                return [...groups.entries()].map(([groupLabel, items]) => (
                  <div key={groupLabel} style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 4 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,0.28)", letterSpacing: 1.2, textTransform: "uppercase", marginTop: 2 }}>
                      {groupLabel}
                    </div>
                    {items.map((item) => {
                      const color = COMPONENT_COLORS[item.parentComponent] ?? "var(--brand)";
                      const isActive = activeItemKey === item.key;
                      const cfgCount = configs.filter((c) => c.componentKey === item.key).length;
                      return (
                        <button
                          key={item.key}
                          onClick={() => setActiveItemKey(item.key)}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "9px 12px", borderRadius: 10, border: `1px solid ${isActive ? `${color}55` : "rgba(255,255,255,0.07)"}`,
                            background: isActive ? `${color}18` : "rgba(255,255,255,0.03)", cursor: "pointer",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfgCount > 0 ? "#4ECDC4" : "rgba(255,255,255,0.15)", flexShrink: 0 }} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? "#fff" : "rgba(255,255,255,0.6)" }}>{item.label}</span>
                          </div>
                          {cfgCount > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 800, color: "#4ECDC4", background: "rgba(78,205,196,0.16)", borderRadius: 99, padding: "1px 7px" }}>{cfgCount}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ));
              })()}
              {lineItems.length === 0 && (
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>
                  No components selected. Go back to Step 1.
                </p>
              )}
            </div>

            {activeItem && (
              <div style={{ borderRadius: 14, padding: "18px 20px", background: "rgba(255,255,255,0.03)", border: `1px solid ${COMPONENT_COLORS[activeItem.parentComponent] ?? "var(--brand)"}33` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: 0 }}>{activeItem.label}</h3>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                    {activeQuantity != null
                      ? `${activeQuantity.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} ${quantityUnitLabel(activeItem.quantityKind)}${geometries.length > 1 ? ` (${pickedGeo?.address ?? `building ${pickedIdx + 1}`})` : ""}`
                      : "quantity: manual entry needed"}
                  </span>
                </div>
                {activeQuantity == null && (
                  <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="number"
                      placeholder={`Enter ${quantityUnitLabel(activeItem.quantityKind)}`}
                      onChange={(e) => setManualOverrides((m) => ({ ...m, [activeItem.key]: Number(e.target.value) || 0 }))}
                      style={{ width: 140, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 12 }}
                    />
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                      {activeItem.key === "Doors" ? "no automatic signal — enter a door count (applied to every building)" : "no data source for this building yet"}
                    </span>
                  </div>
                )}
                {/* ── Design a new configuration ── */}
                <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    {(() => {
                      // Sweden costs a layer build-up from the nearest Wikells assembly;
                      // UK/BE price it layer by layer from their own catalogue.
                      const canLayers = !!kindForKey(activeItem.key);
                      const effective = draftMode === "layers" && !canLayers ? "catalogue" : draftMode;
                      // Catalogue first — pick a ready-made assembly to start, then
                      // switch to Build-from-layers to compose one from real layers.
                      return (["catalogue", "layers"] as const).map((m) => {
                        const disabled = m === "layers" && !canLayers;
                        const active = effective === m;
                        return (
                          <button key={m} disabled={disabled} onClick={() => setDraftMode(m)}
                            title={disabled ? "Windows and doors are picked as whole units, not layer-composed" : undefined}
                            style={{ fontSize: 11, fontWeight: 700, padding: "4px 11px", borderRadius: 8,
                              cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.35 : 1,
                              border: `1px solid ${active ? "#4ECDC4" : "rgba(255,255,255,0.12)"}`,
                              background: active ? "#4ECDC4" : "transparent",
                              color: active ? "#0b1220" : "rgba(255,255,255,0.55)" }}>
                            {m === "catalogue" ? "Catalogue assembly" : "Build from layers"}
                          </button>
                        );
                      });
                    })()}
                    <input value={draftName} onChange={(e) => setDraftName(e.target.value)}
                      placeholder="Name (optional)"
                      style={{ marginLeft: "auto", width: 180, padding: "5px 10px", borderRadius: 8,
                        border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 11.5 }} />
                  </div>

                  {(isUK || isBE) && (
                    <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.42)", lineHeight: 1.5, margin: "-2px 0 10px" }}>
                      {catalogueNote(isUK ? "gb" : "be")} Hover an option for its price and carbon sources.
                    </div>
                  )}
                  {(draftMode === "layers" && kindForKey(activeItem.key)) ? (
                    <>
                      {/* Add to what is there, or build it new - same in every country. */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                        <div style={{ display: "inline-flex", padding: 3, borderRadius: 9, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                          {([["add", "Add to existing"], ["replace", "Replace with new"]] as const).map(([m, label]) => (
                            <button key={m} type="button"
                              onClick={() => { if (m !== layerMode) { setLayerMode(m); setDraftLayers([]); } }}
                              style={{ padding: "5px 12px", borderRadius: 7, border: 0, cursor: "pointer", fontSize: 11.5, fontWeight: 700,
                                background: layerMode === m ? "#4ECDC4" : "transparent",
                                color: layerMode === m ? "#0b1220" : "rgba(255,255,255,0.6)" }}>
                              {label}
                            </button>
                          ))}
                        </div>
                        <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.45)", lineHeight: 1.5, flex: 1, minWidth: 220 }}>
                          {layerMode === "add"
                            ? <>The existing {activeItem.label.toLowerCase()} stays (first layer) — add insulation and finishes to it. The U-value includes what is already there.</>
                            : <>The existing {activeItem.label.toLowerCase()} is removed and built new — the U-value comes from the new layers alone. Demolition is not costed.</>}
                        </span>
                      </div>
                      {baselineUForKey(activeItem.key, pickedGeo) != null && (
                        <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.45)", marginBottom: 8, lineHeight: 1.5 }}>
                          Compose the assembly layer by layer — the live U-value updates as you go.
                          {" "}Aim <strong style={{ color: "#4ECDC4" }}>below U {baselineUForKey(activeItem.key, pickedGeo)!.toFixed(2)}</strong> to improve this building's {activeItem.label.toLowerCase()}.
                        </div>
                      )}
                      <AssemblyBuilder
                        key={layerMode}
                        kind={kindForKey(activeItem.key)!}
                        layers={draftLayers}
                        onChange={setDraftLayers}
                        materials={activeLayerMaterials}
                        presets={layerPresetsFor(layerCountry ?? "se", kindForKey(activeItem.key)!, layerMode)}
                        layerNote={layerCountry ? (l) => catalogueLayerNote(layerCountry, l) : undefined}
                      />
                      <button onClick={saveLayerConfig} disabled={draftLayers.length === 0}
                        style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 15px",
                          borderRadius: 8, fontSize: 12, fontWeight: 700,
                          cursor: draftLayers.length ? "pointer" : "not-allowed", opacity: draftLayers.length ? 1 : 0.45,
                          border: "1px solid rgba(78,205,196,0.5)", background: "rgba(78,205,196,0.15)", color: "#4ECDC4" }}>
                        <Plus size={13} /> Save as configuration
                      </button>
                    </>
                  ) : (
                    <>
                      <LineItemPicker
                        item={activeItem}
                        items={activeCatalogue}
                        selectedCodes={activeCatalogueCodes}
                        onToggle={toggleCatalogueConfig}
                        recommendations={activeRecommendations}
                        boverketResources={activeBoverket}
                        baselineU={baselineUForKey(activeItem.key, pickedGeo)}
                      />
                    </>
                  )}
                </div>

                {/* ── Saved configurations for this component ── */}
                {(() => {
                  const mine = configs.filter((c) => c.componentKey === activeItem.key);
                  if (!mine.length) return null;
                  return (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
                        Saved ({mine.length}) — each becomes a package option
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {mine.map((c) => (
                          <div key={c.id} style={{ minWidth: 190, padding: "9px 11px", borderRadius: 10,
                            background: "rgba(78,205,196,0.07)", border: "1px solid rgba(78,205,196,0.28)" }}>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", flex: 1 }}>{c.name}</span>
                              <button onClick={() => removeConfig(c.id)} title="Delete configuration"
                                style={{ background: "transparent", border: 0, cursor: "pointer", color: "rgba(226,72,59,0.75)", padding: 0 }}>
                                <XCircle size={13} />
                              </button>
                            </div>
                            <div style={{ fontSize: 11, color: "#4ECDC4", fontWeight: 700, marginTop: 3 }}>
                              U {c.uValue?.toFixed(2) ?? "—"} W/m²K
                            </div>
                            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                              {c.costPerM2 != null ? `${fmtSEK(c.costPerM2)}/${activeItem.quantityKind === "area" ? "m²" : "unit"}` : "cost —"}
                              {" · "}
                              {c.carbonPerM2 != null ? `${c.carbonPerM2.toFixed(1)} kg CO₂e/m²` : "carbon —"}
                            </div>
                            {c.costFromCode && (
                              <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.32)", marginTop: 3 }}>
                                cost from Wikells {c.costFromCode} (nearest, ΔU {c.costDeltaU?.toFixed(2)})
                              </div>
                            )}
                            {c.carbonUnmatched && c.carbonUnmatched.length > 0 && (
                              <div style={{ fontSize: 9.5, color: "#E8880C", marginTop: 3 }}>
                                {layerCountry ? "missing in the catalogue" : "no Boverket data"}: {c.carbonUnmatched.join(", ")}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </>
          )}

          {/* UK / Belgium: the TABULA refurbishment tier stays as a one-click
              alternative to designing component by component above. */}
          {(isUK || isBE) && openStage === 1 && (
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(255,255,255,0.3)", margin: "6px 0 -4px" }}>
              Or, in one click: a TABULA refurbishment tier
            </div>
          )}
          {(isUK || isBE) && openStage === 1 && (
            <div style={{ borderRadius: 14, padding: "18px 20px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(114,28,184,0.2)" }}>
              <UkTierPicker
                country={isBE ? "be" : "gb"}
                archetype={ukArchetype} selectedTier={ukTier} onSelect={setUkTier}
                quantities={geometries[0] ? ukQuantitiesFor(geometries[0], wwrByIndex[0] ?? null) : null} buildingCount={geometries.length}
                uSource={geometries[0]?.tabulaUSource ?? null}
              />
            </div>
          )}
          {/* The tier package is named after the tier; the builder above has its
              own name field, so no second name box here. */}
          {(isUK || isBE) && openStage === 1 && canAddPackage && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => addPackage()}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                  border: "1px solid rgba(47,180,119,0.4)", background: "rgba(47,180,119,0.12)", color: "#2FB477", cursor: "pointer" }}>
                <Plus size={13} /> Simulate this tier as a package
              </button>
            </div>
          )}


          <div ref={(el) => { stageRefs.current[2] = el; }} style={{ scrollMarginTop: 80 }} />
        </>) }

      {geometries.length > 0 && (
        <>
          {/* ══ PACKAGES — part of the Materials & packages view ══════ */}
          {hasEnvelope && openStage === 1 && (
            <div style={{ borderRadius: 14, padding: "14px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>Packages</span>
                {geometries.length > 1 && combosByBuilding.length > 0 && (
                  <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.45)", width: "100%", marginTop: 4 }}>
                    Designed so far:{" "}
                    {combosByBuilding.map((b, i) => (
                      <span key={b.key}>
                        {i > 0 && " · "}
                        <b style={{ color: b.key === cfgKey ? "#4ECDC4" : "rgba(255,255,255,0.6)" }}>{b.label}</b>
                        {" "}{b.combos.length} package{b.combos.length === 1 ? "" : "s"}
                      </span>
                    ))}
                    {" — "}<b style={{ color: "rgba(255,255,255,0.6)" }}>{totalCombosAllBuildings} total</b>.
                    {" "}Switch building in 4.1 to design another; Run below simulates the one shown.
                  </span>
                )}
                {geometries.length > 1 && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                    color: targetIdx === "all" ? "rgba(255,255,255,0.5)" : "#4ECDC4",
                    background: targetIdx === "all" ? "rgba(255,255,255,0.06)" : "rgba(78,205,196,0.14)" }}>
                    {targetIdx === "all"
                      ? `for all ${geometries.length} buildings`
                      : `for ${geometries[targetIdx]?.address ?? `Building ${targetIdx + 1}`} only`}
                  </span>
                )}
                {configuredComponents.length > 0 ? (
                  <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)" }}>
                    {configuredComponents.map((c) => `${c.cfgs.length} ${c.item.label.toLowerCase()}`).join(" × ")}
                    {" = "}
                    <strong style={{ color: "#4ECDC4" }}>{packageCombosList.length} package{packageCombosList.length === 1 ? "" : "s"}</strong>
                  </span>
                ) : (
                  <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>
                    Save at least one configuration above to build packages.
                  </span>
                )}
              </div>

              {packageCombosList.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10 }}>
                  {packageCombosList.map((combo) => {
                    const key = comboKey(combo);
                    const on = !excludedCombos.has(key);
                    return (
                      <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5,
                        color: on ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)", cursor: "pointer", padding: "3px 0" }}>
                        <input type="checkbox" checked={on} onChange={() => setExcludedCombos((st) => {
                          const n = new Set(st); n.has(key) ? n.delete(key) : n.add(key); return n;
                        })} style={{ accentColor: "#4ECDC4" }} />
                        <span style={{ flex: 1 }}>{combo.map((c) => c.name).join("  +  ")}</span>
                        <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)" }}>
                          {combo.map((c) => `U ${c.uValue?.toFixed(2) ?? "—"}`).join(" · ")}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {packageCombosList.length > 0 && (() => {
                // Only count packages that are ACTIVELY running (have at least one
                // queued/running building). Completed packages from previous runs
                // are excluded — otherwise old results inflate the total and make
                // isRunning true even before a new run is triggered.
                const activeSimPkgs = packages.filter(
                  // batchId must be set — packages that exist in the store but have
                  // never been submitted to EPSM have batchId: null and must not
                  // trigger the "Simulating" state before the user presses Run.
                  (pk) => !pk.isBaseline && pk.batchId !== null && pk.buildings.some((b) => b.status === "queued" || b.status === "running")
                );
                let simTotal = 0, simDone = 0;
                for (const p of activeSimPkgs) {
                  for (const b of p.buildings) {
                    simTotal++;
                    if (b.status === "completed" || b.status === "failed") simDone++;
                  }
                }
                const pct = simTotal > 0 ? Math.round((simDone / simTotal) * 100) : 0;
                const isRunning = activeSimPkgs.length > 0;
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      {combosByBuilding.length > 1 && (
                        <button onClick={simulateAllBuildings} disabled={isRunning}
                          title="Simulate every building's saved packages in one go"
                          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 9,
                            fontSize: 12.5, fontWeight: 800, border: "1px solid rgba(78,205,196,0.45)",
                            background: "rgba(78,205,196,0.12)", color: "#4ECDC4",
                            cursor: isRunning ? "not-allowed" : "pointer", opacity: isRunning ? 0.5 : 1 }}>
                          <Play size={13} /> Run all buildings · {totalCombosAllBuildings} package{totalCombosAllBuildings === 1 ? "" : "s"}
                        </button>
                      )}
                      <button onClick={() => simulateConfiguredPackages()} disabled={activeCombos.length === 0 || isRunning}
                        style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 9,
                          fontSize: 12.5, fontWeight: 800,
                          border: `1px solid ${isRunning ? "rgba(232,136,12,0.45)" : "rgba(47,180,119,0.45)"}`,
                          background: isRunning ? "rgba(232,136,12,0.12)" : "rgba(47,180,119,0.14)",
                          color: isRunning ? "#E8880C" : "#2FB477",
                          cursor: (activeCombos.length && !isRunning) ? "pointer" : "not-allowed",
                          opacity: activeCombos.length ? 1 : 0.45,
                          minWidth: 260, position: "relative", overflow: "hidden" }}>
                        {isRunning
                          ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />
                          : <Play size={14} style={{ flexShrink: 0 }} />}
                        <span style={{ flex: 1 }}>
                          {isRunning
                            ? `Simulating\u2026 ${simDone}\u200a/\u200a${simTotal} runs \u00b7 ${activeSimPkgs.length} package${activeSimPkgs.length === 1 ? "" : "s"} \u00d7 ${geometries.length} building${geometries.length === 1 ? "" : "s"}`
                            : `Run energy simulation (EPSM) \u00b7 ${activeCombos.length} package${activeCombos.length === 1 ? "" : "s"}${geometries.length > 1 && targetIdx === "all" ? ` \u00d7 ${geometries.length} buildings` : ""}`}
                        </span>
                        {isRunning && (
                          <span style={{ fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{pct}%</span>
                        )}
                        {/* Progress fill behind text */}
                        {isRunning && (
                          <span style={{
                            position: "absolute", left: 0, top: 0, bottom: 0,
                            width: `${pct}%`,
                            background: "rgba(232,136,12,0.18)",
                            transition: "width 0.4s ease",
                            pointerEvents: "none",
                          }} />
                        )}
                      </button>
                      <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)", maxWidth: 460, lineHeight: 1.5 }}>
                        {isRunning
                          ? `EnergyPlus is running \u2014 results will appear in section 4.3 automatically.`
                          : activeCombos.length <= 10
                            ? "Small enough to run every combination in EnergyPlus directly \u2014 exact results for exactly these designs."
                            : "That\u2019s a lot of EnergyPlus runs. Use the optimizer below to find the best trade-offs first, then simulate only those."}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ══ OPTIMISATION view ══ Pareto front over the fast degree-day
              physics, from the saved build-ups (UK with none saved: the DESNZ
              measure set). Each validated winner runs in EPSM and lands in Results. */}
          {hasEnvelope && openStage === 2 && (
            <OptimizerPanel
              input={optimizerInput.input}
              disabledReason={optimizerInput.disabledReason}
              note={optimizerInput.note}
              onValidate={validateOptimizerPick}
              currency={isUK && configs.length === 0 ? "GBP" : MONEY}
              validatedKeys={validatedKeys}
              runningKeys={runningKeys}
              selectedKpis={project.selectedKpis}
              result={optResult}
              loading={optLoading}
              error={optError}
              scopeLabel={geometries.length > 1
                ? `${geometries[targetIdx === "all" ? 0 : targetIdx]?.address ?? "the first building"} (representative building — the Results view sums all ${targetIdx === "all" ? geometries.length : 1} building${targetIdx === "all" && geometries.length > 1 ? "s" : ""})`
                : undefined}
            />
          )}

          {(isUK || isBE || hasEnvelope) && (<>
          <div ref={(el) => { stageRefs.current[3] = el; }} style={{ scrollMarginTop: 80 }} />

          {openStage === 3 && (
          <>
          {/* Prominent "EnergyPlus is running" banner so it's obvious a simulation
              is in flight and results will appear on their own (no click needed). */}
          {(() => {
            // Only show the banner for packages with active jobs
            let running = 0, done = 0, total = 0;
            for (const p of packages.filter((pk) => !pk.isBaseline && pk.buildings.some((b) => b.status === "queued" || b.status === "running"))) {
              for (const b of p.buildings) {
                total++;
                if (b.status === "completed" || b.status === "failed") done++;
                if (b.status === "queued" || b.status === "running") running++;
              }
            }
            if (running === 0) return null;
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 11, margin: "0 0 12px", padding: "11px 14px", borderRadius: 10,
                background: "rgba(232,136,12,0.10)", border: "1px solid rgba(232,136,12,0.32)" }}>
                <span style={{ width: 15, height: 15, borderRadius: "50%", border: "2px solid rgba(232,136,12,0.3)",
                  borderTopColor: "#E8880C", display: "inline-block", animation: "spin 0.9s linear infinite", flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#E8880C" }}>
                  Running EnergyPlus simulations… {done}/{total} runs done
                  {geometries.length ? ` (${Math.max(1, Math.round(total / geometries.length))} package${Math.round(total / geometries.length) === 1 ? "" : "s"} × ${geometries.length} building${geometries.length === 1 ? "" : "s"})` : ""}.
                  <span style={{ fontWeight: 500, color: "rgba(255,255,255,0.6)", marginLeft: 6 }}>
                    This can take a minute — results fill in below automatically, no need to click.
                  </span>
                </span>
              </div>
            );
          })()}

          {/* Run the saved packages in EnergyPlus from here too — Results is where
              people look for them, not only the Materials view. */}
          {unsimulatedCombos.length > 0 && (
            <div style={{ borderRadius: 12, padding: "12px 16px", margin: "0 0 12px",
              background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.18)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#fff", flex: 1 }}>
                  {unsimulatedCombos.length} of {activeCombos.length} designed package{activeCombos.length === 1 ? "" : "s"} not simulated yet
                </span>
                <button onClick={() => simulateConfiguredPackages(true)}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 9,
                    fontSize: 12.5, fontWeight: 800, border: "1px solid rgba(47,180,119,0.45)",
                    background: "rgba(47,180,119,0.14)", color: "#2FB477", cursor: "pointer" }}>
                  <Play size={14} /> Run EnergyPlus · {unsimulatedCombos.length} package{unsimulatedCombos.length === 1 ? "" : "s"}
                </button>
              </div>
              {/* With optimiser estimates they're rows in the table below. */}
              {estimateRows.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {unsimulatedCombos.map((combo) => (
                  <div key={comboKey(combo)} style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                    · {combo.map((c) => c.name).join("  +  ")}
                  </div>
                ))}
              </div>
              )}
            </div>
          )}

          {/* Two read-outs of the same batch: per-package aggregates, or a
              per-building matrix (baseline vs every package, one row per address). */}
          <div style={{ borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "16px 18px" }}>
            {/* Titled like the HVAC panel below it: this table is the envelope /
                component-material side of the comparison, and without a heading
                it was not obvious which half of the retrofit it covered. */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ padding: 6, borderRadius: 9, background: "rgba(78,205,196,0.16)", color: "#4ECDC4", display: "flex" }}>
                <Layers size={16} />
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: "#fff" }}>Simulated packages · EnergyPlus</span>
                <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                  Verified outcomes against the as-built baseline: heating and total energy per package and building, cost and carbon upfront and over 30 years.
                </span>
              </span>
            </div>
            {(baselinePkg?.buildings.length ?? 0) > 1 && (
              <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                {([["package", "By package"], ["building", "By building"]] as const).map(([v, label]) => (
                  <button key={v} onClick={() => setResultView(v)}
                    style={{ padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer",
                      border: `1px solid ${resultView === v ? "#4ECDC4" : "rgba(255,255,255,0.12)"}`,
                      background: resultView === v ? "#4ECDC4" : "transparent",
                      color: resultView === v ? "#0b1220" : "rgba(255,255,255,0.5)" }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {resultView === "package" ? (
            <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Sort by:</span>
              {([["default", "Simulated first"], ["energy", "Energy"], ["cost", "Cost"], ["lcc", "30-yr cost"], ["lcCarbon", "30-yr carbon"]] as const).map(([k, lbl]) => (
                <button key={k} onClick={() => setResultSort(k)} style={{
                  fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 8, cursor: "pointer",
                  border: `1px solid ${resultSort === k ? "#4ECDC4" : "rgba(255,255,255,0.12)"}`,
                  background: resultSort === k ? "#4ECDC4" : "transparent",
                  color: resultSort === k ? "#0b1220" : "rgba(255,255,255,0.55)" }}>{lbl}</button>
              ))}
              {estimateRows.length > 0 && (
                <label style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer",
                  fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>
                  <input type="checkbox" checked={includeEstimates} onChange={(e) => setIncludeEstimates(e.target.checked)}
                    style={{ accentColor: "#E8880C" }} />
                  Include {estimateRows.length} unsimulated package{estimateRows.length === 1 ? "" : "s"} (estimates)
                </label>
              )}
            </div>
            {includeEstimates && estimateRows.length > 0 && (
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.45)", marginBottom: 8, lineHeight: 1.5 }}>
                Rows marked <b style={{ color: "#E8880C" }}>≈ estimate</b> are not simulated yet — quick degree-day figures from the
                optimiser, usually somewhat optimistic. Press <b>Simulate</b> to replace them with EnergyPlus results.
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: TABLE_COLS, gap: 10, padding: "0 4px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 8 }}>
              {[
                { k: "exp", l: "" },
                { k: "pkg", l: "Package" },
                { k: "cost", l: "Cost", sub: (isUK
                  ? `tiers & DESNZ optimiser: installed, ${UK_COST_PRICE_BASIS} · catalogue picks: materials incl. VAT, excl. labour`
                  : isBE ? "catalogue picks: materials incl. VAT, excl. labour · TABULA tiers: no cost data"
                  : "installed — materials + labour (Wikells), one-off") },
                { k: "carbon", l: "Carbon", sub: isUK || isBE ? "embodied A1-A3 (materials catalogue)" : "embodied A1-A3" },
                { k: "lcc", l: "30-yr cost", sub: "cost + 30 yrs of energy at today's price, discounted" },
                { k: "lcco2", l: "30-yr carbon", sub: "embodied + 30 yrs of energy" },
                { k: "heat", l: "Heating", sub: "kWh/m²·yr" },
                { k: "total", l: "Total energy", sub: "heating + hot water + cooling + lighting + equipment, kWh/m²·yr" },
                { k: "status", l: "Status" },
              ].map((h) => (
                <span key={h.k} style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: 1 }}>
                  {h.l}
                  {h.sub && (
                    <span style={{ display: "block", fontSize: 8.5, fontWeight: 600, letterSpacing: 0, textTransform: "none", color: "rgba(255,255,255,0.22)", lineHeight: 1.3, marginTop: 2 }}>
                      {h.sub}
                    </span>
                  )}
                </span>
              ))}
            </div>
            {tableRows.map((row) => {
              if (row.kind === "est") {
                const m = rowMetrics(row);
                const running = runningKeys.has(row.key);
                return (
                  <div key={row.id} style={{ display: "grid", gridTemplateColumns: TABLE_COLS, gap: 10, padding: "8px 4px", alignItems: "center",
                    borderBottom: "1px solid rgba(255,255,255,0.04)", borderLeft: "2px dashed rgba(232,136,12,0.45)" }}>
                    <span />
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)" }}>
                      {(rowTags[row.id] ?? []).length > 0 && (
                        <span style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 3 }}>
                          {rowTags[row.id]!.map((t) => (
                            <span key={t} style={{ fontSize: 9.5, fontWeight: 800, padding: "1px 7px", borderRadius: 99, background: ROW_TAG_STYLE[t]?.bg, color: ROW_TAG_STYLE[t]?.fg }}>{t}</span>
                          ))}
                        </span>
                      )}
                      {row.parts.map(([k, v]) => (
                        <span key={k} style={{ display: "block", fontSize: 11.5 }}>
                          <span style={{ color: "rgba(255,255,255,0.45)" }}>{k}:</span> {v}
                        </span>
                      ))}
                      <span style={{ display: "inline-block", marginTop: 3, fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 99,
                        color: "#E8880C", background: "rgba(232,136,12,0.12)" }}>≈ estimate · not simulated</span>
                    </span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{m.cost == null ? "—" : fmtSEK(m.cost)}</span>
                    <span style={{ fontSize: 12, color: "#4A90E2" }}>{m.carbon == null ? "—" : `${m.carbon.toLocaleString(isUK ? "en-GB" : "sv-SE")} kg`}</span>
                    <span style={{ fontSize: 12, color: "#B98BE8" }}>{m.lcc == null ? "—" : `≈ ${fmtSEK(m.lcc)}`}</span>
                    <span style={{ fontSize: 12, color: "#4A90E2" }}>{m.lcc_c == null ? "—" : `≈ ${m.lcc_c.toLocaleString(isUK ? "en-GB" : "sv-SE")} kg`}</span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{row.heat == null ? "—" : `≈ ${row.heat}`}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>
                      {row.total == null ? "—" : `≈ ${row.total}`}
                      {vsBaseline(row.total, baselineAgg?.avgTotalKwhM2Yr ?? null, false)}
                    </span>
                    <span>
                      {running ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, color: "#E8880C" }}>
                          <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> Running…
                        </span>
                      ) : (
                        <button onClick={() => validateOptimizerPick(row.pt)}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700,
                            padding: "5px 10px", borderRadius: 8, cursor: "pointer",
                            border: "1px solid rgba(47,180,119,0.45)", background: "rgba(47,180,119,0.14)", color: "#2FB477" }}>
                          <Play size={11} /> Simulate
                        </button>
                      )}
                    </span>
                  </div>
                );
              }
              const pkg = row.pkg;
              const agg = pkgAggregate(pkg);
              const expanded = expandedPkg === pkg.id;
              return (
                <div key={pkg.id}>
                  <div style={{
                    display: "grid", gridTemplateColumns: TABLE_COLS, gap: 10, padding: "8px 4px", alignItems: "center",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    // The baseline is the reference every other row is measured against — mark it.
                    background: pkg.isBaseline ? "rgba(255,255,255,0.035)" : undefined,
                    borderLeft: pkg.isBaseline ? "2px solid rgba(255,255,255,0.25)" : "2px solid transparent",
                  }}>
                    <button
                      onClick={() => setExpandedPkg(expanded ? null : pkg.id)}
                      style={{ background: "transparent", border: 0, cursor: "pointer", color: "rgba(255,255,255,0.4)", padding: 0 }}
                      title={expanded ? "Hide per-building breakdown" : "Show per-building breakdown"}
                    >
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    {!pkg.isBaseline && pkg.buildings.length === 1 && geometries.length > 1 && (
                      <span title={`Built for ${pkg.buildings[0]!.address} only`}
                        style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 99, marginRight: 6,
                          color: "#4ECDC4", background: "rgba(78,205,196,0.14)", whiteSpace: "nowrap" }}>
                        1 building
                      </span>
                    )}
                    <span style={{ fontSize: 12, fontWeight: 600, color: pkg.isBaseline ? "rgba(255,255,255,0.5)" : "#fff" }}>
                      {(rowTags[row.id] ?? []).length > 0 && (
                        <span style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 3 }}>
                          {rowTags[row.id]!.map((t) => (
                            <span key={t} style={{ fontSize: 9.5, fontWeight: 800, padding: "1px 7px", borderRadius: 99, background: ROW_TAG_STYLE[t]?.bg, color: ROW_TAG_STYLE[t]?.fg }}>{t}</span>
                          ))}
                        </span>
                      )}
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: pkg.color, marginRight: 6 }} />
                      {pkg.name}{agg.n > 1 ? ` (${agg.n} buildings)` : ""}
                      {/* Applied envelope U-values — makes an uninsulated pick (which
                          replaces, never adds to, the baseline U) explain its own result. */}
                      {!pkg.isBaseline && ((!isUK && !isBE) || pkgCostSource(pkg) === "catalogue") && (() => {
                        const us = appliedUValues(pkg, itemByCode);
                        if (!us.length) return null;
                        return (
                          <span style={{ display: "block", fontSize: 9.5, marginTop: 3, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>
                            applies{" "}
                            {us.map((x, i) => (
                              <span key={x.label}>
                                {i > 0 ? " · " : ""}{x.label} U{" "}
                                {/* Windows are judged on window scales (triple ≈ 0.8 is good). */}
                                <span style={{ fontWeight: 700, color: /window/i.test(x.label)
                                  ? (x.u > 1.6 ? "#E2483B" : x.u > 1.2 ? "#E8880C" : "#2FB477")
                                  : (x.u > 0.4 ? "#E2483B" : x.u > 0.3 ? "#E8880C" : "#2FB477") }}>
                                  {x.u.toFixed(2)}
                                </span>
                              </span>
                            ))}
                          </span>
                        );
                      })()}
                      {/* Worse-than-baseline guardrail: if the package's average total
                          energy exceeds the as-built baseline, say why in plain terms. */}
                      {!pkg.isBaseline && agg.avgTotalKwhM2Yr != null && baselineAgg?.avgTotalKwhM2Yr != null
                        && agg.avgTotalKwhM2Yr > baselineAgg.avgTotalKwhM2Yr && (
                        <span style={{ display: "block", fontSize: 9.5, marginTop: 3, color: "#E2483B", fontWeight: 600, lineHeight: 1.4 }}>
                          ⚠ Less insulated than the current building — this raises energy use.
                          Choose an assembly with insulation (e.g. M95 / M145 walls, or an insulated roof).
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }} title={isUK && agg.totalCostSEK != null ? `DESNZ install costs, ${UK_COST_PRICE_BASIS}; doors not costed` : undefined}>
                      {agg.totalCostSEK == null ? "—" : fmtSEK(agg.totalCostSEK)}
                      {!pkg.isBaseline && agg.totalCostSEK == null && pkgCostSource(pkg) === "catalogue" && (
                        <span style={{ display: "block", fontSize: 9.5, color: "#E8880C", marginTop: 2 }}>
                          a material has no price in the catalogue
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 12, color: "#4A90E2" }} title={pkgCostSource(pkg) === "catalogue" ? "Materials catalogue, embodied carbon A1-A3" : isUK && agg.totalCarbonKgCO2e != null ? "DESNZ insulation factor + Boverket window proxy" : undefined}>
                      {agg.totalCarbonKgCO2e == null ? "—"
                        : `${agg.totalCarbonKgCO2e.toLocaleString(isUK ? "en-GB" : "sv-SE")} kg${pkgCostSource(pkg) === "desnz" ? "*" : pkgCostSource(pkg) === "catalogue" && (isUK || isBE) ? "†" : ""}`}
                    </span>
                    {(() => {
                      const m = rowMetrics(row);
                      return (<>
                        <span style={{ fontSize: 12, color: "#B98BE8", fontWeight: 600 }}
                          title={`Cost today + 30 years of energy at ${lccPrice?.toFixed(3)} per kWh, discounted (same price and rate as the optimiser). Step 5 tests other price futures.`}>
                          {m.lcc == null ? "—" : fmtSEK(m.lcc)}
                        </span>
                        <span style={{ fontSize: 12, color: "#4A90E2" }}
                          title={`Embodied carbon + 30 years of energy at ${lcCarbonFactor?.toFixed(3)} kg CO₂e per kWh`}>
                          {m.lcc_c == null ? "—" : `${m.lcc_c.toLocaleString(isUK ? "en-GB" : "sv-SE")} kg`}
                        </span>
                      </>);
                    })()}
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                      {agg.avgHeatingKwhM2Yr ?? "—"}
                      {vsBaseline(agg.avgHeatingKwhM2Yr, baselineAgg?.avgHeatingKwhM2Yr ?? null, pkg.isBaseline)}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: pkg.isBaseline ? "rgba(255,255,255,0.6)" : "#2FB477" }}>
                      {agg.avgTotalKwhM2Yr ?? "—"}
                      {vsBaseline(agg.avgTotalKwhM2Yr, baselineAgg?.avgTotalKwhM2Yr ?? null, pkg.isBaseline)}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {agg.running > 0 && <Loader2 size={13} color="#E8880C" style={{ animation: "spin 1s linear infinite" }} />}
                      {/* Pending but nothing in flight = never submitted. A spinner
                          here claims work is happening when none is. */}
                      {agg.running === 0 && agg.pending > 0 && (
                        <span title="Not simulated yet" style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>not run</span>
                      )}
                      {agg.pending === 0 && agg.failed === 0 && <CheckCircle2 size={13} color="#2FB477" />}
                      {agg.failed > 0 && <XCircle size={13} color="#E2483B" />}
                      {(agg.failed > 0 || agg.pending > 0) && (
                        <button onClick={() => retryPackage(pkg)}
                          title={agg.failed > 0 ? "Retry failed buildings" : "Re-run stuck buildings"}
                          style={{ background: "transparent", border: 0, cursor: "pointer",
                            color: agg.failed > 0 ? "#E2483B" : "rgba(255,255,255,0.35)" }}>
                          <RefreshCw size={12} />
                        </button>
                      )}
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{agg.completed}/{agg.n}</span>
                    </span>
                  </div>
                  {expanded && (
                    <div style={{ padding: "6px 4px 10px 34px", display: "flex", flexDirection: "column", gap: 4 }}>
                      {pkg.buildings.map((b) => (
                        <div key={`${pkg.id}-${b.address}-${b.lat}-${b.lon}`} style={{ display: "grid", gridTemplateColumns: BREAKDOWN_COLS, gap: 10, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.address}</span>
                          <span>{b.costSEK == null ? "—" : fmtSEK(b.costSEK)}</span>
                          <span>{b.carbonKgCO2e == null ? "—" : `${b.carbonKgCO2e.toLocaleString(isUK ? "en-GB" : "sv-SE")} kg`}</span>
                          <span /><span />
                          <span>{b.heatingKwhM2Yr ?? "—"}</span>
                          <span>
                            {b.totalKwhM2Yr ?? "—"}
                            {/* UK gas-boiler runs: what a household's gas meter would read. */}
                            {isUK && b.totalGasKwh != null && (
                              <span style={{ display: "block", fontSize: 9.5, color: "#E8880C" }}>
                                gas {Math.round(b.totalGasKwh / Math.max(1, b.dwellings ?? 1)).toLocaleString("en-GB")} kWh/yr per home
                              </span>
                            )}
                          </span>
                          {(() => {
                            const done = isBuildingSettled(b);
                            return (
                              <span style={{ color: b.status === "failed" ? "#fca5a5" : done ? "#2FB477" : "#E8880C" }} title={b.error ?? undefined}>
                                {done ? "completed" : b.status}
                              </span>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {packages.length === 0 && (
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", padding: "8px 4px" }}>No packages yet.</p>
            )}
            {isUK && packages.some((p) => pkgCostSource(p) === "desnz" && pkgAggregate(p).totalCostSEK != null) && (
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", padding: "6px 4px 0" }}>
                * {UK_COST_CARBON_SOURCE_NOTE}
              </p>
            )}
            {(isUK || isBE) && packages.some((p) => pkgCostSource(p) === "catalogue") && (
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", padding: "6px 4px 0" }}>
                † {catalogueNote(isUK ? "gb" : "be")} Package cost = material per m² × each building's own area; labour and installation are not included.
              </p>
            )}
            </>
            ) : (
              /* Per-building matrix — every address as a row, baseline total next
                 to each package's total, so one building can be read across all
                 designs (and a package that WORSENS a building shows red per row). */
              <div style={{ overflowX: "auto" }}>
                {(() => {
                  const others = packages.filter((p) => !p.isBaseline);
                  const rows = baselinePkg?.buildings ?? [];
                  const cols = `minmax(150px,1.6fr) 92px ${others.map(() => "minmax(96px,1fr)").join(" ")}`;
                  const findTotal = (pkg: RenovationCalcPackage, b: RenovationCalcBuildingResult) =>
                    pkg.buildings.find((x) => x.address === b.address && x.lat === b.lat && x.lon === b.lon)?.totalKwhM2Yr ?? null;
                  const delta = (v: number | null, base: number | null) => {
                    if (v == null || base == null || base === 0) return null;
                    const pct = Math.round(((v - base) / base) * 100);
                    return (
                      <span style={{ fontSize: 9, fontWeight: 700, marginLeft: 4, color: pct < 0 ? "#2FB477" : pct > 0 ? "#E2483B" : "rgba(255,255,255,0.35)" }}>
                        {pct === 0 ? "±0%" : `${pct < 0 ? "▼" : "▲"}${Math.abs(pct)}%`}
                      </span>
                    );
                  };
                  const th = { fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 1 };
                  // Buildings are identified by rounded coordinates, the same basis
                  // Step 3 uses to match its shortlist — addresses are not unique
                  // and are sometimes just "Building 3".
                  const bKeyOf = (b: RenovationCalcBuildingResult) => `${b.lat.toFixed(6)},${b.lon.toFixed(6)}`;
                  const savedFor = (b: RenovationCalcBuildingResult) => saved[bKeyOf(b)];
                  const savePick = (b: RenovationCalcBuildingResult, pkgId: string) => {
                    const key = bKeyOf(b);
                    const next = { ...saved };
                    if (next[key] === pkgId) delete next[key]; else next[key] = pkgId;
                    setProject({ selectedPackageByBuilding: next });
                  };
                  return (
                    <div style={{ minWidth: 460 }}>
                      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 10, padding: "0 4px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 6 }}>
                        <span style={{ ...th, color: "rgba(255,255,255,0.35)" }}>Building</span>
                        <span style={{ ...th, color: "rgba(255,255,255,0.35)" }}>Baseline</span>
                        {others.map((p) => (
                          <span key={p.id} style={{ ...th, letterSpacing: 0.4, color: "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.name}>
                            <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: p.color, marginRight: 5 }} />
                            {p.name}
                          </span>
                        ))}
                      </div>
                      {rows.length === 0 && <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", padding: "8px 4px" }}>Run a package to compare buildings.</p>}
                      {rows.map((b) => (
                        <div key={`${b.address}-${b.lat}-${b.lon}`} style={{ display: "grid", gridTemplateColumns: cols, gap: 10, padding: "7px 4px", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <span style={{ fontSize: 11.5, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={b.address}>{b.address}</span>
                          <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)" }}>{b.totalKwhM2Yr ?? "—"}</span>
                          {others.map((p) => {
                            const v = findTotal(p, b);
                            const isSaved = savedFor(b) === p.id;
                            return (
                              <button key={p.id}
                                onClick={() => v != null && savePick(b, p.id)}
                                disabled={v == null}
                                title={v == null ? "Run this package first" : isSaved ? `Saved for ${b.address} — click to unsave` : `Save ${p.name} for ${b.address}`}
                                style={{ display: "flex", alignItems: "center", gap: 4, textAlign: "left",
                                  fontSize: 11.5, color: "rgba(255,255,255,0.85)", padding: "3px 6px", borderRadius: 7,
                                  background: isSaved ? "rgba(47,180,119,0.16)" : "transparent",
                                  border: `1px solid ${isSaved ? "#2FB477" : "transparent"}`,
                                  cursor: v == null ? "default" : "pointer" }}>
                                {isSaved && <CheckCircle2 size={11} color="#2FB477" style={{ flexShrink: 0 }} />}
                                <span>{v ?? "—"}{delta(v, b.totalKwhM2Yr)}</span>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                      <p style={{ fontSize: 9.5, color: "rgba(255,255,255,0.3)", padding: "8px 4px 0", lineHeight: 1.5 }}>
                        Total energy, kWh/m²·yr. <span style={{ color: "#2FB477" }}>▼ green</span> = less energy than as-built · <span style={{ color: "#E2483B" }}>▲ red</span> = more.
                        <br />Click a value to <b style={{ color: "rgba(255,255,255,0.5)" }}>save that package for that building</b> — each building can keep a different one, and Step 5 reports them per building. Click again to unsave.
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          </>)}

          {/* ══ SYSTEMS view ══ heating-system swap comparison */}
          {openStage === 4 && hasHeating && !isBE && baselineAgg?.avgHeatingKwhM2Yr != null && totalFloorAreaM2 > 0 && (
            <HeatingSystemPanel
              heatingDemandKwhM2Yr={baselineAgg.avgHeatingKwhM2Yr}
              floorAreaM2={totalFloorAreaM2}
              discountRate={assumptionValue(isUK ? "UK" : "SE", "discount_rate") ?? 0.03}
              catalogue={ukHvac}
            />
          )}

          </>
          )}

          {/* The climate target and the future-energy-price scenarios moved to
              Step 5 (Report): Step 4 designs, simulates and compares packages;
              Step 5 judges them. Both are still computed here from the results
              and saved to the store for Step 5 (see regretInputs above). */}

        </>
      )}
    </div>
  );
}
