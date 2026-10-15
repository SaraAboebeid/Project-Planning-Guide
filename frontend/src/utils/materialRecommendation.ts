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

const numOf = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);

/** Boverket A4 + A5 per kg for one resource, as in a Swedish climate declaration:
 *  A4 transport to site; A5 = installation (A5.1) plus the material wasted on
 *  site, whose production and transport also had to happen:
 *  (waste factor − 1) × (A1–A3 + A4). Null when the resource lacks the figures. */
export function a4a5PerKg(r: BoverketResource): { a13: number; a4: number; a5: number } | null {
  const a13 = numOf(r["GWP A1-A3 (Typical)"]);
  if (a13 == null) return null;
  const a4 = numOf(r["GWP A4 (Transport)"]) ?? 0;
  const a51 = numOf(r["GWP A5.1 (Installation)"]) ?? 0;
  const w = Number(r["Waste Factor"]);
  const waste = isFinite(w) && w > 1 ? (w - 1) * (a13 + a4) : 0;
  return { a13, a4, a5: a51 + waste };
}

/* Catalogue assemblies only carry one A1–A3 figure, so their A4 + A5 is
   estimated from their MAIN material: the Boverket resource for that material
   gives the A4+A5 share relative to its A1–A3, applied to the assembly. Ordered
   most-specific first. */
const MAIN_MATERIAL: [RegExp, RegExp][] = [
  [/clt|cross-laminated/i, /cross-laminated timber/i],
  [/glulam/i, /glulam/i],
  [/blow|loose/i, /blowing wool/i],
  [/wood ?fib/i, /wood ?fib/i],
  [/mineral wool|glass ?wool|stone wool|rock wool|insulation|ins\.|\bm\d{2,3}\b/i, /glasswool, batts/i],
  [/\beps\b|polystyrene|cellplast/i, /expanded polystyrene|\beps\b/i],
  [/gypsum|plaster/i, /gypsum/i],
  [/fib(er|re) ?cement/i, /fib(er|re) cement/i],
  [/concrete/i, /concrete|wall panels/i],
  [/brick|clinker/i, /brick/i],
  [/bitumen|felt|membrane/i, /bitumen/i],
  [/steel|sheet|metal|trp/i, /steel/i],
  [/window|glaz/i, /window/i],
  [/timber|wood|log|batten|plank|stud|panel/i, /sawn timber/i],
];

function upliftOf(r: BoverketResource): number | null {
  const m = a4a5PerKg(r);
  return m && m.a13 > 0 ? (m.a4 + m.a5) / m.a13 : null;
}

/** A4+A5 as a share of A1–A3 for a catalogue assembly, from its main material;
 *  the median over the loaded Boverket rows when nothing matches; 0 (A1–A3 only)
 *  when no Boverket data is loaded. */
export function a4a5Share(label: string, rows: BoverketResource[]): { share: number; basis: string } {
  for (const [kw, bov] of MAIN_MATERIAL) {
    if (!kw.test(label)) continue;
    const row = rows.find((r) => bov.test(r.Name) && upliftOf(r) != null);
    if (row) return { share: upliftOf(row)!, basis: `A4/A5 from Boverket "${row.Name}"` };
  }
  const all = rows.map(upliftOf).filter((v): v is number => v != null).sort((a, b) => a - b);
  if (all.length) return { share: all[Math.floor(all.length / 2)]!, basis: "A4/A5 from the median Boverket material (no main material matched)" };
  return { share: 0, basis: "A1–A3 only (Boverket data not loaded)" };
}

export type CarbonConfidence = "legacy" | "catalogue" | "boverket-estimate" | "fallback";

/** UK/BE material-catalogue options carry their own carbon (materialCatalogue.ts). */
const ownCarbon = (item: WikellsItem): number | null => {
  const v = (item as { carbonPerUnit?: number | null }).carbonPerUnit;
  return typeof v === "number" ? v : null;
};
/** An option the catalogue has no price for: never the "cheapest", never free. */
const unpriced = (item: WikellsItem) => !!(item as { costMissing?: boolean }).costMissing;

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
): { value: number; confidence: CarbonConfidence; a1a3?: number; a4a5?: number; basis?: string } {
  // UK/BE catalogue options carry their own A1–A3 figure and stay A1–A3.
  const own = ownCarbon(item);
  if (own != null) return { value: own, confidence: "catalogue" };

  // Sweden (Wikells): A1–A3 for the assembly, then A4 + A5 (transport to site,
  // installation incl. waste) from its main material - see a4a5Share. `value`
  // is the A1–A5 total every caller (picker, packages, optimiser) uses.
  const withA4A5 = (a1a3: number, label: string, confidence: CarbonConfidence) => {
    const { share, basis } = a4a5Share(label, boverketResources);
    const a4a5 = a1a3 * share;
    return { value: Math.round((a1a3 + a4a5) * 10) / 10, confidence,
             a1a3: Math.round(a1a3 * 10) / 10, a4a5: Math.round(a4a5 * 10) / 10, basis };
  };
  const legacy = WIKELLS_CARBON_MAP[item.code];
  if (legacy) return withA4A5(legacy.kgCO2ePerM2, `${legacy.primaryMaterial} ${item.description}`, "legacy");

  const desc = item.description.toLowerCase();
  const activeKws = MATERIAL_KEYWORDS.filter((k) => desc.includes(k));
  const matches = boverketResources.filter((r) => activeKws.some((k) => r.Name.toLowerCase().includes(k)));
  const pool = matches.length ? matches : boverketResources;
  // A1–A3 only here (it used to take Boverket's A1–A3+A4+A5 sum, which would now
  // count A4/A5 twice); A4/A5 is added by withA4A5 like every other path.
  const values = pool.map((r) => numOf(r["GWP A1-A3 (Typical)"])).filter((v): v is number => v != null);
  if (values.length) {
    values.sort((a, b) => a - b);
    const gwpPerKg = values[Math.floor(values.length / 2)]!;
    const assumedArealDensityKgM2 = 25; // rough order-of-magnitude for a typical envelope layer
    return withA4A5(gwpPerKg * assumedArealDensityKgM2, item.description, "boverket-estimate");
  }
  return { value: 30, confidence: "fallback" };
}

export type KpiKey = "Environmental" | "Economic" | "Energy Demand";

/** The "Energy Demand" KPI was called "Performance / Technical" until 2026-08.
 *  Projects saved before the rename still carry the old string, so read through
 *  this rather than comparing the new name directly. */
const LEGACY_ENERGY_DEMAND = "Performance / Technical";
const wantsEnergyDemand = (selected: string[]) =>
  selected.includes("Energy Demand") || selected.includes(LEGACY_ENERGY_DEMAND);
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

  const priced = pool.filter((i) => !unpriced(i));
  if (selectedKpis.includes("Economic") && priced.length) {
    const cheapest = priced.reduce((a, b) => (a.costSEK <= b.costSEK ? a : b));
    tag(cheapest.code, "Economic");
  }
  if (selectedKpis.includes("Environmental")) {
    const scored = pool.map((i) => ({ code: i.code, v: estimateCarbon(i, boverketResources).value }));
    const lowest = scored.reduce((a, b) => (a.v <= b.v ? a : b));
    tag(lowest.code, "Environmental");
  }
  if (wantsEnergyDemand(selectedKpis)) {
    const withU = pool.filter((i) => i.uValue != null);
    if (withU.length) {
      const best = withU.reduce((a, b) => (a.uValue! <= b.uValue! ? a : b));
      tag(best.code, "Energy Demand");
    }
  }

  // When two or more KPIs are in play, single-axis winners tend to be extreme
  // (the best-U wall is also the priciest/highest-carbon). Also surface the
  // assembly that best BALANCES the selected KPIs: min-max normalise each
  // selected metric across the pool (cost, carbon, U — all "lower is better"),
  // give them equal weight, and pick the lowest combined score.
  const activeKpis = ([
    ...(selectedKpis.includes("Economic") ? ["Economic"] as KpiKey[] : []),
    ...(selectedKpis.includes("Environmental") ? ["Environmental"] as KpiKey[] : []),
    ...(wantsEnergyDemand(selectedKpis) ? ["Energy Demand"] as KpiKey[] : []),
  ]);
  if (activeKpis.length >= 2) {
    const wantPerf = activeKpis.includes("Energy Demand");
    // Performance needs a U-value; require one only when that KPI is active.
    const cand = pool.filter((i) => (!wantPerf || i.uValue != null)
      && (!activeKpis.includes("Economic") || !unpriced(i)));
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
