---
description: Building-physics and retrofit domain expertise — U-values and EN ISO 6946, EPC/energideklaration data, TABULA archetypes, renovation packages and their EnergyPlus simulation, and the Swedish/UK data chains. Use for questions about thermal performance, insulation, energy class, EPC matching, retrofit measures, heating demand, or the Step 3/4 renovation workflow.
when_to_use: U-value, insulation, thermal bridge, energy class, EPC, energideklaration, ATEMP, retrofit measure, renovation package, heating demand, EPSM, EnergyPlus, TABULA, BBR, window replacement, facade
---

# Building renovation expert

## U-values — EN ISO 6946

```
U = 1 / R_tot ,   R_tot = R_si + R_se + Σ (d_j / λ_j)      [W/(m²·K)]
```

Surface resistances (m²·K/W): walls `R_si 0.13 / R_se 0.04`; roofs `0.10 / 0.04`; attic floors `0.10 / 0.10`; floor to crawl space `0.17 / 0.04`.

Design conductivities λ (W/m·K), per ISO 10456 / Swedish BBR: mineral & glass wool batts **0.036**, settled loft wool 0.040, blown glass 0.044 / stone 0.041, cellulose 0.040, wood fibre 0.038, EPS 0.036, timber **0.14**, gypsum 0.25, CLT 0.13, concrete 1.7.

**Always apply a repeating-thermal-bridge correction for framed constructions** — timber studs bypass the insulation. Use the ISO 6946 upper/lower-bound average; framing fraction ≈ 0.09 walls, 0.08 timber roofs, 0.10 crawl floors; ≈0 for crossed double-stud or loose-fill layers. Ignoring it understates U materially. Empty (M0) stud cavities take the capped air-gap R = 0.18.

Values in `wikellsData.ts` that were computed this way are marked in the file header; Wikells-supplied values are authoritative — don't overwrite them.

## As-built defaults (`tools/idf/defaults.py`)

Used when a building has no per-component U: **wall 0.40, roof 0.30, window 1.80, floor 0.40**. Setpoints 21 °C heating / 25 °C cooling, infiltration 0.5 ACH, SHGC 0.60, default WWR 0.15 (by use type). These are the baseline the optimiser anchors against — if you change them, the anchoring changes too.

## The Sweden data chain

```
EUBUCCO (OSM geometry — no address, no cadastral)
   └─ geometric overlap →
Lantmäteriet footprint (FormularId, fastighetsbeteckning, husnummer)
   └─ FormularId, else cadastral fallback →
EPC / energideklaration (Boverket)
```

Key EPC fields: `EgiSpecifikEnergianvandning` (kWh/m²/yr), `EgiEnergiklass` (A–G), `EgenAtemp` (heated area), `EgenNybyggAr`, `IdAdr`, `IdFastBet`, `IdHusnr`.

**Known coverage gap:** ~31,700 footprints in the Gothenburg bbox (19,900 of them heated) have *blank cadastral and no FormularId* — concentrated in the old town inside Vallgraven. They cannot link to an EPC by either key, because the EPC has no coordinates and the footprint has no address. Bridging them needs an external address→coordinate dataset. Don't mistake this for a bug in the matching SQL.

**The EPC export holds no owner data** (262 fields, none for `Ägarens namn`). Owner appears only in the full Boverket document, which is CAPTCHA-gated — it is not bulk-retrievable.

## UK chain

TABULA GB archetypes (`frontend/public/uk/tabula_gb.json`) supply as-built U-values by build period and use; `REFURB_TIERS` give whole-building refurbishment tiers instead of per-component materials. **UK cost/carbon is synthetic placeholder data** — energy is real (EnergyPlus), cost/carbon is not.

## Renovation packages → EnergyPlus

Step 3 (`BaselineSetup.tsx`) runs the as-built baseline; Step 4 (`RenovationSimulator.tsx`) builds packages and compares.

A package is one material choice per component. `overridesFromSeSelections` maps the chosen material's `uValue` → `u_wall_override` / `u_roof_override` / `u_win_override` / `u_floor_override`, which rebuild the shoebox IDF's `Material:NoMass` layers. **A material with no `uValue` is silently skipped and leaves energy at baseline** — so every selectable envelope material must carry one.

Multi-selecting materials generates the **cartesian product** of packages, each auto-named from its materials, confirmed in a modal, then submitted as one EPSM batch across every selected building.

EPSM runs in Docker on **:8010** (`docker-compose.epsm.yml`). If simulations fail, check Docker Desktop is running first — that's the usual cause. Sweden must send `city_id: "gothenburg"`; UK omits it and the server resolves the district from lat/lon.

**Cooling is always 0** — a single-zone shoebox limitation, not a bug. Don't present cooling savings as meaningful.

## Judgement

Retrofit sequencing matters: envelope before plant, or you oversize the new system. Watch for unintended consequences — added insulation and airtightness without ventilation upgrades risks moisture and indoor-air problems; report that when a package pushes U low without touching ventilation. Deep retrofit in a low-carbon-heat city (Gothenburg DH ≈ 0.022 kg CO₂e/kWh) often has a poor *carbon* case even with a good *energy* case — say so explicitly rather than letting the energy number stand alone.
