/**
 * Retrofit prioritization — hybrid expert-rule + MCDA (Multi-Criteria Decision Analysis).
 *
 * Each building is scored 0–100 (higher = higher retrofit priority) under four
 * criterion groups, then combined into one weighted priority score:
 *
 *     P = wE·E + wF·F + wC·C + wR·R      (weights normalised to sum 1)
 *
 *   E  Energy performance     — energy use / EPC class (worse ⇒ higher priority)
 *   F  Façade / envelope      — ML defect load, or building-age proxy
 *   C  Building characteristics— vintage + heated size (older/larger ⇒ higher)
 *   R  Retrofit potential     — energy headroom + envelope poorness + scale
 *
 * Sub-scores are expert rules (transparent, benchmarked thresholds). Weights are
 * either set directly or derived from expert pairwise judgements via AHP. Every
 * sub-score carries a confidence (data availability) so uncertainty is explicit.
 *
 * All maths is intentionally light so it runs instantly over hundreds/thousands
 * of buildings on the client, and each number is explainable back to the user.
 */
import type { BuildingRecord } from "../types";
import type { FacadeDefectSummary } from "../store/wizard";

export type CriterionKey = "E" | "F" | "C" | "R";
export interface CriterionWeights { E: number; F: number; C: number; R: number; }

export const DEFAULT_WEIGHTS: CriterionWeights = { E: 0.35, F: 0.30, C: 0.15, R: 0.20 };
export const WEIGHT_PRESETS: Record<string, CriterionWeights> = {
  "Balanced (default)": { E: 0.35, F: 0.30, C: 0.15, R: 0.20 },
  "Energy-first":       { E: 0.55, F: 0.15, C: 0.10, R: 0.20 },
  "Condition-first":    { E: 0.20, F: 0.50, C: 0.15, R: 0.15 },
  "Cost-effectiveness": { E: 0.25, F: 0.15, C: 0.10, R: 0.50 },
};

export const CRITERION_LABELS: Record<CriterionKey, string> = {
  E: "Energy performance",
  F: "Façade / envelope condition",
  C: "Building characteristics",
  R: "Retrofit potential",
};
export const CRITERION_COLORS: Record<CriterionKey, string> = {
  E: "#E8880C", F: "#E2483B", C: "#4A90E2", R: "#2FB477",
};

export interface SubScore { value: number; confidence: number; note: string; available: boolean; }
export interface PriorityResult {
  key: string;
  label: string;
  row: BuildingRecord;
  P: number;                              // 0–100 composite priority
  scores: Record<CriterionKey, SubScore>;
  confidence: number;                     // 0–1 weighted data confidence
  drivers: string[];                      // top human-readable reasons
}

/* ── helpers ───────────────────────────────────────────────────────────────── */
const num = (v: unknown): number | null =>
  (typeof v === "number" && isFinite(v)) ? v : null;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lin = (x: number, lo: number, hi: number) => clamp01((x - lo) / (hi - lo)) * 100;
function wAvg(parts: number[], weights: number[]): number {
  const s = weights.reduce((a, b) => a + b, 0) || 1;
  return parts.reduce((acc, p, i) => acc + p * weights[i]!, 0) / s;
}

/** kWh/m²·yr implied by an EPC letter when the metered value is missing. */
function classEnergy(cls: string | null | undefined): number | null {
  const c = (cls || "").trim().toUpperCase()[0];
  const map: Record<string, number> = { A: 55, B: 85, C: 105, D: 135, E: 165, F: 200, G: 240 };
  return c && c in map ? map[c]! : null;
}

/** Heated floor area proxy (Atemp preferred, else footprint × floors). */
export function heatedArea(b: BuildingRecord): number | null {
  const a = num(b.atemp);
  if (a && a > 0) return a;
  const fp = num(b.footprint_m2);
  const fl = num(b.floors) ?? 1;
  return fp && fp > 0 ? fp * Math.max(1, fl) : null;
}

/* ── criterion sub-scores (expert rules) ───────────────────────────────────── */

/** E — worse energy performance ⇒ higher priority. */
function scoreEnergy(b: BuildingRecord): SubScore {
  const e = num(b.energy_kwh_m2);
  if (e != null) {
    // Swedish residential rule of thumb: ≤60 excellent, ≥250 very poor.
    return { value: lin(e, 60, 250), confidence: 1, note: `${Math.round(e)} kWh/m²·yr`, available: true };
  }
  const c = (b.epc_class || "").trim().toUpperCase()[0];
  const map: Record<string, number> = { A: 8, B: 22, C: 35, D: 50, E: 66, F: 83, G: 100 };
  if (c && c in map) return { value: map[c]!, confidence: 0.7, note: `EPC ${c} (no metered kWh)`, available: true };
  return { value: 50, confidence: 0, note: "no energy data", available: true };
}

// Structural defects (crack/bulge) weigh more than surface issues.
const DEFECT_SEVERITY: Record<string, number> = {
  crack: 1.0, bulge: 1.0, corrosion: 0.75, abscission: 0.75, leakage: 0.6,
};

/** F — poorer envelope condition ⇒ higher priority. Available ONLY once a building
 *  has been inspected (façade photos analysed). Before that F is left out of the
 *  score entirely and the other criteria are re-weighted (per user preference). */
function scoreFacade(summary: FacadeDefectSummary | undefined): SubScore {
  if (summary && summary.imageCount > 0) {
    let load = 0;
    for (const [k, c] of Object.entries(summary.byClass)) load += (DEFECT_SEVERITY[k] ?? 0.75) * c;
    // Saturating curve: a handful of severe defects already means "bad".
    const value = (1 - Math.exp(-load / 4)) * 100;
    const note = summary.defectCount > 0
      ? `${summary.defectCount} defect${summary.defectCount === 1 ? "" : "s"} in ${summary.imageCount} photo${summary.imageCount === 1 ? "" : "s"}`
      : `inspected — no defects (${summary.imageCount} photo${summary.imageCount === 1 ? "" : "s"})`;
    return { value, confidence: 1, note, available: true };
  }
  return { value: 0, confidence: 0, note: "not inspected — add façade photos", available: false };
}

const ageScoreOf = (y: number) => (y < 1945 ? 85 : y < 1976 ? 78 : y < 1991 ? 55 : y < 2006 ? 32 : 15);

/** C — older + larger buildings score higher (more impact / more likely dated). */
function scoreBuilding(b: BuildingRecord, sizePct: number | null): SubScore {
  const y = num(b.year_built);
  const ageS = y != null ? ageScoreOf(y) : 50;
  const sizeS = sizePct != null ? sizePct * 100 : 50;
  const value = 0.6 * ageS + 0.4 * sizeS;
  const confidence = (y != null ? 0.5 : 0) + (sizePct != null ? 0.5 : 0);
  const bits: string[] = [];
  if (y != null) bits.push(`built ${y}`);
  if (sizePct != null) bits.push(`size p${Math.round(sizePct * 100)}`);
  return { value, confidence, note: bits.join(", ") || "characteristics n/a", available: true };
}

/** R — bigger expected benefit ⇒ higher priority (headroom × envelope × scale). */
function scoreRetrofit(b: BuildingRecord, sizePct: number | null): SubScore {
  const eMetered = num(b.energy_kwh_m2);
  const e = eMetered ?? classEnergy(b.epc_class);
  const headroom = e != null ? Math.max(0, e - 70) : null;  // kWh/m² above a good target
  const intensity = headroom != null ? lin(headroom, 0, 180) : 50;

  const u = num(b.u_wall);
  const uPoor = u != null ? lin(u, 0.15, 1.0) : null;

  const parts = [intensity]; const w = [0.6];
  if (uPoor != null) { parts.push(uPoor); w.push(0.25); }
  if (sizePct != null) { parts.push(sizePct * 100); w.push(0.15); }
  const value = wAvg(parts, w);

  let confidence = eMetered != null ? 0.6 : (b.epc_class ? 0.4 : 0);
  if (u != null) confidence += 0.2;
  if (sizePct != null) confidence += 0.2;
  confidence = Math.min(1, confidence);
  return {
    value,
    confidence,
    note: headroom != null ? `~${Math.round(headroom)} kWh/m² savings headroom` : "potential n/a",
    available: true,
  };
}

/* ── composite ranking ─────────────────────────────────────────────────────── */
export function normalizeWeights(w: CriterionWeights): CriterionWeights {
  const s = (w.E + w.F + w.C + w.R) || 1;
  return { E: w.E / s, F: w.F / s, C: w.C / s, R: w.R / s };
}

export interface PriorityInput { key: string; label: string; row: BuildingRecord; }

/** Stable per-building key (cadastral id, else normalised address, else index),
 *  de-duplicated. MUST match the key the façade panel writes `facadeDefects` under
 *  so the F criterion picks up each building's inspection. */
export function makeBuildingKeys(rows: { address: string | null; cadastral_id?: string | null }[]): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const seen = new Set<string>();
  return rows.map((b, i) => {
    let key = (b.cadastral_id && b.cadastral_id.trim()) || norm(b.address ?? "") || `bldg-${i}`;
    while (seen.has(key)) key = `${key}-${i}`;
    seen.add(key);
    return key;
  });
}

export function computePriorities(
  items: PriorityInput[],
  facadeDefects: Record<string, FacadeDefectSummary>,
  weightsRaw: CriterionWeights,
): PriorityResult[] {
  const w = normalizeWeights(weightsRaw);

  // Size percentile across the current selection (min–max over available areas).
  const areas = items.map(it => heatedArea(it.row));
  const known = areas.filter((a): a is number => a != null);
  const lo = known.length ? Math.min(...known) : 0;
  const hi = known.length ? Math.max(...known) : 1;
  const sizePctOf = (a: number | null) => (a == null ? null : (hi > lo ? (a - lo) / (hi - lo) : 0.5));

  const results = items.map((it, i) => {
    const sizePct = sizePctOf(areas[i]!);
    const scores: Record<CriterionKey, SubScore> = {
      E: scoreEnergy(it.row),
      F: scoreFacade(facadeDefects[it.key]),
      C: scoreBuilding(it.row, sizePct),
      R: scoreRetrofit(it.row, sizePct),
    };

    // Only criteria with data contribute; their weights are re-normalised so the
    // composite stays comparable (e.g. an un-inspected building drops F and its
    // 30% is spread across E/C/R).
    const availKeys = (["E", "F", "C", "R"] as CriterionKey[]).filter(k => scores[k].available);
    const wSum = availKeys.reduce((a, k) => a + w[k], 0) || 1;
    const eff: Record<CriterionKey, number> = { E: 0, F: 0, C: 0, R: 0 };
    availKeys.forEach(k => { eff[k] = w[k] / wSum; });

    const P = availKeys.reduce((a, k) => a + eff[k] * scores[k].value, 0);
    const confidence = availKeys.reduce((a, k) => a + eff[k] * scores[k].confidence, 0);

    // Drivers = available criteria with the biggest weighted contribution to P.
    const contrib = availKeys
      .map(k => ({ k, c: eff[k] * scores[k].value }))
      .sort((a, b) => b.c - a.c);
    const drivers = contrib.slice(0, 2)
      .filter(d => d.c > 0)
      .map(d => `${CRITERION_LABELS[d.k]}: ${scores[d.k].note}`);

    return { key: it.key, label: it.label, row: it.row, P, scores, confidence, drivers };
  });

  results.sort((a, b) => b.P - a.P);
  return results;
}

/* ── AHP: derive weights from pairwise expert judgements ───────────────────── */
// Saaty 1–9 scale. `pair[a>b]` holds how many times more important a is than b
// (reciprocal implied for the mirror). Geometric-mean priority + consistency ratio.
const AHP_ORDER: CriterionKey[] = ["E", "F", "C", "R"];
const RI_N4 = 0.90; // random consistency index for a 4×4 matrix

export interface AhpResult { weights: CriterionWeights; lambdaMax: number; CI: number; CR: number; consistent: boolean; }

/** pairs: keyed `${i}>${j}` for i before j in AHP_ORDER, value on Saaty scale
 *  (>1 ⇒ i more important than j, <1 ⇒ j more important). */
export function ahpWeights(pairs: Record<string, number>): AhpResult {
  const n = AHP_ORDER.length;
  const A: number[][] = AHP_ORDER.map((ri, i) =>
    AHP_ORDER.map((rj, j) => {
      if (i === j) return 1;
      if (i < j) return pairs[`${ri}>${rj}`] ?? 1;
      return 1 / (pairs[`${rj}>${ri}`] ?? 1);
    }),
  );
  const gm = A.map(row => Math.pow(row.reduce((p, x) => p * x, 1), 1 / n));
  const gsum = gm.reduce((a, b) => a + b, 0) || 1;
  const wv = gm.map(x => x / gsum);
  // λmax from A·w ./ w
  const Aw = A.map(row => row.reduce((acc, x, j) => acc + x * wv[j]!, 0));
  const lambdaMax = Aw.reduce((acc, x, i) => acc + x / wv[i]!, 0) / n;
  const CI = (lambdaMax - n) / (n - 1);
  const CR = CI / RI_N4;
  return {
    weights: { E: wv[0]!, F: wv[1]!, C: wv[2]!, R: wv[3]! },
    lambdaMax, CI, CR, consistent: CR <= 0.1,
  };
}
