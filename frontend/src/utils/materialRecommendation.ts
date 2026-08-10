import { WIKELLS_CHAPTERS, type WikellsItem } from "../config/wikellsData";
import { WIKELLS_CARBON_MAP } from "../config/wikellsCarbonMapping";
import type { BoverketResource } from "../types";
import type { AreaLineItem } from "../config/componentAreaLineItems";

/** Wikells items for one line item, filtered to whichever pricing unit
 * actually matches its quantityKind (area items use "SEK/m²" assemblies,
 * count items use "SEK/st" - windows/doors/balconies are ALL priced per
 * unit in the real catalogue, there is no per-m² window/door pricing). */
export function itemsForLineItem(item: AreaLineItem): WikellsItem[] {
  const chapter = WIKELLS_CHAPTERS.find((c) => c.id === item.wikellsChapterId);
  if (!chapter) return [];
  const wantUnit = item.quantityKind === "area" ? "SEK/m²" : "SEK/st";
  const all = chapter.subGroups.flatMap((g) => g.items);
  // "Doors" and "Windows" share ch16 - narrow further by keyword so each
  // line item only shows its own materials, not the other's.
  const keywordFiltered =
    item.key === "Doors"
      ? all.filter((i) => i.description.toLowerCase().includes("door"))
      : item.key === "Windows"
        ? all.filter((i) => !i.description.toLowerCase().includes("door") || i.description.toLowerCase().includes("window door"))
        : all;
  return keywordFiltered.filter((i) => i.unit === wantUnit);
}

const MATERIAL_KEYWORDS = [
  "timber", "wood", "glulam", "clt", "cross-laminated", "lvl",
  "concrete", "brick", "clay block", "aac", "sand lime", "steel",
  "mineral wool", "eps", "xps", "glass wool", "rock wool", "wood fibre",
  "window", "glaz", "glass", "bitumen", "membrane",
];

function gwpMinOf(r: BoverketResource): number | null {
  const v = r["GWP Min (Typ+A4+A5)"];
  return typeof v === "number" ? v : null;
}

export type CarbonConfidence = "legacy" | "boverket-estimate" | "fallback";

/**
 * Embodied-carbon estimate per the item's own unit (kg CO2e per m² for area
 * items, kg CO2e per unit for count items). Priority: the curated
 * WIKELLS_CARBON_MAP first - those ~50 figures were themselves derived from
 * Boverket data with a proper per-assembly unit conversion already baked in,
 * which a generic keyword-matched estimate below can't reliably redo. Only
 * when a code has no curated figure does this fall back to a rough
 * Boverket-keyword-match estimate (Boverket's own GWP values are per the
 * resource's inventory unit - kg, m³, etc - not per building assembly, so
 * this multiplies by an assumed typical areal density rather than a real
 * per-material thickness/density lookup - genuinely approximate, flagged via
 * `confidence`). Last resort: a flat 30 kg CO2e guess.
 */
export function estimateCarbon(
  item: WikellsItem,
  boverketResources: BoverketResource[]
): { value: number; confidence: CarbonConfidence } {
  const legacy = WIKELLS_CARBON_MAP[item.code];
  if (legacy) return { value: legacy.kgCO2ePerM2, confidence: "legacy" };

  const desc = item.description.toLowerCase();
  const activeKws = MATERIAL_KEYWORDS.filter((k) => desc.includes(k));
  const matches = boverketResources.filter((r) => activeKws.some((k) => r.Name.toLowerCase().includes(k)));
  const pool = matches.length ? matches : boverketResources;
  const values = pool.map(gwpMinOf).filter((v): v is number => v != null);
  if (values.length) {
    values.sort((a, b) => a - b);
    const gwpPerKg = values[Math.floor(values.length / 2)]!;
    const assumedArealDensityKgM2 = 25; // rough order-of-magnitude for a typical envelope layer
    return { value: Math.round(gwpPerKg * assumedArealDensityKgM2 * 10) / 10, confidence: "boverket-estimate" };
  }
  return { value: 30, confidence: "fallback" };
}

export type KpiKey = "Environmental" | "Economic" | "Performance / Technical";
/** Recommendation tags = the three KPIs, plus a synthesised "Balanced" pick that
 *  trades the selected KPIs off against each other (only when ≥2 are selected). */
export type RecTag = KpiKey | "Balanced";

/** One "Recommended for: X" tag per selected KPI, per item code. A material
 * can be recommended for more than one KPI, and — when two or more KPIs are
 * selected — for best overall Balance across them. */
export function recommendationsForLineItem(
  items: WikellsItem[],
  boverketResources: BoverketResource[],
  selectedKpis: string[],
  /** The building's current U for this component (from baselineUForKey). Only
   * materials that IMPROVE on it are eligible to be recommended — otherwise the
   * "cheapest" pick would happily surface an uninsulated assembly (e.g. timber
   * stud 95 M0, U 1.75) that RAISES energy. Null (doors/balcony, no U notion)
   * falls back to considering every item. */
  baselineU?: number | null
): Record<string, RecTag[]> {
  const out: Record<string, RecTag[]> = {};
  const tag = (code: string, kpi: RecTag) => { (out[code] ??= []).push(kpi); };

  if (!items.length) return out;

  // Guiding principle: NEVER recommend an assembly that would make the building
  // worse. We only ever pick from genuine improvers — those whose U beats the
  // building's current U for this component. If nothing beats the baseline we
  // recommend NOTHING (return empty) rather than surfacing a worse assembly.
  // (When baselineU is null — doors/balcony, no U notion — every item is eligible.)
  const pool = baselineU != null
    ? items.filter((i) => i.uValue != null && i.uValue <= baselineU)
    : items;
  if (!pool.length) return out;

  if (selectedKpis.includes("Economic")) {
    const cheapest = pool.reduce((a, b) => (a.costSEK <= b.costSEK ? a : b));
    tag(cheapest.code, "Economic");
  }
  if (selectedKpis.includes("Environmental")) {
    const scored = pool.map((i) => ({ code: i.code, v: estimateCarbon(i, boverketResources).value }));
    const lowest = scored.reduce((a, b) => (a.v <= b.v ? a : b));
    tag(lowest.code, "Environmental");
  }
  if (selectedKpis.includes("Performance / Technical")) {
    const withU = pool.filter((i) => i.uValue != null);
    if (withU.length) {
      const best = withU.reduce((a, b) => (a.uValue! <= b.uValue! ? a : b));
      tag(best.code, "Performance / Technical");
    }
  }

  // When two or more KPIs are in play, single-axis winners tend to be extreme
  // (the best-U wall is also the priciest/highest-carbon). Also surface the
  // assembly that best BALANCES the selected KPIs: min-max normalise each
  // selected metric across the pool (cost, carbon, U — all "lower is better"),
  // give them equal weight, and pick the lowest combined score.
  const activeKpis = (["Economic", "Environmental", "Performance / Technical"] as KpiKey[])
    .filter((k) => selectedKpis.includes(k));
  if (activeKpis.length >= 2) {
    const wantPerf = activeKpis.includes("Performance / Technical");
    // Performance needs a U-value; require one only when that KPI is active.
    const cand = pool.filter((i) => !wantPerf || i.uValue != null);
    if (cand.length) {
      const metrics = cand.map((i) => ({
        code: i.code,
        cost: i.costSEK,
        carbon: estimateCarbon(i, boverketResources).value,
        u: i.uValue ?? 0,
      }));
      const costs = metrics.map((m) => m.cost);
      const carbons = metrics.map((m) => m.carbon);
      const us = metrics.map((m) => m.u);
      const nrm = (v: number, arr: number[]) => {
        const lo = Math.min(...arr), hi = Math.max(...arr);
        return hi > lo ? (v - lo) / (hi - lo) : 0;
      };
      let bestCode: string | null = null;
      let bestScore = Infinity;
      for (const m of metrics) {
        const parts: number[] = [];
        if (activeKpis.includes("Economic")) parts.push(nrm(m.cost, costs));
        if (activeKpis.includes("Environmental")) parts.push(nrm(m.carbon, carbons));
        if (wantPerf) parts.push(nrm(m.u, us));
        const score = parts.reduce((a, b) => a + b, 0) / (parts.length || 1);
        if (score < bestScore) { bestScore = score; bestCode = m.code; }
      }
      if (bestCode) tag(bestCode, "Balanced");
    }
  }
  return out;
}
