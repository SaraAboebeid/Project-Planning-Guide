/**
 * UK refurbishment cost and embodied carbon per TABULA tier, from openly
 * licensed sources. Replaces the flat synthetic £/m² placeholder rates.
 *
 * COST - installed capital cost, England, 2020 prices, excluding VAT:
 *   DESNZ, "Improving the energy performance of privately rented homes -
 *   final stage impact assessment", DESNZ034(F)-25-NZBI (16 Jan 2026),
 *   Table 20 (p.61): cost = fixed £ per install + unit £ per m² treated.
 *   Crown copyright, Open Government Licence v3.0.
 *   Triple-glazing uplift (+15%) from CAR for BEIS, "What does it cost to
 *   retrofit homes?" (2017), p.31 - a single interviewee, low confidence.
 *
 * EMBODIED CARBON
 *   Insulation (wall and loft): DESNZ GHG conversion factors 2025, Material
 *   use, primary production (OGL v3.0) - flat file row 19_500_5024_15_1,
 *   "Construction / Insulation / Primary material production" =
 *   1,861.79306 kg CO₂e per tonne. This is a generic material-average factor
 *   (no product type, density or λ); scope is extraction, processing,
 *   manufacture and transport to point of sale. DESNZ gives no density, so
 *   the mass is still sized with Boverket klimatdatabas densities/λ (glass
 *   wool for loft and cavity fill, stone wool for external wall insulation).
 *   Windows: Boverket klimatdatabas v02.07.000 (21 Jan 2026) A1-A3 typical,
 *   licensed for use with Boverket named as source (Swedish product). DESNZ
 *   has no complete window product - its "Other / Glass" factor is packaging
 *   glass - and ICE/ÖKOBAUDAT licences do not allow use in a tool.
 *   Insulation mass is derived from the thickness needed to reach the tier
 *   U-value (d = λ·(1/U_new − 1/U_old), EN ISO 6946 layer resistance).
 *
 * Not covered, reported as such rather than guessed: external doors (no OGL
 * cost source), render/fixings/scaffold carbon, and ground floors (TABULA GB
 * tiers leave the floor unchanged).
 */

import type { TabulaTier } from "../utils/ukArchetype";

export const UK_COST_PRICE_BASIS = "2020 prices, ex VAT";

/** DESNZ PRS IA Table 20 - fixed £ per install + £ per m² treated. */
const COST = {
  cavity_fill:   { fixed: 295,  perM2: 3 },    // "Cavity wall - low cost"
  // EWI fixed cost is published as a range (£1,630-5,595 by dwelling type); midpoint used.
  external_wall: { fixed: (1630 + 5595) / 2, perM2: 130 },
  loft:          { fixed: 175,  perM2: 6 },
  glazing:       { fixed: 1230, perM2: 160 },  // double/secondary glazing
} as const;
const TRIPLE_GLAZING_UPLIFT = 1.15;

/** DESNZ GHG conversion factors 2025, Material use, Construction: Insulation,
 *  primary material production (row 19_500_5024_15_1): 1,861.79306 kg CO₂e/tonne. */
const DESNZ_INSULATION_KGCO2E_PER_KG = 1861.79306 / 1000;

/** Carbon factor: DESNZ generic insulation. Density and λ: Boverket klimatdatabas products
 *  (DESNZ gives no density), used only to size the insulation mass. */
const MATERIAL = {
  glass_wool:  { gwpPerKg: DESNZ_INSULATION_KGCO2E_PER_KG, densityKgM3: 18.7, lambda: 0.037 },  // glass wool batts
  stone_wool:  { gwpPerKg: DESNZ_INSULATION_KGCO2E_PER_KG, densityKgM3: 80,   lambda: 0.036 },  // stone wool facade board
} as const;
/** PVC triple-glazed window, 39.0 kg/m² × 2.1 kg CO₂e/kg. Used for both glazing tiers
 *  (no complete double-glazed window in the database), so the standard tier is conservative. */
const WINDOW_KGCO2E_PER_M2 = 39.0 * 2.1;

export interface UkQuantities {
  wallNetM2: number | null;   // opaque façade (gross wall minus glazing)
  roofM2: number | null;      // footprint
  windowM2: number | null;    // gross wall × WWR
}

export interface UkCostLine {
  element: "Walls" | "Roof" | "Windows" | "Doors";
  measure: string;
  quantityM2: number | null;
  costGbp: number | null;
  carbonKgCo2e: number | null;
  note?: string;
}

export interface UkTierCostCarbon {
  costGbp: number | null;
  carbonKgCo2e: number | null;
  lines: UkCostLine[];
}

function insulationKgCo2ePerM2(mat: keyof typeof MATERIAL, uOld: number, uNew: number): number {
  const m = MATERIAL[mat];
  const thicknessM = Math.max(0, m.lambda * (1 / uNew - 1 / uOld));
  return thicknessM * m.densityKgM3 * m.gwpPerKg;
}

/** Cost and embodied carbon of moving one building from as-built to a tier. */
export function ukTierCostCarbon(asBuilt: TabulaTier, tier: TabulaTier, q: UkQuantities): UkTierCostCarbon {
  const lines: UkCostLine[] = [];

  if (tier.u_wall != null && asBuilt.u_wall != null && tier.u_wall < asBuilt.u_wall) {
    // TABULA GB's cavity-era walls (U 1.6) go to 0.6 - a filled cavity. Solid
    // walls (U 2.1) go to 0.3, which only external insulation reaches.
    const cavity = asBuilt.u_wall < 2 && tier.u_wall >= 0.5;
    const c = cavity ? COST.cavity_fill : COST.external_wall;
    const a = q.wallNetM2;
    lines.push({
      element: "Walls",
      measure: cavity ? "Cavity wall insulation" : "External wall insulation (solid wall)",
      quantityM2: a,
      costGbp: a != null ? c.fixed + c.perM2 * a : null,
      carbonKgCo2e: a != null ? a * insulationKgCo2ePerM2(cavity ? "glass_wool" : "stone_wool", asBuilt.u_wall, tier.u_wall) : null,
      note: cavity ? "carbon: DESNZ generic insulation, sized at glass-wool density" : "carbon: DESNZ generic insulation, board only (no render/fixings)",
    });
  }

  if (tier.u_roof != null && asBuilt.u_roof != null && tier.u_roof < asBuilt.u_roof) {
    const a = q.roofM2;
    lines.push({
      element: "Roof", measure: "Loft insulation", quantityM2: a,
      costGbp: a != null ? COST.loft.fixed + COST.loft.perM2 * a : null,
      carbonKgCo2e: a != null ? a * insulationKgCo2ePerM2("glass_wool", asBuilt.u_roof, tier.u_roof) : null,
    });
  }

  if (tier.u_window != null && asBuilt.u_window != null && tier.u_window < asBuilt.u_window) {
    const a = q.windowM2;
    const triple = tier.u_window < 2;
    const base = a != null ? COST.glazing.fixed + COST.glazing.perM2 * a : null;
    lines.push({
      element: "Windows",
      measure: triple ? `High-performance glazing (U ${tier.u_window})` : `Double glazing (U ${tier.u_window})`,
      quantityM2: a,
      costGbp: base != null ? base * (triple ? TRIPLE_GLAZING_UPLIFT : 1) : null,
      carbonKgCo2e: a != null ? a * WINDOW_KGCO2E_PER_M2 : null,
      note: triple ? "cost: +15% triple-glazing uplift (low confidence)" : undefined,
    });
  }

  if (tier.u_door != null && asBuilt.u_door != null && tier.u_door < asBuilt.u_door) {
    lines.push({ element: "Doors", measure: `Door replacement (U ${tier.u_door})`, quantityM2: null,
      costGbp: null, carbonKgCo2e: null, note: "not costed - no openly licensed UK source" });
  }

  const costed = lines.filter((l) => l.costGbp != null);
  const carbonKnown = lines.filter((l) => l.carbonKgCo2e != null);
  return {
    // Any measure whose quantity is unknown makes the total unknown rather than silently low.
    costGbp: lines.length && lines.every((l) => l.element === "Doors" || l.costGbp != null)
      ? Math.round(costed.reduce((s, l) => s + l.costGbp!, 0)) : null,
    carbonKgCo2e: lines.length && lines.every((l) => l.element === "Doors" || l.carbonKgCo2e != null)
      ? Math.round(carbonKnown.reduce((s, l) => s + l.carbonKgCo2e!, 0)) : null,
    lines,
  };
}

/* ─── Per-component measures for the UK optimiser ──────────────────────────
   Unlike the whole-building TABULA tiers above, the optimiser mixes measures
   component by component. Each option's U-value is the building's CURRENT
   U-value (from its EPC fabric) with the insulation layer added in series,
   R_new = 1/U_old + d/λ (EN ISO 6946), so a house that already has a filled
   cavity or 270 mm in the loft is not credited twice. Costs are DESNZ PRS IA
   Table 20 (fixed per install + £/m²), except internal wall insulation, which
   DESNZ does not cost: CAR for BEIS (2017) range £55-140/m², midpoint used. */

export interface UkMeasureOption {
  code: string;
  label: string;
  uValue: number;
  costGbp: number;
  carbonKgCo2e: number;
}

const WINDOW_U = { double: 1.4, triple: 0.9 };      // Part L 2021 replacement-window limit / typical triple
const IWI_COST_PER_M2 = (55 + 140) / 2;

function withLayer(uOld: number, mat: keyof typeof MATERIAL, thicknessM: number): number {
  return 1 / (1 / uOld + thicknessM / MATERIAL[mat].lambda);
}

function layerCarbonPerM2(mat: keyof typeof MATERIAL, thicknessM: number): number {
  return thicknessM * MATERIAL[mat].densityKgM3 * MATERIAL[mat].gwpPerKg;
}

/** Improving options per component for one building. Keys match the Step-4
 *  line items ("Walls", "Roof", "Windows", "Floor"); options that would not
 *  lower the U-value are dropped. */
export function ukMeasureOptions(
  component: "Walls" | "Roof" | "Windows" | "Floor",
  currentU: number,
  areaM2: number,
  wallIsCavity: boolean,
): UkMeasureOption[] {
  const out: UkMeasureOption[] = [];
  const add = (code: string, label: string, u: number, cost: number, carbon: number) => {
    if (u < currentU - 0.01) out.push({ code, label, uValue: Math.round(u * 1000) / 1000, costGbp: Math.round(cost), carbonKgCo2e: Math.round(carbon) });
  };
  if (component === "Walls") {
    // An unfilled cavity (~50-75 mm) filled with blown insulation; only for cavity walls still above ~1.0.
    if (wallIsCavity && currentU > 1.0) {
      add("cavity_fill", "Cavity wall insulation", withLayer(currentU, "glass_wool", 0.065),
        COST.cavity_fill.fixed + COST.cavity_fill.perM2 * areaM2, areaM2 * layerCarbonPerM2("glass_wool", 0.065));
    }
    for (const mm of [100, 150]) {
      add(`ewi_${mm}`, `External wall insulation ${mm} mm`, withLayer(currentU, "stone_wool", mm / 1000),
        COST.external_wall.fixed + COST.external_wall.perM2 * areaM2, areaM2 * layerCarbonPerM2("stone_wool", mm / 1000));
    }
    add("iwi_80", "Internal wall insulation 80 mm", withLayer(currentU, "glass_wool", 0.08),
      IWI_COST_PER_M2 * areaM2, areaM2 * layerCarbonPerM2("glass_wool", 0.08));
  } else if (component === "Roof") {
    // Top up the loft to a total thickness; the added thickness is what the U-value doesn't yet explain.
    for (const mm of [200, 300]) {
      const target = _LOFT_U(mm);
      if (target >= currentU) continue;
      const addedM = Math.max(0, MATERIAL.glass_wool.lambda * (1 / target - 1 / currentU));
      add(`loft_${mm}`, `Loft insulation to ${mm} mm`, target,
        COST.loft.fixed + COST.loft.perM2 * areaM2, areaM2 * layerCarbonPerM2("glass_wool", addedM));
    }
  } else if (component === "Windows") {
    add("double", `Double glazing (U ${WINDOW_U.double})`, WINDOW_U.double,
      COST.glazing.fixed + COST.glazing.perM2 * areaM2, areaM2 * WINDOW_KGCO2E_PER_M2);
    add("triple", `Triple glazing (U ${WINDOW_U.triple})`, WINDOW_U.triple,
      (COST.glazing.fixed + COST.glazing.perM2 * areaM2) * TRIPLE_GLAZING_UPLIFT, areaM2 * WINDOW_KGCO2E_PER_M2);
  } else if (component === "Floor") {
    add("floor_100", "Floor insulation 100 mm", withLayer(currentU, "glass_wool", 0.1),
      FLOOR_COST_PER_M2 * areaM2, areaM2 * layerCarbonPerM2("glass_wool", 0.1));
  }
  return out;
}

/** DESNZ PRS IA Table 20: floor insulation, £40/m², no fixed cost. */
const FLOOR_COST_PER_M2 = 40;

/** Pitched-roof U-value by total loft insulation thickness (RdSAP Table S9; tools/uk/epc_fabric.py). */
function _LOFT_U(mm: number): number {
  const table: [number, number][] = [[0, 2.3], [50, 0.68], [100, 0.4], [150, 0.3], [200, 0.21], [250, 0.17], [270, 0.16], [300, 0.14], [350, 0.12], [400, 0.11]];
  let u = 2.3;
  for (const [t, v] of table) if (mm >= t) u = v;
  return u;
}

/** Unit rates as published, for the Data Explorer source card. */
export const UK_COST_CARBON_SAMPLE = [
  { measure: "Cavity wall insulation", fixed_gbp: COST.cavity_fill.fixed, gbp_per_m2: COST.cavity_fill.perM2, carbon_basis: `insulation ${DESNZ_INSULATION_KGCO2E_PER_KG.toFixed(2)} kg CO₂e/kg (DESNZ GHG conversion factors 2025, Material use, primary production (OGL v3.0); generic material average); mass at glass wool 18.7 kg/m³ (Boverket)`, source: "DESNZ PRS IA Table 20; DESNZ GHG conversion factors 2025; Boverket density" },
  { measure: "External wall insulation", fixed_gbp: COST.external_wall.fixed, gbp_per_m2: COST.external_wall.perM2, carbon_basis: `insulation ${DESNZ_INSULATION_KGCO2E_PER_KG.toFixed(2)} kg CO₂e/kg (DESNZ GHG conversion factors 2025, Material use, primary production (OGL v3.0); generic material average); mass at stone wool 80 kg/m³ (Boverket)`, source: "DESNZ PRS IA Table 20 (fixed = midpoint of £1,630-5,595); DESNZ GHG conversion factors 2025; Boverket density" },
  { measure: "Loft insulation", fixed_gbp: COST.loft.fixed, gbp_per_m2: COST.loft.perM2, carbon_basis: `insulation ${DESNZ_INSULATION_KGCO2E_PER_KG.toFixed(2)} kg CO₂e/kg (DESNZ GHG conversion factors 2025, Material use, primary production (OGL v3.0); generic material average); mass at glass wool 18.7 kg/m³ (Boverket)`, source: "DESNZ PRS IA Table 20; DESNZ GHG conversion factors 2025; Boverket density" },
  { measure: "Double glazing", fixed_gbp: COST.glazing.fixed, gbp_per_m2: COST.glazing.perM2, carbon_basis: `${WINDOW_KGCO2E_PER_M2.toFixed(0)} kg CO₂e/m² (Boverket klimatdatabas PVC triple-glazed window proxy; DESNZ has no window product)`, source: "DESNZ PRS IA Table 20; Boverket" },
  { measure: "Triple glazing", fixed_gbp: COST.glazing.fixed * TRIPLE_GLAZING_UPLIFT, gbp_per_m2: COST.glazing.perM2 * TRIPLE_GLAZING_UPLIFT, carbon_basis: `${WINDOW_KGCO2E_PER_M2.toFixed(0)} kg CO₂e/m² (Boverket klimatdatabas PVC triple-glazed window)`, source: "DESNZ ×1.15 (CAR 2017, low confidence); Boverket" },
  { measure: "External door", fixed_gbp: null, gbp_per_m2: null, carbon_basis: "—", source: "no openly licensed UK source - not costed" },
];

export function fmtGBP(n: number): string {
  return "£" + n.toLocaleString("en-GB", { maximumFractionDigits: 0 });
}

export const UK_COST_CARBON_SOURCE_NOTE =
  "UK package cost: DESNZ private-rented-homes impact assessment (2026), Table 20 fixed + per-m² install costs, "
  + "2020 prices ex VAT (OGL v3.0); doors not costed. Embodied carbon: insulation uses DESNZ GHG conversion factors 2025, Material use, primary production (OGL v3.0) "
  + "- a generic material-average insulation factor (1,861.8 kg CO₂e/t; extraction, processing, manufacture and transport "
  + "to point of sale), with mass sized to reach each tier's U-value using Boverket product densities; windows use "
  + "Boverket klimatdatabas v02.07 A1-A3 typical values (Swedish PVC window - DESNZ has no window product).";
