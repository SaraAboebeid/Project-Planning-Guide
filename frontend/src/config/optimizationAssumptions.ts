/* ─────────────────────────────────────────────────────────────────────────────
   Optimization assumptions — the 5 economy/climate parameters the MILP needs to
   turn physics (areas × U-values) into the three KPIs (cost, carbon, energy),
   for Sweden, the UK and Belgium. Every value is cited; equations documented
   below. RenovationSimulator READS these values (assumptionValue), so what the
   Data Explorer shows is what the optimiser uses.

   These are surfaced in the Data Explorer ("Optimization assumptions").

   NOTE: values marked `provisional: true` still need to be confirmed against the
   cited source (web access was down when scaffolding). Energy price is fetched
   LIVE from /api/energy-price (Nord Pool) — the number here is only a fallback.
   ───────────────────────────────────────────────────────────────────────────── */

export type Country = "SE" | "UK" | "BE";

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
  /** Where the tool uses it — shown in the Data Explorer so every number is traceable. */
  usedIn?: string;
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
      key: "gas_price",
      label: "Gas price (Ofgem price cap, Yorkshire)",
      value: 0.079, unit: "GBP/kWh", live: true,
      source: "Ofgem energy price cap, 1 Oct–31 Dec 2026, Yorkshire region, Direct Debit: 7.90 p/kWh + 29.77 p/day standing charge (incl. 5% VAT); fetched live via the Octopus Energy API",
      sourceUrl: "https://www.ofgem.gov.uk/information-consumers/energy-advice-households/get-energy-price-cap-standing-charges-and-unit-rates-region",
      note: "THE energy price of the UK optimiser: 91% of matched Rotherham certificates heat with mains gas. Divided by the boiler efficiency below to price useful heat (7.90 p ÷ 0.85 ≈ 9.3 p per kWh of heat). 0.079 is the fallback if the feed is down. Update quarterly.",
      usedIn: "Step 4 optimiser and 30-yr cost · Step 4 Systems · Step 5 price scenarios",
    },
    {
      key: "boiler_efficiency",
      label: "Gas boiler seasonal efficiency",
      value: 0.85, unit: "fraction", provisional: true,
      source: "Assumed typical seasonal efficiency of a gas condensing boiler in a UK home (SAP 10.2 / PCDB condensing combis are mostly in the mid-80s %)",
      sourceUrl: "https://www.gov.uk/guidance/standard-assessment-procedure",
      note: "Turns gas bought into heat delivered. Not taken per house from the EPC yet — a newer or older boiler shifts every package's energy cost and carbon by the same factor, so the ranking holds.",
      usedIn: "Step 4 optimiser (gas price and gas carbon ÷ efficiency)",
    },
    {
      key: "degree_days",
      label: "Heating degree-days (HDD)",
      value: 2108, unit: "K·day/yr (base 15.5 °C)",
      source: "Met Office, Annual Heating Degree Days – Projections (12 km), cell containing Rotherham, 2001–2020 mean (OGL v3.0)",
      sourceUrl: "https://climatedataportal.metoffice.gov.uk/",
      note: "Modelled (UKCP18 12 km), not station-observed; 1981–2000 mean was 2,313. No licence-clean observed series for Sheffield/Doncaster was found.",
      usedIn: "Step 4 optimiser (F_dh)",
    },
    {
      key: "discount_rate",
      label: "Real discount rate",
      value: 0.035, unit: "fraction/yr (real)",
      source: "HM Treasury Green Book supplementary guidance: discounting (Feb 2026), 3.5% for years 1–30, 3.0% for 31–75",
      sourceUrl: "https://www.gov.uk/government/publications/green-book-supplementary-guidance-discounting",
      note: "An independent review (Jun 2026) recommends 3.0% for years 0–30; not adopted by HM Treasury — use as a sensitivity only.",
      usedIn: "Step 4 optimiser and 30-yr cost · Step 5 price scenarios",
    },
    {
      key: "carbon_factor_heat",
      label: "Natural-gas carbon factor (incl. well-to-tank)",
      value: 0.21317, unit: "kg CO₂e/kWh",
      source: "DESNZ GHG Conversion Factors 2025, natural gas, kWh (gross CV): scope 1 combustion 0.18296 + well-to-tank 0.03021 (OGL v3.0)",
      sourceUrl: "https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting",
      note: "Life-cycle (combustion + upstream), like the Swedish district-heating factor. Divided by the boiler efficiency for heat delivered. The 2026 set gives 0.18231 for combustion.",
      usedIn: "Step 4 optimiser and 30-yr carbon · Step 4 Systems",
    },
    {
      key: "electricity_price",
      label: "Electricity price (Ofgem price cap, Yorkshire)",
      value: 0.256, unit: "GBP/kWh", live: true,
      source: "Ofgem energy price cap, 1 Oct–31 Dec 2026, Yorkshire, Direct Debit: 25.60 p/kWh + 61.67 p/day; fetched live via the Octopus Energy API",
      sourceUrl: "https://www.ofgem.gov.uk/information-consumers/energy-advice-households/get-energy-price-cap-standing-charges-and-unit-rates-region",
      note: "Not used by the envelope optimiser (homes heat with gas). Used for heat pumps in Systems and for the electricity share of the blended price in Step 5.",
      usedIn: "Step 4 Systems · Step 5 price scenarios",
    },
    {
      key: "carbon_factor_elec",
      label: "Electricity carbon factor",
      value: 0.19553, unit: "kg CO₂e/kWh",
      source: "DESNZ GHG Conversion Factors 2025, UK electricity generation 0.17700 + transmission & distribution losses 0.01853 (OGL v3.0)",
      sourceUrl: "https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting",
      note: "The 2026 set is ~26% lower (0.13096 + 0.01299), partly from a DESNZ method change — don't mix years.",
      usedIn: "Step 4 Systems (heat pumps)",
    },
  ],
  BE: [
    {
      key: "energy_price",
      label: "Gas price (household, all-in)",
      value: 0.078, unit: "EUR/kWh", provisional: true,
      source: "Belgian average residential natural-gas price, September 2025, all taxes and fees included (GlobalPetrolPrices, from CREG data)",
      sourceUrl: "https://www.globalpetrolprices.com/Belgium/natural_gas_prices/",
      note: "THE energy price of the Belgian optimiser — most Belgian homes heat with gas. Divided by the boiler efficiency below to price useful heat (0.078 ÷ 0.85 ≈ 0.092 €/kWh of heat). Not live: refresh from CREG's monthly price report.",
      usedIn: "Step 4 optimiser and 30-yr cost",
    },
    {
      key: "boiler_efficiency",
      label: "Gas boiler seasonal efficiency",
      value: 0.85, unit: "fraction", provisional: true,
      source: "Assumed typical seasonal efficiency of a gas boiler in a Belgian home (same assumption as the UK)",
      sourceUrl: "https://www.energids.be/",
      note: "Not taken per building (no per-building EPB data). Shifts every package's energy cost and carbon by the same factor, so the ranking holds.",
      usedIn: "Step 4 optimiser (gas price and gas carbon ÷ efficiency)",
    },
    {
      key: "degree_days",
      label: "Heating degree-days (HDD)",
      value: 1820, unit: "K·day/yr (base 15.5 °C)",
      source: "Computed from the Uccle TMYx 2011–2025 weather file the simulation uses (climate.onebuilding.org); Liège Airport TMYx gives 2,001",
      sourceUrl: "https://climate.onebuilding.org/",
      note: "Same base as the SE/UK values. Step 4 uses 2,001 for Liège and 1,820 for Brussels and Ghent.",
      usedIn: "Step 4 optimiser (F_dh)",
    },
    {
      key: "discount_rate",
      label: "Real discount rate",
      value: 0.03, unit: "fraction/yr (real)",
      source: "EU cost-optimal framework (Delegated Reg. 244/2012), societal real rate",
      sourceUrl: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32012R0244",
      usedIn: "Step 4 optimiser and 30-yr cost",
    },
    {
      key: "carbon_factor_heat",
      label: "Natural-gas heating carbon factor",
      value: 0.202, unit: "kg CO₂e/kWh",
      source: "IPCC 2006 Guidelines default for natural gas, 56.1 t CO₂/TJ (combustion, net CV)",
      sourceUrl: "https://www.ipcc-nggip.iges.or.jp/public/2006gl/vol2.html",
      note: "Combustion only (the UK factor includes well-to-tank, so BE is ~10–20% lower by method, not by fact). Divided by the boiler efficiency for heat delivered.",
      usedIn: "Step 4 optimiser and 30-yr carbon",
    },
  ],
};

/* ─── Model assumptions shared by every country ─────────────────────────────
   Not economy/climate data but modelling choices — listed so they are as
   visible as the numbers above. */
export const MODEL_ASSUMPTIONS: Assumption[] = [
  {
    key: "study_period",
    label: "Study period",
    value: 30, unit: "years",
    source: "Modelling choice; typical LCC horizon for envelope measures (EU cost-optimal framework uses 30 years for residential buildings)",
    sourceUrl: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32012R0244",
    note: "Energy use, price and carbon factor are held constant over the period (no price escalation, no grid decarbonisation, no component replacements) — Step 5 tests price futures.",
    usedIn: "Optimiser · 30-yr cost and carbon · Step 5",
  },
  {
    key: "air_change",
    label: "Air leakage + ventilation (kept as-built)",
    value: 0.5, unit: "air changes/h",
    source: "Typical residential air-change rate; heat-loss coefficient 0.34 Wh/(m³·K) × n × volume (EN ISO 13789)",
    sourceUrl: "https://www.iso.org/search.html?q=13789",
    note: "Envelope retrofits don't change it here. Including it — and the envelope parts you didn't pick — stops the fast model blaming ALL heating on the walls/roof being retrofitted.",
    usedIn: "Optimiser (heat-loss share)",
  },
  {
    key: "transmission_scale",
    label: "Calibration to the EnergyPlus baseline",
    value: null, unit: "per building",
    source: "Derived per run: k = EnergyPlus baseline heating ÷ (H_tr × F_dh)",
    sourceUrl: "https://energyplus.net/",
    note: "The degree-day loss ignores sun and internal gains, so it overshoots; k scales it so the curve passes exactly through the simulated baseline. Hot water, lighting and equipment stay fixed. Estimates are still usually somewhat optimistic — simulate shortlisted packages.",
    usedIn: "Optimiser",
  },
];

/* ─── Where the cost and carbon of each OPTION come from (per country) ────── */
export const OPTION_DATA_SOURCES: Record<Country, { label: string; text: string }[]> = {
  SE: [
    { label: "Cost", text: "Wikells Sektionsfakta 2024 — installed section prices (materials + labour), SEK/m². Layer build-ups are priced from the nearest real Wikells assembly matched on the U-value of the NEW layers only, so adding to or replacing a wall costs the same for the same materials." },
    { label: "Carbon", text: "Boverket klimatdatabas — A1–A3 per material (thickness × density × GWP)." },
  ],
  UK: [
    { label: "Cost — your build-ups", text: "UK Renovation Materials Catalogue (Oct 2026): material prices incl. VAT, excluding labour and installation. Only materials with BOTH a price and an embodied-carbon value are offered (44 of 60 rows)." },
    { label: "Cost — no build-ups saved", text: "DESNZ private-rented-homes impact assessment (2026), Table 20 installed costs, 2020 prices ex VAT (OGL v3.0)." },
    { label: "Carbon", text: "Catalogue A1–A3 per material; DESNZ GHG material factors for the DESNZ measure set; Boverket typical values for windows (DESNZ has no window product)." },
    { label: "Window U-values", text: "Typical whole-window U per type (uPVC/timber double ≈ 1.4, triple ≈ 0.8–0.9) — the catalogue gives prices, not U-values; priced per window of 1.4 m²." },
  ],
  BE: [
    { label: "Cost", text: "Belgium Renovation Materials Catalogue (Oct 2026): material prices incl. VAT, excluding labour. Only materials with BOTH a price and an embodied-carbon value are offered (35 of 60 rows — no window type has a price yet, so the only window option is replacing the glass unit). TABULA refurbishment tiers carry no cost." },
    { label: "Carbon", text: "Catalogue A1–A3 per material." },
    { label: "Window U-values", text: "Typical whole-window U per type (as UK); priced per window of 1.4 m²." },
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
    name: "Heat-loss coefficient incl. kept parts and air leakage",
    latexish: "H_b = Σ_picked A·U_option + Σ_kept A·U_as-built + 0.34 · n · V     [W/K]",
    explain: "Envelope parts with no build-up saved stay at their as-built U, and ventilation/infiltration (n = 0.5 air changes/h over the heated volume V) is a fixed loss — so a wall retrofit only claims its own share of the heating.",
  },
  {
    name: "Annual energy, calibrated to EnergyPlus",
    latexish: "Q_b = Q_fixed,b + k_b · H_b · F_dh ,   k_b = Q_heat,EP / (H_b,as-built · F_dh) ,   Q_fixed,b = Q_total,EP − Q_heat,EP     [kWh/yr]",
    explain: "Q_fixed (hot water, lighting, equipment) is what a retrofit can't change; k scales the degree-day loss (which ignores sun and internal gains) so the model reproduces the building's own EnergyPlus baseline heating exactly. When the degree-day loss is smaller than the simulated heating, k = 1 and the rest of the heating is held fixed.",
  },
  {
    name: "Price and carbon of heat delivered (UK, Belgium)",
    latexish: "price_heat = gas_price / η_boiler ,   cf_heat = cf_gas / η_boiler",
    explain: "Gas-heated homes pay for (and emit from) the gas burned, not the heat delivered, so both are divided by the boiler's seasonal efficiency η (0.85). Sweden uses the district-heating price and factor directly.",
  },
  {
    name: "Annuity factor (present value of 30 years)",
    latexish: "AF = Σ_{y=1..N} 1/(1 + r)^y      (N = 30, r = 3 % → AF ≈ 19.6)",
    explain: "A cost that recurs every year for N years is worth AF × one year's cost today, at the real discount rate r.",
  },
  {
    name: "30-year cost (LCC, KPI)",
    latexish: "total_cost = Σ upfront_cost + Q_b · price_heat · AF",
    explain: "Upfront cost of the chosen options plus the discounted energy bill over the study period. Component replacements within the period (service life) are NOT modelled yet — the original formulation includes them; for envelope insulation (service life ≥ 30 yr) the effect is small, for windows it is not.",
  },
  {
    name: "30-year carbon (KPI)",
    latexish: "total_carbon = Σ embodied_A1–A3 + Q_b · cf_heat · N",
    explain: "Embodied carbon of the chosen options plus 30 years of operational carbon (not discounted). Replacement embodied carbon is not modelled yet (as above).",
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
