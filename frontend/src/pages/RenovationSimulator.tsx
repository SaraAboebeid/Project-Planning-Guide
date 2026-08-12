import { useState, useMemo, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore, type RenovationCalcPackage, type RenovationCalcBuildingResult, type RenovationCalcSelection } from "../store/wizard";
import { climateGoalFor, assessAgainstGoal } from "../config/climateGoals";
import ClimateGoalPanel from "../components/ClimateGoalPanel";
import ComponentScopePanel from "../components/ComponentScopePanel";
import DecisionAnalysisPanel from "../components/DecisionAnalysisPanel";
import HeatingSystemPanel from "../components/HeatingSystemPanel";
import { computeRegret, annuityFactor, type RegretOptionInput } from "../utils/regretAnalysis";
import { api } from "../api/client";
import { lineItemsFor, type AreaLineItem } from "../config/componentAreaLineItems";
import { resolveBuildingGeometry, computeAreaForLineItem, quantityUnitLabel, type ResolvedBuildingGeometry } from "../utils/componentAreas";
import { itemsForLineItem, estimateCarbon, recommendationsForLineItem, type RecTag } from "../utils/materialRecommendation";
import { computePriorities, makeBuildingKeys, DEFAULT_WEIGHTS } from "../utils/retrofitPriority";
import {
  loadUkArchetypes, findUkArchetype, REFURB_TIERS,
  type TabulaArchetypeGB, type RefurbTierKey,
} from "../utils/ukArchetype";
import { UK_PLACEHOLDER_RATES, fmtGBP } from "../config/ukPlaceholderCostCarbon";
import { useWizardStepNav } from "../components/wizardNav";
import OptimizerPanel from "../components/OptimizerPanel";
import AssemblyBuilder from "../components/AssemblyBuilder";
import { ASSUMPTIONS } from "../config/optimizationAssumptions";
import { computeAssemblyU, MATERIAL_BY_ID, type AssemblyLayer, type ComponentKind } from "../config/assemblyLayers";
import { computeAssemblyCarbon, nearestWikellsAssembly } from "../utils/assemblyCosting";
import { parseAssemblyParts } from "../config/materialProperties";
import type { OptimizeComponentInput, OptimizeParams, OptimizePoint } from "../api/client";
import type { WikellsItem } from "../config/wikellsData";
import type { BoverketResource, WWRRecord } from "../types";
import { Loader2, CheckCircle2, XCircle, Plus, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";

/* Sweden/Gothenburg is the only geometry+cost+carbon-complete dataset - UK
 * buildings resolve via /api/uk/building and get real EPSM energy
 * simulation, but there's no UK cost/carbon catalogue equivalent to
 * Wikells/Boverket yet, so UK packages price via SYNTHETIC placeholder
 * rates (see ukPlaceholderCostCarbon.ts) and use TABULA GB's whole-building
 * refurbishment tiers in place of a per-component material picker.
 *
 * Every package here is submitted as ONE EPSM batch across every building
 * selected in Step 2 (see backend's /api/simulation-batch-submit) - not
 * just the first one - so a package's cost/carbon/energy are per-building
 * (footprint/wall area differ per building) and the comparison table shows
 * portfolio aggregates with a per-building breakdown on expand. */
const CITY_ID = "gothenburg"; // Sweden only - UK omits city_id, server auto-resolves the nearest district from lat/lon
const UK_TIER_SELECTIONS_KEY = "UK::RefurbTier";

const COMPONENT_COLORS: Record<string, string> = {
  "Walls": "#721CB8", "Windows": "#E8880C", "Doors": "#4ECDC4", "Floor": "#4A90E2",
  "Roof": "#4ECDC4", "Balcony": "#2FB477", "Vertical Extension (New Floor)": "#F97316",
};

function fmtSEK(n: number): string {
  return n.toLocaleString("sv-SE", { maximumFractionDigits: 0 }) + " SEK";
}

/* Comparison-table layout. Cooling is deliberately absent: the single-zone
   shoebox never reaches the 25 °C setpoint, so it always reports 0 and a column
   of zeros just reads as a broken number. */
const TABLE_COLS     = "24px 1.4fr 110px 110px 120px 150px 110px";
const BREAKDOWN_COLS = "1.4fr 110px 110px 120px 150px 110px";

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
}

/* Step 4 is a sequence — buildings, then designs, then packages, then results.
   Numbering it makes that legible; without it the page reads as five unrelated
   cards of equal weight and you can't tell what to do first. `state` dims a
   stage that isn't reachable yet and says what unlocks it. */
function StageHeader({
  n, title, hint, state = "active",
}: {
  n: number;
  title: string;
  hint?: string;
  state?: "active" | "waiting" | "done";
}) {
  const dim = state === "waiting";
  const accent = state === "done" ? "#2FB477" : dim ? "rgba(255,255,255,0.25)" : "#4ECDC4";
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "6px 0 2px", opacity: dim ? 0.55 : 1 }}>
      <span style={{
        flexShrink: 0, width: 20, height: 20, borderRadius: "50%", display: "inline-flex",
        alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800,
        color: dim ? "rgba(255,255,255,0.4)" : "#0b1220", background: accent,
        transform: "translateY(3px)",
      }}>{n}</span>
      <span style={{ fontSize: 13.5, fontWeight: 800, color: dim ? "rgba(255,255,255,0.55)" : "#fff" }}>{title}</span>
      {hint && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{hint}</span>}
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
          name: MATERIAL_BY_ID[l.materialId]?.label ?? l.materialId,
          thicknessMm: l.thicknessMm,
          category: MATERIAL_BY_ID[l.materialId]?.category,
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
function baselineUForKey(key: string): number | null {
  if (key === "Walls" || key === "VertExt::Walls") return 0.40;
  if (key === "Roof" || key === "VertExt::Roof") return 0.30;
  if (key === "Windows") return 1.80;
  if (key === "Floor" || key === "VertExt::Floor") return 0.40;
  return null;
}

function assumptionValue(country: "SE" | "UK", key: string): number | null {
  return ASSUMPTIONS[country].find((a) => a.key === key)?.value ?? null;
}

/** Aggregate a package's per-building rows into portfolio-level figures for
 * the comparison table - energy is averaged (it's a per-m² rate, comparable
 * across differently-sized buildings), cost/carbon are summed (portfolio
 * totals, not rates). */
function pkgAggregate(pkg: RenovationCalcPackage) {
  const n = pkg.buildings.length;
  const completed = pkg.buildings.filter((b) => b.status === "completed").length;
  const failed = pkg.buildings.filter((b) => b.status === "failed").length;
  const avg = (xs: (number | null)[]) => {
    const vals = xs.filter((x): x is number => x != null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  };
  const sumOrNull = (xs: (number | null)[]) =>
    xs.some((x) => x != null) ? Math.round(xs.reduce((a: number, x) => a + (x ?? 0), 0)) : null;
  return {
    n, completed, failed, pending: n - completed - failed,
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
  const color = COMPONENT_COLORS[item.parentComponent] ?? "#721CB8";
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
        <span style={{ fontSize: 9.5, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>{it.code}</span>

        <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 11, color: hovered ? "#fff" : "rgba(255,255,255,0.7)", lineHeight: 1.25,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.description}</span>
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
          {fmtSEK(it.costSEK)}/{item.quantityKind === "area" ? "m²" : "st"}
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

/* ─── UK refurbishment-tier picker (whole-building, not per-component) ────── */
function UkTierPicker({
  archetype, selectedTier, onSelect, footprintM2, buildingCount, uSource,
}: {
  archetype: TabulaArchetypeGB | null;
  selectedTier: RefurbTierKey | null;
  onSelect: (tier: RefurbTierKey) => void;
  footprintM2: number | null;
  buildingCount: number;
  uSource: string | null;
}) {
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
  const eraLabel = uSource === "known_year" ? "known construction year" : uSource === "ehs_sampled_period" ? "estimated era" : "era unknown";
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
        const checked = selectedTier === key;
        const color = "#721CB8";
        const rate = UK_PLACEHOLDER_RATES[key];
        const estCost = footprintM2 != null ? Math.round(rate.costGbpPerM2 * footprintM2) : null;
        const estCarbon = footprintM2 != null ? Math.round(rate.carbonKgCo2ePerM2 * footprintM2) : null;
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
                  ~{fmtGBP(estCost)} · ~{estCarbon.toLocaleString("en-GB")} kg CO₂e <i>(building 1, placeholder)</i>
                </span>
              )}
            </div>
          </button>
        );
      })}
      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", margin: 0 }}>
        Cost and embodied carbon for UK packages are SYNTHETIC PLACEHOLDER figures (flat £/m² and kg CO₂e/m² rates,
        not derived from any real dataset) shown only to test the calculator pipeline end-to-end - replace with a
        real, licensed UK cost/carbon source before using these numbers for an actual decision. The energy columns
        below come from a real EnergyPlus simulation using this tier's U-values, applied to every selected building.
      </p>
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────────────────────── */
export default function RenovationSimulator() {
  const navigate = useNavigate();
  const { project, setProject } = useWizardStore();

  const isUK = project.country === "United Kingdom";
  const COUNTRY = isUK ? "gb" : "se";

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

  const geometries = useMemo(
    () => buildings.map((b) => resolveBuildingGeometry(b)).filter((g): g is ResolvedBuildingGeometry => g !== null),
    [buildings]
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
  const [configs, setConfigs] = useState<ComponentConfig[]>([]);
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
  const [packageName, setPackageName] = useState("");
  const [expandedPkg, setExpandedPkg] = useState<string | null>(null);
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
  const [targetIdx, setTargetIdx] = useState<number | "all">("all");
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
    const tick = async () => {
      try {
        const status = await api.simulationBatchStatus(batchId);
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
                  error: row.error ?? b.error,
                };
              }),
            };
          }),
        });
        if (status.buildings.every((b) => b.status === "completed" || b.status === "failed")) {
          stopPoll(packageId);
        }
      } catch {
        // Transient network hiccup - keep polling.
      }
    };
    tick();
    pollHandles.current[packageId] = setInterval(tick, 4000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopPoll]);

  const submitBatch = useCallback(async (packageId: string, overrides: Record<string, number>, packageLabel: string | undefined, entries: GeoEntry[]) => {
    try {
      const { batch_id } = await api.simulationBatchSubmit({
        country: COUNTRY,
        ...(isUK ? {} : { city_id: CITY_ID }),
        buildings: entries.map(({ g }) => ({ lat: g.lat, lon: g.lon, address: g.address })),
        package_id: packageId, package_label: packageLabel ?? null,
        ...overrides,
      });
      setProject({
        renovationCalcPackages: useWizardStore.getState().project.renovationCalcPackages.map((p) =>
          p.id === packageId ? { ...p, batchId: batch_id } : p
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
  }, [geometries, isUK, pollBatch]);

  function makeBuildingRows(
    entries: GeoEntry[],
    costCarbonFor?: (g: ResolvedBuildingGeometry, i: number) => { costSEK: number | null; carbonKgCO2e: number | null }
  ): RenovationCalcBuildingResult[] {
    return entries.map(({ g, idx }) => {
      const cc = costCarbonFor ? costCarbonFor(g, idx) : { costSEK: null, carbonKgCO2e: null };
      return {
        address: g.address ?? `Building ${idx + 1}`, lat: g.lat, lon: g.lon, status: "queued",
        heatingKwhM2Yr: null, coolingKwhM2Yr: null, totalKwhM2Yr: null,
        costSEK: cc.costSEK, carbonKgCO2e: cc.carbonKgCO2e, error: null,
      };
    });
  }

  const submitBaseline = useCallback(() => {
    if (geometries.length === 0) return;
    const entries = geometries.map((g, i) => ({ g, idx: i }));
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

    if (isUK) {
      loadUkArchetypes().then((archetypes) => {
        // tabulaPeriodUsed (not tabulaPeriod) always carries whichever period actually
        // drove the backend's own TABULA lookup - real known year OR an EHS-sampled
        // era - so this matches the SAME archetype the building's as-built u-values
        // came from, rather than falling back to an arbitrary one when the era was
        // sampled (the common case - tabulaPeriod itself stays null for those).
        setUkArchetype(findUkArchetype(archetypes, geometries[0]!.useCat, geometries[0]!.tabulaPeriodUsed));
      }).catch(() => { /* no archetype match available */ });
    } else {
      const uniqueComponents = Array.from(new Set(lineItems.map((li) => li.boverketComponent)));
      Promise.all(uniqueComponents.map((c) => api.boverketMaterials(c).then((res) => [c, res] as const).catch(() => [c, []] as const)))
        .then((pairs) => setBoverketByComponent(Object.fromEntries(pairs)));
    }

    const existing = useWizardStore.getState().project.renovationCalcPackages;
    if (!existing.some((p) => p.isBaseline)) {
      submitBaseline();
    } else {
      for (const pkg of existing) {
        if (pkg.batchId && pkg.buildings.some((b) => b.status === "queued" || b.status === "running")) {
          pollBatch(pkg.id, pkg.batchId);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometries.length]);

  useEffect(() => {
    const handles = pollHandles.current;
    return () => { Object.values(handles).forEach(clearInterval); };
  }, []);

  useEffect(() => {
    if (isUK) return;
    let active = true;
    api.energyPrice("se").then((r) => {
      if (active && r.live && r.average_price != null) setLivePriceSek(r.average_price);
    }).catch(() => {});
    return () => { active = false; };
  }, [isUK]);

  /* ── derived: items/areas/recommendations for the active line item (Sweden only) ── */
  const activeItem = lineItems.find((li) => li.key === activeItemKey) ?? lineItems[0];
  // Supplier discount the owner gets off catalogue material prices — deducted from
  // every material cost downstream (picker display, saved configs, packages, optimizer)
  // because we discount the catalogue at the source here.
  const discountMul = 1 - Math.min(90, Math.max(0, project.supplierDiscountPct || 0)) / 100;
  const discountItems = (items: WikellsItem[]) =>
    project.supplierDiscountPct ? items.map((it) => ({ ...it, costSEK: it.costSEK != null ? it.costSEK * discountMul : it.costSEK })) : items;
  const activeCatalogue = activeItem ? discountItems(itemsForLineItem(activeItem)) : [];
  const activeBoverket = activeItem ? (boverketByComponent[activeItem.boverketComponent] ?? []) : [];
  const activeRecommendations = useMemo(
    () => (activeItem ? recommendationsForLineItem(activeCatalogue, activeBoverket, project.selectedKpis, baselineUForKey(activeItem.key)) : {}),
    [activeItem, activeCatalogue, activeBoverket, project.selectedKpis]
  );
  const activeQuantity = activeItem && geometries[0] ? computeAreaForLineItem(activeItem, geometries[0], wwrByIndex[0] ?? null, manualOverrides) : null;

  const itemByCode = useMemo(() => {
    const mul = 1 - Math.min(90, Math.max(0, project.supplierDiscountPct || 0)) / 100;
    const all = lineItems.flatMap((li) =>
      itemsForLineItem(li).map((it) => ({ ...it, costSEK: it.costSEK != null ? it.costSEK * mul : it.costSEK })));
    return Object.fromEntries(all.map((i) => [i.code, i]));
  }, [lineItems, project.supplierDiscountPct]);

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
      uValue: it.uValue ?? null,
      costPerM2: it.costSEK ?? null,
      carbonPerM2: estimateCarbon(it, boverketAll).value ?? null,
    }]);
    setDraftName("");
  }

  function saveLayerConfig() {
    if (!activeItem) return;
    const kind = kindForKey(activeItem.key);
    if (!kind || draftLayers.length === 0) return;
    const u = computeAssemblyU(draftLayers, kind);
    const carbon = computeAssemblyCarbon(draftLayers, boverketAll);
    // Cost is quoted from the nearest REAL Wikells assembly — Wikells prices
    // complete sections, never single layers, so a per-layer rate would be made up.
    const cost = nearestWikellsAssembly(u.uValue, kind, allItems);
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
      name: draftName.trim() || `${insName} · U ${u.uValue?.toFixed(2) ?? "—"}`,
      source: "layers", layers: draftLayers, uValue: u.uValue,
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

  const comboKey = (combo: ComponentConfig[]) => combo.map((c) => c.id).join("+");
  const activeCombos = packageCombosList.filter((c) => !excludedCombos.has(comboKey(c)));

  /* ── add a new package ─────────────────────────────────────────────────── */
  const PACKAGE_COLORS = ["#721CB8", "#4ECDC4", "#E8880C", "#2FB477", "#F97316", "#5FA5FF"];

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
    if (isUK) {
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
    setPackageName("");
    setDraftSelection({});
    newPkgs.forEach((pkg) => submitBatch(pkg.id, overridesFromSeSelections(pkg.selections, itemByCode), pkg.name, targetEntries));
  }

  /** Simulate every selected combination: one EPSM batch per package, across all
   *  targeted buildings. A layer-composed configuration passes its computed U
   *  through `customUValue`, which replaces the catalogue U in the IDF. */
  function simulateConfiguredPackages() {
    if (geometries.length === 0 || activeCombos.length === 0) return;
    const existing = packages.filter((p) => !p.isBaseline).length;
    const stamp = Date.now();

    const newPkgs: RenovationCalcPackage[] = activeCombos.map((combo, k) => {
      const selections: Record<string, RenovationCalcSelection> = {};
      combo.forEach((cfg) => {
        selections[cfg.componentKey] = {
          wikellsCode: cfg.wikellsCode ?? "",
          quantity: 0,
          configId: cfg.id,
          ...(cfg.source === "layers" && cfg.uValue != null
            ? { customUValue: cfg.uValue, customLabel: cfg.name, layers: cfg.layers }
            : {}),
        };
      });
      const name = combo.map((c) => c.name).join(" + ") + targetSuffix();
      const color = PACKAGE_COLORS[(existing + k) % PACKAGE_COLORS.length]!;
      const buildingRows = makeBuildingRows(targetEntries, (g, i) => {
        let costSEK = 0, carbonKgCO2e = 0, any = false;
        combo.forEach((cfg) => {
          const li = lineItems.find((l) => l.key === cfg.componentKey);
          if (!li) return;
          const qty = computeAreaForLineItem(li, g, wwrByIndex[i] ?? null, manualOverrides);
          if (qty == null) return;
          if (cfg.costPerM2 != null) { costSEK += cfg.costPerM2 * qty; any = true; }
          if (cfg.carbonPerM2 != null) { carbonKgCO2e += cfg.carbonPerM2 * qty; any = true; }
        });
        return any ? { costSEK: Math.round(costSEK), carbonKgCO2e: Math.round(carbonKgCO2e) } : { costSEK: null, carbonKgCO2e: null };
      });
      return {
        id: `pkg-${stamp}-${k}-${Math.round(Math.random() * 1e6)}`,
        name, color, isBaseline: false, selections, batchId: null, buildings: buildingRows,
      };
    });

    setProject({ renovationCalcPackages: [...packages, ...newPkgs] });
    newPkgs.forEach((pkg) =>
      submitBatch(pkg.id, overridesFromSeSelections(pkg.selections, itemByCode), pkg.name, targetEntries));
  }

  function addUkPackage() {
    if (geometries.length === 0 || !ukArchetype || !ukTier) return;
    const tier = ukArchetype[ukTier];
    const tierMeta = REFURB_TIERS.find((t) => t.key === ukTier)!;
    const rate = UK_PLACEHOLDER_RATES[ukTier];

    const id = `pkg-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const name = (packageName.trim() || tierMeta.label) + targetSuffix();
    const color = PACKAGE_COLORS[packages.filter((p) => !p.isBaseline).length % PACKAGE_COLORS.length]!;

    const buildingRows = makeBuildingRows(targetEntries, (g) => {
      const footprint = g.footprintM2 ?? 0;
      return footprint
        ? { costSEK: Math.round(rate.costGbpPerM2 * footprint), carbonKgCO2e: Math.round(rate.carbonKgCo2ePerM2 * footprint) }
        : { costSEK: null, carbonKgCO2e: null };
    });

    const pkg: RenovationCalcPackage = {
      id, name, color, isBaseline: false,
      selections: { [UK_TIER_SELECTIONS_KEY]: { wikellsCode: ukTier, quantity: 1 } },
      batchId: null, buildings: buildingRows,
    };
    setProject({ renovationCalcPackages: [...packages, pkg] });
    setPackageName("");
    setUkTier(null);
    submitBatch(id, ukOverridesFromTier(tier), name, targetEntries);
  }

  function retryPackage(pkg: RenovationCalcPackage) {
    if (geometries.length === 0) return;
    let overrides: Record<string, number> = {};
    if (isUK) {
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

  const baselinePkg = packages.find((p) => p.isBaseline);
  const baselineAgg = baselinePkg ? pkgAggregate(baselinePkg) : null;

  // City climate target (Gothenburg: −30% by 2030). Scored against the baseline
  // energy demand once packages have completed results — same helper the Step 5
  // report uses, so the two never disagree.
  const climateGoal = climateGoalFor(project.city, project.country);
  const goalAssessment = useMemo(() => {
    if (!climateGoal || baselineAgg?.avgTotalKwhM2Yr == null) return null;
    const rows = packages
      .filter((p) => !p.isBaseline)
      .map((p) => ({ pkg: p, total: pkgAggregate(p).avgTotalKwhM2Yr }))
      .filter((x): x is { pkg: RenovationCalcPackage; total: number } => x.total != null)
      .map(({ pkg, total }) => ({ label: pkg.name, color: pkg.color, energyUse: total, materials: packageMaterials(pkg, itemByCode) }));
    if (!rows.length) return null;
    return assessAgainstGoal(climateGoal, baselineAgg.avgTotalKwhM2Yr, rows);
  }, [climateGoal, baselineAgg?.avgTotalKwhM2Yr, packages, itemByCode]);

  /* ── Regret / robustness decision analysis (Step 4 → Step 5 report) ──────────
     Score each package + the do-nothing baseline by its 30-yr net benefit under
     Low/Medium/High energy-price scenarios, then rank by minimax regret, range
     and Hurwicz. Uncertain future prices → no single "best"; these rules help. */
  const [regretAlpha, setRegretAlpha] = useState(0.5);
  const [regretPrices, setRegretPrices] = useState<number[]>([0.5, 1.0, 2.0]); // SEK/kWh Low/Med/High
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
    if (isUK || regretOptions.length < 2 || baselineAgg?.avgTotalKwhM2Yr == null || totalFloorAreaM2 <= 0) return null;
    const scenarios = [
      { key: "low", label: "Low", priceSek: regretPrices[0]! },
      { key: "med", label: "Medium", priceSek: regretPrices[1]! },
      { key: "high", label: "High", priceSek: regretPrices[2]! },
    ];
    const af = annuityFactor(assumptionValue("SE", "discount_rate") ?? 0.03, 30);
    return computeRegret(regretOptions, scenarios,
      { baselineEnergyKwhM2: baselineAgg.avgTotalKwhM2Yr, totalFloorAreaM2, annuityFactor: af }, regretAlpha, 30, "");
  }, [isUK, regretOptions, baselineAgg?.avgTotalKwhM2Yr, totalFloorAreaM2, regretPrices, regretAlpha]);
  // Persist to the store for the Step-5 report — only when the content changes.
  const regretSigRef = useRef<string>("");
  useEffect(() => {
    if (!regretResult) return;
    const sig = JSON.stringify(regretResult);
    if (sig === regretSigRef.current) return;
    regretSigRef.current = sig;
    setProject({ regretAnalysis: { ...regretResult, generatedAt: new Date().toISOString() } });
  }, [regretResult, setProject]);

  /* ── Multi-objective optimizer input (Sweden) ────────────────────────────
     Build the per-component option matrix + economy/climate params from the
     already-resolved geometry, cost, carbon and EPSM baseline. The optimizer
     searches every combination on the fast physics; winners are validated in
     EPSM via validateOptimizerPick below. */
  const optimizerInput = useMemo((): { input: { components: OptimizeComponentInput[]; params: OptimizeParams } | null; disabledReason?: string } => {
    if (isUK) return { input: null, disabledReason: "The optimizer currently supports Sweden (Wikells cost/carbon) only." };
    const repIdx = targetIdx === "all" ? 0 : targetIdx;
    const repGeo = geometries[repIdx];
    if (!repGeo) return { input: null, disabledReason: "No building resolved yet." };
    const baseTotal = baselinePkg?.buildings[repIdx]?.totalKwhM2Yr ?? null;
    if (baseTotal == null) return { input: null, disabledReason: "Waiting for the baseline EnergyPlus run to finish…" };
    const footprint = repGeo.footprintM2 ?? 0;
    const floors = Math.max(1, Math.round((repGeo.height ?? 3.2) / 3.2));
    const floorArea = footprint * floors;
    if (!floorArea) return { input: null, disabledReason: "Building floor area unknown for this building." };

    const comps: OptimizeComponentInput[] = [];
    for (const li of lineItems) {
      const baseU = baselineUForKey(li.key);
      if (baseU == null) continue; // not a U-override component
      const area = computeAreaForLineItem(li, repGeo, wwrByIndex[repIdx] ?? null, manualOverrides);
      if (area == null || area <= 0) continue;
      // Vary over EVERY saved configuration for this component — both single
      // catalogue rows AND layer-composed assemblies — exactly the same set that
      // the packages are built from, so the optimizer evaluates all combinations
      // (3 walls × 5 roofs = 15), not just the catalogue subset. Each config
      // already carries its own U / cost / carbon (per m²), computed when saved.
      const compConfigs = configs.filter((c) => c.componentKey === li.key && c.uValue != null);
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
    if (comps.length === 0)
      return { input: null, disabledReason: "Save build-ups per component in the builder above — the trade-off curve appears here and updates as you go." };

    const params: OptimizeParams = {
      f_dh: (24 * (assumptionValue("SE", "degree_days") ?? 3300)) / 1000,
      energy_price: livePriceSek ?? assumptionValue("SE", "energy_price") ?? 0.8,
      carbon_factor_heat: assumptionValue("SE", "carbon_factor_heat") ?? 0.022,
      discount_rate: assumptionValue("SE", "discount_rate") ?? 0.03,
      study_period_yr: 30,
      floor_area_m2: Math.round(floorArea),
      baseline_total_kwh_m2_yr: baseTotal,
    };
    return { input: { components: comps, params } };
  }, [isUK, targetIdx, geometries, baselinePkg, lineItems, configs, wwrByIndex, manualOverrides, boverketAll, livePriceSek]);

  // Which optimizer picks are already validated (as a package) — keyed by the
  // touched (non-"keep") component→material selections, matching the panel.
  // Key a validated package by the config ids it used (matching the optimizer
  // option codes) so the panel can flag which Pareto points are already run.
  const validatedKeys = useMemo(
    () => new Set(
      packages.filter((p) => !p.isBaseline).map((p) =>
        Object.entries(p.selections)
          .filter(([k]) => baselineUForKey(k) != null)
          .map(([k, s]) => `${k}=${s.configId ?? s.wikellsCode}`)
          .sort()
          .join("|")
      )
    ),
    [packages]
  );

  // Turn one Pareto winner into a real package + EPSM run (drops into the
  // comparison table below alongside any hand-built packages). The optimizer's
  // option codes are ComponentConfig ids, so resolve each back to its saved
  // build-up (single Wikells row OR layer-composed assembly).
  function validateOptimizerPick(point: OptimizePoint, opts?: { auto?: boolean }) {
    if (geometries.length === 0) return;
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
      } as RenovationCalcSelection])
    );
    const autoName = touched.map(([, cfg]) => cfg.name).join(" + ");
    const name = `Optimal · ${autoName}` + targetSuffix();
    const existing = packages.filter((p) => !p.isBaseline).length;
    const color = PACKAGE_COLORS[existing % PACKAGE_COLORS.length]!;
    const buildingRows = makeBuildingRows(targetEntries, (g, i) => {
      let costSEK = 0, carbonKgCO2e = 0, any = false;
      for (const [key, cfg] of touched) {
        const li = lineItems.find((l) => l.key === key);
        if (!li) continue;
        const quantity = computeAreaForLineItem(li, g, wwrByIndex[i] ?? null, manualOverrides);
        if (quantity == null) continue;
        if (cfg.costPerM2 != null) { costSEK += cfg.costPerM2 * quantity; any = true; }
        if (cfg.carbonPerM2 != null) { carbonKgCO2e += cfg.carbonPerM2 * quantity; any = true; }
      }
      return any ? { costSEK: Math.round(costSEK), carbonKgCO2e: Math.round(carbonKgCO2e) } : { costSEK: null, carbonKgCO2e: null };
    });
    const id = `pkg-opt-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const pkg: RenovationCalcPackage = { id, name, color, isBaseline: false, selections, batchId: null, buildings: buildingRows, ...(opts?.auto ? { auto: true } : {}) };
    // Auto picks REPLACE the previous auto-package so exploring the curve doesn't
    // pile up dozens of near-identical "Optimal" runs; manual picks always add.
    const kept = opts?.auto ? packages.filter((p) => !p.auto) : packages;
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
          components: Object.fromEntries(Object.entries(p.selections).map(([k, s]) => {
            const it = itemByCode[s.wikellsCode];
            const layers = s.layers?.length
              ? s.layers.map((l) => ({
                  name: MATERIAL_BY_ID[l.materialId]?.label ?? l.materialId,
                  thicknessMm: l.thicknessMm,
                  category: MATERIAL_BY_ID[l.materialId]?.category,
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
    navigate("/step/5");
  }

  const canAddPackage = isUK ? ukTier != null : packageCombos > 0;

  // The wizard footer's Continue saves this step's results before advancing.
  useWizardStepNav({ onNext: handleSaveAndContinue });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1100 }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, color: "rgba(255,255,255,0.3)", marginBottom: 6, textTransform: "uppercase" }}>
          Renovation Planning · Step 4
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>Renovation Calculator</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: 0, lineHeight: 1.6 }}>
          {isUK
            ? "Pick a refurbishment tier and compare its simulated energy performance against the as-built baseline."
            : <>Design build-ups per component, combine them into packages, and run an energy simulation for each against the as-built baseline
               {geometries.length > 1 ? ` — across all ${geometries.length} buildings from Step 2, ordered by their retrofit priority (highest first).` : "."}</>}
        </p>
      </div>

      {geometries.length === 0 && (
        <div style={{ borderRadius: 12, padding: "14px 16px", background: "rgba(232,136,12,0.1)", border: "1px solid rgba(232,136,12,0.25)" }}>
          <p style={{ fontSize: 12, color: "#E8880C", margin: 0 }}>No buildings resolved yet — go back to Step 1/2 and select a location.</p>
        </div>
      )}

      {/* Renovation scope — add/remove components to test; nudges when the
          climate target isn't reached by the current (envelope-subset) scope. */}
      {!isUK && geometries.length > 0 && (
        <ComponentScopePanel
          components={components}
          onChange={(next) => setProject({ renovationEnvelopeComponents: next })}
          goalAssessment={goalAssessment}
        />
      )}

      {geometries.length > 0 && (
        <StageHeader n={1} title="Buildings & baseline"
          hint={baselineAgg?.avgTotalKwhM2Yr != null
            ? `as-built ${baselineAgg.avgTotalKwhM2Yr} kWh/m²·yr`
            : "running the as-built simulation…"}
          state={baselineAgg?.avgTotalKwhM2Yr != null ? "done" : "active"} />
      )}

      {/* ── Buildings & baseline performance + package target selector ── */}
      {geometries.length > 0 && (
        <div style={{ borderRadius: 14, padding: "14px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>Buildings & baseline performance</span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>baseline kWh/m²·yr</span>
            {geometries.length > 1 && (
              <>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginLeft: 4 }}>· new package applies to:</span>
                <button
                  onClick={() => setTargetIdx("all")}
                  style={{
                    fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8, cursor: "pointer",
                    border: `1px solid ${targetIdx === "all" ? "#2FB477" : "rgba(255,255,255,0.12)"}`,
                    background: targetIdx === "all" ? "rgba(47,180,119,0.15)" : "transparent",
                    color: targetIdx === "all" ? "#2FB477" : "rgba(255,255,255,0.6)",
                  }}
                >
                  All buildings ({geometries.length})
                </button>
              </>
            )}
          </div>
          {/* Same compact pill language as Step 3's building picker — name + its
              baseline energy inline; green when it's the package target. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {geometries.map((g, i) => {
              const row = baselinePkg?.buildings[i];
              const total = row?.totalKwhM2Yr;
              const selectable = geometries.length > 1;
              const selected = targetIdx === i;
              return (
                <button
                  key={`${g.lat}-${g.lon}-${i}`}
                  onClick={() => selectable && setTargetIdx(i)}
                  title={selectable ? `Build a package just for ${g.address ?? `Building ${i + 1}`}` : undefined}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 8,
                    cursor: selectable ? "pointer" : "default",
                    display: "inline-flex", alignItems: "center", gap: 6, maxWidth: 260,
                    border: `1px solid ${selected ? "#2FB477" : "rgba(255,255,255,0.08)"}`,
                    background: selected ? "rgba(47,180,119,0.14)" : "rgba(255,255,255,0.02)",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: selected ? "#fff" : "rgba(255,255,255,0.72)" }}>
                    {g.address ?? `Building ${i + 1}`}
                  </span>
                  <span style={{ fontSize: 10.5, fontWeight: 800, flexShrink: 0,
                    color: total != null ? "#2FB477" : "rgba(255,255,255,0.35)" }}>
                    {total != null ? total : row?.status === "failed" ? "—" : "…"}
                  </span>
                </button>
              );
            })}
          </div>
          {geometries.length > 1 && (
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", margin: "8px 0 0" }}>
              Pick a building to build a package just for it, or “All buildings” to apply the same package to every one. Each package runs its own EnergyPlus batch.
            </p>
          )}
        </div>
      )}

      {geometries.length > 0 && isUK && (
        <div style={{ borderRadius: 14, padding: "18px 20px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(114,28,184,0.2)" }}>
          <UkTierPicker
            archetype={ukArchetype} selectedTier={ukTier} onSelect={setUkTier}
            footprintM2={geometries[0]?.footprintM2 ?? null} buildingCount={geometries.length}
            uSource={geometries[0]?.tabulaUSource ?? null}
          />
        </div>
      )}

      {geometries.length > 0 && !isUK && hasEnvelope && (
        <>
          <StageHeader n={2} title="Design configurations"
            hint={configs.length
              ? configuredComponents.map((c) => `${c.cfgs.length} ${c.item.label.toLowerCase()}`).join(" · ")
              : "save one or more build-ups per component"}
            state={configs.length ? "done" : "active"} />

          {/* Supplier discount — the % the property owner gets off catalogue material
              prices; deducted from every material cost (Wikells is Sweden-only). */}
          {!isUK && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "0 0 14px",
              padding: "11px 14px", borderRadius: 10, background: "rgba(47,180,119,0.07)", border: "1px solid rgba(47,180,119,0.22)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#f0f4ff" }}>Supplier discount</span>
                <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)" }}>
                  If the owner has a supplier discount, enter it — it's deducted from every catalogue material price (cost only; carbon unaffected).
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                <input
                  type="number" min={0} max={90} step={1}
                  value={project.supplierDiscountPct || 0}
                  onChange={(e) => setProject({ supplierDiscountPct: Math.min(90, Math.max(0, Number(e.target.value) || 0)) })}
                  style={{ width: 72, padding: "6px 8px", borderRadius: 8, textAlign: "right",
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 13, fontWeight: 700 }}
                />
                <span style={{ fontSize: 14, fontWeight: 800, color: "#2FB477" }}>%</span>
              </div>
              {(project.supplierDiscountPct || 0) > 0 && (
                <span style={{ fontSize: 10.5, color: "#2FB477", fontWeight: 700, width: "100%" }}>
                  ✓ Material prices are net of −{project.supplierDiscountPct}%. Re-pick materials / rebuild packages to apply it to existing ones.
                </span>
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
                      const color = COMPONENT_COLORS[item.parentComponent] ?? "#721CB8";
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
              <div style={{ borderRadius: 14, padding: "18px 20px", background: "rgba(255,255,255,0.03)", border: `1px solid ${COMPONENT_COLORS[activeItem.parentComponent] ?? "#721CB8"}33` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: 0 }}>{activeItem.label}</h3>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                    {activeQuantity != null
                      ? `${activeQuantity.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} ${quantityUnitLabel(activeItem.quantityKind)}${geometries.length > 1 ? " (building 1)" : ""}`
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
                {/* ── Saved configurations for this component ── */}
                {(() => {
                  const mine = configs.filter((c) => c.componentKey === activeItem.key);
                  return (
                    <div style={{ marginBottom: mine.length ? 14 : 4 }}>
                      {mine.length > 0 && (
                        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
                          Saved ({mine.length}) — each becomes a package option
                        </div>
                      )}
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
                              {c.costPerM2 != null ? `${Math.round(c.costPerM2).toLocaleString("sv-SE")} SEK/m²` : "cost —"}
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
                                no Boverket data: {c.carbonUnmatched.join(", ")}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Design a new configuration ── */}
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    {(() => {
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
                              border: `1px solid ${active ? "rgba(78,205,196,0.6)" : "rgba(255,255,255,0.12)"}`,
                              background: active ? "rgba(78,205,196,0.16)" : "transparent",
                              color: active ? "#4ECDC4" : "rgba(255,255,255,0.55)" }}>
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

                  {(draftMode === "layers" && kindForKey(activeItem.key)) ? (
                    <>
                      {baselineUForKey(activeItem.key) != null && (
                        <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.45)", marginBottom: 8, lineHeight: 1.5 }}>
                          Compose the assembly layer by layer — the live U-value updates as you go.
                          {" "}Aim <strong style={{ color: "#4ECDC4" }}>below U {baselineUForKey(activeItem.key)!.toFixed(2)}</strong> to improve this building's {activeItem.label.toLowerCase()}.
                        </div>
                      )}
                      <AssemblyBuilder
                        kind={kindForKey(activeItem.key)!}
                        layers={draftLayers}
                        onChange={setDraftLayers}
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
                        baselineU={baselineUForKey(activeItem.key)}
                      />
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {geometries.length > 0 && (
        <>
          {/* ══ PACKAGES — the product of your configurations ══════════════ */}
          {!isUK && hasEnvelope && (
            <StageHeader n={3} title="Packages"
              hint={packageCombosList.length
                ? `${activeCombos.length} selected of ${packageCombosList.length}`
                : "needs at least one configuration"}
              state={packageCombosList.length ? "active" : "waiting"} />
          )}
          {!isUK && hasEnvelope && (
            <div style={{ borderRadius: 14, padding: "14px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>Packages</span>
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

              {packageCombosList.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <button onClick={simulateConfiguredPackages} disabled={activeCombos.length === 0}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 9,
                      fontSize: 12.5, fontWeight: 800,
                      border: "1px solid rgba(47,180,119,0.45)", background: "rgba(47,180,119,0.14)", color: "#2FB477",
                      cursor: activeCombos.length ? "pointer" : "not-allowed", opacity: activeCombos.length ? 1 : 0.45 }}>
                    <Plus size={14} /> Run energy simulation (EPSM) · {activeCombos.length} package{activeCombos.length === 1 ? "" : "s"}
                    {geometries.length > 1 && targetIdx === "all" ? ` × ${geometries.length} buildings` : ""}
                  </button>
                  <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)", maxWidth: 460, lineHeight: 1.5 }}>
                    {activeCombos.length <= 10
                      ? "Small enough to run every combination in EnergyPlus directly — exact results for exactly these designs."
                      : "That's a lot of EnergyPlus runs. Use the optimizer below to find the best trade-offs first, then simulate only those."}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* UK keeps the tier-based flow */}
          {isUK && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 12, padding: "12px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <input value={packageName} onChange={(e) => setPackageName(e.target.value)}
                placeholder="Package name (optional)"
                style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 12 }} />
              <button onClick={() => addPackage()} disabled={!canAddPackage}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                  border: "1px solid rgba(47,180,119,0.4)", background: "rgba(47,180,119,0.12)", color: "#2FB477",
                  cursor: canAddPackage ? "pointer" : "not-allowed", opacity: canAddPackage ? 1 : 0.5 }}>
                <Plus size={13} /> Add package
              </button>
            </div>
          )}

          {/* The trade-off curve now updates live from the same picks, so it's a
              companion view (not a separate "run this instead" tool). */}
          {!isUK && hasEnvelope && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0 -4px" }}>
              <span style={{ height: 1, flex: 1, background: "rgba(255,255,255,0.08)" }} />
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase", color: "rgba(255,255,255,0.28)" }}>
                live pareto optimization
              </span>
              <span style={{ height: 1, flex: 1, background: "rgba(255,255,255,0.08)" }} />
            </div>
          )}

          {/* Multi-objective optimizer (Sweden) — Pareto front over the fast
              degree-day physics; each validated winner runs in EPSM and drops
              into the comparison table below. */}
          {!isUK && hasEnvelope && (
            <OptimizerPanel
              input={optimizerInput.input}
              disabledReason={optimizerInput.disabledReason}
              onValidate={validateOptimizerPick}
              currency="SEK"
              validatedKeys={validatedKeys}
              selectedKpis={project.selectedKpis}
            />
          )}

          {(isUK || hasEnvelope) && (<>
          <StageHeader n={4} title="Results"
            hint={packages.filter((p) => !p.isBaseline).length
              ? `${packages.filter((p) => !p.isBaseline).length} package${packages.filter((p) => !p.isBaseline).length === 1 ? "" : "s"} vs baseline`
              : "simulate a package to compare"}
            state={packages.filter((p) => !p.isBaseline).length ? "active" : "waiting"} />

          {/* Prominent "EnergyPlus is running" banner so it's obvious a simulation
              is in flight and results will appear on their own (no click needed). */}
          {(() => {
            let running = 0, done = 0, total = 0;
            for (const p of packages) for (const b of p.buildings) {
              total++;
              if (b.status === "completed" || b.status === "failed") done++;
              if (b.status === "queued" || b.status === "running") running++;
            }
            if (running === 0) return null;
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 11, margin: "0 0 12px", padding: "11px 14px", borderRadius: 10,
                background: "rgba(232,136,12,0.10)", border: "1px solid rgba(232,136,12,0.32)" }}>
                <span style={{ width: 15, height: 15, borderRadius: "50%", border: "2px solid rgba(232,136,12,0.3)",
                  borderTopColor: "#E8880C", display: "inline-block", animation: "spin 0.9s linear infinite", flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#E8880C" }}>
                  Running EnergyPlus simulations… {done}/{total} buildings done.
                  <span style={{ fontWeight: 500, color: "rgba(255,255,255,0.6)", marginLeft: 6 }}>
                    This can take a minute — results fill in below automatically, no need to click.
                  </span>
                </span>
              </div>
            );
          })()}

          {/* Two read-outs of the same batch: per-package aggregates, or a
              per-building matrix (baseline vs every package, one row per address). */}
          <div style={{ borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "16px 18px" }}>
            {(baselinePkg?.buildings.length ?? 0) > 1 && (
              <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
                {([["package", "By package"], ["building", "By building"]] as const).map(([v, label]) => (
                  <button key={v} onClick={() => setResultView(v)}
                    style={{ padding: "5px 12px", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer",
                      border: `1px solid ${resultView === v ? "rgba(78,205,196,0.5)" : "rgba(255,255,255,0.12)"}`,
                      background: resultView === v ? "rgba(78,205,196,0.14)" : "transparent",
                      color: resultView === v ? "#4ECDC4" : "rgba(255,255,255,0.5)" }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {resultView === "package" ? (
            <>
            <div style={{ display: "grid", gridTemplateColumns: TABLE_COLS, gap: 10, padding: "0 4px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 8 }}>
              {[
                { k: "exp", l: "" },
                { k: "pkg", l: "Package" },
                { k: "cost", l: "Cost" },
                { k: "carbon", l: "Carbon" },
                { k: "heat", l: "Heating", sub: "kWh/m²·yr" },
                { k: "total", l: "Total energy", sub: "heating + hot water + lighting + equipment, kWh/m²·yr" },
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
            {[...packages].sort((a, b) => (a.isBaseline ? -1 : b.isBaseline ? 1 : 0)).map((pkg) => {
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
                    <span style={{ fontSize: 12, fontWeight: 600, color: pkg.isBaseline ? "rgba(255,255,255,0.5)" : "#fff" }}>
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: pkg.color, marginRight: 6 }} />
                      {pkg.name}{agg.n > 1 ? ` (${agg.n} buildings)` : ""}
                      {/* Applied envelope U-values — makes an uninsulated pick (which
                          replaces, never adds to, the baseline U) explain its own result. */}
                      {!pkg.isBaseline && !isUK && (() => {
                        const us = appliedUValues(pkg, itemByCode);
                        if (!us.length) return null;
                        return (
                          <span style={{ display: "block", fontSize: 9.5, marginTop: 3, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>
                            applies{" "}
                            {us.map((x, i) => (
                              <span key={x.label}>
                                {i > 0 ? " · " : ""}{x.label} U{" "}
                                <span style={{ fontWeight: 700, color: x.u > 0.4 ? "#E2483B" : x.u > 0.3 ? "#E8880C" : "#2FB477" }}>
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
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }} title={isUK && agg.totalCostSEK != null ? "Synthetic placeholder - not a real UK cost source" : undefined}>
                      {agg.totalCostSEK == null ? "—" : isUK ? `${fmtGBP(agg.totalCostSEK)}*` : fmtSEK(agg.totalCostSEK)}
                    </span>
                    <span style={{ fontSize: 12, color: "#4A90E2" }} title={isUK && agg.totalCarbonKgCO2e != null ? "Synthetic placeholder - not a real UK carbon source" : undefined}>
                      {agg.totalCarbonKgCO2e == null ? "—" : isUK ? `${agg.totalCarbonKgCO2e.toLocaleString("en-GB")} kg*` : `${agg.totalCarbonKgCO2e.toLocaleString("sv-SE")} kg`}
                    </span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
                      {agg.avgHeatingKwhM2Yr ?? "—"}
                      {vsBaseline(agg.avgHeatingKwhM2Yr, baselineAgg?.avgHeatingKwhM2Yr ?? null, pkg.isBaseline)}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: pkg.isBaseline ? "rgba(255,255,255,0.6)" : "#2FB477" }}>
                      {agg.avgTotalKwhM2Yr ?? "—"}
                      {vsBaseline(agg.avgTotalKwhM2Yr, baselineAgg?.avgTotalKwhM2Yr ?? null, pkg.isBaseline)}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {agg.pending > 0 && <Loader2 size={13} color="#E8880C" style={{ animation: "spin 1s linear infinite" }} />}
                      {agg.pending === 0 && agg.failed === 0 && <CheckCircle2 size={13} color="#2FB477" />}
                      {agg.failed > 0 && (
                        <>
                          <XCircle size={13} color="#E2483B" />
                          <button onClick={() => retryPackage(pkg)} title="Retry failed buildings" style={{ background: "transparent", border: 0, cursor: "pointer", color: "#E2483B" }}>
                            <RefreshCw size={12} />
                          </button>
                        </>
                      )}
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{agg.completed}/{agg.n}</span>
                    </span>
                  </div>
                  {expanded && (
                    <div style={{ padding: "6px 4px 10px 34px", display: "flex", flexDirection: "column", gap: 4 }}>
                      {pkg.buildings.map((b) => (
                        <div key={`${pkg.id}-${b.address}-${b.lat}-${b.lon}`} style={{ display: "grid", gridTemplateColumns: BREAKDOWN_COLS, gap: 10, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.address}</span>
                          <span>{b.costSEK == null ? "—" : isUK ? fmtGBP(b.costSEK) : fmtSEK(b.costSEK)}</span>
                          <span>{b.carbonKgCO2e == null ? "—" : `${b.carbonKgCO2e.toLocaleString(isUK ? "en-GB" : "sv-SE")} kg`}</span>
                          <span>{b.heatingKwhM2Yr ?? "—"}</span>
                          <span>{b.totalKwhM2Yr ?? "—"}</span>
                          <span style={{ color: b.status === "failed" ? "#fca5a5" : b.status === "completed" ? "#2FB477" : "#E8880C" }} title={b.error ?? undefined}>
                            {b.status}
                          </span>
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
            {isUK && packages.some((p) => pkgAggregate(p).totalCostSEK != null) && (
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", padding: "6px 4px 0" }}>
                * Synthetic placeholder cost/carbon (not a real UK data source) - see ukPlaceholderCostCarbon.ts.
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
                            return (
                              <span key={p.id} style={{ fontSize: 11.5, color: "rgba(255,255,255,0.85)" }}>
                                {v ?? "—"}{delta(v, b.totalKwhM2Yr)}
                              </span>
                            );
                          })}
                        </div>
                      ))}
                      <p style={{ fontSize: 9.5, color: "rgba(255,255,255,0.3)", padding: "8px 4px 0", lineHeight: 1.5 }}>
                        Total energy, kWh/m²·yr. <span style={{ color: "#2FB477" }}>▼ green</span> = less energy than as-built · <span style={{ color: "#E2483B" }}>▲ red</span> = more.
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          </>)}

          {/* City climate target — which package reaches Gothenburg's −30% by 2030 */}
          {(isUK || hasEnvelope) && goalAssessment && <ClimateGoalPanel a={goalAssessment} />}

          {/* Heating-system (HVAC source) comparison on the baseline heat demand.
              Shown only when heating is in scope (Step 1 or added in Step 4). */}
          {!isUK && hasHeating && baselineAgg?.avgHeatingKwhM2Yr != null && totalFloorAreaM2 > 0 && (
            <HeatingSystemPanel
              heatingDemandKwhM2Yr={baselineAgg.avgHeatingKwhM2Yr}
              floorAreaM2={totalFloorAreaM2}
              discountRate={assumptionValue("SE", "discount_rate") ?? 0.03}
            />
          )}

          {/* Regret / robustness decision analysis under uncertain energy prices */}
          {regretResult && regretResult.options.length >= 2 && (
            <DecisionAnalysisPanel
              result={regretResult}
              alpha={regretAlpha}
              setAlpha={setRegretAlpha}
              prices={regretPrices}
              setPrices={setRegretPrices}
              currentPrice={livePriceSek ?? assumptionValue("SE", "energy_price") ?? 0.8}
            />
          )}

        </>
      )}
    </div>
  );
}
