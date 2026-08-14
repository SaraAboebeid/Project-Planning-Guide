/**
 * Pre-built sample datasets for the three project types.
 * Used to generate demo reports without requiring the wizard to be completed.
 *
 * CHANGES TRACKED:
 *  - Renovation Planning: realistic Gothenburg multi-family building (1962),
 *    two renovation packages (facade+windows / full envelope), EPC class E → B target
 *  - Energy Community Planning: Lindholmen Science Park neighbourhood scenario,
 *    rooftop PV + demand response, 12-building stock
 *  - Renewable Energy Planning: Hisingen district city-scale solar atlas,
 *    847-building coverage, rooftop + facade PV
 */

import type { ReportProject, ReportComputedValues } from "./reportGenerator";
import { getDeliverableSections } from "../config/deliverables";

/* ─── shared helpers ─────────────────────────────────────────────────────── */

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function buildTimeline(
  totalHours: number,
  startISO: string,
): ReportComputedValues["timelineRows"] {
  const splits: [string, number][] = [
    ["Scoping",              0.10],
    ["Data Collection",      0.30],
    ["Modelling & Analysis", 0.35],
    ["Validation & QA",      0.15],
    ["Reporting",            0.10],
  ];
  let cur = new Date(startISO);
  return splits.map(([phase, frac]) => {
    const hrs   = Math.round(totalHours * frac);
    const weeks = Math.max(1, Math.round(hrs / 30));
    const end   = addDays(cur, weeks * 7);
    const row   = { phase, start: fmt(cur), end: fmt(end), hrs, weeks };
    cur = end;
    return row;
  });
}

function buildBudget(hours: number, rateSEK = 1_400) {
  const baseLaborCost = Math.round(hours * rateSEK);
  const lkpCost       = Math.round(baseLaborCost * 0.575);
  const overheadCost  = Math.round(baseLaborCost * 0.30);
  const serviceCost   = baseLaborCost + lkpCost + overheadCost;
  return { baseLaborCost, lkpCost, overheadCost, serviceCost };
}

/* ══════════════════════════════════════════════════════════════════════════
   SAMPLE 1 — Renovation Planning
   "Jakobsbergsgatan 22 — Djuprenoveringsstudie"
   Multi-family residential, Johanneberg, Gothenburg, built 1962
   ══════════════════════════════════════════════════════════════════════════ */

const RENO_SYSTEMS   = ["Thermal Envelope", "HVAC / Ventilation", "Heating System"];
const RENO_KPI       = ["Energy Use Intensity", "Carbon Intensity", "Heating Demand", "Cost per m²"];
const RENO_EXPLORE   = ["Comparison of Renovation Packages", "Sensitivity Analysis"];
const RENO_ENVELOPE  = ["External Wall", "Windows & Glazing", "Roof / Attic"];

const RENO_HOURS     = 65;
const RENO_START     = "2026-09-01";
const { baseLaborCost: rB, lkpCost: rL, overheadCost: rO, serviceCost: rS } = buildBudget(RENO_HOURS);

export const SAMPLE_RENOVATION_PROJECT: ReportProject = {
  projectName:                  "Jakobsbergsgatan 22 — Djuprenoveringsstudie",
  projectType:                  "Renovation Planning",
  buildingDevelopmentType:      "existing",
  country:                      "Sweden",
  scale:                        "Building",
  systemsInScope:               RENO_SYSTEMS,
  selectedKpis:                 RENO_KPI,
  explorationApproaches:        RENO_EXPLORE,
  buildingUses:                 ["Multi-family residential"],
  renovationEnvelopeComponents: RENO_ENVELOPE,

  /* ── Executive Summary ── */
  executiveSummary: {
    keyMessage:          "An ambitious full-envelope renovation strategy could reduce primary energy use by up to 52 % and carbon emissions by approximately 64 % compared to the 2024 baseline, lifting the building from EPC class E to class B.",
    energyBefore_kwhM2: 172,
    energyAfter_kwhM2:  83,
    energySavingsPct:   52,
    carbonReductionPct: 64,
    targetEpcClass:     "B",
    investmentRange:    "4.8 – 5.5 MSEK",
  },

  /* ── Renovation Framework ── */
  renovationFramework: {
    leadIndicator: "Primary energy use intensity (kWh/m²/yr) — aligned with BBR 29 §9",
    tenantImpact:  "Tenant disruption is to be minimised. Interior insulation of external walls is excluded. All works are planned for phased execution with maintained heating throughout.",
    inScope: [
      "External wall insulation (exterior application)",
      "Window and glazing replacement (triple-glazed units)",
      "Roof / attic insulation upgrade",
      "Air-tightness improvement (envelope sealing)",
      "Energy performance modelling & EPC recertification",
      "Embodied carbon assessment of renovation materials",
    ],
    outOfScope: [
      "Interior wall insulation (tenant disruption unacceptable)",
      "Basement / slab insulation (structural constraints)",
      "HVAC system replacement (separate procurement)",
      "PV installation (subject to separate feasibility study)",
      "Interior refurbishment / cosmetic works",
    ],
  },

  /* ── Impact Assessment — per package ── */
  impactPackages: [
    {
      name:                    "Package A — Facade & Windows",
      color:                   "#d97706",
      energyBefore_kwhM2:      172,
      energyAfter_kwhM2:       118,   // ~31 % saving from wall + window upgrade
      savingsPct:              31,
      carbonBefore_tCO2:       48.2,  // 172 kWh/m² × 2800 m² × 0.10 kg/kWh (DH) / 1000
      carbonAfter_tCO2:        33.3,
      carbonReductionPct:      31,
      materialCostSEK:         680 * 2_715.05 + 45 * 9_620.46,
      annualEnergySavingsSEK:  54 * 2_800 * 0.90,  // 54 kWh/m² × Atemp × 0.90 SEK/kWh DH
      simplePaybackYears:      22,
      targetEpcClass:          "C",
    },
    {
      name:                    "Package B — Full Envelope Upgrade",
      color:                   "#509724",
      energyBefore_kwhM2:      172,
      energyAfter_kwhM2:       83,    // ~52 % saving (wall + window + roof)
      savingsPct:              52,
      carbonBefore_tCO2:       48.2,
      carbonAfter_tCO2:        17.4,
      carbonReductionPct:      64,
      materialCostSEK:         680 * 2_715.05 + 45 * 9_620.46 + 420 * 2_583.47,
      annualEnergySavingsSEK:  89 * 2_800 * 0.90,  // 89 kWh/m² saving
      simplePaybackYears:      26,
      targetEpcClass:          "B",
    },
  ],

  /* ── Conclusions ── */
  conclusions: {
    recommendedPackage: "Package B — Full Envelope Upgrade",
    general: [
      "The building stock assessment confirms that Jakobsbergsgatan 22 is a high-priority candidate for deep renovation, with an EPC class E rating and energy use of 172 kWh/m²/yr significantly above the Swedish average for its typology.",
      "Both renovation packages yield meaningful energy and carbon reductions. Package B achieves the best long-term performance, reaching EPC class B and aligning with Sweden's national 2030 energy efficiency targets.",
      "Material costs are based on Wikells Sektionsfakta 2024 unit prices. A further detailed assessment including supplier tenders is recommended before committing to procurement.",
      "The estimated investment range of 4.8–5.5 MSEK is in line with comparable deep renovations for 1960s MFH typologies in the Gothenburg region.",
    ],
    portfolioSpecific: [
      "The existing external wall (U = 0.46 W/m²K) significantly exceeds the current BBR 29 maximum for renovation of 0.25 W/m²K — exterior insulation is the highest-impact single measure.",
      "Windows have a high U-value of 2.10 W/m²K; replacement with triple-glazed units (U ≈ 0.80 W/m²K) will also improve thermal comfort and reduce condensation risk.",
      "The roof U-value (0.18 W/m²K) already meets standard requirements but further improvement is cost-effective given the roof's remaining service life.",
      "No existing EPC data was available for ventilation type; natural ventilation is assumed. An FTX (mechanical heat recovery) system is recommended as a complementary measure in a future phase.",
    ],
    nextSteps: [
      "Commission a detailed on-site building survey to verify U-values, air-tightness, and structural condition.",
      "Obtain 2–3 contractor tenders for Package B to validate Wikells-based cost estimates.",
      "Engage with Göteborg Energi to confirm district heating connection capacity post-renovation.",
      "Apply for SBAB / Klimatklivet renovation grants before procurement — potential to offset 15–25 % of CAPEX.",
      "Schedule EPC recertification for Q3 following completion of renovation works.",
    ],
  },

  address:       "Jakobsbergsgatan 22, 412 61 Göteborg",
  locationLabel: "Jakobsbergsgatan 22, Johanneberg, Göteborg",
  lat:           57.6932,
  lon:           11.9746,
  radiusM:       0,

  lookedUpBuilding: {
    address:       "Jakobsbergsgatan 22",
    year:          1962,
    height:        15.2,
    floors:        5,
    footprint_m2:  680,
    area_atemp:    2_800,
    use_cat:       "bostad_flerfamilj",
    energy:        172,
    eclass:        "E",
    has_epc:       true,
    tabula_period: "1961-1975",
    tabula_u_wall: 0.456,
    tabula_u_win:  2.10,
    dist_m:        8,
  },

  bboxStats: null,
  bboxRows: [
    {
      address:               "Jakobsbergsgatan 22",
      building_use:          "bostad_flerfamilj",
      year_built:            1962,
      height_m:              15.2,
      floors:                5,
      footprint_m2:          680,
      energy_kwh_m2:         172,
      epc_class:             "E",
      has_epc:               true,
      tabula_period:         "1961-1975",
      u_wall:                0.456,
      u_roof:                0.18,
      u_window:              2.10,
    },
  ],

  savedWWR: {
    average_wwr: 0.24,
    source:      "Facade Inspector (automated analysis)",
    saved_at:    "2026-08-28",
  },

  dataInputs: {
    "EPC Certificate":           { available: true,  proxy: null,                             confidence: 0.92 },
    "Energy Use (kWh/m²/yr)":    { available: true,  proxy: null,                             confidence: 0.88 },
    "U-values (Wall / Window)":  { available: true,  proxy: "TABULA archetype 1961-1975",     confidence: 0.70 },
    "Roof U-value":              { available: false, proxy: "TABULA archetype default",        confidence: 0.55 },
    "Window-to-Wall Ratio":      { available: true,  proxy: "Facade Inspector automated",     confidence: 0.80 },
    "Conditioned Floor Area":    { available: true,  proxy: null,                             confidence: 0.90 },
    "Year of Construction":      { available: true,  proxy: null,                             confidence: 0.95 },
    "Heating System Type":       { available: false, proxy: "District heating assumed",        confidence: 0.65 },
    "Ventilation Type":          { available: false, proxy: "Natural ventilation assumed",     confidence: 0.50 },
    "Occupancy Profile":         { available: false, proxy: "Standard residential schedule",   confidence: 0.60 },
  },
};

export const SAMPLE_RENOVATION_COMPUTED: ReportComputedValues = {
  totalHours:    RENO_HOURS,
  userWeeks:     Math.max(1, Math.round(RENO_HOURS / 30)),
  currency:      "SEK",
  baseLaborCost: rB,
  lkpCost:       rL,
  overheadCost:  rO,
  serviceCost:   rS,

  timelineRows: buildTimeline(RENO_HOURS, RENO_START),

  delivSections: getDeliverableSections("Renovation Planning", RENO_SYSTEMS),

  /* Two renovation packages */
  packageTotals: [
    {
      name:             "Package A — Facade & Windows",
      color:            "#d97706",
      costSEK:          /* wall: 680×2715 + windows: 45×9620 */ 680 * 2_715.05 + 45 * 9_620.46,
      carbonKg:         /* 680×42 + 45×180 */ 680 * 42 + 45 * 180,
      carbonEstimated:  false,
      selections: {
        "External Wall":      { wikellsCode: "7.007", areaM2: 680 },
        "Windows & Glazing":  { wikellsCode: "16.001", areaM2: 45 },
      },
    },
    {
      name:             "Package B — Full Envelope Upgrade",
      color:            "#509724",
      costSEK:          680 * 2_715.05 + 45 * 9_620.46 + 420 * 2_583.47,
      carbonKg:         680 * 42 + 45 * 180 + 420 * 35,
      carbonEstimated:  false,
      selections: {
        "External Wall":      { wikellsCode: "7.007", areaM2: 680 },
        "Windows & Glazing":  { wikellsCode: "16.001", areaM2: 45 },
        "Roof / Attic":       { wikellsCode: "11.003", areaM2: 420 },
      },
    },
  ],
  selectedPackageId: "Package B — Full Envelope Upgrade",

  /* CAPEX based on Package B material cost + labour markup */
  capex: {
    construction: 4_200_000,   // materials + installation labour
    design:         420_000,   // architectural & engineering fees
    permits:         45_000,
    equipment:      125_000,   // scaffolding, hoisting, temp heat
  },
  contingencyPct: 15,
  capexBase:      4_790_000,
  capexTotal:     5_508_500,  // base + 15 % contingency

  opex: {
    energy:       58_000,  // reduced post-renovation (from ~195k)
    maintenance:  68_000,
    staffing:          0,
    other:        12_000,
  },
};

/* ══════════════════════════════════════════════════════════════════════════
   SAMPLE 2 — Energy Community Planning
   "Lindholmen Science Park — Energigemenskap"
   Mixed-use neighbourhood, Lindholmen, Gothenburg
   ══════════════════════════════════════════════════════════════════════════ */

const EC_SYSTEMS  = ["Rooftop PV", "Community PV", "Demand Response", "Shared Battery Storage"];
const EC_KPI      = ["Self-sufficiency ratio", "Peak demand reduction", "CO₂ avoided", "Collective investment cost"];
const EC_EXPLORE  = ["Comparison of Renovation Packages", "Sensitivity Analysis", "Optimisation"];

const EC_HOURS    = 108; // 60 × 1.8 (Neighborhood scale)
const EC_START    = "2026-09-15";
const { baseLaborCost: eB, lkpCost: eL, overheadCost: eO, serviceCost: eS } = buildBudget(EC_HOURS);

export const SAMPLE_EC_PROJECT: ReportProject = {
  projectName:                  "Lindholmen Science Park — Energigemenskap",
  projectType:                  "Energy Community Planning",
  buildingDevelopmentType:      "mix",
  country:                      "Sweden",
  scale:                        "Neighborhood",
  systemsInScope:               EC_SYSTEMS,
  selectedKpis:                 EC_KPI,
  explorationApproaches:        EC_EXPLORE,
  buildingUses:                 ["Office", "Research", "Light industrial", "Retail"],
  renovationEnvelopeComponents: [],

  address:       "Lindholmspiren 3-5, 417 56 Göteborg",
  locationLabel: "Lindholmen Science Park, Göteborg",
  lat:           57.7062,
  lon:           11.9364,
  radiusM:       600,

  lookedUpBuilding: null,

  bboxStats: {
    count:        12,
    with_height:  12,
    with_year:    10,
    with_energy:   7,
    with_epc:      5,
    avg_height:   18.2,
    avg_year:   2004,
    avg_energy:   95,
    avg_footprint: 1_340,
    common_use:   "kontor",
  },

  bboxRows: [
    { address: "Lindholmspiren 3",       building_use: "kontor",            year_built: 2006, height_m: 22.0, floors: 7, footprint_m2: 1_820, energy_kwh_m2:  88, epc_class: "B", has_epc: true,  tabula_period: null, u_wall: null, u_roof: null, u_window: null },
    { address: "Lindholmspiren 5",       building_use: "kontor",            year_built: 2008, height_m: 18.5, floors: 6, footprint_m2: 1_540, energy_kwh_m2:  92, epc_class: "C", has_epc: true,  tabula_period: null, u_wall: null, u_roof: null, u_window: null },
    { address: "Theres Svenssons gata 11", building_use: "kontor",          year_built: 2012, height_m: 24.0, floors: 8, footprint_m2: 2_100, energy_kwh_m2:  78, epc_class: "B", has_epc: true,  tabula_period: null, u_wall: null, u_roof: null, u_window: null },
    { address: "Theres Svenssons gata 13", building_use: "kontor",          year_built: 2015, height_m: 21.0, floors: 7, footprint_m2: 1_660, energy_kwh_m2:  82, epc_class: "B", has_epc: true,  tabula_period: null, u_wall: null, u_roof: null, u_window: null },
    { address: "Lindholmsallén 2",       building_use: "handel",            year_built: 2003, height_m:  9.5, floors: 2, footprint_m2:   980, energy_kwh_m2: 120, epc_class: "D", has_epc: false, tabula_period: null, u_wall: null, u_roof: null, u_window: null },
    { address: "Lindholmsallén 4",       building_use: "handel",            year_built: 2003, height_m:  9.5, floors: 2, footprint_m2:   920, energy_kwh_m2: 118, epc_class: null, has_epc: false, tabula_period: null, u_wall: null, u_roof: null, u_window: null },
    { address: "Masthuggskajen 8",       building_use: "kontor",            year_built: 2019, height_m: 28.0, floors: 9, footprint_m2: 2_400, energy_kwh_m2:  65, epc_class: "A", has_epc: true,  tabula_period: null, u_wall: null, u_roof: null, u_window: null },
    { address: "Eriksberg Varvsväg 1",   building_use: "industri",          year_built: 1998, height_m: 12.0, floors: 3, footprint_m2: 1_200, energy_kwh_m2: 145, epc_class: "E", has_epc: false, tabula_period: null, u_wall: null, u_roof: null, u_window: null },
    { address: "Eriksberg Varvsväg 3",   building_use: "industri",          year_built: 1997, height_m: 11.5, floors: 3, footprint_m2: 1_150, energy_kwh_m2: 152, epc_class: null, has_epc: false, tabula_period: null, u_wall: null, u_roof: null, u_window: null },
    { address: "Norra Älvstranden 12",   building_use: "bostad_flerfamilj", year_built: 2002, height_m: 18.0, floors: 6, footprint_m2:   840, energy_kwh_m2: 105, epc_class: "C", has_epc: true,  tabula_period: null, u_wall: null, u_roof: null, u_window: null },
    { address: "Norra Älvstranden 14",   building_use: "bostad_flerfamilj", year_built: 2004, height_m: 18.0, floors: 6, footprint_m2:   860, energy_kwh_m2: 102, epc_class: "C", has_epc: false, tabula_period: null, u_wall: null, u_roof: null, u_window: null },
    { address: "Lindholmen Conference",  building_use: "ovrigt",            year_built: 2010, height_m: 15.0, floors: 5, footprint_m2: 1_100, energy_kwh_m2:  98, epc_class: "C", has_epc: true,  tabula_period: null, u_wall: null, u_roof: null, u_window: null },
  ],

  savedWWR: null,

  dataInputs: {
    "EPC Certificates (available)":       { available: true,  proxy: null,                              confidence: 0.85 },
    "Energy Metering (AMR)":              { available: true,  proxy: null,                              confidence: 0.90 },
    "Rooftop Area & Orientation":         { available: true,  proxy: "Satellite imagery analysis",      confidence: 0.78 },
    "Annual Solar Irradiance (PVGIS)":    { available: true,  proxy: null,                              confidence: 0.88 },
    "Electricity Load Profiles":          { available: false, proxy: "Standard commercial schedule",    confidence: 0.65 },
    "Battery Storage Specs":              { available: false, proxy: "Vendor datasheet defaults",        confidence: 0.60 },
    "Grid Connection Capacity":           { available: true,  proxy: null,                              confidence: 0.92 },
    "Community Agreement Framework":      { available: false, proxy: "Standard Swedish LEC template",   confidence: 0.70 },
    "Shading Obstructions":               { available: false, proxy: "OpenStreetMap 3D data",            confidence: 0.55 },
  },
};

export const SAMPLE_EC_COMPUTED: ReportComputedValues = {
  totalHours:    EC_HOURS,
  userWeeks:     Math.max(1, Math.round(EC_HOURS / 30)),
  currency:      "SEK",
  baseLaborCost: eB,
  lkpCost:       eL,
  overheadCost:  eO,
  serviceCost:   eS,

  timelineRows:  buildTimeline(EC_HOURS, EC_START),
  delivSections: getDeliverableSections("Energy Community Planning", EC_SYSTEMS),
  packageTotals: [],
  selectedPackageId: null,

  capex: {
    construction: 3_800_000,   // PV system installation (12 buildings)
    design:         380_000,
    permits:         55_000,
    equipment:    1_200_000,   // Battery storage units
  },
  contingencyPct: 12,
  capexBase:      5_435_000,
  capexTotal:     6_087_200,

  opex: {
    energy:      -95_000,  // net savings from self-generation
    maintenance:  85_000,  // PV + storage O&M
    staffing:     40_000,  // community energy manager (part-time)
    other:        12_000,
  },
};

/* ══════════════════════════════════════════════════════════════════════════
   SAMPLE 3 — Renewable Energy Planning
   "Hisingen Solar Resource Assessment"
   City-scale rooftop PV potential study, Hisingen, Gothenburg
   ══════════════════════════════════════════════════════════════════════════ */

const RE_SYSTEMS  = ["Rooftop PV", "Facade PV"];
const RE_KPI      = ["Annual energy yield", "LCOE", "Self-consumption ratio", "CO₂ reduction potential", "Payback period"];
const RE_EXPLORE  = ["Parametric Study", "Comparison of Renovation Packages"];

const RE_HOURS    = 125; // 50 × 2.5 (City scale)
const RE_START    = "2026-10-01";
const { baseLaborCost: rnB, lkpCost: rnL, overheadCost: rnO, serviceCost: rnS } = buildBudget(RE_HOURS);

export const SAMPLE_RE_PROJECT: ReportProject = {
  projectName:                  "Hisingen Solar Resource Assessment",
  projectType:                  "Renewable Energy Planning",
  buildingDevelopmentType:      "existing",
  country:                      "Sweden",
  scale:                        "City",
  systemsInScope:               RE_SYSTEMS,
  selectedKpis:                 RE_KPI,
  explorationApproaches:        RE_EXPLORE,
  buildingUses:                 ["Multi-family residential", "Single-family residential", "Office", "Industrial"],
  renovationEnvelopeComponents: [],

  address:       "Hisingen, Göteborg",
  locationLabel: "Hisingen District, Göteborg",
  lat:           57.7340,
  lon:           11.9100,
  radiusM:       3_500,

  lookedUpBuilding: null,

  bboxStats: {
    count:         847,
    with_height:   801,
    with_year:     723,
    with_energy:   312,
    with_epc:      289,
    avg_height:     9.5,
    avg_year:     1978,
    avg_energy:    138,
    avg_footprint:  420,
    common_use:   "bostad_flerfamilj",
  },

  /* For city scale we only show summary stats — bboxRows left empty */
  bboxRows: [],

  savedWWR: null,

  dataInputs: {
    "PVGIS Solar Irradiance Data":          { available: true,  proxy: null,                              confidence: 0.92 },
    "EUBUCCO Building Footprints":          { available: true,  proxy: null,                              confidence: 0.88 },
    "Building Height (LiDAR / EUBUCCO)":    { available: true,  proxy: "EUBUCCO height estimates",        confidence: 0.75 },
    "Roof Pitch & Orientation":             { available: false, proxy: "Flat roof assumed (conservative)", confidence: 0.55 },
    "Facade Area Estimation":               { available: false, proxy: "Derived from footprint + height",  confidence: 0.60 },
    "EPC Energy Performance":               { available: true,  proxy: null,                              confidence: 0.80 },
    "Grid Connection Points":               { available: false, proxy: "Vattenfall grid map (public)",     confidence: 0.65 },
    "Shading from Trees / Buildings":       { available: false, proxy: "Canopy height model (2 m res.)",   confidence: 0.50 },
    "Electricity Tariffs":                  { available: true,  proxy: null,                              confidence: 0.85 },
    "PV Module Performance Data":           { available: true,  proxy: "Industry standard 22 % STC",      confidence: 0.88 },
  },
};

export const SAMPLE_RE_COMPUTED: ReportComputedValues = {
  totalHours:    RE_HOURS,
  userWeeks:     Math.max(1, Math.round(RE_HOURS / 30)),
  currency:      "SEK",
  baseLaborCost: rnB,
  lkpCost:       rnL,
  overheadCost:  rnO,
  serviceCost:   rnS,

  timelineRows:  buildTimeline(RE_HOURS, RE_START),
  delivSections: getDeliverableSections("Renewable Energy Planning", RE_SYSTEMS),
  packageTotals: [],
  selectedPackageId: null,

  capex: {
    construction: 0,         // assessment only — no physical installation
    design:       rnS,       // consulting fee is the primary CAPEX for a feasibility study
    permits:      15_000,    // data licensing, GIS tools
    equipment:    25_000,    // simulation software licenses
  },
  contingencyPct: 10,
  capexBase:      rnS + 40_000,
  capexTotal:     Math.round((rnS + 40_000) * 1.10),

  opex: {
    energy:       0,
    maintenance:  0,
    staffing:     0,
    other:        8_000,  // annual data subscription costs
  },
};

/* ─── Convenience export ─────────────────────────────────────────────────── */

export const SAMPLE_REPORTS = [
  {
    id:          "renovation",
    label:       "Renovation Planning",
    color:       "#d97706",
    accentBg:    "rgba(217,119,6,0.08)",
    accentBorder:"rgba(217,119,6,0.25)",
    project:     SAMPLE_RENOVATION_PROJECT,
    computed:    SAMPLE_RENOVATION_COMPUTED,
    summary: {
      building:  "Multi-family residential, 1962, 5 floors",
      location:  "Johanneberg, Göteborg",
      highlight: "2 renovation packages · EPC E → B target · 65 consultant hours",
    },
  },
  {
    id:          "energy-community",
    label:       "Energy Community Planning",
    color:       "#721CB8",
    accentBg:    "rgba(114,28,184,0.08)",
    accentBorder:"rgba(114,28,184,0.25)",
    project:     SAMPLE_EC_PROJECT,
    computed:    SAMPLE_EC_COMPUTED,
    summary: {
      building:  "12 mixed-use buildings · Neighbourhood scale",
      location:  "Lindholmen Science Park, Göteborg",
      highlight: "Rooftop PV + shared storage · self-sufficiency scenario · 108 hours",
    },
  },
  {
    id:          "renewable-energy",
    label:       "Renewable Energy Planning",
    color:       "#509724",
    accentBg:    "rgba(80,151,36,0.08)",
    accentBorder:"rgba(80,151,36,0.25)",
    project:     SAMPLE_RE_PROJECT,
    computed:    SAMPLE_RE_COMPUTED,
    summary: {
      building:  "847 buildings · City scale",
      location:  "Hisingen District, Göteborg",
      highlight: "Solar resource atlas · rooftop + facade PV · 125 consultant hours",
    },
  },
] as const;
