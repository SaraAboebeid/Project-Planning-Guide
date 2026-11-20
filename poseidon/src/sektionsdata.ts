/* Wikells Sektionsdata, the full component catalogue (new-build prices), built
   from the user's workbook by tools/poseidon/build_wikells_sektionsdata.py into
   src/data/wikells_sektionsdata.json. Bundled with the app: the Wizard's
   measures (catalogue.ts) are derived from it, so it must be there synchronously.

   Sektionsdata prices complete NEW parts. Chapters in `renovation_chapters` and
   the `renovation` groups are what applies when renovating existing homes; each
   group carries a note on what its prices leave out (removal of the old part, …). */
import raw from "./data/wikells_sektionsdata.json";

export interface SdItem {
  id: string;
  desc: string;
  cost: number | null;       // section cost incl. overheads, SEK per unit
  unit: string;              // "SEK/m²", "SEK/pcs", …
  tech: string | null;       // technical values, " | "-separated
  u: number | null;          // first U-value in tech (W/m²K)
  material: number | null; hours: number | null; ue: number | null; other: number | null; overhead: number | null;
  weight: number | null;     // kg per unit
  co2: number | null;        // kg CO2e per unit, A1–A3 (null = not given, e.g. subcontract-only items)
}
export interface SdGroup { name: string; items: SdItem[] }
export interface SdChapter { no: number; name: string; groups: SdGroup[] }
export interface SdRenovationPart { part: string; note: string; ids: string[] }
export interface Sektionsdata {
  source: string;
  readme: string[];
  settings: Record<string, number>;
  chapters: SdChapter[];
  renovation: SdRenovationPart[];
  renovation_chapters?: number[];   // whole chapters shown under Renovation planning, not New buildings
}

export const SEKTIONSDATA = raw as unknown as Sektionsdata;

/** id → item, plus the chapter / sub-chapter it sits in. */
export function indexItems(d: Sektionsdata) {
  const m = new Map<string, { item: SdItem; chapter: SdChapter; group: SdGroup }>();
  for (const chapter of d.chapters) for (const group of chapter.groups) for (const item of group.items) m.set(item.id, { item, chapter, group });
  return m;
}
