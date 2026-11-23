/* Life-cycle analysis of renovation packages for the Renovation Wizard: the
   main planner's methods applied per building and across the portfolio.

   A PACKAGE = one catalogue measure (or none) per envelope part + a heating
   system. For each building and package:
     heat     useful space heat after the envelope measures — EPSM RC when it has
              been run for exactly these U-values, otherwise the degree-day
              estimate anchored on the building's own RC baseline (the same
              equations as the main planner's /api/optimize, backend/main.py)
     energy   delivered = (space heat + hot water) / seasonal efficiency of the
              heating system (planner/hvacSystems.ts, copied from the planner)
     money    investment (catalogue price × part area, heating plant sized on the
              heat demand AFTER the envelope measures) + replacements within the
              study period (IVL service lives) + O&M + energy bills, discounted:
              life-cycle cost (LCC) over STUDY_PERIOD_YR
     carbon   embodied A1–A3 of the measures (+ replacements, B4) and operational
              carbon of the delivered energy over the study period
     climate  Gothenburg's goal as Poseidon's owner group applies it: primary
              energy number (PET, BBR weighting factors) ≤ 84 kWh/m² for homes,
              and the city's −30 % (scored against this building's baseline)

   The optimiser enumerates every package per building (each part: keep, or one
   of its non-dominated catalogue options) × every heating system and keeps the
   Pareto front over (LCC, life-cycle carbon, energy). Regret analysis compares
   portfolio strategies under energy-price scenarios (the main planner's
   regretAnalysis.ts decision rules, generalised to mixed energy carriers).
   Every assumption is listed in ASSUMPTIONS with its source. */
import { CARRIERS, GOTHENBURG_EFLH, HVAC_SYSTEMS, type HvacSystem } from "./planner/hvacSystems";
import { measureLifeYears, replacementsWithin } from "./planner/serviceLifeSE";
import { CATALOGUE, MEASURE_BY_CODE, MEASURE_COMPONENTS, type Measure, type MeasureComponent } from "./catalogue";
import type { RcRes } from "./rc";

/* ── assumptions (each with its source; the same values as the main planner) ── */
export const ASSUMPTIONS = {
  studyPeriodYr: { value: 50, source: "Study period of every life-cycle figure in the main planner (optimizationAssumptions.ts)" },
  discountRate: { value: 0.03, source: "EU cost-optimal framework (Delegated Reg. 244/2012), real rate; applied by Boverket for building energy LCC" },
  degreeDays: { value: 3300, source: "Heating degree-days, Gothenburg (Eurostat nrg_chdd; national SE 4 919 in 2022, the coast is milder) — provisional, as in the main planner" },
  eflh: { value: GOTHENBURG_EFLH, source: "Equivalent full-load hours, Gothenburg climate — sizes heat pumps from annual heat demand (planner hvacSystems.ts)" },
  petWeights: { value: { district_heating: 0.7, electricity: 1.8, biomass: 0.6 }, source: "BBR 9:2 weighting factors for the primary energy number (PET)" },
  petGoal: { value: 84, source: "Göteborgs Stad miljö- och klimatprogram 2021–2030: the city's housing companies translate the −30 % goal into 84 kWh/m² PET for homes" },
  cityCutPct: { value: 30, source: "Göteborgs Stad: primary energy use in homes and premises −30 % by 2030 vs 2010 (city-wide, per inhabitant)" },
};
const N = ASSUMPTIONS.studyPeriodYr.value;
const R = ASSUMPTIONS.discountRate.value;
const F_DH = (24 * ASSUMPTIONS.degreeDays.value) / 1000;          // kWh per (W/K) per year
export const annuityFactor = (r = R, n = N) => (r <= 0 ? n : (1 - Math.pow(1 + r, -n)) / r);
const AF = annuityFactor();
const pv = (amount: number, year: number) => amount / Math.pow(1 + R, year);

export type CarrierKey = "district_heating" | "electricity" | "biomass";
export type Prices = Record<CarrierKey, number>;                 // SEK per delivered kWh
export const DEFAULT_PRICES: Prices = {
  district_heating: CARRIERS.district_heating.tariffSek,
  electricity: CARRIERS.electricity.tariffSek,
  biomass: CARRIERS.biomass.tariffSek,
};
export const CARBON: Record<CarrierKey, number> = {
  district_heating: CARRIERS.district_heating.carbonKgPerKwh,
  electricity: CARRIERS.electricity.carbonKgPerKwh,
  biomass: CARRIERS.biomass.carbonKgPerKwh,
};
export const HEATING_SYSTEMS: HvacSystem[] = HVAC_SYSTEMS;
export const BASE_SYSTEM = "dh_keep";

/** Energy-price futures for the regret analysis: the main planner's Low / Medium /
 *  High (×0.5 / ×1 / ×2 on today's price), plus one where only electricity gets
 *  dearer — the case that decides between district heating and heat pumps. */
export const PRICE_SCENARIOS: { key: string; label: string; mult: Prices }[] = [
  { key: "low", label: "Prices ×0.5", mult: { district_heating: 0.5, electricity: 0.5, biomass: 0.5 } },
  { key: "base", label: "Today's prices", mult: { district_heating: 1, electricity: 1, biomass: 1 } },
  { key: "high", label: "Prices ×2", mult: { district_heating: 2, electricity: 2, biomass: 2 } },
  { key: "el", label: "Electricity ×2", mult: { district_heating: 1, electricity: 2, biomass: 1 } },
];
export const scaled = (p: Prices, m: Prices): Prices =>
  ({ district_heating: p.district_heating * m.district_heating, electricity: p.electricity * m.electricity, biomass: p.biomass * m.biomass });

/* ── a building, as the analysis sees it ── */
const PART_KEY: Record<MeasureComponent, "wall" | "win" | "roof" | "floor"> = { Walls: "wall", Windows: "win", Roof: "roof", Floor: "floor" };
export interface BuildingModel {
  id: string; address: string;
  areaM2: number;                                    // heated floor area the RC model used
  heat0: number;                                     // RC space heat today, kWh/yr
  dhw: number;                                       // RC hot water, kWh/yr
  partArea: Record<MeasureComponent, number>;        // m² each measure is costed on
  u0: Record<MeasureComponent, number | null>;       // U today (what RC used)
  k: number;                                         // degree-day scaling so the curve passes through RC
}
export function buildingModel(id: string, address: string, rc: RcRes | null): BuildingModel | null {
  if (!rc || rc.error || !rc.heating_kwh || !rc.floor_area_m2) return null;
  const partArea: Record<MeasureComponent, number> = {
    Walls: rc.wall_area_m2 ?? 0, Windows: rc.window_area_m2 ?? 0, Roof: rc.roof_area_m2 ?? 0, Floor: rc.roof_area_m2 ?? 0,
  };
  const u0 = Object.fromEntries(MEASURE_COMPONENTS.map((c) => [c, rc.u_used?.[PART_KEY[c]] ?? null])) as Record<MeasureComponent, number | null>;
  // Same anchoring as backend optimize(): the steady-state H·HDD loss is scaled so
  // that "change nothing" reproduces RC's simulated heating exactly.
  const trans0 = MEASURE_COMPONENTS.reduce((s, c) => s + partArea[c] * (u0[c] ?? 0), 0) * F_DH;
  const k = trans0 > rc.heating_kwh ? rc.heating_kwh / trans0 : 1;
  return { id, address, areaM2: rc.floor_area_m2, heat0: rc.heating_kwh, dhw: rc.dhw_kwh ?? 0, partArea, u0, k };
}

/** Space heat after giving some parts new U-values (degree-day, anchored on RC). */
export function ddHeat(bm: BuildingModel, u: Partial<Record<MeasureComponent, number>>): number {
  let saved = 0;
  for (const c of MEASURE_COMPONENTS) {
    const nu = u[c], ou = bm.u0[c];
    if (nu != null && ou != null) saved += bm.k * F_DH * bm.partArea[c] * (ou - nu);
  }
  return Math.max(0, bm.heat0 - saved);
}

/* ── one package ── */
export type Envelope = Partial<Record<MeasureComponent, string>>;   // part → measure code ("" / missing = keep)
export interface Package { envelope: Envelope; heating: string }

/** Cost and carbon of one measure on one building: initial + replacements (B4). */
function measureLife(m: Measure, area: number) {
  const life = measureLifeYears(m.component, m.label).years;
  const reps = replacementsWithin(N, life);
  const cost = m.costPerM2 * area;
  const co2 = (m.co2PerM2 ?? 0) * area;
  return { cost, co2, replCostPV: reps.reduce((s, y) => s + pv(cost, y), 0), replCo2: co2 * reps.length, co2Known: m.co2PerM2 != null };
}

/** Heating plant: capex sized on the space heat it will actually serve, O&M,
 *  replacements within the period (the GSHP ground loop outlasts it). */
function plant(sys: HvacSystem, heatKwh: number) {
  const designKw = heatKwh / ASSUMPTIONS.eflh.value;
  const replaceable = sys.capexFixedSek + sys.capexPerKwSek * designKw;
  const capex = replaceable + (sys.groundLoopPerKwSek ?? 0) * designKw;
  const replPV = replacementsWithin(N, sys.lifetimeYr).reduce((s, y) => s + pv(replaceable, y), 0);
  return { designKw, capex, om: capex * sys.omFractionYr, replPV };
}

export interface PackageEval {
  heatKwh: number; heatSource: "rc" | "estimate";
  deliveredKwh: number; carrier: CarrierKey; system: HvacSystem; designKw: number;
  investEnvelope: number; investHeating: number; invest: number;
  replacementsPV: number; omYr: number;
  embodiedKg: number; embodiedComplete: boolean;     // false: a measure has no carbon figure
  opCostYr: number; opCarbonYr: number;
  lcc: number;                                       // life-cycle cost, SEK (present value)
  lifeCarbonKg: number;                              // embodied + operational over the period
  energyKwhM2: number;                               // delivered energy per m²
  petKwhM2: number;                                  // primary energy number (heat + hot water only)
}

export function evaluate(bm: BuildingModel, pkg: Package, prices: Prices = DEFAULT_PRICES, rcHeat?: number | null): PackageEval {
  const u: Partial<Record<MeasureComponent, number>> = {};
  let investEnvelope = 0, replEnv = 0, embodied = 0, complete = true;
  for (const c of MEASURE_COMPONENTS) {
    const m = pkg.envelope[c] ? MEASURE_BY_CODE.get(pkg.envelope[c]!) : undefined;
    if (!m) continue;
    u[c] = m.u;
    const l = measureLife(m, bm.partArea[c]);
    investEnvelope += l.cost; replEnv += l.replCostPV; embodied += l.co2 + l.replCo2;
    if (!l.co2Known) complete = false;
  }
  const hasEnvelope = Object.keys(u).length > 0;
  const heatKwh = rcHeat != null ? rcHeat : hasEnvelope ? ddHeat(bm, u) : bm.heat0;
  const sys = HEATING_SYSTEMS.find((s) => s.id === pkg.heating) ?? HEATING_SYSTEMS.find((s) => s.id === BASE_SYSTEM)!;
  const carrier = sys.carrier as CarrierKey;
  const delivered = (heatKwh + bm.dhw) / sys.spf.base;
  const p = plant(sys, heatKwh);
  const opCostYr = delivered * prices[carrier];
  const opCarbonYr = delivered * CARBON[carrier];
  const invest = investEnvelope + p.capex;
  const lcc = invest + replEnv + p.replPV + AF * (opCostYr + p.om);
  return {
    heatKwh, heatSource: rcHeat != null || !hasEnvelope ? "rc" : "estimate",
    deliveredKwh: delivered, carrier, system: sys, designKw: p.designKw,
    investEnvelope, investHeating: p.capex, invest, replacementsPV: replEnv + p.replPV, omYr: p.om,
    embodiedKg: embodied, embodiedComplete: complete,
    opCostYr, opCarbonYr, lcc, lifeCarbonKg: embodied + opCarbonYr * N,
    energyKwhM2: delivered / bm.areaM2,
    petKwhM2: (delivered * ASSUMPTIONS.petWeights.value[carrier]) / bm.areaM2,
  };
}

/** The do-nothing reference: today's heat, district heating, no investment. */
export const baselineEval = (bm: BuildingModel, prices: Prices = DEFAULT_PRICES) =>
  evaluate(bm, { envelope: {}, heating: BASE_SYSTEM }, prices, bm.heat0);

/** Does a package meet Gothenburg's goal for this building? */
export function climateCheck(bm: BuildingModel, e: PackageEval) {
  const base = baselineEval(bm);
  const cutPct = base.petKwhM2 > 0 ? ((base.petKwhM2 - e.petKwhM2) / base.petKwhM2) * 100 : 0;
  return {
    pet: e.petKwhM2, petBase: base.petKwhM2, cutPct,
    meetsPet: e.petKwhM2 <= ASSUMPTIONS.petGoal.value,
    meetsCut: cutPct >= ASSUMPTIONS.cityCutPct.value,
  };
}

/* ── staged renovation: one building's plan split into separately timed steps ──
   Each envelope measure saves ΔQ = k·HDD·24·A·(U₀−U) of space heat a year (the
   anchored degree-day model is additive across parts); scaled so the steps add
   up to EPSM RC's own result when it has run for the whole package. While the
   building is on district heating a step saves ΔQ × DH price. The heating-system
   step may only come after all of the building's envelope steps (no oversized
   heat pump — lock-in), so its effect is exact: the change from district heating
   to the new system at the FINAL heat demand. Hence the yearly bill of a building
   is linear in which steps are done — the staging problem is a linear MILP. */
export interface StageItem {
  id: string; building: string; address: string;
  part: MeasureComponent | "Heating";
  label: string;
  cost: number;                    // SEK, today's price
  embodiedKg: number;              // per installation
  lifeYr: number | null;           // replacement interval within the study period
  omYr: number;                    // upkeep per year (heating plant)
  saveSekYr: number;               // yearly bill saving once done (at today's prices)
  saveCo2Yr: number;               // kg CO2e a year
  saveDelivered: number;           // kWh delivered a year
  savePetKwh: number;              // PET kWh a year (÷ area for kWh/m²)
  urgent: boolean;                 // part past its service life / needed now
}
export interface StageBuilding { id: string; address: string; areaM2: number; base: PackageEval; items: StageItem[] }

export function stageItems(bm: BuildingModel, pkg: Package, prices: Prices, rcAfter: number | null,
  urgentParts: Set<string> = new Set()): StageBuilding {
  const base = baselineEval(bm, prices);
  const dh = HEATING_SYSTEMS.find((s) => s.id === BASE_SYSTEM)!;
  const eff = dh.spf.base;
  const parts = MEASURE_COMPONENTS.filter((c) => pkg.envelope[c] && MEASURE_BY_CODE.get(pkg.envelope[c]!) && bm.u0[c] != null);
  const dq: Record<string, number> = {};
  for (const c of parts) {
    const m = MEASURE_BY_CODE.get(pkg.envelope[c]!)!;
    dq[c] = Math.max(0, bm.k * F_DH * bm.partArea[c] * (bm.u0[c]! - m.u));
  }
  const sumDq = Object.values(dq).reduce((s, v) => s + v, 0);
  // Match EPSM RC's result for the whole package when it is known.
  if (rcAfter != null && sumDq > 0) {
    const scale = Math.max(0, bm.heat0 - rcAfter) / sumDq;
    for (const c of parts) dq[c] *= scale;
  }
  const heatFinal = Math.max(0, bm.heat0 - parts.reduce((s, c) => s + dq[c]!, 0));
  const w = ASSUMPTIONS.petWeights.value;
  const items: StageItem[] = parts.map((c) => {
    const m = MEASURE_BY_CODE.get(pkg.envelope[c]!)!;
    const del = dq[c]! / eff;
    return {
      id: `${bm.id}|${c}`, building: bm.id, address: bm.address, part: c, label: `${m.code} ${m.label}`,
      cost: m.costPerM2 * bm.partArea[c], embodiedKg: (m.co2PerM2 ?? 0) * bm.partArea[c],
      lifeYr: measureLifeYears(c, m.label).years, omYr: 0,
      saveSekYr: del * prices.district_heating, saveCo2Yr: del * CARBON.district_heating,
      saveDelivered: del, savePetKwh: del * w.district_heating, urgent: urgentParts.has(c),
    };
  });
  const sys = HEATING_SYSTEMS.find((s) => s.id === pkg.heating);
  if (sys && sys.id !== BASE_SYSTEM) {
    const carrier = sys.carrier as CarrierKey;
    const delDh = (heatFinal + bm.dhw) / eff, delNew = (heatFinal + bm.dhw) / sys.spf.base;
    const p = plant(sys, heatFinal);
    items.push({
      id: `${bm.id}|Heating`, building: bm.id, address: bm.address, part: "Heating", label: sys.name,
      cost: p.capex, embodiedKg: 0, lifeYr: sys.lifetimeYr, omYr: p.om,
      saveSekYr: delDh * prices.district_heating - delNew * prices[carrier],
      saveCo2Yr: delDh * CARBON.district_heating - delNew * CARBON[carrier],
      saveDelivered: delDh - delNew, savePetKwh: delDh * w.district_heating - delNew * w[carrier], urgent: urgentParts.has("Heating system"),
    });
  }
  return { id: bm.id, address: bm.address, areaM2: bm.areaM2, base, items };
}

export interface StageSettings {
  startYear: number; years: number; budget: number;           // SEK over the whole period
  carbonPriceSekT: number;                                    // SEK per tonne CO2e (0 = carbon not priced)
  costGrowthPct: number;                                      // real construction-cost growth %/yr
  maxBuildingsPerYear: number | null;
}

/** Present value, at the plan's start, of doing item i in plan year y (0-based):
 *  bills saved from the year after until the end of the study period, minus the
 *  (escalated) investment, its replacements and upkeep; CO2 at the carbon price. */
export function stageValue(it: StageItem, y: number, s: StageSettings): number {
  const g = 1 + s.costGrowthPct / 100;
  let v = 0;
  for (let tau = y + 1; tau <= N; tau++) v += ((it.saveSekYr - it.omYr) + (s.carbonPriceSekT * it.saveCo2Yr) / 1000) / Math.pow(1 + R, tau);
  const install = (yr: number) => (it.cost * Math.pow(g, yr)) / Math.pow(1 + R, yr) + (s.carbonPriceSekT * it.embodiedKg) / 1000 / Math.pow(1 + R, yr);
  v -= install(y);
  if (it.lifeYr) for (let yr = y + it.lifeYr; yr < N; yr += it.lifeYr) v -= install(yr);
  return v;
}

/** Year-by-year state of the portfolio for a schedule (item id → plan year, or null). */
export function stageTimeline(buildings: StageBuilding[], schedule: Record<string, number | null>, s: StageSettings) {
  const g = 1 + s.costGrowthPct / 100;
  const goal = ASSUMPTIONS.petGoal.value;
  const rows = [];
  let cum = 0;
  for (let y = 0; y <= s.years; y++) {
    let spend = 0, bill = 0, co2 = 0, delivered = 0, embodied = 0, meet = 0;
    const doneNow: StageItem[] = [];
    for (const b of buildings) {
      let bl = b.base.opCostYr, c = b.base.opCarbonYr, d = b.base.deliveredKwh, pet = b.base.petKwhM2 * b.areaM2;
      for (const it of b.items) {
        const at = schedule[it.id];
        if (at == null) continue;
        if (at === y && y < s.years) { spend += it.cost * Math.pow(g, y); embodied += it.embodiedKg; doneNow.push(it); }
        if (at < y) { bl -= it.saveSekYr; c -= it.saveCo2Yr; d -= it.saveDelivered; pet -= it.savePetKwh; }
      }
      bill += bl; co2 += c; delivered += d;
      if (pet / b.areaM2 <= goal) meet++;
    }
    cum += spend;
    rows.push({ year: s.startYear + y, spend, cum, budgetCum: Math.min(s.budget, (s.budget * Math.min(y + 1, s.years)) / s.years), bill, co2Kg: co2, embodiedKg: embodied, delivered, meet, done: doneNow });
  }
  return rows;
}

/* ── catalogue options for one part of one building, grouped for the dropdowns ──
   suggested   the catalogue's suggestion: cheapest item that meets BBR
   recommended meets BBR, improves on today's U, and no other item is both
               cheaper and at least as good (best value)
   other       meets BBR but another item is cheaper and at least as good
   weak        improves on today's U but misses the BBR target
   worse       not better than today's U — would not save energy (disabled) */
export interface OptionGroups { suggested: Measure | null; recommended: Measure[]; other: Measure[]; weak: Measure[]; worse: Measure[] }
export function measureOptions(c: MeasureComponent, u0: number | null, suggestedCode?: string | null): OptionGroups {
  const all = CATALOGUE.filter((m) => m.component === c);
  const better = (m: Measure) => u0 == null || m.u < u0;
  const ok = all.filter((m) => better(m) && m.meetsBbr);
  const dominated = (a: Measure) => ok.some((b) => b !== a && b.costPerM2 <= a.costPerM2 && b.u <= a.u && (b.costPerM2 < a.costPerM2 || b.u < a.u));
  const suggested = suggestedCode ? all.find((m) => m.code === suggestedCode && better(m)) ?? null : null;
  const byU = (a: Measure, b: Measure) => a.u - b.u || a.costPerM2 - b.costPerM2;
  const byCost = (a: Measure, b: Measure) => a.costPerM2 - b.costPerM2;
  return {
    suggested,
    recommended: ok.filter((m) => !dominated(m) && m !== suggested).sort(byU),
    other: ok.filter((m) => dominated(m) && m !== suggested).sort(byCost),
    weak: all.filter((m) => better(m) && !m.meetsBbr).sort(byU),
    worse: all.filter((m) => !better(m)).sort(byU),
  };
}

/* ── optimiser ── */
export interface OptPoint { pkg: Package; e: PackageEval; meetsGoal: boolean }
export type OptRule = "lcc" | "carbon" | "goal";

/** Per part: "keep" + the catalogue measures that improve on today's U and are
 *  not dominated on (price, U, carbon) — the rest can never be in an optimum. */
function candidates(bm: BuildingModel, c: MeasureComponent, cap = 8): (Measure | null)[] {
  const u0 = bm.u0[c];
  if (u0 == null || bm.partArea[c] <= 0) return [null];
  const opts = CATALOGUE.filter((m) => m.component === c && m.u < u0);
  const co2 = (m: Measure) => m.co2PerM2 ?? Infinity;
  const nd = opts.filter((a) => !opts.some((b) => b !== a && b.costPerM2 <= a.costPerM2 && b.u <= a.u && co2(b) <= co2(a)
    && (b.costPerM2 < a.costPerM2 || b.u < a.u || co2(b) < co2(a))));
  nd.sort((a, b) => a.u - b.u);
  // Keep the spread: thin evenly if there are too many.
  const pick = nd.length <= cap ? nd : Array.from({ length: cap }, (_, i) => nd[Math.round((i * (nd.length - 1)) / (cap - 1))]!);
  return [null, ...pick];
}

/** Pareto front over (LCC, life-cycle carbon, delivered energy) for one building. */
export function optimise(bm: BuildingModel, prices: Prices = DEFAULT_PRICES): OptPoint[] {
  const lists = MEASURE_COMPONENTS.map((c) => candidates(bm, c));
  const points: OptPoint[] = [];
  const idx = lists.map(() => 0);
  for (;;) {
    const envelope: Envelope = {};
    MEASURE_COMPONENTS.forEach((c, i) => { const m = lists[i]![idx[i]!]; if (m) envelope[c] = m.code; });
    for (const sys of HEATING_SYSTEMS) {
      if (!Object.keys(envelope).length && sys.id === BASE_SYSTEM) continue;   // that is "do nothing"
      const pkg = { envelope, heating: sys.id };
      const e = evaluate(bm, pkg, prices);
      points.push({ pkg, e, meetsGoal: climateCheck(bm, e).meetsPet });
    }
    let k = 0;
    while (k < idx.length && ++idx[k]! >= lists[k]!.length) { idx[k] = 0; k++; }
    if (k === idx.length) break;
  }
  points.sort((a, b) => a.e.lcc - b.e.lcc || a.e.lifeCarbonKg - b.e.lifeCarbonKg);
  const front: OptPoint[] = [];
  for (const x of points) {
    const dom = front.some((y) => y.e.lifeCarbonKg <= x.e.lifeCarbonKg && y.e.energyKwhM2 <= x.e.energyKwhM2);
    if (!dom) front.push(x);
  }
  return front;
}

export function pickFromFront(front: OptPoint[], rule: OptRule): OptPoint | null {
  if (!front.length) return null;
  if (rule === "carbon") return front.reduce((a, b) => (b.e.lifeCarbonKg < a.e.lifeCarbonKg ? b : a));
  if (rule === "goal") return front.filter((p) => p.meetsGoal).sort((a, b) => a.e.lcc - b.e.lcc)[0] ?? null;
  return front[0]!;   // sorted by LCC
}

/* ── decision under uncertain energy prices ──
   The main planner's rules (frontend/src/utils/regretAnalysis.ts), on a benefit
   matrix: benefit = present value of energy bills saved vs doing nothing −
   life-cycle investment (incl. replacements and O&M). Doing nothing is shown as
   the reference but is never a candidate — otherwise, when renovation does not
   pay on energy alone, it wins every rule and says nothing about WHICH plan.
     minimax regret  regret = best plan in that future − this plan; pick the plan
                     whose worst regret is smallest
     range           best − worst outcome; small = robust
     Hurwicz         α·best + (1−α)·worst; α = optimism (0 = pure worst case) */
export interface RegretRow { id: string; label: string; isBaseline: boolean; benefits: number[]; regrets: number[]; maxRegret: number; best: number; worst: number; range: number; hurwicz: number }
export function regretMatrix(options: { id: string; label: string; isBaseline?: boolean; benefits: number[] }[], alpha: number) {
  const cand = options.filter((o) => !o.isBaseline);
  const pool = cand.length ? cand : options;
  const nS = options[0]?.benefits.length ?? 0;
  const bestPer = Array.from({ length: nS }, (_, s) => Math.max(...pool.map((o) => o.benefits[s]!)));
  const rows: RegretRow[] = options.map((o) => {
    const regrets = o.benefits.map((b, s) => bestPer[s]! - b);
    const best = Math.max(...o.benefits), worst = Math.min(...o.benefits);
    return { id: o.id, label: o.label, isBaseline: !!o.isBaseline, benefits: o.benefits, regrets,
      maxRegret: Math.max(...regrets), best, worst, range: best - worst, hurwicz: alpha * best + (1 - alpha) * worst };
  });
  const rank = rows.filter((r) => !r.isBaseline);
  const by = (better: (a: RegretRow, b: RegretRow) => boolean) => (rank.length ? rank.reduce((a, b) => (better(b, a) ? b : a)).id : null);
  return {
    rows, bestPer,
    picks: { minimaxRegret: by((b, a) => b.maxRegret < a.maxRegret), hurwicz: by((b, a) => b.hurwicz > a.hurwicz), mostRobust: by((b, a) => b.range < a.range) },
  };
}
