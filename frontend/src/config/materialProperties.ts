/* ─────────────────────────────────────────────────────────────────────────────
   Material properties for the retrofit optimization: SERVICE LIFE and THICKNESS,
   with cited sources. Enriches the Wikells catalogue (wikellsData.ts) so each
   envelope option carries the extra attributes the MILP needs:
       U-value (from Wikells), cost/m² (Wikells), embodied carbon (carbon map),
   →   service life (here),  →  thickness (here / parsed from the assembly).

   Every value below is traceable to a source in SOURCES. Service-life figures
   are the reference (average) values used for LCA/LCC in the BNB/DGNB scheme.
   ───────────────────────────────────────────────────────────────────────────── */

export interface Source {
  id: string;
  label: string;
  url: string;
  note?: string;
}

/** Citation registry — keep the provenance of every figure in this file. */
export const SOURCES: Record<string, Source> = {
  wikells: {
    id: "wikells",
    label: "Wikells Sektionsfakta (Byggberäkningar AB)",
    url: "https://www.wikells.se/",
    note: "Primary source for each assembly's installed cost (SEK/m²), U-value and the nominal insulation thickness stated in the assembly description.",
  },
  bbsr2017: {
    id: "bbsr2017",
    label: "BBSR — Nutzungsdauern von Bauteilen für Lebenszyklusanalysen nach BNB (Stand 24.02.2017)",
    url: "https://www.nachhaltigesbauen.de/fileadmin/pdf/baustoff_gebauededaten/BNB_Nutzungsdauern_von_Bauteilen_2017-02-24.pdf",
    note: "Federal (DE) reference service-life table used in BNB/DGNB/QNG life-cycle assessment. Values are mean expected service lives in years; '≥50' = at least the 50-year assessment period.",
  },
  bbsr2025: {
    id: "bbsr2025",
    label: "BBSR — Neuerhebung der Nutzungsdauertabelle (2025); WDVS raised to ≥50 yr",
    url: "https://www.nachhaltigesbauen.de/austausch/nutzungsdauern-von-bauteilen/",
    note: "2025 revision; among other changes the external thermal-insulation composite system (ETICS/WDVS) service life was raised from 40 to at least 50 years.",
  },
  ricsBcis: {
    id: "ricsBcis",
    label: "RICS / BCIS — Life Expectancy of Building Components",
    url: "https://www.rics.org/news-insights/bcis-component-life-expectancy-update-for-2018",
    note: "UK surveyor-panel dataset of typical/min/max component lives; used to cross-check the BBSR figures.",
  },
  iso15686: {
    id: "iso15686",
    label: "ISO 15686-1:2011 — Service life planning",
    url: "https://www.iso.org/standard/45798.html",
    note: "International standard defining the reference-service-life method these tables follow.",
  },
  paroc: {
    id: "paroc",
    label: "Paroc stone-wool thickness guide",
    url: "https://www.paroc.com/en/documents/uploads/guide-to-paroc-stone-wool-thicknesses",
    note: "Manufacturer product-thickness ranges (facade slabs, loose-fill), corroborating the min–max thickness bands.",
  },
  ewi: {
    id: "ewi",
    label: "EWI Store / trade guidance — external wall insulation thickness",
    url: "https://ewistore.co.uk/mineral-wool-vs-eps-vs-kingspan-k5-vs-wood-fibre-in-solid-wall-insulation-systems/",
    note: "Typical retrofit board thicknesses: EPS from 20 mm in 10 mm steps; mineral-wool slabs ~40–200 mm; loose-fill attic up to ~500 mm.",
  },
};

/* ─── Service life by envelope category (years) ──────────────────────────────
   The value is what the MILP should use for the option's replacement cycle.
   For a retrofit, this is the life of the *added/replaced* layer, not the
   structural frame (noted where they differ). All from BBSR 2017 unless noted. */

export interface ServiceLifeEntry {
  years: number;          // reference service life used for replacement scheduling
  atLeast?: boolean;      // true when the source states "≥ years" (i.e. ≥ assessment period)
  sourceId: keyof typeof SOURCES;
  bbsrCode?: string;      // row in the BBSR table
  note?: string;
}

export type EnvelopeCategory =
  | "wall_insulation_etics"   // added external insulation + render (WDVS/ETICS)
  | "wall_insulation_core"    // insulation in a ventilated/cavity build-up
  | "wall_structure_timber"   // timber-stud / CLT structural wall
  | "wall_facade_brick"       // brick facing / masonry facade
  | "wall_render"             // render / plaster on insulation
  | "roof_insulation"         // attic / roof thermal insulation
  | "roof_membrane_bitumen"   // felt / bitumen flat-roof waterproofing
  | "roof_membrane_plastic"   // PVC / elastomer flat-roof membrane
  | "roof_tiles"              // clay / concrete roof tiles
  | "roof_metal"              // standing-seam / sheet-metal roof
  | "floor_insulation"        // ground-floor / crawl-space insulation
  | "window_wood"             // softwood / painted-wood window
  | "window_alu_clad";        // aluminium-clad wood or aluminium window

export const SERVICE_LIFE: Record<EnvelopeCategory, ServiceLifeEntry> = {
  // ETICS/WDVS: mineral wool, EPS, PU, wood-fibre, cork boards → 40 yr (2017);
  // raised to ≥50 yr in the 2025 revision.
  wall_insulation_etics: { years: 40, sourceId: "bbsr2017", bbsrCode: "335.641",
    note: "ETICS/WDVS render+insulation. BBSR 2025 raised this to ≥50 yr — see bbsr2025." },
  wall_insulation_core:  { years: 50, atLeast: true, sourceId: "bbsr2017", bbsrCode: "335.611",
    note: "Insulation as core/cavity or behind a rainscreen: ≥50 yr." },
  wall_structure_timber: { years: 50, atLeast: true, sourceId: "bbsr2017", bbsrCode: "351.411",
    note: "Timber-frame / CLT structural wall (Massivholz/Holzbalken): ≥50 yr." },
  wall_facade_brick:     { years: 50, atLeast: true, sourceId: "bbsr2017",
    note: "Brick facing / masonry (Verblendschale Ziegel/Hartbrandklinker; Mauerwerk): ≥50 yr." },
  wall_render:           { years: 30, sourceId: "bbsr2017", bbsrCode: "335.314",
    note: "Render/plaster applied on insulation: 30 yr (mineral render on masonry ~40 yr)." },
  roof_insulation:       { years: 50, atLeast: true, sourceId: "bbsr2017", bbsrCode: "352.122",
    note: "Attic-floor / top-storey-ceiling / roof thermal insulation: ≥50 yr." },
  roof_membrane_bitumen: { years: 30, sourceId: "bbsr2017", bbsrCode: "363.112",
    note: "Bitumen waterproofing membrane: 30 yr (RICS/BCIS typical 20–30)." },
  roof_membrane_plastic: { years: 40, sourceId: "bbsr2017", bbsrCode: "363.111",
    note: "Plastic / elastomer (PVC/EPDM) membrane below insulation: 40 yr." },
  roof_tiles:            { years: 50, atLeast: true, sourceId: "bbsr2017", bbsrCode: "363.512",
    note: "Clay tiles (Ziegel) / concrete tiles (Beton) roof covering: ≥50 yr." },
  roof_metal:            { years: 50, atLeast: true, sourceId: "bbsr2017", bbsrCode: "363.514",
    note: "Zinc/copper/aluminium/stainless sheet: ≥50 yr; galvanized+coated steel 45 yr (363.516)." },
  floor_insulation:      { years: 50, atLeast: true, sourceId: "bbsr2017", bbsrCode: "353.421",
    note: "Basement-ceiling / ground-floor insulation: ≥50 yr." },
  window_wood:           { years: 40, sourceId: "bbsr2017", bbsrCode: "334.212",
    note: "Softwood / treated-pine (Nadelholz) window frame+sash: 40 yr (RICS/BCIS 30–40)." },
  window_alu_clad:       { years: 50, atLeast: true, sourceId: "bbsr2017", bbsrCode: "334.211",
    note: "Aluminium, aluminium-wood composite, hardwood (Laubholz) or steel window: ≥50 yr." },
};

/* ─── Insulation thickness bands by material (mm) ────────────────────────────
   Typical product / retrofit thickness ranges, to bound the thickness parsed
   from an assembly and to fill it in where the description omits a number. */

export interface ThicknessBand {
  minMm: number;
  typicalMm: number;
  maxMm: number;
  sourceId: keyof typeof SOURCES;
  note?: string;
}

export const INSULATION_THICKNESS: Record<string, ThicknessBand> = {
  mineral_wool_board: { minMm: 40, typicalMm: 120, maxMm: 300, sourceId: "ewi",
    note: "Stone/glass-wool ETICS & cavity slabs, ~40–200 mm boards; to 300 mm on deep retrofit (Paroc)." },
  mineral_wool_loose: { minMm: 150, typicalMm: 350, maxMm: 500, sourceId: "wikells",
    note: "Blown/loose glass or stone wool in attics; Wikells assemblies span 195–500 mm." },
  eps_board:          { minMm: 20, typicalMm: 100, maxMm: 300, sourceId: "ewi",
    note: "EPS facade board, from 20 mm in 10 mm steps." },
  wood_fibre:         { minMm: 40, typicalMm: 200, maxMm: 400, sourceId: "wikells",
    note: "Wood-fibre boards/loose fill; Wikells assemblies 240–500 mm." },
  cellulose:          { minMm: 100, typicalMm: 350, maxMm: 500, sourceId: "wikells",
    note: "Loose-fill cellulose; Wikells attic assemblies up to 500 mm." },
};

/* ─── Parse the nominal insulation thickness from a Wikells description ───────
   The description usually states it, e.g. "300 blown glass wool", "245 mineral
   wool", "M195", "195 M195+100 EPS facade board". Returns the representative
   (largest single) insulation thickness in mm, or null when none is stated. */

const _INS_KW = "(?:blown |loose )?(?:mineral wool|glass wool|rock wool|stone wool|cellulose|wood fibre|EPS|insulation|Isover)";

export function parseInsulationThicknessMm(description: string): number | null {
  const nums: number[] = [];
  // "<NNN> <insulation keyword>"
  const re = new RegExp(`(\\d{2,3})\\s*(?:mm\\s*)?${_INS_KW}`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(description)) !== null) nums.push(parseInt(m[1]!, 10));
  // "M<NNN>" mineral-insulation value inside a stud (M0 = none)
  const mRe = /\bM(\d{2,4})\b/g;
  while ((m = mRe.exec(description)) !== null) {
    const v = parseInt(m[1]!, 10);
    if (v > 0) nums.push(v);
  }
  return nums.length ? Math.max(...nums) : null;
}

/* ─── Classify a Wikells item into an envelope category ──────────────────────
   Uses the chapter id + description keywords so each option inherits the right
   service life. chapterId is the WikellsChapter.id ("ch7","ch9","ch11","ch16"). */

export function classifyEnvelope(chapterId: string, description: string): EnvelopeCategory | null {
  const d = description.toLowerCase();
  switch (chapterId) {
    case "ch16": // windows
      return /alu|aluminum|aluminium/.test(d) ? "window_alu_clad" : "window_wood";
    case "ch7": // exterior walls
      if (/brick|facade board|eps facade|climate board/.test(d)) return "wall_insulation_etics";
      if (/clt/.test(d)) return "wall_structure_timber";
      return "wall_insulation_etics"; // added insulation + cladding drives the replacement cycle
    case "ch11": // roofs
      if (/felt|bitumen|derbigum/.test(d)) return "roof_membrane_bitumen";
      if (/plastic membrane|pvc|elastomer/.test(d)) return "roof_membrane_plastic";
      if (/tile|clay|concrete tile/.test(d)) return "roof_tiles";
      if (/metal|trp|standing seam|sheet|zinc|regal/.test(d)) return "roof_metal";
      return "roof_membrane_bitumen";
    case "ch9": // floor assemblies
      if (/attic/.test(d)) return "roof_insulation";
      if (/ground|torpar|crawl/.test(d)) return "floor_insulation";
      return "floor_insulation";
    default:
      return null;
  }
}

/* ─── Convenience: full enrichment for one Wikells item ──────────────────────
   Returns service life, parsed thickness and the citation ids to display. */

export interface EnrichedProps {
  category: EnvelopeCategory | null;
  serviceLifeYears: number | null;
  serviceLifeAtLeast: boolean;
  insulationThicknessMm: number | null;
  sourceIds: string[];
}

export function enrichWikellsItem(chapterId: string, description: string): EnrichedProps {
  const category = classifyEnvelope(chapterId, description);
  const life = category ? SERVICE_LIFE[category] : undefined;
  const thickness = parseInsulationThicknessMm(description);
  const sourceIds = new Set<string>(["wikells"]);
  if (life) sourceIds.add(life.sourceId);
  return {
    category,
    serviceLifeYears: life?.years ?? null,
    serviceLifeAtLeast: !!life?.atLeast,
    insulationThicknessMm: thickness,
    sourceIds: [...sourceIds],
  };
}
