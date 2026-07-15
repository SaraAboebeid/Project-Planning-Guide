/**
 * SYNTHETIC PLACEHOLDER cost/carbon figures for UK renovation packages -
 * round, made-up numbers, not derived from any real dataset.
 *
 * Two real UK sources were evaluated and rejected for this purpose:
 *  - ICE Database Educational V5.0 (Circular Ecology / University of Bath) -
 *    real embodied-carbon-per-material data, but its license explicitly
 *    prohibits use "in software or tools (unless 100% a teaching aid only)
 *    or ... any carbon calculations" outside teaching/learning the subject.
 *    A renovation-planning tool doing real carbon math is exactly the
 *    prohibited use, so none of its figures are reproduced here.
 *  - DBT/ONS "Construction Building Materials" bulletin - real, open
 *    (Crown copyright / OGL) data, but it publishes price INDICES
 *    (2015=100) and production/trade VOLUMES, not per-assembly £/m² unit
 *    costs - the wrong shape of data for per-package costing.
 *
 * These flat per-m2 rates exist purely so the UK calculator's cost/carbon
 * columns aren't blank while the EPSM energy-simulation pipeline is being
 * tested end-to-end. Replace with a real, properly-licensed UK cost/carbon
 * source (e.g. an IC+ commercial license, or a BCIS-style cost API) before
 * showing these figures to a real user for decision-making.
 */

import type { RefurbTierKey } from "../utils/ukArchetype";

export interface UkPlaceholderRate {
  costGbpPerM2: number;
  carbonKgCo2ePerM2: number;
}

export const UK_PLACEHOLDER_RATES: Record<RefurbTierKey, UkPlaceholderRate> = {
  standard_refurbishment: { costGbpPerM2: 180, carbonKgCo2ePerM2: 45 },
  ambitious_refurbishment: { costGbpPerM2: 320, carbonKgCo2ePerM2: 75 },
};

export const UK_PLACEHOLDER_SAMPLE = [
  { tier: "standard_refurbishment", cost_gbp_per_m2: 180, carbon_kgco2e_per_m2: 45, note: "SYNTHETIC placeholder - not a real cost/carbon source" },
  { tier: "ambitious_refurbishment", cost_gbp_per_m2: 320, carbon_kgco2e_per_m2: 75, note: "SYNTHETIC placeholder - not a real cost/carbon source" },
];

export function fmtGBP(n: number): string {
  return "£" + n.toLocaleString("en-GB", { maximumFractionDigits: 0 });
}
