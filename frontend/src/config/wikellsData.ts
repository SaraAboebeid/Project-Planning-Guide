/* ─────────────────────────────────────────────────────────────────────────────
   Wikells Sektionsfakta — Renovation material cost database
   Source: Wikells Byggberäkningar AB
   Unit: SEK/m²  (section cost, installed)
   Translated to English from Swedish
   ───────────────────────────────────────────────────────────────────────────── */

export interface WikellsItem {
  code: string;
  description: string;
  costSEK: number;    // SEK/m²
  unit: string;
  weightKgM2?: number;
  fireClass?: string;
  uValue?: number;    // W/(m²·K)
  soundRw?: number;   // dB  (interior walls)
}

export interface WikellsChapter {
  id: string;
  chapter: string;
  titleSV: string;
  titleEN: string;
  subGroups: WikellsSubGroup[];
}

export interface WikellsSubGroup {
  label: string;
  items: WikellsItem[];
}

/* ─── Chapter 7 – Exterior Walls ────────────────────────────────────────────── */
const CH7_TIMBER: WikellsItem[] = [
  { code: "7.001", description: "EW timber stud 95 M0 with plywood",                               costSEK: 1088.35, unit: "SEK/m²", weightKgM2: 13 },
  { code: "7.002", description: "EW timber stud 95 M0 with log panel",                             costSEK: 1196.05, unit: "SEK/m²", weightKgM2: 13 },
  { code: "7.003", description: "EW timber stud 95 M0 with batten panel",                          costSEK: 1366.95, unit: "SEK/m²", weightKgM2: 17 },
  { code: "7.004", description: "EW timber stud 95 M95 with batten panel",                         costSEK: 2705.55, unit: "SEK/m²", weightKgM2: 45, fireClass: "REI 30", uValue: 0.43 },
  { code: "7.005", description: "EW timber stud 120 M0 with fibre cement",                         costSEK: 2246.57, unit: "SEK/m²", weightKgM2: 39, fireClass: "EI 30" },
  { code: "7.006", description: "EW timber stud 120 M0 with trapezoidal sheet TRP 20",             costSEK: 843.25,  unit: "SEK/m²", weightKgM2: 11 },
  { code: "7.007", description: "EW timber stud 45+120 M165 with batten panel",                    costSEK: 2715.05, unit: "SEK/m²", weightKgM2: 50, fireClass: "REI 30", uValue: 0.26 },
  { code: "7.008", description: "EW timber stud 120+120 M240 braced wall",                         costSEK: 1908.88, unit: "SEK/m²", weightKgM2: 44, fireClass: "REI 30", uValue: 0.20 },
  { code: "7.009", description: "EW timber stud 120+120 M360 with batten panel",                   costSEK: 3237.00, unit: "SEK/m²", weightKgM2: 61, fireClass: "REI 60", uValue: 0.12 },
  { code: "7.010", description: "EW timber stud 145 M145 with log panel",                          costSEK: 2197.20, unit: "SEK/m²", weightKgM2: 39, fireClass: "REI 30", uValue: 0.33 },
  { code: "7.011", description: "EW timber stud 145 M145 with fibre cement",                       costSEK: 2610.97, unit: "SEK/m²", weightKgM2: 45, fireClass: "EI 30",  uValue: 0.33 },
  { code: "7.012", description: "EW timber stud 145 M145 with TRP 45",                             costSEK: 1618.85, unit: "SEK/m²", weightKgM2: 33, fireClass: "EI 15",  uValue: 0.31 },
  { code: "7.013", description: "EW timber stud 145+45 M190+70 climate board with brick facade",   costSEK: 3907.42, unit: "SEK/m²", weightKgM2: 269, fireClass: "REI 30", uValue: 0.16 },
  { code: "7.017", description: "EW timber stud 145+145 — 300 blown glass wool + boarding",        costSEK: 2957.53, unit: "SEK/m²", fireClass: "REI 30", uValue: 0.12 },
  { code: "7.018", description: "EW timber stud 145+145 — 300 blown rock wool + batten cladding",  costSEK: 3127.13, unit: "SEK/m²", weightKgM2: 74, fireClass: "REI 60", uValue: 0.12 },
  { code: "7.019", description: "EW timber stud 145+145 — 300 blown cellulose + batten cladding",  costSEK: 3278.73, unit: "SEK/m²", weightKgM2: 73, fireClass: "REI 30", uValue: 0.15 },
  { code: "7.020", description: "EW timber stud 170 M170+70 climate board with brick facade",      costSEK: 4019.00, unit: "SEK/m²", weightKgM2: 275, fireClass: "REI 60", uValue: 0.19 },
  { code: "7.038", description: "EW timber stud 195 M195+95 with T&G panel",                       costSEK: 3100.17, unit: "SEK/m²", weightKgM2: 68, fireClass: "EI 60",  uValue: 0.14 },
  { code: "7.039", description: "EW timber stud 195 M195+100 EPS facade board with batten panel",  costSEK: 2897.40, unit: "SEK/m²", weightKgM2: 55, fireClass: "REI 30", uValue: 0.15 },
  { code: "7.040", description: "EW timber stud 195 M195+100 EPS facade board with brick",         costSEK: 3696.70, unit: "SEK/m²", weightKgM2: 266, fireClass: "REI 30", uValue: 0.15 },
  { code: "7.041", description: "EW timber stud 195+45 — 240 wood fibre insulation + T&G panel",   costSEK: 2667.37, unit: "SEK/m²", weightKgM2: 67, fireClass: "REI 30", uValue: 0.16 },
];

const CH7_CLT: WikellsItem[] = [
  { code: "7.063", description: "EW CLT 100 M402 with Steni cladding boards",                                       costSEK: 4925.50, unit: "SEK/m²", fireClass: "EI 120", uValue: 0.09 },
  { code: "7.064", description: "EW CLT 120 M120+100 facade board with profiled T&G panel",                          costSEK: 3757.60, unit: "SEK/m²", weightKgM2: 97, fireClass: "EI 60", uValue: 0.13 },
  { code: "7.065", description: "EW CLT 120 — 220 Isover Plus+ with T&G panel",                                     costSEK: 3554.03, unit: "SEK/m²", weightKgM2: 91, fireClass: "EI 60", uValue: 0.13 },
];

/* ─── Chapter 8 – Interior Walls ────────────────────────────────────────────── */
const CH8_TIMBER: WikellsItem[] = [
  { code: "8.001", description: "IW timber stud 70/70 (450 cc) 1-1 M0",                             costSEK: 770.20,  unit: "SEK/m²", weightKgM2: 24, fireClass: "EI 30", soundRw: 30 },
  { code: "8.002", description: "IW timber stud 70/70 (450 cc) 2-2 M0",                             costSEK: 1147.40, unit: "SEK/m²", weightKgM2: 42, fireClass: "EI 60", soundRw: 35 },
  { code: "8.003", description: "IW timber stud/steel track 70/70 (450 cc) 1-1 M45",                costSEK: 899.50,  unit: "SEK/m²", weightKgM2: 24, fireClass: "EI 30", soundRw: 30 },
  { code: "8.004", description: "IW timber stud 70/70 (450 cc) 1-1 M70",                            costSEK: 945.50,  unit: "SEK/m²", weightKgM2: 26, fireClass: "EI 30", soundRw: 30 },
  { code: "8.006", description: "IW timber stud 70/70 (450 cc) 1-1 M45 with OSB",                   costSEK: 1455.00, unit: "SEK/m²", weightKgM2: 39, fireClass: "EI 60", soundRw: 33 },
  { code: "8.007", description: "IW timber stud 70/70 (450 cc) 1-1 M70 with OSB",                   costSEK: 1214.20, unit: "SEK/m²", weightKgM2: 33, fireClass: "EI 30", soundRw: 33 },
  { code: "8.008", description: "IW timber stud 70/70 (450 cc) 1P-1P M0",                           costSEK: 884.80,  unit: "SEK/m²", weightKgM2: 31, fireClass: "EI 60", soundRw: 33 },
  { code: "8.009", description: "IW timber stud 70/70 (450 cc) 1R-1R M45",                          costSEK: 977.00,  unit: "SEK/m²", weightKgM2: 31, fireClass: "EI 30", soundRw: 33 },
  { code: "8.010", description: "IW timber stud 70/70 (450 cc) 2V-1 M0 with tiles",                 costSEK: 2527.80, unit: "SEK/m²", weightKgM2: 52, fireClass: "EI 30", soundRw: 35 },
  { code: "8.015", description: "IW timber stud 70/70 (600 cc) 1-1 M0 with OSB",                   costSEK: 1261.85, unit: "SEK/m²", weightKgM2: 37, fireClass: "EI 30", soundRw: 33 },
  { code: "8.016", description: "IW timber stud 70/70 (600 cc) 1-1 M0 with rough-sawn T&G",        costSEK: 1521.65, unit: "SEK/m²", weightKgM2: 39, fireClass: "EI 30", soundRw: 33 },
  { code: "8.017", description: "IW timber stud 70/70 (600 cc) 1-1 M70 with plywood",              costSEK: 1648.95, unit: "SEK/m²", weightKgM2: 37, fireClass: "EI 60", soundRw: 38 },
  { code: "8.018", description: "IW timber stud 70/70 (600 cc) M0 with Fermacell",                 costSEK: 932.85,  unit: "SEK/m²", weightKgM2: 34, fireClass: "EI 30", soundRw: 33 },
  { code: "8.019", description: "IW timber stud 70/70 (600 cc) M0 with chipboard",                 costSEK: 822.25,  unit: "SEK/m²", weightKgM2: 21, fireClass: "REI 15", soundRw: 28 },
  { code: "8.036", description: "IW timber stud 120/120 (600 cc) 2-2 M45 with metal band",         costSEK: 1485.45, unit: "SEK/m²", fireClass: "REI 30", soundRw: 44 },
];

const CH8_LIGHTWEIGHT_CONCRETE: WikellsItem[] = [
  { code: "8.084", description: "IW masonry lightweight concrete 75",                                costSEK: 1139.40, unit: "SEK/m²", weightKgM2: 63,  fireClass: "EI 90",  soundRw: 30 },
  { code: "8.085", description: "IW masonry lightweight concrete 100",                               costSEK: 1213.50, unit: "SEK/m²", weightKgM2: 78,  fireClass: "EI 120", soundRw: 32 },
  { code: "8.086", description: "IW masonry lightweight concrete 150",                               costSEK: 1371.00, unit: "SEK/m²", weightKgM2: 106, fireClass: "REI 180",soundRw: 35 },
  { code: "8.087", description: "IW masonry lightweight concrete 200",                               costSEK: 1507.30, unit: "SEK/m²", weightKgM2: 135, fireClass: "REI 240",soundRw: 38 },
  { code: "8.088", description: "IW wet-room wall masonry lightweight concrete 100",                 costSEK: 2017.00, unit: "SEK/m²", weightKgM2: 85,  fireClass: "EI 120", soundRw: 35 },
  { code: "8.089", description: "IW duct wall masonry lightweight concrete 150+150",                 costSEK: 2411.40, unit: "SEK/m²", weightKgM2: 194, fireClass: "REI 240",soundRw: 59 },
  { code: "8.090", description: "IW duct wall standing lightweight concrete element 150+150",        costSEK: 1774.60, unit: "SEK/m²", weightKgM2: 181, fireClass: "REI 240",soundRw: 52 },
];

const CH8_LIGHTWEIGHT_CLINKER: WikellsItem[] = [
  { code: "8.092", description: "IW masonry lightweight clinker 70",                                 costSEK: 1486.20, unit: "SEK/m²", weightKgM2: 88,  fireClass: "EI 90",  soundRw: 33 },
  { code: "8.093", description: "IW masonry lightweight clinker 90",                                 costSEK: 1515.80, unit: "SEK/m²", weightKgM2: 100, fireClass: "EI 180", soundRw: 35 },
  { code: "8.094", description: "IW masonry lightweight clinker 150",                                costSEK: 1787.00, unit: "SEK/m²", weightKgM2: 162, fireClass: "REI 180",soundRw: 40 },
  { code: "8.095", description: "IW masonry lightweight clinker 190",                                costSEK: 1951.00, unit: "SEK/m²", weightKgM2: 199, fireClass: "REI 240",soundRw: 42 },
];

const CH8_CONCRETE: WikellsItem[] = [
  { code: "8.097", description: "IW thermomur 200",                                                  costSEK: 2101.53, unit: "SEK/m²", weightKgM2: 266, fireClass: "REI 60", soundRw: 48 },
  { code: "8.098", description: "IW concrete 150 C25/30",                                            costSEK: 2468.70, unit: "SEK/m²", weightKgM2: 365, fireClass: "REI 120",soundRw: 53 },
  { code: "8.099", description: "IW concrete 200 C25/30",                                            costSEK: 3045.60, unit: "SEK/m²", weightKgM2: 494, fireClass: "REI 180",soundRw: 58 },
  { code: "8.102", description: "IW concrete 200 self-compacting",                                   costSEK: 2182.70, unit: "SEK/m²",                  fireClass: "REI 180",soundRw: 58 },
  { code: "8.103", description: "IW double-joint wall concrete 150+150 self-compacting",              costSEK: 4774.20, unit: "SEK/m²", weightKgM2: 737, fireClass: "REI 180",soundRw: 65 },
  { code: "8.104", description: "IW shell wall concrete BxLxH=200×6000×3000",                       costSEK: 23182.69,unit: "SEK/st", weightKgM2: 9046,fireClass: "REI 240",soundRw: 58 },
];

const CH8_BRICK: WikellsItem[] = [
  { code: "8.106", description: "IW plastered brick 108",                                            costSEK: 2438.60, unit: "SEK/m²", weightKgM2: 239, fireClass: "REI 120",soundRw: 48 },
  { code: "8.107", description: "IW plastered brick 226",                                            costSEK: 3790.80, unit: "SEK/m²", weightKgM2: 415, fireClass: "REI 240",soundRw: 52 },
  { code: "8.108", description: "IW facing brick 108",                                               costSEK: 2386.60, unit: "SEK/m²", weightKgM2: 257, fireClass: "REI 120",soundRw: 44 },
  { code: "8.109", description: "IW facing brick 120",                                               costSEK: 2586.10, unit: "SEK/m²", weightKgM2: 261, fireClass: "REI 120",soundRw: 44 },
];

const CH8_SANDWICH: WikellsItem[] = [
  { code: "8.110", description: "IW sandwich panel steel 80 incl. fixings, fittings, transport",     costSEK: 824.00,  unit: "SEK/m²", weightKgM2: 19,  fireClass: "EI 60",  soundRw: 30 },
];

const CH8_MISC: WikellsItem[] = [
  { code: "8.111", description: "IW system wall FLEXfinline FF 95/1.5.1",                            costSEK: 1320.00, unit: "SEK/m²", weightKgM2: 22,  fireClass: "EI 30",  soundRw: 35 },
  { code: "8.112", description: "IW wrought-iron frame M100 with TRP 20",                            costSEK: 2673.40, unit: "SEK/m²", weightKgM2: 38,  fireClass: "EI 60",  soundRw: 20 },
  { code: "8.113", description: "IW masonry glass-block wall 100",                                   costSEK: 6756.95, unit: "SEK/m²", weightKgM2: 108, fireClass: "E 60",   uValue: 2.40 },
];

const CH8_BASEBOARDS: WikellsItem[] = [
  { code: "8.114", description: "Baseboards, painted",   costSEK: 113.80, unit: "SEK/m" },
  { code: "8.115", description: "Baseboards, antique",   costSEK: 162.10, unit: "SEK/m" },
  { code: "8.116", description: "Baseboards, oak",       costSEK: 153.40, unit: "SEK/m" },
  { code: "8.117", description: "Baseboards, plastic",   costSEK: 247.50, unit: "SEK/m" },
  { code: "8.118", description: "Cornice, painted",      costSEK: 121.60, unit: "SEK/m" },
  { code: "8.119", description: "Cornice, antique",      costSEK: 144.90, unit: "SEK/m" },
];

const CH8_QUICK: WikellsItem[] = [
  { code: "8.120", description: "IW timber stud 70/70 (450) all-in",   costSEK: 4794.80, unit: "SEK/m²" },
  { code: "8.121", description: "IW timber stud 70/70 (600) all-in",   costSEK: 4744.25, unit: "SEK/m²" },
  { code: "8.122", description: "IW timber stud 95/95 (450) all-in",   costSEK: 4885.00, unit: "SEK/m²" },
  { code: "8.123", description: "IW timber stud 95/95 (600) all-in",   costSEK: 4825.10, unit: "SEK/m²" },
];

const CH8_CLT: WikellsItem[] = [
  { code: "8.037", description: "IW CLT 80 2-2 M0",                                                costSEK: 1725.60, unit: "SEK/m²", weightKgM2: 74, fireClass: "R 30 / EI 60", soundRw: 33 },
  { code: "8.038", description: "IW CLT 90 1-1 M0",                                                costSEK: 1449.00, unit: "SEK/m²", weightKgM2: 61, fireClass: "R 15 / EI 30", soundRw: 30 },
  { code: "8.039", description: "IW CLT 100 1P-1P M70 with screw-fixed gypsum board",              costSEK: 2561.60, unit: "SEK/m²", weightKgM2: 89, fireClass: "EI 60", soundRw: 48 },
];

/* ─── Exported catalogue ────────────────────────────────────────────────────── */
export const WIKELLS_CHAPTERS: WikellsChapter[] = [
  {
    id:       "ch7",
    chapter:  "7",
    titleSV:  "YTTERVÄGGAR",
    titleEN:  "Exterior Walls",
    subGroups: [
      { label: "Timber Stud Frame", items: CH7_TIMBER },
      { label: "CLT Frame",         items: CH7_CLT },
    ],
  },
  {
    id:       "ch8",
    chapter:  "8",
    titleSV:  "INNERVÄGGAR",
    titleEN:  "Interior Walls",
    subGroups: [
      { label: "Timber Stud Frame",        items: CH8_TIMBER },
      { label: "CLT Frame",                 items: CH8_CLT },
      { label: "Lightweight Concrete",      items: CH8_LIGHTWEIGHT_CONCRETE },
      { label: "Lightweight Clinker",       items: CH8_LIGHTWEIGHT_CLINKER },
      { label: "Concrete Frame",            items: CH8_CONCRETE },
      { label: "Brick Frame",               items: CH8_BRICK },
      { label: "Steel Sandwich Panel",      items: CH8_SANDWICH },
      { label: "Misc. Interior Walls",      items: CH8_MISC },
      { label: "Baseboards & Cornices",     items: CH8_BASEBOARDS },
      { label: "Quick-Input Assemblies",    items: CH8_QUICK },
    ],
  },
];

/* ─── Quick stats helper ─────────────────────────────────────────────────────── */
export function wikellsStats() {
  const allItems = WIKELLS_CHAPTERS.flatMap(c => c.subGroups.flatMap(g => g.items));
  const costs = allItems.map(i => i.costSEK);
  return {
    totalItems: allItems.length,
    minCost: Math.min(...costs),
    maxCost: Math.max(...costs),
    avgCost: Math.round(costs.reduce((a, b) => a + b, 0) / costs.length),
  };
}
