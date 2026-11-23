/* Staged plan (Step 5): each building's chosen package split into steps, one
   per component, so the timing optimiser (backend/staged_plan.py) can decide
   which year each step is carried out within a budget.

   Per building the package's simulated totals are the truth — its cost, its
   embodied carbon, and its energy saving (baseline − package, EPSM / RC). They
   are shared out over the package's components:
     cost, carbon   in proportion to each component's own catalogue cost / carbon
                    (unit price × quantity)
     energy         in proportion to quantity × (U before − U after), the
                    transmission each component removes; by cost when no U-values
                    are known
   so the steps always add up to what Step 4 simulated. A finished package
   therefore gives exactly Step 4's saving; a partly finished one an estimate. */
import type { RenovationBaselineResult, RenovationCalcPackage, StagedMilestone } from "../store/wizard";
import { measureLifeYears, replacementsWithin } from "../config/serviceLifeSE";

export interface StageStep {
  id: string;               // `${buildingKey}|${lineItemKey}`
  building: string;         // "lat,lon" (6 decimals) — the key Step 4 uses
  address: string;
  part: string;             // line item key: Walls, Windows, Roof, Floor, Doors, …
  label: string;            // what is installed
  cost: number;             // today's price (currency of the project)
  embodiedKg: number;
  lifeYr: number | null;    // replacement interval within the study period
  saveKwhYr: number;        // delivered energy saved a year once done
}
export interface StageBuilding {
  key: string; address: string; packageName: string;
  areaM2: number; baseKwh: number; baseKwhM2: number;
  steps: StageStep[];
}

export interface StageInputs {
  packages: RenovationCalcPackage[];
  selectedByBuilding: Record<string, string>;
  baseline: RenovationBaselineResult[];
  /** Component U before renovation for a building (null = unknown). */
  uBefore: (lat: number, lon: number, part: string) => number | null;
  /** U, unit price and unit carbon of a selection (catalogue item or saved build-up). */
  describe: (sel: RenovationCalcPackage["selections"][string], part: string) => { label: string; u: number | null; unitCost: number; unitCarbon: number };
}

export const bKey = (lat: number, lon: number) => `${lat.toFixed(6)},${lon.toFixed(6)}`;
const PART_OF = (k: string) => k.replace(/^VertExt::/, "");

/** The package to stage for each building: the user's pick in Step 4, else the
 *  completed package with the lowest energy use for that building. */
export function buildStages(inp: StageInputs): { buildings: StageBuilding[]; skipped: string[] } {
  const pkgs = inp.packages.filter((p) => !p.isBaseline);
  const baseByKey = new Map(inp.baseline.filter((b) => b.lat != null && b.lon != null).map((b) => [bKey(b.lat!, b.lon!), b]));
  const basePkg = inp.packages.find((p) => p.isBaseline);
  const keys = new Set<string>();
  for (const p of pkgs) for (const b of p.buildings) keys.add(bKey(b.lat, b.lon));
  const buildings: StageBuilding[] = [];
  const skipped: string[] = [];
  for (const key of keys) {
    const res = (p: RenovationCalcPackage) => p.buildings.find((b) => bKey(b.lat, b.lon) === key && b.status === "completed" && b.totalKwhM2Yr != null);
    const chosenId = inp.selectedByBuilding[key];
    const pkg = (chosenId && pkgs.find((p) => p.id === chosenId && res(p)))
      || [...pkgs].filter((p) => res(p)).sort((a, b) => (res(a)!.totalKwhM2Yr ?? 0) - (res(b)!.totalKwhM2Yr ?? 0))[0];
    if (!pkg) continue;
    const r = res(pkg)!;
    const base = baseByKey.get(key);
    const baseRow = basePkg ? basePkg.buildings.find((b) => bKey(b.lat, b.lon) === key) : undefined;
    const baseKwhM2 = base?.energyUse ?? baseRow?.totalKwhM2Yr ?? null;
    const areaM2 = base?.heatedAreaM2 ?? r.floorAreaM2 ?? null;
    if (baseKwhM2 == null || !areaM2) { skipped.push(r.address || key); continue; }
    const totalSave = Math.max(0, (baseKwhM2 - (r.totalKwhM2Yr ?? baseKwhM2)) * areaM2);
    const parts = Object.entries(pkg.selections).filter(([, s]) => s && (s.wikellsCode || s.configId || s.customUValue != null));
    const desc = parts.map(([k, s]) => ({ k, s, d: inp.describe(s, PART_OF(k)) }));
    const costW = desc.map(({ s, d }) => Math.max(0, d.unitCost * (s.quantity || 0)));
    const carbW = desc.map(({ s, d }) => Math.max(0, d.unitCarbon * (s.quantity || 0)));
    const uW = desc.map(({ k, s, d }) => {
      const u0 = inp.uBefore(r.lat, r.lon, PART_OF(k));
      return u0 != null && d.u != null ? Math.max(0, (u0 - d.u) * (s.quantity || 0)) : 0;
    });
    const share = (w: number[], i: number, fallback: number[]) => {
      const sw = w.reduce((a, b) => a + b, 0);
      if (sw > 0) return w[i]! / sw;
      const sf = fallback.reduce((a, b) => a + b, 0);
      return sf > 0 ? fallback[i]! / sf : 1 / Math.max(1, w.length);
    };
    const totalCost = r.costSEK ?? costW.reduce((a, b) => a + b, 0);
    const totalCarbon = r.carbonKgCO2e ?? carbW.reduce((a, b) => a + b, 0);
    buildings.push({
      key, address: r.address || key, packageName: pkg.name, areaM2, baseKwh: baseKwhM2 * areaM2, baseKwhM2,
      steps: desc.map(({ k, d }, i) => ({
        id: `${key}|${k}`, building: key, address: r.address || key, part: PART_OF(k), label: d.label,
        cost: totalCost * share(costW, i, costW), embodiedKg: totalCarbon * share(carbW, i, costW),
        lifeYr: measureLifeYears(k, d.label).years, saveKwhYr: totalSave * share(uW, i, costW),
      })),
    });
  }
  return { buildings, skipped };
}

export interface StageEconomics {
  price: number;            // per kWh delivered (project currency)
  carbonFactor: number;     // kg CO2e per kWh delivered
  discountRate: number;
  studyPeriodYr: number;
  carbonPriceT: number;     // per tonne CO2e (0 = not priced)
  costGrowthPct: number;    // real construction-cost growth per year
}

/** Present value, at the plan's start, of doing a step in plan year y: bills
 *  (and CO2 at the carbon price) saved from the next year to the end of the
 *  study period, minus the escalated investment and its replacements. */
export function stepValue(s: StageStep, y: number, e: StageEconomics, priceMult = 1): number {
  const g = 1 + e.costGrowthPct / 100, r = e.discountRate;
  const yearly = s.saveKwhYr * (e.price * priceMult + (e.carbonPriceT * e.carbonFactor) / 1000);
  let v = 0;
  for (let t = y + 1; t <= e.studyPeriodYr; t++) v += yearly / Math.pow(1 + r, t);
  const install = (yr: number) => (s.cost * Math.pow(g, yr) + (e.carbonPriceT * s.embodiedKg) / 1000) / Math.pow(1 + r, yr);
  v -= install(y);
  for (const rep of replacementsWithin(e.studyPeriodYr - y, s.lifeYr)) v -= install(y + rep);
  return v;
}

/** Year-by-year state for a schedule (step id → plan year; −1 = done before the start). */
export function stageTimeline(buildings: StageBuilding[], schedule: Record<string, number | null>, years: number, startYear: number,
  budget: number, e: StageEconomics) {
  const g = 1 + e.costGrowthPct / 100;
  const rows: { year: number; spend: number; cum: number; budgetCum: number; bill: number; co2Kg: number; kwh: number; done: StageStep[] }[] = [];
  let cum = 0;
  for (let y = 0; y <= years; y++) {
    let spend = 0, kwh = 0;
    const done: StageStep[] = [];
    for (const b of buildings) {
      let k = b.baseKwh;
      for (const s of b.steps) {
        const at = schedule[s.id];
        if (at == null) continue;
        if (at === y && y < years) { spend += s.cost * Math.pow(g, y); done.push(s); }
        if (at < y) k -= s.saveKwhYr;
      }
      kwh += k;
    }
    cum += spend;
    rows.push({ year: startYear + y, spend, cum, budgetCum: Math.min(budget, (budget * Math.min(y + 1, years)) / years),
      bill: kwh * e.price, co2Kg: kwh * e.carbonFactor, kwh, done });
  }
  return rows;
}

/** Milestone rows for the solver (need reduced by finished steps) and what each asks. */
export function milestoneRows(buildings: StageBuilding[], milestones: StagedMilestone[], startYear: number, years: number, isDone: (id: string) => boolean) {
  const rows: { id: string; by: number; need: number; coeffs: [string, number][] }[] = [];
  const info: { m: StagedMilestone; unreachable: string[] }[] = [];
  for (const m of milestones) {
    if (!m.enabled || m.value == null || m.year < startYear) continue;
    const by = Math.min(years, m.year - startYear + 1);
    const unreachable: string[] = [];
    if (m.kind === "portfolio-pct") {
      const all = buildings.flatMap((b) => b.steps);
      const total = (m.value / 100) * buildings.reduce((s, b) => s + b.baseKwh, 0);
      const doneSave = all.filter((s) => isDone(s.id)).reduce((a, s) => a + s.saveKwhYr, 0);
      if (all.reduce((a, s) => a + s.saveKwhYr, 0) < total - 1e-6) unreachable.push("the plan as a whole");
      rows.push({ id: m.id, by, need: total - doneSave, coeffs: all.filter((s) => !isDone(s.id)).map((s) => [s.id, s.saveKwhYr]) });
    } else {
      for (const b of buildings) {
        const total = m.kind === "building-pct" ? (m.value / 100) * b.baseKwh : (b.baseKwhM2 - m.value) * b.areaM2;
        if (total <= 0) continue;
        const doneSave = b.steps.filter((s) => isDone(s.id)).reduce((a, s) => a + s.saveKwhYr, 0);
        if (b.steps.reduce((a, s) => a + s.saveKwhYr, 0) < total - 1e-6) unreachable.push(b.address);
        rows.push({ id: `${m.id}|${b.key}`, by, need: total - doneSave, coeffs: b.steps.filter((s) => !isDone(s.id)).map((s) => [s.id, s.saveKwhYr]) });
      }
    }
    info.push({ m, unreachable });
  }
  return { rows, info };
}

/** Where each milestone stands with a schedule (incl. finished steps at −1). */
export function milestoneStatus(buildings: StageBuilding[], info: { m: StagedMilestone; unreachable: string[] }[], schedule: Record<string, number | null>, startYear: number) {
  return info.map(({ m, unreachable }) => {
    const doneBy = (s: StageStep) => { const y = schedule[s.id]; return y != null && startYear + y <= m.year; };
    if (m.kind === "portfolio-pct") {
      const base = buildings.reduce((a, b) => a + b.baseKwh, 0);
      const saved = buildings.flatMap((b) => b.steps).filter(doneBy).reduce((a, s) => a + s.saveKwhYr, 0);
      const pct = base ? (saved / base) * 100 : 0;
      return { m, unreachable, met: pct + 1e-9 >= (m.value ?? 0), ok: Math.round(pct), n: null as number | null };
    }
    let ok = 0;
    for (const b of buildings) {
      const kwh = b.baseKwh - b.steps.filter(doneBy).reduce((a, s) => a + s.saveKwhYr, 0);
      const meets = m.kind === "building-pct" ? (b.baseKwh - kwh) / b.baseKwh * 100 + 1e-9 >= (m.value ?? 0) : kwh / b.areaM2 <= (m.value ?? 0) + 1e-9;
      if (meets) ok++;
    }
    return { m, unreachable, met: ok === buildings.length, ok, n: buildings.length };
  });
}
