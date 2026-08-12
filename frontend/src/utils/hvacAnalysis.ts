/**
 * Heating-system (HVAC source) economics — Phase 1.
 *
 * Takes the building's useful HEAT DEMAND (from the EPSM baseline) and, for each
 * candidate system, computes delivered energy, annual cost & carbon, capex, and
 * the 30-year life-cycle cost — the demand is fixed, only the converter changes:
 *
 *   delivered = demand / efficiency(SPF)
 *   op-cost   = delivered × carrier tariff
 *   carbon    = delivered × carrier carbon factor
 *   capex     = fixed + (perKw [+ groundLoop]) × design-kW      (design-kW = demand / EFLH)
 *   LCC       = capex + annuity·(op-cost + O&M) + PV(replacements)
 */
import { HVAC_SYSTEMS, CARRIERS, GOTHENBURG_EFLH } from "../config/hvacSystems";

export interface HvacInput {
  heatingDemandKwhM2Yr: number;   // useful heat demand per m²·yr (EPSM baseline heating)
  floorAreaM2: number;
  eflh?: number;                  // equivalent full-load hours (design-kW sizing)
  studyPeriodYr?: number;         // default 30
  discountRate?: number;          // default 0.03
}

export interface HvacDelta { opCostPct: number; carbonPct: number; deliveredPct: number; }

export interface HvacResult {
  id: string; name: string; shortName: string; color: string;
  carrier: string; isBaseline: boolean;
  spf: number;
  deliveredKwhM2Yr: number; deliveredKwhYr: number; designKw: number;
  operatingCostYrSek: number; carbonYrKg: number;
  capexSek: number; omYrSek: number; lccSek: number;
  vsBaseline?: HvacDelta;
}

export interface HvacOutcome {
  results: HvacResult[];
  baseline: HvacResult | null;
  picks: { lowestLcc: string; lowestCarbon: string; lowestEnergy: string; lowestOpCost: string };
}

export function annuity(discountRate: number, years: number): number {
  return discountRate <= 0 ? years : (1 - Math.pow(1 + discountRate, -years)) / discountRate;
}

export function computeHvac(input: HvacInput): HvacOutcome {
  const eflh = input.eflh ?? GOTHENBURG_EFLH;
  const N = input.studyPeriodYr ?? 30;
  const r = input.discountRate ?? 0.03;
  const af = annuity(r, N);
  const area = Math.max(1, input.floorAreaM2);
  const annualDemandKwh = Math.max(0, input.heatingDemandKwhM2Yr) * area;
  const designKw = eflh > 0 ? annualDemandKwh / eflh : 0;

  const results: HvacResult[] = HVAC_SYSTEMS.map((sys) => {
    const spf = sys.spf.base;
    const carrier = CARRIERS[sys.carrier];
    const deliveredKwh = spf > 0 ? annualDemandKwh / spf : annualDemandKwh;
    const opCost = deliveredKwh * carrier.tariffSek;
    const carbon = deliveredKwh * carrier.carbonKgPerKwh;
    // Ground loop (GSHP borehole) outlasts the plant → excluded from replacement.
    const replaceableCapex = sys.capexFixedSek + sys.capexPerKwSek * designKw;
    const capex = replaceableCapex + (sys.groundLoopPerKwSek ?? 0) * designKw;
    const om = capex * sys.omFractionYr;
    let replPV = 0;
    for (let t = sys.lifetimeYr; t < N; t += sys.lifetimeYr) replPV += replaceableCapex / Math.pow(1 + r, t);
    const lcc = capex + af * (opCost + om) + replPV;
    return {
      id: sys.id, name: sys.name, shortName: sys.shortName, color: sys.color,
      carrier: sys.carrier, isBaseline: !!sys.isBaseline, spf,
      deliveredKwhM2Yr: Math.round((deliveredKwh / area) * 10) / 10,
      deliveredKwhYr: Math.round(deliveredKwh),
      designKw: Math.round(designKw * 10) / 10,
      operatingCostYrSek: Math.round(opCost),
      carbonYrKg: Math.round(carbon),
      capexSek: Math.round(capex),
      omYrSek: Math.round(om),
      lccSek: Math.round(lcc),
    };
  });

  const baseline = results.find((x) => x.isBaseline) ?? null;
  if (baseline) {
    const pct = (v: number, b: number) => (b ? Math.round(((v - b) / b) * 100) : 0);
    for (const x of results) {
      x.vsBaseline = {
        opCostPct: pct(x.operatingCostYrSek, baseline.operatingCostYrSek),
        carbonPct: pct(x.carbonYrKg, baseline.carbonYrKg),
        deliveredPct: pct(x.deliveredKwhYr, baseline.deliveredKwhYr),
      };
    }
  }

  const argmin = (key: (x: HvacResult) => number) =>
    results.reduce((a, b) => (key(b) < key(a) ? b : a)).id;

  return {
    results,
    baseline,
    picks: {
      lowestLcc: argmin((x) => x.lccSek),
      lowestCarbon: argmin((x) => x.carbonYrKg),
      lowestEnergy: argmin((x) => x.deliveredKwhYr),
      lowestOpCost: argmin((x) => x.operatingCostYrSek),
    },
  };
}
