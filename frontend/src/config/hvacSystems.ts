/**
 * Heating-system (HVAC source) catalogue — Sweden / Gothenburg.
 *
 * Phase-1 model: the building's HEAT DEMAND (from EPSM/degree-day) is fixed; each
 * system is a converter from demand → delivered energy → cost + carbon via its
 * seasonal efficiency. No EnergyPlus plant modelling is required for a source swap.
 *
 * Every number is a documented Swedish default with a source and a low/base/high
 * band — REFINE against real quotes/field data as you validate. Values flagged
 * `provisional: true` are ballpark and most in need of a real citation.
 *
 * Efficiency convention:
 *   - Heat pumps  → SPF (Seasonal Performance Factor), delivered = demand / SPF.
 *   - District heating → substation efficiency (~0.98), delivered ≈ demand / 0.98.
 *   - Boiler → combustion efficiency.
 *   - Direct electric → 1.0.
 */

export type Carrier = "district_heating" | "electricity" | "biomass";

export interface EnergyCarrier {
  key: Carrier;
  label: string;
  /** Retail price of delivered energy, SEK/kWh (incl. grid/tax where relevant). */
  tariffSek: number;
  /** Life-cycle carbon intensity of delivered energy, kg CO₂e/kWh. */
  carbonKgPerKwh: number;
  source: string;
  sourceUrl?: string;
  note?: string;
}

/** Editable defaults — the Settings/assumptions can later override these. */
export const CARRIERS: Record<Carrier, EnergyCarrier> = {
  district_heating: {
    key: "district_heating",
    label: "District heating (fjärrvärme)",
    tariffSek: 0.85,
    carbonKgPerKwh: 0.022,
    source: "Price: Göteborg Energi fjärrvärme tariff 2024–25. Carbon: Göteborg Energi Miljövärden 2025 (≈22 g/kWh, life-cycle).",
    sourceUrl: "https://www.goteborgenergi.se/foretag/fjarrvarme",
  },
  electricity: {
    key: "electricity",
    label: "Electricity",
    tariffSek: 1.8,
    carbonKgPerKwh: 0.030,
    source: "Price: SE3 retail ≈ spot (Nord Pool) + grid + energy tax + VAT. Carbon: Swedish production mix (Energiföretagen / Naturvårdsverket); marginal-vs-average is contested — Göteborg Energi's own supplied electricity ≈ 0 g.",
    sourceUrl: "https://www.energiforetagen.se/",
    note: "Electricity carbon is method-dependent; treat as a scenario, not a fixed fact.",
  },
  biomass: {
    key: "biomass",
    label: "Wood pellets (pellets)",
    tariffSek: 0.60,
    carbonKgPerKwh: 0.015,
    source: "Price: Swedish pellet retail 2024–25. Carbon: biogenic combustion + supply chain (Naturvårdsverket / Boverket klimatdatabas).",
    sourceUrl: "https://www.boverket.se/",
  },
};

export interface HvacSystem {
  id: string;
  name: string;
  shortName: string;
  carrier: Carrier;
  isBaseline?: boolean;               // "keep district heating"
  /** Seasonal efficiency (SPF for HPs; substation/combustion efficiency otherwise). */
  spf: { low: number; base: number; high: number };
  spfNote: string;
  /** Capex = fixed install + (perKw [+ groundLoopPerKw]) × design-kW, SEK. */
  capexFixedSek: number;
  capexPerKwSek: number;
  groundLoopPerKwSek?: number;        // GSHP borehole drilling, amortised per design-kW
  omFractionYr: number;              // annual O&M as a fraction of capex
  lifetimeYr: number;                // service life of the heat-generating plant
  color: string;
  note: string;
  source: string;
  sourceUrl?: string;
  provisional?: boolean;
}

export const HVAC_SYSTEMS: HvacSystem[] = [
  {
    id: "dh_keep",
    name: "Keep district heating",
    shortName: "District heating",
    carrier: "district_heating",
    isBaseline: true,
    spf: { low: 0.97, base: 0.98, high: 0.99 },
    spfNote: "Substation heat-exchanger efficiency; delivered energy ≈ heat demand.",
    capexFixedSek: 0,
    capexPerKwSek: 0,
    omFractionYr: 0,
    lifetimeYr: 30,
    color: "#E8880C",
    note: "The as-built baseline for most of Gothenburg's stock. No new plant cost — the connection already exists.",
    source: "Göteborg Energi fjärrvärme; substation efficiency per Svensk Fjärrvärme guidance.",
    sourceUrl: "https://www.goteborgenergi.se/foretag/fjarrvarme",
  },
  {
    id: "ashp",
    name: "Air-to-water heat pump",
    shortName: "Air-water HP",
    carrier: "electricity",
    spf: { low: 2.5, base: 2.9, high: 3.2 },
    spfNote: "Seasonal COP for Nordic climate; lower with high-temp radiators, higher with low-temp / floor heating.",
    capexFixedSek: 55000,
    capexPerKwSek: 9000,
    omFractionYr: 0.015,
    lifetimeYr: 18,
    color: "#4A90E2",
    note: "Lowest-cost heat pump; performance drops on the coldest days (often paired with an electric top-up).",
    source: "SPF: Energimyndigheten heat-pump tests & SVEP field studies. Cost: Swedish installer/manufacturer estimates (NIBE/IVT/Mitsubishi).",
    sourceUrl: "https://www.energimyndigheten.se/",
    provisional: true,
  },
  {
    id: "gshp",
    name: "Ground-source heat pump (bergvärme)",
    shortName: "Ground-source HP",
    carrier: "electricity",
    spf: { low: 3.2, base: 3.8, high: 4.5 },
    spfNote: "Higher, more stable SPF from constant ground temperature; best with low-temp distribution.",
    capexFixedSek: 70000,
    capexPerKwSek: 11000,
    groundLoopPerKwSek: 6000,
    omFractionYr: 0.010,
    lifetimeYr: 20,
    color: "#2FB477",
    note: "Highest efficiency and lowest running cost, but the priciest to install (borehole drilling). The ground loop outlives the heat pump (~50 yr).",
    source: "SPF: Swedish bergvärme field studies (Energimyndigheten / SGU). Cost incl. borehole ≈250–350 SEK/m drilling.",
    sourceUrl: "https://www.sgu.se/",
    provisional: true,
  },
  {
    id: "eahp",
    name: "Exhaust-air heat pump (frånluftsvärmepump)",
    shortName: "Exhaust-air HP",
    carrier: "electricity",
    spf: { low: 2.4, base: 2.7, high: 3.0 },
    spfNote: "Recovers heat from mechanical exhaust air; capacity is limited by the ventilation flow.",
    capexFixedSek: 40000,
    capexPerKwSek: 7000,
    omFractionYr: 0.015,
    lifetimeYr: 16,
    color: "#B98BE8",
    note: "Common in Swedish apartment blocks with mechanical exhaust ventilation; limited output, so best as a base-load or in smaller buildings.",
    source: "SPF: SVEP / Energimyndigheten frånluftsvärmepump data. Cost: Swedish installer estimates.",
    sourceUrl: "https://www.energimyndigheten.se/",
    provisional: true,
  },
  {
    id: "pellet",
    name: "Wood-pellet boiler",
    shortName: "Pellet boiler",
    carrier: "biomass",
    spf: { low: 0.82, base: 0.87, high: 0.90 },
    spfNote: "Combustion efficiency of a modern pellet boiler.",
    capexFixedSek: 60000,
    capexPerKwSek: 5000,
    omFractionYr: 0.025,
    lifetimeYr: 20,
    color: "#F97316",
    note: "Low operating carbon (biogenic) and moderate fuel cost, but needs fuel storage and more maintenance/ash handling.",
    source: "Efficiency & cost: Swedish pellet-boiler market data (Boverket / manufacturer docs).",
    sourceUrl: "https://www.boverket.se/",
    provisional: true,
  },
  {
    id: "direct_electric",
    name: "Direct electric heating",
    shortName: "Direct electric",
    carrier: "electricity",
    spf: { low: 1.0, base: 1.0, high: 1.0 },
    spfNote: "1 kWh electricity → 1 kWh heat (no upgrade of the energy).",
    capexFixedSek: 15000,
    capexPerKwSek: 2000,
    omFractionYr: 0.005,
    lifetimeYr: 20,
    color: "#E2483B",
    note: "Cheapest to install, most expensive to run — included as a worst-case efficiency reference.",
    source: "Reference case; efficiency by definition = 1.0.",
    provisional: true,
  },
];

/** Equivalent full-load hours for space heating in Gothenburg — converts annual
 *  heat demand to a design/peak kW for capex sizing. ~2000–2200 h is typical for
 *  the SW-coastal Swedish climate. Editable. */
export const GOTHENBURG_EFLH = 2100;
