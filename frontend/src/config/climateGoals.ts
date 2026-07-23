/* City-level climate targets that a renovation package can be measured against.
 *
 * Right now only Gothenburg has a target wired in. The reduction figure and
 * target year are the editable knobs — change them here and both Step 4 and the
 * Step 5 report update, since both read this one config.
 *
 * NOTE: the 30%-by-2030 figure is the target as briefed for this project. Add
 * the precise City-of-Gothenburg source document to `source` / `sourceUrl` when
 * it is confirmed, rather than leaving an unverifiable citation in the UI. */

export interface ClimateGoal {
  /** City this target applies to — matched against project.city. */
  city: string;
  /** Required reduction in energy demand vs the as-built baseline, in percent. */
  reductionPct: number;
  /** Year the target is set for. */
  targetYear: number;
  /** Short attribution shown under the goal statement. */
  source: string;
  sourceUrl?: string;
}

export const CLIMATE_GOALS: ClimateGoal[] = [
  {
    city: "Gothenburg",
    reductionPct: 30,
    targetYear: 2030,
    source: "City of Gothenburg climate target",
  },
];

/** The climate goal for a project's location, or null if none is defined.
 *  Sweden defaults to Gothenburg — the only Swedish city with a full dataset
 *  and a set target — when no other city has been explicitly chosen. */
export function climateGoalFor(city?: string | null, country?: string | null): ClimateGoal | null {
  const byCity = city
    ? CLIMATE_GOALS.find((g) => g.city.toLowerCase() === city.toLowerCase())
    : null;
  if (byCity) return byCity;
  const isSweden = country === "Sweden" || country === "se" || country === "SE";
  if (isSweden && (!city || city.toLowerCase() === "gothenburg")) {
    return CLIMATE_GOALS.find((g) => g.city === "Gothenburg") ?? null;
  }
  return null;
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
  const r = reductionPctOf(baselineEnergy, packageEnergy);
  return r != null && Math.round(r) >= goal.reductionPct;
}

/** The energy demand a package must reach to hit the target: the baseline cut by
 *  the goal's reduction (e.g. 30% off 126 → 88 kWh/m²·yr). */
export function goalTargetEnergy(baselineEnergy: number, goal: ClimateGoal): number {
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
  const rr = Math.round(r);   // compare on the displayed whole percent
  if (rr >= goal.reductionPct + 10) return "exceeds";
  if (rr >= goal.reductionPct) return "meets";
  if (rr > 0) return "below";
  return "worse";
}

export interface GoalPackage {
  label: string;
  color?: string;
  /** The package's simulated total energy demand (kWh/m²·yr). */
  energyUse: number;
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
  const rows: GoalRow[] = packages
    .map((p) => {
      const r = reductionPctOf(baselineEnergy, p.energyUse);
      // Meets-check on the rounded reduction, matching the displayed number.
      return { ...p, reductionPct: r, meets: r != null && Math.round(r) >= goal.reductionPct };
    })
    .sort((a, b) => (b.reductionPct ?? -Infinity) - (a.reductionPct ?? -Infinity));

  const achievers = rows.filter((r) => r.meets);
  const closest = rows.find((r) => r.reductionPct != null) ?? null;
  return { goal, baselineEnergy, rows, achievers, closest };
}
