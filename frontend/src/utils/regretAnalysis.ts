/**
 * Regret-based decision analysis for retrofit options under an uncertain future.
 *
 * Each retrofit option (package, plus the do-nothing baseline) is evaluated under
 * several future scenarios — here, energy-price scenarios (Low / Medium / High),
 * the biggest unknown driving a retrofit's payoff. The "outcome" is the 30-year
 * net present benefit (higher = better):
 *
 *     benefit_i(scenario) = annual_energy_saved_i × price(scenario) × annuity − investment_i
 *
 * From the option × scenario benefit matrix we derive three classic decision rules:
 *   • Minimax regret — regret = best-in-scenario − chosen; pick the option whose
 *     WORST-case regret is smallest (least risk of having chosen wrong).
 *   • Uncertainty range — best − worst across scenarios; small = robust.
 *   • Hurwicz — H = α·best + (1−α)·worst; α is optimism (0 = pure worst-case).
 */

export interface RegretScenario { key: string; label: string; priceSek: number; }

export interface RegretOptionInput {
  id: string;
  label: string;
  energyKwhM2: number;      // total energy use intensity of this option (kWh/m²·yr)
  investmentSek: number;    // up-front renovation cost (0 for baseline)
  isBaseline?: boolean;
}

export interface RegretConfig {
  baselineEnergyKwhM2: number;
  totalFloorAreaM2: number;
  annuityFactor: number;    // Σ 1/(1+r)^t over the study period
}

export interface RegretOptionResult {
  id: string;
  label: string;
  isBaseline: boolean;
  benefits: number[];       // NPV per scenario (SEK), aligned to scenarios
  best: number;
  worst: number;
  range: number;
  regrets: number[];        // per scenario
  maxRegret: number;
  hurwicz: number;
}

export interface RegretResult {
  scenarios: RegretScenario[];
  options: RegretOptionResult[];
  bestPerScenario: number[];
  picks: { minimaxRegret: string; hurwicz: string; mostRobust: string };
  alpha: number;
  studyPeriodYr: number;
  generatedAt: string;
}

/** Discounted annuity factor Σ_{t=1..N} 1/(1+r)^t (→ N when r=0). */
export function annuityFactor(discountRate: number, years: number): number {
  if (discountRate <= 0) return years;
  return (1 - Math.pow(1 + discountRate, -years)) / discountRate;
}

export function computeRegret(
  options: RegretOptionInput[],
  scenarios: RegretScenario[],
  config: RegretConfig,
  alpha: number,
  studyPeriodYr: number,
  generatedAt: string,
): RegretResult {
  const { baselineEnergyKwhM2, totalFloorAreaM2, annuityFactor: af } = config;
  const benefitOf = (o: RegretOptionInput, price: number) => {
    const savedKwhYr = Math.max(0, baselineEnergyKwhM2 - o.energyKwhM2) * totalFloorAreaM2;
    return Math.round(savedKwhYr * price * af - o.investmentSek);
  };

  const rows = options.map((o) => {
    const benefits = scenarios.map((s) => benefitOf(o, s.priceSek));
    return { o, benefits, best: Math.max(...benefits), worst: Math.min(...benefits) };
  });

  const bestPerScenario = scenarios.map((_, si) => Math.max(...rows.map((r) => r.benefits[si]!)));

  const results: RegretOptionResult[] = rows.map((r) => {
    const regrets = r.benefits.map((b, si) => bestPerScenario[si]! - b);
    return {
      id: r.o.id, label: r.o.label, isBaseline: !!r.o.isBaseline,
      benefits: r.benefits, best: r.best, worst: r.worst, range: r.best - r.worst,
      regrets, maxRegret: Math.max(...regrets),
      hurwicz: Math.round(alpha * r.best + (1 - alpha) * r.worst),
    };
  });

  const pickBy = (better: (a: RegretOptionResult, b: RegretOptionResult) => boolean) =>
    results.reduce((a, b) => (better(b, a) ? b : a)).id;

  return {
    scenarios,
    options: results,
    bestPerScenario,
    picks: {
      minimaxRegret: pickBy((b, a) => b.maxRegret < a.maxRegret),
      hurwicz: pickBy((b, a) => b.hurwicz > a.hurwicz),
      mostRobust: pickBy((b, a) => b.range < a.range),
    },
    alpha,
    studyPeriodYr,
    generatedAt,
  };
}
