/**
 * Heating-system catalogue — United Kingdom / Rotherham.
 *
 * Same Phase-1 model as the Swedish catalogue (hvacSystems.ts): the EPSM heat
 * demand is fixed and each system converts it to delivered energy.
 *
 * The as-built baseline is a gas boiler: 91% of Rotherham's matched EPC
 * certificates heat with "Boiler and radiators, mains gas".
 *
 * Money is GBP (fields named *Sek hold the catalogue currency).
 *  - Tariffs: Ofgem price-cap retail rates for GSP region M (Yorkshire), taken
 *    live from the Octopus Energy API (Flexible Octopus, Direct Debit, incl. VAT);
 *    the numbers below are the fallback if the feed is down.
 *  - Carbon: DESNZ GHG Conversion Factors 2025 (OGL v3.0).
 *  - Install costs: DESNZ, "Improving the energy performance of privately rented
 *    homes - final stage IA" (2026) Table 22 (2020 prices, ex VAT) and the Boiler
 *    Upgrade Scheme statistics July 2026 (median installed ASHP cost, nominal).
 *  - Lifetimes: same IA, Table 23.
 * Seasonal efficiencies are typical published values, not Rotherham field data
 * - flagged provisional.
 */
import type { EnergyCarrier, HvacCatalogue, HvacSystem } from "./hvacSystems";

export interface UkRetailTariffs {
  electricityGbpPerKwh: number | null;
  gasGbpPerKwh: number | null;
}

const FALLBACK = { electricity: 0.25305, gas: 0.07265 }; // Yorkshire cap, Jul–Sep 2026, DD, incl. VAT

export function ukCarriers(t?: UkRetailTariffs | null): Record<"gas" | "electricity", EnergyCarrier> {
  const live = (v: number | null | undefined) => v != null;
  return {
    gas: {
      key: "gas",
      label: "Mains gas",
      tariffSek: t?.gasGbpPerKwh ?? FALLBACK.gas,
      // Scope 1 combustion 0.18296 + well-to-tank 0.03021 - life-cycle, like the Swedish carriers.
      carbonKgPerKwh: 0.18296 + 0.03021,
      source: `Price: Ofgem price cap, Yorkshire, Direct Debit, incl. VAT (${live(t?.gasGbpPerKwh) ? "live via Octopus Energy API" : "fallback value"}). Carbon: DESNZ GHG factors 2025, natural gas kWh gross CV incl. well-to-tank.`,
      sourceUrl: "https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting",
    },
    electricity: {
      key: "electricity",
      label: "Electricity",
      tariffSek: t?.electricityGbpPerKwh ?? FALLBACK.electricity,
      // Generation 0.17700 + transmission & distribution losses 0.01853.
      carbonKgPerKwh: 0.17700 + 0.01853,
      source: `Price: Ofgem price cap, Yorkshire, Direct Debit (${live(t?.electricityGbpPerKwh) ? "live via Octopus Energy API" : "fallback value"}). Carbon: DESNZ GHG factors 2025, UK electricity generation + T&D losses (location-based).`,
      sourceUrl: "https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting",
      note: "The 2026 DESNZ set is ~26% lower partly from a method change - don't mix years.",
    },
  };
}

export const UK_HVAC_SYSTEMS: HvacSystem[] = [
  {
    id: "gas_keep",
    name: "Keep existing gas boiler",
    shortName: "Existing gas boiler",
    carrier: "gas",
    isBaseline: true,
    spf: { low: 0.75, base: 0.80, high: 0.85 },
    spfNote: "Older non-condensing / early condensing boilers in service.",
    capexFixedSek: 0,
    capexPerKwSek: 0,
    omFractionYr: 0,
    lifetimeYr: 30,
    color: "#E8880C",
    note: "The as-built baseline: no new plant.",
    source: "Seasonal efficiency: typical in-use value for older gas boilers (SAP boiler efficiency tables) - provisional.",
    provisional: true,
  },
  {
    id: "gas_condensing",
    name: "New condensing gas boiler",
    shortName: "New gas boiler",
    carrier: "gas",
    spf: { low: 0.85, base: 0.89, high: 0.92 },
    spfNote: "Modern condensing boiler; efficiency falls with high flow temperatures.",
    // DESNZ Table 22: £2,700 for a 24 kW install -> scaled per design kW.
    capexFixedSek: 0,
    capexPerKwSek: 2700 / 24,
    omFractionYr: 0.035,
    lifetimeYr: 12,
    color: "#F97316",
    note: "Like-for-like replacement; cheapest to install, keeps fossil-gas carbon.",
    source: "Cost: DESNZ PRS impact assessment 2026, Table 22 (£2,700, 24 kW, 2020 prices ex VAT). Life: Table 23 (12 yr). Efficiency: typical condensing boiler seasonal value - provisional.",
    sourceUrl: "https://assets.publishing.service.gov.uk/media/6980df5b3915f71236580138/prs-homes-energy-performance-impact-assessment.pdf",
  },
  {
    id: "ashp",
    name: "Air-source heat pump",
    shortName: "Air-source HP",
    carrier: "electricity",
    spf: { low: 2.5, base: 2.8, high: 3.2 },
    spfNote: "Seasonal performance in UK homes; lower with unchanged high-temperature radiators.",
    // BUS statistics July 2026: median £12,908 for a median 8 kW air-to-water install -> per design kW.
    capexFixedSek: 0,
    capexPerKwSek: 12908 / 8,
    omFractionYr: 0.01,
    lifetimeYr: 20,
    color: "#4A90E2",
    note: "Before the £7,500 Boiler Upgrade Scheme grant. Cost scales with design kW here, which overstates small-house jobs and may understate block retrofits.",
    source: "Cost: DESNZ Boiler Upgrade Scheme statistics, July 2026, Table Q1.1A (median £12,908, median 8 kW, 2026 Q2, nominal). Life: DESNZ PRS IA Table 23 (20 yr). SPF: typical UK field value - provisional.",
    sourceUrl: "https://www.gov.uk/government/collections/boiler-upgrade-scheme-statistics",
    provisional: true,
  },
  {
    id: "direct_electric",
    name: "Direct electric heating",
    shortName: "Direct electric",
    carrier: "electricity",
    spf: { low: 1.0, base: 1.0, high: 1.0 },
    spfNote: "1 kWh electricity → 1 kWh heat.",
    capexFixedSek: 0,
    capexPerKwSek: 150,
    omFractionYr: 0.005,
    lifetimeYr: 20,
    color: "#E2483B",
    note: "Worst-case efficiency reference, as in the Swedish comparison.",
    source: "Efficiency by definition = 1.0. Cost: rough placeholder (panel heaters), not from a published source.",
    provisional: true,
  },
];

/** Design-kW sizing hours. Rotherham's modelled HDD (2,108, Met Office 12 km) is
 *  close to Gothenburg's regional estimate, so the same order of full-load hours applies. */
const ROTHERHAM_EFLH = 2100;

export function ukHvacCatalogue(tariffs?: UkRetailTariffs | null): HvacCatalogue {
  return {
    currency: "GBP", locale: "en-GB",
    carriers: ukCarriers(tariffs),
    systems: UK_HVAC_SYSTEMS,
    eflh: ROTHERHAM_EFLH,
    eflhNote: `${ROTHERHAM_EFLH} equivalent full-load hours (provisional for Rotherham; Met Office HDD 2,108)`,
    baselineLabel: "the existing gas boiler",
    defaultSystemId: "gas_keep",
  };
}
