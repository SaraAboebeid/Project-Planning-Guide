/* ─────────────────────────────────────────────────────────────────────────────
   Optimization assumptions — the 5 economy/climate parameters the MILP needs to
   turn physics (areas × U-values) into the three KPIs (cost, carbon, energy),
   for Sweden and the UK. Every value is cited; equations documented below.

   These are surfaced in the Data Explorer ("Optimization assumptions").

   NOTE: values marked `provisional: true` still need to be confirmed against the
   cited source (web access was down when scaffolding). Energy price is fetched
   LIVE from /api/energy-price (Nord Pool) — the number here is only a fallback.
   ───────────────────────────────────────────────────────────────────────────── */

export type Country = "SE" | "UK";

export interface Assumption {
  key: string;
  label: string;
  value: number | null;      // null when taken live (e.g. energy price)
  unit: string;
  source: string;            // human-readable citation
  sourceUrl: string;
  note?: string;
  provisional?: boolean;     // true = value not yet verified against the source
  live?: boolean;            // true = fetched at run time, `value` is a fallback
}

/* ─── The five parameters, per country ───────────────────────────────────── */

export const ASSUMPTIONS: Record<Country, Assumption[]> = {
  SE: [
    {
      key: "energy_price",
      label: "Electricity price (day-ahead spot)",
      value: 0.8, unit: "SEK/kWh", live: true,
      source: "Nord Pool day-ahead spot via elprisetjustnu.se (zone SE3, Gothenburg)",
      sourceUrl: "https://www.elprisetjustnu.se",
      note: "Fetched live per request from /api/energy-price?country=se. Spot only — excl. VAT, grid fee and energy tax. The 0.8 value is a fallback if the feed is down.",
    },
    {
      key: "degree_days",
      label: "Heating degree-days (HDD)",
      value: 3300, unit: "K·day/yr (base 15.5 °C)", provisional: true,
      source: "Eurostat heating degree-days (nrg_chdd); national SE = 4 919 in 2022, Gothenburg (SE23, coastal SW) is milder",
      sourceUrl: "https://ec.europa.eu/eurostat/databrowser/view/nrg_chdd_a/default/table",
      note: "Drives F_dh = 24·HDD/1000. Regional SE23 estimate (~10–20% below national); refine with SMHI station data for Gothenburg/Landvetter if a station value is preferred.",
    },
    {
      key: "discount_rate",
      label: "Real discount rate",
      value: 0.03, unit: "fraction/yr (real)",
      source: "EU cost-optimal framework (Delegated Reg. 244/2012), societal real rate; applied by Boverket for building energy LCC",
      sourceUrl: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32012R0244",
      note: "3% real is the EU cost-optimal societal rate; Swedish LCC studies commonly use 1–5% real (nominal 3/5/7% at 2% inflation). Change per client hurdle rate.",
    },
    {
      key: "carbon_factor_heat",
      label: "District-heating carbon factor (Gothenburg)",
      value: 0.022, unit: "kg CO₂e/kWh",
      source: "Göteborg Energi — Miljövärden för levererad fjärrvärme 2025 (19 g combustion + 3 g fuel transport/production, life-cycle)",
      sourceUrl: "https://www.goteborgenergi.se/foretag/fjarrvarme/miljo-och-klimat",
      note: "Gothenburg DH is largely waste-heat recovery (Renova), so operational heat carbon is small vs embodied carbon of materials.",
    },
    {
      key: "carbon_factor_elec",
      label: "Electricity carbon factor",
      value: 0.03, unit: "kg CO₂e/kWh", provisional: true,
      source: "Swedish electricity production mix (Energiföretagen / Naturvårdsverket); Göteborg Energi's own supplied electricity = 0 g (renewable)",
      sourceUrl: "https://www.naturvardsverket.se/",
      note: "Swedish grid is low-carbon (hydro/nuclear/wind). Production mix ~10–40 g/kWh; Nordic residual mix is far higher — pick per accounting method.",
    },
  ],
  UK: [
    {
      key: "energy_price",
      label: "Electricity price (wholesale-tracking)",
      value: 0.23, unit: "GBP/kWh", live: true,
      source: "Octopus Agile half-hourly rate (tracks GB wholesale/day-ahead), region C = London",
      sourceUrl: "https://octopus.energy/agile/",
      note: "Fetched live per request from /api/energy-price?country=uk. Excl. VAT — comparable to the SE spot. The 0.23 value is a fallback if the feed is down.",
    },
    {
      key: "degree_days",
      label: "Heating degree-days (HDD)",
      value: 2033, unit: "K·day/yr (base 15.5 °C)", provisional: true,
      source: "CIBSE / degreedays.net, London (Thames Valley)",
      sourceUrl: "https://www.degreedays.net/",
      note: "TO VERIFY the 20-yr average for the relevant UK region + base temperature.",
    },
    {
      key: "discount_rate",
      label: "Real discount rate",
      value: 0.035, unit: "fraction/yr (real)",
      source: "HM Treasury Green Book, social time preference rate (3.5%, declining for long horizons)",
      sourceUrl: "https://www.gov.uk/government/publications/the-green-book-appraisal-and-evaluation-in-central-governent",
      note: "3.5% real for horizons ≤30 yr; declines thereafter. Standard UK appraisal rate.",
    },
    {
      key: "carbon_factor_heat",
      label: "Natural-gas heating carbon factor",
      value: 0.18290, unit: "kg CO₂e/kWh",
      source: "UK Government GHG Conversion Factors 2024 (DESNZ/DEFRA), natural gas, kWh gross CV",
      sourceUrl: "https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2024",
      note: "Most UK homes heat with gas. A 2025 factor set is also published — update yearly.",
    },
    {
      key: "carbon_factor_elec",
      label: "Electricity carbon factor",
      value: 0.20705, unit: "kg CO₂e/kWh",
      source: "UK Government GHG Conversion Factors 2024 (DESNZ/DEFRA), electricity generation (location-based)",
      sourceUrl: "https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2024",
      note: "Declines yearly as the grid decarbonises; update to the latest published set.",
    },
  ],
};

/* ─── Equations used by the optimizer ────────────────────────────────────────
   Documented here and shown in the Data Explorer so the KPI maths is traceable. */

export interface EquationDoc {
  name: string;
  latexish: string;      // plain-text formula
  explain: string;
}

export const EQUATIONS: EquationDoc[] = [
  {
    name: "Transmission heat-loss coefficient",
    latexish: "H_tr,b = Σ_c Σ_o  A_b,c · U_b,c,o · x_b,c,o     [W/K]",
    explain: "For each building b, sum over components c and options o: component area × the chosen option's U-value. x is the binary select-one decision.",
  },
  {
    name: "Degree-hour factor",
    latexish: "F_dh = 24 · HDD / 1000     [kWh per (W/K) per year]",
    explain: "Converts a W/K heat-loss coefficient into annual kWh, using heating degree-days (HDD) for the location. 24 h/day, /1000 for Wh→kWh.",
  },
  {
    name: "Annual heating energy",
    latexish: "Q_b = Q_fixed,b + H_tr,b · F_dh     [kWh/yr]",
    explain: "Total annual demand = the part a retrofit can't change (Q_fixed: hot water, ventilation, appliances, internal gains — derived per building from its EPC) plus envelope transmission losses.",
  },
  {
    name: "Discount factor (present value)",
    latexish: "PV = FV / (1 + r)^t",
    explain: "Future costs/impacts in year t are discounted to today at the real discount rate r.",
  },
  {
    name: "Total cost (KPI)",
    latexish: "total_cost = Σ initial_cost + Σ replacement_cost/(1+r)^t_repl + Σ_{y=1..N} (Q_b · price)/(1+r)^y",
    explain: "Initial material+install cost, plus replacements discounted to their service-life year, plus discounted operating-energy cost over the study period N.",
  },
  {
    name: "Total carbon (KPI)",
    latexish: "total_carbon = Σ embodied_initial + Σ embodied_replacement + Σ_{y=1..N} Q_b · carbon_factor",
    explain: "Initial embodied carbon of the chosen options, plus embodied carbon of replacements within the study period, plus operational carbon (energy × grid/heat carbon factor). Operational carbon is usually not discounted.",
  },
];

export function assumptionsFor(country: Country): Assumption[] {
  return ASSUMPTIONS[country];
}
