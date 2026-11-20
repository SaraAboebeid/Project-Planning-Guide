/* ─── Step 4 — which components each building needs, and why ────────────────
   Replaces the Step 1 component question: instead of the user guessing the
   scope up front, it follows from what Steps 1–2 found out about the buildings.

   Per building and component, three kinds of evidence:
     1. Age vs technical service life (IVL, serviceLifeSE.ts). Age counts from
        the last renovation the user recorded in Step 2, else from construction —
        in which case the part is only *likely* original, and the text says so.
     2. Façade defects from the Step 2 photo inspection (walls only).
     3. Energy: the part's U-value against BBR 9:92 (Sweden only — the targets
        are Swedish law).
   Condition evidence (1, 2) can make a part "needed"; energy alone only ever
   makes it "worth considering" — a poor U-value is an opportunity, not a defect.
   Height adds a note, not a verdict: tall façades cost more per m² to work on. */

// Poseidon copy of frontend/src/utils/renovationRecommendations.ts (see ./types.ts).
import { COMPONENT_LIFE, BBR_RENOVATION_U, type ComponentLife } from "./serviceLifeSE";
import type { BuildingHistory, FacadeDefectSummary } from "./types";

/** The components Step 4 assesses. Vertical extension is a strategy, not a
 *  condition question, so it is offered separately as opt-in. */
export const ASSESSED_COMPONENTS = ["Walls", "Windows", "Roof", "Floor", "Heating system"] as const;
export const OPTIONAL_COMPONENTS = ["Vertical Extension (New Floor)"] as const;

export type RecLevel = "needed" | "consider" | "ok" | "unknown";

/** A reason is an i18n key (English text with {params}) plus its values, so
 *  the panel translates it — the same convention as t() everywhere else. */
export interface RecReason {
  level: RecLevel | "info";
  msg: string;
  params?: Record<string, string | number>;
}

export interface RecBuilding {
  key: string;            // makeBuildingKeys key — same as facadeDefects / buildingHistory
  label: string;
  yearBuilt: number | null;
  floors: number | null;
  heightM: number | null;
  /** U-values by component, W/m²K. Mostly typical-for-era (TABULA), not measured. */
  u: Partial<Record<string, number | null>>;
}

export interface BuildingComponentRec {
  key: string;
  label: string;
  level: RecLevel;
  reasons: RecReason[];
}

export interface ComponentRec {
  component: string;
  level: RecLevel;
  counts: Record<RecLevel, number>;
  buildings: BuildingComponentRec[];
  /** In scope unless the user overrides it. */
  defaultInclude: boolean;
  life: ComponentLife | null;
}

const RANK: Record<RecLevel, number> = { needed: 3, consider: 2, unknown: 1, ok: 0 };
const worst = (a: RecLevel, b: RecLevel): RecLevel => (RANK[b] > RANK[a] ? b : a);

// Façade work above this needs tall scaffolding or lifts.
const TALL_FLOORS = 5;
const TALL_HEIGHT_M = 15;

/** Most recent recorded renovation of `component`, or null. */
export function lastRenovationYear(history: BuildingHistory | undefined, component: string): number | null {
  const ys = (history?.renovations ?? []).filter((r) => r.component === component).map((r) => r.year);
  return ys.length ? Math.max(...ys) : null;
}

/** The newest recorded renovation of `component` that states a U-value. */
export function lastRenovationU(history: BuildingHistory | undefined, component: string): { year: number; u: number } | null {
  const withU = (history?.renovations ?? []).filter((r) => r.component === component && r.uValue != null);
  if (!withU.length) return null;
  const r = withU.reduce((a, b) => (b.year > a.year ? b : a));
  return { year: r.year, u: r.uValue! };
}

/** What the simulation should take as today's U-values: the user's recorded
 *  renovations, in the backend's part names (BatchBuildingSpec.recorded_u). */
export function recordedUForSimulation(history: BuildingHistory | undefined): Record<string, number> | undefined {
  const parts: [string, string][] = [["Walls", "wall"], ["Roof", "roof"], ["Windows", "win"], ["Floor", "floor"]];
  const out: Record<string, number> = {};
  for (const [component, part] of parts) {
    const r = lastRenovationU(history, component);
    // Only when the U-valued renovation is also the latest one: a later
    // renovation without a U leaves today's value unknown, not the old one.
    if (r && r.year === lastRenovationYear(history, component)) out[part] = r.u;
  }
  return Object.keys(out).length ? out : undefined;
}

function ageReasons(component: string, b: RecBuilding, history: BuildingHistory | undefined, nowYear: number): RecReason[] {
  const life = COMPONENT_LIFE[component];
  if (!life) return [];
  const renovated = lastRenovationYear(history, component);
  const since = renovated ?? b.yearBuilt;
  if (since == null) {
    return [{ level: "unknown", msg: "No construction year or recorded renovation, so its age is unknown." }];
  }
  const age = Math.max(0, nowYear - since);
  const base = renovated != null
    ? { msg: "Renovated {year}, {age} years ago.", params: { year: renovated, age } }
    : { msg: "Likely original (built {year}), {age} years old.", params: { year: since, age } };

  if (life.minYears == null) {
    // IVL only says "beyond 50 years" for these, so 50 is all the table supports.
    return age >= 50
      ? [{ level: "consider", msg: `${base.msg} Beyond the 50-year period the service-life table covers — have it inspected.`, params: base.params }]
      : [{ level: "ok", msg: `${base.msg} Within its expected life (more than 50 years).`, params: base.params }];
  }
  const max = life.maxYears ?? life.minYears;
  if (age >= max) {
    return [{ level: "needed", msg: `${base.msg} Past its expected life of about {life} years.`, params: { ...base.params, life: max } }];
  }
  if (age >= life.minYears) {
    return [{ level: "consider", msg: `${base.msg} Reaching the end of its expected life ({min}–{max} years).`, params: { ...base.params, min: life.minYears, max } }];
  }
  return [{ level: "ok", msg: `${base.msg} Within its expected life of about {life} years.`, params: { ...base.params, life: max } }];
}

const DEFECT_LABEL: Record<string, string> = {
  crack: "cracks", leakage: "leakage", abscission: "spalling", corrosion: "corrosion", bulge: "bulging",
};

function facadeReasons(defects: FacadeDefectSummary | undefined): RecReason[] {
  if (!defects || defects.imageCount === 0) return [];
  if (defects.defectCount === 0) {
    return [{ level: "ok", msg: "No façade defects found in {n} photos.", params: { n: defects.imageCount } }];
  }
  const list = Object.entries(defects.byClass)
    .filter(([, n]) => n > 0)
    .map(([c, n]) => `${DEFECT_LABEL[c] ?? c} ×${n}`)
    .join(", ");
  const aiOnly = Object.values(defects.aiByClass ?? {}).reduce((s, n) => s + n, 0);
  // AI-vision-only boxes are the less reliable half of the fusion (see
  // FacadeDefectPanel) — enough to look closer, not to declare the façade failed.
  return aiOnly >= defects.defectCount
    ? [{ level: "consider", msg: "Possible façade defects ({list}), seen only by AI vision — check on site.", params: { list } }]
    : [{ level: "needed", msg: "Façade defects found in Step 2: {list}.", params: { list } }];
}

function energyReasons(component: string, b: RecBuilding, history: BuildingHistory | undefined): RecReason[] {
  const target = BBR_RENOVATION_U[component];
  // A recorded U stands on its own, even where the dataset has none.
  const u = b.u[component] ?? lastRenovationU(history, component)?.u;
  if (target == null || u == null || !(u > 0)) return [];
  // The dataset's U-value is typical for the construction era, so it describes
  // the part as built — not the one fitted at a later renovation. A U the user
  // recorded with the renovation replaces it.
  const renovated = lastRenovationYear(history, component);
  const recorded = lastRenovationU(history, component);
  let current = u;
  let fromRecord = false;
  if (renovated != null) {
    if (!recorded || recorded.year !== renovated) {
      return [{ level: "info", msg: "U-value after the {year} renovation is not known — the dataset's {u} W/m²K is typical for the original construction. Add it in Step 2.",
        params: { year: renovated, u: u.toFixed(2) } }];
    }
    current = recorded.u;
    fromRecord = true;
  }
  const ratio = current / target;
  const params = { u: current.toFixed(2), target: target.toFixed(2), year: renovated ?? "" };
  if (fromRecord) {
    if (ratio >= 2) return [{ level: "consider", msg: "U-value {u} W/m²K since the {year} renovation, against the BBR target of {target} — a large energy saving is still possible.", params }];
    if (ratio >= 1.3) return [{ level: "consider", msg: "U-value {u} W/m²K since the {year} renovation, against the BBR target of {target} — some energy saving is still possible.", params }];
    return [{ level: "ok", msg: "U-value {u} W/m²K since the {year} renovation, already close to the BBR target of {target}.", params }];
  }
  if (ratio >= 2) return [{ level: "consider", msg: "U-value ≈ {u} W/m²K against the BBR target of {target} — a large energy saving is possible.", params }];
  if (ratio >= 1.3) return [{ level: "consider", msg: "U-value ≈ {u} W/m²K against the BBR target of {target} — some energy saving is possible.", params }];
  return [{ level: "ok", msg: "U-value ≈ {u} W/m²K, already close to the BBR target of {target}.", params }];
}

function heightReasons(component: string, b: RecBuilding): RecReason[] {
  if (component !== "Walls") return [];
  const tall = (b.floors ?? 0) >= TALL_FLOORS || (b.heightM ?? 0) >= TALL_HEIGHT_M;
  if (!tall) return [];
  return [{ level: "info", msg: b.floors
    ? "{n} floors: façade work needs tall scaffolding or lifts, which raises the cost per m²."
    : "About {h} m tall: façade work needs tall scaffolding or lifts, which raises the cost per m².",
    params: b.floors ? { n: b.floors } : { h: Math.round(b.heightM ?? 0) } }];
}

export function recommendComponents(
  buildings: RecBuilding[],
  facadeDefects: Record<string, FacadeDefectSummary>,
  history: Record<string, BuildingHistory>,
  opts: { useBbrTargets: boolean; nowYear?: number },
): ComponentRec[] {
  const nowYear = opts.nowYear ?? new Date().getFullYear();
  return ASSESSED_COMPONENTS.map((component) => {
    const perBuilding: BuildingComponentRec[] = buildings.map((b) => {
      const h = history[b.key];
      const reasons: RecReason[] = [
        ...(component === "Walls" ? facadeReasons(facadeDefects[b.key]) : []),
        ...ageReasons(component, b, h, nowYear),
        ...(opts.useBbrTargets ? energyReasons(component, b, h) : []),
        ...heightReasons(component, b),
      ];
      // "unknown" only when nothing else was learned: a known U-value or a
      // photo inspection is evidence even when the age is not.
      const verdicts = reasons.filter((r): r is RecReason & { level: RecLevel } => r.level !== "info");
      const known = verdicts.filter((r) => r.level !== "unknown");
      const level = (known.length ? known : verdicts).reduce<RecLevel>((acc, r) => worst(acc, r.level), known.length ? "ok" : "unknown");
      return { key: b.key, label: b.label, level, reasons };
    });
    const counts: Record<RecLevel, number> = { needed: 0, consider: 0, ok: 0, unknown: 0 };
    perBuilding.forEach((r) => { counts[r.level] += 1; });
    const level = perBuilding.reduce<RecLevel>((acc, r) => worst(acc, r.level), buildings.length ? "ok" : "unknown");
    // With no evidence at all, keep the envelope parts the tool always assumed
    // (walls, roof, windows) rather than silently dropping them.
    const defaultInclude = level === "needed" || level === "consider"
      || (level === "unknown" && ["Walls", "Roof", "Windows"].includes(component));
    return { component, level, counts, buildings: perBuilding, defaultInclude, life: COMPONENT_LIFE[component] ?? null };
  });
}

/** The components in scope: the recommendation, overridden by the user's choices. */
export function effectiveScope(recs: ComponentRec[], overrides: Record<string, boolean>): string[] {
  const assessed = recs.filter((r) => overrides[r.component] ?? r.defaultInclude).map((r) => r.component);
  const optional = OPTIONAL_COMPONENTS.filter((c) => overrides[c] === true);
  return [...assessed, ...optional];
}
