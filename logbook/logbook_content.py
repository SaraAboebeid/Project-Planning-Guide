"""All logbook prose, separated from layout.

>>> THIS IS THE FILE TO EDIT. <<<

Every word shown in the logbook lives here. The page modules under ``pages/``
contain no text at all — they just call ``render_page`` with one of the dicts
below, so you never have to touch Streamlit code to change wording.

Schema
------
number   int    position in the sidebar
title    str    page title
stage    str    one of raw | interim | processed | metadata | method | result
purpose  str    markdown paragraph under the title
overview dict   {title, subtitle, items: [(label, text), ...]}
sections list   [{title, badge?, body?, table?, files?}, ...]
todo     str?   rendered as a visible warning — use it, don't invent content

``files`` entries are repo-relative paths. They are resolved against the real
repository when the page loads, so a path that no longer exists is flagged in
red rather than silently describing deleted code.

Numbers quoted below were read from the repository and the running app on
2026-08-26. Where a figure is a live count it is labelled as such.
"""

# ─────────────────────────────────────────────────────────────────────────────
DATA_PORTAL = {
    "number": 1,
    "title": "Data Portal",
    "stage": "raw",
    "purpose": """
Every dataset the tool ingests, what it covers and where it physically sits.
This is the inventory page. Licensing and match quality are on
**3. Data Provenance**; what actually happens to the data is on
**4. Sweden Pipeline** and **5. UK Pipeline**, which work differently and are
documented separately.
""",
    "overview": {
        "title": "Dataset Overview",
        "subtitle": "From open registers to the payloads the viewer extrudes.",
        "items": [
            ("Building geometry", "EUBUCCO in Sweden; OpenStreetMap via Overpass in the UK."),
            ("Energy performance", "Swedish energideklaration register; UK EPC open-data service."),
            ("Archetypes & surveys", "EPISCOPE/TABULA typologies, and the English Housing Survey for UK band priors."),
            ("Cost & carbon", "Wikells construction catalogue and Boverket's klimatdatabas."),
            ("Remote sensing", "DTCC airborne LiDAR — vegetation, roof form and terrain. Gothenburg only."),
            ("Context & market", "SCB statistics, OSM networks, Västtrafik and Trafikverket feeds, Booli and Boplats listings."),
        ],
    },
    "sections": [
        {
            "title": "SE · Building geometry — EUBUCCO",
            "badge": "raw",
            "body": """
EUBUCCO v0.2 fuses OpenStreetMap, Microsoft Building Footprints and
national registries into building height, floors, construction year and type
estimates, with confidence bounds and a per-field source tag.

In **Sweden** it supplies the footprint polygon itself. Regions are streamed as
parquet from EUBUCCO's anonymous S3 bucket and clipped to each city's bounding
box, so a city build never pulls the whole country.

**Live figure:** the Gothenburg payload carries **92,973 buildings**.
""",
            "files": [
                "data/eubucco",
                "download_eubucco_sweden_v3.py",
                "tools/se/download_eubucco_city.py",
                "assets/buildings.json",
            ],
        },
        {
            "title": "UK · Building geometry — OpenStreetMap",
            "badge": "raw",
            "body": """
The UK does **not** use EUBUCCO for geometry. Footprints come from
**OpenStreetMap via the Overpass API**, because OSM carries the `ref:GB:uprn`
tag that makes an address-based certificate join possible.

EUBUCCO is still used in the UK, but purely as an **attribute** source for
height, floors, construction year and type. Note its public bucket is organised
at NUTS2 granularity (4 characters, e.g. `UKI3`), not NUTS3 — every NUTS3-keyed
URL 404s. Individual rows carry their finer NUTS3 `region_id`, so filtering
stays precise; only the download granularity is coarse.
""",
            "files": ["tools/uk/ingest_eubucco.py", "tools/uk/cities.py", "data/uk_raw"],
        },
        {
            "title": "SE · Energy performance — energideklaration",
            "badge": "raw",
            "body": """
The Swedish national EPC register, held locally as a DuckDB database
(~461 MB, **1.88 million rows**). It backs both the per-building panels and the
chat assistant's whole-dataset questions.

Open it **read-only** (`duckdb.connect(path, read_only=True)`) — a writable
handle takes an exclusive lock and blocks the backend.

**Live figure:** **85,670** Gothenburg buildings carry a matched EPC.
""",
            "files": [
                "data/sensitivity/epc_sweden.duckdb",
                "scripts/fetch_epc_db.py",
                "utils/location_data.py",
            ],
        },
        {
            "title": "UK · Energy performance — EPC open-data service",
            "badge": "raw",
            "body": """
The official service at `get-energy-performance-data.communities.gov.uk`. It
replaced `epc.opendatacommunities.org`, which was **retired on 30 May 2026**.

`gov.uk/find-energy-certificate` is a per-property lookup UI, not a bulk source —
it is deliberately not scraped.

**Access needs a bearer token.** Sign in with GOV.UK One Login, copy the token
from your account page, and set `UK_EPC_API_TOKEN` in the environment or the
repo-root `.env`. Without a token, certificate lookups return nothing and the
pipeline silently falls back to English Housing Survey band priors — so an
untokened run produces a plausible-looking but survey-derived result.
""",
            "files": ["tools/uk/ingest_epc.py"],
        },
        {
            "title": "Archetypes — TABULA / EPISCOPE",
            "badge": "raw",
            "body": """
The EU EPISCOPE/TABULA building typologies give period- and type-specific
U-values, used wherever a building has no measured data. The UK table is parsed
from the real *Building Typology Brochure: England* (BRE, September 2014) rather
than transcribed by hand.

**Live figure:** **26,257** Gothenburg buildings matched to a TABULA archetype.
""",
            "files": ["utils/tabula_matching.py", "tools/uk/ingest_tabula.py"],
        },
        {
            "title": "UK · English Housing Survey 2024-25",
            "badge": "raw",
            "body": """
Headline annex tables (OpenDocument `.ods`, published by MHCLG, Chapter 2 —
Energy Efficiency). Parsed into three products:

| Output | Used for |
|---|---|
| `ehs_2024_25.json` | the full parsed tables |
| `epc_band_priors.json` | band distribution by dwelling age and type |
| `retrofit_cost_band_c.json` | cost to reach EER band C |

The band priors are the fallback whenever a UK building has no matching
certificate.
""",
            "files": ["tools/uk/ingest_ehs.py"],
        },
        {
            "title": "Cost & carbon — Wikells and Boverket",
            "badge": "raw",
            "body": """
**Wikells** supplies Swedish construction cost line items for renovation
assemblies. **Boverket's klimatdatabas** supplies emission factors for the
embodied-carbon side.

UK cost and carbon are **synthetic placeholders** — see **15. Known
Limitations**.
""",
            "files": [
                "data/wikells_catalogue.json",
                "utils/boverket_api.py",
                "frontend/src/config/wikellsData.ts",
                "frontend/src/config/wikellsCarbonMapping.ts",
            ],
        },
        {
            "title": "SE · Remote sensing — DTCC LiDAR",
            "badge": "raw",
            "body": """
Airborne laser tiles served openly by DTCC at Chalmers
(`compute.dtcc.chalmers.se:8000`, EPSG:3006 / SWEREF99 TM). Three products are
derived: tree and shrub positions, per-building roof form (eave, ridge, azimuth)
and a shaded-relief terrain image.

At **6.3 GB** this is by far the largest input, and the reason the repository is
heavy to clone. **Gothenburg only** — there is no UK equivalent.
""",
            "files": [
                "data/dtcc",
                "tools/se/dtcc_vegetation.py",
                "tools/se/dtcc_roofs.py",
                "tools/se/dtcc_terrain_water.py",
            ],
        },
        {
            "title": "Weather — EPW",
            "badge": "raw",
            "body": """
EnergyPlus Weather files drive both the building simulations and the
environmental analyses (sun hours, incident radiation, thermal comfort). One EPW
is mapped per city.
""",
            "files": ["data/epw"],
        },
        {
            "title": "SE · Context, mobility and market data",
            "badge": "raw",
            "body": """
| Source | What it gives | Cadence |
|---|---|---|
| SCB (Statistics Sweden) | DeSO demographics and income, WFS overlays | static |
| OpenStreetMap | road centrelines, green areas, street network for space syntax | on demand |
| Västtrafik | stops, live vehicle positions, departures, disruptions, parking | live |
| Trafikverket | traffic cameras and road conditions | on demand |
| Boplats | first-hand rental listings | daily |
| Booli | sale listings and prices | weekly |

Boplats and Booli are scraped into SQLite, then exported to JSON for the Data
Explorer. Booli is a Next.js site, so the scraper reads the data embedded in
each search page — no paid API is used.

**Live figure:** **1,018** Boplats listings in the current export.
""",
            "files": [
                "boplats_scraper.py",
                "booli_scraper.py",
                "trafikverket_scraper.py",
                "boplats_apartments.db",
                "booli_listings.db",
                "trafikverket.db",
            ],
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
SCRIPT_BROWSER = {
    "number": 2,
    "title": "Script Browser",
    "stage": "metadata",
    "purpose": """
What every file in the codebase does. This page renders **CODEMAP.md** from the
repository root, so it cannot drift from the map that is version-controlled
alongside the code — if the map is updated, this page updates with it.
""",
    "overview": {
        "title": "Repository map",
        "subtitle": "The canonical project index is kept in CODEMAP.md and rendered live here.",
        "items": [
            ("Source of truth", "CODEMAP.md in the repository root."),
            ("Purpose", "A single, navigable guide to scripts, modules and major project flows."),
            ("Why it matters", "This prevents the logbook from drifting away from the code it describes."),
        ],
    },
    "sections": [
        {
            "title": "Live CODEMAP rendering",
            "badge": "metadata",
            "body": """
This page is intentionally not a static copy of the repository map. It reads
**CODEMAP.md** from disk each time the page loads, so the same file that sits
next to the code is also the one shown in the logbook.

The result is a direct check against drift: if a script is renamed, a new page
is added, or a major workflow is restructured, the map and the logbook page can
be updated in one place and then re-read without a separate manual sync step.
""",
            "files": ["CODEMAP.md", "logbook/scripts/ui_utils.py"],
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
PROVENANCE = {
    "number": 3,
    "title": "Data Provenance & Access",
    "stage": "metadata",
    "purpose": """
For each dataset: who published it, which version is in use, and how well it
actually matches the buildings. This is the page to read before quoting any
number outside the project.
""",
    "overview": {
        "title": "Why provenance is tracked separately",
        "subtitle": "Coverage and vintage differ per source and per country.",
        "items": [
            ("Coverage is partial", "Not every building has a certificate, and matching is imperfect."),
            ("Vintage matters", "A certificate from 2009 and one from 2024 describe different buildings."),
            ("Method differs by country", "Sweden matches geometrically, the UK by address — they are not comparable."),
            ("Fallbacks look like data", "An inferred value renders the same as a measured one unless the source is stated."),
        ],
    },
    "sections": [
        {
            "title": "Source register",
            "badge": "metadata",
            "table": [
                ["Dataset", "Publisher", "Version / vintage"],
                ["EUBUCCO", "eubucco.com", "v0.2"],
                ["OpenStreetMap", "OSM contributors", "live, cached per Overpass run"],
                ["SCB WFS layers", "Statistics Sweden", "—"],
                ["Energideklaration", "Boverket", "see open question below"],
                ["UK EPC", "MHCLG", "current service, from 30 May 2026"],
                ["English Housing Survey", "MHCLG", "2024-25 headline annex tables"],
                ["TABULA / EPISCOPE England", "BRE", "September 2014 brochure"],
                ["Boverket klimatdatabas", "Boverket", "live API"],
                ["Wikells", "Wikells Byggberäkningar", "—"],
                ["DTCC LiDAR", "DTCC, Chalmers", "—"],
                ["Booli / Boplats", "Booli AB / Boplats Göteborg", "weekly / daily scrape"],
            ],
        },
        {
            "title": "SE · Matching coverage",
            "badge": "processed",
            "body": """
Certificates are joined to footprints **geometrically**. Method in full on
**4. Sweden Pipeline**.

| Quantity | Count | Share |
|---|---|---|
| Buildings in the Gothenburg payload | 92,973 | 100% |
| With a matched EPC | 85,670 | 92% |
| With a TABULA archetype | 26,257 | 28% |
| Tagged with a primärområde | ~75,719 | 81% |

**Cadastral and address joins cannot raise this coverage** on the
EUBUCCO-to-footprint link, because **EUBUCCO carries no cadastral id and no
address** — there is no key to join on, so the link has to be spatial. This is a
property of the data, not a gap in effort. Recorded here so the question is not
reopened from scratch.

Cadastral ids *are* used, but on the certificate side: to build a property-level
aggregation that lets one shared declaration reach the property's other heated
buildings. See **4. Sweden Pipeline**.
""",
            "files": ["data_pipeline.py", "tools/se/geocode_epc.py", "tools/se/ingest_districts.py"],
        },
        {
            "title": "UK · Matching coverage",
            "badge": "processed",
            "body": """
The UK join is **address-based, not geometric** — UPRN where OSM carries one,
otherwise postcode plus house number. Method in full on **5. UK Pipeline**.

Two consequences for any UK figure:

1. **Coverage depends on the API token.** Without `UK_EPC_API_TOKEN` the
   certificate lookup returns nothing and every building falls back to English
   Housing Survey band priors. The output still looks complete.
2. **Matched and inferred buildings are different things.** A band-prior
   building carries a survey-derived distribution, not a measurement.

`tools/uk/sample_epc_matches.py` prints a reviewable sample of matches per
district — the intended way to audit quality before trusting a district's
numbers.
""",
            "files": ["tools/uk/ingest_epc.py", "tools/uk/sample_epc_matches.py"],
        },
    ],
    "todo": "Per-district UK match rates (matched vs band-prior), and the exact "
            "vintage window of the energideklaration extract in data/sensitivity/.",
}

# ─────────────────────────────────────────────────────────────────────────────
SWEDEN_PIPELINE = {
    "number": 4,
    "title": "Sweden Pipeline",
    "stage": "interim",
    "purpose": """
How Swedish registers become the payload the viewer and wizard read. Almost all
of it happens in one module, `data_pipeline.py`, which is imported by twelve
other scripts and is the piece to understand first.

The UK chain is **completely different** — different geometry source, different
join method. It is on **5. UK Pipeline**.
""",
    "overview": {
        "title": "The pipeline in order",
        "subtitle": "EUBUCCO in, buildings.json out.",
        "items": [
            ("Load geometry", "EUBUCCO footprints for the city bounding box."),
            ("Match EPC", "Polygon-overlap join between certificates and footprints."),
            ("Fall back", "Nearest-neighbour, then cached forward geocoding."),
            ("Match archetypes", "TABULA lookup by construction year and use category."),
            ("Tag districts", "Primärområde from the city's ArcGIS service."),
            ("Emit", "assets/buildings.json — 57 MB, ~92,973 records."),
        ],
    },
    "sections": [
        {
            "title": "EPC to building matching — the overlap method",
            "badge": "method",
            "body": """
Each building takes the certificate footprint that covers the **largest share of
its own area**. Two thresholds govern the join:

```
OVERLAP_MIN    = 0.05   # below this, prefer the proximity fallback
OVERLAP_STRONG = 0.30   # confident same-building; also the dedup cutoff
```

Buildings overlapping nothing fall back to the nearest footprint. When several
buildings claim one certificate — which happens legitimately where OSM splits a
single cadastral building into parts — every claimant overlapping at least 30%
keeps it. Weak and fallback claimants are dropped **only** when a strong
claimant exists; if none do, the single best-overlapping building wins.

This replaced an earlier nearest-centroid method, which in dense blocks gave a
building the certificate of a *neighbour*. Measured: the centroid method handed
**~1,800 buildings** a certificate for a footprint their polygon never touches.
""",
            "files": ["data_pipeline.py"],
        },
        {
            "title": "Geocoding fallback",
            "badge": "interim",
            "body": """
Certificates that neither overlap nor sit near a footprint are pushed through a
**cached** forward geocoder. The cache is committed
(`data/epc_geocode_cache.json`) so a rebuild does not re-hit the geocoding
service and results stay reproducible.
""",
            "files": ["tools/se/geocode_epc.py", "data/epc_geocode_cache.json"],
        },
        {
            "title": "District tagging — and the trap",
            "badge": "processed",
            "body": """
Buildings are tagged with their **primärområde** (96 official Gothenburg
neighborhoods) from the city's public ArcGIS FeatureServer.

> **`build.py` wipes these tags.** It regenerates `buildings.json` from scratch,
> so district tagging must be re-run immediately afterwards:
>
> ```bash
> python build.py && python tools/se/ingest_districts.py
> ```
>
> Skip it and `primary_area` drops to zero, which silently breaks the
> neighborhood picker and the chat assistant's district tools. Expect roughly
> **75,719 of 92,973** buildings tagged after a correct run.
""",
            "files": ["tools/se/ingest_districts.py", "data/districts"],
        },
        {
            "title": "Vegetation, roofs and terrain",
            "badge": "processed",
            "body": """
Three separate passes over the LiDAR tiles produce viewer layers: tree and shrub
points, per-building roof geometry, and a terrain hillshade. A water mask is
generated in the terrain pass and then used to remove vegetation that the point
cloud placed on the river, harbour and canals.

This whole stage is Gothenburg-only; no other city in the tool has LiDAR.
""",
            "files": [
                "tools/se/dtcc_vegetation.py",
                "tools/se/dtcc_roofs.py",
                "tools/se/dtcc_terrain_water.py",
                "tools/se/filter_vegetation_water.py",
            ],
        },
        {
            "title": "Adding another Swedish city",
            "badge": "method",
            "body": """
`tools/se/se_cities.py` is the **single source of truth**. Register the city
there, then:

```bash
python tools/se/download_eubucco_city.py <slug>
python tools/se/build_city.py <slug>
```

Malmö is already built (`assets/buildings_malmo.json`).
""",
            "files": [
                "tools/se/se_cities.py",
                "tools/se/build_city.py",
                "tools/se/download_eubucco_city.py",
            ],
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
UK_PIPELINE = {
    "number": 5,
    "title": "UK Pipeline",
    "stage": "interim",
    "purpose": """
The UK chain is built separately from the Swedish one and shares almost nothing
with it: **OpenStreetMap** geometry rather than EUBUCCO, an **address-based**
certificate join rather than a geometric one, and a **survey-based fallback**
where no certificate matches.

What the two chains *do* share is the output schema — which is the whole point.
""",
    "overview": {
        "title": "Four steps",
        "subtitle": "Run per focus city: London, Birmingham, Nottingham.",
        "items": [
            ("Footprints", "Pull building geometry from OpenStreetMap via Overpass."),
            ("Certificates", "Join EPCs by UPRN, or postcode plus house number."),
            ("Fallback", "Where nothing matches, apply English Housing Survey band priors."),
            ("Emit", "Records in exactly the schema the Gothenburg viewer already renders."),
        ],
    },
    "sections": [
        {
            "title": "Why the schema match matters",
            "badge": "method",
            "body": """
Step 4 is the design decision. Because UK records are emitted in the **same
shape as `assets/buildings.json`**, the existing viewer draws UK buildings with
no changes — same legend, same colour modes, same façade inspector. Only the
data source and the camera position differ.

That is why a completely different acquisition chain did not require a second
viewer.

```bash
python tools/uk/uk_data_pipeline.py                 # all cities
python tools/uk/uk_data_pipeline.py --city london
python tools/uk/uk_data_pipeline.py --refresh       # ignore the Overpass cache
```

Outputs land in `frontend/public/uk/`: `buildings_<city>.json` per city, plus
`cities.json` carrying the registry and per-city stats.
""",
            "files": ["tools/uk/uk_data_pipeline.py", "tools/uk/cities.py"],
        },
        {
            "title": "The certificate join",
            "badge": "method",
            "body": """
Two keys, in order of confidence:

1. **UPRN** — OSM's `ref:GB:uprn` tag matched against the `uprn` field on the
   certificate record. Unambiguous where present.
2. **Postcode plus house number** — parsed from the certificate's
   `addressLine1..4`.

The endpoint contract was verified against the authoritative API spec rather
than documentation prose:

```
GET /api/domestic/search?postcode=...&current_page=1&page_size=5000
```

**The token is not optional in practice.** Without `UK_EPC_API_TOKEN` every
lookup returns empty and the run completes anyway on band priors alone — quietly
producing a survey-derived result that looks like a measured one.
""",
            "files": ["tools/uk/ingest_epc.py"],
        },
        {
            "title": "Band priors — the fallback",
            "badge": "interim",
            "body": """
Where no certificate matches, the building is assigned a band distribution from
the **English Housing Survey 2024-25** by dwelling age and type, and a
cost-to-band-C figure from the same source.

This keeps every UK building analysable, but a band-prior building carries a
population statistic, not a measurement. Any UK aggregate mixes the two.
""",
            "files": ["tools/uk/ingest_ehs.py"],
        },
        {
            "title": "EUBUCCO as attributes only",
            "badge": "interim",
            "body": """
UK EUBUCCO supplies height, floors, construction year and type — never the
footprint. Download granularity is **NUTS2** (`UKI3`), not NUTS3; NUTS3-keyed
URLs 404. Rows carry a NUTS3 `region_id` so filtering is still precise.

Per-city file names are listed in `cities.py` under `eubucco_file`.
""",
            "files": ["tools/uk/ingest_eubucco.py"],
        },
        {
            "title": "Auditing a district before trusting it",
            "badge": "method",
            "body": """
`sample_epc_matches.py` prints a handful of building-to-certificate matches per
district and writes a JSON sample. Run it after any pipeline change — it is the
only practical check that the address join is landing on the right buildings.
""",
            "files": ["tools/uk/sample_epc_matches.py"],
        },
        {
            "title": "What the UK track does not have",
            "badge": "metadata",
            "body": """
| Capability | Sweden | UK |
|---|---|---|
| LiDAR vegetation, roofs, terrain | yes | no |
| District / neighborhood tagging | yes | no |
| Live transit and traffic layers | yes | no |
| Market listings (sales, rents) | yes | no |
| Real cost and carbon data | yes | **no — synthetic placeholders** |

See **15. Known Limitations**.
""",
            "files": ["frontend/src/config/ukPlaceholderCostCarbon.ts"],
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
DIGITAL_TWIN = {
    "number": 6,
    "title": "Digital Twin Construction",
    "stage": "processed",
    "purpose": """
How the processed data becomes a navigable 3D city. `build.py` assembles the
viewer from source; the browser never loads `viewer/` directly.
""",
    "overview": {
        "title": "Build chain",
        "subtitle": "Source files are assembled into a single HTML artifact.",
        "items": [
            ("Sources", "viewer/index.html, viewer/js/*.js, viewer/styles/main.css."),
            ("Assembly", "build.py inlines them into assets/<city>_3d.html."),
            ("Data", "buildings.json plus the LiDAR and context layers."),
            ("Render", "Cesium with Google photorealistic 3D tiles as an optional base."),
        ],
    },
    "sections": [
        {
            "title": "Why the viewer is built, not served",
            "badge": "method",
            "body": """
`viewer/js/*.js` are **classic scripts sharing globals** — deliberately no
`import`/`export`. Editing them changes nothing on its own: `build.py` inlines
everything into `assets/<city>_3d.html`, and that file is what the browser
loads.

Working rule: `node --check <file>` to validate, then `python build.py`. In
development the Vite server also serves the built viewer directly, so
`launch.py` is only needed for the standalone page.
""",
            "files": ["build.py", "viewer/index.html", "viewer/js", "assets/gothenburg_3d.html"],
        },
        {
            "title": "Rendering ~93k buildings without killing the tab",
            "badge": "method",
            "body": """
One Cesium `Entity` per building does not work — at this scale it exhausts
memory and freezes the tab. The viewer instead uses **one batched `Primitive`**
with per-instance colour, and carries `id: { _dataIdx: i }` so picking still
resolves back to the underlying record.

Related constraint: `buildings.json` is **57 MB**, so it is fetched with
`cache: 'default'`. Forcing `'no-store'` re-downloads it on every reload.
""",
            "files": ["viewer/js/cesium.js", "viewer/js/bootstrap.js"],
        },
        {
            "title": "One viewer, two countries",
            "badge": "processed",
            "body": """
`bootstrap.js` resolves the active country and city, loads that location's
payload, then wires the remaining scripts in a fixed order. Sweden and the UK
share the same viewer code and the same `assets/` output; only the payload and
the profile differ — which is exactly what the UK pipeline's schema match buys.
""",
            "files": ["viewer/js/bootstrap.js", "viewer/js/city_switcher.js", "assets/uk_3d.html"],
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
SHOEBOX_IDF = {
    "number": 7,
    "title": "Shoebox & IDF Generation",
    "stage": "method",
    "purpose": """
How one building record becomes an EnergyPlus input file. This is the bridge
between the city-scale database and the physics engine, and it is where most
modelling assumptions enter.
""",
    "sections": [
        {
            "title": "The shoebox abstraction",
            "badge": "method",
            "body": """
Each building is reduced to a **single-zone "shoebox"**: the real footprint ring
is projected from lon/lat into local metres and extruded, giving true orientation
and true envelope areas while keeping one thermal zone.

The projection reuses the same equirectangular local-metre convention as the
rest of the pipeline, so geometry stays consistent between the viewer and the
simulation.
""",
            "files": ["tools/idf/generate_idf.py", "tools/idf/geometry.py"],
        },
        {
            "title": "Where the numbers come from",
            "badge": "method",
            "body": """
Priority order for every envelope property:

1. the building's own record (measured or certificate-derived),
2. its TABULA archetype,
3. `tools/idf/defaults.py`.

Keeping the fallbacks in one module means every assumption used in place of real
data is in a single readable file rather than scattered through the generator.
""",
            "files": ["tools/idf/defaults.py"],
        },
        {
            "title": "Domestic hot water",
            "badge": "method",
            "body": """
DHW is modelled explicitly — Sveby use intensity driving a `WaterHeater:Mixed`
object, surfacing in EPSM output as *Water Systems*.

> **Comparability warning.** Totals now include hot water. Runs produced before
> DHW was added are **not comparable** to runs produced after it. Check the run
> date before placing two figures side by side.
""",
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
SIMULATION = {
    "number": 8,
    "title": "Simulation Process",
    "stage": "method",
    "purpose": """
How baselines and renovation packages are actually simulated: EnergyPlus via
EPSM, submitted as batches, cached in SQLite so a building is never simulated
twice for the same configuration.
""",
    "overview": {
        "title": "Simulation flow",
        "subtitle": "From selected buildings to stored results.",
        "items": [
            ("Generate", "One shoebox IDF per building per variant."),
            ("Submit", "Batch to EPSM, the containerised EnergyPlus service on :8010."),
            ("Poll", "Batch status until every run completes."),
            ("Store", "Results into data/simulation_database.sqlite3."),
            ("Look up", "Later requests hit the cache instead of re-running."),
        ],
    },
    "sections": [
        {
            "title": "EPSM",
            "badge": "method",
            "body": """
EPSM is run from `docker-compose.epsm.yml` and comprises a backend, a worker, a
Postgres database and Redis. The app talks to it on **:8010**.

When simulations fail, check Docker Desktop is running before anything else —
that has been the cause every time so far.
""",
            "files": ["docker-compose.epsm.yml"],
        },
        {
            "title": "The results cache",
            "badge": "processed",
            "body": """
Results live in a SQLite datastore (**2.0 GB** and growing) that replaced an
earlier flat JSON file. Eleven backend routes cover submit, status, results,
batch handling, time series and lookup.

The baseline batch lookup is what makes the wizard feel instant: Step 4 compares
packages against an already-simulated baseline rather than re-running it.
""",
            "files": ["backend/simdb.py", "data/simulation_database.sqlite3"],
        },
        {
            "title": "Known gap — district cooling",
            "badge": "metadata",
            "body": """
EPSM's end-use rows carry **no district-cooling column**. Ideal-loads cooling is
therefore reported as **0** in every total, even though the simulation trace
shows it is not zero.

Any cooling-inclusive figure from this tool is currently understated. See
**15. Known Limitations**.
""",
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
PRIORITISATION = {
    "number": 9,
    "title": "Retrofit Prioritisation",
    "stage": "method",
    "purpose": """
Which buildings to renovate first. A hybrid expert-rule and MCDA scoring model
that ranks a portfolio in Step 2 and feeds the top-N forward into the baseline
and simulation steps.
""",
    "sections": [
        {
            "title": "The scoring model",
            "badge": "method",
            "body": """
Each building scores 0–100 under four criterion groups, combined into one
weighted priority score:

$$P = w_E \\cdot E + w_F \\cdot F + w_C \\cdot C + w_R \\cdot R$$

with weights normalised to sum to 1.

| | Criterion | Meaning |
|---|---|---|
| **E** | Energy performance | energy use / EPC class — worse implies higher priority |
| **F** | Façade / envelope | ML defect load, or building-age proxy where no photo exists |
| **C** | Building characteristics | vintage and heated size — older and larger implies higher |
| **R** | Retrofit potential | energy headroom, envelope poorness, scale |

Sub-scores are **transparent expert rules** against benchmarked thresholds
rather than a fitted model, so every number can be explained back to the user.
Each sub-score also carries a **confidence** reflecting data availability, which
keeps missing data visible instead of silently scoring zero.
""",
            "files": [
                "frontend/src/utils/retrofitPriority.ts",
                "frontend/src/components/RetrofitPriorityPanel.tsx",
            ],
        },
        {
            "title": "Weights and presets",
            "badge": "method",
            "body": """
Weights are set directly or derived from expert pairwise judgements via **AHP**.
Four presets ship:

| Preset | wE | wF | wC | wR |
|---|---|---|---|---|
| Balanced (default) | 0.35 | 0.30 | 0.15 | 0.20 |
| Energy-first | 0.55 | 0.15 | 0.10 | 0.20 |
| Condition-first | 0.20 | 0.50 | 0.15 | 0.15 |
| Cost-effectiveness | 0.25 | 0.15 | 0.10 | 0.50 |

The maths is deliberately light so it runs client-side over thousands of
buildings without a round trip.
""",
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
OPTIMISATION = {
    "number": 10,
    "title": "Optimisation Process",
    "stage": "method",
    "purpose": """
Finding renovation packages that trade cost, carbon and energy well. An
analytic enumeration and Pareto filter runs first; only the winners are then
validated in EnergyPlus.
""",
    "sections": [
        {
            "title": "Enumerate, then filter",
            "badge": "method",
            "body": """
Every component contributes one option to a combination. The optimiser
enumerates the combinations, evaluates each with **degree-day physics**, and
returns the non-dominated front on **(cost, carbon, energy)**.

This stage is fast and analytic by design — the expensive EnergyPlus validation
is applied only to the front, not to the whole combinatorial space.

The Pareto filter uses a sorted skyline sweep rather than pairwise comparison,
which matters at this data scale.
""",
            "files": ["backend/main.py", "frontend/src/components/OptimizerPanel.tsx"],
        },
        {
            "title": "Anchoring to the real baseline",
            "badge": "method",
            "body": """
A fixed load `Q_fixed` — everything a retrofit cannot change — is derived from
the **measured EPSM baseline** rather than assumed:

```
q_fixed = baseline_total_kwh − baseline_heat_transfer × f_dh
```

This forces the analytic physics curve to pass through the known baseline point
when every component is left at its as-built U-value, so the fast model and the
simulation agree at the anchor.

Discounting uses a present-value annuity factor over the study period:
$$\\text{annuity} = \\sum_{y=1}^{N} \\frac{1}{(1+r)^y}$$
""",
        },
        {
            "title": "Why non-improving options are excluded",
            "badge": "method",
            "body": """
A synthetic **"keep as-built"** option lets the optimiser decide a component is
not worth touching — essential for an honest cost/carbon trade-off.

Any catalogue option **worse than as-built is dropped and reported, never
silently ignored**. This exists because the Wikells catalogue mixes complete
insulated assemblies (roof plus 340 mm insulation, U=0.11) with bare coverings
and uninsulated build-ups (TRP roof on masonite beams, U=3.37; "M0" studs with
no insulation, U=1.75). Those are single layers, not whole-component retrofits.
Offering them as retrofits made the optimiser propose packages that *increased*
heating demand several-fold.
""",
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
DECISION_ANALYSIS = {
    "number": 11,
    "title": "Decision Analysis under Uncertainty",
    "stage": "method",
    "purpose": """
Choosing between retrofit options when the future is unknown. Rather than
assuming one energy price, options are evaluated across price scenarios and
compared with three classic decision rules.
""",
    "sections": [
        {
            "title": "The payoff matrix",
            "badge": "method",
            "body": """
Each option — every package, plus the do-nothing baseline — is evaluated under
Low, Medium and High energy-price scenarios. The outcome is the 30-year net
present benefit:

$$\\text{benefit}_i(s) = E^{saved}_i \\times price(s) \\times \\text{annuity} - I_i$$

where $E^{saved}_i$ is annual energy saved and $I_i$ the investment (zero for
the baseline). Energy price is used as the scenario axis because it is the
single biggest unknown driving a retrofit's payoff.
""",
            "files": [
                "frontend/src/utils/regretAnalysis.ts",
                "frontend/src/components/DecisionAnalysisPanel.tsx",
            ],
        },
        {
            "title": "Three decision rules",
            "badge": "method",
            "body": """
| Rule | Definition | Reads as |
|---|---|---|
| **Minimax regret** | regret = best-in-scenario − chosen; pick the smallest worst-case regret | least risk of having chosen wrong |
| **Uncertainty range** | best − worst across scenarios | small range implies robust |
| **Hurwicz** | $H = \\alpha \\cdot best + (1-\\alpha) \\cdot worst$ | α is optimism; α=0 is pure worst-case |

Presenting all three is deliberate: they can disagree, and where they disagree
is exactly where the decision deserves human judgement rather than an automated
recommendation. Results carry through to the Step 5 report.
""",
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
FACADE_ML = {
    "number": 12,
    "title": "Façade Inspection & Defect ML",
    "stage": "method",
    "purpose": """
Assessing envelope condition from photographs — both a machine-learning defect
detector and a vision-model estimate of window-to-wall ratio.
""",
    "sections": [
        {
            "title": "Defect detection",
            "badge": "method",
            "body": """
A trained crack and defect detector runs as a **separate service on the host**
(`:8020`) using its own torch environment; the app's backend proxies to it via
`/api/facade-detect`. Keeping it out of the backend process avoids loading torch
into the API server.

Detected defect load feeds the **F** criterion in the prioritisation score
(**9. Retrofit Prioritisation**), so a photo upload changes the ranking.

Uploads are available both in the 3D viewer and in Step 2 of the wizard.
""",
            "files": [
                "tools/ml/facade_detect_service.py",
                "frontend/src/components/FacadeDefectPanel.tsx",
            ],
        },
        {
            "title": "Window-to-wall ratio from vision",
            "badge": "method",
            "body": """
In the viewer, the camera flies to a façade, the user drags a rubber-band crop,
and a GPT-4 vision call estimates the window-to-wall ratio. Estimates are saved
to a WWR database so a façade is assessed once and reused.

WWR matters because it is both a strong driver of heating demand and one of the
attributes least often present in the source registers.
""",
            "files": [
                "viewer/js/facade_inspector.js",
                "viewer/js/facade_comparison.js",
                "data/wwr_database.json",
            ],
        },
    ],
    "todo": "Model architecture, training set size and validation metrics for the "
            "defect detector — these live in the separate ML project, not this repo.",
}

# ─────────────────────────────────────────────────────────────────────────────
CLIMATE_ENV = {
    "number": 13,
    "title": "Climate & Environmental Analysis",
    "stage": "method",
    "purpose": """
Outdoor environmental analysis around a clicked point: how much sun reaches the
ground, how much radiation accumulates, and how comfortable it actually feels.
""",
    "sections": [
        {
            "title": "Clean-room implementation",
            "badge": "method",
            "body": """
Sun hours and incident radiation are **clean-room** implementations: the methods
are the standard ones, but the code was written from the published methods
rather than derived from Ladybug or any other existing environmental toolkit.

Sun position comes from a compact astronomical algorithm; the sky is discretised
into a matrix built from the EPW file. Thermal comfort builds on the
`pythermalcomfort` library.
""",
            "files": [
                "backend/sun_hours.py",
                "backend/incident_radiation.py",
                "backend/thermal_comfort.py",
            ],
        },
        {
            "title": "The three analyses",
            "badge": "result",
            "table": [
                ["Analysis", "Output", "Viewer layer"],
                ["Direct sun hours", "Hours of direct sun over a ground disc, whole day in one call", "sunhours.js"],
                ["Incident radiation", "Cumulative irradiation on the ground disc, EPW-driven", "incident.js"],
                ["Thermal comfort", "UTCI plus solar mean radiant temperature; hour scrub or seasonal %", "comfort.js"],
            ],
            "files": ["viewer/js/sunhours.js", "viewer/js/incident.js", "viewer/js/comfort.js"],
        },
        {
            "title": "Scope",
            "badge": "metadata",
            "body": """
All three currently analyse a **ground disc** around a clicked point. Façade and
roof surface analysis is the natural extension and is not yet implemented for
all three.
""",
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
VIEWER_LAYERS = {
    "number": 14,
    "title": "Viewer Layers & Visualisation",
    "stage": "result",
    "purpose": """
Everything that can be switched on in the 3D viewer, and which layers are
city-specific versus available anywhere OSM has coverage.
""",
    "sections": [
        {
            "title": "Layer inventory",
            "badge": "result",
            "table": [
                ["Layer", "Source", "Availability"],
                ["Building colour modes", "EUBUCCO / OSM + certificates + TABULA", "any built city"],
                ["Roads / street network", "OpenStreetMap", "anywhere"],
                ["Space-syntax centrality", "OSM network, computed in backend", "anywhere"],
                ["Green index / green areas", "OpenStreetMap", "anywhere"],
                ["Vegetation (trees, shrubs)", "DTCC LiDAR", "Gothenburg only"],
                ["Roof form", "DTCC LiDAR", "Gothenburg only"],
                ["Terrain hillshade", "DTCC LiDAR", "Gothenburg only"],
                ["SCB demographics / income", "Statistics Sweden WFS", "Sweden only"],
                ["Transit (stops, live vehicles)", "Västtrafik", "Gothenburg only"],
                ["Traffic cameras & conditions", "Trafikverket", "Sweden only"],
                ["Market data (sales, rents)", "Booli + Boplats", "Gothenburg only"],
            ],
            "files": ["viewer/js/layers.js", "viewer/js/legend.js", "viewer/js/layer_docs.js"],
        },
        {
            "title": "Colour and accessibility",
            "badge": "metadata",
            "body": """
The semantic hues (green / red / amber) were retuned for colour-vision
deficiency and are defined centrally in `frontend/src/config/colors.ts`. Change
a hue there rather than per component, or the palette drifts apart.
""",
            "files": ["frontend/src/config/colors.ts"],
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
LIMITATIONS = {
    "number": 15,
    "title": "Known Limitations",
    "stage": "metadata",
    "purpose": """
Every known reason a number from this tool might be wrong or non-comparable.
Kept as a standing register rather than scattered through the code, because
these are the questions a reviewer will ask.
""",
    "sections": [
        {
            "title": "Numbers that are understated",
            "badge": "metadata",
            "body": """
**District cooling reads as zero.** EPSM's end-use rows have no district-cooling
column, so ideal-loads cooling is reported as 0 in every total, although the
simulation trace shows it is non-zero. Any cooling-inclusive total is currently
too low.
""",
        },
        {
            "title": "Numbers that are not comparable across time",
            "badge": "metadata",
            "body": """
**DHW was added to the model.** Domestic hot water is now simulated, so totals
include it. Runs from before that change are not comparable to runs after it.
There is no automatic guard — check run dates before comparing two figures.
""",
        },
        {
            "title": "Numbers that are not comparable across countries",
            "badge": "metadata",
            "body": """
**Sweden and the UK are matched by different methods.** Sweden joins
certificates to footprints geometrically; the UK joins them by address, and
falls back to English Housing Survey band priors where nothing matches. A
Swedish coverage percentage and a UK one do not mean the same thing.

**A UK run without `UK_EPC_API_TOKEN` completes anyway** — on band priors alone,
producing a survey-derived result that looks measured.
""",
        },
        {
            "title": "Numbers that are not real",
            "badge": "metadata",
            "body": """
**UK cost and carbon are synthetic placeholders**
(`frontend/src/config/ukPlaceholderCostCarbon.ts`). They exist so the UK track
runs end to end. They must never be presented as real figures.
""",
            "files": ["frontend/src/config/ukPlaceholderCostCarbon.ts"],
        },
        {
            "title": "Coverage ceilings",
            "badge": "metadata",
            "body": """
**Swedish EPC matching is geometric only** — because EUBUCCO carries no cadastral
id and no address, so there is no key on which to join it to the footprint
registry. Cadastral and address joins cannot raise coverage on that link.

**TABULA coverage is 28%.** Roughly seven in ten Gothenburg buildings have no
archetype match and fall back to defaults.
""",
        },
        {
            "title": "Reporting conventions",
            "badge": "metadata",
            "body": """
Show `—` or "not available" rather than a plausible zero. Keep the source next
to any cited constant, and keep `provisional` flags visible in the UI rather
than hiding them once a value looks reasonable.
""",
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
PROJECT_TEAM = {
    "number": 16,
    "title": "Project Team & Credits",
    "stage": "metadata",
    "purpose": """
This page records the project lineage, the people directly involved, and the
external methods and data sources that make the platform possible. It is meant
as a traceability statement: who is responsible, where the method came from, and
what is inherited versus built in-house.
""",
    "overview": {
        "title": "Project traceability",
        "subtitle": "Research lineage, team roles, and evidence for the platform design.",
        "items": [
            ("Lineage", "The current tool extends earlier DT4PED work from district-scale analysis to broader city and country-scale decision support."),
            ("Host", "Chalmers University of Technology as the scientific and technical home of the project."),
            ("Primary responsibility", "Platform development, data integration, simulation orchestration, 3D visualisation and decision-support workflows."),
            ("Documentation rule", "Statements on method, team and provenance should be backed by repository files, source datasets or explicit model credits."),
        ],
    },
    "sections": [
        {
            "title": "Project lineage and purpose",
            "badge": "metadata",
            "body": """
This project sits in the **DT4PED** lineage — a research programme concerned
with digital twins for positive energy districts and decision support for
energy renovation and urban transformation.

The present tool extends that logic from a single district or local case study
into a broader city-scale and cross-country methodology. That change in scope
is central to the design decisions recorded elsewhere in this logbook:

- **City-scale coverage** requires robust ingestion of open building and
  cadastral registers, while keeping the analysis computationally tractable.
- **Multiple countries** require a modular data pipeline rather than one
  Swedish-only implementation.
- **Decision support** means the tool must remain transparent about data gaps,
  fallback assumptions, and model limitations rather than pretending every
  building has perfect metadata.

The project is therefore an engineering and research platform: it combines
inherited models, open data sources, and a custom software workflow to support
retrofit prioritisation and investment decisions.
""",
        },
        {
            "title": "Core project team",
            "badge": "metadata",
            "table": [
                ["Name", "Role", "Contribution"],
                ["Sara Abouebeid", "Lead Developer",
                 "Design and implementation of the platform: data pipelines, analytical workflows, the 3D viewer and the planning wizard. This work turns the research models into an end-to-end decision-support tool."],
                ["Holger Wallbaum", "Project Lead",
                 "Scientific direction and strategic oversight; ensures the project remains grounded in sustainable building practice and the wider built-environment agenda."],
                ["Liane Thuvander", "Project Lead / Methodology",
                 "Methodological leadership and connection between the digital-twin approach and practical retrofit and energy-district decision-making."],
                ["Elena Malakhatka", "Business Development",
                 "Links the platform to stakeholders in municipalities, industry and property development, supporting translation from research into real-world adoption."],
                ["Taz Lodder", "Deployment & Technical Support",
                 "Infrastructure setup, deployment and ongoing technical support for the web-based platform."],
            ],
            "files": ["frontend/src/pages/ProjectTeam.tsx"],
        },
        {
            "title": "Data and method sources used in the tool",
            "badge": "metadata",
            "body": """
The project relies on a mixed evidence base of open registers, research
standards, simulation tools, and local market data. The rationale for each
source is not simply "it exists"; each one is included because it supports a
specific part of the workflow.

| Source / component | Why it is used | Relevance in this project |
|---|---|---|
| **EUBUCCO** | Building geometry and attributes for Sweden | Primary footprint and building-level geometry source for Swedish case studies |
| **OpenStreetMap** | Footprints and address-based joins for the UK | Provides the geometry base and address keys where the UK pipeline uses a different matching strategy |
| **Swedish energideklaration register** | Building energy performance history and labels | Supports EPC matching, benchmarking and data coverage checks |
| **UK EPC open-data service** | Official energy certificates for the UK | Provides certificate-based performance evidence when token access is available |
| **TABULA / EPISCOPE** | Archetype data for dwelling and building typologies | Fills missing building data with period- and typology-based assumptions |
| **DTCC LiDAR** | Vegetation, terrain and roof-form data | Distinguishes context, shading and roof complexity in the digital twin and environmental analysis |
| **Wikells + Boverket** | Cost and carbon references | Supports retrofit cost and embodied-carbon estimation in the decision model |
| **EPW weather files** | Simulation forcing | Needed for EnergyPlus and environmental analyses |
| **Boplats / Booli / Trafikverket / Västtrafik** | Context and market data | Gives the tool a real-world urban and housing-market layer rather than only building physics |

This is also the reason the platform keeps a clear separation between raw data,
processed datasets and methodological assumptions: the same visible logic is not
possible if the provenance of each input is hidden.
""",
        },
        {
            "title": "Adapted and external methods",
            "badge": "metadata",
            "body": """
Some components are not created from scratch in this repository. They are
adapted, integrated, or run as external services, and are credited accordingly.

| Component | Origin | Credit |
|---|---|---|
| **EPSM** | Chalmers-based Energy Performance Simulation Manager | Sanjay Somanath (lead developer), Alexander Hollberg (principal investigator) |
| **Optimisation model** | Adapted from earlier DT4PED work | Jenny Enerbäck and Ann-Brith Strömberg for the optimisation logic; Liane Thuvander as project lead in the research context |
| **3D viewer / web visualisation stack** | Integration of geospatial and web technologies into the project environment | Project-level implementation within this repository and the digital twin workflow |

The simulation workflow is documented in **8. Simulation Process** and the
optimisation logic in **10. Optimisation Process**. Those pages are the
technical counterparts to this attributions page.
""",
            "files": ["frontend/src/pages/AnalysisTools.tsx", "logbook/logbook_content.py"],
        },
        {
            "title": "Acknowledgement and transparency",
            "badge": "metadata",
            "body": """
This page is intentionally written as a traceability page rather than a
marketing page. It separates:

- **contributors** (people directly involved in the project),
- **inherited methods** (models and workflows adapted from prior research),
- **data sources** (registries, survey data, weather inputs and market feeds),
- **known caveats** (where assumptions, missing data or unverified values still
  require caution).

Any future additions to the team or credits list should therefore be backed by
clear evidence: a public profile, institutional role, a project document, or a
known repository reference. This keeps the logbook aligned with the same data
provenance principles used throughout the rest of the project.
""",
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
PAGES = {
    "data_portal":     DATA_PORTAL,
    "script_browser":  SCRIPT_BROWSER,
    "provenance":      PROVENANCE,
    "sweden_pipeline": SWEDEN_PIPELINE,
    "uk_pipeline":     UK_PIPELINE,
    "digital_twin":    DIGITAL_TWIN,
    "shoebox_idf":     SHOEBOX_IDF,
    "simulation":      SIMULATION,
    "prioritisation":  PRIORITISATION,
    "optimisation":    OPTIMISATION,
    "decision":        DECISION_ANALYSIS,
    "facade_ml":       FACADE_ML,
    "climate_env":     CLIMATE_ENV,
    "viewer_layers":   VIEWER_LAYERS,
    "limitations":     LIMITATIONS,
    "project_team":    PROJECT_TEAM,
}
