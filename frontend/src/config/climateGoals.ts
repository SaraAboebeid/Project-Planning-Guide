/* City-level climate targets that a renovation package can be measured against.
 *
 * Both Step 4 and the Step 5 report read this one config. Researched 2026-10-07
 * from each city's adopted climate/energy documents (links in `sourceUrl`).
 *
 * Real targets come in three shapes, and the tool scores each honestly:
 *   pct      - a % cut in energy use. Scored as that % off the building's
 *              simulated as-built baseline.
 *   absolute - a kWh/m²·yr level to reach (Brussels, Wallonia). Scored as the
 *              cut needed to get THIS building's baseline down to that level.
 *   info     - a target the simulation cannot score (an EPC band is a cost-
 *              based SAP rating, not kWh/m²). Shown as context, never as a
 *              pass/fail line.
 *
 * Almost none of these targets is literally "this building vs its as-built
 * state": they are city-wide, per-inhabitant, stock averages, or primary energy
 * against an old base year. `basis` says what the official figure measures so
 * the UI never presents a proxy as the city's own rule. */

export interface ClimateGoal {
  /** City this target applies to — matched against project.city. */
  city: string;
  kind: "pct" | "absolute" | "rating" | "info";
  /** Rating goals: the band to reach (UK EPC, SAP scale). */
  targetRating?: string;
  /** Required reduction vs the as-built baseline, in percent. For an absolute
   *  goal this is filled in per baseline by resolveGoal(); 0 for info goals. */
  reductionPct: number;
  /** Absolute goals: the energy level to reach, kWh/m²·yr. */
  targetKwhM2?: number;
  /** Year the target is set for. */
  targetYear: number;
  /** Whose target it is - a national fallback must not be shown as the city's. */
  scope: "city" | "regional" | "national";
  /** What the official figure actually measures, in one line. */
  basis: string;
  /** The city's headline climate goal, for context. */
  headline?: string;
  /** Short attribution shown under the goal statement. */
  source: string;
  sourceUrl?: string;
}

const SE_NATIONAL: Omit<ClimateGoal, "city"> = {
  kind: "pct", reductionPct: 50, targetYear: 2050, scope: "national",
  basis: "Sweden's national goal: energy use per heated m² in homes and premises −50% by 2050 vs 1995. No local building-energy target was found for this municipality.",
  source: "Swedish Riksdag energy-efficiency sub-goal (prop. 2005/06:145)",
};

export const CLIMATE_GOALS: ClimateGoal[] = [
  {
    city: "Gothenburg", kind: "pct", reductionPct: 30, targetYear: 2030, scope: "city",
    basis: "Primary energy use in homes and premises −30% by 2030 vs 2010 (city-wide, per inhabitant). The city's own housing companies translate it into 84 kWh/m² PET for homes, 130 for premises.",
    headline: "Climate footprint close to zero by 2030",
    source: "Göteborgs Stad miljö- och klimatprogram 2021–2030",
    sourceUrl: "https://goteborg.se/wps/PA_Pabolagshandlingar/file?id=52742",
  },
  {
    city: "Malmö", kind: "pct", reductionPct: 15, targetYear: 2030, scope: "city",
    basis: "Specific energy use (kWh/m², from energy declarations) of Malmö's buildings −15% by 2030 vs 2019.",
    headline: "Area emissions −70% vs 1990; 100% renewable or recycled energy by 2030",
    source: "Energistrategi för Malmö 2022–2030",
    sourceUrl: "https://miljobarometern.malmo.se/content/docs/energistrategi-for-malmo-2022-2030.pdf",
  },
  { city: "Stockholm", ...SE_NATIONAL, headline: "Climate-positive by 2030, fossil-free by 2040 (Miljöprogram 2030)" },
  { city: "Ystad", ...SE_NATIONAL, headline: "No current local climate target found (the 2015–2020 strategy has expired)" },
  { city: "Alingsås", ...SE_NATIONAL, headline: "Municipal group fossil-independent by 2030; area climate-neutral 2040" },
  { city: "Askersund", ...SE_NATIONAL, headline: "Follows Örebro county's net zero by 2045" },
  {
    city: "London", kind: "pct", reductionPct: 40, targetYear: 2030, scope: "city",
    basis: "About 40% less heat demand in London's buildings by 2030 (the Mayor's net-zero-2030 pathway). It is a HEAT target; here it is applied to total energy, which is harder to cut by 40%.",
    headline: "Net zero by 2030",
    source: "Mayor of London — Pathways to Net Zero Carbon by 2030",
    sourceUrl: "https://www.london.gov.uk/programmes-strategies/environment-and-climate-change/climate-change/zero-carbon-london/pathways-net-zero-carbon-2030",
  },
  {
    city: "Rotherham", kind: "rating", targetRating: "C", reductionPct: 0, targetYear: 2030, scope: "city",
    basis: "Council homes to reach EPC band C (SAP 69+) by 2030; private rented homes must reach EPC C by October 2030 nationally. Each package's band is estimated from the building's own certificate, moved by the simulated change in energy use.",
    headline: "Council net zero by 2030; borough net zero by 2040",
    source: "Rotherham Council — Tackling climate change; Housing Strategy 2025–2030",
    sourceUrl: "https://www.rotherham.gov.uk/council/tackling-climate-change",
  },
  {
    city: "Brussels", kind: "absolute", reductionPct: 0, targetKwhM2: 100, targetYear: 2050, scope: "regional",
    basis: "RENOLUTION / CoBrACE: average residential primary energy ≤100 kWh/m²·yr (PEB) by 2050, with renovation obligations to class E (≤275) by 2033 and then class C (≤150). Compared here with simulated delivered energy, so the check is approximate.",
    headline: "−47% greenhouse gases by 2030 vs 2005; carbon neutral by 2050",
    source: "Brussels-Capital Region — RENOLUTION strategy / CoBrACE (2024)",
    sourceUrl: "https://renolution.brussels",
  },
  {
    city: "Liège", kind: "absolute", reductionPct: 0, targetKwhM2: 85, targetYear: 2050, scope: "regional",
    basis: "Wallonia's renovation strategy: average housing PEB label A (≤85 kWh/m²·yr) by 2050. Liège has no building-energy target of its own. Compared with simulated delivered energy, so the check is approximate.",
    headline: "Liège: −55% CO₂ by 2030 vs 2005 (Covenant of Mayors)",
    source: "Wallonia long-term renovation strategy (GW 12 Nov 2020)",
    sourceUrl: "https://energie.wallonie.be/servlet/Repository/gw-201112-strategie-renovation-2020-rapport-complet-final.pdf?ID=60498",
  },
  {
    city: "Gent", kind: "info", reductionPct: 0, targetYear: 2050, scope: "regional",
    basis: "Flanders: every home at EPC label A by 2050; buyers of E/F homes must reach label D within 6 years. Ghent has no kWh target of its own, and the label-A threshold is not verified here, so it is not scored.",
    headline: "−40% CO₂ by 2030 vs 2007; climate-neutral by 2050",
    source: "Vlaanderen — renovatieverplichting; Stad Gent Klimaatplan",
    sourceUrl: "https://www.vlaanderen.be/renovatieverplichting-voor-residentiele-gebouwen",
  },
];

/** The climate goal for a project's location, or null if none is defined. A
 *  Swedish city with no entry falls back to the national goal, marked as such. */
export function climateGoalFor(city?: string | null, country?: string | null): ClimateGoal | null {
  const byCity = city
    ? CLIMATE_GOALS.find((g) => g.city.toLowerCase() === city.toLowerCase())
    : null;
  if (byCity) return byCity;
  const isSweden = country === "Sweden" || country === "se" || country === "SE";
  if (isSweden && !city) return CLIMATE_GOALS.find((g) => g.city === "Gothenburg") ?? null;
  if (isSweden && city) return { city, ...SE_NATIONAL };
  return null;
}

/** Can packages be scored on the energy-demand panel (a % or a kWh level)?
 *  Rating goals have their own panel; info goals are context only. */
export const isScorable = (goal: ClimateGoal) => goal.kind === "pct" || goal.kind === "absolute";

/** The % cut THIS baseline needs. An absolute goal becomes the cut that brings the
 *  baseline down to the level (0 if it is already there). */
export function requiredPct(goal: ClimateGoal, baselineEnergy: number): number {
  if (goal.kind === "absolute" && goal.targetKwhM2 != null && baselineEnergy > 0) {
    return Math.max(0, Math.round(((baselineEnergy - goal.targetKwhM2) / baselineEnergy) * 100));
  }
  return goal.reductionPct;
}

/** The goal with its % filled in for one baseline - what the panels display. */
export function resolveGoal(goal: ClimateGoal, baselineEnergy: number): ClimateGoal {
  return { ...goal, reductionPct: requiredPct(goal, baselineEnergy) };
}

/** One-sentence statement of the goal for the UI and report. */
export function goalStatement(goal: ClimateGoal): string {
  const whose = goal.scope === "national" ? "National target" : goal.scope === "regional" ? "Regional target" : "City target";
  if (goal.kind === "absolute") {
    return `${whose}: reach ≤ ${goal.targetKwhM2} kWh/m²·yr by ${goal.targetYear} — a −${goal.reductionPct}% cut from this baseline.`;
  }
  if (goal.kind === "rating") return `${whose}: reach EPC band ${goal.targetRating} or better by ${goal.targetYear}.`;
  if (goal.kind === "info") return `${whose} for ${goal.targetYear} — shown for context, not scored.`;
  return `${whose}: reduce energy use by ${goal.reductionPct}% by ${goal.targetYear}, measured here against the as-built baseline.`;
}

/** Percent reduction of a package's energy use vs the baseline (positive = a
 *  reduction). Null if there is no baseline to measure against. */
export function reductionPctOf(baselineEnergy: number, packageEnergy: number): number | null {
  if (!baselineEnergy || baselineEnergy <= 0) return null;
  return ((baselineEnergy - packageEnergy) / baselineEnergy) * 100;
}

/** Whether a package meets the goal. Compares on the reduction ROUNDED to a
 *  whole percent — the same value the UI shows — so a package displayed as
 *  "−30%" is never also marked "below target" because it was really 29.97%. */
export function meetsGoal(baselineEnergy: number, packageEnergy: number, goal: ClimateGoal): boolean {
  if (goal.kind === "absolute" && goal.targetKwhM2 != null) return Math.round(packageEnergy) <= goal.targetKwhM2;
  const r = reductionPctOf(baselineEnergy, packageEnergy);
  return r != null && Math.round(r) >= requiredPct(goal, baselineEnergy);
}

/** The energy demand a package must reach to hit the target: the baseline cut by
 *  the goal's reduction (e.g. 30% off 126 → 88 kWh/m²·yr), or the absolute level. */
export function goalTargetEnergy(baselineEnergy: number, goal: ClimateGoal): number {
  if (goal.kind === "absolute" && goal.targetKwhM2 != null) return Math.min(baselineEnergy, goal.targetKwhM2);
  return baselineEnergy * (1 - goal.reductionPct / 100);
}

/** How a package lands against the target:
 *   exceeds — comfortably past it (≥ 10 pts beyond the required reduction)
 *   meets   — reaches the target
 *   below   — reduces energy, but not enough to hit the target
 *   worse   — no reduction (at or above baseline)                          */
export type GoalTier = "exceeds" | "meets" | "below" | "worse";

export function goalTier(baselineEnergy: number, packageEnergy: number, goal: ClimateGoal): GoalTier | null {
  const r = reductionPctOf(baselineEnergy, packageEnergy);
  if (r == null) return null;
  if (goal.kind === "absolute" && goal.targetKwhM2 != null) {
    // A level target is met by the level, not by a rounded percentage.
    const e = Math.round(packageEnergy);
    if (e <= goal.targetKwhM2 * 0.9) return "exceeds";
    if (e <= goal.targetKwhM2) return "meets";
    return r > 0 ? "below" : "worse";
  }
  const rr = Math.round(r);   // compare on the displayed whole percent
  const need = requiredPct(goal, baselineEnergy);
  if (rr >= need + 10) return "exceeds";
  if (rr >= need) return "meets";
  if (rr > 0) return "below";
  return "worse";
}

/** One component's chosen assembly within a package, for the expandable
 *  "what's in this package" breakdown in ClimateGoalPanel. */
export interface GoalPackageMaterial {
  component: string;   // e.g. "Walls", "Roof", "New walls"
  material: string;    // the assembly's full name/description
  u: number | null;    // its U-value, when known
  /** The full layer build-up (outside → inside) for a layer-composed assembly,
   *  so the breakdown/report can list every layer, not just the summary label. */
  layers?: { name: string; thicknessMm: number; category?: string }[];
}

export interface GoalPackage {
  label: string;
  color?: string;
  /** The package's simulated total energy demand (kWh/m²·yr). */
  energyUse: number;
  /** The materials this package applies, per component — optional so callers
   *  that don't have selection detail (e.g. the report) still work. */
  materials?: GoalPackageMaterial[];
}

export interface GoalRow extends GoalPackage {
  reductionPct: number | null;
  meets: boolean;
}

export interface GoalAssessment {
  goal: ClimateGoal;
  baselineEnergy: number;
  rows: GoalRow[];
  /** Packages meeting the target, best (largest reduction) first. */
  achievers: GoalRow[];
  /** Closest package to the target when none meet it (largest reduction). */
  closest: GoalRow | null;
}

/* ── Per-building assessment ──────────────────────────────────────────────────
   Each building has its own baseline, so its own target (baseline −30%). This
   scores every package building-by-building, so the report can show which
   buildings a package actually gets over the line and by how much. */

export interface BuildingGoalCell {
  label: string;
  color?: string;
  energy: number | null;      // this building's energy under this package
  reductionPct: number | null;
  tier: GoalTier | null;
}

export interface BuildingGoalRow {
  address: string;
  baselineEnergy: number;
  targetEnergy: number;       // baseline − reductionPct%
  cells: BuildingGoalCell[];  // one per non-baseline package, package order
}

export interface PackageBuildingsLike {
  name: string;
  color?: string;
  isBaseline: boolean;
  buildings: { address: string; totalKwhM2Yr: number | null }[];
}

export interface BuildingGoalAssessment {
  goal: ClimateGoal;
  rows: BuildingGoalRow[];
  /** Non-baseline packages in column order, each with a count of how many
   *  buildings it gets to the target. */
  columns: { label: string; color?: string; met: number; total: number }[];
}

export function assessBuildingsAgainstGoal(
  goal: ClimateGoal,
  packages: PackageBuildingsLike[],
): BuildingGoalAssessment | null {
  const baseline = packages.find((p) => p.isBaseline);
  const others = packages.filter((p) => !p.isBaseline);
  if (!baseline || !others.length) return null;

  const rows: BuildingGoalRow[] = [];
  for (const bb of baseline.buildings) {
    if (bb.totalKwhM2Yr == null) continue;
    const baselineEnergy = bb.totalKwhM2Yr;
    const cells: BuildingGoalCell[] = others.map((p) => {
      const match = p.buildings.find((x) => x.address === bb.address);
      const energy = match?.totalKwhM2Yr ?? null;
      return {
        label: p.name,
        color: p.color,
        energy,
        reductionPct: energy == null ? null : reductionPctOf(baselineEnergy, energy),
        tier: energy == null ? null : goalTier(baselineEnergy, energy, goal),
      };
    });
    rows.push({
      address: bb.address,
      baselineEnergy,
      targetEnergy: goalTargetEnergy(baselineEnergy, goal),
      cells,
    });
  }
  if (!rows.length) return null;

  const columns = others.map((p, i) => ({
    label: p.name,
    color: p.color,
    met: rows.filter((r) => r.cells[i]?.tier === "meets" || r.cells[i]?.tier === "exceeds").length,
    total: rows.length,
  }));

  return { goal, rows, columns };
}

/** Score every package against the goal. Rows are returned sorted by reduction,
 *  largest first, so the strongest performer leads. */
export function assessAgainstGoal(
  goal: ClimateGoal,
  baselineEnergy: number,
  packages: GoalPackage[],
): GoalAssessment {
  // An absolute target becomes a % for this baseline, so everything downstream
  // (bars, target line, labels) keeps working off goal.reductionPct.
  goal = resolveGoal(goal, baselineEnergy);
  const rows: GoalRow[] = packages
    .map((p) => {
      const r = reductionPctOf(baselineEnergy, p.energyUse);
      // A level target is met by the level; a % target on the rounded %, matching the display.
      const meets = goal.kind === "absolute" && goal.targetKwhM2 != null
        ? Math.round(p.energyUse) <= goal.targetKwhM2
        : r != null && Math.round(r) >= goal.reductionPct;
      return { ...p, reductionPct: r, meets };
    })
    .sort((a, b) => (b.reductionPct ?? -Infinity) - (a.reductionPct ?? -Infinity));

  const achievers = rows.filter((r) => r.meets);
  const closest = rows.find((r) => r.reductionPct != null) ?? null;
  return { goal, baselineEnergy, rows, achievers, closest };
}

/* ── Rating goals (UK EPC band) ───────────────────────────────────────────────
   An EPC band is a SAP score, and SAP is a running COST rating (heating, hot
   water, lighting at standard prices) - not kWh/m², so it cannot be read off a
   simulation. The estimate is anchored on what IS known: each building's own
   certificate SAP. That SAP is turned back into its energy cost factor (SAP 2012,
   ECF = 0.42·cost/(TFA+45)), the cost factor is scaled by how much the
   simulation says the package cuts the building's fuel use, and turned back
   into a SAP and a band. A building with no certificate SAP starts from the
   middle of its (estimated) band, and is flagged as such. */

const SAP_BANDS: [number, string][] = [[92, "A"], [81, "B"], [69, "C"], [55, "D"], [39, "E"], [21, "F"], [1, "G"]];
const BAND_MID: Record<string, number> = { A: 95, B: 86, C: 75, D: 62, E: 47, F: 30, G: 10 };
export const sapToBand = (sap: number) => SAP_BANDS.find(([t]) => sap >= t)?.[1] ?? "G";
const bandRank = (b: string) => "ABCDEFG".indexOf(b.toUpperCase());

function sapToEcf(sap: number): number {
  return sap <= 51.2 ? Math.pow(10, (117 - sap) / 121) : (100 - sap) / 13.95;
}
function ecfToSap(ecf: number): number {
  return ecf >= 3.5 ? 117 - 121 * Math.log10(ecf) : 100 - 13.95 * ecf;
}

export interface RatingBuildingIn { address: string; lat: number; lon: number; sap: number | null; band: string | null }
export interface RatingPackageIn {
  name: string; color?: string; isBaseline: boolean;
  buildings: { address: string; lat: number; lon: number; totalKwhM2Yr: number | null; totalGasKwh?: number | null }[];
}
export interface RatingCell { sap: number | null; band: string | null; meets: boolean | null }
export interface RatingRow {
  address: string; nowSap: number; nowBand: string;
  /** "certificate" = the building's own EPC SAP; "band" = middle of its band (less certain). */
  from: "certificate" | "band";
  cells: RatingCell[];
}
export interface RatingAssessment {
  goal: ClimateGoal;
  rows: RatingRow[];
  /** One per non-baseline package: how many buildings reach the band, and the median estimated SAP. */
  columns: { label: string; color?: string; met: number; total: number; medianSap: number | null }[];
  /** Buildings already at the target band today, from their certificates. */
  metToday: number;
}

export function assessRating(goal: ClimateGoal, packages: RatingPackageIn[], buildings: RatingBuildingIn[]): RatingAssessment | null {
  const target = goal.targetRating;
  const baseline = packages.find((p) => p.isBaseline);
  const others = packages.filter((p) => !p.isBaseline);
  if (!target || !baseline) return null;
  const same = (a: { lat: number; lon: number; address: string }, b: { lat: number; lon: number; address: string }) =>
    (Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lon - b.lon) < 1e-5) || (!!a.address && a.address === b.address);
  const reaches = (band: string) => bandRank(band) >= 0 && bandRank(band) <= bandRank(target);

  const rows: RatingRow[] = [];
  for (const bb of baseline.buildings) {
    const info = buildings.find((x) => same(x, bb));
    const nowSap = info?.sap ?? (info?.band ? BAND_MID[info.band.toUpperCase()[0]!] : undefined);
    if (nowSap == null || bb.totalKwhM2Yr == null) continue;   // nothing to anchor on
    const ecf0 = sapToEcf(nowSap);
    const cells = others.map((p): RatingCell => {
      const pb = p.buildings.find((x) => same(x, bb));
      if (!pb || pb.totalKwhM2Yr == null) return { sap: null, band: null, meets: null };
      // Gas homes: the boiler's own fuel use is the cost driver SAP rates. Otherwise
      // the simulated total, which also holds appliances SAP leaves out - so the
      // estimate understates the change rather than overstating it.
      const ratio = bb.totalGasKwh && pb.totalGasKwh
        ? pb.totalGasKwh / bb.totalGasKwh
        : pb.totalKwhM2Yr / bb.totalKwhM2Yr;
      const sap = Math.max(1, Math.min(100, Math.round(ecfToSap(ecf0 * Math.max(0.05, Math.min(3, ratio))))));
      const band = sapToBand(sap);
      return { sap, band, meets: reaches(band) };
    });
    rows.push({ address: bb.address, nowSap: Math.round(nowSap), nowBand: sapToBand(nowSap),
                from: info?.sap != null ? "certificate" : "band", cells });
  }
  if (!rows.length) return null;
  const median = (xs: number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
  };
  return {
    goal, rows,
    metToday: rows.filter((r) => reaches(r.nowBand)).length,
    columns: others.map((p, i) => ({
      label: p.name, color: p.color,
      met: rows.filter((r) => r.cells[i]?.meets).length,
      total: rows.length,
      medianSap: median(rows.map((r) => r.cells[i]?.sap).filter((x): x is number => x != null)),
    })),
  };
}
