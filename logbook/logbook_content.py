"""All logbook prose, separated from layout.

>>> THIS IS THE FILE TO EDIT. <<<

Every word shown in the logbook lives here. The page modules under ``pages/``
contain no text at all — they just call ``render_page`` with one of the dicts
below, so you never have to touch Streamlit code to change wording.

The sidebar is grouped by NAV at the bottom of this file. The three topics
where Sweden and the UK differ - data sources, coverage, pipelines - are
single pages with a tab per country (DATA_SOURCES, COVERAGE, PIPELINES).

Schema
------
number   int    page number; must follow NAV order (bottom of file)
title    str    page title
nav_title str?  short sidebar label (defaults to title)
tabs     list?  [(label, content_dict), ...] - one tab per country; each
                content dict has purpose / overview / sections / todo but
                no number of its own
stage    str    one of raw | interim | processed | metadata | method | result
purpose  str    markdown paragraph under the title
overview dict   {title, subtitle, items: [(label, text), ...]}
sections list   [{title, badge?, dataset?, body?, table?, files?}, ...]
todo     str?   rendered as a visible warning — use it, don't invent content

dataset  dict   (Data Sources) describes the DATA, not the code, and replaces the
                repository file table. Required: publisher, access, source_version,
                stored_as, stage, used_in. Optional: link, connection, format,
                source_short, local (paths - "our copy" date is read from disk),
                refresh, copy_short, stage_note, processed_by.
                access: Live API | Downloaded once | Fetched & cached | Scraped |
                        Derived | Synthetic
                stage adds: reference (lookup table of published values) and
                            synthetic (made-up numbers)
                A tab with dataset cards gets an automatic "At a glance" table.
                Unknowns: say "not stated by the publisher"; mark inferences.

``files`` entries are repo-relative paths. They are resolved against the real
repository when the page loads, so a path that no longer exists is flagged in
red rather than silently describing deleted code.

Numbers quoted below were read from the repository and the running app on
2026-08-26. Where a figure is a live count it is labelled as such.
"""

# ─────────────────────────────────────────────────────────────────────────────
# SWEDEN — tab content for DATA_SOURCES / COVERAGE / PIPELINES below
# ─────────────────────────────────────────────────────────────────────────────
SE_DATA = {
    "title": "Sweden · Data Sources",
    "stage": "raw",
    "purpose": """
One card per dataset the Swedish track uses: **who publishes it, the link, how
the tool is connected to it** (live API, a one-off download, a scrape), **how
fresh the publisher's data is and how fresh our copy is, how the tool stores
it, whether it is raw, processed or reference data, and where in the tool it is
used**. Matching quality is on the Sweden tab of **2. Coverage & Quality**;
what is done to the data is on the Sweden tab of **3. Pipelines**.

"Our copy last updated" is read from the files on disk each time this page
loads. Everything else was checked against the repository and the publishers'
sites on 2026-09-14.
""",
    "overview": {
        "title": "How to read the connection types",
        "subtitle": "Only a live API can break the tool at run time.",
        "items": [
            ("Live API", "Called while the tool runs. Always current; fails if the network, a key or the service is down. Usually not stored."),
            ("Downloaded once", "Fetched or bought once and kept on disk. No run-time dependency, but it ages until someone re-downloads it."),
            ("Scraped", "Read off a public web page by our own script, on a schedule."),
            ("Stage", "raw = as the publisher delivered it · processed = changed by our pipeline · reference = a lookup table of published values."),
        ],
    },
    "sections": [
        # ── buildings ──────────────────────────────────────────────────────
        {
            "title": "Building footprints — EUBUCCO",
            "dataset": {
                "publisher": "EUBUCCO — European building stock database (Potsdam Institute for Climate Impact Research and TU Berlin)",
                "link": "https://eubucco.com/",
                "access": "Downloaded once",
                "connection": " Anonymous S3 bucket `s3://eubucco/v0.2/buildings/parquet/nuts_id=<NUTS2>/` at `s3.eubucco.com` — no key. One file per NUTS2 region (Gothenburg is `SE23`, Malmö `SE22`), clipped to the city's bounding box.",
                "format": "GeoParquet",
                "source_version": "Release **v0.2**. EUBUCCO does not state a release date for v0.2 (v0.1 was published on Zenodo on 2022-10-20).",
                "source_short": "v0.2 (date not stated)",
                "local": ["frontend/public/buildings.json", "assets/buildings.json"],
                "refresh": "Rebuilt by hand. **The Gothenburg source extract (`data/eubucco/SE23.parquet`) is no longer on disk**, so the Gothenburg payload cannot be rebuilt until it is downloaded again; only the Malmö extract is present.",
                "stored_as": "A static JSON payload the browser loads directly — **92,973 buildings**. The backend reads `frontend/public/buildings.json` (24 fields, incl. the district); the 3D viewer reads `assets/buildings.json` (23 fields). Not a database.",
                "stage": "processed",
                "stage_note": "The raw parquet is clipped and deduplicated, then joined to certificates, TABULA archetypes and districts before it reaches the tool.",
                "used_in": [
                    "Steps 1–5 — every building the planner can select",
                    "3D viewer — the extruded city model",
                    "Data Explorer",
                    "AI assistant — building lookups",
                ],
                "processed_by": ["tools/se/download_eubucco_city.py", "tools/se/build_city.py", "data_pipeline.py"],
            },
            "body": """
EUBUCCO merges OpenStreetMap, Microsoft Building Footprints and national
registries into one footprint per building, with estimates of height, floors,
construction year and type, and a per-field source tag. In Sweden it supplies
the footprint polygon itself.
""",
        },
        {
            "title": "Energy performance certificates — Boverket energideklarationer",
            "dataset": {
                "publisher": "Boverket (Swedish National Board of Housing, Building and Planning) — the national register of energy declarations",
                "link": "https://www.boverket.se/",
                "access": "Downloaded once",
                "connection": " A bulk extract from Boverket (the `std_uttag` files) loaded into a local DuckDB database. Boverket offers no public bulk download — access is by agreement. `scripts/fetch_epc_db.py` only unpacks or downloads the finished database (`EPC_DB_URL`); **the script that built it from the extract is not in the repository**.",
                "format": "DuckDB, 483 MB — table `epc`, **1,883,795 rows × 262 columns**",
                "source_version": "Boverket's register is updated daily (06:00). **Our extract** holds certificates approved between **2015-07-04 and 2025-06-30**.",
                "source_short": "extract to 2025-06-30",
                "local": ["data/sensitivity/epc_sweden.duckdb"],
                "refresh": "Not refreshed — a one-off extract. A newer one means rebuilding the database and re-running the city build.",
                "stored_as": "A local **database** the backend queries on request (opened read-only). The matched certificate fields are also copied into `buildings.json` at build time.",
                "stage": "raw",
                "stage_note": "Kept as delivered. The link from certificate to building is a processed product and lives in `buildings.json`.",
                "used_in": [
                    "City build — energy class, specific energy and heated area per building",
                    "Step 2 — heating-system column (`/api/epc/heating`)",
                    "Data Explorer — EPC card (`/api/epc/snapshot`)",
                    "Building passport (`/api/epc/passport`)",
                    "AI assistant — questions over the whole register",
                ],
                "processed_by": ["scripts/fetch_epc_db.py", "data_pipeline.py", "backend/main.py"],
            },
            "body": """
Open it **read-only** (`duckdb.connect(path, read_only=True)`) — a writable
handle takes an exclusive lock and blocks the backend.
""",
        },
        {
            "title": "Certificate footprints — Lantmäteriet",
            "dataset": {
                "publisher": "Lantmäteriet (Swedish mapping, cadastral and land registration authority) — building footprints",
                "link": "https://www.lantmateriet.se/",
                "access": "Downloaded once",
                "connection": " Arrived **inside** the same DuckDB file as the certificates — 374,403 footprints, source codes `GOT` and `UDV`. No script in the repository fetches it, and the `LANTMATERIET_USER` / `_PASSWORD` keys in `.env` are **not read by any code**.",
                "format": "Table in `epc_sweden.duckdb`",
                "source_version": "Lantmäteriet updates its building data continuously. **Our copy** holds footprint versions valid from 2011-03-22 to **2025-05-10**.",
                "source_short": "copy to 2025-05-10",
                "local": ["data/sensitivity/epc_sweden.duckdb"],
                "refresh": "Not refreshed.",
                "stored_as": "Database table next to the certificates.",
                "stage": "raw",
                "stage_note": "Gives each certificate a polygon, which is what lets certificates be matched to EUBUCCO buildings by overlap.",
                "used_in": ["City build — the overlap match between certificates and buildings (see **3. Pipelines**)"],
                "processed_by": ["data_pipeline.py"],
            },
        },
        {
            "title": "Archetypes — TABULA / EPISCOPE (Sweden)",
            "dataset": {
                "publisher": "TABULA / EPISCOPE (EU Intelligent Energy Europe projects) — Swedish residential building typology",
                "link": "https://webtool.building-typology.eu/",
                "access": "Scraped",
                "connection": " Scraped once from the TABULA WebTool on **2026-02-03**.",
                "format": "JSON — 10 Swedish archetypes",
                "source_version": "Swedish typology matrix dated 2011-12-20, brochure 2012-02-10. The typology is no longer updated.",
                "source_short": "2011-12 (frozen)",
                "local": [
                    "data/sensitivity/FW_ Map selection in notebook/tabula_swedish_data.json",
                    "data/sensitivity/FW_ Map selection in notebook/tabula_webtool_scraped.json",
                ],
                "refresh": "No refresh needed — the source is frozen.",
                "stored_as": "JSON lookup table. The matched archetype is written into each building in `buildings.json`.",
                "stage": "reference",
                "stage_note": "Published U-values per construction period and building type, used wherever a building has no measured data.",
                "used_in": [
                    "City build — **18,251** Gothenburg buildings (single- and multi-family, built up to 2005) get archetype U-values",
                    "Step 2 — archetype columns",
                    "Step 3 — envelope U-values in the generated EnergyPlus model",
                    "Step 4 — the optimiser's baseline U-values",
                ],
                "processed_by": ["utils/tabula_matching.py"],
            },
        },
        # ── cost, carbon, materials ────────────────────────────────────────
        {
            "title": "Construction costs — Wikells Sektionsfakta",
            "dataset": {
                "publisher": "Wikells Byggberäkningar AB — *Sektionsfakta* cost catalogue",
                "link": "https://www.wikells.se/",
                "access": "Downloaded once",
                "connection": " Cost line items copied from the Sektionsfakta catalogue (a paid product, not an API) into a JSON file and a frontend table.",
                "format": "JSON (95 items) + TypeScript table `wikellsData.ts` (262 codes)",
                "source_version": "Wikells revises prices every spring and autumn. Our figures are documented as **Sektionsfakta 2024**.",
                "source_short": "Sektionsfakta 2024",
                "local": ["data/wikells_catalogue.json", "frontend/src/config/wikellsData.ts"],
                "refresh": "Updated by hand; not linked to Wikells' price revisions.",
                "stored_as": "Static files bundled with the app — no database.",
                "stage": "reference",
                "used_in": [
                    "Step 4 — cost of each renovation measure, and the optimiser",
                    "Step 5 — cost figures in the report",
                    "Data Explorer",
                ],
                "processed_by": ["frontend/src/config/wikellsCarbonMapping.ts"],
            },
        },
        {
            "title": "Material service life & insulation thickness",
            "dataset": {
                "publisher": "Published references, each value tagged with its source: BBSR *Nutzungsdauern von Bauteilen* (German federal service-life table), RICS/BCIS *Life Expectancy of Building Components*, ISO 15686-1, the Paroc thickness guide, EWI Store trade guidance, and Wikells",
                "link": "https://www.nachhaltigesbauen.de/austausch/nutzungsdauern-von-bauteilen/",
                "access": "Downloaded once",
                "connection": " Values typed by hand into a TypeScript table. Every entry carries a `sourceId` pointing at its reference in the file's `SOURCES` list.",
                "format": "TypeScript (`materialProperties.ts`)",
                "source_version": "BBSR table dated 24.02.2017 (a 2025 re-survey raised external insulation systems from 40 to at least 50 years; the file still uses 40); RICS/BCIS 2018; ISO 15686-1:2011.",
                "source_short": "BBSR 2017 · RICS 2018",
                "local": ["frontend/src/config/materialProperties.ts"],
                "refresh": "Updated by hand.",
                "stored_as": "Static table compiled into the frontend.",
                "stage": "reference",
                "used_in": [
                    "Step 4 — the renovation calculator reads insulation thickness from each Wikells assembly (`parseAssemblyParts`)",
                    "The service-life table (`SERVICE_LIFE`, `enrichWikellsItem`) is defined but **not imported anywhere** — no screen uses the service lives yet",
                ],
            },
        },
        {
            "title": "Embodied carbon — Boverket klimatdatabas",
            "dataset": {
                "publisher": "Boverket — Klimatdatabas (national climate database for building materials)",
                "link": "https://api.boverket.se/klimatdatabas/api/Klimat/v2",
                "access": "Live API",
                "connection": " REST API, no key. Asks for the latest version (falls back to `02.07.000`) and keeps the answer in backend memory until the backend restarts.",
                "format": "JSON",
                "source_version": "Version **02.07.000**, in force since 2026-01-21. Boverket revises it about once a year.",
                "source_short": "v02.07.000 (2026-01-21)",
                "copy_short": "live (memory)",
                "refresh": "Fetched on first use after each backend start.",
                "stored_as": "Not stored — held in backend memory only.",
                "stage": "reference",
                "used_in": ["Step 4 — embodied carbon of renovation measures (Wikells items are mapped to Boverket resources)"],
                "processed_by": ["utils/boverket_api.py", "frontend/src/config/wikellsCarbonMapping.ts"],
            },
        },
        # ── environment ────────────────────────────────────────────────────
        {
            "title": "Airborne LiDAR — DTCC (Chalmers)",
            "dataset": {
                "publisher": "Digital Twin Cities Centre (DTCC), Chalmers — serving airborne laser-scan tiles",
                "link": "http://compute.dtcc.chalmers.se:8000",
                "access": "Downloaded once",
                "connection": " `POST /get_lidar` on the DTCC compute server, no key. Tiles are saved locally in SWEREF99 TM (EPSG:3006).",
                "format": "72 `.laz` point-cloud tiles, 6.57 GB",
                "source_version": "Not stated by DTCC. The tile name prefixes `19B002` (32 tiles) and `20B008` (40 tiles) suggest scans from 2019 and 2020 — **our inference, not stated by the publisher**.",
                "source_short": "not stated (likely 2019–20)",
                "local": ["data/dtcc"],
                "refresh": "Downloaded once; not refreshed.",
                "stored_as": "Raw tiles on disk. Three layers are computed from them into static files: `dtcc_vegetation.json` (826,039 trees, 31,849 shrubs), `roofs_gothenburg.json` (41,895 roofs) and `terrain_hillshade.png`.",
                "stage": "raw",
                "stage_note": "The tiles are raw; the three viewer layers are processed products.",
                "used_in": ["3D viewer only — trees and shrubs, roof shapes, terrain shading. **Gothenburg only.**"],
                "processed_by": [
                    "tools/se/dtcc_vegetation.py",
                    "tools/se/dtcc_roofs.py",
                    "tools/se/dtcc_terrain_water.py",
                    "tools/se/filter_vegetation_water.py",
                ],
            },
        },
        {
            "title": "Weather — EPW (Gothenburg)",
            "dataset": {
                "publisher": "Climate.OneBuilding.Org — TMYx typical weather years built from weather-station records",
                "link": "https://climate.onebuilding.org/",
                "access": "Downloaded once",
                "format": "EnergyPlus Weather (EPW) — one typical year, hourly",
                "source_version": "File in use: `SWE_VG_Gothenburg-Landvetter.AP.025260_TMYx.2011-2025.epw` (a typical year built from 2011–2025 records). Climate.OneBuilding last updated its TMYx files in March 2026.",
                "source_short": "TMYx 2011–2025",
                "local": ["data/epw/SWE_VG_Gothenburg-Landvetter.AP.025260_TMYx.2011-2025.epw"],
                "refresh": "Replaced by hand. The future-climate files in `data/epw/` (2050 and 2080 scenarios) and the older TMYx files are on disk but **not used**.",
                "stored_as": "A file on disk, read by the simulation service and the analyses.",
                "stage": "raw",
                "used_in": [
                    "Steps 3–4 — EnergyPlus simulation through EPSM",
                    "3D viewer — building energy simulation",
                    "Incident-radiation and thermal-comfort analyses (the sun-hours analysis does **not** use it)",
                ],
            },
        },
        {
            "title": "Solar potential — PVGIS",
            "dataset": {
                "publisher": "European Commission, Joint Research Centre — PVGIS",
                "link": "https://re.jrc.ec.europa.eu/pvg_tools/en/",
                "access": "Live API",
                "connection": " The backend forwards the request to `re.jrc.ec.europa.eu/api/v5_2/PVcalc` — no key.",
                "format": "JSON",
                "source_version": "The tool calls **PVGIS 5.2**. The current release is **5.3** (2024-09-25); 5.2 is still served.",
                "source_short": "calls 5.2 (5.3 current)",
                "copy_short": "live",
                "refresh": "Live. A result is written to `data/pvgis_database.json` only when a user presses save in the viewer — none has been saved yet.",
                "stored_as": "Not stored, unless saved by the user (JSON file).",
                "stage": "raw",
                "stage_note": "The output of the Commission's own PV model, used as returned.",
                "used_in": ["3D viewer only — rooftop PV yield for the selected building"],
                "processed_by": ["backend/main.py", "viewer/js/pvgis.js"],
            },
        },
        # ── context & mobility ─────────────────────────────────────────────
        {
            "title": "Statistics — SCB",
            "dataset": {
                "publisher": "Statistics Sweden (SCB)",
                "link": "https://www.scb.se/",
                "access": "Live API",
                "connection": " Table `TAB6684` over SCB's statistics API (`api.scb.se/OV0104/v2beta/api/v2/…`) and map layers over SCB's WFS (`geodata.scb.se/geoserver/stat/wfs`) — no key.",
                "format": "JSON / GeoJSON",
                "source_version": "Household income for **2024** on **DeSO 2025** areas (published early 2025). The WFS serves SCB's current layers.",
                "source_short": "income 2024 · DeSO 2025",
                "copy_short": "live",
                "refresh": "Fetched each time a layer is switched on.",
                "stored_as": "Not stored.",
                "stage": "raw",
                "used_in": ["3D viewer only — income and demographic overlays by DeSO area"],
                "processed_by": ["backend/main.py", "viewer/js/scb_layers.js"],
            },
        },
        {
            "title": "Roads & green areas — OpenStreetMap",
            "dataset": {
                "publisher": "OpenStreetMap contributors, queried through the Overpass API",
                "link": "https://www.openstreetmap.org/",
                "access": "Live API",
                "connection": " The backend tries `overpass-api.de`, then `overpass.kumi.systems`, then `maps.mail.ru` — the main host rate-limits hard. No key.",
                "format": "JSON (Overpass)",
                "source_version": "Edited continuously; no versions. A query returns the map as it is at that moment.",
                "source_short": "continuous",
                "local": ["assets/gothenburg_greenspaces.json"],
                "refresh": "Roads are fetched live. Green areas were fetched once into `gothenburg_greenspaces.json` (22,851 areas).",
                "stored_as": "Roads not stored; green areas as a static JSON file.",
                "stage": "raw",
                "used_in": [
                    "3D viewer — road centrelines, street network and green areas",
                    "Space-syntax analysis is written but **not loaded** in the viewer",
                ],
                "processed_by": ["backend/main.py"],
            },
        },
        {
            "title": "District boundaries — Göteborg primärområden",
            "dataset": {
                "publisher": "Göteborgs Stad — primärområden (the city's 96 statistical districts)",
                "access": "Downloaded once",
                "connection": " Downloaded from Göteborgs Stad's public ArcGIS map service. **The exact service URL is not recorded in the repository.**",
                "format": "GeoJSON — 96 districts",
                "source_version": "The district division in force since 2025-01-01.",
                "source_short": "division of 2025-01-01",
                "local": ["data/districts/gbg_primaromraden.geojson"],
                "refresh": "Not refreshed. The tagging must be re-run after every Swedish city build, or the district field empties.",
                "stored_as": "GeoJSON file. Each building's district is written into `buildings.json` — **75,719** buildings tagged.",
                "stage": "reference",
                "used_in": [
                    "Step 1 — neighbourhood picker and boundary",
                    "Step 5 — the report",
                    "AI assistant — district questions",
                ],
                "processed_by": ["tools/se/ingest_districts.py"],
            },
        },
        {
            "title": "Public transport — Västtrafik",
            "dataset": {
                "publisher": "Västtrafik (public transport authority, Västra Götaland)",
                "link": "https://developer.vasttrafik.se/",
                "access": "Live API",
                "connection": " OAuth2 with `VASTTRAFIK_CLIENT_ID` / `_SECRET` from `.env`. The backend calls `ext-api.vasttrafik.se` — journey planner `pr/v4`, traffic situations `ts/v1`, parking `spp/v3` and `geo/v3`.",
                "format": "JSON",
                "source_version": "Live — journey-planner API v4.",
                "source_short": "live (API v4)",
                "copy_short": "live",
                "refresh": "Every request goes to Västtrafik.",
                "stored_as": "Not stored.",
                "stage": "raw",
                "used_in": ["3D viewer — stops, departures, vehicle positions, disruptions and parking", "Data Explorer"],
                "processed_by": ["backend/main.py"],
            },
        },
        {
            "title": "Roads & traffic — Trafikverket",
            "dataset": {
                "publisher": "Trafikverket (Swedish Transport Administration) — Trafikinfo API",
                "link": "https://api.trafikinfo.trafikverket.se/",
                "access": "Live API",
                "connection": " `api.trafikinfo.trafikverket.se/v2/data.json` with `TRAFIKVERKET_API_KEY` from `.env`. Answers are cached for 60 s in the backend.",
                "format": "JSON",
                "source_version": "Live — API v2.",
                "source_short": "live (API v2)",
                "local": ["trafikverket.db", "frontend/public/trafikverket_data.json"],
                "refresh": "Live for the viewer. A one-off snapshot also sits in `trafikverket.db` and `trafikverket_data.json`.",
                "stored_as": "Live answers not stored; the snapshot is SQLite plus a JSON export.",
                "stage": "raw",
                "used_in": ["3D viewer — traffic cameras and road conditions", "Data Explorer"],
                "processed_by": ["backend/main.py", "trafikverket_scraper.py"],
            },
        },
        # ── market ─────────────────────────────────────────────────────────
        {
            "title": "Rental listings — Boplats",
            "dataset": {
                "publisher": "Boplats Göteborg — the region's rental-housing queue",
                "link": "https://www.boplats.se/sok?types=1hand&area=508A8CB406FE001F00030A60",
                "access": "Scraped",
                "connection": " `requests` + BeautifulSoup over the public search page. Runs daily at 03:00 as the Windows task `PPG-Boplats-Daily-Refresh`. Full method on **4. Scraped Market Data**.",
                "format": "HTML → SQLite → JSON",
                "source_version": "Live listings — Boplats adds and removes flats continuously.",
                "source_short": "live listings",
                "local": ["boplats_apartments.db", "frontend/public/boplats_data.json"],
                "refresh": "Daily at 03:00. 1,253 listings in the database on 2026-09-14.",
                "stored_as": "**Database** — SQLite (`boplats_apartments.db`), accumulated run by run; exported to `boplats_data.json` for the frontend.",
                "stage": "raw",
                "used_in": [
                    "Data Explorer — rental market",
                    "Landing page — listings pill",
                    "Steps 1–2 — rent columns",
                    "AI assistant — rental questions",
                    "The 3D viewer's market overlay (`market.js`) is written but **not loaded**",
                ],
                "processed_by": ["boplats_scraper.py", "tools/refresh_boplats.ps1"],
            },
        },
        {
            "title": "Sale listings — Booli",
            "dataset": {
                "publisher": "Booli — property sale listings",
                "link": "https://www.booli.se/",
                "access": "Scraped",
                "connection": " Reads the `__NEXT_DATA__` JSON embedded in each search page — no paid API. Full method on **4. Scraped Market Data**.",
                "format": "HTML → SQLite → JSON",
                "source_version": "Live listings.",
                "source_short": "live listings",
                "local": ["booli_listings.db", "frontend/public/booli_data.json"],
                "refresh": "**One run so far**, on 2026-07-30 (243 listings). No scheduled refresh is installed yet.",
                "stored_as": "**Database** — SQLite (`booli_listings.db`), exported to `booli_data.json`.",
                "stage": "raw",
                "used_in": [
                    "Data Explorer — sale market",
                    "Landing page",
                    "AI assistant — sale-price questions",
                ],
                "processed_by": ["booli_scraper.py", "tools/refresh_booli.ps1"],
            },
        },
        {
            "title": "Electricity price — elprisetjustnu.se",
            "dataset": {
                "publisher": "elprisetjustnu.se — a free feed of Swedish day-ahead spot prices. The prices come from **ENTSO-E** (the tool's own labels say Nord Pool, which is inaccurate).",
                "link": "https://www.elprisetjustnu.se/",
                "access": "Live API",
                "connection": " `elprisetjustnu.se/api/v1/prices/{YYYY}/{MM}-{DD}_{zone}.json`, no key. Zone SE3 (Gothenburg) by default; 0.8 SEK/kWh is used if the feed is down.",
                "format": "JSON",
                "source_version": "Daily; the next day's prices appear from about 13:00.",
                "source_short": "daily",
                "copy_short": "live",
                "refresh": "Fetched when needed.",
                "stored_as": "Not stored.",
                "stage": "raw",
                "used_in": [
                    "Step 4 — the optimiser's reference energy price (Sweden only)",
                    "Step 4 — decision analysis under price scenarios (display only)",
                    "The heating-system comparison uses fixed tariffs, **not** this feed",
                ],
                "processed_by": ["backend/main.py"],
            },
        },
        {
            "title": "Address search — Nominatim",
            "dataset": {
                "publisher": "OpenStreetMap Foundation — Nominatim geocoder",
                "link": "https://nominatim.openstreetmap.org/",
                "access": "Live API",
                "connection": " Called directly from the browser (Step 1 map), the viewer's search box and the backend (`/api/geocode`, reverse lookups) — **not cached**. Separately, certificate addresses were geocoded once at build time into `data/epc_geocode_cache.json`.",
                "format": "JSON",
                "source_version": "Live OpenStreetMap data. The usage policy allows at most 1 request per second.",
                "source_short": "live",
                "local": ["data/epc_geocode_cache.json"],
                "refresh": "Run-time lookups are not stored. The certificate cache was built once — 12,202 addresses, 47 unresolved.",
                "stored_as": "Run time: not stored. Build time: a JSON cache.",
                "stage": "raw",
                "used_in": [
                    "Step 1 — address autocomplete and CSV address upload",
                    "3D viewer — place search",
                    "City build — locating certificates that match no footprint",
                ],
                "processed_by": ["tools/se/geocode_epc.py", "frontend/src/components/LocationMap.tsx", "backend/main.py"],
            },
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
SE_COVERAGE = {
    "title": "Sweden · Coverage & Quality",
    "stage": "metadata",
    "code_refs": "inline",
    "purpose": """
What exactly the Swedish model knows about its buildings, how many buildings
that is, what is missing and why, what the tool falls back on, and what could
be improved. Every figure was counted from the payload the tool serves
(`frontend/public/buildings.json`) on 2026-09-14. Read this before quoting a
Swedish number outside the project.
""",
    "overview": {
        "title": "In four lines",
        "subtitle": "Gothenburg — 92,973 buildings.",
        "items": [
            ("Area", "A rectangle over central Gothenburg (11.85–12.10 °E, 57.62–57.80 °N) — not the whole municipality, and it takes in edges of neighbouring municipalities."),
            ("Energy data", "26,263 buildings (28%) have a real energy class and energy use — but they make up 57% of the built footprint area, because large buildings are the ones that are declared."),
            ("Use type", "85,670 buildings (92%) know their use; 28,397 of those are outbuildings such as garages and sheds."),
            ("Malmö", "A Malmö model (49,601 buildings) exists but carries no energy data at all, and nothing in the tool loads it."),
        ],
    },
    "sections": [
        {
            "title": "What is covered — field by field",
            "body": """
| What the tool knows | Buildings | Share | Comes from | When it is missing |
|---|---|---|---|---|
| Footprint and height | 92,973 | 100% | EUBUCCO | height = floors × 3.2 m, else 3.2 m (1,276 buildings, 1.4%) |
| Use type (andamål) | 85,670 | 92.1% | Lantmäteriet footprint, matched by overlap | shown as "Other / unknown" |
| Address or property designation | 74,322 | 79.9% | certificate address, else the property's fastighetsbeteckning | blank |
| **Energy class and energy use (kWh/m²·yr)** | **26,263** | **28.2%** | energideklaration | **none — shown as no data** |
| Heated floor area (Atemp) | 26,263 | 28.2% | energideklaration | none |
| Construction year | 26,257 | 28.2% | energideklaration only | none — so no archetype either |
| Number of floors | 19,814 | 21.3% | energideklaration | the height still comes from EUBUCCO |
| TABULA U-values (wall, roof, window) | 18,251 | 19.6% | TABULA, by year and house type | none for non-residential, post-2005 or unknown-year buildings |
| District (primärområde) | 75,719 | 81.4% | Göteborgs Stad districts | the other 17,254 lie outside Göteborg's 96 districts |

**"Matched" is not the same as "has energy data".** 85,670 buildings matched a
Lantmäteriet footprint, but 59,407 of those footprints carry no energy
declaration — the match gives them a use type and often an address, nothing
more. Earlier versions of this logbook quoted the 92% as certificate coverage;
the energy coverage is 28%.

**Energy classes present:** A 241 · B 2,075 · C 4,292 · D 6,565 · E 8,033 ·
F 3,317 · G 1,740.
""",
            "files": ["frontend/public/buildings.json"],
        },
        {
            "title": "What is missing — and why",
            "body": """
**66,710 buildings have no energy figure.** By footprint size:

| Footprint | Buildings without energy data | All buildings of that size |
|---|---|---|
| under 30 m² (sheds, garages, kiosks) | 23,249 | 24,947 |
| 30–100 m² | 19,153 | 23,540 |
| 100–500 m² | 21,567 | 35,441 |
| 500 m² and over | 2,741 | 9,045 |

Measured by area instead of by count, **57.4% of the 24.2 km² of footprint
has energy data** — the large buildings are well covered, the small ones are
not.

Why buildings end up without data:

1. **They were never declared.** Energy declarations are only required in
   certain situations (new builds, sales, rentals, larger public buildings),
   so many small houses and every unheated outbuilding have none.
2. **The declaration has expired out of the extract.** The extract only holds
   declarations approved from 2015-07-04 — declarations are valid for ten
   years, so it most likely contains only the currently valid ones (**our
   reading, not stated in the data**).
3. **The declaration never reached a footprint.** A declaration only reaches a
   building through a Lantmäteriet footprint. About 38% of Gothenburg's
   declared properties have none that carries it (blank or unmatched
   property id, or only a garage), and the geocoding rescue step recovers only
   part of those — see **3. Pipelines**.
4. **The footprints disagree.** EUBUCCO and Lantmäteriet draw buildings
   differently; a building whose outline overlaps the declared footprint by
   less than 5% and lies more than 20 m from it is left without data rather
   than given a neighbour's certificate.

**Districts:** all 17,254 untagged buildings lie outside the 96 district
polygons — they are in neighbouring municipalities (Mölndal, Partille …)
that the rectangle takes in. 5,709 of them nevertheless have energy data,
because certificate matching is not limited to Göteborg municipality.
""",
            "files": ["data_pipeline.py", "tools/se/ingest_districts.py"],
        },
        {
            "title": "Fallbacks — what the tool uses when data is missing",
            "body": """
| Missing | Fallback | Buildings affected |
|---|---|---|
| Declaration not on the building's own footprint | the property's shared declaration (the one covering the most addresses), copied to the property's other **heated** buildings — never to outbuildings | part of the 26,263 |
| Declaration on no footprint at all | located by the property's footprint centroid or a geocoded address, then given to the nearest building **without data** within 40 m | part of the 26,263 |
| Building overlaps no footprint | nearest footprint within 20 m of the building outline | part of the 85,670 |
| Height | floors × 3.2 m, then a flat 3.2 m; anything over 100 m is capped | 1,276 at 3.2 m; 4 capped |
| U-values | TABULA archetype for the building's period and house type (single- or multi-family) | 18,251 |
| Use type | "Other / unknown" | 7,945 |
| Energy class / energy use | **none** — the tool does not invent a Swedish energy figure | 66,710 |

The fallbacks are deliberately one-sided: a certificate may be moved to a
building that has none, but never onto a building that already has its own,
and one certificate is never spread across neighbours.
""",
            "files": ["data_pipeline.py"],
        },
        {
            "title": "Vintage — how old the data is",
            "body": """
Read from the database itself (`epc_sweden.duckdb`, approval date `Godkänd`):

| Extract | Rows | Declarations | Approved from | Approved to |
|---|---|---|---|---|
| Whole of Sweden | 1,883,795 | — | 2015-07-04 | 2025-06-30 |
| Göteborg (kommun 1480) | 90,956 | 25,842 | 2015-07-06 | 2025-06-30 |

So every Swedish certificate in the tool is **between about 1 and 11 years
old**, and nothing approved after 30 June 2025 is included. A building
renovated since its declaration still shows the pre-renovation figures.

The Lantmäteriet footprints in the same file run to 2025-05-10; the building
geometry is EUBUCCO v0.2. Per-dataset dates are on **1. Data Sources**
(Sweden tab).
""",
        },
        {
            "title": "Limitations",
            "body": """
- **Not the whole municipality.** The model is a rectangle; the district
  polygons reach well beyond it (11.58–12.24 °E, 57.50–57.87 °N), so outer
  parts of Göteborg are not in the model, and neighbouring municipalities are.
- **Neighbouring buildings can share one certificate.** Where a property's
  declaration is copied to its other heated buildings, they show identical
  figures — these are not independent measurements, and the payload does not
  mark which ones are copies.
- **Construction year comes only from the certificate**, so 72% of buildings
  have no age — and therefore no archetype.
- **TABULA covers only single- and multi-family houses built up to 2005** (10
  archetypes). Offices, schools, shops and post-2005 buildings get no U-values.
- **Heights are EUBUCCO estimates**, not measurements. LiDAR roof heights exist
  for 41,895 buildings but are only used for drawing roofs in the viewer.
- **Multi-part buildings keep only their largest part**, and outlines are
  simplified by up to about 5 m.
- **Malmö has no energy data** — most likely because the Lantmäteriet
  footprints in the database cover the Gothenburg area only (source codes
  `GOT`, `UDV`), so Malmö buildings have nothing to match against.
- **Cannot be rebuilt today** — the Gothenburg EUBUCCO source file is no longer
  on disk.
""",
        },
        {
            "title": "What could be improved",
            "body": """
| Idea | What it would fix | Effort |
|---|---|---|
| Ask Boverket for a fresh extract, and keep the script that builds the database in the repository | certificates after June 2025; a reproducible database | low |
| Clip to the municipality boundary (the district polygons) instead of a rectangle | outer Göteborg missing, neighbours included | low |
| Mark copied (property-level) certificates in the payload | shared figures mistaken for independent measurements | low |
| Fill construction year and floors from EUBUCCO where the certificate has none (check how complete EUBUCCO's Swedish fields are first) | 72% without age, so more buildings get an archetype | medium |
| Use the LiDAR eave and ridge heights in the energy model | modelled heights for 41,895 buildings | medium |
| Add a non-residential and post-2005 archetype source, e.g. Boverket's BETSI building-stock survey | no U-values for offices, schools, new buildings | medium |
| Get Lantmäteriet footprints for Malmö (the account keys already exist in `.env`, unused) | Malmö has no energy data | medium |
| A clearly labelled statistical estimate for undeclared houses, like the UK's survey fallback | 66,710 buildings with no energy figure | high |
""",
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
# UNITED KINGDOM — tab content for DATA_SOURCES / COVERAGE / PIPELINES below
# ─────────────────────────────────────────────────────────────────────────────
UK_DATA = {
    "title": "UK · Data Sources",
    "stage": "raw",
    "purpose": """
One card per dataset the UK track uses — publisher, link, how the tool is
connected to it, how fresh the data is, how it is stored, its stage and where
it is used. The UK shares almost nothing with Sweden: a different geometry
source, a different certificate register, and a survey-based fallback where no
certificate matches. Matching quality is on the United Kingdom tab of
**2. Coverage & Quality**; the method is on the United Kingdom tab of
**3. Pipelines**.

"Our copy last updated" is read from the files on disk each time this page
loads. Everything else was checked against the repository and the publishers'
sites on 2026-09-14.
""",
    "overview": {
        "title": "What is built",
        "subtitle": "Five districts, each a static payload in frontend/public/uk/.",
        "items": [
            ("London", "King's Cross (3,018 buildings), Westminster (1,590), Canary Wharf (1,283), Southwark (1,829)."),
            ("Rotherham", "The whole town — 14,483 buildings."),
            ("Not built", "Birmingham and Nottingham are configured but have no payload."),
            ("Fetched & cached", "The two UK web sources (OpenStreetMap and the EPC service) are called by the pipeline, not by the running tool; their answers are cached on disk."),
        ],
    },
    "sections": [
        {
            "title": "Building footprints — OpenStreetMap",
            "dataset": {
                "publisher": "OpenStreetMap contributors, queried through the Overpass API",
                "link": "https://www.openstreetmap.org/",
                "access": "Fetched & cached",
                "connection": " The UK pipeline queries `overpass-api.de` only (no fallback host) and caches the answer per district in `data/uk_raw/osm_<district>_v2.json`; later runs reuse the cache. No key.",
                "format": "JSON (Overpass)",
                "source_version": "Edited continuously; no versions. **Our extracts:** London 2026-07-16, Rotherham 2026-08-03.",
                "source_short": "London 07-16 · Rotherham 08-03",
                "local": [
                    "data/uk_raw/osm_london_kings_cross_v2.json",
                    "data/uk_raw/osm_london_westminster_v2.json",
                    "data/uk_raw/osm_london_canary_wharf_v2.json",
                    "data/uk_raw/osm_london_southwark_v2.json",
                    "data/uk_raw/osm_rotherham_v2.json",
                ],
                "refresh": "Only when the pipeline is re-run for a district with its cache deleted.",
                "stored_as": "Processed into one static JSON payload per district, `frontend/public/uk/buildings_<district>.json`. Not a database.",
                "stage": "raw",
                "stage_note": "OSM is used because it carries the `ref:GB:uprn` address tag, which makes an address-based certificate join possible.",
                "used_in": ["3D viewer — UK districts", "Steps 1–4 for UK buildings"],
                "processed_by": ["tools/uk/uk_data_pipeline.py", "tools/uk/cities.py"],
            },
        },
        {
            "title": "Energy performance certificates — UK EPC service",
            "dataset": {
                "publisher": "Ministry of Housing, Communities & Local Government — *Get energy performance data* (Beta)",
                "link": "https://get-energy-performance-data.communities.gov.uk/",
                "access": "Fetched & cached",
                "connection": " `api.get-energy-performance-data.communities.gov.uk` — `/api/domestic/search` and `/api/certificate`, with a bearer token (`UK_EPC_API_TOKEN`, from a GOV.UK One Login account). Called by the pipeline at build time; every answer is cached on disk. The running tool never calls it.",
                "format": "JSON",
                "source_version": "The API is updated daily (bulk CSV monthly). It replaced `epc.opendatacommunities.org`, retired on 30 May 2026. In March 2026 the publisher removed the `LMK_KEY` field, which `ingest_epc.py` still reads — **the next uncached run may fail; not yet tested**.",
                "source_short": "daily (cache 14 Jul–3 Aug 2026)",
                "local": ["data/uk_raw/epc_cache", "data/uk_raw/epc_detail_cache"],
                "refresh": "3,303 cached searches and 45,570 cached certificates, fetched 14 Jul – 3 Aug 2026.",
                "stored_as": "A file cache on disk (one JSON per request). Matched certificates are copied into the district payloads.",
                "stage": "raw",
                "used_in": ["3D viewer — energy class of UK buildings", "Steps 1–4 — energy performance of UK buildings"],
                "processed_by": ["tools/uk/ingest_epc.py", "tools/uk/sample_epc_matches.py"],
            },
            "body": """
Without a token the pipeline still completes, but every building falls back to
English Housing Survey averages — a plausible-looking but survey-derived result.
`gov.uk/find-energy-certificate` is a per-property lookup page, not a bulk
source, and is deliberately not scraped.
""",
        },
        {
            "title": "Building attributes — EUBUCCO (UK)",
            "dataset": {
                "publisher": "EUBUCCO — European building stock database (Potsdam Institute for Climate Impact Research and TU Berlin)",
                "link": "https://eubucco.com/",
                "access": "Downloaded once",
                "connection": " Anonymous S3 at `s3.eubucco.com/eubucco/v0.2/buildings/parquet/nuts_id=<NUTS2>/` — no key. Downloaded per NUTS2 region: `UKI3`, `UKI4` (London), `UKG3`, `UKF1`, `UKE3`.",
                "format": "GeoParquet",
                "source_version": "Release **v0.2** — no release date stated by EUBUCCO.",
                "source_short": "v0.2 (date not stated)",
                "local": [
                    "data/eubucco/UKI3.parquet",
                    "data/eubucco/UKI4.parquet",
                    "data/eubucco/UKG3.parquet",
                    "data/eubucco/UKF1.parquet",
                    "data/eubucco/UKE3.parquet",
                ],
                "refresh": "Downloaded once, 13–15 Jul 2026.",
                "stored_as": "Parquet files on disk; the attributes are copied into the district payloads.",
                "stage": "raw",
                "stage_note": "Used **only for attributes** — height, floors, construction year, type. The footprints come from OpenStreetMap.",
                "used_in": ["UK pipeline — building height, floors, age and type"],
                "processed_by": ["tools/uk/ingest_eubucco.py"],
            },
        },
        {
            "title": "English Housing Survey 2024-25",
            "dataset": {
                "publisher": "Ministry of Housing, Communities & Local Government — English Housing Survey, headline findings annex tables",
                "link": "https://www.gov.uk/government/statistics/annex-tables-for-english-housing-survey-2024-to-2025-headline-findings-on-housing-quality-and-energy-efficiency",
                "access": "Downloaded once",
                "connection": " The two annex spreadsheets (Chapter 1 housing quality, Chapter 2 energy efficiency) downloaded from gov.uk.",
                "format": "OpenDocument spreadsheets (`.ods`) → JSON",
                "source_version": "Published 29 January 2026. The survey is annual.",
                "source_short": "2024-25 (pub. 2026-01-29)",
                "local": [
                    "data/uk_raw/ehs_2024_25_ch1_housing_quality.ods",
                    "data/uk_raw/ehs_2024_25_ch2_energy_efficiency.ods",
                ],
                "refresh": "Replace when the 2025-26 tables are published.",
                "stored_as": "Parsed into three JSON files in `frontend/public/uk/`: `ehs_2024_25.json` (all tables), `epc_band_priors.json` (band distribution by dwelling age and type) and `retrofit_cost_band_c.json` (cost to reach band C).",
                "stage": "reference",
                "stage_note": "Survey statistics used as priors — never a measurement of a particular building.",
                "used_in": [
                    "UK pipeline — band priors for every building without a matched certificate",
                    "UK Data Explorer",
                ],
                "processed_by": ["tools/uk/ingest_ehs.py"],
            },
        },
        {
            "title": "Archetypes — TABULA England",
            "dataset": {
                "publisher": "TABULA / EPISCOPE — *Building Typology Brochure: England* (BRE)",
                "link": "https://episcope.eu/building-typology/country/gb/",
                "access": "Downloaded once",
                "connection": " The brochure PDF (`GB_TABULA_TypologyBrochure_BRE.pdf`) parsed by script rather than typed by hand, so every U-value traces back to a page.",
                "format": "PDF → JSON (27 archetypes)",
                "source_version": "Brochure dated 23.09.2014. The typology is no longer updated.",
                "source_short": "2014-09 (frozen)",
                "local": ["frontend/public/uk/tabula_gb.json"],
                "refresh": "No refresh needed — the source is frozen.",
                "stored_as": "Static JSON the frontend loads.",
                "stage": "reference",
                "used_in": [
                    "Step 4 — the optimiser's baseline U-values for UK buildings",
                    "The backend endpoint `/api/uk/tabula` also serves it, but nothing calls it",
                ],
                "processed_by": ["tools/uk/ingest_tabula.py", "frontend/src/utils/ukArchetype.ts"],
            },
        },
        {
            "title": "Address points — OS Open UPRN (Rotherham)",
            "dataset": {
                "publisher": "Ordnance Survey — OS Open UPRN",
                "link": "https://www.ordnancesurvey.co.uk/products/os-open-uprn",
                "access": "Downloaded once",
                "connection": " The national file downloaded as a zip, then cut down to Rotherham.",
                "format": "Zipped CSV → JSON",
                "source_version": "Ordnance Survey publishes a new release every six weeks. **Our copy:** release `osopenuprn_202606`.",
                "source_short": "release 2026-06",
                "local": ["data/os/openuprn_gb.zip", "data/os/uprn_rotherham.json", "data/os/rotherham_epc_certs.json"],
                "refresh": "Not refreshed.",
                "stored_as": "Files on disk; the result is baked into `buildings_rotherham.json`.",
                "stage": "raw",
                "stage_note": "Used to pin certificates to OSM buildings across the whole of Rotherham, raising coverage to 54% of 14,483 buildings.",
                "used_in": ["Rotherham payload only — certificate coverage"],
            },
            "body": """
> **Not reproducible yet.** The scripts that did this calibration are **not
> in the repository** (they lived in a temporary working folder). The accuracy
> quoted for it — 91% exact energy class, 100% within one band, against a
> ground-truth calibration spreadsheet — was measured then, but the spreadsheet
> is not in the repository either, so it cannot be re-checked. Treat the
> Rotherham figures as a result that cannot be re-run until the scripts are
> recovered.
""",
        },
        {
            "title": "Weather — EPW (London & Rotherham)",
            "dataset": {
                "publisher": "Climate.OneBuilding.Org — TMYx typical weather years built from weather-station records",
                "link": "https://climate.onebuilding.org/",
                "access": "Downloaded once",
                "format": "EnergyPlus Weather (EPW) — one typical year, hourly",
                "source_version": "London: `GBR_ENG_London.City.AP.037683_TMYx.2011-2025.epw`. Rotherham: the Doncaster-Sheffield file, whose header says **2011–2022** although its name says 2011–2025. Climate.OneBuilding last updated its TMYx files in March 2026.",
                "source_short": "TMYx 2011–2025",
                "local": [
                    "data/epw/GBR_ENG_London.City.AP.037683_TMYx.2011-2025.epw",
                    "data/epw/GBR_ENG_Doncaster.Sheffield-Hood.AP.034054_TMYx.2011-2025.epw",
                ],
                "refresh": "Replaced by hand.",
                "stored_as": "Files on disk, read by the simulation service.",
                "stage": "raw",
                "used_in": ["Steps 3–4 — EnergyPlus simulation of UK buildings through EPSM"],
            },
        },
        {
            "title": "Electricity price — Octopus Agile",
            "dataset": {
                "publisher": "Octopus Energy — public tariff API (Agile half-hourly rates)",
                "link": "https://octopus.energy/agile/",
                "access": "Live API",
                "connection": " `api.octopus.energy/v1/products/AGILE-24-04-03/…`, region C (London), no key, not cached. £0.23/kWh is used if the feed is down.",
                "format": "JSON",
                "source_version": "Half-hourly prices, published daily. The product the tool asks for, `AGILE-24-04-03`, is **no longer on sale** (the current one is `AGILE-24-10-01`); it still returns prices.",
                "source_short": "daily (old product code)",
                "copy_short": "live",
                "refresh": "Fetched each time the panel opens.",
                "stored_as": "Not stored.",
                "stage": "raw",
                "used_in": [
                    "UK Data Explorer — the optimisation assumptions panel",
                    "Step 4 does **not** use a live price for UK buildings",
                ],
                "processed_by": ["backend/main.py"],
            },
        },
        {
            "title": "Solar potential & address search — PVGIS, Nominatim",
            "dataset": {
                "publisher": "European Commission JRC (PVGIS) and the OpenStreetMap Foundation (Nominatim) — the same services as on the Sweden tab",
                "link": "https://re.jrc.ec.europa.eu/pvg_tools/en/",
                "access": "Live API",
                "connection": " PVGIS through the backend (`/api/v5_2/PVcalc`); Nominatim directly from the browser. No keys, no cache.",
                "format": "JSON",
                "source_version": "Live. PVGIS is called at version 5.2 (5.3 is current); Nominatim allows 1 request per second.",
                "source_short": "live",
                "copy_short": "live",
                "stored_as": "Not stored.",
                "stage": "raw",
                "used_in": ["Step 1 — UK address search", "3D viewer — rooftop PV yield and place search"],
                "processed_by": ["backend/main.py", "frontend/src/components/LocationMap.tsx"],
            },
        },
        {
            "title": "Cost & carbon — synthetic placeholders",
            "dataset": {
                "publisher": "None — made-up round numbers written for this project",
                "access": "Synthetic",
                "connection": " Hard-coded in `ukPlaceholderCostCarbon.ts`. No real UK cost and carbon source has been adopted yet.",
                "format": "TypeScript constants",
                "source_version": "Not applicable. Standard refurbishment **£180/m², 45 kgCO₂e/m²**; ambitious refurbishment **£320/m², 75 kgCO₂e/m²**.",
                "source_short": "n/a — invented",
                "local": ["frontend/src/config/ukPlaceholderCostCarbon.ts"],
                "refresh": "To be replaced by a real UK cost and carbon source.",
                "stored_as": "Constants compiled into the frontend.",
                "stage": "synthetic",
                "stage_note": "Exists only so the UK track runs end to end. Must never be presented as real — see **17. Known Limitations**.",
                "used_in": [
                    "Step 4 — cost and carbon of UK renovation packages",
                    "They also reach the Step 5 report, where they are **labelled SEK** — a known bug",
                ],
            },
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
UK_COVERAGE = {
    "title": "UK · Coverage & Quality",
    "stage": "metadata",
    "code_refs": "inline",
    "purpose": """
What exactly the UK model knows about its buildings, how many buildings that
is, what is missing and why, what the tool falls back on, and what could be
improved. Every figure was counted from the payloads the tool serves
(`frontend/public/uk/buildings_<district>.json`) on 2026-09-14. UK coverage is
not comparable with Sweden's: the join is by address, and residential
buildings without a certificate get a survey-based estimate.
""",
    "overview": {
        "title": "In four lines",
        "subtitle": "Five districts — 22,203 buildings.",
        "items": [
            ("Area", "Four 900 m circles in central London (7,720 buildings) and a 4 km circle over Rotherham (14,483). Birmingham and Nottingham are not built."),
            ("Real certificate", "8,895 buildings (40%) — 1,071 in London (14%), 7,824 in Rotherham (54%)."),
            ("Survey estimate", "7,494 homes (34%) carry an energy band drawn from the English Housing Survey, not a measurement."),
            ("No band at all", "5,814 buildings (26%) — every one of them non-residential or of unknown type."),
        ],
    },
    "sections": [
        {
            "title": "How each district is covered",
            "body": """
| District | Circle | Buildings | Real certificate | Survey estimate | No band |
|---|---|---|---|---|---|
| London — King's Cross | 900 m | 3,018 | 319 (10.6%) | 1,499 (49.7%) | 1,200 (39.8%) |
| London — Westminster | 900 m | 1,590 | 177 (11.1%) | 533 (33.5%) | 880 (55.3%) |
| London — Canary Wharf | 900 m | 1,283 | 455 (35.5%) | 436 (34.0%) | 392 (30.6%) |
| London — Southwark | 900 m | 1,829 | 120 (6.6%) | 612 (33.5%) | 1,097 (60.0%) |
| Rotherham | 4 km | 14,483 | 7,824 (54.0%) | 4,414 (30.5%) | 2,245 (15.5%) |
| **Total** | | **22,203** | **8,895 (40.1%)** | **7,494 (33.8%)** | **5,814 (26.2%)** |

**On the map all three look alike.** A survey-estimate building is coloured by
a band just like a certified one. **Most London buildings are estimated or
blank, not measured.**

Canary Wharf is highest in London because it is dominated by newer residential
towers, where every flat has a certificate. Rotherham is high because its
certificates were pinned to buildings through OS Open UPRN — but the script
that did that is not in the repository (see **1. Data Sources**, United
Kingdom tab), and the Rotherham figures in `cities.json` are older than the
payload.
""",
            "files": ["frontend/public/uk/cities.json"],
        },
        {
            "title": "What is covered — field by field",
            "body": """
| What the tool knows | Comes from | London (7,720) | Rotherham (14,483) | When it is missing |
|---|---|---|---|---|
| Footprint | OpenStreetMap | 100% | 100% | — |
| Height and floors | OSM tags, else EUBUCCO | floors 89.6% | floors 99.3% | levels × 3 m, else a default by use (3–12 m) |
| EUBUCCO match (height, type) | nearest EUBUCCO building within 25 m | 6,100 (79.0%) | 14,381 (99.3%) | OSM tags only |
| Energy band (real or estimated) | certificate, else survey | 4,151 (53.8%) | 12,238 (84.5%) | no band |
| SAP score, energy use, floor area | certificate only | 1,071 (13.9%) | 7,824 SAP / 575 energy use and area | none |
| Construction year | OSM `start_date`, EUBUCCO, certificate age band | **109 (1.4%)** | 7,588 (52.4%) | an era drawn from the survey, used for U-values only |
| TABULA U-values | TABULA England | 3,963 (51.3%) | 12,112 (83.6%) — 556 from a real year | none for non-residential buildings |
| Heating system description | full certificate (`--epc-details` runs only) | 823 (10.7%) | 394 (2.7%) | none |
| Address | OSM tags, else the certificate | 4,683 (60.7%) | 2,240 (15.5%) | blank |
| Postcode | OSM tags or address points | 3,360 (43.5%) | 1,371 (9.5%) | cannot be joined by postcode |
| UPRN | OSM `ref:GB:uprn` | 1,059 (13.7%) | 3,083 (21.3%) | cannot be joined by UPRN |
| Main fuel | — | 0% | 0% | the field exists but is never filled |

A block of flats is one building on the map but holds many certificates: in
London **15,815 certificates** are aggregated onto 1,071 buildings (modal band,
mean SAP) — 11,744 of them onto 455 Canary Wharf buildings alone.
""",
            "files": ["tools/uk/uk_data_pipeline.py"],
        },
        {
            "title": "What is missing — and why",
            "body": """
1. **Non-residential buildings never get a band.** The pipeline only queries
   the *domestic* certificate register, and the survey fallback describes
   homes only — so offices, shops, schools, garages and buildings of unknown
   type without a certificate stay blank. That is the whole "No band" column:
   5,814 buildings.
2. **Many buildings carry no usable address.** The join needs a UPRN or a
   postcode plus house number. In London only 43.5% of buildings have a
   postcode and 13.7% a UPRN — even after borrowing addresses from OSM address
   points inside each footprint.
3. **Generic OSM tags.** Most London buildings are tagged only
   `building=yes` (King's Cross 1,438, Southwark 949, Westminster 910), so
   their type comes from EUBUCCO or not at all.
4. **Construction year is almost unknown in London** (1.4%), because OSM rarely
   carries it and EUBUCCO's UK construction year is under 1% populated.
5. **Heating detail needs a second, slower run** (`--epc-details`), which has
   only been done for part of the certificates.
""",
            "files": ["tools/uk/uk_data_pipeline.py", "tools/uk/ingest_epc.py"],
        },
        {
            "title": "Fallbacks — what the tool uses when data is missing",
            "body": """
| Missing | Fallback | Buildings affected |
|---|---|---|
| Certificate, **residential** building | English Housing Survey band distribution — by age band if the year is known, else by dwelling type, else by region — and **one band drawn from it**, the same every rebuild | 7,494 |
| Certificate, non-residential building | **none** — no band | 5,814 |
| Construction year (for U-values only) | an era drawn from the survey's dwelling-age distribution; the displayed year stays empty | 15,489 |
| Height | OSM height tag → EUBUCCO estimate → levels × 3 m → a default by use (3–12 m) | — |
| Building type | EUBUCCO subtype replaces a generic `building=yes` | — |
| Cost and carbon | synthetic placeholders — see **1. Data Sources** | all UK buildings |

**Why one band is drawn instead of the distribution:** it keeps the record in
the same shape as a certified building, so the viewer and wizard need no UK
special case. The price is that a single estimated building's band means
little; only averages over many buildings are meaningful.
""",
            "files": ["tools/uk/uk_data_pipeline.py", "tools/uk/ingest_ehs.py"],
        },
        {
            "title": "Vintage — how old the data is",
            "body": """
The certificate cache holds **60,786 certificate records**, registered between
**2011-04-18 and 2026-07-29** (median November 2019). 17,395 of them (29%)
were registered in 2011–2015, so they are more than ten years old — past a UK
certificate's ten-year validity.

**Older, replaced certificates are not filtered out.** The join keeps every
certificate found for an address, so where a flat has been re-certified its
old and new certificates both count towards the building's band.

OSM geometry: London extracts 2026-07-16, Rotherham 2026-08-03. Survey: English
Housing Survey 2024-25.
""",
            "files": ["tools/uk/ingest_epc.py"],
        },
        {
            "title": "Limitations",
            "body": """
- **Estimated bands look like real ones** on the map and in the wizard.
- **Only homes are certified in the model** — non-domestic certificates are not
  fetched.
- **U-values rest on a guessed era** for almost every London building.
- **Superseded certificates count** alongside current ones.
- **Circles, not administrative areas** — a 900 m radius around a point cuts
  through blocks and streets.
- **Rotherham cannot be reproduced** (calibration script missing), and its
  heating and floor-area detail is sparse (2.7% and 4.0%).
- **Cost and carbon are synthetic** — any UK cost or carbon figure is a
  placeholder.
""",
        },
        {
            "title": "What could be improved",
            "body": """
| Idea | What it would fix | Effort |
|---|---|---|
| Keep only the newest certificate per dwelling (by UPRN or address) | superseded certificates skewing a building's band | low |
| Mark estimated buildings visually, or show the band distribution instead of one drawn band | estimates mistaken for measurements | low |
| Re-run with `--epc-details` for all certificates | heating system known for only 3–11% | low |
| Refresh `cities.json` from the payloads | stale Rotherham statistics | low |
| Recover the Rotherham OS Open UPRN script and apply the same method to London | London certificate coverage of 7–36%; Rotherham not reproducible | medium |
| Fetch non-domestic certificates too (the service also publishes them — check the API) | 5,814 non-residential buildings with no band | medium |
| Use the certificate's construction-age band more widely, and other age sources | 1.4% known year in London | medium |
| Build Birmingham and Nottingham (already configured) | two focus cities missing | medium |
| A real UK cost and carbon source | synthetic placeholders | high |
""",
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
# SHARED REFERENCE
# ─────────────────────────────────────────────────────────────────────────────
ACCESS = {
    "number": 15,
    "title": "Services, Keys & Access",
    "nav_title": "Services, keys & access",
    "stage": "metadata",
    "purpose": """
The infrastructure every page relies on, whichever country: the services the
backend talks to, the AI providers, the map tiles, and where the keys live.
Country-specific sources and keys are on **1. Data Sources**, which has a
tab per country.
""",
    "sections": [
        {
            "title": "Internal services",
            "badge": "metadata",
            "body": """
Services the backend proxies to — ours, not third parties:

| Service | Configured by | Port |
|---|---|---|
| EPSM (EnergyPlus) | `EPSM_BASE_URL` | 8010 |
| Façade defect ML | `FACADE_ML_URL` / `FACADE_MODEL_URL` | 8020 |

EPSM runs in Docker. When energy simulations fail, check that Docker Desktop is
running before anything else — that has been the cause every time so far.
""",
            "files": ["docker-compose.epsm.yml", "tools/ml/facade_detect_service.py"],
        },
        {
            "title": "AI providers",
            "badge": "metadata",
            "body": """
| Provider | Endpoint | Key |
|---|---|---|
| Anthropic | `api.anthropic.com/v1/messages` | **`ANTHROPIC_API_KEY`** |
| OpenAI | `api.openai.com/v1/chat/completions` | **`OPENAI_API_KEY`** |

What each one is used for is on **11. AI, ML & Vision Models**.
""",
        },
        {
            "title": "Map tiles in the 3D viewer",
            "badge": "metadata",
            "body": """
| Layer | Source | Key |
|---|---|---|
| Light / Dark basemaps | CARTO (`basemaps.cartocdn.com`) | **`CARTO_API`** in `.env`, handed to the viewer by `/api/viewer-config` |
| Fallback basemaps | Esri Canvas (`server.arcgisonline.com`) | none |
| Photorealistic 3D | Google tiles via Cesium ion | ion token, currently inside `viewer/js/cesium.js` |

Without a key, CARTO still answers but stamps **"API KEY REQUIRED"** across every
tile. The viewer and the landing-page background therefore use CARTO only when
`/api/viewer-config` supplies a key, and fall back to Esri otherwise.
""",
            "files": ["backend/main.py", "viewer/js/cesium.js", "frontend/public/city_bg.html"],
        },
        {
            "title": "Secrets",
            "badge": "metadata",
            "body": """
Every key lives in the gitignored `.env` at the repository root, and
`.env.example` lists their names: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
`UK_EPC_API_TOKEN`, `LANTMATERIET_USER` / `_PASSWORD`, `VASTTRAFIK_CLIENT_ID` /
`_SECRET`, `TRAFIKVERKET_API_KEY` and `CARTO_API`.

The two Lantmäteriet keys are listed but **not read by any code** — the
Lantmäteriet footprints arrived inside the certificate database (see
**1. Data Sources**, Sweden tab).

Never commit one; print names or lengths only when checking they exist.
""",
            "files": [".env.example", "backend/config.py"],
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
SCRIPT_BROWSER = {
    "number": 16,
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
SWEDEN_PIPELINE = {
    "title": "Sweden Pipeline",
    "stage": "interim",
    "code_refs": "inline",
    "purpose": """
How the Swedish registers become the building model the viewer and the wizard
read — step by step: what is loaded, how it is cleaned, how certificates are
matched to buildings by overlap, what happens when they do not match, and what
is written out. The UK chain is completely different and is on the **United
Kingdom** tab. What the result covers is on **2. Coverage & Quality**.
""",
    "overview": {
        "title": "The pipeline in order",
        "subtitle": "EUBUCCO footprints in, one record per building out.",
        "items": [
            ("Load and crop", "EUBUCCO buildings for the region, cut to a rectangle over central Gothenburg."),
            ("Prepare certificates", "Declarations linked to Lantmäteriet footprints, plus a shared declaration per property."),
            ("Match by overlap", "Each building takes the footprint that covers most of it."),
            ("Rescue the unmatched", "Declarations with no footprint are placed by property or address."),
            ("Classify and add archetypes", "Use type from the declaration; TABULA U-values by year and house type."),
            ("Clean up and write", "Heights, areas, simplified outlines; then districts are tagged."),
        ],
    },
    "sections": [
        {
            "title": "Step 1 — Load and crop the buildings",
            "body": """
1. Read the EUBUCCO file for the region (`SE23` for Gothenburg — parquet,
   or a GeoPackage if that is what is on disk).
2. Reproject to WGS84 (EPSG:4326).
3. Keep only buildings inside the city's rectangle — for Gothenburg
   11.85–12.10 °E, 57.62–57.80 °N — which leaves **92,973 buildings**.

The rectangle, the EUBUCCO file and the list of region municipalities for each
city live in one registry, so a new city is a configuration entry, not new
code.
""",
            "files": ["data_pipeline.py", "tools/se/se_cities.py"],
        },
        {
            "title": "Step 2 — Prepare the certificates",
            "body": """
Done in one SQL query against the certificate database
(`epc_sweden.duckdb`, opened read-only):

1. **Link declarations to footprints.** Lantmäteriet stores the declaration's
   id (`FormularId`) on the footprint it belongs to. Each declaration is reduced
   to one row: energy use, energy class, heated area (Atemp), construction
   year, floors, and *all* of its entrance addresses.
2. **Build a shared declaration per property.** One declaration often covers a
   whole property — several buildings and entrances — but Lantmäteriet links
   it to only one footprint. For each property (`fastighetsbeteckning`) in the
   region's 14 municipalities, the declaration covering the most addresses is
   chosen and given to the property's other **heated** footprints that have no
   declaration of their own. Outbuildings (`Komplement…`) never receive it.
3. **Pick the display address.** The entrance whose house number matches the
   footprint's, else the declaration's first address, else the property's.
4. Keep only footprints within 200 m of the city rectangle.
""",
            "files": ["data_pipeline.py", "data/sensitivity/epc_sweden.duckdb"],
        },
        {
            "title": "Step 3 — Match certificates to buildings by overlap",
            "body": """
EUBUCCO has no property id and no address, so the only possible link to a
declared footprint is geometric. Both layers are projected to SWEREF 99 TM
(EPSG:3006) so areas and distances are in metres.

1. **Intersect** every EUBUCCO building with every Lantmäteriet footprint.
2. **Best footprint:** each building takes the footprint with the largest
   shared area.
3. **Accept** it if that shared area is at least **5%** of the building
   (`OVERLAP_MIN`) — this still catches outlines that are merely offset.
4. **Proximity fallback:** a building that overlaps nothing takes the nearest
   footprint whose centroid lies within **20 m** of the building's *outline*
   (not its centroid — a centroid test missed small footprints on the edge of
   large buildings).
5. **Never spread one certificate across neighbours.** When several buildings
   claim the same declared footprint, every building overlapping it by at
   least **30%** (`OVERLAP_STRONG`) keeps it — a genuine split, where OSM draws
   one building in parts. Weaker and fallback claimants are dropped. If no
   claimant reaches 30%, only the single best-overlapping building keeps it.

This replaced a nearest-centroid method, which in dense blocks gave buildings
their *neighbour's* certificate: measured, about **1,800 buildings** received a
certificate for a footprint their outline never touches.
""",
            "files": ["data_pipeline.py"],
        },
        {
            "title": "Step 4 — Rescue certificates that never reached a footprint",
            "body": """
About 38% of Gothenburg's declared properties never land on a footprint in
Step 3 (a blank or unmatched property id, or only a garage). Their buildings
would stay blank despite having a real certificate, so:

1. Take every Göteborg declaration that is not linked to any footprint.
2. **Locate it** by the centroid of its property's footprints, where the
   property has any; otherwise by its address, geocoded once through Nominatim
   and cached (`data/epc_geocode_cache.json`, 12,202 addresses) so rebuilds
   are reproducible and do not call the service again.
3. **Attach it** to the nearest building that still has **no** energy data,
   within **40 m**. Matching is one-to-one both ways: each building keeps only
   its nearest declaration, and each declaration lands on only one building.

A rescued declaration never overwrites a building matched in Step 3.
""",
            "files": ["data_pipeline.py", "tools/se/geocode_epc.py"],
        },
        {
            "title": "Step 5 — Classify use and add archetypes",
            "body": """
**Use type.** The footprint's purpose (`andamål`) is mapped by keyword to seven
categories — single-family, multi-family, commercial, industrial, public,
outbuilding, other — with å/ä/ö folded so spelling variants match.

**TABULA archetype.**

1. Construction year → period: up to 1960, 1961–75, 1976–85, 1986–95,
   1996–2005, after 2005.
2. Use type → house type: single-family (SFH) or multi-family (MFH). Anything
   else gets no archetype.
3. Look up (house type, period) among the 10 Swedish archetypes → U-values for
   wall, roof and window, construction descriptions and the reference heat
   demand. After-2005 buildings get none — TABULA's Swedish typology stops at
   2005.

**Performance within its period.** Each building's energy use is ranked
against other buildings of the same period, between the 2nd and 98th
percentile, giving a 0–1 score the viewer uses for "best and worst of its era".
""",
            "files": ["data_pipeline.py", "utils/tabula_matching.py"],
        },
        {
            "title": "Step 6 — Clean up geometry and heights, write the payload",
            "body": """
1. **Footprint area** in m², computed in SWEREF 99 TM.
2. **Simplify outlines** (tolerance 0.00005°, about 3–5 m) keeping topology,
   and keep only the largest part of a multi-part building.
3. **Height:** EUBUCCO's height; if missing or zero, floors × 3.2 m; if still
   missing, 3.2 m. Anything over 100 m is capped.
4. **Addresses** are cleaned of flat, garage and parking suffixes
   (`LGH`, `GAR`, `P-PLATS`…); a building with no address shows its property
   designation instead.
5. Write one record per building to `buildings.json`, plus summary cards
   (best and worst per period, class and use) and a separate layer of the
   declared footprints themselves.
""",
            "files": ["data_pipeline.py", "tools/se/build_city.py"],
        },
        {
            "title": "Step 7 — Tag districts (and the trap)",
            "body": """
Each building's centroid is tested against the 96 primärområde polygons
(point-in-polygon, spatial index); the building gets the district's name, or
nothing if it falls outside all of them — **75,719 of 92,973** are tagged.

> **Rebuilding wipes these tags.** Step 6 regenerates `buildings.json` from
> scratch, so district tagging must be re-run immediately afterwards:
>
> ```bash
> python build.py && python tools/se/ingest_districts.py
> ```
>
> Skip it and the district field empties, which silently breaks the
> neighbourhood picker and the AI assistant's district questions.
""",
            "files": ["tools/se/ingest_districts.py", "data/districts/gbg_primaromraden.geojson"],
        },
        {
            "title": "LiDAR layers — vegetation, roofs, terrain",
            "body": """
Three passes over the 72 DTCC laser tiles (SWEREF 99 TM) produce viewer
layers. Gothenburg only.

**Vegetation.** The tiles are not classified for vegetation, so it is
separated by rule: an unclassified point with **two or more laser returns**
(the beam passed through foliage) at **0.5–45 m** above ground. Candidates
inside a building footprint are dropped (roof edges and antennas also give
two returns). Trees are the local maxima of a 1 m canopy-height model
(position, height, crown); shrubs are low vegetation of 0.5–2.5 m on a coarser
grid.

**Water mask and terrain.** Water points (class 9) form a mask that removes
"trees in the river"; ground points (class 2) form a terrain model, rendered as
a shaded-relief image for the viewer's terrain basemap.

**Roofs.** For each building, the laser points inside its footprint give the
eave height (30th percentile of roof heights) and the ridge height (92nd); the
ridge direction is the footprint's long axis. Roofs rising less than 1.5 m are
treated as flat. Result: 41,895 pitched roofs.
""",
            "files": [
                "tools/se/dtcc_vegetation.py",
                "tools/se/dtcc_terrain_water.py",
                "tools/se/dtcc_roofs.py",
            ],
        },
        {
            "title": "Adding another Swedish city",
            "body": """
Register the city (rectangle, EUBUCCO file, municipalities) in the city
registry, then:

```bash
python tools/se/download_eubucco_city.py <slug>
python tools/se/build_city.py <slug>
```

Malmö was built this way (49,601 buildings), but has **no energy data** — most
likely because the Lantmäteriet footprints that Steps 2–4 depend on are only
in the database for the Gothenburg area. See **2. Coverage & Quality**.
""",
            "files": ["tools/se/se_cities.py", "tools/se/download_eubucco_city.py", "tools/se/build_city.py"],
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
UK_PIPELINE = {
    "title": "UK Pipeline",
    "stage": "interim",
    "code_refs": "inline",
    "purpose": """
How the UK building model is built — step by step. It shares almost nothing
with the Swedish chain: **OpenStreetMap** geometry instead of EUBUCCO, an
**address-based** certificate join instead of an overlap match, and a
**survey-based estimate** where no certificate matches. What it does share is
the output: every UK record has exactly the shape of a Gothenburg record, so
the same viewer and wizard draw both with no UK special case. What the result
covers is on **2. Coverage & Quality**.
""",
    "overview": {
        "title": "The pipeline in order",
        "subtitle": "Run per district: four in London, one in Rotherham.",
        "items": [
            ("Buildings and address points", "OpenStreetMap footprints and address nodes in a circle around the district centre."),
            ("Candidate addresses", "Each building's own address plus the address points inside it."),
            ("Fetch certificates", "Every postcode found is looked up in the national certificate register."),
            ("Join by address", "UPRN, or postcode plus building number; a block's certificates are combined."),
            ("Enrich and add archetypes", "EUBUCCO height and type; TABULA U-values."),
            ("Estimate the rest", "Homes without a certificate get a band from the English Housing Survey."),
        ],
    },
    "sections": [
        {
            "title": "Step 1 — Fetch buildings and address points",
            "body": """
1. One Overpass query per district: every building (ways and multipolygon
   relations) **and every node carrying a house number**, within a circle
   around the district centre — 900 m for the London districts, 4 km for
   Rotherham, 1,200 m configured for Birmingham and Nottingham.
2. The answer is cached (`data/uk_raw/osm_<district>_v2.json`); a rebuild
   reuses it unless `--refresh` is given. Busy answers (429/504) are retried
   three times with a growing wait.
3. Each building's outline is its outer ring — for a multipolygon, the longest
   outer ring.

The address nodes matter: in dense areas most building polygons carry no
address at all; the address sits on a separate point inside the building.
""",
            "files": ["tools/uk/uk_data_pipeline.py", "tools/uk/cities.py"],
        },
        {
            "title": "Step 2 — Collect candidate addresses per building",
            "body": """
1. Start with the building's own tags (`addr:housenumber`, `addr:postcode`,
   `ref:GB:uprn`).
2. Add every address node that lies **inside the footprint or within about
   2.5 m of its edge** (spatial index, so this is fast) — close enough to catch
   points drawn on the wall, not so wide that it reaches the neighbour.
3. **Normalise.** Postcodes are upper-cased and re-spaced (`ng1  5fs` →
   `NG1 5FS`); OSM's multi-value tags are split on `;`. House numbers keep the
   first number (`10-14` → `10`).
""",
            "files": ["tools/uk/uk_data_pipeline.py", "tools/uk/ingest_epc.py"],
        },
        {
            "title": "Step 3 — Fetch the certificates",
            "body": """
1. Collect every distinct postcode from buildings **and** address nodes — many
   postcodes appear only on address nodes.
2. Look each one up in the national register (`/api/domestic/search`, bearer
   token `UK_EPC_API_TOKEN`); each answer is cached on disk per postcode.
3. Optionally (`--epc-details`) fetch each certificate in full for floor area,
   property type, heating system and energy use — one extra request per
   certificate, so it is slow and has only been run for part of them.
4. **Find the building number in the certificate's address**, stripping flat
   prefixes: `Flat 6, 123 Poplar High Street` → building **123**, not flat 6.

Without a token the lookups are skipped and the run still finishes — on survey
estimates alone, which look complete.
""",
            "files": ["tools/uk/ingest_epc.py"],
        },
        {
            "title": "Step 4 — Join certificates to buildings by address",
            "body": """
For every candidate address of a building:

1. **UPRN** — the certificate's property reference against OSM's
   `ref:GB:uprn`. Unambiguous where present.
2. **Postcode + building number** — the normalised pair from Step 2 against
   the pair parsed from the certificate in Step 3.

All certificates reached this way are collected and de-duplicated by
certificate number. A block of flats holds many certificates but is one
building on the map, so they are **combined**:

| Building value | From its certificates |
|---|---|
| Energy band | the most common band |
| SAP score, energy use | the mean |
| Floor area | the sum |
| Heating system, fuel, property type | the most common value |
| Heat pump, solar PV, mains gas | the majority yes/no |
| Construction year | OSM `start_date`, else EUBUCCO, else the mean of the certificates' age bands (letter codes decoded to mid-years, e.g. `D` 1950–66 → 1958) |
| Display name | the building's own OSM address, else the most common certificate address with the flat number removed |

No date filter is applied: an older certificate that a newer one has replaced
still counts.
""",
            "files": ["tools/uk/uk_data_pipeline.py", "tools/uk/ingest_epc.py"],
        },
        {
            "title": "Step 5 — Enrich with EUBUCCO and add a TABULA archetype",
            "body": """
**EUBUCCO** is used for attributes only, never for the outline. Each OSM
building takes the nearest EUBUCCO building centroid within **25 m**.

- **Height:** OSM `height` / `building:height` → EUBUCCO height → levels × 3 m
  → a default by use (houses 6 m, flats 12 m, commercial 9 m, industrial 8 m,
  outbuildings 3 m).
- **Floors:** OSM `building:levels` → EUBUCCO floors.
- **Type:** a generic OSM `building=yes` is replaced by EUBUCCO's subtype; a
  specific OSM tag (house, apartments, office …) always wins.

**TABULA archetype** (27 England archetypes):

1. House type from EUBUCCO's subtype — terraced and semi-detached → *Terraced
   house*, detached → *Single Family House*, apartment → *Multi Family House*;
   without a subtype, houses default to terraced (the most common English
   dwelling) and flats to multi-family.
2. Period from the real construction year. **Where there is none**, homes get
   an era drawn from the survey's dwelling-age distribution, weighted by stock
   size — used only for the lookup; the displayed year stays empty.
3. Look up (type, period) → U-values for wall, roof, window and door, and the
   archetype's energy use. Non-residential buildings get none.
""",
            "files": ["tools/uk/uk_data_pipeline.py", "tools/uk/ingest_eubucco.py", "tools/uk/ingest_tabula.py"],
        },
        {
            "title": "Step 6 — Estimate a band where no certificate matched",
            "body": """
Only for **residential** buildings. The prior comes from the English Housing
Survey 2024-25, most specific first:

1. by **age band**, if the building's year is known;
2. else by **dwelling type** (from the OSM tag: detached, semi-detached,
   terraced, bungalow, flat);
3. else the **region's** band distribution (London, Yorkshire and the Humber …).

One band is then **drawn** from that distribution. The draw uses a hash of the
building's OSM id, so the same building gets the same band on every rebuild.
The record is marked `epc_source = ehs_prior_age / _type / _region`, so
estimated and certified buildings can be told apart in the data.

Non-residential buildings without a certificate get **no band**.
""",
            "files": ["tools/uk/uk_data_pipeline.py", "tools/uk/ingest_ehs.py"],
        },
        {
            "title": "Step 7 — Write the payload",
            "body": """
One record per building to `frontend/public/uk/buildings_<district>.json`, in
the Gothenburg schema plus UK fields (SAP, postcode, UPRN, certificate count,
heating details, `epc_source`). Per-district statistics go to `cities.json`.

```bash
python tools/uk/uk_data_pipeline.py                        # all districts
python tools/uk/uk_data_pipeline.py --city london_kings_cross
python tools/uk/uk_data_pipeline.py --refresh              # ignore the OSM cache
python tools/uk/uk_data_pipeline.py --epc-details          # full certificates
```

**Rotherham** went one step further: its certificates were pinned to buildings
city-wide through OS Open UPRN, raising certificate coverage from about 4%
(575 buildings) to 54% (7,735 records marked `EPC register (OS UPRN
city-wide)`). The method: postcodes around the buildings → all their
certificates → each certificate's UPRN → its coordinates in OS Open UPRN →
the nearest EUBUCCO building within 30 m. **The scripts for that step are not
in the repository** — they lived in a temporary working folder — so it cannot
be re-run.
""",
            "files": ["tools/uk/uk_data_pipeline.py"],
        },
        {
            "title": "Checking a district before trusting it",
            "body": """
`sample_epc_matches.py` prints a handful of building-to-certificate matches per
district and writes a JSON sample. Run it after any pipeline change — it is the
practical way to see whether the address join lands on the right buildings.
""",
            "files": ["tools/uk/sample_epc_matches.py"],
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
DIGITAL_TWIN = {
    "number": 5,
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
    "number": 6,
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
    "number": 7,
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
**17. Known Limitations**.
""",
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
PRIORITISATION = {
    "number": 8,
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
    "number": 9,
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
    "number": 10,
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
    "number": 11,
    "title": "AI, ML & Vision Models",
    "stage": "method",
    "purpose": """
The three learned components in the tool: a **trained object detector** for
façade defects, a **vision model** estimating window-to-wall ratio from a
photograph, and a **tool-calling assistant** that answers questions against the
project's own datasets.

All three are optional. Each degrades to something explicit — a heuristic, a
disabled button, or a refusal — rather than to a fabricated number.
""",
    "overview": {
        "title": "Three components, three different risk profiles",
        "subtitle": "Two hosted APIs and one local model, all fenced off from the core.",
        "items": [
            ("Defect detector", "Local, trained, deterministic. Own torch process on :8020."),
            ("WWR vision", "Hosted LLM. Claude first, then GPT-4.1, then a heuristic."),
            ("Data assistant", "Hosted LLM with 11 tools over real datasets — it queries, it does not recall."),
            ("Fenced off", "None of them can change a simulation result; they produce inputs a user can see and override."),
        ],
    },
    "sections": [
        {
            "title": "Façade defect detection — the trained model",
            "badge": "method",
            "body": """
**Where it runs.** A standalone FastAPI service on the **host**, port `8020`
(`FACADE_ML_PORT`), inside its own torch environment. The app's backend proxies
to it via `/api/facade-detect`.

**Why a separate process.** Keeping torch out of the API server means the
backend starts in seconds, carries no CUDA dependency, and runs at all on a
machine where the model cannot. The trade-off is one more thing to start —
`tools/ml/run_facade_service.ps1`.

**The model.** A checkpoint from a separate ML project, loaded from
`outputs/mbdd2025_pretrained/best.pt` (overridable via `FACADE_MODEL`), built by
`facade_ml.models.detection.build_detection_model(num_classes=…, fpn_v2=…)` — an
**FPN-based object detector**. The checkpoint records a **best score of 0.77**.
Loaded with `map_location="cpu"`.

**Five defect classes**, from `facade_ml.data.voc.VOC_CLASSES`:

| Class | Severity weight in scoring |
|---|---|
| `crack` | 1.00 |
| `bulge` | 1.00 |
| `corrosion` | 0.75 |
| `abscission` | 0.75 |
| `leakage` | 0.60 |

**Where the output goes.** Detected defect load drives the **F** criterion in
the prioritisation score (**8. Retrofit Prioritisation**) through a saturating
curve, so uploading a photograph changes the ranking. Structural defects (crack,
bulge) are weighted above surface ones deliberately.

**An important scoring rule:** until a building has been inspected, F is marked
unavailable and **left out of the composite entirely**, with the other criteria
re-weighted. An un-inspected building is not assumed to be in good condition —
nor in bad.

Uploads are available in both the 3D viewer and Step 2 of the wizard.
""",
            "files": [
                "tools/ml/facade_detect_service.py",
                "tools/ml/run_facade_service.ps1",
                "frontend/src/components/FacadeDefectPanel.tsx",
                "frontend/src/utils/retrofitPriority.ts",
            ],
        },
        {
            "title": "Window-to-wall ratio — the vision model",
            "badge": "method",
            "body": """
**The interaction.** In the viewer the camera flies to a façade, the user drags
a rubber-band crop, and the cropped image is sent for estimation. Results
persist to a WWR database so a façade is assessed once and reused.

**Three-tier fallback**, in strict priority order:

| Tier | Model | Endpoint | Result tag |
|---|---|---|---|
| 1 | `claude-sonnet-4-5` | `api.anthropic.com/v1/messages` (`anthropic-version: 2023-06-01`) | `claude-sonnet-4-5-vision` |
| 2 | `gpt-4.1` | `api.openai.com/v1/chat/completions` | `gpt-4.1-vision` |
| 3 | heuristic | — | `"Heuristic estimate (no OPENAI_API_KEY configured)."` |

**The tier matters and is recorded.** Every saved estimate carries its `source`,
so a Claude-derived number, a GPT-derived number and a heuristic guess are
distinguishable after the fact. `/api/status` reports which provider is
configured.

**Why WWR specifically.** It strongly drives heating demand and is one of the
attributes least often present in any register — Sweden's `buildings.json` has
no per-building WWR field at all. Without an estimate the model falls back to a
use-category default (0.15–0.30 depending on use), which is a much weaker
assumption than looking at the actual building.
""",
            "files": [
                "viewer/js/facade_inspector.js",
                "viewer/js/facade_comparison.js",
                "data/wwr_database.json",
                "frontend/src/config/materialProperties.ts",
            ],
        },
        {
            "title": "The data assistant — tool calling, not recall",
            "badge": "method",
            "body": """
`POST /api/chat`, surfaced as the "Ask the data" widget. Bilingual and
**data-grounded**: it does not answer from model knowledge, it calls tools that
query the project's own datasets and answers from what comes back.

**Provider.** Prefers OpenAI `gpt-4o` (function-calling loop, `temperature 0.2`),
with an Anthropic path as the alternative.

**Eleven tools:**

| Tool | Reaches |
|---|---|
| `list_datasets` | what data exists at all |
| `get_city_overview` | city-level aggregates |
| `list_districts` · `get_district_stats` | the 96 primärområden |
| `find_buildings_by_address` | individual buildings |
| `get_epc_dataset_info` · `search_epc_fields` | the 1.88 M-row certificate register |
| `get_booli_sales` · `get_boplats_rentals` | the scraped market data (**4. Scraped Market Data**) |
| `get_scb_datasets` | Statistics Sweden |
| `recommend_retrofit` | the agentic path — address → optimiser → options → EnergyPlus |

**`recommend_retrofit` is different in kind** from the other ten. The rest are
read-only lookups; this one runs the actual pipeline — resolves an address,
calls the optimiser, produces candidate options and validates them. It is the
one tool whose answer costs real compute.

**Why `temperature 0.2`.** The assistant's job is to report figures accurately,
not to write well. Low temperature reduces the chance of a plausible-sounding
number that the tools did not return.

**Design intent.** The grounding rule is what makes it acceptable in a
decision-support tool at all: an LLM that recalled Swedish building statistics
from training data would be confidently wrong in ways nobody could audit. One
that must call `search_epc_fields` and quote the result can be checked.
""",
            "files": [
                "frontend/src/components/ChatWidget.tsx",
                "scripts/fetch_epc_db.py",
            ],
        },
        {
            "title": "Keys, and what happens without them",
            "badge": "metadata",
            "body": """
| Key | Powers | Absent |
|---|---|---|
| `ANTHROPIC_API_KEY` | WWR tier 1, assistant alternative | falls to tier 2 |
| `OPENAI_API_KEY` | WWR tier 2, assistant preferred | WWR falls to the heuristic; assistant unavailable |
| *(neither)* | — | `/api/status` reports `configured: false`, `provider: null` |

Keys live in the gitignored `.env`. Never commit one, and never echo a value —
print names or lengths only when checking they exist.

**No learned component is on the critical path.** A simulation, an optimisation
and a prioritisation ranking all complete with every key absent — the
prioritisation simply re-weights around the missing F criterion, and the shoebox
uses a default WWR. That is deliberate: the tool must produce a defensible
answer without any AI at all.
""",
        },
    ],
    "todo": "Still from the separate ML project, not this repo: the training set "
            "(MBDD2025) size and composition, the exact detector backbone, and what "
            "metric the recorded best score of 0.77 refers to (mAP, and at which IoU).",
}

# ─────────────────────────────────────────────────────────────────────────────
CLIMATE_ENV = {
    "number": 12,
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
    "number": 13,
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
    "number": 17,
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
SCRAPED_DATA = {
    "number": 4,
    "title": "Scraped Market Data",
    "nav_title": "Market data (Sweden)",
    "stage": "raw",
    "purpose": """
The two housing-market feeds the tool scrapes itself — **Boplats** (first-hand
rentals) and **Booli** (sales and sold prices) — in full: how each site is
reached, what is stored, how often it runs, and whether it is running right now.

Everything else in the tool arrives via a file download or an official API
(**1. Data Sources**). These two are the only sources we scrape, which makes them
the only ones that can break because someone else changed a web page.
""",
    "overview": {
        "title": "Two scrapers, two very different techniques",
        "subtitle": "Both write SQLite, then export JSON for the Data Explorer.",
        "items": [
            ("Boplats", "Server-rendered HTML parsed with BeautifulSoup. 1,253 rentals held (2026-09-14)."),
            ("Booli", "Next.js site — the JSON payload is read out of the page itself. 243 listings held."),
            ("Accumulating", "Both keep first_seen / last_seen per record, so history builds up rather than being overwritten."),
            ("Fragile by nature", "A layout change upstream breaks them, unlike an API contract."),
        ],
    },
    "sections": [
        {
            "title": "Boplats — first-hand rentals",
            "badge": "raw",
            "body": """
**Target.** `https://boplats.se/sok?types=1hand&area=508A8CB406FE001F00030A60`
— the `area` token is Gothenburg; `types=1hand` restricts to first-hand
contracts, which is the segment with regulated rents and therefore the
meaningful one for renovation economics.

**Technique.** Plain `requests` plus **BeautifulSoup** over server-rendered
HTML. No browser automation, no API.

**Politeness.** `REQUEST_DELAY = 1.2` seconds between requests, with a
desktop-browser `User-Agent`.

**Stored** in `boplats_apartments.db`, table `apartments` — **1,253 rows** on 2026-09-14,
15 columns:

`id · url · address · area_name · rooms · size_m2 · floor_current ·
floor_total · rent_sek · move_in_date · apply_by · floorplan_image_path ·
floorplan_image_url · first_seen · last_seen`

**Floor plans** are downloaded to `boplats_images/<apartment_id>.jpg`, then
synced into `assets/boplats_images` and `frontend/public/boplats_images`.

**Why `floor_current` / `floor_total` matter.** They are the only routine source
in the whole tool for *which storey* a dwelling is on — relevant to both
retrofit sequencing and comfort, and absent from EUBUCCO and the certificates.

**Modes.** `--watch 60` re-scrapes on an interval; `--export` dumps the database
to JSON without scraping.
""",
            "files": [
                "boplats_scraper.py",
                "boplats_to_assets.py",
                "boplats_apartments.db",
                "assets/boplats_data.json",
            ],
        },
        {
            "title": "Booli — sales, sold prices and upcoming",
            "badge": "raw",
            "body": """
**Technique — the interesting part.** Booli is a **Next.js** site: every search
page ships its own data as JSON inside
`<script id="__NEXT_DATA__">` (Apollo normalised state). The scraper reads
`Listing` (for-sale / upcoming) and `SoldProperty` (sold) entities straight out
of that payload rather than parsing rendered HTML.

**Why that is better here.** The embedded payload is the same data the page
renders from, so it carries typed fields — coordinates, tenure, fees, energy
class — that would have to be scraped back out of formatted text otherwise. It
is also more stable than the DOM: a visual redesign usually leaves the payload
shape intact.

**No paid API.** An earlier iteration used a paid Apify actor. The current
scraper is direct — worth knowing, because the weekly cadence was originally
chosen to limit paid calls and is now purely about being polite.

**Status paths.** `till-salu` (for sale) and `slutpriser` (sold). *Upcoming* is
not a separate path — it is derived from the `upcomingSale` flag on the
for-sale set.

**Images** come from the CDN pattern `https://bcdn.se/images/cache/{id}_1280x0.webp`.

**Configuration**, all via `.env`:

| Variable | Default | Purpose |
|---|---|---|
| `BOOLI_AREA_IDS` | *(required)* | comma-separated area ids — find one by searching booli.se and copying `areaIds=` from the URL |
| `BOOLI_MAX_ITEMS` | 200 | cap per area **and** status |
| `BOOLI_MAX_PAGES` | 20 | page cap per area and status |
| `BOOLI_DELAY` | 1.5 s | between requests |
| `BOOLI_STATUSES` | all | subset of `for_sale,sold,upcoming` |

**Stored** in `booli_listings.db`, table `listings` — **243 rows**, 28 columns,
including `latitude` / `longitude`, `energy_class`, `sold_price`, `sold_date`,
`sqm_price`, `construction_year`, `monthly_fee`, `agency_name`, and the complete
**`raw_json`** of each record.

**Keeping `raw_json` is deliberate.** The parsed columns are a lossy projection
of a payload that changes shape upstream; retaining the original means a new
field can be back-filled from data already collected instead of re-scraping.

> **Cloudflare.** Booli sits behind it. This works at city volume with polite
> delays. Scraping all of Sweden would very likely be challenged or blocked and
> may breach Booli's terms — the scraper's own docstring says to throttle hard
> and prefer per-city runs. Treat that as a constraint, not a suggestion.
""",
            "files": [
                "booli_scraper.py",
                "booli_to_assets.py",
                "booli_listings.db",
                "assets/booli_data.json",
            ],
        },
        {
            "title": "From database to the app",
            "badge": "processed",
            "body": """
Each scraper is paired with an exporter that writes **two** copies of the JSON —
`assets/` and `frontend/public/` — because the viewer reads one and the React
Data Explorer reads the other.

`frontend/public/` is bind-mounted into the web container, so a refreshed export
is picked up **live**: no rebuild, just a browser refresh.

Boplats exports collapse to **unique addresses** (684 at the last successful
run) rather than one row per listing, since several listings can share an
entrance.
""",
            "files": [
                "assets/boplats_data.json",
                "assets/booli_data.json",
                "frontend/public/boplats_data.json",
                "frontend/public/booli_data.json",
            ],
        },
        {
            "title": "Scheduling — and the outage found on 2026-09-03",
            "badge": "metadata",
            "body": """
**Intended cadence:** Boplats daily at 03:00, Booli weekly.

**Actual state when checked on 2026-09-03:**

| Feed | Newest record | Age |
|---|---|---|
| Boplats | `last_seen` 2026-08-17 06:53 | 17 days |
| Booli | `last_seen` 2026-07-30 13:44 | 35 days |

The Windows task **`PPG-Boplats-Daily-Refresh`** was firing correctly every day
— it ran that morning at 03:16 and reported exit code **0** — while doing
nothing at all.

**Root cause.** Commit `e2f95ee3` (2026-08-17, *"Refactor project path
resolution in PowerShell scripts for flexibility"*) replaced a hardcoded project
root with a fallback chain:

```powershell
$proj = if ($env:PROJECT_ROOT) { $env:PROJECT_ROOT }
        elseif ($PSScriptRoot)  { $PSScriptRoot }      # ← resolves to <root>\\tools
        else { (Get-Location).Path }
```

The script lives in `tools\\`, so `$PSScriptRoot` **is** `<root>\\tools`, not the
project root. `PROJECT_ROOT` is not set at process, user or machine level, so
that middle branch always won. Consequently the scraper was invoked as
`tools\\boplats_scraper.py` (which does not exist) and the log was directed at
`tools\\tools\\boplats_refresh.log` — a directory that does not exist, so
`Add-Content` silently failed too.

**Why no alert.** The failure-email branch redirects its own output to the same
unwritable log and calls `boplats_notify.py`, which was equally unreachable from
the wrong directory. And the scheduled task reports the **PowerShell process**
exit code, which is 0 regardless. So: firing daily, succeeding on paper, doing
nothing, alerting nobody, for 17 days.

**Booli was worse.** The same day's commit `deb0312d` (*"Update paths … for
Docker compatibility"*) wrote **container** paths into the PowerShell script —
`$proj = '/app'` and `$py = '/usr/local/bin/python3'` — which cannot run on
Windows at all. Those belong in `refresh_booli.sh`, which already handles them
properly via `PPG_PROJECT_ROOT` / `PPG_PYTHON`. There is also **no
`PPG-Booli-Weekly` scheduled task registered**, despite the script header naming
one, so Booli has had no automation regardless.

**Fixed on 2026-09-03:** both `.ps1` scripts now resolve the root with
`Split-Path $PSScriptRoot -Parent`, create the log directory before writing, and
**abort loudly with exit 2** if the resolved directory does not contain the
scraper. The `.sh` variants were already correct and were not touched.

**Still outstanding:** no Booli scheduled task exists, and the disabled legacy
task `Boplats Database` (last run 2026-07-30, result 1) is still registered.
""",
            "files": [
                "tools/refresh_boplats.ps1",
                "tools/refresh_booli.ps1",
                "tools/refresh_boplats.sh",
                "tools/refresh_booli.sh",
                "boplats_notify.py",
                "tools/boplats_refresh.log",
            ],
        },
        {
            "title": "What this teaches about scheduled work",
            "badge": "metadata",
            "body": """
Three properties the outage lacked, worth applying to any future job:

1. **A scheduled task's exit code is not the job's exit code.** The wrapper must
   propagate failure, and the check must be on *data freshness*, not on whether
   the task ran.
2. **A path fallback that silently resolves to the wrong place is worse than a
   hardcoded path.** The hardcoded version was inflexible but visibly correct;
   the "flexible" version was invisibly wrong.
3. **Alerting that shares a failure mode with the thing it monitors is not
   alerting.** The notifier could not run for exactly the reason the job could
   not run.

A freshness assertion — *newest `last_seen` is younger than 48 hours* — would
have caught this on day two.
""",
        },
    ],
    "todo": "Register a PPG-Booli-Weekly scheduled task, remove the disabled "
            "legacy 'Boplats Database' task, and add a data-freshness check that "
            "alerts on stale last_seen rather than on task exit code.",
}

# ─────────────────────────────────────────────────────────────────────────────
ANALYSIS_INVENTORY = {
    "number": 14,
    "title": "Analysis Inventory",
    "stage": "method",
    "purpose": """
Every analysis the tool can run, in one table: where it executes, what method it
uses, where that method came from, and whether it is built in or an external
service. Each has its own page for the detail — this is the index.
""",
    "overview": {
        "title": "Four families",
        "subtitle": "Grouped by what they compute, not by which page they appear on.",
        "items": [
            ("Building energy", "Demand and retrofit performance — EnergyPlus and the analytic degree-day model."),
            ("Environmental", "Sun, radiation and outdoor comfort around a point."),
            ("Urban", "Network and greenness measures over the city."),
            ("Decision support", "Ranking, optimising and choosing under uncertainty."),
        ],
    },
    "sections": [
        {
            "title": "The full inventory",
            "badge": "method",
            "table": [
                ["Analysis", "Runs in", "Method", "Origin"],
                ["EnergyPlus simulation", "EPSM service :8010", "Full building energy simulation of a single-zone shoebox", "External — EPSM, Chalmers"],
                ["Optimisation (Pareto front)", "Backend /api/optimize", "Enumerate combinations, degree-day physics, skyline sweep on cost/carbon/energy", "Adapted from DT4PED"],
                ["Retrofit prioritisation (MCDA)", "Browser, client-side", "Weighted expert-rule score over four criteria; AHP weights", "Built in"],
                ["Decision under uncertainty", "Browser, client-side", "Minimax regret, uncertainty range, Hurwicz over price scenarios", "Built in"],
                ["Retrofit scenario analyser", "Browser + backend", "Package comparison against a simulated baseline", "Built in"],
                ["Life-cycle assessment", "Browser + Boverket API", "Embodied carbon from emission factors plus operational carbon", "Built in"],
                ["Heating-system comparison", "Browser, client-side", "Economics on top of an unchanged demand; SPF catalogue", "Built in"],
                ["Sun hours", "Backend /api/analysis/sun-hours", "Direct-sun hours over a ground disc; compact astronomical sun position", "Built in, clean-room"],
                ["Incident radiation", "Backend /api/analysis/incident-radiation", "Cumulative irradiation, EPW-driven sky matrix", "Built in, clean-room"],
                ["Thermal comfort (UTCI)", "Backend /api/analysis/thermal-comfort", "UTCI plus solar mean radiant temperature", "Built in, on pythermalcomfort"],
                ["Rooftop PV yield", "PVGIS (external API)", "Orientation- and tilt-aware annual yield", "External — EC PVGIS"],
                ["Space-syntax centrality", "Backend /api/urban/space-syntax", "Street-network centrality, pure Python", "Built in"],
                ["Green index / green areas", "Backend /api/urban/green-areas", "Distance-decay greenness from OSM polygons", "Built in"],
                ["TABULA archetype matching", "Pipeline + backend", "Lookup by construction period and building type", "External typology, own matcher"],
                ["Façade defect detection", "Host ML service :8020", "Object detection over façade photographs", "External ML project"],
                ["Window-to-wall ratio", "Backend, vision model", "Vision-model estimate from a cropped façade image", "Built in prompt, hosted model"],
                ["Data assistant", "Backend /api/chat", "Tool-calling LLM over the project's own datasets", "Built in"],
                ["Sensitivity analysis", "Precomputed, browser", "One-at-a-time and global SA over model parameters", "Built in"],
            ],
        },
        {
            "title": "Built in versus external",
            "badge": "metadata",
            "body": """
Only four things in the list are not this project's own code:

| External | What it is | Consequence |
|---|---|---|
| **EPSM** | containerised EnergyPlus manager, :8010 | needs Docker running; its end-use schema limits what we can report (**17. Known Limitations**) |
| **PVGIS** | European Commission solar API | network dependency; not cached — a result is kept only when a user saves it |
| **Façade defect model** | trained detector from a separate ML project | needs its own torch environment on the host |
| **Vision / chat models** | hosted LLM APIs | need API keys; degrade to a heuristic or refuse rather than failing hard |

Everything else runs from source in this repository, which is why the methods
can be documented to the level of individual thresholds elsewhere in this
logbook.
""",
        },
        {
            "title": "Where each one surfaces in the app",
            "badge": "result",
            "table": [
                ["Surface", "Analyses available there"],
                ["3D viewer", "Sun hours · incident radiation · thermal comfort · space syntax · green index · rooftop PV · WWR estimate · façade comparison · EnergyPlus shoebox run"],
                ["Wizard step 2", "Retrofit prioritisation · façade defect detection"],
                ["Wizard step 3", "Baseline EnergyPlus simulation"],
                ["Wizard step 4", "Optimisation · decision under uncertainty · heating-system comparison · LCA"],
                ["Analysis Tools page", "The registry itself, with per-method attribution"],
                ["Data Explorer", "Scraped market data · SCB statistics · EPC dataset queries"],
                ["Chat widget", "The data assistant, over all of the above datasets"],
            ],
            "files": ["frontend/src/pages/AnalysisTools.tsx"],
        },
        {
            "title": "Status flags in the app's own registry",
            "badge": "metadata",
            "body": """
`AnalysisTools.tsx` carries a `status` per method. As of 2026-09-03 eight are
`integrated` — PVGIS, WWR estimation, façade defect detection, the optimisation
model, MCDA prioritisation, decision under uncertainty, the retrofit scenario
analyser and LCA — and one, **EPSM**, is `external`.

Nothing in that registry is currently flagged as planned or unavailable, so the
registry and this inventory agree.
""",
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
PROJECT_TEAM = {
    "number": 18,
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

The simulation workflow is documented in **7. Simulation Process** and the
optimisation logic in **9. Optimisation Process**. Those pages are the
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
# TABBED PAGES — one page per topic, one tab per country
# ─────────────────────────────────────────────────────────────────────────────
# Sweden and the UK are built from different sources by separate chains, so the
# three topics where they differ carry a tab per country rather than alternating
# SE / UK sections. Each tab's content is the SE_* / UK_* / *_PIPELINE dict above;
# those dicts have no number of their own.
DATA_SOURCES = {
    "number": 1,
    "title": "Data Sources",
    "stage": "raw",
    "purpose": """
Where every dataset in the tool comes from, how the tool is connected to it,
how up to date it is, how it is stored and where it is used — one card per
dataset. Sweden and the United Kingdom draw on almost entirely different
sources, so each has its own tab. Services and keys shared by both are on
**15. Services, Keys & Access**.
""",
    "tabs": [("Sweden", SE_DATA), ("United Kingdom", UK_DATA)],
}

COVERAGE = {
    "number": 2,
    "title": "Coverage & Quality",
    "stage": "metadata",
    "purpose": """
How far each country's numbers can be trusted: what exactly is covered and for
how many buildings, what is missing and why, what the tool falls back on, how
old the records are, the limitations, and what could be improved. Read this
before quoting a number outside the project — and note that Swedish and UK
coverage figures are **not comparable**: Sweden matches certificates to
buildings geometrically, the UK by address. Where each dataset comes from is on
**1. Data Sources**; how it is processed is on **3. Pipelines**.
""",
    "tabs": [("Sweden", SE_COVERAGE), ("United Kingdom", UK_COVERAGE)],
}

PIPELINES = {
    "number": 3,
    "title": "Pipelines",
    "stage": "interim",
    "purpose": """
How each country's raw registers become the building model the viewer and the
wizard read, step by step — loading, cleaning, matching certificates to
buildings, and what happens when they do not match. The two chains share almost
nothing — different geometry source, different certificate join — except the
output schema, which is why one viewer renders both.
""",
    "tabs": [("Sweden", SWEDEN_PIPELINE), ("United Kingdom", UK_PIPELINE)],
}

# ─────────────────────────────────────────────────────────────────────────────
PAGES = {
    # Data & pipelines (the first three have a Sweden / United Kingdom tab each)
    "data_sources":    DATA_SOURCES,
    "coverage":        COVERAGE,
    "pipelines":       PIPELINES,
    "scraped_data":    SCRAPED_DATA,
    # Methods - apply to both countries
    "digital_twin":    DIGITAL_TWIN,
    "shoebox_idf":     SHOEBOX_IDF,
    "simulation":      SIMULATION,
    "prioritisation":  PRIORITISATION,
    "optimisation":    OPTIMISATION,
    "decision":        DECISION_ANALYSIS,
    "facade_ml":       FACADE_ML,
    "climate_env":     CLIMATE_ENV,
    "viewer_layers":   VIEWER_LAYERS,
    "analysis_index":  ANALYSIS_INVENTORY,
    # Reference
    "access":          ACCESS,
    "script_browser":  SCRIPT_BROWSER,
    "limitations":     LIMITATIONS,
    "project_team":    PROJECT_TEAM,
}

# Sidebar structure: one header per group, pages in the order listed. Page
# numbers must run 1..N in exactly this order - scripts/check_content.py
# enforces it.
NAV = [
    ("Data & pipelines", ["data_sources", "coverage", "pipelines", "scraped_data"]),
    ("Methods", ["digital_twin", "shoebox_idf", "simulation", "prioritisation",
                 "optimisation", "decision", "facade_ml", "climate_env",
                 "viewer_layers", "analysis_index"]),
    ("Reference", ["access", "script_browser", "limitations", "project_team"]),
]
