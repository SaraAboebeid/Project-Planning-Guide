/* ─────────────────────────────────────────────────────────────────────────────
   Wikells Sektionsfakta — Renovation material cost database
   Source: Wikells Byggberäkningar AB
   Unit: SEK/m²  (section cost, installed)
   Translated to English from Swedish

   NOTE ON U-VALUES
   ----------------
   Most `uValue`s below are Wikells-supplied. Where a Wikells U-value was MISSING
   for an envelope assembly (ch7 exterior walls, ch9 attic + ground/crawl floors,
   ch11 roof build-ups, ch16 windows) it was COMPUTED per EN ISO 6946:
       U = 1 / R_total ,  R_total = Rsi + Rse + Σ(d_layer / λ_layer)
   Surface resistances (m²·K/W): walls Rsi=0.13 Rse=0.04; roofs Rsi=0.10 Rse=0.04;
   attic floors 0.10/0.10; floor-to-crawl-space Rsi=0.17 Rse=0.04. Timber stud/joist
   layers carry a repeating-thermal-bridge (framing) correction via the ISO 6946
   parallel-path method (framing fraction ≈0.09 walls / 0.08 roofs / 0.10 floors;
   crossed double-stud & loose-fill layers ≈0). Empty (M0) stud cavities use the
   ISO 6946 capped air-gap resistance R=0.18. Design λ [W/m·K]: mineral/glass/stone
   wool batts 0.036, settled loft wool 0.040, loose/blown glass 0.044 / stone 0.041,
   cellulose 0.040, wood fibre 0.038, EPS 0.036, Isover Plus+ 0.032, wood-fibre
   "climate board" 0.045, timber 0.14, gypsum 0.25, CLT 0.13, concrete 1.7 — sources:
   ISO 10456:2007 tabulated design values + Swedish BBR typical values. The method
   was validated against the 60 Wikells-supplied envelope U-values (mean abs error
   0.012, median 0.007 W/m²·K). Uninsulated roof coverings / M0 walls therefore
   carry a correctly high (bare-deck) U. Computed values are rounded to 2 decimals.
   ───────────────────────────────────────────────────────────────────────────── */

export interface WikellsItem {
  code: string;
  description: string;
  costSEK: number;    // SEK/m²
  unit: string;
  weightKgM2?: number;
  fireClass?: string;
  uValue?: number;    // W/(m²·K)
  soundRw?: number;   // dB  airborne sound (R'w)
  impactLnw?: number; // dB  impact sound (L'n,w) — lower is better
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
  { code: "7.001", description: "EW timber stud 95 M0 with plywood",                               costSEK: 1088.35, unit: "SEK/m²", weightKgM2: 13, uValue: 1.75 },
  { code: "7.002", description: "EW timber stud 95 M0 with log panel",                             costSEK: 1196.05, unit: "SEK/m²", weightKgM2: 13, uValue: 1.75 },
  { code: "7.003", description: "EW timber stud 95 M0 with batten panel",                          costSEK: 1366.95, unit: "SEK/m²", weightKgM2: 17, uValue: 1.75 },
  { code: "7.004", description: "EW timber stud 95 M95 with batten panel",                         costSEK: 2705.55, unit: "SEK/m²", weightKgM2: 45, fireClass: "REI 30", uValue: 0.43 },
  { code: "7.005", description: "EW timber stud 120 M0 with fibre cement",                         costSEK: 2246.57, unit: "SEK/m²", weightKgM2: 39, fireClass: "EI 30", uValue: 1.75 },
  { code: "7.006", description: "EW timber stud 120 M0 with trapezoidal sheet TRP 20",             costSEK: 843.25,  unit: "SEK/m²", weightKgM2: 11, uValue: 1.75 },
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

/* ─── Chapter 9 – Floor Assemblies (Bjälklag) ───────────────────────────────── */
const CH9_INTERMEDIATE: WikellsItem[] = [
  { code: "9.001", description: "Intermediate floor timber beams 220, gypsum boards",                         costSEK: 1743.63, unit: "SEK/m²", weightKgM2: 47,  fireClass: "REI 30", soundRw: 44, impactLnw: 72 },
  { code: "9.002", description: "Intermediate floor timber beams 220 + 45 mineral wool, gypsum short plank",  costSEK: 1502.87, unit: "SEK/m²", weightKgM2: 41,  fireClass: "REI 15", soundRw: 40, impactLnw: 78 },
  { code: "9.003", description: "Intermediate floor timber beams 220 + 45 mineral wool, gypsum short plank (variant)", costSEK: 2551.07, unit: "SEK/m²", weightKgM2: 38, fireClass: "REI 15", soundRw: 40, impactLnw: 78 },
  { code: "9.004", description: "Intermediate floor timber beams 220 + 45 mineral wool, gypsum boards",       costSEK: 1654.53, unit: "SEK/m²", weightKgM2: 39,  fireClass: "REI 15", soundRw: 44, impactLnw: 72 },
  { code: "9.005", description: "Intermediate floor timber beams 220 + 95 mineral wool, fire gypsum boards",  costSEK: 2187.73, unit: "SEK/m²", weightKgM2: 67,  fireClass: "REI 60", soundRw: 52, impactLnw: 68 },
  { code: "9.006", description: "Intermediate floor timber beams 220 + 220 mineral wool, fire gypsum boards", costSEK: 2487.93, unit: "SEK/m²", weightKgM2: 85,  fireClass: "REI 60", soundRw: 56, impactLnw: 58 },
  { code: "9.007", description: "Intermediate floor kerto beams 260 + 45 mineral wool, gypsum boards",        costSEK: 2060.82, unit: "SEK/m²", weightKgM2: 40,  fireClass: "REI 15", soundRw: 44, impactLnw: 72 },
  { code: "9.008", description: "Intermediate floor kerto beams 260 + 95 mineral wool, fire gypsum boards",   costSEK: 2514.42, unit: "SEK/m²", weightKgM2: 47,  fireClass: "REI 60", soundRw: 44, impactLnw: 72 },
  { code: "9.009", description: "Intermediate floor masonite beams 300 + 45 mineral wool, Hunton board",      costSEK: 1279.60, unit: "SEK/m²", weightKgM2: 34,                       soundRw: 35, impactLnw: 80 },
  { code: "9.010", description: "Intermediate floor masonite beams 300 + 300 loose glass wool, gypsum",       costSEK: 2513.42, unit: "SEK/m²", weightKgM2: 83,  fireClass: "REI 60", soundRw: 56, impactLnw: 60 },
  { code: "9.011", description: "Lightweight element B304 timber incl. fixings & sealing",                    costSEK: 1479.60, unit: "SEK/m²", weightKgM2: 42,  fireClass: "REI 15", soundRw: 40, impactLnw: 80 },
  { code: "9.012", description: "CLT 180 + 60 concrete overlay, oak parquet & impact insulation",             costSEK: 3423.74, unit: "SEK/m²", weightKgM2: 239, fireClass: "REI 30", soundRw: 50, impactLnw: 56 },
  { code: "9.013", description: "CLT 240 + 95 mineral wool, fire gypsum boards",                              costSEK: 3803.22, unit: "SEK/m²", weightKgM2: 161, fireClass: "REI 90", soundRw: 56, impactLnw: 54 },
  { code: "9.014", description: "Intermediate floor lightweight steel beams 250 + 45 mineral wool, gypsum",   costSEK: 2596.92, unit: "SEK/m²", weightKgM2: 74,  fireClass: "REI 60", soundRw: 52, impactLnw: 60 },
];

const CH9_GROUND: WikellsItem[] = [
  { code: "9.048", description: "Ground floor (torparbjälklag) timber beams 220 + 95 mineral wool", costSEK: 2240.21, unit: "SEK/m²", weightKgM2: 185, uValue: 0.39 },
  { code: "9.050", description: "Ground floor (torparbjälklag) kerto beams 260 + 95 mineral wool",  costSEK: 2576.90, unit: "SEK/m²", weightKgM2: 187, uValue: 0.39 },
];

const CH9_TERRACE: WikellsItem[] = [
  { code: "9.051", description: "Terrace slab with concrete surface",      costSEK: 2632.10, unit: "SEK/m²", weightKgM2: 637, uValue: 0.68, soundRw: 59, impactLnw: 72 },
  { code: "9.052", description: "Terrace slab with concrete paving slabs", costSEK: 3837.40, unit: "SEK/m²", weightKgM2: 589, uValue: 0.55 },
  { code: "9.053", description: "Terrace slab with concrete paving slabs (variant A)", costSEK: 4054.30, unit: "SEK/m²", weightKgM2: 622, uValue: 0.66 },
  { code: "9.054", description: "Terrace slab with concrete paving slabs (variant B)", costSEK: 3830.40, unit: "SEK/m²", uValue: 0.30 },
  { code: "9.055", description: "Terrace slab with concrete paving slabs (variant C)", costSEK: 3683.50, unit: "SEK/m²", weightKgM2: 578, uValue: 0.48 },
  { code: "9.056", description: "Terrace slab with paving stones",         costSEK: 3802.90, unit: "SEK/m²", weightKgM2: 689, uValue: 0.20 },
  { code: "9.057", description: "Terrace slab with deck flooring",         costSEK: 5688.75, unit: "SEK/m²", weightKgM2: 661, uValue: 0.18 },
];

const CH9_ATTIC: WikellsItem[] = [
  { code: "9.061", description: "Attic floor timber + 195 mineral wool, fibre cement",          costSEK: 1164.25, unit: "SEK/m²", weightKgM2: 19, fireClass: "EI 15", uValue: 0.19 },
  { code: "9.062", description: "Attic floor timber + 245 mineral wool, gypsum boards",         costSEK: 894.00,  unit: "SEK/m²", weightKgM2: 20, fireClass: "EI 15", uValue: 0.15 },
  { code: "9.063", description: "Attic floor timber + 245 mineral wool, lightweight gypsum",    costSEK: 913.26,  unit: "SEK/m²", weightKgM2: 18, fireClass: "EI 15", uValue: 0.15 },
  { code: "9.064", description: "Attic floor timber + 270 mineral wool, gypsum short plank",    costSEK: 925.16,  unit: "SEK/m²", weightKgM2: 21, fireClass: "EI 15", uValue: 0.14 },
  { code: "9.066", description: "Attic floor timber + 320 mineral wool, gypsum boards",         costSEK: 946.90,  unit: "SEK/m²", weightKgM2: 22, fireClass: "EI 15", uValue: 0.12 },
  { code: "9.067", description: "Attic floor timber + 490 mineral wool, lightweight gypsum",    costSEK: 1171.66, unit: "SEK/m²", weightKgM2: 25, fireClass: "EI 15", uValue: 0.08 },
  { code: "9.068", description: "Attic floor timber + 400 loose glass wool, gypsum boards",     costSEK: 731.60,  unit: "SEK/m²", weightKgM2: 19, fireClass: "EI 15", uValue: 0.11 },
  { code: "9.069", description: "Attic floor timber + 400 loose stone wool, gypsum boards",     costSEK: 755.80,  unit: "SEK/m²", weightKgM2: 23, fireClass: "EI 15", uValue: 0.10 },
  { code: "9.073", description: "Attic floor timber + 500 loose cellulose, gypsum boards",      costSEK: 760.30,  unit: "SEK/m²", weightKgM2: 27, fireClass: "EI 15", uValue: 0.08 },
  { code: "9.074", description: "Attic floor timber + 500 loose wood fibre, gypsum boards",     costSEK: 783.40,  unit: "SEK/m²", weightKgM2: 27, fireClass: "EI 15", uValue: 0.07 },
  { code: "9.075", description: "Attic floor 160 concrete + 320 mineral wool",                  costSEK: 1717.80, unit: "SEK/m²", weightKgM2: 402, fireClass: "REI 120", uValue: 0.11 },
  { code: "9.076", description: "Attic floor 200 concrete + 320 mineral wool",                  costSEK: 1974.20, unit: "SEK/m²",               fireClass: "REI 240", uValue: 0.11 },
  { code: "9.077", description: "Attic floor 200 concrete + 390 mineral wool",                  costSEK: 2138.20, unit: "SEK/m²", weightKgM2: 501, fireClass: "REI 240", uValue: 0.09 },
  { code: "9.078", description: "Attic floor 160 concrete + 400 loose glass wool",              costSEK: 1508.90, unit: "SEK/m²", weightKgM2: 400, fireClass: "REI 120", uValue: 0.11 },
];

const CH9_BALCONIES: WikellsItem[] = [
  { code: "9.090", description: "Timber balcony BxL=2000×3600", costSEK: 32614.72, unit: "SEK/st" },
  { code: "9.091", description: "Concrete balcony BxL=1600×3500", costSEK: 32364.70, unit: "SEK/st" },
];

/* ─── Chapter 10 – Stairs (Trapplöp) ────────────────────────────────────────── */
const CH10_INTERIOR_TIMBER: WikellsItem[] = [
  { code: "10.001", description: "Interior straight stair timber, pinewood",       costSEK: 25270.00, unit: "SEK/st" },
  { code: "10.002", description: "Interior L-shaped stair timber, pinewood",       costSEK: 29200.00, unit: "SEK/st" },
  { code: "10.003", description: "Interior half-landing stair timber, pinewood",   costSEK: 42715.00, unit: "SEK/st" },
  { code: "10.004", description: "Interior U-stair timber, oak",                   costSEK: 47890.00, unit: "SEK/st" },
];

const CH10_INTERIOR_STEEL: WikellsItem[] = [
  { code: "10.005", description: "Interior straight stair steel, gallery stair",   costSEK: 58114.00, unit: "SEK/st" },
  { code: "10.006", description: "Interior spiral stair steel, gallery stair",     costSEK: 86363.00, unit: "SEK/st" },
];

const CH10_INTERIOR_CONCRETE: WikellsItem[] = [
  { code: "10.009", description: "Interior straight cast-in-place stair",          costSEK: 52604.40, unit: "SEK/st" },
  { code: "10.010", description: "Interior straight cast-in-place stair with clinker facing", costSEK: 76472.20, unit: "SEK/st" },
  { code: "10.011", description: "Interior half-landing stair prefab concrete",    costSEK: 71047.00, unit: "SEK/st" },
  { code: "10.012", description: "Interior half-landing stair prefab concrete, cement mortar finish", costSEK: 86343.00, unit: "SEK/st" },
];

const CH10_EXTERIOR_CONCRETE: WikellsItem[] = [
  { code: "10.015", description: "Exterior basement stair concrete",               costSEK: 66608.70, unit: "SEK/st" },
];

const CH10_ENTRANCE: WikellsItem[] = [
  { code: "10.016", description: "Timber stair to porch B=1200",                   costSEK: 2650.20,  unit: "SEK/st" },
  { code: "10.017", description: "Timber stair to porch B=1400",                   costSEK: 2067.20,  unit: "SEK/st" },
  { code: "10.018", description: "Entrance platform timber BxL=2000×3600 with 1 step", costSEK: 12926.80, unit: "SEK/st" },
  { code: "10.019", description: "Exterior entrance platform concrete 1200×1200",  costSEK: 12609.75, unit: "SEK/st" },
];

const CH10_EVACUATION: WikellsItem[] = [
  { code: "10.021", description: "Exterior evacuation stair steel, straight run, gallery stair", costSEK: 109527.00, unit: "SEK/st" },
  { code: "10.022", description: "Exterior evacuation stair steel, spiral, gallery stair",       costSEK: 91338.00,  unit: "SEK/st" },
  { code: "10.023", description: "Exterior evacuation stair steel, spiral, fire door, gallery stair", costSEK: 164821.00, unit: "SEK/st" },
];

const CH10_STAIR_COMPONENTS: WikellsItem[] = [
  { code: "10.024", description: "Timber railing",  costSEK: 2575.00, unit: "SEK/m" },
  { code: "10.025", description: "Steel railing",   costSEK: 4180.00, unit: "SEK/m" },
  { code: "10.026", description: "Glass railing",   costSEK: 3638.00, unit: "SEK/m" },
  { code: "10.027", description: "Timber handrail", costSEK: 648.50,  unit: "SEK/m" },
  { code: "10.028", description: "Steel handrail",  costSEK: 814.00,  unit: "SEK/m" },
];
/* ─── Chapter 14 – Painting Work ─────────────────────────────────────────────── */
const CH14_EXTERIOR_PAINTING: WikellsItem[] = [
  { code: "14.001", description: "Exterior painting on concrete",                                 costSEK: 684.20,  unit: "SEK/st" },
  { code: "14.002", description: "Exterior painting on plaster",                                  costSEK: 1243.00, unit: "SEK/st" },
  { code: "14.003", description: "Exterior painting on lightweight concrete",                     costSEK: 280.50,  unit: "SEK/st" },
  { code: "14.004", description: "Exterior painting on brick",                                    costSEK: 321.20,  unit: "SEK/st" },
  { code: "14.005", description: "Exterior painting on wood panel",                               costSEK: 1518.00, unit: "SEK/st" },
  { code: "14.006", description: "Exterior painting on trellis",                                  costSEK: 245.30,  unit: "SEK/st" },
  { code: "14.007", description: "Exterior painting of roof overhang",                            costSEK: 1251.80, unit: "SEK/st" },
];

const CH14_INTERIOR_PAINTING: WikellsItem[] = [
  { code: "14.008", description: "Protection covering indoors",                                   costSEK: 46.20,   unit: "SEK/st" },
  { code: "14.009", description: "Interior painting on concrete floor",                           costSEK: 242.00,  unit: "SEK/st" },
  { code: "14.010", description: "Interior painting on wooden floor",                             costSEK: 259.60,  unit: "SEK/st" },
  { code: "14.011", description: "Interior painting of wall/ceiling on concrete",                 costSEK: 1562.00, unit: "SEK/st" },
  { code: "14.012", description: "Interior painting of wall/ceiling on plaster",                  costSEK: 1230.90, unit: "SEK/st" },
  { code: "14.015", description: "Interior painting wet room on concrete",                        costSEK: 1545.50, unit: "SEK/st" },
  { code: "14.016", description: "Interior painting wet room on plaster",                         costSEK: 1349.70, unit: "SEK/st" },
  { code: "14.017", description: "Interior painting wet room on chipboard",                       costSEK: 1134.10, unit: "SEK/st" },
  { code: "14.018", description: "Wallpapering on concrete",                                      costSEK: 673.20,  unit: "SEK/st" },
  { code: "14.019", description: "Wallpapering on plaster",                                       costSEK: 471.90,  unit: "SEK/st" },
  { code: "14.020", description: "Wallpapering on chipboard",                                     costSEK: 574.20,  unit: "SEK/st" },
  { code: "14.021", description: "Sandbag paint in ceiling",                                      costSEK: 211.20,  unit: "SEK/st" },
  { code: "14.022", description: "Sandblasting treatment with sandpack",                          costSEK: 759.00,  unit: "SEK/st" },
  { code: "14.023", description: "Treatment for wall plaster mat",                                costSEK: 801.90,  unit: "SEK/st" },
  { code: "14.024", description: "Interior painting of framework",                                costSEK: 451.00,  unit: "SEK/st" },
  { code: "14.025", description: "Interior painting windows",                                     costSEK: 238.70,  unit: "SEK/st" },
  { code: "14.026", description: "Interior painting interior doors of wood",                      costSEK: 2134.00, unit: "SEK/st" },
  { code: "14.027", description: "Interior painting interior doors of steel",                     costSEK: 1326.60, unit: "SEK/st" },
];

const CH14_SPECIAL_PAINTING: WikellsItem[] = [
  { code: "14.028", description: "Fire protection painting",                                      costSEK: 3358.30, unit: "SEK/st" },
  { code: "14.029", description: "Rust prevention painting",                                      costSEK: 477.40,  unit: "SEK/st" },
  { code: "14.030", description: "Interior painting of pipe",                                     costSEK: 129.80,  unit: "SEK/st" },
  { code: "14.031", description: "Painting work",                                                 costSEK: 0.00,    unit: "SEK/st" },
  { code: "14.032", description: "Available building component",                                  costSEK: 0.00,    unit: "SEK/st" },
];

/* ─── Chapter 15 – Flooring & Coverings ──────────────────────────────────────── */
const CH15_FLOOR_COVERINGS: WikellsItem[] = [
  { code: "15.001", description: "Underfloor filler",                                             costSEK: 187.00,  unit: "SEK/m²" },
  { code: "15.002", description: "Wet room filler in fall",                                       costSEK: 2282.50, unit: "SEK/m²" },
  { code: "15.003", description: "Limestone on floor",                                            costSEK: 3208.40, unit: "SEK/m²" },
  { code: "15.004", description: "Clinker on floor",                                              costSEK: 2003.10, unit: "SEK/m²" },
  { code: "15.005", description: "Oak parquet on floor",                                          costSEK: 841.80,  unit: "SEK/m²" },
  { code: "15.006", description: "Visible wood floor",                                            costSEK: 1383.40, unit: "SEK/m²" },
  { code: "15.007", description: "Laminate on floor",                                             costSEK: 751.80,  unit: "SEK/m²" },
  { code: "15.008", description: "Textile mat on floor",                                          costSEK: 764.50,  unit: "SEK/m²" },
  { code: "15.009", description: "Linoleum on floor",                                             costSEK: 731.50,  unit: "SEK/m²" },
  { code: "15.010", description: "Rubber mat on floor",                                           costSEK: 1254.00, unit: "SEK/m²" },
  { code: "15.011", description: "Plastic mat on floor",                                          costSEK: 555.50,  unit: "SEK/m²" },
  { code: "15.012", description: "Plastic mat tight sealing on floor",                            costSEK: 1193.50, unit: "SEK/m²" },
  { code: "15.013", description: "Plastic mat slip-resistant on floor",                           costSEK: 1259.50, unit: "SEK/m²" },
  { code: "15.014", description: "Plastic coating on floor",                                      costSEK: 981.20,  unit: "SEK/m²" },
  { code: "15.015", description: "Epoxy paint on floor",                                          costSEK: 128.70,  unit: "SEK/m²" },
];

const CH15_WALL_COVERINGS: WikellsItem[] = [
  { code: "15.016", description: "Tiles on wall",                                                 costSEK: 1211.10, unit: "SEK/m²" },
  { code: "15.017", description: "Splash protection of tiles at wash stand",                      costSEK: 353.10,  unit: "SEK/st" },
  { code: "15.018", description: "Splash protection of tiles over bench top",                     costSEK: 771.70,  unit: "SEK/m" },
  { code: "15.019", description: "Linoleum on wall",                                              costSEK: 944.90,  unit: "SEK/m²" },
  { code: "15.020", description: "Plastic mat on wall",                                           costSEK: 532.40,  unit: "SEK/m²" },
  { code: "15.021", description: "Flooring, coverings",                                           costSEK: 0.00,    unit: "SEK/st" },
  { code: "15.022", description: "Available building component",                                  costSEK: 0.00,    unit: "SEK/st" },
];

/* ─── Chapter 16 – Windows, Doors, Partitions, Gates ─────────────────────────── */
const CH16_WINDOWS: WikellsItem[] = [
  { code: "16.001", description: "Window 9x13 wood, fixed",                                       costSEK: 9620.46,  unit: "SEK/st", uValue: 1.0 },
  { code: "16.002", description: "Window 6x6 wood, horizontal-hung",                              costSEK: 7831.42,  unit: "SEK/st", uValue: 1.0 },
  { code: "16.003", description: "Window 9x5 wood, horizontal-hung",                              costSEK: 8848.96,  unit: "SEK/st", uValue: 1.0 },
  { code: "16.004", description: "Window 9x13 wood, horizontal-hung",                             costSEK: 13852.36, unit: "SEK/st", uValue: 1.0 },
  { code: "16.005", description: "Window 9x12 wood, outward-opening side-hung",                   costSEK: 10627.46, unit: "SEK/st", uValue: 1.0 },
  { code: "16.006", description: "Window 9x16 wood, outward-opening side-hung, safety glass",     costSEK: 15756.06, unit: "SEK/st", uValue: 1.0 },
  { code: "16.007", description: "Window 14x13 wood, outward-opening side-hung, 2-section",       costSEK: 18400.86, unit: "SEK/st", uValue: 1.0 },
  { code: "16.008", description: "Window 9x4 aluminum clad wood, fixed",                          costSEK: 6707.85,  unit: "SEK/st", uValue: 1.0 },
  { code: "16.009", description: "Window 9x12 aluminum clad wood, fixed",                         costSEK: 9953.85,  unit: "SEK/st", uValue: 1.0 },
  { code: "16.010", description: "Window 6x21 aluminum clad wood, fixed, safety glass",           costSEK: 12760.18, unit: "SEK/st", uValue: 1.0 },
  { code: "16.011", description: "Window 10x21 aluminum clad wood, fixed, safety glass",          costSEK: 17296.74, unit: "SEK/st", uValue: 1.0 },
  { code: "16.014", description: "Window 12x12 aluminum clad wood, horizontal-hung",              costSEK: 14930.02, unit: "SEK/st", uValue: 1.0 },
  { code: "16.015", description: "Window 9x12 aluminum clad wood, horizontal-hung, low-e",        costSEK: 13602.85, unit: "SEK/st", uValue: 0.81 },
  { code: "16.016", description: "Window 9x13 aluminum clad wood, horizontal-hung",               costSEK: 13082.96, unit: "SEK/st", uValue: 1.0 },
  { code: "16.026", description: "Window door 9x21 wood, outward-opening",                        costSEK: 17888.38, unit: "SEK/st", uValue: 1.0 },
  { code: "16.027", description: "Window door 9x21 aluminum clad wood, outward-opening",          costSEK: 23961.76, unit: "SEK/st", uValue: 1.0 },
  { code: "16.028", description: "Window door 9x21 aluminum clad wood, fully glazed, outward-opening, safety glass", costSEK: 25514.76, unit: "SEK/st", uValue: 1.1 },
  { code: "16.029", description: "Window door 9x21 aluminum, outward-opening",                    costSEK: 23695.76, unit: "SEK/st", uValue: 1.1 },
  { code: "16.031", description: "Skylight 24x25",                                                costSEK: 32107.24, unit: "SEK/st", uValue: 1.3 },
  { code: "16.032", description: "Industrial window strip 36x12",                                 costSEK: 23449.14, unit: "SEK/st", uValue: 1.3 },
];

/* ─── Chapter 11 – Exterior Roofs ────────────────────────────────────────────── */
const CH11_FLAT_ROOFS: WikellsItem[] = [
  { code: "11.001", description: "Felt roof with timber support studs",                          costSEK: 1430.37, unit: "SEK/m²", weightKgM2: 27, uValue: 2.86 },
  { code: "11.002", description: "Plastic membrane roof with timber support studs",              costSEK: 1234.47, unit: "SEK/m²", weightKgM2: 20, uValue: 2.86 },
  { code: "11.003", description: "Standing seam metal roof with timber support studs",           costSEK: 2583.47, unit: "SEK/m²", weightKgM2: 27, uValue: 2.86 },
  { code: "11.004", description: "TRP roof with timber support studs",                           costSEK: 777.57,  unit: "SEK/m²", weightKgM2: 12, uValue: 2.86 },
  { code: "11.005", description: "Concrete tiles with timber support studs",                     costSEK: 1303.27, unit: "SEK/m²", weightKgM2: 55, uValue: 2.86 },
  { code: "11.006", description: "2-course clay tiles with timber support studs",                costSEK: 1447.17, unit: "SEK/m²", weightKgM2: 51, uValue: 2.86 },
];

const CH11_TRUSS_ROOFS: WikellsItem[] = [
  { code: "11.007", description: "Felt roof on rough boards with timber truss",                  costSEK: 1532.74, unit: "SEK/m²", weightKgM2: 31, uValue: 2.86 },
  { code: "11.008", description: "Felt roof on rough boards with timber truss",                  costSEK: 1267.54, unit: "SEK/m²", weightKgM2: 28, uValue: 2.86 },
  { code: "11.009", description: "Plastic membrane roof on rough board hatches with timber truss", costSEK: 1290.34, unit: "SEK/m²", weightKgM2: 29, uValue: 2.86 },
  { code: "11.011", description: "Regal metal roof on battens with timber truss",                costSEK: 1224.40, unit: "SEK/m²", weightKgM2: 23, uValue: 2.86 },
  { code: "11.012", description: "Fiber cement panels on battens with timber truss",             costSEK: 1119.21, unit: "SEK/m²", weightKgM2: 35, uValue: 2.86 },
];

const CH11_PREFAB_ROOFS: WikellsItem[] = [
  { code: "11.030", description: "Concrete tiles on combined battens with prefab timber truss",  costSEK: 1104.30, unit: "SEK/m²", weightKgM2: 56, uValue: 2.86 },
  { code: "11.031", description: "1-course clay tiles on battens with prefab timber truss",      costSEK: 1541.80, unit: "SEK/m²", weightKgM2: 66, uValue: 2.86 },
  { code: "11.033", description: "Concrete tiles with ventilated sloped roof, 315 mineral wool", costSEK: 2199.60, unit: "SEK/m²", weightKgM2: 74, fireClass: "REI 15", uValue: 0.13 },
];

const CH11_LOW_SLOPE: WikellsItem[] = [
  { code: "11.048", description: "Felt roof on timber joists, uninsulated",                      costSEK: 1323.50, unit: "SEK/m²", weightKgM2: 29, fireClass: "-", uValue: 2.86 },
  { code: "11.049", description: "Felt roof on timber joists with 170 mineral wool",             costSEK: 2083.86, unit: "SEK/m²", weightKgM2: 43, fireClass: "REI 15", uValue: 0.25 },
  { code: "11.050", description: "Felt roof on timber joists with 220 mineral wool",             costSEK: 2525.76, unit: "SEK/m²", weightKgM2: 53, fireClass: "REI 15", uValue: 0.19 },
  { code: "11.051", description: "Felt roof with cant strips on Kerto beams with 365 mineral wool", costSEK: 3399.88, unit: "SEK/m²", weightKgM2: 57, fireClass: "REI 15", uValue: 0.11 },
];

const CH11_TRP_METAL: WikellsItem[] = [
  { code: "11.052", description: "TRP roof on masonite beams, uninsulated",                      costSEK: 903.10,  unit: "SEK/m²", fireClass: "-", uValue: 3.37 },
  { code: "11.053", description: "TRP roof on lightweight beams with 195 mineral wool",          costSEK: 1239.90, unit: "SEK/m²", weightKgM2: 22, fireClass: "-", uValue: 0.25 },
  { code: "11.054", description: "TRP metal with sedum covering, uninsulated",                   costSEK: 1562.30, unit: "SEK/m²", weightKgM2: 59, fireClass: "-", uValue: 3.37 },
  { code: "11.055", description: "TRP metal with felt covering on 120 insulation (fan room)",    costSEK: 1732.60, unit: "SEK/m²", weightKgM2: 50, fireClass: "(REI 30)", uValue: 0.29 },
  { code: "11.056", description: "TRP metal with felt covering on 180 insulation",               costSEK: 1522.70, unit: "SEK/m²", weightKgM2: 39, fireClass: "-", uValue: 0.20 },
  { code: "11.057", description: "TRP metal with Derbigum on 190 insulation",                    costSEK: 1360.90, unit: "SEK/m²", weightKgM2: 27, fireClass: "-", uValue: 0.18 },
  { code: "11.062", description: "TRP metal with felt covering on 230+50 insulation",            costSEK: 1995.40, unit: "SEK/m²", weightKgM2: 46, fireClass: "-", uValue: 0.13 },
  { code: "11.063", description: "TRP metal with felt covering on 330 insulation",               costSEK: 1820.80, unit: "SEK/m²", weightKgM2: 55, fireClass: "-", uValue: 0.11 },
  { code: "11.064", description: "TRP metal with Derbigum on 340 insulation",                    costSEK: 1607.80, unit: "SEK/m²", weightKgM2: 32, fireClass: "-", uValue: 0.11 },
  { code: "11.065", description: "Double-metal roof with 260 insulation",                        costSEK: 1651.02, unit: "SEK/m²", weightKgM2: 37, fireClass: "-", uValue: 0.13 },
];

const CH11_ROOF_EDGES: WikellsItem[] = [
  { code: "11.068", description: "Roof eave",                                                    costSEK: 1355.90, unit: "SEK/m" },
  { code: "11.069", description: "Roof eave with eave wedge",                                    costSEK: 1434.90, unit: "SEK/m" },
  { code: "11.071", description: "Eave batten",                                                  costSEK: 795.80,  unit: "SEK/m" },
  { code: "11.072", description: "Roof eave on TRP roof",                                        costSEK: 2627.30, unit: "SEK/m" },
  { code: "11.073", description: "Roof eave on TRP roof",                                        costSEK: 3271.40, unit: "SEK/m" },
  { code: "11.076", description: "Ventilated roof eave with fire sealing",                       costSEK: 526.90,  unit: "SEK/m" },
];

const CH11_TRIM_ACCESSORIES: WikellsItem[] = [
  { code: "11.077", description: "Wind baffles",                                                 costSEK: 857.60,  unit: "SEK/m" },
  { code: "11.078", description: "Wind baffles with clad gable overhang B=500",                  costSEK: 1345.70, unit: "SEK/m" },
  { code: "11.081", description: "Valley gutter on roof with concrete tiles",                    costSEK: 2020.40, unit: "SEK/m" },
  { code: "11.082", description: "Ridge concrete tiles",                                         costSEK: 1969.60, unit: "SEK/m" },
  { code: "11.083", description: "Ridge clay tiles",                                             costSEK: 2140.00, unit: "SEK/m" },
  { code: "11.084", description: "Ridge Royal roof",                                             costSEK: 1677.70, unit: "SEK/m" },
  { code: "11.087", description: "Gutter wedge of mineral wool",                                 costSEK: 546.70,  unit: "SEK/m" },
  { code: "11.088", description: "Gutter with felt reinforcement",                               costSEK: 716.10,  unit: "SEK/m" },
  { code: "11.089", description: "Gutter",                                                       costSEK: 496.10,  unit: "SEK/m" },
];

const CH11_SPECIAL_ITEMS: WikellsItem[] = [
  { code: "11.090", description: "Ventilation penetration plywood 600x600x600",                  costSEK: 1304.62, unit: "SEK/st" },
  { code: "11.091", description: "Canopy with felt covering B=1000",                             costSEK: 3183.50, unit: "SEK/m" },
  { code: "11.092", description: "Canopy with sheet metal covering BxL=2000x3000",               costSEK: 36461.50, unit: "SEK/st" },
  { code: "11.093", description: "Canopy with concrete roof tiles BxL=1300x1500",                costSEK: 3712.92, unit: "SEK/st" },
  { code: "11.095", description: "Roof dormer with 2 windows",                                   costSEK: 115128.97, unit: "SEK/st" },
  { code: "11.096", description: "Exterior roof incl. insulated attic floor of wood",            costSEK: 19328.73, unit: "SEK/st" },
  { code: "11.097", description: "Roof safety equipment",                                        costSEK: 6069.40, unit: "SEK/st" },
  { code: "11.098", description: "Available building component",                                 costSEK: 0.00,    unit: "SEK/st" },
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
  {
    id:       "ch9",
    chapter:  "9",
    titleSV:  "BJÄLKLAG",
    titleEN:  "Floor Assemblies",
    subGroups: [
      { label: "Intermediate Floors",       items: CH9_INTERMEDIATE },
      { label: "Ground / Crawl-Space Floors", items: CH9_GROUND },
      { label: "Terrace Slabs",             items: CH9_TERRACE },
      { label: "Attic Floors",              items: CH9_ATTIC },
      { label: "Balconies",                 items: CH9_BALCONIES },
    ],
  },
  {
    id:       "ch10",
    chapter:  "10",
    titleSV:  "TRAPPLÖP",
    titleEN:  "Stairs",
    subGroups: [
      { label: "Interior Timber Stairs",    items: CH10_INTERIOR_TIMBER },
      { label: "Interior Steel Stairs",     items: CH10_INTERIOR_STEEL },
      { label: "Interior Concrete Stairs",  items: CH10_INTERIOR_CONCRETE },
      { label: "Exterior Concrete Stairs",  items: CH10_EXTERIOR_CONCRETE },
      { label: "Entrance Stairs & Platforms", items: CH10_ENTRANCE },
      { label: "Evacuation Stairs",         items: CH10_EVACUATION },
      { label: "Stair Components (Railings & Handrails)", items: CH10_STAIR_COMPONENTS },
    ],
  },
  {
    id:       "ch11",
    chapter:  "11",
    titleSV:  "YTTERTAK",
    titleEN:  "Exterior Roofs",
    subGroups: [
      { label: "Flat Roofs with Timber Studs",      items: CH11_FLAT_ROOFS },
      { label: "Pitched Roofs with Timber Trusses", items: CH11_TRUSS_ROOFS },
      { label: "Pitched Roofs with Prefab Trusses", items: CH11_PREFAB_ROOFS },
      { label: "Low-Slope Roofs on Joists",         items: CH11_LOW_SLOPE },
      { label: "TRP Metal Roofs",                   items: CH11_TRP_METAL },
      { label: "Roof Edge Details",                 items: CH11_ROOF_EDGES },
      { label: "Trim & Accessories (Ridges, Gutters)", items: CH11_TRIM_ACCESSORIES },
      { label: "Special Items (Canopies, Dormers)", items: CH11_SPECIAL_ITEMS },
    ],
  },
  {
    id:       "ch14",
    chapter:  "14",
    titleSV:  "MÅLNINGSARBETEN",
    titleEN:  "Painting Work",
    subGroups: [
      { label: "Exterior Painting",                 items: CH14_EXTERIOR_PAINTING },
      { label: "Interior Painting",                 items: CH14_INTERIOR_PAINTING },
      { label: "Special Painting",                  items: CH14_SPECIAL_PAINTING },
    ],
  },
  {
    id:       "ch15",
    chapter:  "15",
    titleSV:  "BELÄGGNINGAR, BEKLÄDNADER",
    titleEN:  "Flooring & Coverings",
    subGroups: [
      { label: "Floor Coverings",                   items: CH15_FLOOR_COVERINGS },
      { label: "Wall Coverings",                    items: CH15_WALL_COVERINGS },
    ],
  },
  {
    id:       "ch16",
    chapter:  "16",
    titleSV:  "FÖNSTER, DÖRRAR, PARTIER, PORTAR",
    titleEN:  "Windows, Doors, Partitions, Gates",
    subGroups: [
      { label: "Windows",                           items: CH16_WINDOWS },
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
