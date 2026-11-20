/* Renovation measures for the Wizard, taken from the full Wikells Sektionsdata
   catalogue (src/data/wikells_sektionsdata.json, built by
   tools/poseidon/build_wikells_sektionsdata.py from the user's export), with the
   user's own layer on top (catalogueStore.ts): edited values, added rows, and
   items from uploaded / supplier catalogues that name a Wizard part.

   A measure is an item with a U-value and a price that can be expressed per m²
   of the part — what the energy model and the costing can use:
     Walls    chapter 7  External walls (all frames except plant-room walls)
     Windows  chapter 16 Windows (priced per window; the module size gives m²)
     Roof     chapter 11 pitched / low-pitch roofs + chapter 9 loft floors (attic insulation)
     Floor    chapter 4  ground-bearing slabs
     + any uploaded/supplier item whose "Wizard part" column says Walls/Windows/Roof/Floor
   Wikells prices are NEW-BUILD prices for the complete part, so a measure means
   replacing that part; adding insulation usually costs less — the report says so. */
import { SEKTIONSDATA } from "./sektionsdata";
import { BBR_RENOVATION_U } from "./planner/serviceLifeSE";
import { cellValue, getCatalogueState, subscribeCatalogue, type Part } from "./catalogueStore";

export type MeasureComponent = Part;
export const MEASURE_COMPONENTS: MeasureComponent[] = ["Walls", "Windows", "Roof", "Floor"];

/** Which Sektionsdata sub-chapters supply each part ("<chapter>|<sub-chapter>"; "<chapter>|*" = all). */
const SOURCES: Record<MeasureComponent, string[]> = {
  Walls: ["7|*"],
  Windows: ["16|Windows"],
  Roof: ["11|Pitched roof", "11|Low-pitch roof", "9|Loft floor structure"],
  Floor: ["4|*"],
};
const EXCLUDE_GROUPS = new Set(["7|External walls for plant rooms"]);

/** The Wizard part a Sektionsdata sub-chapter supplies, if any. */
export function partOfGroup(chapter: number, group: string): MeasureComponent | null {
  const key = `${chapter}|${group}`;
  if (EXCLUDE_GROUPS.has(key)) return null;
  return MEASURE_COMPONENTS.find((c) => SOURCES[c].some((s) => s === key || s === `${chapter}|*`)) ?? null;
}

export interface Measure {
  code: string;           // item uid: Wikells code, "u-…" (added row) or "<source>:<id>"
  component: MeasureComponent;
  group: string;          // sub-chapter / supplier catalogue name
  label: string;
  u: number;              // W/m²K after the measure
  costPerM2: number;      // SEK per m² of the part
  co2PerM2: number | null; // kg CO2e per m² of the part, A1–A3 (null = not given)
  unit: string;
  meetsBbr: boolean;      // at or below the BBR 9:92 renovation target
  source: string;         // "Wikells Sektionsdata", "Your rows", or the catalogue's name
}

/** Price and carbon per m² of the part. Items priced per piece need a Swedish
 *  module size in the description ("9x13" = 9 × 13 dm = 1.17 m²). */
function perM2(cost: number | null, co2: number | null, unit: string, desc: string): { cost: number; co2: number | null } | null {
  if (cost == null) return null;
  if (/m²|m2/i.test(unit)) return { cost, co2 };
  const mod = /(\d+)\s*x\s*(\d+)/i.exec(desc);
  if (/pcs|st/i.test(unit) && mod) {
    const m2 = (Number(mod[1]) * Number(mod[2])) / 100;
    return m2 > 0 ? { cost: Math.round(cost / m2), co2: co2 == null ? null : co2 / m2 } : null;
  }
  return null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function measure(code: string, component: MeasureComponent, group: string, source: string,
  f: { desc: unknown; unit: unknown; cost: unknown; u: unknown; co2: unknown }): Measure | null {
  const u = num(f.u), desc = String(f.desc ?? ""), unit = String(f.unit ?? "");
  const p = perM2(num(f.cost), num(f.co2), unit, desc);
  if (u == null || !(u > 0) || p == null || !(p.cost > 0)) return null;
  return {
    code, component, group, label: desc, u, costPerM2: p.cost, co2PerM2: p.co2, source,
    unit: /m²|m2/i.test(unit) ? unit : `${unit} → SEK/m²`,
    meetsBbr: u <= (BBR_RENOVATION_U[component] ?? 0),
  };
}

function build(): Measure[] {
  const out: Measure[] = [];
  const v = (uid: string, field: string, base: unknown) => cellValue(uid, field, base as never);
  for (const ch of SEKTIONSDATA.chapters) for (const g of ch.groups) {
    const part = partOfGroup(ch.no, g.name);
    if (!part) continue;
    for (const i of g.items) {
      const m = measure(i.id, part, g.name, "Wikells Sektionsdata", {
        desc: v(i.id, "desc", i.desc), unit: v(i.id, "unit", i.unit), cost: v(i.id, "cost", i.cost), u: v(i.id, "u", i.u), co2: v(i.id, "co2", i.co2),
      });
      if (m) out.push(m);
    }
  }
  const st = getCatalogueState();
  for (const r of st.edits.added) {
    const part = partOfGroup(r.chapter, r.group);
    if (!part) continue;
    const m = measure(r.uid, part, r.group, "Your rows", {
      desc: v(r.uid, "desc", r.desc), unit: v(r.uid, "unit", r.unit), cost: v(r.uid, "cost", r.cost), u: v(r.uid, "u", r.u), co2: v(r.uid, "co2", r.co2),
    });
    if (m) { m.label = `${r.id} ${m.label}`; out.push(m); }
  }
  for (const s of st.sources) for (const i of s.items) {
    if (!i.part) continue;
    const uid = `${s.id}:${i.id}`;
    const m = measure(uid, i.part, s.name, s.name, {
      desc: v(uid, "desc", i.desc), unit: v(uid, "unit", i.unit), cost: v(uid, "cost", i.cost), u: v(uid, "u", i.u), co2: v(uid, "co2", i.co2),
    });
    if (m) { m.label = `${s.name}: ${m.label}`; out.push(m); }
  }
  return out;
}

// Live bindings: importers always see the current list.
export let CATALOGUE: Measure[] = build();
export let MEASURE_BY_CODE = new Map(CATALOGUE.map((m) => [m.code, m]));
subscribeCatalogue(() => {
  CATALOGUE = build();
  MEASURE_BY_CODE = new Map(CATALOGUE.map((m) => [m.code, m]));
});

/** The suggestion for a part: the cheapest catalogue item that meets the BBR
 *  renovation target; if none does, the one with the lowest U-value. */
export function recommendedMeasure(component: MeasureComponent): Measure | null {
  const opts = CATALOGUE.filter((m) => m.component === component);
  if (!opts.length) return null;
  const ok = opts.filter((m) => m.meetsBbr).sort((a, b) => a.costPerM2 - b.costPerM2);
  return ok[0] ?? [...opts].sort((a, b) => a.u - b.u)[0];
}

/** Model field each part's new U-value goes into (the table's EPSM RC inputs). */
export const U_FIELD: Record<MeasureComponent, "u_wall" | "u_roof" | "u_window" | "u_floor"> = {
  Walls: "u_wall", Roof: "u_roof", Windows: "u_window", Floor: "u_floor",
};
