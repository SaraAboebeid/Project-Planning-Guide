/* The renovation-priority ranking, shared by the Renovation Wizard and the 3D
   viewer's "Renovation priority" colouring so both always show the same score.
   Method: the planner's computePriorities (src/planner/retrofitPriority.ts),
   with E = EPSM RC space heating per m². */
import type { Row } from "./useStock";
import type { BuildingRecord } from "./planner/types";
import {
  DEFAULT_WEIGHTS, WEIGHT_PRESETS, ahpWeights, computePriorities, normalizeWeights,
  type AhpResult, type CriterionWeights, type EnergyScale, type PriorityResult,
} from "./planner/retrofitPriority";

/* E: 40 kWh/m²·yr ≈ renovated to today's standard → 0; 140 ≈ the worst 5 % of
   the Poseidon stock (p95 = 131 after the floors/height check, 2026-11-19) → 100. */
export const E_LO = 40, E_HI = 140;

/* Walls, roof or windows on a national default. The floor is left out: no open
   data has floor U, so it is a default almost everywhere and would flag (and
   down-weight) every building alike. */
export const hasDefaultU = (r: Row) => (["wall", "roof", "win"] as const).some((p) => r.rc?.u_source?.[p] === "default");

export type WeightMode = "preset" | "manual" | "ahp";
export interface WeightSettings { mode: WeightMode; preset: string; manual: CriterionWeights; pairs: Record<string, number> }
export const DEFAULT_WEIGHT_SETTINGS: WeightSettings = {
  mode: "preset", preset: "Balanced (default)", manual: DEFAULT_WEIGHTS, pairs: { "E>F": 1, "E>C": 2, "F>C": 2 },
};

/** The weights in use for saved settings (and the AHP result behind them). */
export function weightsFrom(ws: WeightSettings): { weights: CriterionWeights; ahp: AhpResult } {
  const ahp = ahpWeights(ws.pairs);
  const weights = ws.mode === "ahp" ? ahp.weights
    : ws.mode === "manual" ? normalizeWeights(ws.manual) : (WEIGHT_PRESETS[ws.preset] ?? DEFAULT_WEIGHTS);
  return { weights, ahp };
}

/** Rank table rows, highest priority first. `eSuffix` labels E in the reasons. */
export function rankRows(rows: Row[], weights: CriterionWeights, eSuffix: string): { p: PriorityResult; r: Row }[] {
  const conf = new WeakMap<BuildingRecord, number>();
  const rowOf = new Map<string, Row>();
  const items = rows.map((r) => {
    rowOf.set(r.id, r);
    const rec: BuildingRecord = {
      address: r.b.addr, lat: Number(r.id.split(",")[0]), lon: Number(r.id.split(",")[1]),
      year_built: r.b.year ?? null, floors: Number(r.v.floors) || null, atemp: r.b.atemp ?? null,
      footprint_m2: Number(r.v.footprint_m2) || null,
      // An outline that cannot be this building gives a meaningless kWh/m²: no E
      // (the planner's "no energy data" path) rather than a false top rank.
      energy_kwh_m2: r.rc && !r.rc.error && r.rc.geometry !== "outline_mismatch" ? r.rc.heating_kwh_m2_yr ?? null : null,
      epc_class: r.b.eclass ?? null,
    };
    // How far to trust the modelled heating: an outline that can't be this
    // building (Atemp mismatch) barely; floors/height rebuilt from Atemp, or
    // national default U-values, somewhat less than real data.
    const g = r.rc?.geometry ?? "ok";
    conf.set(rec, g === "outline_mismatch" ? 0.2 : Math.min(hasDefaultU(r) ? 0.6 : 1, g !== "ok" ? 0.8 : 1));
    return { key: r.id, label: r.b.addr ?? r.id, row: rec };
  });
  const facade = Object.fromEntries(rows.filter((r) => r.facade).map((r) => [r.id, r.facade!]));
  const scale: EnergyScale = { lo: E_LO, hi: E_HI, suffix: eSuffix, confidenceOf: (b) => conf.get(b) ?? 1 };
  return computePriorities(items, facade, weights, scale).map((p) => ({ p, r: rowOf.get(p.key)! }));
}
