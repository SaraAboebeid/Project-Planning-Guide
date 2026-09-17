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
      value: 0.20, unit: "GBP/kWh", live: true,
      source: "Octopus Energy API — Agile half-hourly rate (tracks the GB day-ahead market) for GSP region M (Yorkshire), which covers Rotherham's S60/S61/S65 postcodes",
      sourceUrl: "https://developer.octopus.energy/rest/",
      note: "Fetched live from /api/energy-price?country=gb&city=rotherham, excl. VAT — comparable to the SE spot. The same call returns the price-cap retail electricity and gas tariffs that Step 4's heating and price-scenario analyses use. 0.20 is a fallback if the feed is down.",
    },
    {
      key: "gas_price",
      label: "Gas price (Ofgem price cap, Yorkshire)",
      value: 0.079, unit: "GBP/kWh",
      source: "Ofgem energy price cap, 1 Oct–31 Dec 2026, Yorkshire region, Direct Debit: 7.90 p/kWh + 29.77 p/day standing charge (incl. 5% VAT)",
      sourceUrl: "https://www.ofgem.gov.uk/information-consumers/energy-advice-households/get-energy-price-cap-standing-charges-and-unit-rates-region",
      note: "Rotherham (91% of matched certificates heat with mains gas). Electricity under the same cap: 25.60 p/kWh + 61.67 p/day, no VAT this quarter. Update quarterly.",
    },
    {
      key: "degree_days",
      label: "Heating degree-days (HDD)",
      value: 2108, unit: "K·day/yr (base 15.5 °C)",
      source: "Met Office, Annual Heating Degree Days – Projections (12 km), cell containing Rotherham, 2001–2020 mean (OGL v3.0)",
      sourceUrl: "https://climatedataportal.metoffice.gov.uk/",
      note: "Modelled (UKCP18 12 km), not station-observed; 1981–2000 mean was 2,313. No licence-clean observed series for Sheffield/Doncaster was found.",
    },
    {
      key: "discount_rate",
      label: "Real discount rate",
      value: 0.035, unit: "fraction/yr (real)",
      source: "HM Treasury Green Book supplementary guidance: discounting (Feb 2026), 3.5% for years 1–30, 3.0% for 31–75",
      sourceUrl: "https://www.gov.uk/government/publications/green-book-supplementary-guidance-discounting",
      note: "An independent review (Jun 2026) recommends 3.0% for years 0–30; not adopted by HM Treasury — use as a sensitivity only.",
    },
    {
      key: "carbon_factor_heat",
      label: "Natural-gas heating carbon factor",
      value: 0.18296, unit: "kg CO₂e/kWh",
      source: "DESNZ GHG Conversion Factors 2025, natural gas, kWh (gross CV), scope 1 (OGL v3.0)",
      sourceUrl: "https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting",
      note: "Well-to-tank adds 0.03021. The 2026 set gives 0.18231.",
    },
    {
      key: "carbon_factor_elec",
      label: "Electricity carbon factor",
      value: 0.19553, unit: "kg CO₂e/kWh",
      source: "DESNZ GHG Conversion Factors 2025, UK electricity generation 0.17700 + transmission & distribution losses 0.01853 (OGL v3.0)",
      sourceUrl: "https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting",
      note: "The 2026 set is ~26% lower (0.13096 + 0.01299), partly from a DESNZ method change — don't mix years.",
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
    explain: "Total annual demand = the part a retrofit can't change (Q_fixed: hot water, ventilation, appliances, internal gains — derived per building from its own EnergyPlus baseline run) plus envelope transmission losses.",
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

/* ─── Methods ─────────────────────────────────────────────────────────────────
   Building-physics methods behind the numbers (distinct from the optimizer
   equations above): how a component U-value is obtained when the material
   catalogue has no manufacturer-supplied value, and how facade condition is
   assessed from UAV imagery by the deep-learning models. */

export interface MethodDoc {
  name: string;
  latexish: string;
  explain: string;
  source: string;
  sourceUrl: string;
}

export const METHODS: MethodDoc[] = [
  {
    name: "Component U-value from assembly (EN ISO 6946)",
    latexish: "U = 1 / R_tot ,   R_tot = R_si + R_se + Σ_j (d_j / λ_j)     [W/(m²·K)]",
    explain:
      "Where a catalogue material carries no manufacturer U-value, it is derived from the build-up: sum each layer's thermal resistance (thickness d ÷ design conductivity λ) plus the inside/outside surface resistances (R_si, R_se — walls 0.13/0.04, roofs 0.10/0.04, ground floors 0.17/~0). Timber-framed layers apply the ISO 6946 upper/lower-bound average so studs bypassing the insulation raise U realistically. The method was validated against the catalogue items that already carry a supplied U-value before being applied to the rest.",
    source: "EN ISO 6946:2017; design λ values from EN ISO 10456 / Swedish BBR",
    sourceUrl: "https://www.iso.org/standard/65708.html",
  },
  {
    name: "Facade condition — defect detection (Faster R-CNN)",
    latexish: "UAV image → Faster R-CNN (ResNet-50 FPN) → {crack, leakage, abscission, corrosion, bulge} + boxes",
    explain:
      "Facade condition is assessed from UAV imagery with a supervised object detector trained on the MBDD2025 dataset — 14,471 facade images annotated in PASCAL-VOC format with bounding boxes over five defect classes (crack, leakage, abscission, corrosion, bulge). The dataset is split image-wise 70/15/15 into 10,129 training, 2,170 validation and 2,172 test images under a fixed random seed, so no image appears in more than one split. Three configurations of Faster R-CNN with a ResNet-50 FPN backbone were trained: (1) a baseline initialised from random weights and trained for 10 epochs; (2) transfer learning from COCO-pretrained weights with the box predictor head replaced for six classes (five defects + background), fine-tuned for 20 epochs at a learning rate of 5×10⁻⁵; (3) an FPN-v2 backbone with data augmentation — random horizontal flip with matching box transform, plus photometric jitter of brightness, contrast and saturation (±0.3) and hue (±0.05) — trained for 30 epochs. All runs use AdamW with a batch size of 8, and the checkpoint with the best validation F1 is retained. Reported metrics are per-class and mean precision, recall and F1 on the held-out test split.",
    source:
      "MBDD2025 facade-defect dataset (UAV, PASCAL-VOC); Ren et al., Faster R-CNN; PyTorch 2.1.2 / torchvision 0.16.2 / CUDA 12.1 on NVIDIA A40, Chalmers C3SE Vera cluster",
    sourceUrl: "https://arxiv.org/abs/1506.01497",
  },
  {
    name: "Facade condition — defect segmentation (U-Net, RGB + IR)",
    latexish: "concat(RGB₃, IR₁) → 4-channel U-Net → per-pixel defect mask   (mIoU, Dice)",
    explain:
      "Where the extent of a defect matters rather than just its presence, a segmentation model is trained on the BFDD dataset — 838 spatially aligned RGB and infrared image pairs with per-pixel defect masks — using the same image-wise 70/15/15 split and fixed seed as the detection stage. The RGB and IR channels are concatenated into a single 4-channel input so the thermal signature (moisture, thermal bridging, detachment behind an intact surface) is available to the network alongside the visible-light evidence. A U-Net is trained for 40 epochs, and performance is reported as mean intersection-over-union (mIoU) and Dice coefficient on the held-out test split. Training for both stages was executed on an NVIDIA A40 GPU on the Chalmers C3SE Vera cluster.",
    source:
      "BFDD RGB+IR facade-defect dataset (838 aligned pairs, per-pixel masks); Ronneberger et al., U-Net; PyTorch 2.1.2 / torchvision 0.16.2 / CUDA 12.1 on NVIDIA A40, Chalmers C3SE Vera cluster",
    sourceUrl: "https://arxiv.org/abs/1505.04597",
  },
];

/* ─── Attribution ────────────────────────────────────────────────────────────
   The multi-objective MILP formulation (decision variables, the cost / carbon /
   energy objective functions and constraints above) is based on the work of
   Jenny Enerbäck and Ann-Brith Strömberg. */

export const OPTIMIZER_ATTRIBUTION = {
  names: ["Jenny Enerbäck", "Ann-Brith Strömberg"],
  text:
    "The optimization model — its multi-objective MILP formulation and the cost, carbon and energy equations above — is based on the work of Jenny Enerbäck and Ann-Brith Strömberg.",
};
