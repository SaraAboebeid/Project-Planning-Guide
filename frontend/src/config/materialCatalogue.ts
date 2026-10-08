/* UK and Belgian renovation materials, turned into Step 4 options.
 *
 * Sweden's Step 4 picks complete assemblies from Wikells, each with its own
 * U-value and installed price. The UK and Belgian catalogues
 * (materialCatalogue{UK,BE}.ts, generated from the 2026-10 workbooks) list
 * MATERIALS instead - a PIR board, a window, a heat pump - with a price and an
 * embodied-carbon value per unit. This module turns each material into concrete
 * options for one component of one building: "150 mm graphite EPS, external,
 * + thin-coat render", with
 *   - U-value: the building's current U with the insulation's resistance added
 *     (EN ISO 6946 layers in series: U = 1 / (1/U_now + d/λ)),
 *   - cost and carbon per m²: the material at that thickness plus its finish.
 * The options use the Wikells item shape, so Sweden's picker, recommendations,
 * saved build-ups, packages and optimiser all work on them unchanged.
 *
 * Prices are MATERIAL ONLY (no labour), incl. VAT - unlike Wikells' installed
 * prices. Items the workbook has no price for are kept but flagged, so they can
 * be chosen for energy and carbon while cost stays honest ("price n/a"). */
import type { WikellsItem } from "./wikellsData";
import { LAYER_MATERIALS, PRESETS, type AssemblyLayer, type ComponentKind, type LayerCategory, type LayerMaterial } from "./assemblyLayers";
import { MATERIALS as UK_MATERIALS, CURRENCY as UK_CURRENCY } from "./materialCatalogueUK";
import { MATERIALS as BE_MATERIALS, CURRENCY as BE_CURRENCY } from "./materialCatalogueBE";

export interface CatalogueMaterial {
  id: string;
  category: string;
  item: string;
  spec: string;
  unit: string;
  gwp: number | null;            // kgCO2e per unit, A1-A3
  carbonQuality: string | null;
  carbonOrigin: string | null;
  biogenic: string | null;
  priceLow: number | null;
  priceHigh: number | null;
  price: number | null;          // incl. VAT, material only
  priceQuality: string | null;
  carbonSource: string | null;
  priceSource: string | null;
  thicknessMm: number | null;    // insulation: the thickness price and carbon refer to
  lambda: number | null;         // insulation: W/mK
}

/** A material-based option in the Wikells item shape, plus where it came from. */
export interface CatalogueAssembly extends WikellsItem {
  /** kgCO2e per m² (area) or per unit (count); null when the workbook has none. */
  carbonPerUnit: number | null;
  /** No price in the workbook - shown as "price n/a", never as free. */
  costMissing?: boolean;
  /** Material ids this option is made of, for tracing back to the workbook. */
  materialIds: string[];
  /** One line on where the numbers come from (shown on hover). */
  sourceNote: string;
}

export type CatalogueCountry = "gb" | "be";

export const CATALOGUE_CURRENCY: Record<CatalogueCountry, string> = { gb: UK_CURRENCY, be: BE_CURRENCY };
// Only materials with BOTH a price and an embodied-carbon value are offered:
// an option missing either can't be compared fairly on cost or carbon. The
// workbooks themselves are untouched — fill in a value there and re-run
// tools/catalog to bring an item back.
const isComplete = (m: CatalogueMaterial) => m.price != null && m.gwp != null;
const MATERIALS: Record<CatalogueCountry, CatalogueMaterial[]> = {
  gb: UK_MATERIALS.filter(isComplete),
  be: BE_MATERIALS.filter(isComplete),
};

/** The materials Step 4 offers for a country (price AND carbon known). */
export function catalogueMaterials(country: CatalogueCountry): CatalogueMaterial[] {
  return MATERIALS[country];
}
/** How many workbook rows were left out for missing price or carbon. */
export function catalogueExcludedCount(country: CatalogueCountry): number {
  return (country === "gb" ? UK_MATERIALS : BE_MATERIALS).length - MATERIALS[country].length;
}

/** Typical whole-window U-values (W/m²K) for each window type - the workbooks
 *  carry no U. Values follow common product ranges (UK Part L replacement limit
 *  1.4 for double glazing; triple ~0.8-0.9). */
const WINDOW_U: Record<string, number> = {
  WD01: 1.4,   // uPVC double
  WD02: 0.9,   // uPVC triple
  WD03: 1.4,   // timber double
  WD04: 0.8,   // timber triple
  WD05: 1.6,   // aluminium double
  WD06: 0.8,   // alu-clad timber triple
  WD07: 1.2,   // new double IGU in an existing frame
};

/** Same typical window size Step 4 uses to count windows (componentAreas.ts). */
const WINDOW_AREA_M2 = 1.4;

/* Wall insulation: which side it goes on decides its finish. External boards are
   rendered (ETICS); internal ones are lined with plasterboard; a cavity fill
   needs neither. */
const EXTERNAL_WALL = ["WI02", "WI03", "WI04", "WI08", "WI11"];
const CAVITY_WALL = ["WI12"];
const FINISH_EXTERNAL = "WC06";   // thin-coat render (ETICS finish)
const FINISH_INTERNAL = "WC08";   // gypsum plasterboard

const THICKNESSES: Record<string, number[]> = {
  Walls: [100, 150, 200],
  Roof: [150, 250, 350],
  Floor: [80, 120, 160],
};
/** Loft rolls are laid thicker than boards; a cavity fill is set by the cavity. */
const OWN_THICKNESSES: Record<string, number[]> = {
  RI01: [200, 300, 400],
  RI03: [60, 100, 140],
  WI12: [75],
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

function sourceLine(m: CatalogueMaterial): string {
  const p = m.price != null ? `price: ${m.priceSource ?? "?"} (${m.priceQuality ?? "?"})` : "no price in the catalogue";
  const c = m.gwp != null ? `carbon: ${m.carbonSource ?? "?"} (${m.carbonQuality ?? "?"})` : "no carbon value in the catalogue";
  return `${m.id} ${m.item} — ${p}; ${c}`;
}

/** Options for one Step 4 line item of one building. `baselineU` is the
 *  component's current U (from baselineUForKey). */
export function catalogueAssembliesFor(
  country: CatalogueCountry, lineItemKey: string, baselineU: number | null,
): CatalogueAssembly[] {
  const mats = MATERIALS[country];
  const byId = (id: string) => mats.find((m) => m.id === id);
  const cat = lineItemKey === "Walls" ? "Wall insulation" : lineItemKey === "Roof" ? "Roof insulation"
    : lineItemKey === "Floor" ? "Floor insulation" : null;

  // ── Insulation added to an existing wall / roof / floor ────────────────────
  if (cat) {
    const out: CatalogueAssembly[] = [];
    const u0 = baselineU ?? null;
    for (const m of mats.filter((x) => x.category === cat && x.lambda && x.thicknessMm)) {
      const refMm = m.thicknessMm!;
      const placement = lineItemKey !== "Walls" ? null
        : CAVITY_WALL.includes(m.id) ? "cavity fill"
        : EXTERNAL_WALL.includes(m.id) ? "external" : "internal";
      const finish = placement === "external" ? byId(FINISH_EXTERNAL) : placement === "internal" ? byId(FINISH_INTERNAL) : undefined;
      for (const d of OWN_THICKNESSES[m.id] ?? THICKNESSES[lineItemKey]!) {
        // A cavity fill replaces the air gap's own resistance (~0.17 m²K/W).
        const addedR = d / 1000 / m.lambda! - (placement === "cavity fill" ? 0.17 : 0);
        const u = u0 != null ? round2(1 / (1 / u0 + Math.max(0, addedR))) : round2(1 / (0.17 + addedR + 0.5));
        const scale = d / refMm;
        const priced = m.price != null && (!finish || finish.price != null);
        const cost = priced ? round1(m.price! * scale + (finish?.price ?? 0)) : 0;
        const carbon = m.gwp != null ? round1(m.gwp * scale + (finish?.gwp ?? 0)) : null;
        out.push({
          code: `${country}:${m.id}-${d}`,
          description: `${d} mm ${m.item}${placement ? ` — ${placement}` : ""}${finish ? ` + ${finish.item.toLowerCase()}` : ""}`,
          costSEK: cost, unit: "SEK/m²", uValue: u,
          carbonPerUnit: carbon, costMissing: !priced || undefined,
          materialIds: [m.id, ...(finish ? [finish.id] : [])],
          sourceNote: [sourceLine(m), ...(finish ? [sourceLine(finish)] : [])].join(" · "),
        });
      }
    }
    return out;
  }

  // ── Window replacement: whole-window U, priced per window ──────────────────
  if (lineItemKey === "Windows") {
    return mats.filter((m) => WINDOW_U[m.id] != null).map((m) => ({
      code: `${country}:${m.id}`,
      description: `${m.item} (U ≈ ${WINDOW_U[m.id]} typical)`,
      costSEK: m.price != null ? round1(m.price * WINDOW_AREA_M2) : 0,
      unit: "SEK/st", uValue: WINDOW_U[m.id],
      carbonPerUnit: m.gwp != null ? round1(m.gwp * WINDOW_AREA_M2) : null,
      costMissing: m.price == null || undefined,
      materialIds: [m.id],
      sourceNote: `${sourceLine(m)} · U-value: typical for this window type (not in the catalogue) · per window of ${WINDOW_AREA_M2} m²`,
    }));
  }

  if (lineItemKey === "Doors") {
    return mats.filter((m) => m.category.startsWith("Windows") && m.unit === "piece").map((m) => ({
      code: `${country}:${m.id}`,
      description: m.item, costSEK: m.price ?? 0, unit: "SEK/st",
      carbonPerUnit: m.gwp, costMissing: m.price == null || undefined,
      materialIds: [m.id], sourceNote: sourceLine(m),
    }));
  }
  return [];
}

/* ── Build from layers (UK / Belgium) ─────────────────────────────────────────
   Retrofit means adding to a wall that is already there, so the stack starts
   with that wall as ONE layer: "Existing wall (as built)", whose resistance is
   the building's current U turned back into R (R = 1/U - Rsi - Rse). Every
   other layer is a catalogue material, so cost and carbon come straight from
   the workbook: insulation scaled by thickness from the thickness it is priced
   at; finishes, linings and membranes per m² as listed. */

export const EXISTING_LAYER_ID = "existing";

/** Typical λ (W/mK) for the non-insulation catalogue items, which the workbook
 *  lists without one. Thin finishes and membranes barely affect U either way. */
const FINISH_LAMBDA: Record<string, { lambda: number; mm: number; category: LayerCategory }> = {
  WC02: { lambda: 0.13, mm: 20,  category: "cladding" },   // softwood cladding
  WC03: { lambda: 0.35, mm: 10,  category: "cladding" },   // fibre cement
  WC05: { lambda: 1.0,  mm: 20,  category: "cladding" },   // cement render
  WC06: { lambda: 0.7,  mm: 6,   category: "cladding" },   // thin-coat render
  WC07: { lambda: 0.8,  mm: 20,  category: "cladding" },   // lime render
  WC08: { lambda: 0.25, mm: 12.5, category: "board" },     // plasterboard
  WC09: { lambda: 0.6,  mm: 20,  category: "cladding" },   // brick slips
  AM01: { lambda: 0.4,  mm: 1,   category: "board" },      // vapour control layer
  AM02: { lambda: 0.4,  mm: 1,   category: "board" },      // breather membrane
};

const SURF = { wall: 0.13 + 0.04, roof: 0.10 + 0.04, floor: 0.17 + 0.04 } as const;
const KIND_CATEGORY: Record<ComponentKind, string> = { wall: "Wall insulation", roof: "Roof insulation", floor: "Floor insulation" };

const layerId = (m: CatalogueMaterial) => `cat:${m.id}`;

/** The building's current construction as ONE layer: its U turned back into R
 *  (R = 1/U - Rsi - Rse). Used by "add to existing" in every country. */
export function existingLayer(kind: ComponentKind, baselineU: number | null): LayerMaterial {
  const u0 = baselineU && baselineU > 0 ? baselineU : null;
  const existingR = u0 ? Math.max(0.01, 1 / u0 - SURF[kind]) : 0.2;
  return {
    id: EXISTING_LAYER_ID, category: "structure", lambda: null, fixedR: Math.round(existingR * 1000) / 1000,
    label: `Existing ${kind} as built${u0 ? ` (U ${u0.toFixed(2)})` : ""}`,
    defaultMm: 0, minMm: 0, maxMm: 0,
    note: "The building's current construction (EPC / TABULA / archetype U-value) - kept, not replaced.",
  };
}

/** Structural and framing layers for "replace with new". The UK/BE workbooks
 *  list no studs, joists or masonry, so these are thermal only - priced "n/a". */
const STRUCTURAL_IDS = ["timber_stud", "timber_joist", "clt", "concrete", "lwc", "brick", "osb", "plywood", "air_gap"];

/** Layer materials for one component of one building, by mode. "add" starts from
 *  the existing construction; "replace" builds the component new. */
export function layerMaterialsFor(
  country: CatalogueCountry | "se", kind: ComponentKind, baselineU: number | null, mode: "add" | "replace",
): LayerMaterial[] {
  if (country === "se") {
    return mode === "add" ? [existingLayer(kind, baselineU), ...LAYER_MATERIALS] : LAYER_MATERIALS;
  }
  const withExisting = catalogueLayerMaterials(country, kind, baselineU);
  if (mode === "add") return withExisting;
  const catalogueOnly = withExisting.filter((m) => m.id !== EXISTING_LAYER_ID);
  const structural = LAYER_MATERIALS.filter((m) => STRUCTURAL_IDS.includes(m.id));
  return [...catalogueOnly, ...structural];
}

/** Starting stacks by country and mode. */
export function layerPresetsFor(country: CatalogueCountry | "se", kind: ComponentKind, mode: "add" | "replace") {
  const ex = { materialId: EXISTING_LAYER_ID, thicknessMm: 0 };
  if (country !== "se") {
    if (mode === "add") return cataloguePresets(kind);
    if (kind === "wall") return [{ label: "New timber-frame wall + render", layers: [
      { materialId: "cat:WC05", thicknessMm: 20 }, { materialId: "cat:WI08", thicknessMm: 60 },
      { materialId: "timber_stud", thicknessMm: 145 }, { materialId: "cat:WI01", thicknessMm: 145 },
      { materialId: "cat:AM01", thicknessMm: 1 }, { materialId: "cat:WC08", thicknessMm: 12.5 }] }];
    if (kind === "roof") return [{ label: "New joisted roof + loft insulation", layers: [
      { materialId: "timber_joist", thicknessMm: 200 }, { materialId: "cat:RI01", thicknessMm: 300 },
      { materialId: "cat:WC08", thicknessMm: 12.5 }] }];
    return [{ label: "New insulated ground floor", layers: [
      { materialId: "concrete", thicknessMm: 150 }, { materialId: "cat:FI03", thicknessMm: 100 }] }];
  }
  if (mode === "replace") return PRESETS[kind];
  if (kind === "wall") return [
    { label: "External insulation (ETICS) + render", layers: [{ materialId: "render", thicknessMm: 20 }, { materialId: "eps", thicknessMm: 150 }, ex] },
    { label: "Internal insulation + gypsum", layers: [ex, { materialId: "mw_batt", thicknessMm: 70 }, { materialId: "gypsum", thicknessMm: 13 }] },
  ];
  if (kind === "roof") return [{ label: "Extra loft insulation", layers: [ex, { materialId: "mw_blown_gl", thicknessMm: 300 }] }];
  return [{ label: "Insulation under the floor", layers: [ex, { materialId: "xps", thicknessMm: 100 }] }];
}

/** Layer materials for one component of one building, from the country catalogue. */
export function catalogueLayerMaterials(country: CatalogueCountry, kind: ComponentKind, baselineU: number | null): LayerMaterial[] {
  const mats = MATERIALS[country];
  const out: LayerMaterial[] = [existingLayer(kind, baselineU)];
  // Insulation for this component first, then the other insulation boards.
  const ins = mats.filter((m) => m.lambda && m.thicknessMm && m.category.endsWith("insulation"));
  for (const m of [...ins.filter((x) => x.category === KIND_CATEGORY[kind]), ...ins.filter((x) => x.category !== KIND_CATEGORY[kind])]) {
    if (out.some((o) => o.label === m.item)) continue;   // same board listed under walls and floors
    out.push({ id: layerId(m), label: m.item, category: "insulation", lambda: m.lambda!,
      defaultMm: m.thicknessMm!, minMm: 10, maxMm: 400 });
  }
  for (const m of mats.filter((x) => FINISH_LAMBDA[x.id])) {
    const f = FINISH_LAMBDA[m.id]!;
    out.push({ id: layerId(m), label: m.item, category: f.category, lambda: f.lambda,
      defaultMm: f.mm, minMm: 1, maxMm: 60 });
  }
  return out;
}

/** Ready-made starting stacks: typical UK/Belgian retrofit build-ups. */
export function cataloguePresets(kind: ComponentKind): { label: string; layers: AssemblyLayer[] }[] {
  const ex = { materialId: EXISTING_LAYER_ID, thicknessMm: 0 };
  if (kind === "wall") return [
    { label: "External insulation (EWI) + render", layers: [
      { materialId: "cat:WC06", thicknessMm: 6 }, { materialId: "cat:WI04", thicknessMm: 100 }, ex] },
    { label: "Internal insulation + plasterboard", layers: [
      ex, { materialId: "cat:WI06", thicknessMm: 60 }, { materialId: "cat:AM01", thicknessMm: 1 }, { materialId: "cat:WC08", thicknessMm: 12.5 }] },
  ];
  if (kind === "roof") return [
    { label: "Loft insulation", layers: [ex, { materialId: "cat:RI01", thicknessMm: 300 }] },
    { label: "Insulation above rafters (sarking)", layers: [{ materialId: "cat:RI03", thicknessMm: 100 }, ex] },
  ];
  return [{ label: "Insulation under the floor", layers: [ex, { materialId: "cat:FI03", thicknessMm: 100 }] }];
}

export interface LayerCostCarbon {
  costPerM2: number | null;     // null when no layer could be priced
  carbonPerM2: number | null;
  unpriced: string[];           // layers the workbook has no price for
  noCarbon: string[];
}

/** Price one layer (per m² of wall): insulation scaled by thickness, others as listed. */
function layerCostCarbon(m: CatalogueMaterial, mm: number): { cost: number | null; carbon: number | null } {
  const scale = m.thicknessMm && m.lambda ? mm / m.thicknessMm : 1;
  return {
    cost: m.price != null && m.unit === "m2" ? m.price * scale : null,
    carbon: m.gwp != null && m.unit === "m2" ? m.gwp * scale : null,
  };
}

export function catalogueLayerCostCarbon(country: CatalogueCountry, layers: AssemblyLayer[]): LayerCostCarbon {
  const byId = new Map(MATERIALS[country].map((m) => [layerId(m), m]));
  let cost = 0, carbon = 0, anyCost = false, anyCarbon = false;
  const unpriced: string[] = [], noCarbon: string[] = [];
  for (const l of layers) {
    if (l.materialId === EXISTING_LAYER_ID) continue;     // already there - no cost, no new carbon
    const m = byId.get(l.materialId);
    if (!m) {
      // A structural layer for "replace" (studs, joists, masonry): not in the workbook.
      const g = LAYER_MATERIALS.find((x) => x.id === l.materialId);
      if (g && g.category !== "cavity") { unpriced.push(g.label); noCarbon.push(g.label); }
      continue;
    }
    const r = layerCostCarbon(m, l.thicknessMm);
    if (r.cost != null) { cost += r.cost; anyCost = true; } else unpriced.push(m.item);
    if (r.carbon != null) { carbon += r.carbon; anyCarbon = true; } else noCarbon.push(m.item);
  }
  return {
    costPerM2: anyCost ? Math.round(cost * 10) / 10 : null,
    carbonPerM2: anyCarbon ? Math.round(carbon * 10) / 10 : null,
    unpriced, noCarbon,
  };
}

/** Readable name + category of a UK/BE layer id, for package breakdowns and the
 *  Step 5 report (which otherwise only know the Swedish layer list). */
export function catalogueLayerInfo(materialId: string): { label: string; category: LayerCategory } | null {
  if (materialId === EXISTING_LAYER_ID) return { label: "Existing construction (kept)", category: "structure" };
  for (const list of [UK_MATERIALS, BE_MATERIALS]) {
    const m = list.find((x) => layerId(x) === materialId);
    if (m) return { label: m.item, category: m.lambda ? "insulation" : (FINISH_LAMBDA[m.id]?.category ?? "board") };
  }
  return null;
}

/** "£15.3/m² · 13.2 kg" for one layer, for the builder rows. */
export function catalogueLayerNote(country: CatalogueCountry, layer: AssemblyLayer): string | null {
  if (layer.materialId === EXISTING_LAYER_ID) return "kept as is — no cost, no new embodied carbon";
  const m = MATERIALS[country].find((x) => layerId(x) === layer.materialId);
  if (!m) {
    const g = LAYER_MATERIALS.find((x) => x.id === layer.materialId);
    return g && g.category !== "cavity" ? "structural layer — not in the catalogue (price & carbon n/a)" : null;
  }
  const r = layerCostCarbon(m, layer.thicknessMm);
  const sym = country === "gb" ? "£" : "€";
  return `${r.cost != null ? `${sym}${r.cost.toFixed(1)}/m²` : "price n/a"} · ${r.carbon != null ? `${r.carbon.toFixed(1)} kg CO₂e/m²` : "carbon n/a"}`;
}

/** The catalogue's price/quality caveat, for the picker header. */
export function catalogueNote(country: CatalogueCountry): string {
  const name = country === "gb" ? "UK" : "Belgian";
  return `${name} renovation materials catalogue (Oct 2026): material prices incl. VAT, excluding labour; embodied carbon A1–A3. U-values = the building's current U with the insulation added (EN ISO 6946).`;
}
