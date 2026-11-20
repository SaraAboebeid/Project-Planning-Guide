/* ─── Technical service life of building components — Swedish source ─────────
   Used by the Step 4 recommendations to judge whether a component is likely due
   for replacement, from its age (construction year, or the last renovation the
   user recorded in Step 2).

   Source: IVL Svenska Miljöinstitutet, "Anvisningar för LCA-beräkning av
   byggprojekt", version 2024-06, appendix S5 (Tabell 10 B2 maintenance and
   Tabell 11 B4 replacement intervals, p. 85–87). It is the table Swedish LCA
   guidance points to (Boverket climate declaration work, NollCO2), written for a
   Swedish context, and it replaces the German BBSR table for this purpose.

   IVL states intervals within a 50-year calculation period. "n/a" there means
   "not replaced within 50 years" — NOT a measured lifetime — so those rows are
   `years: null` here and are shown as "more than 50 years". Insulation is not
   listed by IVL at all; it is treated the same way and says so. */

export const IVL_SOURCE = {
  id: "ivl2024",
  label: "IVL — Anvisningar för LCA-beräkning av byggprojekt, v. 2024-06, appendix S5 (Tabell 10–11)",
  url: "https://www.ivl.se/download/18.5c5c41c51900fcf63db278b3/1719484483034/Anvisningar%20f%C3%B6r%20LCA-ber%C3%A4kningar%20av%20byggprojekt%20version%202024-06%20-%20240627.pdf",
} as const;

export const BBR_SOURCE = {
  id: "bbr31",
  label: "Boverket BBR 31 (BFS 2024:14), avsnitt 9:92, Tabell 9:92",
  url: "https://rinfo.boverket.se/BFS2011-6/pdf/BFS2024-14.pdf",
} as const;

export interface IvlRow {
  part: string;         // IVL "Byggdel/byggkomponent"
  material: string;     // IVL "Byggmaterial"
  /** Replacement interval (B4), years. null = n/a, not replaced within 50 years. */
  replaceYears: number | null;
  /** Maintenance interval (B2) and its action, where IVL gives one. */
  maintainYears?: number | null;
  maintainAction?: string;
}

/** IVL rows for the components Step 4 handles, verbatim from Tabell 10–11. */
export const IVL_ROWS: Record<string, IvlRow[]> = {
  Roof: [
    { part: "Roof covering", material: "Felt (papptak)", replaceYears: 30, maintainYears: 15, maintainAction: "asphalt coating, small areas" },
    { part: "Roof covering", material: "Sheet metal", replaceYears: 40, maintainYears: null, maintainAction: "repainting" },
    { part: "Roof covering", material: "Concrete tiles", replaceYears: null, maintainYears: 25, maintainAction: "minor maintenance" },
    { part: "Roof covering", material: "Clay tiles", replaceYears: null, maintainYears: 25, maintainAction: "minor maintenance" },
    { part: "Roof covering", material: "Wood", replaceYears: 25 },
    { part: "Roof covering", material: "Asphalt shingle", replaceYears: 30 },
    { part: "Roof covering", material: "Sedum", replaceYears: 20 },
  ],
  Walls: [
    { part: "Façade cladding", material: "Wood", replaceYears: null, maintainYears: 10, maintainAction: "repainting" },
    { part: "Façade cladding", material: "Sheet metal", replaceYears: null, maintainYears: 15, maintainAction: "repainting" },
    { part: "Façade cladding", material: "Render", replaceYears: null, maintainYears: 25, maintainAction: "minor maintenance" },
    { part: "Façade cladding", material: "Brick", replaceYears: null, maintainYears: 30, maintainAction: "repointing" },
    { part: "Façade cladding", material: "Concrete", replaceYears: null, maintainYears: null, maintainAction: "maintenance" },
  ],
  Windows: [
    { part: "Window", material: "Wood", replaceYears: 40, maintainYears: 15, maintainAction: "repainting" },
    { part: "Window", material: "Wood/aluminium", replaceYears: null, maintainYears: 15, maintainAction: "repainting" },
    { part: "Window", material: "Aluminium", replaceYears: null },
  ],
  Doors: [
    { part: "Door / entrance", material: "Wood", replaceYears: 40, maintainYears: 10, maintainAction: "repainting" },
    { part: "Door / entrance", material: "Aluminium/steel", replaceYears: 40 },
  ],
  "Heating system": [
    { part: "Heating substation", material: "Boilers, heat exchangers etc.", replaceYears: 30 },
    { part: "Heating distribution", material: "Pipes, valves etc.", replaceYears: null },
  ],
  Floor: [],
};

/** What a component's age is judged against, when its material is unknown —
 *  which it usually is: no dataset records the window frame or roof covering. */
export interface ComponentLife {
  /** Shortest common replacement interval (years), null = over 50 years. */
  minYears: number | null;
  /** Longest finite interval among the common materials (years). */
  maxYears: number | null;
  /** One line saying which IVL rows this rests on. */
  basis: string;
}

export const COMPONENT_LIFE: Record<string, ComponentLife> = {
  // Wood is the common frame in older Swedish stock; aluminium-clad frames
  // outlast the 50-year period, so a recorded replacement matters most here.
  Windows: { minYears: 40, maxYears: 40,
    basis: "Wood windows 40 years; wood/aluminium and aluminium frames more than 50 (IVL)." },
  // Felt to sheet metal; tiles outlast 50 years.
  Roof: { minYears: 30, maxYears: 40,
    basis: "Roof covering: felt 30, sheet metal 40 years; clay/concrete tiles more than 50 (IVL)." },
  Doors: { minYears: 40, maxYears: 40,
    basis: "Doors and entrances 40 years (IVL)." },
  "Heating system": { minYears: 30, maxYears: 30,
    basis: "Heating substation (boilers, heat exchangers) 30 years; pipework more than 50 (IVL)." },
  Walls: { minYears: null, maxYears: null,
    basis: "Façade cladding is not replaced within 50 years, only maintained: repaint wood every 10, repair render every 25, repoint brick every 30 years (IVL)." },
  Floor: { minYears: null, maxYears: null,
    basis: "Floor and insulation are not in the IVL table; treated as lasting more than 50 years." },
};

/** Replacement interval of a renovation MEASURE (what is installed), for the
 *  B4 replacements in the life-cycle cost and carbon. Read from the part and
 *  the build-up's own description; null = lasts beyond 50 years per IVL, so it
 *  is never replaced within the study period. Maintenance (B2: repainting,
 *  render repair) is a different module and not counted. */
export function measureLifeYears(componentKey: string, description: string): { years: number | null; basis: string } {
  const part = componentKey.replace(/^VertExt::/, "");
  const d = description.toLowerCase();
  if (part === "Windows") {
    return /alu|alumin/.test(d)
      ? { years: null, basis: "Wood/aluminium or aluminium window: more than 50 years (IVL)." }
      : { years: 40, basis: "Window: 40 years (IVL, wood frame; PVC frames are not in the IVL table and are given the same)." };
  }
  if (part === "Doors") return { years: 40, basis: "Door: 40 years (IVL)." };
  if (part === "Roof") {
    if (/sedum/.test(d)) return { years: 20, basis: "Sedum roof: 20 years (IVL)." };
    if (/papp|felt|bitumen|asfalt|membran/.test(d)) return { years: 30, basis: "Felt / bitumen roof covering: 30 years (IVL)." };
    if (/shingel|shingle/.test(d)) return { years: 30, basis: "Asphalt shingle: 30 years (IVL)." };
    if (/plåt|plat\b|metal|steel|sheet|zink|koppar/.test(d)) return { years: 40, basis: "Sheet-metal roof covering: 40 years (IVL)." };
    return { years: null, basis: "Roof insulation or tiles: more than 50 years (IVL)." };
  }
  return { years: null, basis: `${part}: insulation and cladding last more than 50 years (IVL).` };
}

/** B4 replacements within a study period (EN 15978, as EPSM LCA counts them):
 *  replaced ceil(period / life) − 1 times, at years L, 2L, …  The cost of each
 *  replacement is discounted to today; carbon is not discounted. */
export function replacementsWithin(periodYr: number, lifeYr: number | null): number[] {
  if (!lifeYr || lifeYr <= 0) return [];
  const n = Math.ceil(periodYr / lifeYr) - 1;
  return Array.from({ length: Math.max(0, n) }, (_, k) => (k + 1) * lifeYr);
}

/** BBR 9:92 — U-values to aim for when a part of the envelope is altered. */
export const BBR_RENOVATION_U: Record<string, number> = {
  Roof: 0.13,
  Walls: 0.18,
  Floor: 0.15,
  Windows: 1.2,
  Doors: 1.2,
};
