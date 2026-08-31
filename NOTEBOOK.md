# Project Notebook — Methods in Detail

**Compiled 2026-08-27.** Every method in this tool, in the order data moves
through it: what each step does, **why it is done that way**, what the sources
are, what post-processing is applied, and where each one breaks.

## How this differs from the other two documents

| Document | Answers | Depth |
|---|---|---|
| [CODEMAP.md](CODEMAP.md) | *Where is the code?* | One line per file |
| [logbook/](logbook/) (Streamlit) | *What are the stages?* | A page per stage, browsable |
| **This notebook** | *Why is it done this way, and exactly how?* | Full method, thresholds, rationale, failure modes |

Read this when you need to defend a number, reproduce a result, or change a
method without breaking an assumption somewhere else.

## Conventions used here

- **Verified** — read from the code on the compile date. Everything unmarked is verified.
- **Open** — genuinely not established; listed in §16 rather than guessed at.
- Constants are quoted with their source file so they can be checked.
- Figures labelled *live* were read from the running app and move as data is rebuilt.

---

## Contents

**I — Context**
1. [Project context and lineage](#1-project-context-and-lineage)
2. [What the tool answers, and the user's path through it](#2-what-the-tool-answers-and-the-users-path-through-it)

**II — Data**
3. [Sources, one by one](#3-sources-one-by-one)

**III — Pipelines**
4. [The Sweden pipeline](#4-the-sweden-pipeline)
5. [The UK pipeline](#5-the-uk-pipeline)

**IV — Modelling**
6. [Digital twin construction](#6-digital-twin-construction)
7. [From building record to EnergyPlus model](#7-from-building-record-to-energyplus-model)
8. [Simulation](#8-simulation)

**V — Decision support**
9. [Retrofit prioritisation](#9-retrofit-prioritisation)
10. [Optimisation](#10-optimisation)
11. [Decision under uncertainty](#11-decision-under-uncertainty)

**VI — Analysis**
12. [Façade inspection and defect ML](#12-façade-inspection-and-defect-ml)
13. [Environmental analysis](#13-environmental-analysis)

**VII — Record**
14. [Validation and limitations](#14-validation-and-limitations)
15. [Reproducing everything](#15-reproducing-everything)
16. [Open questions](#16-open-questions)

---

# 1. Project context and lineage

This tool continues **DT4PED — Digital Twin for Positive Energy Districts**,
carrying that work from the scale of a single district to **national and
European** scale.

The change of scale is not cosmetic. It is the constraint that produced most of
the engineering decisions in this notebook, in three specific ways.

**Bespoke data stops being possible.** A district can be surveyed door to door.
A country cannot. Every input here is therefore an open register — EUBUCCO,
national certificate registers, TABULA, national statistics — and every register
has partial coverage. That single fact is why the pipelines are mostly
*matching* and *fallback* logic rather than loading (§4, §5), and why every
derived value carries a confidence (§9).

**Volume changes the algorithms.** ~93,000 buildings in one city is why the
viewer batches geometry into a single primitive rather than one entity per
building (§6), and why the optimiser filters analytically before spending
EnergyPlus runs (§10).

**One country is not a demonstration.** The UK track exists to test whether the
method generalises. It shares **no acquisition code** with the Swedish chain —
different geometry source, different join key, different fallback — and only the
output schema is common. That is precisely the test: if the method travels, the
same viewer and the same wizard should work on data acquired a completely
different way. They do (§5, §6).

The most direct technical inheritance from DT4PED is the optimisation model
(§10), adapted from work by Jenny Enerbäck and Ann-Brith Strömberg.

---

# 2. What the tool answers, and the user's path through it

The tool answers, for a portfolio of real buildings: **which should be renovated
first, with what package, and how confident can we be?**

The user's path is a five-step wizard. Steps 3–5 branch on project type — the
Renovation track and the Energy-Community / Renewable-Energy track diverge, via
`Step3Router`…`Step5Router` in `frontend/src/App.tsx`.

| Step | Renovation track | What actually happens |
|---|---|---|
| 1 — Define Project | `DefineProject/` | Project type, KPIs, scope, location. The map gates the address against the municipality boundary and disables *Continue* if it falls outside |
| 2 — Building Data & Prioritisation | `DataCoverage.tsx` | Review coverage, upload façade photos, rank the stock (§9). The top-N carry forward |
| 3 — Select & Baseline | `BaselineSetup.tsx` | Confirm buildings, run the as-built EnergyPlus baseline (§7, §8) |
| 4 — Renovation Calculator | `RenovationSimulator.tsx` | Build packages, optimise (§10), compare heating systems, run regret analysis (§11) |
| 5 — Report | `RenovationReport.tsx` | Assemble everything into a shareable report |

The EC/RE track substitutes `DataAssumptions` → `StepScenarios` → `ResultsBudget`
at steps 3–5.

**Why a wizard and not a dashboard.** The steps are genuinely sequential —
prioritisation needs coverage, the baseline needs a selection, packages need a
baseline to be measured against. A dashboard would let a user compute a package
saving against a baseline that was never simulated.

**One nav control.** Back/Continue lives only in the wizard footer, reading a
module-level singleton (`components/wizardNav.ts`). Step pages register handlers
there instead of drawing their own buttons — an earlier version had pages render
their own, which produced duplicate controls. React runs an unmounting route's
cleanup before the incoming route's effect, so the singleton always holds only
the current page's handlers.

---

# 3. Sources, one by one

For each: what it is, why it was chosen, how it is accessed, what is taken from
it, what is done to it, and how it fails.

## 3.1 EUBUCCO — building geometry and attributes

**What.** A research database (v0.2) fusing OpenStreetMap, Microsoft Building
Footprints and national registries into building height, floors, construction
year and type, with confidence bounds and a per-field source tag.

**Why.** It is the only pan-European building dataset with consistent schema
across countries — which is the whole requirement for a tool meant to upscale
beyond one country.

**Access.** Anonymous S3, no API and no token. Parquet per NUTS region.

**A trap that cost real time.** The public bucket is organised at **NUTS2**
granularity (4 characters, e.g. `UKI3`) — *not* the NUTS3 codes (5 characters,
e.g. `UKI31`) that standard NUTS tables list. Every NUTS3-keyed URL 404s.
Individual rows do carry their finer NUTS3 `region_id`, so filtering stays
precise; only the download granularity is coarse. Documented in
`tools/uk/ingest_eubucco.py` so it is not rediscovered.

**Post-processing.** Streamed per region, clipped to each city's bounding box —
a city build never materialises the whole country.

**Role differs by country.** In Sweden EUBUCCO supplies the **footprint polygon
itself**. In the UK it supplies **attributes only**; geometry comes from OSM
(§3.2). The reason is in §5.1.

## 3.2 OpenStreetMap — UK geometry, and networks everywhere

**Why for UK geometry.** Because OSM carries the `ref:GB:uprn` tag. That tag is
what makes an address-based certificate join possible at all — EUBUCCO has no
such key. The geometry source was chosen *for its join key*, not for its
geometry quality.

**Access.** Overpass API, cached per run; `--refresh` bypasses the cache.

**Also used for**, in both countries: road centrelines, the street network
behind space-syntax centrality, and green areas. These are the layers that work
anywhere OSM has coverage, as opposed to the Gothenburg-only LiDAR layers.

## 3.3 Swedish energideklaration register

**What.** The national EPC register, held locally as DuckDB — ~461 MB,
**1.88 million rows**.

**Fields taken.** `EgiSpecifikEnergianvandning` (specific energy use),
`EgiEnergiklass` (class), `EgenAtemp` (heated area), `EgenNybyggAr` (year),
`EgenAntalPlan` (floors), `IdAdr` (address), `IdFastBet` (cadastral),
`FormularId` (declaration id), `IdHusnr` (house number).

**Operational rule.** Open it **read-only**:

```python
duckdb.connect(path, read_only=True)
```

A writable handle takes an exclusive lock and blocks the backend — this is not
theoretical, it has happened.

**Two aggregation levels are built from it**, and the distinction matters
enormously for coverage (full detail in §4.2):

1. **Per declaration** (`FormularId`) — the certificate as filed.
2. **Per property** (`IdFastBet`) — a *representative* declaration per cadastral
   unit, chosen as the one covering the **most addresses**, tie-broken by
   highest `FormularId`.

**Why level 2 exists.** One energideklaration often covers a whole property —
several buildings and entrances, typically a BRF. But Lantmäteriet links that
declaration to only **one** footprint. Without a property-level fallback, the
other heated buildings on the same property would show as having no certificate
when in reality they are covered by one. The fallback is restricted to buildings
whose use is **not** `Komplement%` (garages, sheds), which are genuinely not
covered, and restricted to the Gothenburg municipality set to avoid cadastral
name collisions between municipalities.

## 3.4 UK EPC open-data service

**What.** `get-energy-performance-data.communities.gov.uk`. It **replaced**
`epc.opendatacommunities.org`, retired 30 May 2026.

**Explicitly not used.** `gov.uk/find-energy-certificate` is a per-property
lookup UI, not a bulk source. It is deliberately not scraped.

**Contract**, verified against the authoritative API spec rather than
documentation prose:

```
GET /api/domestic/search?postcode=...&current_page=1&page_size=5000
```

**Access needs a bearer token** — GOV.UK One Login, then `UK_EPC_API_TOKEN` in
the environment or the repo-root `.env`.

> **The failure mode is silent.** Without a token, lookups return nothing and
> the pipeline completes anyway on English Housing Survey band priors. The
> output looks complete. It is survey-derived. See §14.

## 3.5 TABULA / EPISCOPE archetypes

**What.** EU building typologies giving period- and type-specific U-values.

**Why.** Wherever a building has no measured envelope data — the majority — a
physically plausible U-value is still needed to simulate it. An archetype is a
defensible way to supply one, because it is traceable to a published typology
rather than invented.

**UK source discipline.** Parsed from the actual *Building Typology Brochure:
England* (BRE, September 2014) rather than transcribed by hand, so the numbers
can be traced to a page.

**Coverage is the weak point:** *live* — 26,257 of 92,973 Gothenburg buildings
(28%) match an archetype. See §4.4 for why, and §14.

## 3.6 English Housing Survey 2024-25

**What.** Headline annex tables (OpenDocument `.ods`, MHCLG, Chapter 2 — Energy
Efficiency).

**Parsed into three products:**

| Output | Purpose |
|---|---|
| `ehs_2024_25.json` | the full parsed tables |
| `epc_band_priors.json` | band distribution by dwelling age and type |
| `retrofit_cost_band_c.json` | cost to reach EER band C |

**Role.** The band priors are the UK fallback whenever a building has no
matching certificate. This is a **population statistic standing in for a
measurement** — see §14.

## 3.7 Cost and carbon — Wikells and Boverket

**Wikells** supplies Swedish construction cost line items for renovation
assemblies. **Boverket's klimatdatabas** supplies emission factors for embodied
carbon, via a cached API client.

> **The Wikells catalogue is not a catalogue of retrofits.** It mixes complete
> insulated assemblies (roof plus 340 mm insulation, U=0.11) with bare coverings
> and uninsulated build-ups (TRP roof on masonite beams, U=3.37; "M0" studs with
> no insulation, U=1.75). Those latter entries are single layers, not
> whole-component retrofits. Treating them as retrofit options made the
> optimiser propose packages that *increased* heating demand several-fold. The
> handling is in §10.4 — it is the single most important data-quality guard in
> the tool.

UK cost and carbon are **synthetic placeholders**
(`frontend/src/config/ukPlaceholderCostCarbon.ts`). See §14.

## 3.8 DTCC LiDAR

**What.** Airborne laser tiles served openly by DTCC at Chalmers
(`compute.dtcc.chalmers.se:8000`), EPSG:3006 / SWEREF99 TM. **6.3 GB** — by far
the largest input, and the reason the repository is heavy to clone.

**Three derived products**, each its own pass:

| Product | Script | Output |
|---|---|---|
| Trees and shrubs | `tools/se/dtcc_vegetation.py` | point positions, height, crown |
| Roof form | `tools/se/dtcc_roofs.py` | per-building eave, ridge, azimuth |
| Terrain | `tools/se/dtcc_terrain_water.py` | shaded-relief image **and a water mask** |

**A post-processing step worth noting.** The water mask produced in the terrain
pass is fed back into `tools/se/filter_vegetation_water.py` to delete vegetation
the point cloud placed on the river, harbour and canals. Laser returns off water
surfaces are noisy; without the filter the viewer grows trees on the Göta älv.

**Gothenburg only.** There is no UK equivalent, which is why several viewer
layers are Sweden-specific (§6.3).

## 3.9 EPW weather

One EnergyPlus Weather file per city, driving both the building simulations (§8)
and the environmental analyses (§13).

## 3.10 Context and market data

| Source | Gives | Cadence |
|---|---|---|
| SCB | DeSO demographics and income, WFS overlays | static |
| Västtrafik | stops, live vehicles, departures, disruptions, parking | live |
| Trafikverket | traffic cameras, road conditions | on demand |
| Boplats | first-hand rental listings | daily |
| Booli | sale listings and prices | weekly |

**Scraping approach.** Booli is a Next.js site, so the scraper reads the data
already embedded in each search page rather than driving a browser or paying for
an API. Both scrapers write SQLite, then export JSON for the Data Explorer.
Failures email an alert (`boplats_notify.py`). Scheduling is `.service`/`.timer`
pairs under `deploy/systemd/` on Linux, `.ps1` runners on Windows.

---

# 4. The Sweden pipeline

Everything below happens in `data_pipeline.py` — one module, imported by twelve
other scripts. `process_data(city_key)` runs the whole chain and returns the
viewer payload.

**Order of operations**, with the section covering each:

```
load EUBUCCO + Lantmäteriet/EPC  →  §4.1
  build two EPC aggregations (declaration, property)  →  §4.2
  match EUBUCCO ↔ footprints by polygon overlap  →  §4.3
  proximity fallback, then geocode fallback  →  §4.3, §4.4
  match TABULA archetypes  →  §4.5
  derive areas, heights, geometry, colours  →  §4.6
  emit records + statistics  →  §4.7
tag districts (SEPARATE SCRIPT — see §4.8)
```

## 4.1 The two geometry sets

Two independent polygon sets are loaded and must be reconciled:

- **EUBUCCO** — the buildings the viewer will extrude. Derived from OSM.
- **Lantmäteriet footprints** — the cadastral footprint registry, which is what
  the energy certificates are actually attached to (by `FormularId`).

Both are reprojected to **EPSG:3006** (SWEREF99 TM) for all metric work, because
overlap fractions and distances in degrees are meaningless. Footprints are
clipped to the city bounding box **buffered by 200 m**, so a building at the edge
can still match a footprint just outside.

## 4.2 Building the certificate side

Before any geometry is matched, the EPC register is aggregated twice in one
DuckDB query.

**Per declaration** (`FormularId`): min/max aggregates over energy, class,
Atemp, year, floors, plus `STRING_AGG` of every distinct address.

**Per property** (`IdFastBet`): a *representative* declaration, chosen with

```sql
ROW_NUMBER() OVER (PARTITION BY UPPER(TRIM(IdFastBet))
                   ORDER BY COUNT(DISTINCT TRIM(IdAdr)) DESC, FormularId DESC)
```

— i.e. the declaration covering the **most addresses**, which is the shared/BRF
one, tie-broken by the newest `FormularId`.

The property-level value is applied **only** where `FormularId IS NULL` (the
footprint has no direct declaration link) **and** the use is not `Komplement%`.

**Why both.** A single declaration frequently covers a whole property, but
Lantmäteriet links it to one footprint. Without the property level, the other
heated buildings on that property look uncertificated when they are in fact
covered. Without the `Komplement` exclusion, the rating would spread onto garages
and sheds, which genuinely have no heating.

**Addresses are kept in full.** One `FormularId` can list many entrances
(Markmyntsgatan 16A–16E on one footprint). The pipeline keeps *every* address in
`all_addresses`, preferring the set matched on `husnummer`, so that searching
"16C" still resolves and no entrance is silently dropped. The primary display
address prefers the building's **own** entrance (matched on `husnummer`), then
the declaration's first address, then the property EPC's.

## 4.3 Matching buildings to certificates — the overlap method

> **This is the single most consequential method in the Swedish chain.** It
> decides which of ~93,000 buildings gets a real energy figure.

**Why it must be geometric.** EUBUCCO carries **no cadastral id and no address**.
There is therefore no key on which to join it to the footprint registry. The link
*has* to be spatial. This is the precise reason cadastral and address joins
cannot raise coverage — not that the registers disagree about buildings, but that
one side has no join key at all.

**Why overlap and not nearest centroid.** The earlier implementation matched on
nearest centroid. In dense blocks that assigns a building the certificate of a
*neighbour*, and spreads one certificate across several buildings. Validated
failure: the centroid method handed **~1,800 buildings** a certificate for a
footprint their polygon never touches.

**The method.** Each building takes the footprint covering the **largest share of
its own area**. Three constants govern it (`data_pipeline.py`):

```python
OVERLAP_MIN     = 0.05   # min overlap to prefer a footprint over centroid fallback
OVERLAP_STRONG  = 0.30   # confident same-building; also the dedup priority cutoff
FALLBACK_DIST_M = 20     # nearest-centroid fallback radius
```

- **5%** is deliberately permissive. It recovers buildings whose OSM outline is
  merely *offset* from the cadastral footprint — a registration difference, not a
  different building.
- **Buildings overlapping nothing** fall back to nearest centroid **within 20 m**.
  Beyond that, no certificate.
- **Dedup.** When one footprint lands on several buildings, every claimant
  overlapping **≥30%** keeps the certificate — this is legitimate where OSM splits
  one cadastral building into parts. Weak and fallback claimants are dropped
  **only if** a strong claimant exists; if none do, the single best-overlapping
  building wins.

**The asymmetry is intentional.** A certificate is allowed to attach to several
buildings when they all strongly overlap the same footprint, but is never
allowed to spread to a weak claimant while a strong one exists.

## 4.4 The geocoding fallback

Certificates that neither overlap nor sit within 20 m of any building are pushed
through a **cached** forward geocoder (`tools/se/geocode_epc.py`), producing
`_epc_fallback_points`.

**Why cached and committed.** `data/epc_geocode_cache.json` is in the repository
so a rebuild does not re-hit the geocoding service. That makes rebuilds
reproducible and avoids rate-limit-dependent results — the same input produces
the same output regardless of network conditions.

## 4.5 TABULA archetype matching

Two lookups, then a join:

```python
period = _year_to_period(year_built_epc)   # construction period band
btype  = _use_to_btype(use_cat)            # building type from use category
archetype = lookup[(btype, period)]
```

Returning `u_wall`, `u_roof`, `u_window`, `heat_z3`, and the wall/roof
construction descriptions.

**`post-2005` returns no archetype by design** — buildings that new are assumed
to be described adequately by their own data rather than by a typology.

**Coverage:** *live* 26,257 / 92,973 (28%). The binding constraint is that
matching needs **both** a construction year (which comes from the certificate, so
only certificated buildings have one) **and** a mapped use category.

**A derived statistic worth knowing about.** After matching, the pipeline
computes a **within-period energy percentile** (`perf_pct`): for each period,
buildings are ranked between the **2nd and 98th percentile** of measured energy
use, clipped to [0, 1].

**Why 2–98 and not min–max.** Min–max would let one mis-keyed outlier compress
every other building into a narrow band. Trimming the tails makes the colour
scale legible. **Why within-period.** Comparing a 1930s building against a 2004
one on absolute energy use only re-states construction year; comparing it against
*its own cohort* is what identifies an underperformer.

## 4.6 Derived geometry and attributes

| Step | Method | Rationale |
|---|---|---|
| Footprint area | `.to_crs(3006).area`, rounded to 0.1 m² | metric CRS, not degrees |
| Simplification | `simplify(tolerance=0.00005, preserve_topology=True)` | payload size; topology preserved so polygons stay valid |
| Height | `height` if present and > 0, else `floors × 3.2 m`, else `3.2 m` | 3.2 m is the project's floor-height convention, matching `tools/idf/defaults.py` |
| Height cap | clipped to **100 m**, count reported | guards against register errors; the count is printed, never silently swallowed |
| Colour | by `use_cat`, `ovrigt` as fallback | |

Buildings whose geometry fails to convert to coordinate rings are dropped, and
the surviving count printed.

## 4.7 Output

`assets/buildings.json` — **57 MB**, *live* 92,973 records — plus an EPC
footprint layer, map centre, summary statistics and the legend's performance
cards.

**Consumer constraint.** At 57 MB the payload must be fetched with
`cache: 'default'`. Forcing `'no-store'` re-downloads it on every reload.

## 4.8 District tagging — and the trap

Buildings are tagged with their **primärområde** (96 official Gothenburg
neighborhoods) from the city's public ArcGIS FeatureServer, by
`tools/se/ingest_districts.py`.

> **`build.py` wipes these tags.** It regenerates `buildings.json` from scratch.
> Always run:
>
> ```bash
> python build.py && python tools/se/ingest_districts.py
> ```
>
> Skip the second command and `primary_area` drops to zero, silently breaking the
> neighborhood picker and the chat assistant's district tools. A correct run tags
> roughly **75,719 of 92,973** buildings (81%).

This is a genuine design weakness — tagging is a separate pass over a file that
an earlier step recreates — and it is the most common way to break the dataset.

## 4.9 Adding another Swedish city

`tools/se/se_cities.py` is the single source of truth. Register the city, then:

```bash
python tools/se/download_eubucco_city.py <slug>
python tools/se/build_city.py <slug>
```

Malmö is already built (`assets/buildings_malmo.json`).

---

# 5. The UK pipeline

`tools/uk/uk_data_pipeline.py`. Built separately from the Swedish chain and
sharing **only the output schema**.

```bash
python tools/uk/uk_data_pipeline.py                 # all cities
python tools/uk/uk_data_pipeline.py --city london
python tools/uk/uk_data_pipeline.py --refresh       # ignore the Overpass cache
```

Outputs land in `frontend/public/uk/`: `buildings_<city>.json` per city, plus
`cities.json` with the registry and per-city stats. Focus cities: **London,
Birmingham, Nottingham**.

## 5.1 Why the geometry source is different

The Swedish join is spatial because EUBUCCO has no address key. The UK could
have inherited that approach — but UK certificates are keyed by **address and
UPRN**, not by footprint geometry. There is no UK equivalent of the Lantmäteriet
footprint-to-declaration link.

So the geometry source was chosen **for its join key**: OSM carries
`ref:GB:uprn`. EUBUCCO is retained for attributes (height, floors, year, type)
where OSM lacks them.

## 5.2 The address problem, and how it is solved

Many OSM building footprints carry **no address tags of their own** — the address
lives on a separate node *inside* the building.

The pipeline therefore builds its candidate address set as:

```python
addr_sources = [tags] + _addr_tags_in_ring(addr_index, ring)
```

— the building's own tags, **plus every address node contained within its
footprint ring**. Without this, a large share of footprints would be
unmatchable.

## 5.3 The certificate join

For every address source, two lookups:

1. **UPRN** — `ref:GB:uprn` against the certificate's `uprn`.
2. **Postcode + house number** — normalised via `ingest_epc.norm_postcode` and
   `norm_house`.

All hits accumulate into a dict keyed by `certificate_number`, so the same
certificate reached by two routes counts once.

**Why accumulate rather than take the first match.** A block of flats
legitimately holds **many** certificates — one per flat — but is **one extruded
building**. Taking the first would represent a whole block by one arbitrary flat.

The pipeline also reports back **whichever postcode actually matched**, rather
than the first candidate found, so the recorded address reflects the match.

## 5.4 Collapsing many certificates into one building

| Attribute | Rule | Why |
|---|---|---|
| Band | **modal** band across certificates | one extruded block, one colour |
| SAP | **mean**, 1 dp | |
| Year | OSM `start_date`, else EUBUCCO year, else **mean** of certificate age bands | measured before inferred |
| Address | building's own OSM `housenumber` + `street`; else modal **building-level** label from certificates | flat prefixes are stripped so a block is not named after one flat |

## 5.5 The fallback, and why it is dangerous

Where nothing matches, the building is assigned a band distribution from the
**English Housing Survey** by dwelling age and type, plus a cost-to-band-C figure.
A `epc_source` marker distinguishes `epc` from prior-derived, and the pipeline
counts both in `stats`.

> **This is the UK track's central caveat.** A band-prior building carries a
> *population statistic*, not a measurement, and renders identically to a matched
> one. Combined with the silent token failure (§3.4), a UK run can produce a
> complete-looking, entirely survey-derived result. Always check the
> `epc` vs prior split in `cities.json`.

## 5.6 Auditing before trusting

`tools/uk/sample_epc_matches.py` prints a handful of building→certificate
matches per district and writes a JSON sample. Run it after any pipeline change.
It is the only practical check that the address join lands on the right
buildings — a match rate tells you *how many* matched, not whether they matched
correctly.

---

# 6. Digital twin construction

## 6.1 Why the viewer is assembled, not served

`viewer/js/*.js` are **classic scripts sharing globals** — deliberately no
`import`/`export`. `build.py` inlines them, with `viewer/index.html` and
`viewer/styles/main.css`, into `assets/<city>_3d.html`. That file is what the
browser loads.

**Consequence:** editing `viewer/` alone changes nothing. The workflow is

```bash
node --check viewer/js/<file>.js    # validate — no module system to catch errors
python build.py
python tools/se/ingest_districts.py # see §4.8
```

In development the Vite server also serves the built viewer directly, so
`launch.py` is only needed for the standalone page.

## 6.2 Rendering ~93k buildings

**One Cesium `Entity` per building does not work.** At this scale it exhausts
memory and freezes the tab. The viewer uses **one batched `Primitive`** with
per-instance colour, carrying `id: { _dataIdx: i }` so picking still resolves to
the underlying record.

This is the clearest example of §1's "volume changes the algorithms": at district
scale, entity-per-building is the obvious and correct choice.

**A failure worth recording.** A `MutationObserver` watching `childList` on the
left panel, whose callback set `badge.textContent` — itself a childList mutation —
re-triggered endlessly and pegged the main thread. Cesium's
`await createGooglePhotorealistic3DTileset()` could then never resume, so the
loading overlay never cleared. It looked exactly like a network or token failure.
It was not.

> **Diagnostic:** a frozen page that looks like a stuck async call is often a
> runaway observer or render loop. Time a trivial `page.evaluate(() => 1+1)` — if
> it takes seconds, the main thread is blocked, not the network.

If you observe a subtree you also mutate: narrow the observer, add a re-entrancy
guard, and make writes idempotent (`if (el.textContent !== next)`).

## 6.3 One viewer, two countries

`bootstrap.js` resolves the active country and city, loads that payload, then
wires the remaining scripts in a fixed order. Sweden and the UK share the same
viewer code and the same `assets/` output — which is exactly what §5's schema
match buys.

Layer availability is not uniform:

| Layer | Source | Available |
|---|---|---|
| Building colour modes | payload | any built city |
| Roads, street network, space syntax, green index | OSM | anywhere |
| Vegetation, roof form, terrain | DTCC LiDAR | **Gothenburg only** |
| SCB demographics | Statistics Sweden | Sweden only |
| Transit, traffic | Västtrafik, Trafikverket | Sweden only |
| Market listings | Booli, Boplats | Gothenburg only |

## 6.4 The DOM contract

`cesium.js`, `vasttrafik.js`, `legend.js` and `scb_layers.js` all wire by
`getElementById`. Restructuring `viewer/index.html` must preserve **every id** —
there is no module system or type checker to catch a broken reference, and a
missing id fails silently at runtime.

---

# 7. From building record to EnergyPlus model

`tools/idf/` — the bridge between the city-scale database and the physics
engine, and where nearly every modelling assumption enters.

## 7.1 The shoebox abstraction

Each building becomes a **single-zone "shoebox"**: its real footprint ring is
projected from lon/lat into local metres and extruded.

**What is kept:** true orientation, true envelope areas, true footprint shape.
**What is given up:** internal zoning, floor-by-floor differences, stack effects.

**Why this trade.** Orientation and envelope area dominate heating demand and
vary hugely across a real stock; internal zoning matters far less for the
question being asked (*which building, which package*) and would multiply run
time by the number of zones. At 93k candidate buildings that is the difference
between feasible and not.

The projection reuses the same equirectangular local-metre convention as the
rest of the pipeline, so geometry is consistent between viewer and simulation.

## 7.2 Where each number comes from

Strict priority for every envelope property:

1. the building's own record (measured or certificate-derived),
2. its TABULA archetype (§4.5),
3. `tools/idf/defaults.py`.

**Why the fallbacks live in one file.** Every assumption standing in for real
data is in a single readable module rather than scattered through the generator.
That file *is* the assumptions register.

## 7.3 The defaults, and their reasoning

**Envelope** (W/m²K), used only when the record's own `tabula_u_*` is null:

| Property | Default | Note |
|---|---|---|
| `DEFAULT_U_WALL` | 0.40 | |
| `DEFAULT_U_ROOF` | 0.30 | |
| `DEFAULT_U_WIN` | 1.80 | |
| `DEFAULT_U_FLOOR` | 0.40 | uninsulated slab-on-grade approximation, "Ground" boundary |
| `DEFAULT_SHGC` | 0.60 | Sweden's `buildings.json` has no per-building SHGC field at all |
| `FLOOR_HEIGHT_M` | 3.2 | matches the pipeline's floors-from-height convention (§4.6) |

**Window-to-wall ratio by use** — applied to every exterior wall when no saved
WWR-tool estimate (§12.2) exists: single-family 0.15, multi-family 0.20,
commercial 0.30, civic 0.25, industrial 0.08, ancillary 0.08, other/fallback
0.15.

**Surface film resistances** — the subtle one:

```python
R_SI = 0.13   # internal surface resistance
R_SE = 0.04   # external
MIN_LAYER_R = 0.01
```

**Why they exist.** `tabula_u_*` is a **whole-assembly** U-value, which already
includes surface films. EnergyPlus computes its own film coefficients. Feeding
the assembly U-value straight in would double-count them. The films are
therefore folded into each `Material:NoMass` resistance to cancel that out.
`MIN_LAYER_R` floors the result so no non-positive resistance reaches
EnergyPlus. Applied uniformly to wall/roof/floor — a deliberate shoebox-level
simplification, not per-surface-type coefficients.

**Internal gains by use category:**

| Category | m²/person | Lighting W/m² | Equipment W/m² |
|---|---|---|---|
| Residential | 35 | 5 | 4 |
| Commercial | 15 | 10 | 10 |
| Civic (schools, care) | 8 | 9 | 6 |
| Low-use (industry, ancillary, other) | 100 | 3 | 2 |

> **Applied to total floor area** (`floors × footprint_m2`), **not footprint.**
> The shoebox is one thermal zone spanning the building's full real height
> regardless of floor count, so intensity × footprint alone would understate a
> multi-storey building's occupancy and equipment load by a factor of its floor
> count.

## 7.4 Domestic hot water

Modelled as a stand-alone `WaterHeater:Mixed` drawing `DistrictHeatingWater`, so
EnergyPlus reports it under **Water Systems** alongside Heating, Lighting and
Equipment.

**Be honest about what this is.** EnergyPlus does not *predict* hot-water use —
it plays back the draw profile it is handed. **The annual figure out is the
annual figure in.** It is a standard assumption, not a simulation result.

**So why include it.** Because a Swedish energideklaration includes
tappvarmvatten. Without DHW the tool's totals were *structurally* lower than the
certificates they were being compared against. Adding it makes the two cover the
same end uses and therefore comparable at all.

**Intensities** are Sveby *Brukarindata* standard values (kWh per m² Atemp·yr):

| Use | kWh/m²·yr | Note |
|---|---|---|
| Dwellings (single + multi) | 25.0 | |
| Commercial | 2.0 | Sveby office — washrooms only |
| Civic | 10.0 | showers + commercial kitchens |
| Industry, other | 2.0 | |
| Ancillary (garages, sheds) | **0.0** | no hot water at all |

**The dwelling value is corroborated against the national register:**
Gothenburg's 72,133 declared hot-water figures have a **median of 23.6**
(p25 14.9, p75 25.0). The intensity includes circulation (VVC) losses, which is
why the water heater is modelled with **no separate standby loss** — that would
double-count.

> **Comparability warning.** Totals now include hot water. Runs from before this
> change are **not comparable** to runs after it. There is no automatic guard.

---

# 8. Simulation

## 8.1 EPSM

EnergyPlus runs through **EPSM** (Energy Performance Simulation Manager), a
containerised service — backend, worker, Postgres and Redis, from
`docker-compose.epsm.yml`, reached on **:8010**.

EPSM was developed at Chalmers by Sanjay Somanath (lead developer) and
Alexander Hollberg (principal investigator), and is credited in-app.

**First diagnostic when simulations fail:** check Docker Desktop is running.
That has been the cause every time so far.

## 8.2 Flow

```
generate one shoebox IDF per building per variant
  → batch submit to EPSM
  → poll batch status until complete
  → store results in data/simulation_database.sqlite3
  → later requests hit the cache, not EnergyPlus
```

Eleven backend routes cover submit, status, results, batch handling, time series
and lookup.

## 8.3 The cache is the design

Results live in a SQLite datastore (**2.0 GB** and growing) that replaced an
earlier flat JSON file.

**Why it matters:** the baseline batch lookup is what makes Step 4 usable.
Packages are compared against an **already-simulated** baseline instead of
re-running it, so exploring options is interactive rather than a queue wait.

## 8.4 The cooling gap

EPSM's end-use rows carry **no district-cooling column**. Ideal-loads cooling is
therefore reported as **0** in every total — although the simulation trace shows
it is not zero.

Any cooling-inclusive figure from this tool is understated. See §14.

---

# 9. Retrofit prioritisation

`frontend/src/utils/retrofitPriority.ts`. Runs in Step 2, ranks the stock, and
the top-N carry into the baseline and simulation steps.

## 9.1 The composite

Each building scores 0–100 under four criterion groups:

$$P = w_E \cdot E + w_F \cdot F + w_C \cdot C + w_R \cdot R$$

weights normalised to sum to 1.

| | Criterion | Meaning |
|---|---|---|
| **E** | Energy performance | worse ⇒ higher priority |
| **F** | Façade / envelope condition | ML defect load |
| **C** | Building characteristics | vintage and heated size |
| **R** | Retrofit potential | headroom × envelope poorness × scale |

**Why expert rules rather than a fitted model.** Every sub-score is a
transparent rule against benchmarked thresholds, so any ranking can be explained
back to the user in words. A fitted model would rank better on paper and be
unusable in a planning conversation — "why is this building third?" has to have
an answer. Rules also need no training data, which does not exist for this task.

**Why it is deliberately light maths.** It runs client-side over thousands of
buildings without a round trip, so re-weighting is instant and users can explore
trade-offs rather than submitting a job.

## 9.2 Confidence is first-class

Every sub-score carries a `confidence` reflecting data availability, and a
human-readable `note`. Missing data lowers confidence rather than silently
scoring zero — a building with no energy data scores a neutral 50 at
**confidence 0**, which is visibly different from a real 50.

## 9.3 The sub-scores

**E — energy.** With a metered figure, linear between **60 and 250 kWh/m²·yr**
(the Swedish residential rule of thumb: ≤60 excellent, ≥250 very poor),
confidence 1. Without it, from the class letter — A 8, B 22, C 35, D 50, E 66,
F 83, G 100 — at confidence 0.7. With neither: 50 at confidence 0.

**F — façade.** Defect counts are weighted by severity:

```
crack 1.0 · bulge 1.0 · corrosion 0.75 · abscission 0.75 · leakage 0.6
```

then passed through a **saturating** curve:

$$F = \left(1 - e^{-\text{load}/4}\right) \times 100$$

**Why saturating.** A handful of severe defects already means "bad". A linear
count would let a heavily-photographed building outrank a genuinely worse one
simply for having more images.

> **F is not scored until a building has been inspected.** Before that it is
> marked unavailable and **left out of the composite entirely**, with the other
> criteria re-weighted. An un-inspected building is not assumed to be in good
> condition — nor in bad condition.

**C — characteristics.** `0.6 × age + 0.4 × size`, where age scores by band
(pre-1945 85, pre-1976 78, pre-1991 55, pre-2006 32, later 15) and size is the
building's position in the **current selection's** size range.

> **A wording fix worth keeping.** "size p100" read as a statistical percentile,
> which it is not — it is position between smallest and largest *in this
> selection*. It is now phrased in words ("largest here", "60% of the size range
> here") with the area shown alongside.

**R — potential.** Headroom above a 70 kWh/m²·yr target, scaled linearly over
0–180, weighted 0.6; wall U-value poorness over 0.15–1.0, weighted 0.25; size,
weighted 0.15. Weights renormalise over whatever is available.

**Heated area** prefers Atemp, falling back to `footprint × max(1, floors)`.

## 9.4 Keys

Buildings are keyed by cadastral id, else normalised address, else index, with
collisions suffixed. **This key must match the one the façade panel writes
defects under**, or inspections silently fail to reach the F criterion.

## 9.5 Weight presets

| Preset | wE | wF | wC | wR |
|---|---|---|---|---|
| Balanced (default) | 0.35 | 0.30 | 0.15 | 0.20 |
| Energy-first | 0.55 | 0.15 | 0.10 | 0.20 |
| Condition-first | 0.20 | 0.50 | 0.15 | 0.15 |
| Cost-effectiveness | 0.25 | 0.15 | 0.10 | 0.50 |

Weights can also be derived from expert pairwise judgements via **AHP**.

---

# 10. Optimisation

`POST /api/optimize` in `backend/main.py`. Adapted from DT4PED (§1).

## 10.1 The strategy

> Enumerate cheaply, filter to the front, then spend EnergyPlus only on the
> winners.

The analytic model is fast enough to evaluate the whole combinatorial space;
EnergyPlus is not. Validating only the non-dominated front is what makes
full-combination search affordable.

## 10.2 The physics

Each component contributes one option per combination. For a combination:

```
htr        = Σ (area × U)                    # heat transfer coefficient, W/K
q_total    = q_fixed + htr × f_dh            # annual demand
energy_m2  = q_total / floor_area
op_cost    = q_total × energy_price × annuity
op_carbon  = q_total × carbon_factor_heat × N
```

reported alongside initial cost and carbon, so each point carries **capital and
operational** components separately.

Discounting uses a present-value annuity factor over the study period:

$$\text{annuity} = \sum_{y=1}^{N}\frac{1}{(1+r)^y}$$

## 10.3 Anchoring to the measured baseline

`q_fixed` — everything a retrofit cannot change — is **derived from the real
EPSM baseline**, not assumed:

```python
q_fixed = max(0.0, baseline_total_kwh - baseline_htr * p.f_dh)
```

**Why.** This forces the analytic curve to pass through the known baseline point
when every component is left at its as-built U-value. The fast model and the
simulation then agree at the anchor, so package savings are measured from a real
starting point rather than from a modelled one.

## 10.4 The "keep as-built" option, and the exclusion rule

Every component gets a synthetic **`__keep__`** option at its baseline U-value,
zero cost, zero carbon.

**Why.** Without it the optimiser must touch every component, and cannot express
"this roof is fine". That makes an honest cost/carbon trade-off impossible.

**And the exclusion:** any catalogue option with `u_value > baseline_u` is
**dropped and reported** in an `excluded` list — never silently ignored.

This is the guard against the Wikells catalogue problem (§3.7). Offering bare
coverings as whole-component retrofits made the optimiser propose packages that
*increased* heating demand several-fold and produced nonsense energy figures.
Reporting rather than dropping silently means a surprising result is traceable.

## 10.5 Deduplication and the Pareto sweep

**Dedup first.** Many different material picks collapse to the same
(cost, carbon, energy) triple. Points are keyed by that triple before filtering.

**The skyline sweep.** Points are sorted by `(cost, carbon, energy)` ascending.
Because every already-kept point then has cost ≤ the current one, the current
point is dominated **iff** a kept point is also ≤ in carbon and energy, with at
least one strictly less. This is what avoids an O(n²) all-pairs comparison at
this data scale.

## 10.6 Presenting the front

- The **cheapest**, **lowest-carbon** and **lowest-energy** points are tagged for
  the UI.
- If the front exceeds `max_results`, tagged extremes are always kept and the
  remainder **evenly sampled** across the curve — so the shape survives
  truncation rather than the front being cut off at one end.
- A baseline point is returned alongside, so "do nothing" is on the same axes.
- The full evaluated cloud is returned (evenly sampled if large) so the frontend
  can animate the point cloud filling in and the frontier tightening.

**Enumeration is capped** at `max_combos`, and `truncated` is returned as a flag.

---

# 11. Decision under uncertainty

`frontend/src/utils/regretAnalysis.ts`, surfaced in Step 4 and carried into the
Step 5 report.

## 11.1 The premise

A retrofit's payoff depends on an energy price nobody knows. Rather than pick
one price and present a single answer, every option — each package **plus the
do-nothing baseline** — is evaluated across Low / Medium / High price scenarios.

**Why energy price is the scenario axis.** It is the single largest unknown
driving whether a retrofit pays back, and unlike discount rate or service life it
is genuinely exogenous.

## 11.2 The payoff

30-year net present benefit, higher is better:

$$\text{benefit}_i(s) = E^{saved}_i \times price(s) \times \text{annuity} - I_i$$

with $E^{saved}_i$ the annual energy saved and $I_i$ the investment (zero for the
baseline).

## 11.3 Three rules, deliberately not one

| Rule | Definition | Reads as |
|---|---|---|
| **Minimax regret** | regret = best-in-scenario − chosen; pick the smallest worst-case regret | least risk of having chosen wrong |
| **Uncertainty range** | best − worst across scenarios | small ⇒ robust |
| **Hurwicz** | $H = \alpha\,best + (1-\alpha)\,worst$ | α is optimism; α=0 is pure worst-case |

**Why all three are shown.** They can disagree — and where they disagree is
exactly where the decision deserves human judgement rather than an automated
recommendation. Collapsing them to one number would hide the disagreement, which
is the most informative output the analysis produces.

---

# 12. Façade inspection and defect ML

## 12.1 Defect detection

A trained crack-and-defect detector runs as a **separate service on the host**
(`:8020`, `tools/ml/facade_detect_service.py`) in its own torch environment. The
backend proxies to it via `/api/facade-detect`.

**Why a separate process.** Keeping torch out of the API server means the
backend starts in seconds, does not carry GPU/CUDA dependencies, and can run at
all on a machine where the model cannot.

**Where it feeds.** Detected defect load drives the **F** criterion (§9.3), so
uploading a photo changes the ranking. Uploads are available both in the 3D
viewer and in Step 2 of the wizard.

**Do not put anything else on :8020.**

## 12.2 Window-to-wall ratio from vision

In the viewer: fly the camera to a façade, drag a rubber-band crop, and a GPT-4
vision call estimates the window-to-wall ratio. Estimates persist to a WWR
database so a façade is assessed once and reused.

**Why WWR specifically.** It is both a strong driver of heating demand and one
of the attributes least often present in any source register — Sweden's
`buildings.json` has no per-building WWR field at all. Without an estimate the
model falls back to a use-category default (§7.3), which is a considerably
weaker assumption than a look at the actual building.

---

# 13. Environmental analysis

`backend/sun_hours.py`, `incident_radiation.py`, `thermal_comfort.py`, with
viewer layers `sunhours.js`, `incident.js`, `comfort.js`.

## 13.1 Clean-room implementation

These are **clean-room** implementations: the methods are the standard ones, but
the code was written from the published methods rather than derived from Ladybug
or any other existing environmental toolkit.

Sun position comes from a compact astronomical algorithm; the sky is discretised
into a matrix built from the EPW file. Thermal comfort builds on
`pythermalcomfort`.

## 13.2 The three analyses

| Analysis | Output | Interaction |
|---|---|---|
| Direct sun hours | hours of direct sun over a ground disc | one backend call returns the whole day |
| Incident radiation | cumulative irradiation on the disc, EPW-driven | click a point |
| Thermal comfort | UTCI + solar mean radiant temperature | scrub the hour, or switch to seasonal % |

**Why a whole day per call.** Sun-hours returns the full day in one response so
the hour slider scrubs locally with no round trip — the same reasoning as the
client-side prioritisation maths (§9.1).

## 13.3 Scope limit

All three analyse a **ground disc** around a clicked point. Façade and roof
surface analysis is the natural extension and is not implemented for all three.

---

# 14. Validation and limitations

Every known reason a number from this tool could be wrong or non-comparable.
These are the questions a reviewer will ask.

## 14.1 Understated

**District cooling reads as zero** (§8.4). EPSM's end-use rows have no
district-cooling column, so ideal-loads cooling is 0 in every total although the
trace shows otherwise. Any cooling-inclusive total is too low.

## 14.2 Not comparable across time

**DHW was added to the model** (§7.4). Totals now include hot water. Runs from
before the change are not comparable to runs after it, and there is no automatic
guard — check run dates before putting two figures side by side.

## 14.3 Not comparable across countries

**Sweden and the UK match by different methods** (§4.3, §5.3). One is a
geometric overlap rate; the other an address match rate with a survey fallback
mixed in. A Swedish coverage percentage and a UK one do not mean the same thing.

**A UK run without a token completes anyway** (§3.4, §5.5), on band priors alone,
producing a survey-derived result that looks measured.

## 14.4 Not real

**UK cost and carbon are synthetic placeholders**
(`frontend/src/config/ukPlaceholderCostCarbon.ts`). They exist so the UK track
runs end to end. They must never be presented as real.

## 14.5 Coverage ceilings

**Swedish matching is geometric because EUBUCCO has no join key** (§4.3) — no
cadastral id, no address. This is a property of the data, not a gap in effort:
cadastral and address joins cannot raise coverage on the EUBUCCO→footprint link.
(Cadastral ids *are* used, but on the certificate side, to build the
property-level aggregation in §4.2.)

**TABULA coverage is 28%** (§4.5). Roughly seven in ten Gothenburg buildings have
no archetype and fall back to `defaults.py`.

## 14.6 Modelling simplifications, stated plainly

| Simplification | Consequence |
|---|---|
| Single-zone shoebox (§7.1) | no internal zoning, floor-by-floor variation or stack effects |
| Uniform surface films (§7.3) | not per-surface-type coefficients |
| DHW played back, not predicted (§7.4) | the annual figure out is the annual figure in |
| Degree-day physics in the optimiser (§10.2) | fast search only; winners are re-validated in EnergyPlus |
| Height fallback `floors × 3.2 m` (§4.6) | approximate where the register lacks height |

## 14.7 Validations that were actually run

| Claim | How it was checked |
|---|---|
| Overlap beats nearest-centroid matching | the centroid method gave ~1,800 buildings a certificate for a footprint their polygon never touches |
| DHW intensity of 25 kWh/m²·yr for dwellings | Gothenburg's 72,133 declared hot-water figures: median 23.6, p25 14.9, p75 25.0 |
| UK address join lands correctly | `tools/uk/sample_epc_matches.py` prints a reviewable per-district sample |
| Non-improving catalogue options | excluded and **reported**, so nonsense packages are traceable |

## 14.8 Reporting conventions

Show `—` or "not available" rather than a plausible zero. Keep the source next to
any cited constant. Keep `provisional` flags visible rather than hiding them once
a value looks reasonable.

---

# 15. Reproducing everything

## 15.1 Services

| Service | Command | Port |
|---|---|---|
| Backend | `python -m uvicorn backend.main:app --port 8000` | 8000 |
| Frontend | `cd frontend && npm run dev` | 5173 |
| Standalone viewer | `python launch.py` | 8765 |
| EPSM | `docker compose -f docker-compose.epsm.yml up -d` | 8010 |
| Façade ML | `tools/ml/run_facade_service.ps1` | 8020 |
| Logbook | `logbook\run.bat` | 8501 |

**Vite binds IPv6 `localhost` only** — use `http://localhost:5173`, never
`127.0.0.1:5173`. If the backend runs on a different port, set
`VITE_API_PROXY_TARGET`.

**Restart the backend after editing `main.py`** — uvicorn here is not watching.
Confirm with `curl -s localhost:8000/api/health`.

## 15.2 Sweden, from nothing

```bash
python scripts/fetch_epc_db.py              # national EPC register (~461 MB)
python download_eubucco_sweden_v3.py        # EUBUCCO geometry
python build.py                             # pipeline + assemble the viewer
python tools/se/ingest_districts.py         # ALWAYS follow build.py — see §4.8
```

LiDAR layers (Gothenburg, optional, slow — 6.3 GB of tiles):

```bash
python tools/se/dtcc_terrain_water.py       # terrain + water mask FIRST
python tools/se/dtcc_vegetation.py
python tools/se/filter_vegetation_water.py  # needs the mask from step 1
python tools/se/dtcc_roofs.py
```

> Order matters: `filter_vegetation_water.py` consumes the water mask produced by
> `dtcc_terrain_water.py` (§3.8).

Another Swedish city: register it in `tools/se/se_cities.py`, then
`download_eubucco_city.py <slug>` and `build_city.py <slug>`.

## 15.3 United Kingdom, from nothing

```bash
# 1. token first — without it the run silently falls back to band priors (§3.4)
$env:UK_EPC_API_TOKEN = "..."      # or set it in the repo-root .env

python tools/uk/ingest_ehs.py --download    # EHS tables + band priors
python tools/uk/ingest_tabula.py            # England archetypes
python tools/uk/uk_data_pipeline.py         # OSM + EPC join, all cities
python tools/uk/sample_epc_matches.py       # AUDIT before trusting — §5.6
python build.py --uk                        # assemble the UK viewer
```

## 15.4 Checks worth running

```bash
# frontend typecheck (currently clean)
cd frontend && npx tsc --noEmit

# viewer scripts parse (no module system to catch errors)
for f in viewer/js/*.js; do node --check "$f" || echo "BROKEN: $f"; done

# logbook content: numbering, page files, cited paths, cross-references
cd logbook && .venv\Scripts\python.exe scripts\check_content.py

# every service responds
for u in http://localhost:8000/api/health http://localhost:5173/ \
         http://localhost:8765/gothenburg_3d.html http://localhost:8010/; do
  printf "%-50s " "$u"; curl -s -o /dev/null -w "HTTP %{http_code}\n" -m 8 "$u"
done
```

**A 200 from the viewer proves nothing about whether it boots** (§6.2). Load the
page with Playwright, wait for the `#loading` overlay to hide, time a trivial
`page.evaluate(() => 1+1)`, and look at the screenshot. Healthy is
`booted: True | main-thread: <100ms | errors: 0`.

## 15.5 Secrets

`.env` is gitignored and holds `OPENAI_API_KEY`, `UK_EPC_API_TOKEN`,
`LANTMATERIET_USER` / `_PASSWORD`. Never commit and never echo a value — print
names or lengths only when checking they exist.

---

# 16. Open questions

Genuinely not established. Listed rather than guessed at.

## Data provenance

- **The energideklaration extract's vintage window.** Which registration dates
  does `epc_sweden.duckdb` actually span? Every Swedish figure inherits this, and
  it is currently unrecorded.
- **UK per-district match rates.** The matched-vs-band-prior split per district
  is computed into `cities.json` but not written down anywhere as a result.
- **Boverket klimatdatabas extract date.** Emission factors are fetched live and
  cached; which snapshot produced a given carbon figure is not recorded.

## Method

- **Façade defect model.** Architecture, training set size, and validation
  metrics live in the separate ML project, not this repository. Without them the
  F criterion's reliability cannot be stated.
- **AHP weights.** The four presets are in the code, but whose pairwise
  judgements produced them, and when, is not recorded.
- **`f_dh` and `carbon_factor_heat`.** The optimiser's degree-day factor and heat
  carbon factor come in as request parameters — their defaults and sources should
  be pinned here.
- **Façade and roof environmental analysis** (§13.3) — not implemented for all
  three analyses.

## Record

- **Funding programme, grant number and partner organisations** are not recorded
  anywhere in the repository.
- **Publications.** No list exists to compile from.
- **Which tool version produced which published figure.** Given §14.2 and §14.1,
  a figure is only interpretable alongside its run date. There is no register.

---

*Compiled from the repository on 2026-08-27. Companion documents:
[CODEMAP.md](CODEMAP.md) for file-level structure, [logbook/](logbook/) for the
browsable stage-by-stage version.*



