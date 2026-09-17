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
 * EMBODIED CARBON - A1-A3 "typical" values, Boverket klimatdatabas
 *   v02.07.000 (21 Jan 2026), licensed for use in own products/services with
 *   Boverket named as source. These are SWEDISH average products: no UK
 *   per-measure dataset has a licence that allows use in a tool (ICE forbids
 *   it; ÖKOBAUDAT only allows unmodified redistribution). Insulation mass is
 *   derived from the thickness needed to reach the tier U-value
 *   (d = λ·(1/U_new − 1/U_old), EN ISO 6946 layer resistance).
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

/** Boverket klimatdatabas - GWP A1-A3 typical, kg CO₂e/kg, and density. */
const MATERIAL = {
  glass_wool:  { gwpPerKg: 0.89, densityKgM3: 18.7, lambda: 0.037 },  // glass wool batts
  stone_wool:  { gwpPerKg: 1.29, densityKgM3: 80,   lambda: 0.036 },  // stone wool facade board
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
      note: cavity ? "carbon: blown glass wool at batt density" : "carbon: insulation board only (no render/fixings)",
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

/** Unit rates as published, for the Data Explorer source card. */
export const UK_COST_CARBON_SAMPLE = [
  { measure: "Cavity wall insulation", fixed_gbp: COST.cavity_fill.fixed, gbp_per_m2: COST.cavity_fill.perM2, carbon_basis: "glass wool 0.89 kg CO₂e/kg, 18.7 kg/m³", source: "DESNZ PRS IA Table 20; Boverket" },
  { measure: "External wall insulation", fixed_gbp: COST.external_wall.fixed, gbp_per_m2: COST.external_wall.perM2, carbon_basis: "stone wool 1.29 kg CO₂e/kg, 80 kg/m³", source: "DESNZ PRS IA Table 20 (fixed = midpoint of £1,630-5,595); Boverket" },
  { measure: "Loft insulation", fixed_gbp: COST.loft.fixed, gbp_per_m2: COST.loft.perM2, carbon_basis: "glass wool 0.89 kg CO₂e/kg, 18.7 kg/m³", source: "DESNZ PRS IA Table 20; Boverket" },
  { measure: "Double glazing", fixed_gbp: COST.glazing.fixed, gbp_per_m2: COST.glazing.perM2, carbon_basis: `${WINDOW_KGCO2E_PER_M2.toFixed(0)} kg CO₂e/m² (PVC triple-glazed proxy)`, source: "DESNZ PRS IA Table 20; Boverket" },
  { measure: "Triple glazing", fixed_gbp: COST.glazing.fixed * TRIPLE_GLAZING_UPLIFT, gbp_per_m2: COST.glazing.perM2 * TRIPLE_GLAZING_UPLIFT, carbon_basis: `${WINDOW_KGCO2E_PER_M2.toFixed(0)} kg CO₂e/m²`, source: "DESNZ ×1.15 (CAR 2017, low confidence); Boverket" },
  { measure: "External door", fixed_gbp: null, gbp_per_m2: null, carbon_basis: "—", source: "no openly licensed UK source - not costed" },
];

export function fmtGBP(n: number): string {
  return "£" + n.toLocaleString("en-GB", { maximumFractionDigits: 0 });
}

export const UK_COST_CARBON_SOURCE_NOTE =
  "UK package cost: DESNZ private-rented-homes impact assessment (2026), Table 20 fixed + per-m² install costs, "
  + "2020 prices ex VAT (OGL v3.0); doors not costed. Embodied carbon: Boverket klimatdatabas v02.07 A1-A3 typical values "
  + "(Swedish products - no licence-compatible UK dataset), insulation sized to reach each tier's U-value.";
