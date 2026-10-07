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
const MATERIALS: Record<CatalogueCountry, CatalogueMaterial[]> = { gb: UK_MATERIALS, be: BE_MATERIALS };

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

/** The catalogue's price/quality caveat, for the picker header. */
export function catalogueNote(country: CatalogueCountry): string {
  const name = country === "gb" ? "UK" : "Belgian";
  return `${name} renovation materials catalogue (Oct 2026): material prices incl. VAT, excluding labour; embodied carbon A1–A3. U-values = the building's current U with the insulation added (EN ISO 6946).`;
}
