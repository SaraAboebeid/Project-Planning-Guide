---
description: Life-cycle assessment for building retrofit — embodied vs operational carbon, EN 15978 modules, carbon factors and their sources, service life and replacement cycles, discounting, and the licence limits on emission databases. Use for any question about carbon, GWP, CO2e, embodied impact, LCA boundaries, environmental KPIs, or the carbon side of the optimiser.
when_to_use: embodied carbon, GWP, kg CO2e, carbon factor, life-cycle cost, LCC, EPD, service life, replacement, study period, discount rate, Boverket klimatdatabas, environmental impact
---

# LCA expert — carbon accounting in this project

## Licence constraint — read first

The **ICE Database is under an Educational licence: never reproduce its figures** in code, output, UI, or committed data. Cite it as a method reference only. Use Boverket's Klimatdatabas (open) for Swedish embodied carbon instead.

## System boundary used here

Simplified **EN 15978** boundary:

| Module | Included? | Where it comes from |
|---|---|---|
| A1–A3 product | ✔ | Boverket Klimatdatabas, per material |
| A4–A5 transport/install | ✖ | not modelled |
| B4 replacement | ✔ *when service life < study period* | `SERVICE_LIFE` in `materialProperties.ts` |
| B6 operational energy | ✔ | EnergyPlus/EPSM result × carbon factor |
| C / D end-of-life, benefits | ✖ | not modelled |

Always state the boundary when reporting a carbon number. An embodied-only figure and a whole-life figure are not comparable.

## Carbon factors (cited — keep the citation with the number)

| Factor | Value | Source |
|---|---|---|
| Gothenburg district heating | **0.022** kg CO₂e/kWh | Göteborg Energi, *Miljövärden för levererad fjärrvärme 2025* (19 g combustion + 3 g fuel transport, life-cycle) |
| Swedish electricity | 0.03 kg CO₂e/kWh *(provisional)* | SE production mix — hydro/nuclear/wind. Residual mix is far higher; state which method you used |
| UK natural gas | **0.18290** kg CO₂e/kWh | UK Govt GHG Conversion Factors 2024 (DESNZ/DEFRA), gross CV |
| UK electricity | **0.20705** kg CO₂e/kWh | UK Govt GHG Conversion Factors 2024, location-based |

Gothenburg DH is largely recovered waste heat, so **operational carbon is small relative to embodied** — a retrofit there can easily cost more carbon than it saves. Always check the embodied/operational balance before calling a package "greener"; this is the single most common error in Swedish retrofit LCA.

UK electricity decarbonises yearly — re-check the factor set annually.

## The equations (as implemented)

```
total_carbon = Σ embodied_initial
             + Σ embodied_replacement          (service life < study period)
             + Σ_{y=1..N} Q_b · carbon_factor  (operational)
```

- **Study period N = 30 years** by default.
- **Operational carbon is NOT discounted** (physical emissions, not money). Costs *are* discounted: real rate 3% SE (EU Delegated Reg. 244/2012) / 3.5% UK (HM Treasury Green Book).
- Life-cycle cost uses the annuity factor `Σ 1/(1+r)^y`.

Carbon payback = embodied carbon ÷ annual operational saving. Report it — with a low-carbon heat supply it can exceed the material's service life, which is the decision-relevant finding.

## In the code

- Embodied lookup: `estimateCarbon(item, boverketResources)` in `utils/materialRecommendation.ts`, fed by `GET /api/boverket/materials`.
- Assumptions, equations and sources are surfaced to users in the Data Explorer via `config/optimizationAssumptions.ts` (`ASSUMPTIONS`, `EQUATIONS`, `METHODS`) → `components/OptimizationAssumptions.tsx`. **Sweden and UK have separate Data Explorer pages** — keep each page's numbers to its own country.
- Optimiser carbon objective: `POST /api/optimize`.

## Rules

Every factor carries its source and vintage. Values not yet verified against their source are flagged `provisional: true` and rendered with a PROVISIONAL badge — don't quietly drop that flag. If a material has no carbon data, show "not available"; never substitute a plausible-looking number. UK cost/carbon in the renovation calculator is **synthetic placeholder data** (`ukPlaceholderCostCarbon.ts`) — never present it as real.
