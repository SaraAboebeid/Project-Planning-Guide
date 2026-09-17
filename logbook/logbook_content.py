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
                "source_version": "Not stated by DTCC. The tile headers say the 32 `19B002` tiles were written on **2020-11-16** and the 40 `20B008` tiles on **2021-10-06** (1.23 billion points in total). The scan dates are not in the header; the prefixes suggest scan campaigns in 2019 and 2020 — **our inference**.",
                "source_short": "tiles written 2020-11 / 2021-10",
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
                    "Space-syntax analysis in the viewer — street-network centrality",
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
                "stage_note": "Exists only so the UK track runs end to end. Must never be presented as real — see **16. Known Limitations**.",
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
    "number": 14,
    "title": "Services, Keys & Access",
    "nav_title": "Services, keys & access",
    "stage": "metadata",
    "purpose": """
Everything the tool depends on outside its own code: the services it calls, the
keys those need, the ports each piece listens on, how it is deployed, and —
most useful when something breaks — **what happens when a given service or key
is missing**. Almost nothing here fails hard: the tool is written to degrade,
which is convenient in use and confusing in diagnosis, so each entry says
exactly how it degrades. Country-specific datasets are on **1. Data Sources**;
the analyses that use these services are on **13. Analysis Inventory**.

Checked against the code and probed live on this computer on 2026-09-16. No key
value appears on this page or anywhere in the logbook.
""",
    "overview": {
        "title": "Five kinds of dependency",
        "subtitle": "Each fails differently, and each is listed with its failure behaviour.",
        "items": [
            ("Our own services", "EPSM for EnergyPlus (Docker, port 8010) and the façade ML service (port 8020). Both optional; both refuse politely when down."),
            ("Services needing a key", "Västtrafik, Trafikverket, CARTO, the AI providers, Google Street View, the UK certificate register."),
            ("Free public services", "OpenStreetMap (Overpass, Nominatim), PVGIS, SCB, Boverket's climate database, electricity spot prices, Esri basemaps."),
            ("Things the browser fetches itself", "The Cesium library from a CDN, map tiles, the Swedish statistics map service — these bypass the backend entirely."),
            ("Files on disk", "The certificate database, the simulation store, weather files, scraped market databases — they behave like services and fail like them."),
        ],
    },
    "sections": [
        {
            "title": "Live status on this computer",
            "badge": "result",
            "body": """
Every service was called through the tool's own routes on **2026-09-16**. This
is what a healthy install looks like, and the same checks diagnose a broken one.

| Checked | Route used | Result |
|---|---|---|
| Backend | `/api/health` | **up** (0.2 s) |
| AI provider | `/api/status` | **configured**, provider `openai` |
| EnergyPlus (EPSM) | `/api/status` | **not reachable** — Docker Desktop is not running |
| Façade defect ML | `/api/status` | **not reachable** — the service is not started |
| Electricity spot price | `/api/energy-price?zone=SE3` | **live**, 0.7 s |
| Västtrafik | `/api/vasttrafik/stops` | **live**, 1.9 s — the key pair works |
| Trafikverket | `/api/trafikverket/data` | **live**, 1.3 s, 290 kB — the key works |
| Statistics Sweden | `/api/scb/deso-income` | **live**, 4.8 s |
| OpenStreetMap (Overpass) | `/api/osm/roads` | **live**, 0.7 s |
| Address search (Nominatim) | `/api/geocode` | **live** |
| Boverket climate database | `/api/boverket/materials` | **live**, 22 kB |
| Solar yield (PVGIS) | `/api/pvgis` | **live**, 5 s |
| UK building lookup | `/api/uk/building` | **live** (local files) |

**The one check worth remembering:** `GET /api/status` answers with the AI
provider, EPSM and the façade ML service in one object. It is what the app's
Settings → Connections panel reads, and it treats "any answer below a 500" as
reachable.
""",
            "files": ["backend/main.py"],
        },
        {
            "title": "Keys — what each one unlocks, and life without it",
            "badge": "metadata",
            "body": """
All keys live in the gitignored `.env` at the repository root, loaded once when
the backend starts. The scrapers parse the same file themselves. Docker passes
it in with `env_file` and does not require it.

| Key | Unlocks | Set here? | Without it |
|---|---|---|---|
| `OPENAI_API_KEY` | data assistant, window-to-wall estimates, façade vision | **yes** | assistant replies "not configured"; the window ratio falls back to a rule of thumb marked low confidence |
| `ANTHROPIC_API_KEY` | the same three, tried *first* for the two vision ones | **no** | silently skipped, OpenAI is used instead |
| `VASTTRAFIK_CLIENT_ID` + `_SECRET` | all public-transport layers | **yes** | every Västtrafik route answers 503 with a "register an app" message |
| `TRAFIKVERKET_API_KEY` | road cameras, traffic flow, road conditions, rest stops | **yes** | 503; the viewer falls back to the stored `trafikverket_data.json` snapshot, labelled "offline" |
| `CARTO_API` | the sharper Light/Dark basemaps | **yes** | the viewer keeps the keyless Esri basemaps — no error, slightly plainer map |
| `UK_EPC_API_TOKEN` | UK certificate download during the pipeline | **yes** | the pipeline estimates bands from the English Housing Survey instead |
| `GOOGLE_MAPS_API_KEY` | Street View façade capture | **no — and it is not in `.env.example`** | 503 telling you to add it; the only way to discover the key exists |
| `BOOLI_AREA_IDS` (+ `BOOLI_MAX_ITEMS`, `_MAX_PAGES`, `_DELAY`, `_STATUSES`, `_DETAILS`) | which areas the Booli scraper covers, and its politeness limits | **yes** (areas) | nothing is scraped |
| `SMTP_HOST` / `_USER` / `_PASSWORD` (+ `_PORT`, `_FROM`, `ALERT_EMAIL`) | failure emails from the scheduled scrapers | **no** | the job prints "SMTP not configured" and carries on — alerting never breaks a pipeline |
| `EPC_DB_URL` / `EPC_DB_TOKEN` | downloading the 461 MB certificate database when a container starts | **no** | the download step prints instructions and exits cleanly; dataset-wide certificate questions are unavailable |
| `EPSM_BASE_URL` | where the simulation service lives | default | `http://localhost:8010` |
| `FACADE_ML_URL` (legacy alias `FACADE_MODEL_URL`) | where the defect detector lives | default | `http://host.docker.internal:8020` |
| `EUBUCCO_DATA_DIR` | where building source data is read from | default | `data/eubucco` |
| `PPG_API` | which backend this logbook's live examples call | default | `http://127.0.0.1:8080` |

**How to check what is set** without revealing anything — print names and
whether each has a value, never the value itself:

```powershell
Get-Content .env | Where-Object { $_ -match '^\\s*[A-Za-z_]\\w*\\s*=' } |
  ForEach-Object { $n, $v = $_ -split '=', 2; "{0,-28} set={1}" -f $n.Trim(), [bool]$v.Trim() }
```

**Drift between `.env`, `.env.example` and the code**

| Problem | Detail |
|---|---|
| Documented but never read | `LANTMATERIET_USER` and `LANTMATERIET_PASSWORD`. No Python reads them; the Lantmäteriet footprints arrived inside the certificate database. |
| Set here but read nowhere | `ZENODO_API_TOKEN`. The only Zenodo references in the repository are two scripts that *print* a download page address. |
| Read but undocumented | `GOOGLE_MAPS_API_KEY`, the façade ML variables, the SMTP group, `EPC_DB_URL` / `EPC_DB_TOKEN`, the Booli group, `EUBUCCO_DATA_DIR`, `PPG_API`. None appears in `.env.example`. |
| A stale registration address | `.env.example` points UK certificate registrants at `epc.opendatacommunities.org`, retired on 2026-05-30. The live service is `get-energy-performance-data.communities.gov.uk`. |
| A trap | `backend/config.py` looks like the configuration module but **nothing imports it**, and it reads `VT_CLIENT_ID` / `VT_CLIENT_SECRET` — names the real code does not use. Editing it to fix Västtrafik changes nothing. |
""",
            "files": [".env.example", "backend/config.py", "backend/main.py"],
        },
        {
            "title": "Our own services",
            "badge": "metadata",
            "body": """
**a) The backend** — FastAPI under uvicorn. Its documented port is **8000**
(what Docker and `launch.py` use); this logbook's live examples default to
**8080**, which is how it is usually started by hand here. It serves the API,
the two 3D viewer pages, and the built React app when `frontend/dist` exists.
Cross-origin requests are wide open (`*`), which is fine behind the single-origin
proxy and worth remembering if the backend is ever exposed directly. A custom
error wrapper attaches the cross-origin header to unhandled 500s, because
without it the browser reported a healthy backend as "not reachable".

**b) EPSM — the EnergyPlus simulation manager** (**6. Energy Simulation — EPSM
& IDF**). A separate four-container stack: Django backend, a Celery worker,
PostgreSQL and Redis. Both application containers run as root so they can reach
the Docker socket and start `nrel/energyplus:23.2.0` containers as siblings.

| Property | Value |
|---|---|
| Port | host **8010** → container 8000, chosen so it cannot collide with our backend |
| Authentication | **none** between our backend and EPSM |
| Committed credentials | the database password and Django secret are literals in the compose file, self-described as local-dev-only |
| Our timeouts | 30 s submit · 15 s status · 120 s batch submit · 300 s for batch results |
| Known trap | a 39-building batch returns about 57 MB of hourly traces; too short a timeout left batches stuck at "queued" forever, so a failed fetch is now treated as "not reconciled yet" and retried |

When simulations fail, check Docker Desktop first — that has been the cause
every time so far.

**c) The façade defect service** — a small FastAPI app on port **8020** holding
the trained detector (**10. AI, ML & Vision Models**), started by hand with
`python tools/ml/facade_detect_service.py`. It offers `/health` and `/detect`,
has no authentication, and loads its model from a path that defaults to a
personal folder outside the repository. The backend proxies to it and answers
503 with the exact command to start it.

> **A deployment bug worth knowing:** in `docker-compose.prod.yml` the canonical
> variable is set to `http://localhost:8020` while the legacy alias points at
> `host.docker.internal`. The canonical one wins, so in production the backend
> looks for the detector inside its own container, finds nothing, and quietly
> returns the "no model connected" placeholder. The development stack has both
> set correctly.

**d) This logbook** — Streamlit on port **8501**, reading the repository
directly and calling the backend only for the live examples.
""",
            "files": ["docker-compose.epsm.yml", "tools/ml/facade_detect_service.py",
                      "docker-compose.prod.yml", "logbook/scripts/live_requests.py"],
        },
        {
            "title": "External services, and how each one fails",
            "badge": "metadata",
            "body": """
Everything below is called **from the backend or a pipeline script**, so keys
stay on the server.

**Maps, addresses and streets**

| Service | Used for | Auth | Caching | When it fails |
|---|---|---|---|---|
| Nominatim (OpenStreetMap) | address search, reverse geocoding for building lists | none, identifying user-agent | in-memory, no expiry; the certificate geocoder also caches to disk and honours the one-request-per-second policy | search: 404 "address not found"; reverse lookups are skipped silently |
| Overpass (OpenStreetMap) | street network, green areas, space syntax, the UK pipeline | none, identifying user-agent | per bounding box, in memory, no expiry | three mirrors are tried in turn; all failing gives 502. The main mirror rate-limits hard |
| PVGIS (EU Joint Research Centre) | rooftop solar yield | none | none | PVGIS's own status code is passed through |

**Energy, climate and materials**

| Service | Used for | Auth | Caching | When it fails |
|---|---|---|---|---|
| elprisetjustnu.se (Nord Pool) | Swedish spot price | none | per zone and day | answers 200 with `live: false` and a note — never an error |
| Octopus Agile | UK price | none | none | same pattern |
| Boverket climate database | material carbon factors | none | for the life of the process | **catches every error and returns an empty list**, which looks exactly like "no materials for this component" |
| Climate.OneBuilding (weather) | EPW files | — | files committed to `data/epw/` | no live call; a missing file is a 500 naming the file |

**Swedish public data**

| Service | Used for | Auth | Caching | When it fails |
|---|---|---|---|---|
| Västtrafik — token, journeys, disruptions, park & ride | live transit layers | OAuth2 client credentials, token cached until 30 s before expiry | none beyond the token | 503 without keys, 502 on a bad answer. The parking service sometimes replies with a bare number instead of an object; both shapes are now accepted |
| Trafikverket traffic information | cameras, flow, conditions, parking | key inside the request body | 60 s | 503 without a key; on failure the error deliberately does **not** echo the request, because the key is in it |
| Statistics Sweden (income table) | household income by area | none | per year, no expiry | 502 |

**UK data**

| Service | Used for | Auth | Caching | When it fails |
|---|---|---|---|---|
| Energy certificate register (GOV.UK) | certificates for UK buildings | bearer token | on disk, two caches | falls back to survey-based band estimates. Documented limit: the published quota is 6,000 requests per five minutes, but bursts are throttled after roughly 25–175 requests |
| English Housing Survey | band and cost reference tables | none | downloaded files | manual download, documented in the ingest script |

**AI providers** (**10. AI, ML & Vision Models**)

| Provider | Models used | Timeouts | When it fails |
|---|---|---|---|
| Anthropic | Claude Sonnet for façade vision and chat | 30–60 s | falls through to OpenAI, then to a heuristic |
| OpenAI | GPT-4o / GPT-4.1 for chat, window ratio, vision | 30–60 s | the assistant returns a polite message; nothing raises |
| Google Street View Static API | façade images from the street | 30 s | 503 without a key; quota exhaustion is reported as such. Images are deliberately **not** cached to disk, because the terms cover display, not accumulation |

**Scraped sites** (**4. Scraped Market Data**)

| Site | Politeness | Note |
|---|---|---|
| Boplats | 1.2 s between requests, browser-like user-agent | daily refresh |
| Booli | 1.5 s default, page and item caps | the script warns that Booli sits behind bot protection: modest per-city volume only, and scraping all of Sweden would likely breach its terms |

**Bulk downloads** used when building the model: EUBUCCO from its S3 bucket
(anonymous, and note the transfer is unencrypted), and Chalmers DTCC for the
laser-scan tiles (open, plain HTTP, 10-minute timeout per tile, resumable).
""",
            "files": ["backend/main.py", "utils/boverket_api.py", "tools/uk/ingest_epc.py",
                      "booli_scraper.py", "boplats_scraper.py"],
        },
        {
            "title": "What the browser fetches by itself",
            "badge": "metadata",
            "body": """
These bypass the backend, so they fail even when the backend is healthy — and
they are why the viewer needs internet access of its own.

| Service | Used for | Key | When it fails |
|---|---|---|---|
| jsDelivr CDN | the CesiumJS library and its workers (version 1.143) | none | **the viewer cannot start**; it shows an error card. The app's Settings panel probes this |
| Esri ArcGIS | Light, Dark, Satellite and hillshade basemaps | none — chosen for exactly that reason | tiles go blank |
| CARTO | the sharper Light and Dark basemaps | `CARTO_API`, handed to the browser inside the tile address by `/api/viewer-config` | falls back to Esri. Without a key CARTO still answers, but stamps "API KEY REQUIRED" across every tile |
| Cesium ion → Google | photorealistic 3D tiles, and OSM Buildings in the UK viewer | an ion token (see below) | the token panel opens; the flat map and buildings keep working |
| Statistics Sweden map service | the twelve SCB layers (**12. Viewer Layers & Visualisation**) | none | the layer just does not appear |
| Nominatim, OpenStreetMap tiles, Google Fonts | viewer search, the Leaflet map in Step 1, typography | none | search reports failure; tiles blank; fallback fonts |

**The Cesium ion token.** It is a real credential and it is **hard-coded in the
viewer script that is served to browsers**, with a user-supplied token in the
browser's storage taking precedence when someone pastes one into the token
panel. Two stale backup copies of that script sit next to it and are also
served, because production mounts the whole folder over the image, so the token
is reachable at three addresses. Moving it into the backend configuration —
the way the CARTO key is handled — and deleting the backups would fix both.
""",
            "files": ["assets/viewer/js/cesium.js", "frontend/public/city_bg.html", "backend/main.py"],
        },
        {
            "title": "Ports",
            "badge": "metadata",
            "table": [
                ["Port", "What listens", "Mode", "Published"],
                ["5173", "Vite development server (its own default)", "development, run directly", "local"],
                ["5180", "Vite development server inside Docker — the single origin for app and viewer", "development, Docker", "yes"],
                ["8000", "FastAPI backend", "both", "development only; in production only the proxy reaches it"],
                ["8080", "nginx — the app, the viewer and the API proxy; the only public port", "production", "yes"],
                ["8080", "the backend when started by hand here (the logbook's live examples default to it)", "this computer", "local"],
                ["8010", "EPSM (its container's port 8000)", "simulation stack", "yes"],
                ["5432 · 6379", "EPSM's PostgreSQL and Redis", "simulation stack", "no — internal to its network"],
                ["8020", "façade defect ML service", "host", "local"],
                ["8501", "this logbook", "host", "local"],
                ["8765", "static launcher for `assets/` (`launch.py`)", "standalone", "local, loopback only"],
            ],
            "files": ["docker-compose.yml", "docker-compose.prod.yml", "docker-compose.epsm.yml",
                      "docker/nginx.conf", "launch.py"],
        },
        {
            "title": "How it is deployed",
            "badge": "metadata",
            "body": """
Three Docker stacks, all optional for development.

**a) Development** (`docker-compose.yml`): the backend with reload on 8000, and
a Node container running Vite on 5180 that serves the React app *and* the
viewer and proxies the API to the backend. One origin, so nothing needs a
cross-origin exception. The repository is bind-mounted, so code changes are
live. Before uvicorn starts, a script optionally downloads the certificate
database.

**b) Production** (`docker-compose.prod.yml`): the same backend without reload,
not published, plus an nginx container on 8080 serving the built app, the
viewer files, and proxying `/api` to the backend with a 300-second read timeout
for long simulations. The image is built with Vite directly rather than
`npm run build`, deliberately, because the project has a known type-check
backlog.

**c) Simulation** (`docker-compose.epsm.yml`): the EPSM stack described above.

**Without Docker:** run the backend with uvicorn and the frontend with
`npm run dev` (port 5173 by default, not the 5180 the documentation quotes), or
use `launch.py`, which serves `assets/` on 8765 and starts the backend on 8000.

> **`launch.py` no longer gives the viewer a working API.** The viewer asks for
> `/api/...` relative to wherever it was loaded, so on port 8765 every analysis,
> simulation and live layer gets a 404. Use the development server or the
> production proxy for anything beyond looking at the buildings.

**The build step and the served viewer.** `build.py` copies viewer scripts from
`viewer/` into `assets/`, and `assets/` is what is served. Two scripts exist
only in `assets/`, so a rebuild cannot refresh them. Keep both copies in step —
this project edits both.
""",
            "files": ["docker-compose.yml", "docker-compose.prod.yml", "docker/Dockerfile.backend",
                      "docker/Dockerfile.web", "docker/nginx.conf", "frontend/vite.config.ts",
                      "launch.py", "build.py", "docker/README.md"],
        },
        {
            "title": "Scheduled jobs and alerting",
            "badge": "metadata",
            "table": [
                ["Job", "When", "How it is scheduled", "Credentials"],
                ["Boplats refresh (scrape → database → served file)", "daily, 12:00", "systemd timer on Linux; a scheduled task on this computer", "none to scrape; SMTP for failure emails"],
                ["Booli refresh", "Sundays, 03:30", "systemd timer; a Windows task", "the Booli area settings; SMTP for alerts"],
                ["Trafikverket snapshot", "on demand", "no scheduler — run the scraper by hand", "the Trafikverket key"],
                ["Certificate database download", "every container start", "part of the backend's start command", "the download address and token, both optional"],
            ],
            "body": """
The alert mail is deliberately best-effort: if the mail settings are absent or
the send fails, the job logs it and still reports success, so alerting can never
be the reason a data refresh fails. The default recipient is the project's own
address. The Windows wrappers hard-code an absolute path to a specific Python
installation, which will need editing on another machine.
""",
            "files": ["deploy/systemd", "boplats_notify.py", "tools/refresh_booli.ps1",
                      "scripts/fetch_epc_db.py"],
        },
        {
            "title": "Files that behave like services",
            "badge": "metadata",
            "body": """
These are opened at run time and fail like a service would. They can all be
browsed in the **Data Explorer**.

| File | Role | If missing |
|---|---|---|
| `data/simulation_database.sqlite3` | every EnergyPlus run and its results | created on demand. It replaced a flat JSON file that lost records when batches finished at the same time |
| `data/sensitivity/epc_sweden.duckdb` | the national certificate register, opened read-only | the assistant answers gracefully; the certificate snapshot route reports "not available in this deployment" |
| `boplats_apartments.db`, `booli_listings.db` | rents and sale prices | the market fields are simply absent |
| `frontend/public/buildings.json` | the Swedish building model, read once and kept in memory | the first request fails with a 500 |
| `frontend/public/uk/*.json` | UK buildings and reference tables | 404 naming the exact command that rebuilds them |
| `data/epw/*.epw` | weather for simulation and analysis | 500 naming the missing file |
| `data/wwr_database.json`, `data/pvgis_database.json` | saved window-ratio and solar results | treated as empty |

**Caches are in memory and disappear on restart:** building data, reverse
geocoding, Overpass answers, the income table and the spot price are all held
without an expiry; only the Trafikverket cache (60 s) and the Västtrafik token
(until just before it expires) have one. The first request after a restart is
therefore always the slow one.
""",
            "files": ["backend/simdb.py", "data/sensitivity/epc_sweden.duckdb",
                      "data/simulation_database.sqlite3"],
        },
        {
            "title": "If something is broken, in order",
            "badge": "metadata",
            "body": """
1. **`GET /api/status`** — names the AI provider and tells you whether EPSM and
   the façade detector are reachable.
2. **Simulations failing?** Docker Desktop, then the EPSM stack
   (`docker compose -f docker-compose.epsm.yml up -d`), then port 8010.
3. **A whole layer missing?** Check its key in the table above. Västtrafik and
   Trafikverket say 503 plainly; CARTO and Anthropic degrade without a word.
4. **"Backend not reachable" in the app?** Check which port the backend is on
   (8000 or 8080) and what the frontend proxies to — the development proxy
   defaults to 8000, and pointing it at the wrong port produces exactly this
   message with a healthy backend behind it.
5. **The viewer will not load at all?** The Cesium library comes from a public
   CDN; if that is blocked nothing renders.
6. **An analysis 500s?** Two Python packages the requirements pin have been
   missing from the local environment in the past — see **13. Analysis
   Inventory**.
7. **Odd map or missing green layers?** The pre-built green-area file is served
   only from `assets/`; some ways of running the viewer silently fall back to
   approximations.
""",
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
SCRIPT_BROWSER = {
    "number": 15,
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
How the digital twin is put together: the 3D city in which every building
carries its own data, and on which every layer and analysis sits. This page
follows the process — from the building data the pipelines produce, through how
the viewer is assembled and served, how the buildings are drawn, to how the
layers and analyses attach to them — and describes each of the viewers the tool
uses. The data itself is on **1. Data Sources** and **3. Pipelines**.
""",
    "overview": {
        "title": "From registers to a city you can click",
        "subtitle": "Four layers of the twin, bottom to top.",
        "items": [
            ("Building data", "One record per building — outline, height, use, energy class, year, U-values, district — written by the pipelines."),
            ("Viewer", "One Cesium code base, assembled per country; the same code draws Gothenburg and the UK."),
            ("Layers", "Basemaps, LiDAR vegetation, roofs and terrain, streets, statistics and live transport feeds."),
            ("Analyses", "Run on the backend for a clicked building or point; the result is drawn back into the scene and, for some, saved to that building."),
        ],
    },
    "sections": [
        {
            "title": "What the twin is made of",
            "body": """
The twin is **generated from data, not modelled by hand.** Every building on
screen is one record of the building payload, and everything the viewer shows
about a building — its colour, its info card, the inputs to its analyses — is
read from that record.

| Part of the twin | Where it comes from | File the viewer reads |
|---|---|---|
| Building outline and height | EUBUCCO (Sweden), OpenStreetMap + EUBUCCO (UK) | `frontend/public/buildings.json`, `frontend/public/uk/buildings_<district>.json` |
| Use, energy class, year, heated area | energideklaration (Sweden), EPC register or survey estimate (UK) | same record |
| Envelope U-values | TABULA archetypes | same record |
| District | Göteborg primärområden | same record |
| Trees, roofs, terrain | DTCC LiDAR | `assets/dtcc_vegetation.json`, `assets/roofs_gothenburg.json`, `assets/terrain_hillshade.png` |
| Streets, green areas, statistics, transport | OpenStreetMap, SCB, Västtrafik, Trafikverket — fetched when a layer is switched on | nothing stored |
| Analysis results | computed by the backend on request | `data/simulation_database.sqlite3`, `data/wwr_database.json`, `data/pvgis_database.json` |

How the building records are produced is on **3. Pipelines**; how complete
they are is on **2. Coverage & Quality**.
""",
            "files": ["frontend/public/buildings.json", "frontend/public/uk/cities.json", "data/simulation_database.sqlite3"],
        },
        {
            "title": "The viewers — where the twin is shown",
            "body": """
| Viewer | What it is | Where in the tool |
|---|---|---|
| **Gothenburg 3D** (`assets/gothenburg_3d.html`) | The full twin: 92,973 buildings with every layer and analysis | the 3D viewer page (`/viewer`); Step 2's "3D view" buttons |
| **United Kingdom 3D** (`assets/uk_3d.html`) | The same code with the UK profile: city pills switch between the five districts; grey Cesium OSM Buildings massing is on by default so the small districts sit in their city; the Swedish-only layers (Västtrafik, Trafikverket, SCB) are not loaded | the UK 3D viewer page (`/viewer/uk`) |
| **City backdrop** (`frontend/public/city_bg.html`) | A light Cesium page with no building data: Google photorealistic 3D tiles and a dark basemap, camera set from the URL so one file serves every city | the landing page hero and the workspace chooser's city previews |
| **Step 1 map** (`frontend/src/components/LocationMap.tsx`) | A 2D Leaflet map on OpenStreetMap tiles: address search, the municipality outline (dissolved from the 96 districts by the backend), the chosen district, and a check that the selection lies inside Gothenburg | Step 1 — choosing the buildings or area |

The two 3D viewers are embedded in the React app as frames
(`frontend/src/pages/MapViewer.tsx`, `frontend/src/pages/UKMapViewer.tsx`) and
can also be opened on their own.
""",
            "files": [
                "assets/gothenburg_3d.html",
                "assets/uk_3d.html",
                "frontend/public/city_bg.html",
                "frontend/src/components/LocationMap.tsx",
                "frontend/src/pages/MapViewer.tsx",
                "frontend/src/pages/UKMapViewer.tsx",
                "frontend/src/pages/DataCoverage.tsx",
            ],
        },
        {
            "title": "How the viewer is assembled",
            "body": """
1. **The pipelines write the building payloads** — Sweden's `buildings.json`,
   the UK's per-district files plus `cities.json` (see **3. Pipelines**).
2. **`build.py` assembles one viewer per country from one template.** It reads
   `viewer/index.html` and `viewer/styles/main.css`, copies the viewer scripts
   to `assets/viewer/js/`, and writes three files per country:
   `assets/<country>_3d.html` (the page), `_3d.css`, and `_3d.meta.js`. The
   meta file carries the **profile** — the cities, where the camera starts,
   which payload to load, the construction eras and their colours — and, for
   Sweden, the legend's summary figures. Options: `--se` or `--uk` for one
   country, `--skip-pipeline` to re-render the page without re-running the
   Swedish data pipeline.
3. **In the browser, `bootstrap.js` boots the twin.** It reads the profile,
   picks the city (`?city=`), takes an optional focus area from Step 2
   (`?bbox=`), downloads the payload — about 57 MB for Gothenburg, cached
   between reloads of the same build — and then loads about twenty viewer
   scripts in a fixed order. The Swedish-only scripts are skipped for the UK.
   The scripts share global variables rather than importing one another,
   which is why the order matters.
4. **It is served three ways, all from `assets/`:** by the backend
   (`/gothenburg_3d.html`, `/uk_3d.html`) in production, by the Vite dev server
   in development (it streams the same files), and on its own by `launch.py`
   at port 8765.

> **The served copy is ahead of the source.** `build.py` copies only 17
> scripts; the newer ones — vegetation, roofs, street network, sun hours,
> incident radiation, thermal comfort, display controls — exist only in
> `assets/viewer/js/`, and the served `bootstrap.js` loads a script the source
> copy does not. Running `build.py` now would overwrite the served bootstrap
> with the older source and drop those layers. Edit both copies until
> `viewer/` is brought level.
""",
            "files": [
                "build.py",
                "viewer/index.html",
                "viewer/styles/main.css",
                "assets/viewer/js/bootstrap.js",
                "viewer/js/bootstrap.js",
                "launch.py",
                "frontend/vite.config.ts",
            ],
        },
        {
            "title": "How about 93,000 buildings are drawn",
            "body": """
1. **Each record becomes an extruded outline** — the footprint raised to the
   building's height (at least 3 m; floors × 3 m or 6 m if the height is
   missing), coloured by the chosen mode: **use type**, **energy class** or
   **construction era**. Buildings with no value for that mode are grey.
2. **Batched, not one object per building.** The outlines are grouped into
   batches of 12,000 and handed to the graphics card as a few large Cesium
   primitives, tessellated in background workers. One Cesium entity per
   building — the obvious way — exhausted the browser's memory at this size
   and crashed the tab. Each outline keeps its record's index, so a click still
   resolves to the right building.
3. **Nearest first.** Batches are ordered by distance from the camera, so the
   district on screen fills in almost at once and the edges stream in behind a
   usable map.
4. **Standing on the real ground.** Flat basemaps are drawn at height 0. On the
   photorealistic basemap (or with OSM Buildings) the viewer samples the real
   ground height from the 3D tiles into a grid and lifts each building onto
   it; if that sampling is slow it retries in the background and only redraws
   if the buildings would move by more than half a metre.
5. **Photorealistic mode.** Over Google's textured city the coloured boxes
   would hide the very façades you came to look at, so they are hidden, and a
   click is turned into a building through a grid index of the footprints.

Changing the colour mode or the ground alignment redraws the whole city from
the payload — there is no partial update.
""",
            "files": ["assets/viewer/js/cesium.js", "assets/viewer/js/legend.js", "assets/viewer/js/ui.js"],
        },
        {
            "title": "Layers — what sits on the twin",
            "body": """
| Layer | Data | Script | Where |
|---|---|---|---|
| Basemaps: light, dark | CARTO tiles, keyed through the backend (`/api/viewer-config`); Esri Canvas if no key | `assets/viewer/js/cesium.js`, `assets/viewer/js/layers.js` | anywhere |
| Basemap: satellite | Esri World Imagery | `assets/viewer/js/cesium.js` | anywhere |
| Basemap: terrain | LiDAR shaded relief (`assets/terrain_hillshade.png`) | `assets/viewer/js/cesium.js` | Gothenburg |
| Basemap: photorealistic 3D | Google 3D tiles through Cesium ion, loaded on demand | `assets/viewer/js/cesium.js` | anywhere |
| Context massing | Cesium OSM Buildings | `assets/viewer/js/cesium.js` | on by default in the UK |
| Trees and shrubs | `assets/dtcc_vegetation.json` — drawn only near the camera | `assets/viewer/js/vegetation.js` | Gothenburg |
| Pitched roofs | `assets/roofs_gothenburg.json` — a gable cap between eave and ridge | `assets/viewer/js/roofs.js` | Gothenburg |
| Roads, street network | OpenStreetMap through the backend (`/api/osm/roads`) | `assets/viewer/js/roads.js`, `assets/viewer/js/street_network.js` | anywhere |
| Green index, green accessibility, heat-island proxy | OpenStreetMap green areas | `assets/viewer/js/urban_analysis.js` | anywhere; heat island Sweden only |
| Income and demographics | SCB, fetched per layer | `assets/viewer/js/scb_layers.js` | Sweden |
| Public transport: stops, live vehicles, disruptions, parking | Västtrafik | `assets/viewer/js/vasttrafik.js`, `assets/viewer/js/trafik_canvas.js` | Gothenburg |
| Traffic cameras, flow, road conditions | Trafikverket | `assets/viewer/js/trafikverket.js` | Sweden |
| Legend and best/worst cards | computed live from the loaded buildings | `assets/viewer/js/legend.js` | anywhere |
| Address search | Nominatim | `assets/viewer/js/search.js` | anywhere |

The text behind every (i) button is kept in one file,
`assets/viewer/js/layer_docs.js`. The full layer list is on
**12. Viewer Layers & Visualisation**.
""",
            "files": ["assets/viewer/js/layers.js", "assets/viewer/js/layer_docs.js", "assets/sidebar-theme.css"],
        },
        {
            "title": "Analyses — how they plug into the twin",
            "body": """
Every analysis follows the same pattern: **select a building or click a
point → the viewer sends its location (and the building's record) to a
backend endpoint → the backend computes → the result is drawn back into the
scene or the building's info card → some results are saved to that building.**
When a building is clicked, the viewer first looks for saved results within
25 m, so earlier analyses reappear without re-running.

| Analysis | Trigger | Backend | Shown as | Saved to |
|---|---|---|---|---|
| Energy simulation (EnergyPlus shoebox through EPSM) | selected building | `/api/simulation-submit`, `-status`, `-results` | demand by end use in the info card | `data/simulation_database.sqlite3` — the same store Step 4's calculator reads |
| Window-to-wall ratio (vision model on a façade view) | façade inspector: fly to a façade, crop it | `/api/estimate-wwr`, `/api/wwr-save` | ratio per façade | `data/wwr_database.json` |
| Façade defects (crack detector) | façade inspector | `/api/facade-detect` (on-host model service) | boxes on the façade image | — |
| Rooftop solar PV | selected building | `/api/pvgis` → PVGIS 5.2 | yield in the info card | `data/pvgis_database.json`, when the user saves |
| Direct sun hours | click a point | `/api/analysis/sun-hours` | coloured ground disc; a slider scrubs the day | — |
| Incident solar radiation | click a point | `/api/analysis/incident-radiation` | ground disc in kWh/m², per season | — |
| Outdoor thermal comfort (UTCI) | click a point | `/api/analysis/thermal-comfort` | ground disc, per hour or share of a season | — |

Methods in full: **6. Energy Simulation — EPSM & IDF**, **10. AI, ML & Vision Models**,
**11. Climate & Environmental Analysis**.
""",
            "files": [
                "assets/viewer/js/energy_sim.js",
                "assets/viewer/js/facade_inspector.js",
                "assets/viewer/js/pvgis.js",
                "assets/viewer/js/sunhours.js",
                "assets/viewer/js/incident.js",
                "assets/viewer/js/comfort.js",
                "backend/simdb.py",
                "backend/sun_hours.py",
                "backend/incident_radiation.py",
                "backend/thermal_comfort.py",
                "data/wwr_database.json",
            ],
        },
        {
            "title": "How the twin connects to the planning steps",
            "body": """
1. **Step 1** — the user picks buildings, a district or an area on the 2D map;
   the boundary check keeps the choice inside Gothenburg.
2. **Step 2** — the "3D view" button for the selection opens the Gothenburg
   twin framed on it (`?bbox=`). The button on a single building's card passes
   its position as `?lat=&lon=&zoom=`, which the viewer **does not read** — it
   opens at the city's default view instead (a bug).
3. **Steps 3–4** — simulations run for a building from the viewer and from the
   renovation calculator land in the same simulation store, so either side
   finds the other's results.

The UK twin is opened from its own viewer page; the steps' 3D buttons point at
the Gothenburg viewer.
""",
            "files": ["frontend/src/components/LocationMap.tsx", "frontend/src/pages/DataCoverage.tsx", "backend/simdb.py"],
        },
        {
            "title": "Written but not connected, and limitations",
            "body": """
**Built but never loaded** — these files exist in `assets/viewer/js/` but no
viewer loads them:

| Script | What it would add |
|---|---|
| `assets/viewer/js/market.js` | the Booli sales and Boplats rents overlay |
| `assets/viewer/js/space_syntax.js` | street-network centrality (backend: `backend/space_syntax.py`) |
| `assets/viewer/js/country_profile.js` | a country insights panel |
| `assets/viewer/js/facade_comparison.js` | comparing façades within and across buildings |

The **Malmö** payload (`assets/buildings_malmo.json`, no energy data) is not
loaded by any viewer either.

**Limitations**

- The LiDAR layers, live transport and statistics exist for Gothenburg or
  Sweden only; the UK twin is buildings, streets and analyses.
- The served viewer is ahead of its source (see *How the viewer is assembled*).
- The Cesium ion access token is written into `assets/viewer/js/cesium.js`.
  A browser token is visible to anyone who opens the viewer by design, so it
  should be restricted to the tool's web address in the Cesium ion account.
- Every colour or alignment change redraws the whole city.
- Step 2's single-building "3D view" link does not focus on the building (see
  above).
""",
            "files": [
                "assets/viewer/js/market.js",
                "assets/viewer/js/space_syntax.js",
                "assets/viewer/js/country_profile.js",
                "assets/viewer/js/facade_comparison.js",
                "backend/space_syntax.py",
            ],
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
SHOEBOX_IDF = {
    "number": 6,
    "title": "Energy Simulation — EPSM & IDF",
    "nav_title": "Energy simulation (EPSM)",
    "stage": "method",
    "purpose": """
How a building in the tool becomes an EnergyPlus simulation: **what EPSM is**,
**how the tool is connected to it**, how an **IDF** (EnergyPlus input file) is
generated for each building — including with the **new materials of a
renovation package** — sent to EPSM and the results brought back, how the
results are stored and reused, **where every file is**, and the known gaps.
""",
    "overview": {
        "title": "The round trip",
        "subtitle": "Every simulation in the tool follows these five steps.",
        "items": [
            ("Choose", "A building in the 3D viewer, the baseline list in Step 3, or a renovation package in Step 4."),
            ("Build the IDF", "Our backend writes one shoebox IDF per building from its record — and, for a package, the package's new U-values."),
            ("Send", "The IDFs and the city's weather file are uploaded to EPSM in one request."),
            ("Simulate", "EPSM queues the runs and starts EnergyPlus 23.2 for each building."),
            ("Bring back", "Our backend fetches the results, corrects the per-m² figures and stores them per building and package."),
        ],
    },
    "sections": [
        {
            "title": "What EPSM is",
            "body": """
**EPSM — Energy Performance Simulation Manager** — is an open-source web
service developed at Chalmers (Sanjay Somanath, lead developer; Alexander
Hollberg, principal investigator — see **17. Project Team & Credits**). It
takes EnergyPlus input files and a weather file over an HTTP API, queues them,
runs EnergyPlus, and turns EnergyPlus's output into energy-use tables per end
use. Source: <https://github.com/snjsomnath/epsm>.

The tool uses EPSM **only as a local simulation engine**: its own web
interface and web server are left out, and nobody opens it directly. It runs
as four containers from `docker-compose.epsm.yml`:

| Container | Image | Role |
|---|---|---|
| `epsm_backend` | `ghcr.io/snjsomnath/epsm-backend:latest` | EPSM's API (Django): receives runs, reports status, serves results — on port **8010** of this computer |
| `epsm_worker` | the same image, running Celery | takes runs off the queue (two at a time) and starts EnergyPlus |
| `epsm_db` | `postgres:15-alpine` | EPSM's own records of runs and results |
| `epsm_redis` | `redis:7-alpine` | the job queue between the API and the worker |
| *(one per run)* | `nrel/energyplus:23.2.0` | EnergyPlus itself — the worker starts it as a separate container through the Docker socket |

EPSM is the physics engine; everything that decides *what* is simulated — the
geometry, the U-values, the assumptions — is ours and lives in `tools/idf/`.
""",
            "files": ["docker-compose.epsm.yml"],
        },
        {
            "title": "How the tool is connected to EPSM",
            "body": """
**The browser never talks to EPSM.** The viewer and the wizard call our own
backend, and only the backend calls EPSM, at `EPSM_BASE_URL`
(`http://localhost:8010` by default; `http://host.docker.internal:8010` when
our backend itself runs in Docker).

| Our backend route | Called by | What it does |
|---|---|---|
| `/api/simulation-submit` | the 3D viewer (one building) | builds one IDF and submits it |
| `/api/simulation-batch-submit` | Step 3 baseline, Step 4 packages, the AI assistant's recommendation check | builds one IDF per building and submits them all in **one** request |
| `/api/simulation-status/{id}`, `/api/simulation-batch-status/{id}` | the pollers (every 3–4 s) | ask EPSM for progress; when a run finishes, fetch and store its results |
| `/api/simulation-results/{id}`, `/api/simulation-timeseries/{id}` | result views | stored results; hourly profiles, aggregated |
| `/api/simulation-lookup`, `-lookup-all`, `/api/simulation-database` | viewer, Step 4 | find stored runs within 25 m of a building |

The EPSM API calls behind them:

| EPSM endpoint | Used for |
|---|---|
| `POST /api/simulation/run/` | upload `idf_files` (one or many) plus `weather_file`; for a batch, `parallel=true` with up to 8 workers |
| `GET /api/simulation/{id}/status/` | queued / running / completed / failed, with progress |
| `GET /api/simulation/{id}/results/` | one building's results |
| `GET /api/simulation/{id}/parallel-results/` | a batch's results, each tagged with its position (`idf_idx`) so it can be matched back to its building |

**Starting it:** Docker Desktop must be running, then
`docker compose -f docker-compose.epsm.yml up -d`. When simulations fail, a
stopped Docker Desktop has been the cause every time so far.

**Notes from the setup:** the two EPSM services run as root so they can start
EnergyPlus containers through Docker Desktop's socket on Windows; the
database is a stock Postgres (EPSM migrates its own schema on start-up); the
passwords in the compose file are local-development values, not for a
server. `docker ps` shows the worker as *unhealthy* — a false alarm: it
inherits the API's web health check, which a worker does not answer, and its
log shows runs completing normally.
""",
            "files": ["backend/main.py", "docker-compose.epsm.yml", "frontend/src/api/client.ts"],
        },
        {
            "title": "Step by step: from a building to an IDF",
            "body": """
Done by `build_shoebox_idf()` in `tools/idf/generate_idf.py`, once per
building per run:

1. **Find the building's real outline.** The viewer sends the whole record;
   the wizard sends only a position, and the backend takes the nearest
   building with geometry within 150 m in that city's payload — geometry is
   never trusted from the browser.
2. **Pick the weather file** for the city: Gothenburg-Landvetter TMYx
   2011–2025; London City for the four London districts; Doncaster-Sheffield
   for Rotherham (all in `data/epw/`).
3. **Geometry — the shoebox.** The footprint is projected from longitude and
   latitude into local metres and extruded to the building's full height as
   **one thermal zone**: a roof, a ground floor, and one wall per footprint
   edge (edges shorter than 0.3 m are skipped). Orientation and envelope areas
   are real; the interior is not subdivided.
4. **Windows.** One window per wall at the window-to-wall ratio: the ratio the
   façade inspector measured for that building, if one was saved; otherwise a
   default by use — 15% houses, 20% flats, 30% commercial, 25% public, 8%
   industry and outbuildings.
5. **Envelope.** U-values for wall, roof, window and floor, in this order: the
   **renovation package's value** if one is given → the building's **TABULA**
   value → the **defaults** (wall 0.40, roof 0.30, window 1.80, floor
   0.40 W/m²K). Each opaque element becomes **one equivalent layer** whose
   thermal resistance is R = 1/U − 0.13 − 0.04 m²K/W (the inside and outside
   surface films are taken out, because EnergyPlus adds its own); the floor on
   the ground only loses the inside film. Windows are a simple glazing system
   with that U-value and a solar heat gain coefficient of 0.60.
6. **People, lights and equipment** by use type, scaled to the **total** floor
   area of all storeys, with simple daily schedules (residential, commercial,
   other).
7. **Heating and cooling** to 21 °C and 25 °C all year by an *ideal loads*
   system — a stand-in that exactly meets the demand, with no real boiler or
   heat pump — and infiltration of 0.5 air changes per hour.
8. **Hot water** — see below.
9. **Outputs.** The list of output variables is copied verbatim from EPSM's
   own test building, because EPSM's results parser looks for those exact
   names; plus the SQLite and summary-table outputs.

The IDF starts with a comment block (from `tools/idf/templates/shoebox.idf.j2`)
recording the building, floors, floor area, WWR, the U-values and the
hot-water intensity used — so an IDF found later still says what went into it.
""",
            "files": [
                "tools/idf/generate_idf.py",
                "tools/idf/geometry.py",
                "tools/idf/defaults.py",
                "tools/idf/templates/shoebox.idf.j2",
                "data/epw",
            ],
        },
        {
            "title": "New materials: how a renovation package becomes a new IDF",
            "body": """
This is the loop that lets the tool test a renovation: the chosen materials
are turned into U-values, a new IDF is generated for every building with those
U-values, and the new IDFs go back to EPSM.

**a) The user chooses materials in Step 4** (Sweden), per component — walls,
roof, windows, floor, or the new-extension variants:

- **a catalogue assembly** from Wikells, which carries its own U-value
  (`frontend/src/config/wikellsData.ts`), or
- **an assembly built layer by layer** in the assembly builder: each layer is
  a material with a thickness and a design conductivity λ (EN ISO 10456 /
  Swedish BBR values, `frontend/src/config/assemblyLayers.ts`). The U-value is
  computed from the stack, **U = 1 / (Rsi + Rse + Σ d/λ)** per EN ISO 6946,
  with the parallel-path correction where studs bridge the insulation. A
  built-up U-value **replaces** the catalogue value.

**b) The package becomes U-value overrides.** Each component's U-value is
mapped to one of `u_wall_override`, `u_roof_override`, `u_win_override`,
`u_floor_override` (`overridesFromSeSelections` in
`frontend/src/pages/RenovationSimulator.tsx`).

**c) One batch per package.** The package is submitted with its own
`package_id`, the same list of buildings as the baseline, and its overrides.
The backend regenerates **every building's IDF** with the overrides replacing
the baseline U-values — they never add to them, so an uninsulated choice with
a higher U-value than the building has today makes the energy use go up, as
it should. The results table shows the U-values each package applied.

**d) Compared against the baseline.** Step 3 runs the same buildings once with
`package_id = baseline` and no overrides; every package result is stored under
its own id, so each building has a baseline and one row per package.

**What reaches EnergyPlus is the U-value, not the layers.** The IDF represents
the whole new assembly as one equivalent layer with the right U-value. The
layers' order, thermal mass and moisture behaviour are therefore not
simulated — a steady-state screening, not a hygrothermal model.

**United Kingdom:** there is no layer picking; the overrides come from the
TABULA England refurbishment levels (*standard* and *ambitious*) for wall,
roof and window (`frontend/public/uk/tabula_gb.json`).

**AI assistant:** when it recommends a retrofit it runs one EPSM check of its
best option through the same batch route (`package_id = recommend`).
""",
            "files": [
                "frontend/src/pages/RenovationSimulator.tsx",
                "frontend/src/components/AssemblyBuilder.tsx",
                "frontend/src/config/assemblyLayers.ts",
                "frontend/src/config/wikellsData.ts",
                "frontend/src/pages/BaselineSetup.tsx",
                "frontend/public/uk/tabula_gb.json",
            ],
        },
        {
            "title": "What comes back, and how it is stored",
            "body": """
1. **EPSM returns** energy per end use — heating, cooling, lighting,
   equipment, water systems — plus the hourly traces behind them.
2. **Per-m² figures are recomputed.** EPSM divides by the zone's floor, which
   for a one-zone shoebox is only the **footprint**; the backend divides by the
   **total floor area** (floors × footprint, or the certificate's area). For a
   20-storey building that is the difference between 948 and 47 kWh/m²·yr.
3. **Stored** per building and package in `data/simulation_database.sqlite3`
   through `backend/simdb.py` (SQLite in WAL mode, so a batch finishing all at
   once cannot lose records). The browser only receives the summary figures;
   hourly profiles are served aggregated.

**Reuse.** The viewer and Step 4 look for stored runs within 25 m of a building
before running anything, and Step 4 compares every package against the
building's already-simulated baseline rather than re-running it — which is
what makes the wizard feel instant.

**The store on 2026-09-14:** 2,053 runs since 2026-07-15 — 1,904 completed and
149 still marked *queued* (never reconciled) — of which 724 baselines and
1,329 package runs, across 253 packages and 353 batches. The file is 1.95 GB,
almost all of it the raw hourly traces; the summary figures take 0.6 MB.
""",
            "files": ["backend/simdb.py", "data/simulation_database.sqlite3"],
        },
        {
            "title": "Where the files are",
            "body": """
| What | Where |
|---|---|
| The IDF generator | `tools/idf/generate_idf.py` |
| Footprint projection and surface geometry | `tools/idf/geometry.py` |
| Every default and assumption (U-values, WWR, gains, setpoints, hot water, outputs) | `tools/idf/defaults.py` |
| The IDF's header comment | `tools/idf/templates/shoebox.idf.j2` |
| Weather files | `data/epw/` |
| Our routes and the EPSM client | `backend/main.py` — the section "Energy simulation (EPSM)" |
| The results store | `backend/simdb.py` → `data/simulation_database.sqlite3` |
| The EPSM containers | `docker-compose.epsm.yml` |
| Step 3 baseline run | `frontend/src/pages/BaselineSetup.tsx` |
| Step 4 packages and overrides | `frontend/src/pages/RenovationSimulator.tsx` |
| Layer-by-layer assemblies | `frontend/src/components/AssemblyBuilder.tsx`, `frontend/src/config/assemblyLayers.ts` |
| Single-building run in the viewer | `assets/viewer/js/energy_sim.js` |
| **The generated IDFs** | **not in the repository** — they are built in memory. EPSM keeps each run's IDFs and weather file in its Docker volume `epsm_media`, under `/app/media/simulation_files/<run id>/` (411 runs, 706 MB on 2026-09-14) |
| EPSM's own run records | Postgres, Docker volume `epsm_pgdata` |

To look at an IDF that was actually simulated, copy it out of the container:

```bash
docker exec epsm_backend ls -t /app/media/simulation_files | head
docker cp epsm_backend:/app/media/simulation_files/<run id>/building_0.idf .
```
""",
            "files": ["tools/idf/generate_idf.py", "assets/viewer/js/energy_sim.js", "backend/simdb.py"],
        },
        {
            "title": "Domestic hot water",
            "body": """
Hot water is a stand-alone water heater (`WaterHeater:Mixed`) on district
heating, drawing a daily profile sized so the year adds up to a **Sveby**
standard intensity: 25 kWh/m² for dwellings (Göteborg's 72,133 declared
hot-water figures have a median of 23.6), 10 for schools and care, 2 for
offices and industry, 0 for outbuildings. EPSM reports it as *Water Systems*.

EnergyPlus does not predict hot-water use here — it plays back the figure it
is given. Its purpose is that the tool's totals cover the same end uses as an
energy declaration.

> **Comparability warning.** Runs made before hot water was added contain none,
> so they are **not comparable** with later runs. Check the run date before
> placing two figures side by side.
""",
            "files": ["tools/idf/defaults.py"],
        },
        {
            "title": "Known gap — cooling reads 0",
            "body": """
EPSM's end-use table carries **no district-cooling column**. The ideal-loads
system's cooling is therefore reported as **0** in every total, even though
the EnergyPlus output shows it is not zero. Any cooling-inclusive figure from
this tool is currently understated. See **16. Known Limitations**.
""",
        },
        {
            "title": "Limitations",
            "body": """
- **One zone for the whole building** — no floor-by-floor or room-level
  temperatures, and no shading from neighbouring buildings (only the
  building's own surfaces are in the IDF).
- **U-values only** — no thermal mass, layer order or moisture; renovation
  materials enter as their U-value.
- **Demand, not delivered energy** — the ideal-loads system meets the load
  exactly; the heating system's efficiency is handled elsewhere (Step 4's
  heating-system comparison), not in EnergyPlus.
- **Constant setpoints and simple schedules** — 21 °C / 25 °C all year.
- **Cooling reads 0** in every total — see *Known gap — cooling reads 0*.
- **UK buildings use Swedish assumptions** for hot water and internal gains.
- **EPSM is pulled as `latest`**, not a fixed version, so a new EPSM release
  could change results without any change on our side.
- **149 runs are stuck as *queued*** in the store and were never reconciled.
- A comment in `backend/main.py` says the London districts use the Heathrow
  weather file; they actually use the London City file.
""",
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
PRIORITISATION = {
    "number": 7,
    "title": "Retrofit Prioritisation",
    "stage": "method",
    "purpose": """
Which buildings to renovate first. In Step 2 every selected building gets a
priority score from 0 to 100, built from four criteria whose relative weights
are set with the **Analytic Hierarchy Process (AHP)**. The top-ranked buildings
(three by default) are carried into the Step 3 baseline and Step 4 renovation
packages. This page covers how each criterion is scaled, how AHP turns
judgements into weights, why this method was adopted, and the research it
rests on.
""",
    "overview": {
        "title": "The method in four steps",
        "subtitle": "A weighted-sum multi-criteria score with AHP weights.",
        "items": [
            ("Score", "Each building gets four sub-scores (0–100) by explicit rules — energy, façade condition, characteristics, renovation potential."),
            ("Weigh", "The user compares the criteria two at a time on Saaty's 1–9 scale; AHP turns the six judgements into four weights and checks their consistency."),
            ("Combine", "Priority = the weighted sum of the sub-scores; a criterion with no data is left out and the others re-weighted."),
            ("Carry forward", "The top N buildings (default 3) go on to simulation in Steps 3–4."),
        ],
    },
    "sections": [
        {
            "title": "Why this method was adopted",
            "body": """
Four properties of the task decided the method; the reasoning is recorded in
the code and the methods notebook (`NOTEBOOK.md`, section 9):

1. **It is a multi-criteria decision.** "Renovate first" has no single
   measure: a building can be energy-poor but in good condition, or in poor
   condition with little energy to save. The criteria pull in different
   directions, so the ranking has to trade them off explicitly — the domain of
   multi-criteria decision analysis (MCDA).
2. **There is no training data.** No dataset records which buildings *should*
   have been renovated first, so a model fitted to outcomes is not possible.
   Each sub-score is therefore an **explicit rule** against a stated
   threshold.
3. **Every rank must be explainable.** In a planning meeting "why is this
   building third?" needs an answer in words. A weighted sum of transparent
   sub-scores gives one: each row shows its sub-scores and the two criteria
   that drive its rank.
4. **The weights are a value judgement, not a fact.** How much energy matters
   against condition is the stakeholders' call. Setting four percentages
   directly is hard to justify; comparing two criteria at a time ("is energy
   more important than façade condition, and by how much?") is a judgement
   people can make and defend. **AHP** turns those pairwise judgements into
   weights and — unlike typing weights in — **tests whether the judgements
   are consistent** with each other.

The maths is light on purpose: it runs in the browser over thousands of
buildings, so changing a judgement re-ranks the list instantly.
""",
            "files": ["frontend/src/utils/retrofitPriority.ts", "NOTEBOOK.md"],
        },
        {
            "title": "The research it rests on",
            "body": """
| Source | What it contributes |
|---|---|
| T. L. Saaty (1977), *A scaling method for priorities in hierarchical structures*, **Journal of Mathematical Psychology** 15(3), 234–281, doi:10.1016/0022-2496(77)90033-5 | The Analytic Hierarchy Process itself: the 1–9 pairwise scale, reciprocal comparison matrices, priority weights, the consistency index and the random index used to judge consistency |
| G. Crawford & C. Williams (1985), *A note on the analysis of subjective judgment matrices*, **Journal of Mathematical Psychology** 29(4), 387–405 | The **geometric-mean** way of deriving the weights from the matrix, which is the one the tool uses |
| A. N. Nielsen, R. L. Jensen, T. S. Larsen & S. B. Nissen (2016), *Early stage decision support for sustainable building renovation — A review*, **Building and Environment** 103, 165–181 | Places **weighting of criteria** among the six areas where decision support is needed in early-stage renovation planning |
| *Multi-criteria decision-making for energy building renovation: comparing exterior wall structures with the AHP, ANP, utility analysis, and TOPSIS*, **Building and Environment** (2025) | A recent example of AHP applied to energy-renovation decisions, compared with other MCDA methods |

> **What is not recorded.** The repository does not say which studies guided
> the choice at the time, nor whose pairwise judgements — if any — produced
> the four weight presets. The table above gives the standard sources for the
> method, not a record of that decision. The thresholds inside the sub-scores
> (next section) are also stated in the code without a cited source.
""",
        },
        {
            "title": "The four criteria and how each is scaled",
            "body": """
Every sub-score is put on the same **0–100 scale, where higher means higher
priority**, so the four can be added. Each also carries a **confidence**
(0–1) that says how much real data it rests on.

**E — Energy performance** *(worse ⇒ higher priority)*

| Data available | Score | Confidence |
|---|---|---|
| Measured energy use *e* (kWh/m²·yr) | linear: 0 at **60**, 100 at **250**, clamped | 1.0 |
| Only the energy class | A 8 · B 22 · C 35 · D 50 · E 66 · F 83 · G 100 | 0.7 |
| Neither | 50 (neutral) | 0 |

The code calls 60 / 250 kWh/m²·yr "a Swedish residential rule of thumb"
(≤ 60 excellent, ≥ 250 very poor).

**F — Façade / envelope condition** *(more severe defects ⇒ higher priority)*

Defects found by the façade inspection (**10. AI, ML & Vision Models**) are
weighted by severity — **crack 1.0, bulge 1.0** (structural), **corrosion
0.75, abscission 0.75**, **leakage 0.6** — and summed into a *load*, which is
passed through a **saturating curve**:

$$F = 100 \\times \\left(1 - e^{-\\text{load}/4}\\right)$$

| Weighted load | 1 | 2 | 4 | 8 | 12 |
|---|---|---|---|---|---|
| F | 22 | 39 | 63 | 86 | 95 |

Saturating, because a handful of severe defects already means "poor", and a
straight count would let a building with more photographs outrank a genuinely
worse one. **F is only scored once a building has been inspected**; until
then it is left out (see *Combining*).

**C — Building characteristics** *(older and larger ⇒ higher priority)*

C = 0.6 × age score + 0.4 × size score.

| Built | before 1945 | 1945–1975 | 1976–1990 | 1991–2005 | 2006 or later | unknown |
|---|---|---|---|---|---|---|
| Age score | 85 | 78 | 55 | 32 | 15 | 50 |

The **size score** is the building's heated area (Atemp, else footprint ×
floors) placed between the smallest (0) and largest (100) building **in the
current selection** — a min–max scaling, not a national percentile, so it
changes when the selection changes. Confidence 0.5 for a known year plus 0.5
for a known area.

**R — Renovation potential** *(more to gain ⇒ higher priority)*

R = weighted mean of whatever is available:

| Part | Scaling | Weight |
|---|---|---|
| Savings headroom | energy use above **70 kWh/m²·yr**, linear 0 → 180 kWh/m² ↦ 0 → 100 | 0.60 |
| Wall poorness | wall U-value, linear **0.15 → 1.0 W/m²K** ↦ 0 → 100 | 0.25 |
| Scale | the size score above | 0.15 |

When only the energy class is known, its letter stands in for the energy use
(A 55 · B 85 · C 105 · D 135 · E 165 · F 200 · G 240 kWh/m²·yr). A building
already close to 70 scores low even if it is large — R measures what is left
to gain, not how bad the building is.
""",
            "files": ["frontend/src/utils/retrofitPriority.ts"],
        },
        {
            "title": "The weights — AHP step by step",
            "body": """
**a) Six pairwise judgements.** For each pair of criteria — E–F, E–C, E–R, F–C,
F–R, C–R — the user moves a slider on **Saaty's scale**: 1 = equally
important, 3 = moderately, 5 = strongly, 7 = very strongly, 9 = extremely
more important, to either side (the slider positions −8 … +8 map to 1/9 … 9).

**b) The comparison matrix.** The judgements fill a 4 × 4 matrix *A* with
$a_{ii} = 1$ and reciprocals below the diagonal ($a_{ji} = 1 / a_{ij}$).

**c) The weights** are the normalised **geometric means** of the rows
(Crawford & Williams 1985):

$$w_k = \\frac{\\left(\\prod_j a_{kj}\\right)^{1/n}}{\\sum_i \\left(\\prod_j a_{ij}\\right)^{1/n}}, \\qquad n = 4$$

For consistent judgements this equals Saaty's principal-eigenvector weights.

**d) The consistency check** (Saaty 1977):

$$\\lambda_{max} \\approx \\frac{1}{n}\\sum_i \\frac{(A w)_i}{w_i}, \\quad CI = \\frac{\\lambda_{max} - n}{n - 1}, \\quad CR = \\frac{CI}{RI}, \\quad RI = 0.90 \\ (n = 4)$$

A consistency ratio **CR ≤ 0.10** is accepted; above that the panel flags the
judgements as inconsistent (for example "E beats F, F beats C, but C beats E").

**Worked example** — energy 3× façade, 5× characteristics, 2× potential;
façade 3× characteristics and equal to potential; potential 3×
characteristics:

| | E | F | C | R | **Weight** |
|---|---|---|---|---|---|
| E | 1 | 3 | 5 | 2 | **48.4%** |
| F | 1/3 | 1 | 3 | 1 | **20.7%** |
| C | 1/5 | 1/3 | 1 | 1/3 | **8.0%** |
| R | 1/2 | 1 | 3 | 1 | **22.9%** |

$\\lambda_{max}$ = 4.034, CI = 0.011, **CR = 0.013** — consistent.

**The default.** AHP is the panel's default mode, and with every slider at
"equal" it gives **25% to each criterion**. The alternative, *direct* mode,
takes weights from sliders or one of four presets:

| Preset (direct mode) | E | F | C | R |
|---|---|---|---|---|
| Balanced | 0.35 | 0.30 | 0.15 | 0.20 |
| Energy-first | 0.55 | 0.15 | 0.10 | 0.20 |
| Condition-first | 0.20 | 0.50 | 0.15 | 0.15 |
| Cost-effectiveness | 0.25 | 0.15 | 0.10 | 0.50 |

Whichever mode is used, the weights are normalised to sum to 1.
""",
            "files": ["frontend/src/utils/retrofitPriority.ts", "frontend/src/components/RetrofitPriorityPanel.tsx"],
        },
        {
            "title": "Combining: the priority score",
            "body": """
$$P = \\sum_{k \\in \\text{available}} \\tilde w_k \\, S_k, \\qquad \\tilde w_k = \\frac{w_k}{\\sum_{j \\in \\text{available}} w_j}$$

- **Only criteria with data count.** Until a building's façade has been
  inspected, F is left out and its weight is spread over E, C and R in
  proportion — with equal weights each of the three then counts 33%. An
  un-inspected building is not assumed to be in good condition, nor in bad.
- **Confidence** of the whole score is the same weighted mean of the
  criterion confidences, shown next to every rank, so a score resting on a
  missing energy figure is visibly weaker than one resting on a measured one.
- **Drivers** — the two criteria that contribute most to a building's score —
  are written next to it in words, e.g. *"Energy performance: 212 kWh/m²·yr"*.
- The list is sorted by P; the **top N** (default 3, adjustable) are flagged
  and carried into Step 3. The full ranking can be exported as CSV.
""",
            "files": ["frontend/src/components/RetrofitPriorityPanel.tsx", "frontend/src/components/MethodEquationsPanel.tsx"],
        },
        {
            "title": "Limitations, and what could be improved",
            "body": """
| Limitation | Improvement |
|---|---|
| The thresholds (60 / 250, 70, 0.15–1.0 W/m²K, the age bands) carry no cited source | anchor them to Boverket's energy requirements and the energy-class definitions, and record the source next to each |
| Swedish energy classes are defined **relative to the new-build requirement** for the building's type, not as fixed kWh, so one kWh figure per letter is an approximation | derive E from the class boundaries of the building's own type |
| Whose judgement produced the presets is not recorded | run an AHP session with the stakeholders, and store the judgements, the date and the CR with the project |
| Size is scaled within the current selection, so the same building's C and R change with the selection | offer a fixed reference (e.g. the city's size distribution) as an option |
| Inspected buildings are ranked on four criteria, un-inspected ones on three | show the inspected / not-inspected status beside the rank (already visible as "—" in the F column) |
| No check of how stable the ranking is to the weights | a sensitivity view: how many ranks change if each weight moves ±10% |
| AHP here combines one person's judgements | for a group, combine individual judgements (e.g. by geometric mean) before deriving the weights |
""",
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
OPTIMISATION = {
    "number": 8,
    "title": "Optimisation Process",
    "stage": "method",
    "purpose": """
How Step 4 finds the renovation packages that trade **life-cycle cost**,
**global warming potential** and **energy demand** best: the source of the
model, the model itself — decision variables, constraints, objectives and every
equation with what it means — how time enters it, the process step by step,
and a worked example.
""",
    "overview": {
        "title": "The optimiser in five steps",
        "subtitle": "Fast physics over every combination; EnergyPlus only for the winners.",
        "items": [
            ("Collect options", "Every saved build-up per envelope component, plus a free \"keep as-built\" option; anything worse than as-built is dropped."),
            ("Anchor", "The part of the energy use a renovation cannot change is derived from the building's own EnergyPlus baseline."),
            ("Score everything", "Every combination is scored for energy, life-cycle cost and carbon over the 30-year study period."),
            ("Keep the Pareto front", "Only packages that no other package beats on all three objectives are kept."),
            ("Validate", "The lowest-energy package on the front runs in EnergyPlus automatically; any other runs with one click."),
        ],
    },
    "sections": [
        {
            "title": "Source of the model",
            "body": """
The optimisation model was developed by **Jenny Enerbäck** and **Ann-Brith
Strömberg** (Chalmers, Mathematical Sciences) for **DT4PED — Digital Twin for
Positive Energy Districts**, Sweden, the project led at Chalmers by **Liane
Thuvander**, which we worked on. This tool uses the model from that same source
and implements it for the renovation packages in Step 4.

Published in: S. Abouebeid, J. Enerbäck, E. Malakhatka, A.-B. Strömberg,
D. Sindelar, M. Mazidi, A. Sridhar, H. Wallbaum & L. Thuvander (2026), *Urban
building energy modelling and multi-objective optimization for PED transition
in an existing neighbourhood in Sweden*, **Energy and Buildings**. The
attribution is also kept in the tool (`frontend/src/config/optimizationAssumptions.ts`,
and the Analysis page).
""",
            "files": ["frontend/src/config/optimizationAssumptions.ts", "frontend/src/pages/AnalysisTools.tsx"],
        },
        {
            "title": "The optimisation model",
            "body": """
A **multi-objective mixed-integer linear model**: choose one renovation option
for every envelope component of a building so as to minimise life-cycle cost,
global warming potential and energy demand at the same time.

**Indices and sets**

| Symbol | Meaning |
|---|---|
| $c \\in \\mathcal{C}$ | envelope components — walls, roof, windows, floor (and the new-extension variants) |
| $o \\in O_c$ | the options for component *c*: the build-ups saved in Step 4, plus **keep as-built** |
| $y = 1, \\dots, N$ | the years of the study period |

**Parameters**

| Symbol | Meaning | Value / source |
|---|---|---|
| $A_c$ | area of component *c* (m²) | from the building's geometry and window-to-wall ratio |
| $A_{floor}$ | heated floor area (m²) | footprint × floors |
| $U_{c,o}$ | U-value of option *o* (W/m²K) | Wikells catalogue, or computed from the layers (EN ISO 6946); keep = the as-built U |
| $C^{inv}_{c,o}$ | investment cost of option *o* over $A_c$ (SEK) | Wikells cost per m² × $A_c$; keep = 0 |
| $G^{emb}_{c,o}$ | embodied carbon of option *o* over $A_c$ (kg CO₂e) | Boverket climate database per m² × $A_c$; keep = 0 |
| $L_{c,o}$ | service life of option *o* (years) | `materialProperties.ts` — used only by the replacement terms, see below |
| *HDD* | heating degree-days (K·day/yr) | 3,300 at base 15.5 °C (Eurostat; Gothenburg estimate, provisional) |
| *p* | energy price (SEK/kWh) | today's day-ahead spot price, zone SE3; 0.8 if the feed is down |
| $f_{CO_2}$ | operational emission factor (kg CO₂e/kWh) | 0.022 — Göteborg Energi district heating 2025 |
| *r* | real discount rate | 3% — EU cost-optimal framework (Delegated Regulation 244/2012) |
| *N* | study period (years) | 30 |
| $E_{base}$ | the building's simulated baseline (kWh/m²·yr) | EnergyPlus baseline from Step 3 |

**Decision variables**

$$x_{c,o} \\in \\{0, 1\\} \\qquad x_{c,o} = 1 \\text{ if option } o \\text{ is chosen for component } c$$

**Constraint — exactly one option per component**

$$\\sum_{o \\in O_c} x_{c,o} = 1 \\qquad \\forall c \\in \\mathcal{C}$$

**Objectives — all three minimised**

$$\\min \\; \\big( \\, C(x), \\; G(x), \\; E(x) \\, \\big)$$

- **C — life-cycle cost** (SEK, present value): investment + discounted
  energy cost over *N* years (+ discounted replacements).
- **G — global warming potential** (kg CO₂e): embodied carbon + operational
  carbon over *N* years (+ embodied carbon of replacements).
- **E — energy demand** (kWh/m²·yr).

The three conflict — the cheapest package saves little energy, and the
insulation that saves the most energy carries the most embodied carbon — so
there is no single optimum. The result is the **Pareto front**: every package
that no other package matches or beats on all three objectives.
""",
        },
        {
            "title": "The equations, and what they mean",
            "body": """
**Eq. 1 — Transmission heat-loss coefficient** — the watts the envelope loses per
degree of temperature difference:

$$H_{tr}(x) = \\sum_{c} \\sum_{o \\in O_c} A_c \\, U_{c,o} \\, x_{c,o} \\qquad [\\text{W/K}]$$

Better insulation → lower U → lower $H_{tr}$.

**Eq. 2 — Degree-hour factor** — turns a W/K loss into kWh per year at this
location:

$$F_{dh} = \\frac{24 \\cdot HDD}{1000} \\qquad [\\text{kWh per (W/K) per year}]$$

*HDD* is the yearly sum of how far the daily mean temperature falls below the
base temperature; 24 turns days into hours, 1000 Wh into kWh. With 3,300
K·day/yr, $F_{dh}$ = **79.2**.

**Eq. 3 — Annual energy use** — a fixed part plus the envelope losses:

$$Q(x) = Q_{fixed} + H_{tr}(x) \\cdot F_{dh} \\qquad [\\text{kWh/yr}]$$

$Q_{fixed}$ is everything an envelope renovation cannot change — hot water,
ventilation, lighting, appliances, and the net effect of solar and internal
gains.

**Eq. 4 — The anchor** — $Q_{fixed}$ is taken from the building's own EnergyPlus
baseline rather than assumed:

$$Q_{fixed} = \\max\\Big(0,\\; E_{base} \\cdot A_{floor} \\; - \\; \\sum_c A_c \\, U_{c,base} \\cdot F_{dh}\\Big)$$

With every component kept as built, equation 3 returns exactly the simulated
baseline, so the fast model and the simulation agree at the starting point and
every saving is measured from a real figure. If the baseline is smaller than
the envelope losses alone imply, the anchor cannot hold, and the optimiser
reports `anchor_ok = false` rather than showing impossible numbers.

**Eq. 5 — Energy objective**

$$E(x) = \\frac{Q(x)}{A_{floor}} \\qquad [\\text{kWh/m}^2\\text{yr}]$$

**Eq. 6 — Cost objective — life-cycle cost** (present value, SEK):

$$C(x) = \\underbrace{\\sum_c \\sum_o C^{inv}_{c,o}\\, x_{c,o}}_{\\text{investment, year 0}} \\; + \\; \\underbrace{\\sum_c \\sum_o \\sum_{k \\ge 1,\\; kL_{c,o} < N} \\frac{C^{inv}_{c,o}\\, x_{c,o}}{(1+r)^{k L_{c,o}}}}_{\\text{replacements}} \\; + \\; \\underbrace{\\sum_{y=1}^{N} \\frac{Q(x)\\, p}{(1+r)^{y}}}_{\\text{energy cost}}$$

The investment is paid today; a replacement is paid in the year the option
reaches the end of its service life, discounted to today; the energy bill is
paid every year and discounted year by year.

**Eq. 7 — Carbon objective — global warming potential** (kg CO₂e):

$$G(x) = \\underbrace{\\sum_c \\sum_o G^{emb}_{c,o}\\, x_{c,o}}_{\\text{embodied, year 0}} \\; + \\; \\underbrace{\\sum_c \\sum_o \\sum_{k \\ge 1,\\; kL_{c,o} < N} G^{emb}_{c,o}\\, x_{c,o}}_{\\text{replacements}} \\; + \\; \\underbrace{\\sum_{y=1}^{N} Q(x)\\, f_{CO_2}}_{\\text{operational}}$$

Carbon is **not discounted**: a kilogram emitted in year 30 warms the climate
as much as one emitted today.

**Eq. 8 — Pareto dominance** — package *a* dominates package *b* when

$$C_a \\le C_b, \\quad G_a \\le G_b, \\quad E_a \\le E_b, \\quad \\text{with at least one strictly smaller.}$$

The Pareto front is every package that no other package dominates.

> **Implemented now:** the investment, energy-cost, embodied and operational
> terms. The **replacement terms** (with the service lives $L_{c,o}$) are part
> of the documented model but are **not yet computed** by `/api/optimize`; the
> service-life table in `materialProperties.ts` is ready for them. With the
> current table and a 30-year study period they would add nothing yet: the
> shortest service lives are 30 years (renders, bitumen roof membranes), so no
> option ends its life *before* year 30. They start to matter with a longer
> study period or shorter-lived options.
""",
            "files": ["backend/main.py", "frontend/src/config/optimizationAssumptions.ts", "frontend/src/config/materialProperties.ts"],
        },
        {
            "title": "Time in the model",
            "body": """
| Aspect | How time is handled |
|---|---|
| **Study period** | *N* = 30 years |
| **Time step** | one year — the model uses the annual energy use *Q(x)*, the same every year |
| **When costs fall** | investment at year 0 (not discounted); energy costs at the end of each year *y* = 1 … 30; replacements in year $kL_{c,o}$ |
| **Discounting** | real rate *r* = 3%, applied to costs only |
| **Annuity factor** | the constant yearly energy cost is discounted in one step: $\\sum_{y=1}^{N} \\frac{p\\,Q}{(1+r)^y} = p\\,Q \\cdot AF$, with $AF = \\sum_{y=1}^{N} (1+r)^{-y}$ = **19.600** for 3% and 30 years — 1 SEK a year for 30 years is worth 19.60 SEK today |
| **Carbon over time** | summed, not discounted: operational carbon = $N \\cdot Q \\cdot f_{CO_2}$ |
| **Energy price over time** | constant at today's spot price; how the choice holds up under low, medium and high future prices is tested afterwards in **9. Decision Analysis under Uncertainty** |
| **Weather** | one typical year (the degree-days, and the TMYx weather file of the EnergyPlus baseline) — no climate change over the 30 years |

**Computation time.** The model is solved exactly by evaluating every
combination. Measured on this computer: about **0.02 s for 10,000
combinations** and **0.2 s at the 100,000-combination cap**, so the curve can
be recomputed live, 0.45 s after any change of material. Validating a package
in EnergyPlus takes much longer — a median of about **12 s** per batch from
submission to result (half of 342 recorded batches took 6–36 s).
""",
        },
        {
            "title": "Step by step — what happens in Step 4",
            "body": """
**a) Options.** The user saves build-ups per component in Step 4. Each carries
a U-value, a cost per m² (Wikells) and an embodied carbon per m² (Boverket's
climate database, through the Wikells-to-Boverket mapping). The optimiser uses
**every** saved build-up of every component.

**b) The building.** It optimises one representative building — the chosen
target, or the first when "all" is selected — with its component areas and
floor area.

**c) The baseline.** It waits until that building's EnergyPlus baseline
(Step 3) has finished, and takes $E_{base}$ from it.

**d) Filter.** A free **keep as-built** option (baseline U, no cost, no carbon)
is added to every component, so a component can be left alone. Any option with
a **higher U-value than as-built** is dropped and listed in
`excluded_options` — the Wikells catalogue mixes complete insulated assemblies
with bare coverings (e.g. a roof sheet on masonite beams, U 3.37), and offering
those as renovations made packages *increase* demand.

**e) Enumerate and score.** Every combination is formed — the product of the
option counts, e.g. 4 wall × 6 roof choices = 24 — up to **100,000**
(`truncated` flags the cap). Each is scored with equations 1–7, and
combinations with identical (cost, carbon, energy) are merged.

**f) Pareto filter.** Points are sorted by cost; a point is kept unless an
already-kept point is at least as good on carbon and energy — a "skyline"
sweep, which avoids comparing every pair.

**g) Present.** The cheapest, lowest-carbon and lowest-energy packages are
tagged. At most 24 front points are returned — the tagged ones plus an even
spread across the rest — with the "do nothing" baseline and a cloud of up to
3,000 evaluated points so the chart can show the front forming. The chart's
axes follow the KPIs chosen in Step 1 (by default cost across, carbon up,
energy as colour); a parallel-coordinates view is optional.

**h) Validate in EnergyPlus.** The **lowest-energy** package on the front is
sent to EPSM automatically as an *"Optimal · …"* package; any other point runs
with a click. Validated packages join the hand-built ones in the Step 4 results
table, then go on to **9. Decision Analysis under Uncertainty** and the Step 5
report. How a package becomes an IDF is on **6. Energy Simulation — EPSM & IDF**.

The AI assistant's `recommend_retrofit` runs the same optimiser for an address
and checks its best-balance pick in EnergyPlus the same way.
""",
            "files": [
                "frontend/src/pages/RenovationSimulator.tsx",
                "frontend/src/components/OptimizerPanel.tsx",
                "frontend/src/components/ParetoChart.tsx",
                "frontend/src/components/ParallelCoordinates.tsx",
                "frontend/src/components/OptimizationAssumptions.tsx",
            ],
        },
        {
            "title": "A worked example",
            "body": """
*Illustrative inputs* (made-up areas, prices and carbon — not Wikells or
Boverket values), with the tool's real parameters and formulas: a 1,000 m²
building with a simulated baseline of 150 kWh/m²·yr; walls 800 m² at U 0.40,
roof 250 m² at U 0.30, windows 160 m² at U 1.80.

**Anchor:** $H_{tr,base}$ = 800·0.40 + 250·0.30 + 160·1.80 = **683 W/K**;
envelope losses = 683 × 79.2 = **54,094 kWh/yr**; baseline = 150 × 1,000 =
**150,000 kWh/yr**; so $Q_{fixed}$ = **95,906 kWh/yr** — the part no envelope
measure can touch.

**Options:** walls — EPS 100 mm (U 0.20) or mineral wool 195 mm (U 0.15); roof
— loft wool 400 mm (U 0.10); windows — triple glazing (U 0.90); each plus
*keep*: 3 × 2 × 2 = **12 combinations**, of which **10 are on the front**.

| Package | Energy (kWh/m²·yr) | Life-cycle cost (MSEK) | Carbon (t CO₂e) | On front |
|---|---|---|---|---|
| Keep everything | 150.0 | 2.35 | 99.0 | yes — cheapest |
| Roof only | 146.0 | 2.38 | 97.9 | yes — lowest carbon |
| EPS walls | 137.3 | 2.87 | 105.0 | yes |
| Triple glazing only | 138.6 | 3.21 | 101.1 | **no** — mineral-wool walls beat it on all three |
| Mineral-wool walls + roof | 130.2 | 3.17 | 98.6 | yes |
| Mineral-wool walls + roof + triple glazing | 118.8 | 4.03 | 100.7 | yes — lowest energy |

**What it shows.** With three objectives most packages are on the front: each
is best at *some* trade-off. And because Gothenburg's district heating emits
only 0.022 kg CO₂e/kWh, 30 years of operation (≈ 99 t) is similar in size to
the embodied carbon of a deep renovation — so deep packages save energy but
barely lower, or even raise, total carbon. The front makes that trade-off
visible instead of hiding it in one score.
""",
        },
        {
            "title": "Limitations, and what could be improved",
            "body": """
| Limitation | Improvement |
|---|---|
| The replacement terms are not yet computed (with 30 years and the current service lives of ≥ 30 years they would be zero anyway) | add them using `materialProperties.ts`, so that longer study periods and shorter-lived options are handled |
| One price and one emission factor apply to **all** energy — the electricity spot price and the district-heating factor are applied to heating, hot water, lighting and equipment alike | split *Q* into heat (district-heating price and factor) and electricity (spot price and grid factor) |
| The physics is linear in U: it ignores changes in solar gains, thermal mass and airtightness | mitigated by validating the winners in EnergyPlus; could re-anchor on each validated result |
| One representative building; its winning package is then applied to every targeted building | optimise per building, or per archetype |
| The degree-days figure is marked provisional | use SMHI station data for Gothenburg-Landvetter |
| Constant energy price and a typical weather year for 30 years | price scenarios in **9. Decision Analysis under Uncertainty**; future-climate weather files already exist in `data/epw/` |
| Sweden only — the UK has no real cost or carbon data | a real UK cost and carbon source (see **1. Data Sources**) |
""",
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
DECISION_ANALYSIS = {
    "number": 9,
    "title": "Decision Analysis under Uncertainty",
    "stage": "method",
    "purpose": """
How Step 4 helps choose between renovation packages when the future energy
price — the biggest unknown in whether a renovation pays off — cannot be
predicted. Each package is tested in three price futures; the results form a
**payoff matrix**, which three classic decision rules read in different ways:
**minimax regret**, the **uncertainty range** and the **Hurwicz criterion**.
This page covers the whole process with its equations, sources, code and data,
a worked example, and how **sensitivity analysis** fits in.
""",
    "overview": {
        "title": "The decision analysis in five steps",
        "subtitle": "No forecast needed — the rules work without probabilities.",
        "items": [
            ("Options", "Every renovation package that has an EnergyPlus result, plus \"keep as-built\" as the zero reference."),
            ("Futures", "Three energy-price scenarios: Low, Medium and High (0.5 / 1.0 / 2.0 SEK/kWh by default, editable)."),
            ("Payoff matrix", "The 30-year net present benefit of every package in every future."),
            ("Three rules", "Minimax regret (safety-first), uncertainty range (most stable), Hurwicz (balanced, with an optimism setting α)."),
            ("Decide and report", "The picks are shown side by side and saved to the Step 5 report."),
        ],
    },
    "sections": [
        {
            "title": "Why decision analysis under uncertainty",
            "body": """
Whether a renovation pays back depends above all on what energy will cost over
the next 30 years — and nobody can forecast that, nor put credible
probabilities on it. Decision theory calls this **decision under uncertainty**
(or *ignorance*), as opposed to *risk*, where probabilities are known.

For this situation there are classic rules that rank options **without any
probabilities**, each expressing a different attitude:

- **Minimax regret** — "I don't want to look wrong in hindsight."
- **Uncertainty range** — "I want a result I can rely on."
- **Hurwicz** — "I want to weigh the best and worst case by how optimistic I am."

The tool shows all three on purpose. Where they agree, the choice is robust;
where they disagree is exactly where the decision needs human judgement rather
than an automatic recommendation. The recommendation sentence in the panel
uses minimax regret, the standard choice when the future is genuinely
unknown.
""",
            "files": ["frontend/src/utils/regretAnalysis.ts"],
        },
        {
            "title": "Step by step — the process in Step 4",
            "body": """
**a) Options.** Every renovation package with an EnergyPlus result — built by
hand or picked from the optimiser (**8. Optimisation Process**) — becomes a
row. Its energy $E_i$ is the average of its buildings' simulated
kWh/m²·yr; its investment $I_i$ is the sum of its buildings' costs (Wikells).
**Keep as-built** is added as the reference row. The analysis appears as soon
as one package has a result (it is most useful with several); it is for
Swedish projects.

**b) Futures.** Three energy-price scenarios: **Low 0.5, Medium 1.0, High 2.0
SEK/kWh** by default. The user can change them; today's spot price (zone SE3)
is shown beside them for comparison.

**c) Payoff matrix.** Each package's 30-year net present benefit is computed in
each future (next section).

**d) Decision rules.** From the matrix, each package's worst regret, outcome
spread and Hurwicz score are computed, and each rule picks a package. **Keep
as-built is shown but never picked** — the decision is *which* renovation to
choose, and when renovations do not pay back on energy alone, "do nothing"
would otherwise win every rule and say nothing about the choice.

**e) Presentation.** The table shows the benefits per future (the best package
in each future in green) and each package's worst regret; *Advanced* adds the
outcome spread, the Hurwicz score and the α slider (default 0.5). The picks are
tagged **★ Safety-first** (minimax regret), **★ Balanced choice** (Hurwicz) and
**★ Most stable** (smallest range).

**f) Report.** The whole result is saved and shown in the Step 5 report.
""",
            "files": [
                "frontend/src/pages/RenovationSimulator.tsx",
                "frontend/src/components/DecisionAnalysisPanel.tsx",
                "frontend/src/pages/RenovationReport.tsx",
            ],
        },
        {
            "title": "The payoff matrix — equations",
            "body": """
**Annuity factor** — the present value of 1 SEK a year for *N* years at the
real discount rate *r*:

$$AF = \\sum_{y=1}^{N} \\frac{1}{(1+r)^y} = \\frac{1 - (1+r)^{-N}}{r}$$

With *r* = 3% (EU cost-optimal framework, Delegated Regulation 244/2012) and
*N* = 30 years, **AF = 19.600**.

**Energy saved per year** by package *i*:

$$S_i = \\max\\big(0,\\; E_0 - E_i\\big) \\cdot A_{floor} \\qquad [\\text{kWh/yr}]$$

$E_0$ is the baseline's simulated energy (kWh/m²·yr), $E_i$ the package's, and
$A_{floor}$ the total floor area of the selected buildings (footprint ×
floors). A package that *increases* energy use is counted as saving nothing.

**Payoff — the 30-year net present benefit** of package *i* in price future *s*:

$$B_{i,s} = S_i \\cdot p_s \\cdot AF \\; - \\; I_i \\qquad [\\text{SEK}]$$

The discounted value of 30 years of saved energy at price $p_s$, minus the
investment. $B > 0$: the energy savings repay the investment in that future;
$B < 0$: they do not (deep renovations are also done for the climate target,
comfort and asset value). "Keep as-built" has $B = 0$ in every future.

**The payoff matrix** — one row per package, one column per future:

| | Low ($p_1$) | Medium ($p_2$) | High ($p_3$) |
|---|---|---|---|
| Package 1 | $B_{1,1}$ | $B_{1,2}$ | $B_{1,3}$ |
| Package 2 | $B_{2,1}$ | $B_{2,2}$ | $B_{2,3}$ |
| … | … | … | … |
| Keep as-built | 0 | 0 | 0 |
""",
            "files": ["frontend/src/utils/regretAnalysis.ts", "frontend/src/config/optimizationAssumptions.ts"],
        },
        {
            "title": "Rule 1 — Minimax regret (Savage)",
            "body": """
**Regret** is how much worse a package does than the best package *in that
future* — the money you would regret leaving on the table once you know which
future came true.

$$B^{*}_s = \\max_{i \\in R} B_{i,s} \\qquad \\text{(the best renovation in future } s\\text{)}$$

$$\\text{Regret}_{i,s} = B^{*}_s - B_{i,s} \\;\\ge 0$$

$$MR_i = \\max_s \\, \\text{Regret}_{i,s} \\qquad \\text{(the package's worst regret)}$$

$$\\text{Pick} = \\arg\\min_i \\; MR_i$$

*R* is the set of renovation packages (keep as-built excluded). The pick is the
package whose **worst miss** against the best alternative, in any future, is
smallest: whichever future arrives, it is never far behind. Shown in the panel
as *"Worst miss vs best"* and tagged **★ Safety-first**.

**Use it** when prices cannot be predicted and looking wrong in hindsight is
the main concern. Introduced by L. J. Savage (1951).
""",
        },
        {
            "title": "Rule 2 — Uncertainty range",
            "body": """
$$\\text{Range}_i = \\max_s B_{i,s} - \\min_s B_{i,s}, \\qquad \\text{Pick} = \\arg\\min_i \\; \\text{Range}_i$$

How much a package's benefit swings between the cheap and the expensive future.
A small range means the outcome is **predictable even if prices are not** —
tagged **★ Most stable**, shown as *"Outcome spread"*.

**Use it** when a dependable figure matters more than the highest possible
return — a fixed budget, a business case. **Caution:** stable is not the same
as good; a package can be stable because it saves little in any future. The
range is also the simplest **sensitivity** measure of the payoff to the price
(see below).
""",
        },
        {
            "title": "Rule 3 — The Hurwicz criterion",
            "body": """
$$H_i(\\alpha) = \\alpha \\cdot \\max_s B_{i,s} \\; + \\; (1 - \\alpha) \\cdot \\min_s B_{i,s}, \\qquad \\text{Pick} = \\arg\\max_i \\; H_i(\\alpha)$$

A weighted blend of each package's best and worst outcome. **α is the
decision-maker's optimism**, set with the slider (0 to 1, default 0.5):

| α | Behaviour | Equivalent to |
|---|---|---|
| 0 | looks only at the worst case | Wald's **maximin** — the pure pessimist |
| 0.5 | neutral: best and worst count equally | the default |
| 1 | looks only at the best case | **maximax** — the pure optimist |

Tagged **★ Balanced choice**, shown as *"Balanced score"*. **Use it** when
you have a view on how prices will move. Proposed by L. Hurwicz (1951).
""",
        },
        {
            "title": "A worked example",
            "body": """
*Illustrative packages* (made-up energy and cost), with the tool's formulas and
default prices: 1,000 m², baseline 150 kWh/m²·yr, AF = 19.600, α = 0.5.

| Package | Energy (kWh/m²·yr) | Saving (kWh/yr) | Investment (SEK) |
|---|---|---|---|
| A — light: roof insulation | 140 | 10,000 | 150,000 |
| B — medium: walls + roof | 125 | 25,000 | 500,000 |
| C — deep: walls + roof + windows | 105 | 45,000 | 1,200,000 |

**Payoff matrix** (net present benefit, MSEK) and the three rules:

| Package | Low 0.5 | Medium 1.0 | High 2.0 | Regret L / M / H | Worst regret | Range | Hurwicz (0.5) |
|---|---|---|---|---|---|---|---|
| A | **−0.05** | **0.05** | 0.24 | 0 / 0 / 0.32 | 0.32 | **0.29** ★ | 0.10 |
| B | −0.26 | −0.01 | 0.48 | 0.20 / 0.06 / 0.08 | **0.20** ★ | 0.74 | **0.11** ★ |
| C | −0.76 | −0.32 | **0.56** | 0.71 / 0.36 / 0 | 0.71 | 1.32 | −0.10 |

(Bold in the price columns = the best package in that future.)

**Reading it.** A is best if prices stay low or medium, C only if they go
high. **Minimax regret picks B**: it is never the best, but never far behind
either (worst miss 0.20 MSEK). **The range picks A**: the most predictable
result, but it saves the least. **Hurwicz at α = 0.5 picks B.** Three rules,
two answers — which is itself the finding: the choice between A and B depends
on how much weight the owner gives to the high-price future.
""",
        },
        {
            "title": "Sensitivity analysis — how it fits",
            "body": """
**Sensitivity analysis** asks how much an output changes when an input changes
— which assumptions actually drive the answer (Saltelli et al., 2008). It is
closely tied to decision analysis: the scenarios above *are* a sensitivity
analysis on the energy price.

**Already in the tool**

| What | Sensitivity to | Where |
|---|---|---|
| The three price scenarios, editable | energy price | this panel |
| The *Outcome spread* column | energy price (best − worst) | this panel |
| The α slider | the decision-maker's optimism | this panel |
| The live Pareto front | material choices | **8. Optimisation Process** |

**Break-even points — derived from the payoff equation.** Because $B_{i,s}$ is
linear in the price and α, the exact points where a conclusion flips can be
written down. They are **not yet shown in the tool**; the values below are for
the worked example.

- **Payback price** — the price above which package *i* repays its investment:

$$p^{*}_i = \\frac{I_i}{S_i \\cdot AF}$$

  A **0.77**, B **1.02**, C **1.36** SEK/kWh.

- **Swap price** — the price at which packages *i* and *j* give the same
  benefit:

$$p^{*}_{ij} = \\frac{I_i - I_j}{(S_i - S_j) \\cdot AF}$$

  A and B swap at **1.19** SEK/kWh; B and C at **1.79**: below 1.19 A is best,
  between 1.19 and 1.79 B, above 1.79 C.

- **Switching α** — where two Hurwicz scores are equal
  ($\\text{best}$, $\\text{worst}$ = each package's max and min benefit):

$$\\alpha^{*}_{ij} = \\frac{\\text{worst}_j - \\text{worst}_i}{(\\text{best}_i - \\text{worst}_i) - (\\text{best}_j - \\text{worst}_j)}$$

  Hurwicz picks A for α < 0.46, B for 0.46 – 0.86, C above 0.86.

- **Discount rate** — enters only through the annuity factor: *AF* = 25.81 at
  1%, 19.60 at 3%, 15.37 at 5%, 12.41 at 7%. In the example the minimax-regret
  pick stays B at 1–3% but becomes A at 5% and above: the higher the discount
  rate, the less future savings are worth, which favours the cheap package.

**Exists but not connected**

- `frontend/src/config/sensitivityData.ts` holds pre-computed **one-at-a-time
  (OAT)** results for a Swedish multi-family archetype (baseline heating
  226,335 kWh/yr) — each input varied alone, the others held at baseline:

| Input varied | Spread of heating demand (kWh/yr) | Share of baseline |
|---|---|---|
| Roof shape and angle | 211,553 | 93% |
| Infiltration rate | 139,434 | 62% |
| Heating setpoint (19–23 °C) | 120,565 | 53% |
| Construction quality | 78,284 | 35% |
| Number of floors (3–5) | 72,158 | 32% |
| Building length | 63,753 | 28% |
| Building width | 52,824 | 23% |
| Window-to-wall ratio | 30,601 | 14% |
| Glazing quality | 23,350 | 10% |

  They were ported from a file of the earlier Streamlit app that no longer
  exists, so how they were produced is not recorded. They are shown only on
  the energy-community / renewable-energy Step 3 page, which is currently
  hidden — **so they never appear**.
- The client has a `sensitivity` call to `/sensitivity/run`, but **the backend
  has no such route**; and the note "Sobol indices will be generated when your
  simulation runs" describes something not implemented.

**What could be added**

| Addition | What it answers |
|---|---|
| Show the payback and swap prices in the panel | "above what price does this package pay off, and when does another one win?" |
| A tornado chart of the payoff: price, discount rate, investment ±20%, energy saving ±10% | which assumption the decision is most sensitive to |
| An α sweep strip | how far the Hurwicz pick holds as optimism changes |
| Re-run the OAT study on the current EnergyPlus model, or a global method (Sobol indices) | which building inputs drive the simulated energy |
| Sensitivity of the prioritisation ranking to its weights | links to **7. Retrofit Prioritisation** |
""",
            "files": [
                "frontend/src/config/sensitivityData.ts",
                "frontend/src/components/panels/SensitivityPanel.tsx",
                "frontend/src/pages/DataAssumptions.tsx",
                "frontend/src/api/client.ts",
            ],
        },
        {
            "title": "Sources",
            "body": """
| Source | Used for |
|---|---|
| A. Wald (1950), *Statistical Decision Functions*, Wiley | the maximin rule (Hurwicz with α = 0) |
| L. J. Savage (1951), *The theory of statistical decision*, **Journal of the American Statistical Association** 46(253), 55–67, doi:10.1080/01621459.1951.10500768 | regret and the minimax-regret rule |
| L. Hurwicz (1951), *Optimality criteria for decision making under ignorance*, Cowles Commission Discussion Paper, Statistics No. 370 | the Hurwicz optimism–pessimism criterion |
| R. D. Luce & H. Raiffa (1957), *Games and Decisions*, Wiley | the standard comparison of these criteria for decisions under uncertainty |
| *Hedging uncertainty in energy efficiency strategies: a minimax regret analysis*, **Operational Research** (Springer), doi:10.1007/s12351-018-0409-y | an application of minimax regret to energy-efficiency choices under scenario uncertainty |
| A. Saltelli et al. (2008), *Global Sensitivity Analysis: The Primer*, Wiley | sensitivity analysis — one-at-a-time and variance-based (Sobol) methods |
| Commission Delegated Regulation (EU) No 244/2012 | the 3% real discount rate |

> **Not recorded:** the source of the default scenario prices (0.5 / 1.0 /
> 2.0 SEK/kWh). They bracket today's spot price but are not tied to a
> published price outlook.
""",
        },
        {
            "title": "Code and data",
            "body": """
| File | What it does |
|---|---|
| `frontend/src/utils/regretAnalysis.ts` | the whole method: annuity factor, payoff matrix, regret, range, Hurwicz, the three picks |
| `frontend/src/components/DecisionAnalysisPanel.tsx` | the panel: price inputs, α slider, table, tags and explanations |
| `frontend/src/pages/RenovationSimulator.tsx` | builds the inputs (packages' energy and cost, floor area, prices, α) and saves the result for the report |
| `frontend/src/pages/RenovationReport.tsx` | shows the saved analysis in the Step 5 report |
| `frontend/src/config/optimizationAssumptions.ts` | the discount rate and the live price feed |

**Data used:** the packages' simulated energy (EnergyPlus through EPSM, stored in
`data/simulation_database.sqlite3`), their investment costs (Wikells), the
buildings' floor areas, and today's spot price (elprisetjustnu.se) for
comparison. No data is stored by the analysis itself beyond the project's
Step 5 report.

**Limitations**

- Only **energy cost and investment** count: no embodied carbon, maintenance,
  replacements, VAT, grid fee or energy tax — the spot price alone.
- One **constant price** per scenario for 30 years; no price path.
- A package's energy is the **plain average** of its buildings' kWh/m², not
  weighted by floor area.
- Three scenarios, **equally unweighted**: no probabilities by design.
- Sweden only.
""",
            "files": ["frontend/src/utils/regretAnalysis.ts", "frontend/src/components/DecisionAnalysisPanel.tsx", "data/simulation_database.sqlite3"],
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
FACADE_ML = {
    "number": 10,
    "title": "AI, ML & Vision Models",
    "stage": "method",
    "purpose": """
The learned components in the tool. Most of this page is about **façade
inspection**: how a trained defect detector and general vision-language models
look at images of a building's façade — photos uploaded in Step 2, or views
captured in the 3D viewer — to find defects and to estimate the window-to-wall
ratio. The last sections cover the data assistant. None of these components is
needed for a simulation, an optimisation or a ranking to complete.
""",
    "overview": {
        "title": "Façade inspection at a glance",
        "subtitle": "One deployed trained model, general vision-language models, and a data assistant.",
        "items": [
            ("Images", "Photos uploaded per façade (N, E, S, W) in Step 2, or views captured from the 3D viewer."),
            ("Defect detector", "A Faster R-CNN (ResNet-50 + FPN) trained on the MBDD2025 building-defect dataset; five defect classes; runs as a local service."),
            ("Second opinion", "A vision-language model marks defects too; its boxes are only added where the detector found nothing."),
            ("Window-to-wall ratio", "A vision-language model estimates the glazed share and counts balconies; saved values feed the energy simulation."),
            ("Data assistant", "A tool-calling language model that answers from the project's own data, in Swedish or English."),
        ],
    },
    "sections": [
        {
            "title": "Every AI and ML component at a glance",
            "body": """
| Component | Kind | Model | Runs | Input → output | Used by | Status |
|---|---|---|---|---|---|---|
| **Defect detector** | trained object detector | Faster R-CNN, ResNet-50 + FPN (41.4 M parameters), fine-tuned on MBDD2025 | locally, service on port 8020 (CPU) | façade image → boxes for crack, leakage, abscission, corrosion, bulge | Step 2 photos, viewer *Defects* → F criterion (**7. Retrofit Prioritisation**) | deployed; service must be started |
| **Defect second opinion** | general vision-language model | Claude Sonnet 4.5, else GPT-4o | Anthropic / OpenAI API | façade image → boxes + note | Step 2 *AI assist* | deployed |
| **Window-to-wall estimate** | general vision-language model | Claude Sonnet 4.5, else GPT-4.1, else a rule | Anthropic / OpenAI API | façade view + building facts → WWR %, balconies | viewer façade inspector → energy simulation | deployed |
| **Data assistant** | tool-calling language model | GPT-4o, else Claude Sonnet 4.5 | OpenAI / Anthropic API | question → tool calls → answer | landing-page chat | deployed |
| **Window/wall segmentation** | trained segmentation model | DeepLabv3, ResNet-50 (42.1 M parameters), trained on IRFS | — | façade photo → per-pixel wall / window / door / … → WWR | nothing yet | trained, **not deployed** |
| **Thermal defect segmentation** | trained segmentation model | small U-Net, RGB + infrared input (7.8 M parameters), trained on BFDD | — | colour + thermal image pair → per-pixel defect mask | nothing yet | trained, **did not learn**, not deployed |

The three trained models were built in the separate ML project
(`C:\\Users\\saraabo\\Desktop\\ML`) on Chalmers' Vera cluster; only the defect
detector is wired into the tool.
""",
        },
        {
            "title": "Where the images come from",
            "body": """
| Source | How the image is made | Where the result goes |
|---|---|---|
| **Step 2 photo upload** | The user drops photos into four façade slots per building (north, east, south, west). Large photos are scaled to at most 1,280 px on the longest side. A sensitivity setting chooses the detector's threshold: high 0.30, **medium 0.45 (default)**, low 0.60. | defect boxes drawn on the photo; the annotated photo is stored in `data/facade_images/` for the Step 5 report; a per-building summary feeds the **F** criterion of **7. Retrofit Prioritisation** |
| **3D viewer — façade inspector** | For the selected building the camera flies to each façade, far enough back to fit the building's height (+10%) and width, at mid-height, looking straight at the wall. *Capture all* grabs the four views; *Draw & capture* lets the user drag a crop box. The selection tint and outline are hidden during the grab so they cannot skew the model. | window-to-wall ratio and balconies (saved to `data/wwr_database.json`); defect boxes on the captured view |
| **Google Street View** (`/api/streetview/facade`) | The backend looks for the nearest panorama on the right side of the façade, re-aims at the building from where the car actually drove, and can sweep up to five narrow shots across it. It reports the panorama date and how many **millimetres of wall one pixel covers** — below about 2 mm/px hairline cracks are plausible; at 8 mm/px only staining, spalling and gross cracking survive. | **written but not connected** — no screen calls it yet, and it needs `GOOGLE_MAPS_API_KEY` |

**The viewer image is a render, not a photograph.** On the photorealistic
basemap the capture shows Google's textured 3D mesh — a surface built from
aerial photographs, with smoothed detail; on the flat basemaps it shows the
coloured box. Window estimation works on the mesh; defect detection is far
more reliable on real photographs (Step 2).
""",
            "files": [
                "frontend/src/components/FacadeDefectPanel.tsx",
                "assets/viewer/js/facade_inspector.js",
                "backend/main.py",
            ],
        },
        {
            "title": "The defect detector — the trained model",
            "body": """
**Architecture.** A **Faster R-CNN** object detector with a **ResNet-50**
backbone and a **Feature Pyramid Network (FPN)** — torchvision's
`fasterrcnn_resnet50_fpn`. It works in two stages: a region-proposal network
suggests areas that may contain a defect, then each area is classified and
its box refined. The feature pyramid lets it find both small defects (a
crack) and large ones (a leakage stain) in the same image.

**Transfer learning.** Training started from weights pre-trained on the COCO
image dataset; the classification head was replaced with one for **five
defect classes plus background**.

**Training data — MBDD2025.** A public dataset of building-surface defects
photographed by drones: **14,471 images** (up to 1280 × 720) of six structure
types — steel, reinforced concrete, wood, brick, masonry and brick-concrete —
in urban and rural settings, labelled with boxes for five classes:

| Class | What it means | Severity weight in prioritisation |
|---|---|---|
| `crack` | cracks and fractures in render, masonry or concrete | 1.00 |
| `bulge` | bulging, deformation, detachment of the surface | 1.00 |
| `corrosion` | rust, corroded metal, exposed rebar | 0.75 |
| `abscission` | spalling, flaking, missing render, tiles or brick | 0.75 |
| `leakage` | water staining, damp, efflorescence, biological growth | 0.60 |

**The training run** (in the separate ML project, `C:\\Users\\saraabo\\Desktop\\ML`):

| Setting | Value |
|---|---|
| Split | random 70 / 15 / 15 %, seed 42 → **10,129 training / 2,170 validation / 2,172 test** images |
| Hardware | Chalmers' Vera cluster (C3SE), one NVIDIA A40 GPU |
| Optimiser | AdamW, learning rate 5 × 10⁻⁵, batch size 8, **20 epochs** |
| Model kept | the epoch with the best validation score → `outputs/mbdd2025_pretrained/best.pt` (472 MB, 16 July 2026) |
| Other runs | a baseline trained from scratch (10 epochs), and a "v2" with the FPN-v2 backbone, data augmentation and 30 epochs — neither deployed, and the v2 result is not recorded |

**What "best score 0.77" means.** It is the **mean F1 on the validation set**
at an overlap (IoU) of at least 0.5: a predicted box counts as correct when it
overlaps a labelled box of the same class by 50% or more; precision and recall
are averaged over the five classes and combined into F1. It is **not mAP**,
and **no test-set result or per-class figures were recorded**. The split
shuffles individual images, so near-identical frames from one drone flight can
land in both training and validation, which would flatter the score — the ML
project's own README lists this as a check still to do.

**How it runs.** `tools/ml/facade_detect_service.py` loads the checkpoint (on
CPU) and serves `POST /detect` on port **8020**, returning boxes, labels and
scores above a threshold; start it with `tools/ml/run_facade_service.ps1`. The
backend forwards images to it (`/api/facade-detect`). It is a separate
process so the main backend never has to carry PyTorch.

**Research basis.**

| Source | Used for |
|---|---|
| S. Ren, K. He, R. Girshick & J. Sun (2015), *Faster R-CNN: Towards real-time object detection with region proposal networks*, NeurIPS 28 | the detector architecture |
| T.-Y. Lin, P. Dollár, R. Girshick, K. He, B. Hariharan & S. Belongie (2017), *Feature pyramid networks for object detection*, CVPR | the feature pyramid |
| T.-Y. Lin et al. (2014), *Microsoft COCO: Common objects in context*, ECCV | the pre-trained starting weights |
| *A dataset of building surface defects collected by UAVs for machine learning-based detection*, **Scientific Data** (2025) — <https://www.nature.com/articles/s41597-025-06318-5> | the MBDD2025 training data and its five classes |

**Caveat — the domain gap.** The model learned from real drone photographs.
It has not been tested on the tool's own inputs — phone photos of Gothenburg
façades, or renders of the 3D mesh — and hairline cracks rarely survive in a
render.
""",
            "files": [
                "tools/ml/facade_detect_service.py",
                "tools/ml/run_facade_service.ps1",
                "frontend/src/utils/retrofitPriority.ts",
            ],
        },
        {
            "title": "Inside the defect detector — what happens to an image",
            "body": """
1. **Receive.** The backend forwards the image bytes to the service
   (`POST /detect?threshold=…`); the service decodes it to RGB and scales pixel
   values to 0–1.
2. **Resize and normalise** (inside the model, torchvision's standard
   transform): the image is resized so its shorter side is 800 px (longer side
   at most 1,333 px) and normalised with the ImageNet mean and standard
   deviation the backbone was pre-trained with.
3. **Features.** The ResNet-50 backbone and the feature pyramid produce feature
   maps at five scales, so small cracks and large stains are both visible to
   the next stage.
4. **Region proposals.** A region-proposal network slides anchors of 32–512 px
   (aspect ratios 1:2, 1:1, 2:1) over every scale and keeps the most likely
   object regions (up to 1,000 after non-maximum suppression).
5. **Classify and refine.** Each proposal is pooled to a fixed size, classified
   into background or one of the five defect classes, and its box refined.
6. **Clean up.** Overlapping boxes of the same class are merged by non-maximum
   suppression (IoU 0.5); at most 100 detections per image; the model's own
   floor is a score of 0.05.
7. **Threshold.** The service keeps detections at or above the requested
   threshold — 0.30 / 0.45 / 0.60 from the Step 2 sensitivity setting, 0.50 in
   the viewer — and returns boxes in pixels, labels and scores, highest first.
8. **Into the ranking.** Step 2 counts the boxes per class; weighted by severity
   they become the F criterion of **7. Retrofit Prioritisation**.

Steps 2–6 are torchvision's `fasterrcnn_resnet50_fpn` defaults; nothing in the
service changes them.
""",
            "files": ["tools/ml/facade_detect_service.py"],
        },
        {
            "title": "Tested now — results on held-out test images",
            "body": """
No test-set result had ever been recorded for these models. On 2026-09-15 they
were evaluated on this computer (CPU), on the **held-out test split** the
models never saw during training, with the ML project's own dataset code and
metrics.

**Defect detector** (the deployed checkpoint) — a random sample of **150 of
the 2,172 test images**; a detection is correct when it overlaps a labelled
defect of the same class by at least 50% (IoU ≥ 0.5):

| Class | Precision | Recall | F1 — at threshold 0.5 | F1 — all detections |
|---|---|---|---|---|
| crack | 0.82 | 0.81 | 0.82 | 0.72 |
| leakage | 0.92 | 0.91 | 0.91 | 0.87 |
| abscission | 0.79 | 0.78 | 0.78 | 0.73 |
| corrosion | 0.95 | 0.92 | 0.93 | 0.90 |
| bulge | 1.00 | 0.90 | 0.94 | 0.88 |
| **mean** | **0.90** | **0.86** | **0.88** | **0.82** |

At the viewer's threshold of 0.5 it finds **86%** of labelled defects, and
**90%** of what it reports is a real defect. Without a threshold it finds more
(recall 0.90) but with more false alarms (precision 0.76). Cracks and spalling
(abscission) — thin or irregular shapes — are the hardest classes. Speed on
this CPU: **about 3.3 s per image**.

**How to read these numbers.** They come from drone photographs like the
training data, with the image-level split that may put near-identical frames
in training and test, so they are an **upper bound** for what the model does
on the tool's own phone photos and 3D-mesh renders, which were never tested.
The sample (150 images) gives an indication, not a final figure; the full test
set takes about two hours on this CPU.
""",
        },
        {
            "title": "The second opinion — a vision-language model marks defects",
            "body": """
In Step 2, with **AI assist** on (the default), every photo goes to the
detector **and**, in parallel, to a general vision-language model
(`/api/facade-vision`):

1. **Model:** Claude Sonnet 4.5 if an Anthropic key is set, otherwise OpenAI
   GPT-4o.
2. **Prompt:** it is told to act as a façade-condition inspector giving a
   second opinion, is given a definition of each of the five classes, and must
   return JSON boxes (normalised 0–1), a confidence and a short note per
   defect — and nothing if there are none.
3. **Merge rule:** every detector box is kept; a vision-model box is **added
   only if it overlaps no detector box by more than 0.45 (IoU)**. It can add
   what the detector missed, but it cannot duplicate or overrule it. Each box
   keeps its source (*ml* or *ai*) on screen.
4. **If the detector is down,** the vision model's boxes are used alone so the
   inspection still produces a result.

The vision model's boxes are approximate, and its confidences are
self-reported, not calibrated like the detector's scores.
""",
            "files": ["frontend/src/components/FacadeDefectPanel.tsx", "backend/main.py"],
        },
        {
            "title": "Window-to-wall ratio and balconies — the vision model",
            "body": """
**Why.** The window-to-wall ratio (WWR) strongly drives heating demand, and no
register holds it per building. Without an estimate the energy simulation uses
a default by use (15–30%, see **6. Energy Simulation — EPSM & IDF**).

**How.** Each captured façade view (JPEG, cropped to the building) is sent to
`/api/estimate-wwr` together with the façade direction and the building's
address, year, use and energy class. The model is asked, as an architectural
analyst, for (1) the percentage of the visible façade that is glazed and
(2) the number of balconies on the dominant building and their area, returned
as JSON with a confidence and a one-line note.

| Order | Model | Result tag |
|---|---|---|
| 1 | Claude Sonnet 4.5 (Anthropic) | `claude-sonnet-4-5-vision` |
| 2 | GPT-4.1 (OpenAI) | `gpt-4.1-vision` |
| 3 | a rule, when no model answers: a base by use (houses 18%, flats 28%, commercial 45%, public 38%, industry 10%, outbuildings 5%, other 22%), adjusted by era (−3 to +5) and energy class (+5 for A to −3 for G), kept within 5–75% | `low` confidence |

The per-façade results are **averaged** for the building and the balconies
**summed**. When the user saves, the record — with its source tag — goes to
`data/wwr_database.json`, and the viewer's energy simulation then uses that
ratio instead of the default. There is also a quick pixel-count estimate in
the viewer (dark, unsaturated pixels read as glass) used when blending the
four captures.

No comparison against measured window areas has been recorded, so the
estimates' accuracy is unknown.
""",
            "files": ["assets/viewer/js/facade_inspector.js", "data/wwr_database.json", "backend/main.py"],
        },
        {
            "title": "Trained but not deployed — window segmentation and thermal defects",
            "body": """
The ML project trained two more models that the tool does not use yet.

**Model 1 — Window/wall segmentation (IRFS): a measured window-to-wall ratio.**
Instead of asking a language model, this model labels **every pixel** of a
façade photo as wall, window, door, fence, plant or background, and the WWR is
then counted:

$$WWR = \\frac{\\text{window pixels}}{\\text{wall} + \\text{window} + \\text{door pixels}}$$

- **Model:** DeepLabv3 with a ResNet-50 backbone (42.1 M parameters),
  COCO-pretrained, images resized to 512 × 512.
- **Data:** the **Irregular Facades (IRFS)** dataset — 1,057 photos of mainly
  modernist façades with pixel labels for the six classes; split 739 / 158 /
  160.
- **Two versions:** v1 — 30 epochs, cross-entropy loss; v2 — 50 epochs, built
  to fix v1's measured under-prediction on glazed façades with class-weighted
  loss, an added Dice loss and oversampling of high-WWR photos.

**Test results** (all 160 test photos, on this computer):

| | v1 | v2 |
|---|---|---|
| Mean IoU over the six classes | 0.629 | **0.634** |
| Window IoU / wall IoU | 0.686 / 0.851 | 0.686 / 0.850 |
| **WWR error** (mean absolute) | **4.3 points** | 4.8 points |
| WWR error on façades with WWR 0–10% (n = 36) | 2.9 | 3.2 |
| WWR error on façades with WWR 20–35% (n = 45) | 4.1 | 4.7 |
| WWR error on façades with WWR > 50% (n = 11) | 10.4 (under by 9.4) | 9.8 (under by 9.7) |
| Speed on this CPU | ~1 s per image | ~2.4 s per image |

**The finding:** v2 scores slightly better on pixels but **not on the WWR**,
and it did **not** remove the under-prediction on heavily glazed façades — both
versions read about 9–10 points too little glass there. For the WWR, **v1 is
the better model**. With an average error of about 4 points on ordinary
façades it is a strong, repeatable candidate to replace — or check — the
language-model estimate, which has no measured accuracy.

**Model 2 — Thermal defect segmentation (BFDD).** A small U-Net (7.8 M parameters)
given the colour and infrared image stacked as four channels, so that damp,
thermal bridges and detachment hidden behind an intact surface could show up.
Data: the **BFDD** dataset of aligned RGB–infrared façade pairs (838 pairs
locally, split 586 / 125 / 127; the published version describes 788). Trained
for 40 epochs, but its **best validation score came at epoch 1** (mean IoU
0.15): **it did not learn**, and is not usable as it stands.

**Other detector runs, for comparison** (validation mean F1): trained from
scratch 0.34; FPN-v2 backbone with augmentation 0.70; the deployed
COCO-pretrained model **0.77** — the right one was deployed.

**Sources**

| Source | Used for |
|---|---|
| Wei, Hu et al., *Irregular Facades: A Dataset for Semantic Segmentation of the Free Facade of Modern Buildings* — <https://doaj.org/article/6001fb4bb8d44f93a355c83236da2272> | the IRFS training data and its six classes |
| L.-C. Chen, G. Papandreou, F. Schroff & H. Adam (2017), *Rethinking atrous convolution for semantic image segmentation*, arXiv:1706.05587 | DeepLabv3 |
| *BFDD: A Pixel-Level Aligned RGB-IR Image Dataset for Building Façade Defect Segmentation*, Mendeley Data — <https://data.mendeley.com/datasets/9ych7czvyg/1> | the thermal training data |
| O. Ronneberger, P. Fischer & T. Brox (2015), *U-Net: Convolutional networks for biomedical image segmentation*, MICCAI (arXiv:1505.04597) | the U-Net |
""",
            "files": [],
        },
        {
            "title": "Where images and data go — privacy and third parties",
            "body": """
| Component | What leaves this computer | Stored by the tool |
|---|---|---|
| Defect detector | **nothing** — the image goes to the local service on port 8020 and back | no (the service keeps nothing) |
| Defect second opinion | the façade photo, to Anthropic or OpenAI | no |
| Window-to-wall estimate | the façade view **plus the building's address, year, use and energy class**, to Anthropic or OpenAI | the saved estimate, in `data/wwr_database.json` |
| Step 2 photos | — | the annotated photo, in `data/facade_images/` (at most 8 MB each), shown in the Step 5 report |
| Data assistant | the conversation, and the tool results it quotes (building statistics, addresses, prices), to OpenAI or Anthropic | no — the history lives only in the browser tab and is lost on reload |
| Street View capture (not connected) | the building's position, to Google | — |

**What this means in practice.** Anything sent to a provider is handled under
that provider's API terms, outside the project's control. Façade photos can
show people, faces, vehicles and number plates — personal data under GDPR — so
photos for the AI second opinion should be taken or cropped to show the wall
only. The trained detector never sends an image anywhere, which makes it the
safer choice for sensitive photographs.
""",
        },
        {
            "title": "Repeatability — does the same input give the same answer?",
            "body": """
| Component | Repeatable? | Why |
|---|---|---|
| Defect detector | **yes** | a fixed trained network; the same image and threshold always give the same boxes |
| Window-to-wall estimate | **no** | the vision models are called without setting a temperature, so they sample at the provider's default; a second run on the same façade can give a different ratio. The tool saves one run. |
| Defect second opinion | **no** | same reason |
| Data assistant | mostly | temperature 0.2 on OpenAI (low, not zero); the numbers themselves come from the tools and are exact |
| Provider models over time | **no** | `claude-sonnet-4-5`, `gpt-4.1` and `gpt-4o` are names the providers can update; the same call next year may use a newer model |

For the WWR this matters, because the saved value goes into the energy
simulation. Setting temperature 0 and averaging two or three calls per façade
would make it stable.
""",
        },
        {
            "title": "Status today, and what could be improved",
            "body": """
**On 2026-09-14:**

- The **detector service is not running** (nothing answers on port 8020), so
  Step 2 falls back to the vision model alone and the viewer's *Defects* button
  reports an error. Start it with `tools/ml/run_facade_service.ps1`.
- Only the **OpenAI** key is set, so window estimates come from GPT-4.1 and the
  second opinion from GPT-4o. The WWR store holds 1 saved estimate; 2 annotated
  façade photos are stored.
- The viewer's *Defects* button has **two click handlers**, so one click sends
  the image twice — once to `/api/facade-detect` (boxes drawn, threshold 0.5)
  and once to `/api/facade-defects` (threshold 0.3), which reports "model not
  connected" unless `FACADE_ML_URL` is set, and it is not.
- The **Street View** capture and `assets/viewer/js/facade_comparison.js` are
  written but not connected.
- The trained model lives **outside this repository**
  (`C:\\Users\\saraabo\\Desktop\\ML`, 472 MB), so it is not versioned with the
  tool.

| Improvement | Why |
|---|---|
| Evaluate on the full held-out test set, and report mAP too | only a 150-image test sample has been measured (see *Tested now*) |
| Split by flight or site rather than by image | removes near-duplicate frames from validation |
| Test on a small labelled set of the tool's own images (phone photos, mesh renders) | the model has never been checked on the images it actually receives |
| Fine-tune on street-level façade photographs | MBDD2025 is drone imagery of mixed structures |
| Connect the Street View capture, with its mm-per-pixel warning | real, dated photographs without a site visit |
| Remove the duplicate *Defects* handler | one click, one request, one result |
| Compare WWR estimates with measured window areas for a sample of buildings | the estimates' accuracy is unknown |
| Deploy the IRFS v1 segmentation model for the window-to-wall ratio, next to (or instead of) the language model | a measured, repeatable WWR with a known error of about 4 points |
| Set temperature 0 on the vision calls and average two or three runs | today the same façade can give a different WWR on each run |
| Update or remove the figures in the assistant's system prompt | it states ~17,300 certified buildings; the data has 26,263 |
| Retrain the thermal (BFDD) model with a pretrained backbone and the dataset's flight-aware split | the current one did not learn |
| Keep the trained checkpoints and their evaluation results with the project | the models live outside the repository and their scores were not recorded |
""",
            "files": ["tools/ml/run_facade_service.ps1", "assets/viewer/js/facade_comparison.js"],
        },
        {
            "title": "The data assistant — tool calling, not recall",
            "body": """
**Where:** the chat widget on the landing page (`POST /api/chat`). It answers
in the language of the question — Swedish or English — about the Gothenburg
building stock, the certificate register, the housing and rental markets and
the SCB layers, and can recommend a retrofit for an address.

**How a question is answered:**

1. The browser sends the **whole conversation so far** (it keeps the history
   itself; nothing is stored on the server).
2. The backend adds a **system prompt** describing the data and the rules, and
   the list of tools, and calls **GPT-4o** (temperature 0.2), or **Claude
   Sonnet 4.5** if only an Anthropic key is set.
3. When the model asks for a tool, the backend runs it on the project's own
   data and returns the result; the model can call tools again — **up to six
   rounds** — before it must answer.
4. The final text goes back to the browser.

**The rules in the system prompt:** always use the tools for numbers and never
invent statistics; confirm through the tools whether a certificate field
exists rather than declining; reply in the user's language; for retrofit
questions present all three options with their energy reduction and cost; say
politely when a question is outside the data.

**The eleven tools and the data each one reads:**

| Tool | Answers | Reads |
|---|---|---|
| `get_city_overview` | buildings, certificate coverage, energy, classes, year, area — whole city | `frontend/public/buildings.json` |
| `get_district_stats` · `list_districts` | the same per primärområde; the 96 districts | `buildings.json` |
| `find_buildings_by_address` | certificate data for matching addresses | `buildings.json` |
| `get_epc_dataset_info` · `search_epc_fields` | which fields the national register has, and how many records fill each | `data/sensitivity/epc_sweden.duckdb` (read-only) |
| `get_booli_sales` | sale prices, price per m², listings by area | `booli_listings.db` |
| `get_boplats_rentals` | rents, rent per m², sizes by area | `boplats_apartments.db` |
| `get_scb_datasets` | which SCB layers exist and their years | a fixed description (values are viewed on the map) |
| `list_datasets` | what the assistant can answer | a fixed list |
| `recommend_retrofit` | three packages — cheapest, lowest-energy, best balance — with the balanced one checked in EnergyPlus | the optimiser (**8. Optimisation Process**) and EPSM; takes about 15–30 s |

**Why tool calling.** An assistant that recalled Swedish building statistics
from its training would be confidently wrong in ways nobody could check; one
that must call `search_epc_fields` and quote the result can be audited. The low
temperature serves the same goal: report figures, not prose.

**A stale figure in the prompt.** The system prompt tells the model that
certificates cover "~17,300 buildings"; the building data actually has
**26,263** buildings with a certificate (28.2%). The tools return the right
number, but a model that answers from the prompt instead of calling a tool
would quote the old one. The prompt's figures should be updated, or removed so
that only the tools supply numbers.
""",
            "files": ["frontend/src/components/ChatWidget.tsx", "backend/main.py", "frontend/public/buildings.json"],
        },
        {
            "title": "Keys, and what happens without them",
            "badge": "metadata",
            "body": """
| Key | Powers | Absent |
|---|---|---|
| `ANTHROPIC_API_KEY` | WWR (Claude Sonnet 4.5), defect second opinion (Claude Sonnet 4.5), assistant alternative | falls back to OpenAI |
| `OPENAI_API_KEY` | WWR (GPT-4.1), defect second opinion (GPT-4o), assistant preferred | WWR falls to the rule; no second opinion; assistant unavailable |
| *(neither)* | — | `/api/status` reports `configured: false`, `provider: null` |
| `FACADE_ML_URL` | where the backend finds the defect detector (the direct route defaults to `host.docker.internal:8020`) | the viewer's JSON route reports "model not connected" |
| `GOOGLE_MAPS_API_KEY` | the Street View capture (not connected yet) | the endpoint returns 503 |

On 2026-09-14 only `OPENAI_API_KEY` is set on this machine.

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
}

# ─────────────────────────────────────────────────────────────────────────────
CLIMATE_ENV = {
    "number": 11,
    "title": "Climate & Environmental Analysis",
    "stage": "method",
    "purpose": """
How the 3D viewer analyses the outdoor environment around a point the user
clicks: how many hours of **direct sun** reach the ground, how much **solar
radiation** falls on the ground, roofs and façades over a season, and how warm
or cold it actually **feels** outdoors (the UTCI). The page covers the shared
engine, each analysis step by step with its equations and what they mean, a
tested example in central Gothenburg, the sources, the code and data, and the
limitations. The last part covers three city-wide layers — green index, green
accessibility and a heat-island proxy — which are simple indices, not physical
models.
""",
    "overview": {
        "title": "The environmental analyses at a glance",
        "subtitle": "One sun-position formula, one building height field, one 145-patch sky — three analyses.",
        "items": [
            ("Direct sun hours", "Hours of direct sun on the ground on one day, for a clear sky. Needs no weather file."),
            ("Incident radiation", "kWh/m² per season from the typical-year weather file, on the ground or on roofs and façades."),
            ("Thermal comfort", "The UTCI 'feels-like' temperature hour by hour, or the share of comfortable daytime hours per season."),
            ("Green and heat layers", "City-wide green index, green accessibility and a heat-island proxy — indices, not temperatures."),
            ("Clean-room engine", "Written from the published methods; the only outside library is pythermalcomfort (MIT)."),
        ],
    },
    "sections": [
        {
            "title": "How an analysis runs in the viewer",
            "body": """
The three point analyses are buttons among the environmental tools of both 3D
viewers (Gothenburg and the UK cities). They all work the same way:

**a) Switch on** *Sun hours*, *Incident radiation* or *Thermal comfort*. A panel
opens and the map waits for a click (Esc or *Exit analysis* ends it).

**b) Click a point.** The viewer sends the point, the radius (slider: 60–400 m
for sun hours, 60–350 m for the other two), the country and the city to the
backend. The grid is always 5 m.

**c) The backend** takes the city's buildings (Sweden: the Gothenburg building
model; UK: the district's buildings) and, for radiation and comfort, the city's
weather file, and computes every ground cell — or every roof and façade tile.

**d) The viewer colours** the result as a disc of points, or as coloured roof and
façade tiles. Choosing another season or hour only recolours; a new point or
radius recomputes. In the photorealistic view the points are laid onto the 3D
mesh, and points that land more than 3 m above the ground (on a roof or in a
tree) are hidden.

| Analysis | Choices in the panel | Endpoint | Colours |
|---|---|---|---|
| Direct sun hours | day: 21 June, 21 March (≈ 21 September), 21 December; *Sun hours* (whole day) or *Shadow at time* (one moment, with a time slider) | `/api/analysis/sun-hours` | blue (few hours) → yellow/orange (many), relative to the day's best cell |
| Incident radiation | *Ground* or *Roofs & façades*; season: full year, summer, spring & autumn, winter | `/api/analysis/incident-radiation`, `/api/analysis/incident-surfaces` | blue → red, relative to the season's maximum |
| Thermal comfort | *Hour of day* (the same three days, hour slider) or *Season comfort %* | `/api/analysis/thermal-comfort` | the ten UTCI stress categories; or red (0%) → green (100%) |

The sun-hours and radiation colours are **relative** to each result's own
maximum: compare two runs by their numbers, not by their colours.

**Why clean-room.** The usual toolkit for this kind of analysis, Ladybug Tools,
is AGPL-licensed; using its code would put that licence's obligations on the
whole tool. The engine was therefore written directly from the published
methods (listed under *Sources*), so the tool keeps its own licence (MIT, in
`LICENSE`). The only outside library is `pythermalcomfort` (MIT licence), for the UTCI and
the solar part of the mean radiant temperature.
""",
            "files": [
                "assets/viewer/js/sunhours.js",
                "assets/viewer/js/incident.js",
                "assets/viewer/js/comfort.js",
                "assets/viewer/js/bootstrap.js",
                "backend/main.py",
            ],
        },
        {
            "title": "Inputs — buildings, trees and weather",
            "body": """
**Buildings.** Each building is its footprint polygon with one height — a flat
extruded block. Sweden: `frontend/public/buildings.json`, the footprints and
heights of the Gothenburg model (**5. Digital Twin Construction**); UK: the
district's building file. A missing height is taken as floors × 3 m, and as
6 m (two floors) when the floors are missing too. **The ground is flat:**
building bases and ground cells are all at height 0; the terrain model is not
used.

**Trees.** Positions, heights and crown radii of individual trees from the DTCC
laser-scan vegetation layer (`frontend/public/dtcc_vegetation.json`,
Gothenburg only). They are used **only** in the roof-and-façade radiation
analysis.

**Weather.** A typical-year EnergyPlus weather file (EPW, TMYx from
Climate.OneBuilding.Org) per city — the same files the energy simulation uses
(**1. Data Sources**):

| City | Weather file | Station |
|---|---|---|
| Gothenburg | `SWE_VG_Gothenburg-Landvetter.AP.025260_TMYx.2011-2025.epw` | Landvetter airport, 57.663 N 12.280 E, 155 m, about 20 km east of the centre; UTC+1 |
| London (all four districts) | `GBR_ENG_London.City.AP.037683_TMYx.2011-2025.epw` | London City Airport |
| Rotherham | `GBR_ENG_Doncaster.Sheffield-Hood.AP.034054_TMYx.2011-2025.epw` | Doncaster Sheffield airport |

Values read from each of the 8,760 hourly rows (field numbers of the EPW
format):

| Field | Quantity | Used by |
|---|---|---|
| 2–4 | month, day, hour (1–24, local standard time; the hour *ending* at that time) | radiation, comfort |
| 7 | dry-bulb air temperature $T_a$ (°C) | comfort |
| 9 | relative humidity RH (%) | comfort |
| 13 | infrared radiation from the sky on a horizontal surface $IR_h$ (W/m²) | comfort |
| 15 | direct normal irradiance DNI (Wh/m² over the hour) | radiation, comfort |
| 16 | diffuse horizontal irradiance DHI (Wh/m² over the hour) | radiation |
| 22 | wind speed at 10 m $v_{10}$ (m/s) | comfort |

The sun-hours analysis uses no weather at all.
""",
            "files": [
                "frontend/public/buildings.json",
                "frontend/public/dtcc_vegetation.json",
                "data/epw",
            ],
        },
        {
            "title": "Shared engine a) — where the sun is",
            "body": """
All three analyses place the Sun with the low-precision formulae of the
*Astronomical Almanac*, as published and tested by Michalsky (1988). For a
moment in universal time *UT* (hours) and a site at latitude $\\varphi$ and
longitude *lon* (degrees east):

**Eq. 1 — days since the J2000 epoch**, from the Julian date *JD* (Meeus's
calendar formula):

$$n = JD - 2451545.0$$

**Eq. 2 — the Sun's mean longitude and mean anomaly** (degrees):

$$L = 280.460 + 0.9856474\\,n, \\qquad g = 357.528 + 0.9856003\\,n$$

**Eq. 3 — ecliptic longitude and the tilt of Earth's axis:**

$$\\lambda = L + 1.915\\sin g + 0.020\\sin 2g, \\qquad \\varepsilon = 23.439 - 0.0000004\\,n$$

**Eq. 4 — right ascension and declination:**

$$\\alpha = \\operatorname{atan2}(\\cos\\varepsilon\\sin\\lambda,\\ \\cos\\lambda), \\qquad \\delta = \\arcsin(\\sin\\varepsilon\\sin\\lambda)$$

**Eq. 5 — sidereal time and hour angle:**

$$GMST = 6.697375 + 0.0657098242\\,n + UT \\ \\text{(hours)}, \\qquad H = 15\\,GMST + lon - \\alpha$$

**Eq. 6 — solar altitude:**

$$\\sin\\beta = \\sin\\varphi\\sin\\delta + \\cos\\varphi\\cos\\delta\\cos H$$

**Eq. 7 — solar azimuth**, clockwise from north:

$$A = 180° + \\operatorname{atan2}\\left(\\sin H,\\ \\cos H\\sin\\varphi - \\tan\\delta\\cos\\varphi\\right)$$

**What they mean.** $L$ and $g$ place the Sun on its yearly orbit; the two sine
terms in $\\lambda$ correct for the orbit being an ellipse; $\\varepsilon$ is the
tilt of Earth's axis that makes the seasons; $\\alpha$ and $\\delta$ are the
Sun's position on the sky sphere; $H$ is how far Earth has turned since the Sun
crossed the local meridian; $\\beta$ and $A$ are what someone standing at the
site sees.

**Accuracy.** Michalsky reports about 0.01° for 1950–2050. The code does not
model atmospheric refraction, and counts the Sun as up only above 0.5°
altitude.

**Checks.**

- At Gothenburg (57.71° N) the engine gives a noon altitude of 55.7° on
  21 June and about 9° on 21 December — the textbook $90° - \\varphi \\pm 23.44°$
  gives 55.7° and 8.9°.
- With 30-minute steps it finds 18.0, 12.0 and 6.0 possible sun hours on
  21 June, 21 March and 21 December. The day length from sunrise to sunset
  in Gothenburg, which includes refraction, is roughly 18 h 05 min,
  12 h 15 min and 6 h 30 min.
- The difference is sun less than a degree above the horizon, which
  buildings and terrain block anyway.
""",
            "files": ["backend/sun_hours.py"],
        },
        {
            "title": "Shared engine b) — buildings as a height field, and the shadow test",
            "body": """
**a) Local frame.** Positions become metres east (*x*) and north (*y*) of the
clicked point: $x = (lon - lon_0)\\cdot 111{,}320\\cos\\varphi_0$ and
$y = (lat - lat_0)\\cdot 110{,}540$.

**b) Buildings that can shade.** Every building whose footprint centre lies
within $R + 550$ m of the point (roofs & façades: $R + 400$ m), where $R$ is the
study radius.

**c) Context radius** — how far away a building can still cast a shadow into
the study area:

**Eq. 8**

$$R_{ctx} = R + \\min\\left(500,\\ \\frac{h_{max}}{\\tan 12°} + 20\\right) \\ \\text{m}$$

with $h_{max}$ the tallest building found: far enough to catch every shadow while
the Sun is at least 12° high. (Roofs & façades use 400 instead of 500.)

**d) Height field.** A square grid with cells of $\\Delta$ = 5 m over
$\\pm R_{ctx}$; each cell takes the greatest height of any footprint that
contains its centre, $H(i,j)$.

**e) Study cells.** The centres of the same grid inside the disc of radius $R$,
leaving out cells inside a footprint ($H > 0.5$ m) — ground nobody can stand on.

**f) Shadow test.** From each cell, step toward the Sun (or a sky patch) one
grid cell at a time:

**Eq. 9**

$$\\text{blocked}(x) \\iff \\exists\\, k \\in \\{1,\\dots,K\\}:\\ H\\left(x + k\\Delta\\,\\hat u\\right) > z_0 + k\\Delta\\tan\\beta$$

where $\\hat u = (\\sin A, \\cos A)$ is the horizontal direction toward the Sun,
$z_0$ the start height (0 on the ground; the roof or wall point's height for
surfaces) and $K = \\lceil R_{ctx}/\\Delta \\rceil$. For sky patches $K$ is also
limited to $\\lceil h_{max}/(\\Delta\\tan\\beta)\\rceil + 1$: beyond that no
building can reach the ray.

**What it means.** A ray toward the Sun rises by $\\tan\\beta$ for every metre it
travels. If any building along the way is taller than the ray at that
distance, the point is in shadow. This is a **2.5-D** test: every building is a
solid block of one height. Extruded buildings are handled exactly; overhangs,
roof shapes, bridges and trees (except in the surface analysis) are not.
""",
            "files": ["backend/sun_hours.py", "backend/incident_radiation.py"],
        },
        {
            "title": "Shared engine c) — the sky as 145 patches, and the cumulative sky matrix",
            "body": """
**The sky dome** is divided into the 145 patches of Tregenza (1987). There are
seven bands, each 12° high, centred at altitudes 6°, 18°, 30°, 42°, 54°, 66° and
78°. They hold 30, 30, 24, 24, 18, 12 and 6 patches, plus a zenith cap above 84°.

**Eq. 10 — solid angle** of a patch in band *b* ($N_b$ patches, centre altitude
$a_b$), and of the zenith cap:

$$\\Omega_p = \\frac{2\\pi\\left[\\sin(a_b + 6°) - \\sin(a_b - 6°)\\right]}{N_b}, \\qquad \\Omega_{cap} = 2\\pi\\,(1 - \\sin 84°)$$

Together they make exactly $2\\pi$ sr, the whole hemisphere.

**The cumulative sky matrix** (Robinson & Stone 2004) sums a whole period of
weather into one number per patch: the energy that would reach a surface facing
that patch head-on, in kWh/m².

**Eq. 11 — direct part.** For every hour *h* of the period with DNI > 0, the
Sun's position at the **middle of the hour** is found with Eqs. 1–7 (EPW local
standard time converted to UT). The hour's DNI is then added to the patch
$p^*(h)$ whose centre is nearest to the Sun:

$$D_p = \\sum_{h:\\ p^*(h) = p} DNI_h$$

**Eq. 12 — diffuse part.** The sky is taken as **isotropic**: equally bright in
every direction (Liu & Jordan 1963). A uniform sky of radiance $L_{sky}$ puts
$\\pi L_{sky}$ on a horizontal surface, so $L_{sky} = DHI/\\pi$, and each patch
contributes $L_{sky}\\,\\Omega_p$:

$$F_p = \\frac{\\Omega_p}{\\pi}\\sum_h DHI_h$$

**Eq. 13 — the matrix:**

$$S_p = \\frac{D_p + F_p}{1000} \\ \\text{kWh/m}^2$$

It is built once per season and weather file and kept in memory. **Seasons:**

| Season | Months |
|---|---|
| Year | all twelve |
| Summer | June–August |
| Spring & autumn | March–May and September–November — six months, so its totals are about twice a three-month season's |
| Winter | December–February |

**Check against the weather file (Gothenburg).** For an unobstructed horizontal
surface the matrix gives $\\sum_p S_p \\sin a_p$ = **1,039.7 kWh/m²·yr**. The
EPW's own global horizontal radiation is **1,049.8 kWh/m²·yr**, so the two
agree within 1%. Dividing the dome into patches adds +0.55% to the diffuse
part.
""",
            "files": ["backend/incident_radiation.py"],
        },
        {
            "title": "Analysis 1 — Direct sun hours",
            "badge": "method",
            "body": """
**What it answers:** how many hours of direct sun each spot of ground *could*
get on a given day if the sky were clear. This is the classic sun and shadow
study used in planning.

**a) Sun positions** for the chosen day, every 30 minutes (every 60 minutes if
the disc has more than 5,000 cells). Only positions with the Sun above 0.5° are
kept.

**b) Height field and study cells**, as above. The backend accepts a radius of
20–500 m and a grid of 2–20 m; the viewer sends 60–400 m and 5 m.

**c) Shadow test** (Eq. 9) toward the Sun for every cell at every time step.

**d) Sum the lit time:**

**Eq. 14**

$$S(x) = \\sum_t \\Delta t \\cdot \\mathbf{1}[x \\text{ is lit at } t] \\ \\text{hours}, \\qquad \\Delta t = 0.5 \\text{ h (or 1 h)}$$

**e) Frames.** The lit/shaded pattern of every step is also returned, for the
*Shadow at time* view's slider. The frames are labelled in local clock time: UTC+1
in Sweden and UTC+0 in the UK, plus one hour in European summer time. The
day's possible hours, $\\sum \\Delta t$, come back too.

**What it means.** This is **potential**, astronomical sun: clouds are ignored,
so it is an upper bound, not what the weather file would give. Two benchmarks
use the same day the panel offers, 21 March:

- **Sweden.** Practice often refers to Boverket's *Solklart* (1991): about five
  hours of direct sun at the spring and autumn equinox for dwellings and
  nearby outdoor spaces. Today's building rules (BBR) require access to direct
  sunlight but set no number of hours.
- **UK.** The BRE guide BR 209 recommends that at least half of a garden or
  amenity space gets at least two hours of sun on 21 March.

**Limits.** Only buildings cast shadows — not trees, not terrain. The
resolution is 30 minutes and 5 m.
""",
            "files": ["backend/sun_hours.py", "assets/viewer/js/sunhours.js"],
        },
        {
            "title": "Analysis 2 — Incident solar radiation on the ground, roofs and façades",
            "badge": "method",
            "body": """
**What it answers:** how much solar energy (kWh/m²) reaches each spot over a
season, using the typical year's real sunshine and cloud. On the ground it
supports shading and greening decisions; on roofs and façades it shows the
solar potential and the solar load.

**Ground — step by step**

**a) Sky matrices** for the four seasons (Eqs. 10–13) from the city's EPW.

**b) Height field and ground cells** (radius 20–400 m, grid 2–20 m).

**c) Visibility.** For each of the 145 patches, shadow-test every cell toward
the patch centre (Eq. 9). The zenith cap is never blocked.

**d) Sum over the sky:**

**Eq. 15**

$$I_s(x) = \\sum_p S_{p,s}\\ \\cos\\theta_p\\ V_p(x), \\qquad \\cos\\theta_p = \\sin a_p$$

where $V_p(x)$ = 1 if the patch is visible from the cell and 0 if a building
hides it; on level ground the incidence cosine is the sine of the patch
altitude.

**Roofs and façades — step by step**

**a) Which buildings.** Buildings within $R$ + 400 m cast shadows. Buildings
whose centre lies within $R$ + 30 m get surface tiles (radius up to 250 m,
grid up to 10 m).

**b) Roof tiles:** a $\\Delta \\times \\Delta$ grid inside each footprint at roof
height, facing straight up.

**c) Façade tiles:** each footprint edge of length *L* and height *h* is divided
into $\\lceil L/\\Delta \\rceil \\times \\lceil h/\\Delta \\rceil$ tiles. Each
tile's centre is moved 0.1 m out from the wall along its outward normal
$\\hat n$, so the wall does not shade itself.

**d) Trees:** a second height field holds tree tops. Each tree covers a square
of $\\pm\\max(\\Delta, \\text{crown radius})$ around its trunk, at its height.

**e) Sum over the sky:**

**Eq. 16**

$$I_s(x) = \\sum_p S_{p,s}\\ \\max(0,\\ \\hat n\\cdot\\hat v_p)\\ V_p(x)$$

Here $\\hat v_p$ is the direction of the patch. $V_p$ = 0 if a building blocks
the ray, $V_p = \\tau$ = 0.3 if only a tree crown does, and 1 otherwise. The ray
starts at the tile's own height.

**f) Output:** each tile as a 3-D quadrilateral with its four season values,
drawn coloured in the viewer.

**What the numbers mean.** They are the energy reaching the surface, including
the diffuse sky, before any solar-panel efficiency. Reference values from the
Gothenburg matrix for surfaces with nothing around them, in kWh/m²·yr:

| Horizontal | South wall | West | East | North |
|---|---|---|---|---|
| 1,040 | 824 | 628 | 517 | 237 |

The building's rooftop PV estimate in the tool does **not** come from this
engine; it comes from PVGIS (**1. Data Sources**).

**About the tree value.** τ = 0.3 is one fixed value, and where it came from is
not recorded. Measurements on single street trees **in Gothenburg**
(Konarska et al. 2014) found:

| Crown | Share of direct sunlight let through |
|---|---|
| In leaf | 1.3–5.3% |
| Leafless | 40–52% |

So the model lets through too much sun in summer and too little in winter. A
seasonal value — about 0.05 in leaf and about 0.45 leafless — would follow the
measurements.
""",
            "files": ["backend/incident_radiation.py", "assets/viewer/js/incident.js"],
        },
        {
            "title": "Analysis 3 — Outdoor thermal comfort (UTCI)",
            "badge": "method",
            "body": """
**What it answers:** how warm or cold it feels to stand at a spot. Air
temperature, humidity, wind and radiation (sun and shade) are combined into one
"feels-like" temperature, the **UTCI**. In season mode the result is the share
of daytime hours that are comfortable.

**The UTCI.** The Universal Thermal Climate Index was developed in COST Action
730 (Jendritzky et al. 2012). It is the air temperature of a *reference*
environment that would cause the same physiological strain as the real
conditions. The reference has calm air, a mean radiant temperature equal to
the air temperature, and moderate humidity. The strain is computed with the
UTCI-Fiala multi-node model of human thermoregulation and an adaptive clothing
model. For practical use it is a sixth-order polynomial of about 200 terms
fitted to that model (Bröde et al. 2012):

**Eq. 17**

$$UTCI = T_a + \\text{Offset}\\left(T_a,\\ T_{mrt} - T_a,\\ v_{10},\\ p_a\\right)$$

with $p_a$ the water-vapour pressure from $T_a$ and RH. It is defined for air
temperatures from −50 to +50 °C and winds of 0.5–17 m/s at 10 m. The tool
computes outside these limits too, and raises wind below 0.5 m/s to 0.5 m/s.

**The ten stress categories** (Błażejczyk et al. 2013) — the viewer's legend:

| UTCI (°C) | Thermal stress |
|---|---|
| above +46 | extreme heat stress |
| +38 to +46 | very strong heat stress |
| +32 to +38 | strong heat stress |
| +26 to +32 | moderate heat stress |
| **+9 to +26** | **no thermal stress** (the "comfortable" band) |
| 0 to +9 | slight cold stress |
| −13 to 0 | moderate cold stress |
| −27 to −13 | strong cold stress |
| −40 to −27 | very strong cold stress |
| below −40 | extreme cold stress |

**Step by step, for every ground cell *x* and hour *h***

**a) Geometry, once.** Build the height field and ground cells as for radiation
(radius 20–400 m, grid 2–20 m). Shadow-test every cell toward each of the 145
patches.

**b) Sky view factor** — the share of the sky dome, weighted by solid angle,
that is not blocked:

**Eq. 18**

$$SVF(x) = \\frac{1}{2\\pi}\\sum_p \\Omega_p\\,V_p(x)$$

It is not cosine-weighted, as it would be for a flat surface, because a
standing person receives radiation from every direction.

**c) Sky temperature** from the EPW's infrared field, as in EnergyPlus:

**Eq. 19**

$$T_{sky} = \\left(\\frac{IR_h}{\\sigma}\\right)^{1/4}, \\qquad \\sigma = 5.67\\times10^{-8}\\ \\text{W/m}^2\\text{K}^4$$

If the infrared value is missing, $T_{sky} = T_a - 20$ K.

**d) Longwave mean radiant temperature.** A standing person in the open sees
about half sky and half ground. The ground and walls are taken at air
temperature:

**Eq. 20**

$$T_{mrt,lw} = \\left[f_{sky}\\,T_{sky}^4 + (1 - f_{sky})\\,T_a^4\\right]^{1/4}, \\qquad f_{sky} = 0.5\\,SVF$$

with the temperatures in kelvin.

**e) In sun?** Hour mode runs a shadow test toward the true Sun at the middle of
the hour. Season mode uses the visibility of the sky patch that contains the
Sun, so no new test is needed each hour.

**f) Solar gain** — SolarCal (Arens et al. 2015; ASHRAE Standard 55,
Appendix C), through `pythermalcomfort`'s `solar_gain`, for sunlit cells only:

**Eq. 21**

$$E_{sol} = f_{eff}\\left[0.5\\,f_{svv}\\,I_{diff} + f_p\\,f_{bes}\\,I_{dir} + 0.5\\,f_{svv}\\left(I_{dir}\\sin\\beta + I_{diff}\\right)R_{floor}\\right]$$

**Eq. 22**

$$ERF = E_{sol}\\,\\frac{\\alpha_{sw}}{\\alpha_{lw}}, \\qquad \\Delta T_{mrt} = \\frac{ERF}{f_{eff}\\,h_r}$$

The three terms are the diffuse sky, the direct beam and the light reflected
from the ground. *ERF* is the effective radiant field absorbed by the body;
$\\Delta T_{mrt}$ is how much warmer the surroundings would have to be to give the
same gain. The values used:

| Symbol | Value | Meaning |
|---|---|---|
| $I_{dir}$ | the hour's DNI | direct beam |
| $I_{diff}$ | 0.2 × $I_{dir}$ | the library's fixed assumption — **not** the EPW's DHI |
| $f_{svv}$ | the cell's SVF | share of sky seen |
| $f_{bes}$ | 1 | whole body in the sun |
| $f_{eff}$ | 0.725 | radiating share of a standing body |
| $f_p$ | ASHRAE table | projected area of a standing body, by sun altitude and SHARP (the Sun's horizontal angle to the front of the body) |
| $R_{floor}$ | 0.25 | urban paving (the library's 0.6 is for indoor floors) |
| $\\alpha_{sw}$, $\\alpha_{lw}$ | 0.7, 0.95 | short- and longwave absorptance of skin and clothing |
| $h_r$ | 6 W/m²K | radiative heat-transfer coefficient |

Body orientation is unknown, so $\\Delta T_{mrt}$ is averaged over SHARP = 0°,
45°, 90°, 135° and 180°. It is tabulated at 41 SVF steps. Season mode also
tabulates it by sun altitude (4° steps) at DNI = 1,000 W/m² and scales it by
the hour's DNI/1,000. That scaling is exact, because every term is
proportional to DNI.

**g) Total mean radiant temperature:**

**Eq. 23**

$$T_{mrt} = T_{mrt,lw} + \\Delta T_{mrt}\\cdot\\mathbf{1}[\\text{sunlit}]$$

**h) UTCI** (Eq. 17) with the hour's $T_a$ and RH, $v_{10} = \\max(0.5,$ EPW
wind$)$ — the same for every cell — and the cell's own $T_{mrt}$. The result is
sorted into the ten categories.

**i) Season mode** — the share of daytime hours (Sun above the horizon) in the
no-stress band:

**Eq. 24**

$$C_s(x) = \\frac{100}{N_s}\\sum_{h \\in s,\\ \\beta_h > 0} \\mathbf{1}\\left[9 \\le UTCI_h(x) \\le 26\\right] \\ \\%$$

**What it means.** Across the disc only the **radiation** differs from cell to
cell; air temperature, humidity and wind are the station's. The map therefore
shows where sun, shade and an open or closed sky make the same weather feel
warmer or colder.

Hour mode shows 21 June, 21 March and 21 December of the typical year. Each is
a single day, with whatever weather the file holds for it — not an average.
The hour frames are labelled in **local standard time** from the EPW: the frame
"12:00" covers 12:00–13:00 standard time, which is 13:00–14:00 on a Swedish
summer clock. The sun-hours labels do include summer time.
""",
            "files": ["backend/thermal_comfort.py", "assets/viewer/js/comfort.js", "requirements.txt"],
        },
        {
            "title": "Tested now — one site in central Gothenburg",
            "badge": "result",
            "body": """
On 2026-09-15 all the analyses were run at **57.6985 N, 11.9690 E** (central
Gothenburg), with a radius of 150 m (roofs & façades: 90 m) and a 5 m grid.
That gives 1,947 ground cells, with 1,041 buildings in the shading context.
Sun hours and radiation went through the running backend. Thermal comfort
called the same engine directly, because the locally running backend is
missing the `pythermalcomfort` library (see *Limitations*).

**Direct sun hours**

| Day | Possible | Best cell | Mean cell | Run time |
|---|---|---|---|---|
| 21 June | 18.0 h | 16.5 h | 9.5 h | 2.2 s (first call, loads the buildings) |
| 21 March | 12.0 h | 10.5 h | 5.5 h | 0.6 s |
| 21 December | 6.0 h | 4.0 h | 0.9 h | 0.5 s |

On 21 March, **79%** of the cells get at least 2 hours (so the BR 209 test
would pass) and **64%** get at least 5 hours (the *Solklart* level); **15%** get
none.

**Incident radiation on the ground** (kWh/m², 0.9 s)

| Season | Best cell | Mean | Lowest |
|---|---|---|---|
| Year | 1,014 | 695 | 43 |
| Summer | 473 | 333 | 19 |
| Spring & autumn | 498 | 334 | 21 |
| Winter | 45 | 28 | 3 |

**Roofs and façades** (radius 90 m: 302 roof tiles, 1,727 façade tiles, 510
buildings shading, 2.9 s)

| | Year, mean (range) | Summer, mean | Winter, mean |
|---|---|---|---|
| Roofs | 992 (424–1,040) | 463 | 45 |
| Façades | 183 (2–804) | 81 | 9 |

The roofs get close to the unobstructed 1,040. The façades average less than
the 237 of an open north wall: in a dense block most façades face narrow
streets and courtyards.

**Thermal comfort, 21 June** (hour mode; 3.9 s the first time, while the
library compiles its numerical code, then 0.2 s)

| Hour | Air | Wind | Sun | UTCI across the disc | Most cells |
|---|---|---|---|---|---|
| 03:00 | 7.7 °C | 1 m/s | 0.8° | 6.3 to 8.3 °C | slight cold stress |
| 09:00 | 15.9 °C | 5 m/s | 45° | 6.3 to 18.5 °C | no thermal stress (78%) |
| 12:00 | 17.4 °C | 5 m/s | 56° | 8.0 to 20.0 °C | no thermal stress (94%) |
| 15:00 | 14.9 °C | 5 m/s | 41° | 5.2 to 15.7 °C | no thermal stress (65%) |
| 21:00 | 13.5 °C | 4 m/s | below horizon | 5.3 to 7.1 °C | slight cold stress |

At noon the same air feels about **12 °C** different between deep shade and
open sun — the effect of radiation alone. On 21 December the Sun (at most 9°)
barely reaches the ground, and the whole disc is in moderate cold stress all
day.

**Thermal comfort, season mode** (1.8 s) — share of daytime hours with no
thermal stress:

| Season | Daytime hours | Mean cell | Range across cells |
|---|---|---|---|
| Summer | 1,530 | 66.5% | 55–74% |
| Spring & autumn | 2,217 | 19.3% | 11–26% |
| Winter | 666 | 0.4% | 0–1% |
| Year | 4,413 | 32.8% | 24–39% |
""",
        },
        {
            "title": "City-wide layers — green index, green accessibility and heat-island proxy",
            "badge": "method",
            "body": """
These three layers are computed in the browser for the whole city, not around a
clicked point. They are simple **indices**, not physical models. (The layers
themselves are listed on **12. Viewer Layers & Visualisation**.)

**Data.** Green areas from OpenStreetMap: parks, gardens, nature reserves,
recreation grounds, grass, forest, meadow, wood, scrub and grassland.

- **Gothenburg:** `assets/gothenburg_greenspaces.json`, 22,851 areas downloaded
  once by `tools/scratch/python/_download_green_spaces.py` and stored only as
  a centre point and an area.
- **Other cities:** fetched live from the Overpass API through
  `/api/urban/green-areas`.
- **Filtering:** small areas are dropped by type — for example parks under
  200 m², forest under 1,000 m² and grass under 2,000 m².
- **Fallback:** if no green data loads, some building types (ancillary
  buildings, low public buildings) stand in as green points.

**Distance to green.** Each area is treated as a circle of the same area around
its centre, with the radius capped at 300 m:

**Eq. 25**

$$d(x) = \\min_g\\ \\max\\left(0,\\ \\lVert x - c_g\\rVert - \\min\\left(\\sqrt{A_g/\\pi},\\ 300\\right)\\right)$$

The cap is there because 1,652 of the areas have exactly 10,000,000 m². The
download script caps multipolygon areas at 10 km², and it adds up each
member way as if it were a closed ring. Without the cap these areas would mark
almost the whole city as next to green.

**a) Green index** (grid about 280 × 280 m):

**Eq. 26**

$$G(x) = e^{-d(x)/200}$$

It is 1 inside green, 0.37 at 200 m and 0.14 at 400 m.

**b) Green accessibility** (same grid) sorts each grid point into three bands:
under 400 m, 400–800 m and over 800 m. The distance is a straight line, not a
walk along streets. The legend shows the share of points in each band. For
comparison, WHO Europe (2016) suggests green space of at least 0.5 ha within
300 m straight-line distance of homes.

**c) Heat-island proxy** (grid about 668 × 654 m; Sweden only) — the average
building score in each cell, reduced near green:

**Eq. 27**

$$s_b = 0.5\\,E_b + 0.3\\,Y_b + 0.2\\,U_b, \\qquad s = \\bar{s}\\,\\left(1 - 0.35\\,e^{-d/300}\\right)$$

Here $\\bar s$ is the mean of $s_b$ over the cell's buildings. The three scores
are:

- **Energy class** $E$: A = 0.05 up to G = 1.0; unknown 0.55.
- **Age** $Y$: built 2005 or later 0.12, up to before 1950 0.85; unknown 0.55.
- **Use** $U$: industry 1.0, business 0.70, public 0.60, multi-family 0.48,
  single-family 0.38, ancillary 0.25, other 0.45.

**What it is and what it is not.** A heat island is a difference in **air or
surface temperature**. None of these inputs is a temperature: energy class and
age describe heat loss through the building envelope, and the weights are not
taken from a published source. Read the layer as "where older, less efficient,
more industrial building stock lies far from green" — not as measured heat.
""",
            "files": [
                "assets/viewer/js/urban_analysis.js",
                "assets/gothenburg_greenspaces.json",
                "tools/scratch/python/_download_green_spaces.py",
            ],
        },
        {
            "title": "Sources",
            "body": """
| Source | Used for |
|---|---|
| J. J. Michalsky (1988), *The Astronomical Almanac's algorithm for approximate solar position (1950–2050)*, **Solar Energy** 40(3), 227–235 | sun position, Eqs. 2–7 |
| J. Meeus (1998), *Astronomical Algorithms*, 2nd ed., Willmann-Bell | the Julian date, Eq. 1 |
| P. R. Tregenza (1987), *Subdivision of the sky hemisphere for luminance measurements*, **Lighting Research & Technology** 19(1), 13–14, doi:10.1177/096032718701900103 | the 145 sky patches, Eq. 10 |
| D. Robinson & A. Stone (2004), *Irradiation modelling made simple: the cumulative sky approach and its applications*, PLEA 2004, Eindhoven | the cumulative sky matrix, Eqs. 11–13 |
| B. Y. H. Liu & R. C. Jordan (1963), *The long-term average performance of flat-plate solar-energy collectors*, **Solar Energy** 7(2), 53–74 | the isotropic diffuse sky, Eq. 12 |
| U.S. Department of Energy, *EnergyPlus Engineering Reference* — Climate calculations | sky temperature from the EPW infrared field, Eq. 19 |
| G. Jendritzky, R. de Dear & G. Havenith (2012), *UTCI — Why another thermal index?*, **International Journal of Biometeorology** 56(3), 421–428 | the UTCI concept |
| P. Bröde et al. (2012), *Deriving the operational procedure for the Universal Thermal Climate Index (UTCI)*, **International Journal of Biometeorology** 56(3), 481–494, doi:10.1007/s00484-011-0454-1 | the UTCI polynomial, Eq. 17 |
| K. Błażejczyk et al. (2013), *An introduction to the Universal Thermal Climate Index (UTCI)*, **Geographia Polonica** 86(1), 5–10 | the ten stress categories |
| E. Arens et al. (2015), *Modeling the comfort effects of short-wave solar radiation indoors*, **Building and Environment** 88, 3–9, doi:10.1016/j.buildenv.2014.09.004 | SolarCal, Eqs. 21–22 |
| ANSI/ASHRAE Standard 55-2020, *Thermal Environmental Conditions for Human Occupancy*, Appendix C | the SolarCal procedure and projected-area factors |
| F. Tartarini & S. Schiavon (2020), *pythermalcomfort: A Python package for thermal comfort research*, **SoftwareX** 12, 100578, doi:10.1016/j.softx.2020.100578 | the library used (version 2.10.0, MIT licence) |
| J. Konarska et al. (2014), *Transmissivity of solar radiation through crowns of single urban trees — application for outdoor thermal comfort modelling*, **Theoretical and Applied Climatology** 117, 363–376, doi:10.1007/s00704-013-1000-3 | measured tree transmittance in Gothenburg |
| F. Lindberg, B. Holmer & S. Thorsson (2008), *SOLWEIG 1.0 — Modelling spatial variations of 3D radiant fluxes and mean radiant temperature in complex urban settings*, **International Journal of Biometeorology** 52, 697–713, doi:10.1007/s00484-008-0162-7 | a fuller MRT model, validated in Gothenburg (suggested improvement) |
| R. Perez, R. Seals & J. Michalsky (1993), *All-weather model for sky luminance distribution — preliminary configuration and validation*, **Solar Energy** 50(3), 235–245 | an anisotropic sky (suggested improvement) |
| Boverket (1991), *Solklart* | Swedish sun-hours practice |
| BRE (2022), *BR 209 — Site layout planning for daylight and sunlight: a guide to good practice* | UK sun benchmark for gardens and amenity spaces |
| WHO Regional Office for Europe (2016), *Urban green spaces and health — a review of evidence* | the 300 m green-access benchmark |
| Climate.OneBuilding.Org — TMYx typical weather years | the weather files |

> **Not recorded:** the sources of the tree transmittance (0.3), the ground
> reflectance (0.25), and the heat-island weights and scores.
""",
        },
        {
            "title": "Code and data",
            "body": """
| File | What it does |
|---|---|
| `backend/sun_hours.py` | sun position (Eqs. 1–7), the height field and shadow test, the sun-hours analysis |
| `backend/incident_radiation.py` | Tregenza dome, EPW sky matrix, ground and roof/façade radiation, tree canopy |
| `backend/thermal_comfort.py` | sky view factor, sky temperature, mean radiant temperature, SolarCal, UTCI; hour and season modes |
| `backend/main.py` | the four `/api/analysis/*` endpoints; picks the buildings and the weather file per city (`CITY_TO_EPW`) |
| `assets/viewer/js/sunhours.js`, `incident.js`, `comfort.js` | the panels, clicks, colours and mesh clamping in the viewer |
| `assets/viewer/js/urban_analysis.js` | green index, green accessibility, heat-island proxy |
| `assets/viewer/js/bootstrap.js` | loads these scripts in both viewers |
| `requirements.txt` | pins `pythermalcomfort==2.10.0`; installed in the Docker backend image |

**Data used:** the weather files in `data/epw/`, the buildings
(`frontend/public/buildings.json`, UK district files), the trees
(`frontend/public/dtcc_vegetation.json`) and the green areas
(`assets/gothenburg_greenspaces.json`). **Nothing is stored:** every result is
computed on the click. Only the EPW sky matrices are cached in memory.
""",
            "files": [
                "backend/sun_hours.py",
                "backend/incident_radiation.py",
                "backend/thermal_comfort.py",
                "requirements.txt",
                "data/epw",
            ],
        },
        {
            "title": "Limitations, and what could be improved",
            "body": """
| Limitation | Effect | What could be done |
|---|---|---|
| Flat ground | Gothenburg is hilly: shading by terrain, and buildings on slopes, come out wrong | put the DTCC terrain model, already in the viewer, under the height field |
| Buildings are blocks of one height | no roof shapes, overhangs or balconies; pitched roofs are treated as flat | use the DTCC roof forms (Gothenburg) |
| Trees shade only the roof & façade analysis | tree-lined streets and parks look sunnier and hotter than they are in sun hours and comfort | add the tree height field, with transmittance, to both |
| Tree transmittance fixed at 0.3 | too transparent in summer, too opaque in winter | seasonal values from Konarska et al. (2014): about 0.05 in leaf, 0.45 leafless |
| Isotropic diffuse sky | the bright sky around the Sun and near the horizon is missing; façades differ too little by orientation | the Perez all-weather sky |
| No reflected radiation | façades and street canyons get less than in reality | add ground and wall reflection |
| Direct sun is put on the nearest patch centre (up to ~6° away) | small errors in the incidence angle and at shadow edges | use the exact Sun direction for the direct part, as hour-mode comfort already does |
| Context radius sized for a 12° Sun | in December the Sun stays below 9° in Gothenburg, so long shadows from tall buildings farther away are missed | size the context from the day's lowest useful Sun |
| Comfort: ground and walls at air temperature | sunlit paving and walls are far hotter than the air on summer afternoons, so UTCI in the sun is underestimated | surface temperatures from a simple energy balance, or SOLWEIG (Lindberg et al. 2008, validated in Gothenburg) |
| Comfort: solar gain only in direct sun, with diffuse assumed as 0.2 × DNI | shaded cells and overcast hours get no shortwave radiation at all | use the EPW's diffuse radiation, and add diffuse and reflected light for shaded cells |
| Comfort: the airport's 10 m wind for every cell | sheltered courtyards feel too cold, especially in the cold months | a sheltering or urban-roughness factor per cell, or CFD for key sites |
| Airport station, about 20 km inland | no urban heat island in the air temperature | an urban weather file; the 2050 and 2080 files in `data/epw/` could show future heat stress |
| Hour mode offers three single days | one day's weather in the typical year can be unusual | any date, or monthly averages |
| Comfort hours labelled in standard time | a summer frame labelled 12:00 is 13:00 on the clock | the same summer-time rule the sun hours use |
| Colour scales relative to each result | two runs cannot be compared by colour | fixed scales per season |
| `pythermalcomfort` missing in the Python the local backend runs on | thermal comfort fails with a server error outside Docker | install from `requirements.txt`, and add it to `backend/requirements.txt` |
| Heat-island proxy is not a temperature | can be read as measured heat | satellite land-surface temperature, or modelled UTCI as above |
| Green distance is a straight line to a circle | underestimates walks across railways, water and main roads | network distance on the OSM street graph the space-syntax analysis already builds |
| Nothing validated against measurements | accuracy on real sites is unknown | compare with sun and radiation measurements, and with the Gothenburg MRT field data behind SOLWEIG |
""",
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
SE_VIEWER = {
    "title": "Sweden · Viewer Layers",
    "stage": "result",
    "purpose": """
The Gothenburg viewer, `assets/gothenburg_3d.html`: every base map, layer and
overlay that can be switched on, where its data comes from, whether it is live
or pre-built, and how it is drawn and coloured. Sweden has far
more layers than the UK: traffic from Västtrafik and Trafikverket, and
statistics from SCB (Statistics Sweden), exist only here. Everything below was
read from the served viewer code (`assets/viewer/js/`) and checked on
2026-09-15.
""",
    "overview": {
        "title": "Seven sidebar sections",
        "subtitle": "In the order they appear; the numbers are added by the viewer itself.",
        "items": [
            ("Display", "Base map (Light, Dark, Satellite, Terrain relief, Photorealistic 3D) and the Color By choice."),
            ("Building Analysis", "Click a building: its card, façade inspection, rooftop PV and an EnergyPlus run."),
            ("Additional Layers", "Buildings and their legend, trees and shrubs, pitched roofs, the street network."),
            ("Environmental Analysis", "Sun hours, incident radiation and thermal comfort around a clicked point."),
            ("Traffic", "Västtrafik public transport (live vehicles, stops, disruptions, parking) and Trafikverket roads."),
            ("Statistics", "Twelve SCB map layers — population, income, statistical zones, land use."),
            ("Urban Analysis", "Green index, heat-island proxy, green accessibility and space-syntax centrality of the street network."),
        ],
    },
    "sections": [
        {
            "title": "How the viewer is put together",
            "body": """
**The page and its profile.** `assets/gothenburg_3d.html` is the page;
`assets/gothenburg_3d.meta.js` sets `VIEWER_PROFILE`: country `se`, one city,
the building file `buildings.json`, and the Swedish construction eras.

**The scripts.** `assets/viewer/js/bootstrap.js` loads the viewer scripts one
after another. Four are loaded **only when the country is Sweden**:
`trafik_canvas.js`, `vasttrafik.js`, `trafikverket.js` and `scb_layers.js`.
Every other script is loaded in both viewers.

**What decides Sweden-only.** Three mechanisms together:

- the script list above;
- the CSS class `se-only`, which hides controls outside Sweden;
- controls that exist only in this HTML file: the Display thumbnails, the
  Terrain relief map, the Environmental Analysis section, the Space Syntax
  button and the compass / top-view buttons.

| Script | What it adds |
|---|---|
| `cesium.js` | the 3D globe (Cesium 1.143, loaded from jsDelivr), base maps, buildings and their colours, picking, camera |
| `ui.js` | the sidebar: section folding, the building card and hover card, the info (i) buttons |
| `legend.js` | the building legend with counts, and the best / worst performer cards |
| `layer_docs.js` | the text behind every (i) button |
| `display_controls.js` | the base-map thumbnails, the Color By dropdown and the section numbers |
| `vegetation.js`, `roofs.js`, `street_network.js` | trees and shrubs, pitched roofs, the OSM street network |
| `sunhours.js`, `incident.js`, `comfort.js` | the three environmental analyses |
| `vasttrafik.js`, `trafik_canvas.js` | public transport: stops, live vehicles, disruptions, parking |
| `trafikverket.js` | road cameras, traffic flow, road conditions, rest stops |
| `scb_layers.js` | the SCB statistics layers |
| `urban_analysis.js` | green index, heat-island proxy, green accessibility |
| `facade_inspector.js`, `pvgis.js`, `energy_sim.js` | the building analysis tools |
| `search.js`, `city_switcher.js` | address search; the city pills (UK only) |

The served copy in `assets/viewer/js/` is **ahead of** the source copy in
`viewer/js/`, and `build.py` copies the source over the served files. Edit both
copies, as this project does, or a rebuild will undo the newer viewer.
""",
            "files": ["assets/gothenburg_3d.html", "assets/gothenburg_3d.meta.js", "assets/viewer/js/bootstrap.js",
                      "assets/viewer/js/cesium.js", "assets/viewer/js/ui.js", "build.py"],
        },
        {
            "title": "Base maps and display modes",
            "body": """
| Base map | Source | Key needed | Notes |
|---|---|---|---|
| **Light** (default) | Esri Canvas Light Gray; CARTO `light_all` when the backend has `CARTO_API` set | none (CARTO: optional) | the (i) text says CartoDB, but the default is Esri |
| **Dark** | Esri Dark Gray Canvas, or CARTO `dark_all` | none | |
| **Satellite** | Esri World Imagery | none | |
| **Terrain relief** | one hillshade image, `terrain_hillshade.png`, made from Lantmäteriet laser scanning via DTCC and draped flat | none | **Sweden only** |
| **Photorealistic 3D** | Google Photorealistic 3D Tiles through Cesium ion | Cesium ion token | real roofs, trees and terrain in one mesh |

**Flat versus 3D ground.** The globe itself is always a smooth ellipsoid; the
viewer loads no terrain model.

- **Flat maps** (Light, Dark, Satellite, Terrain relief): buildings, trees and
  roofs stand at height 0, and the Color By dropdown is shown.
- **Photorealistic 3D:** the viewer's own buildings, trees and roofs are hidden
  because the Google mesh already contains them. Clicking a building then uses
  a footprint index to find its record, and analysis points are laid onto the
  mesh.

**Automatic switches.** Switching on an SCB layer while in 3D moves the map to
Satellite. SCB and Urban Analysis layers also turn the camera to look straight
down.
""",
            "files": ["assets/viewer/js/cesium.js", "assets/viewer/js/display_controls.js",
                      "frontend/public/terrain_hillshade.png"],
        },
        {
            "title": "Buildings — the base layer and how they are coloured",
            "body": """
**Data.** `frontend/public/buildings.json`: 92,973 buildings from EUBUCCO
footprints, Boverket certificates and TABULA. The page fetches it once and the
browser caches it per build version. How it is built is on
**5. Digital Twin Construction**.

**Drawing.** Each building is an extruded footprint, drawn in chunks of 12,000.
Its height is:

- the recorded height;
- else floors × 3 m;
- else 6 m;
- never less than 3 m.

**Color By** — three modes. Buildings with no value for the chosen field are
drawn dark grey.

| Mode | Field | Colours |
|---|---|---|
| Asset type (default) | `use_cat` | single-family orange, multi-family yellow, business light blue, industrial red-brown, public green, ancillary grey, other purple |
| Energy class | `eclass` A–G | A dark green · B green · C yellow-green · D yellow · E orange · F red · G dark red |
| Year era | `tabula_period` | six TABULA periods: before 1960, 1961–75, 1976–85, 1986–95, 1996–2005, after 2005 |

There is **no** colour mode for height, rent or sale price, heating system or
certificate source.

**Legend and performer cards.** Each legend row shows how many buildings have
that value; in Year era it also shows the median kWh/m² of the era. Clicking a
row opens the 15 best and 15 worst buildings of that group, and up to three
can be compared. Their energy text is:

- green below 100 kWh/m²;
- amber below 200 kWh/m²;
- red above that.

**Building card** (click): address and all entrances, use, energy class,
energy, year, footprint, height, floors, TABULA period, wall and window
U-values. It also shows any saved PV, window-ratio and simulation results.

**Hover card:** address, use, class, energy (orange above 150 kWh/m²), year,
size and, for housing, the TABULA era and U-values.

The two counters at the top ("85,670 EPC matched", "26,263 TABULA matched") and
the subtitle "92,973 buildings" are **fixed text** in the HTML. They are right
today but do not update when the data is rebuilt.
""",
            "files": ["frontend/public/buildings.json", "assets/viewer/js/legend.js", "assets/viewer/js/cesium.js"],
        },
        {
            "title": "Additional layers — trees, pitched roofs, street network",
            "body": """
| Layer | Data | Live or built | How it is drawn |
|---|---|---|---|
| **Trees & shrubs** (on by default) | `frontend/public/dtcc_vegetation.json` — single trees and shrubs from laser scanning (DTCC), water areas filtered out | pre-built | brown trunk cylinders with green ellipsoid crowns, and shrub ellipsoids. Only drawn within 1.1–7 km of the view centre, at most 12,000 trees and 6,000 shrubs (the tallest kept). Hidden in 3D mode |
| **Pitched roofs** (off by default) | `frontend/public/roofs_gothenburg.json` — eave and ridge height and ridge direction per building, from laser scanning | pre-built | gable caps in a slightly darker shade of the building's colour. Skipped for footprints that fill less than 72% of their bounding box |
| **Street network** | `/api/osm/roads` → OpenStreetMap through Overpass (three mirror servers) | live, cached in the backend per area | cyan lines, 1.4–3.4 px wide by road class. Re-fetched 0.4 s after the camera stops, for up to ±0.04° around the view |
| OSM Buildings | Cesium ion OSM Buildings | streamed | its switch is **hidden** in Sweden |

The layers are built by `tools/se/dtcc_vegetation.py`, `tools/se/dtcc_roofs.py`
and `tools/se/filter_vegetation_water.py`.
""",
            "files": ["assets/viewer/js/vegetation.js", "assets/viewer/js/roofs.js", "assets/viewer/js/street_network.js",
                      "tools/se/dtcc_vegetation.py", "tools/se/dtcc_roofs.py"],
        },
        {
            "title": "Building analysis and environmental analysis",
            "body": """
Clicking a building enables three tools:

| Tool | What it does | Where it is documented |
|---|---|---|
| **Façade Inspection** | captures façade views, estimates the window-to-wall ratio with a vision model, detects defects, saves the ratio | **10. AI, ML & Vision Models** |
| **Rooftop PV Estimate** | PVGIS yield for 80% of the footprint at 0.2 kWp/m², 35° tilt, facing south, 14% loss | **13. Analysis Inventory** |
| **Run Energy Simulation** | an EnergyPlus shoebox run through EPSM | **6. Energy Simulation — EPSM & IDF** |

**Environmental Analysis** holds sun hours, incident radiation and thermal
comfort. They are run by clicking a point; method and equations are on
**11. Climate & Environmental Analysis**, and recordings and live examples on
**13. Analysis Inventory**.

**Their panels are hard to read.** The panels were styled for the old dark
sidebar: labels, readouts and legend text are white (`rgba(255,255,255,…)`)
and now nearly vanish on the light sidebar.
""",
            "files": ["assets/viewer/js/facade_inspector.js", "assets/viewer/js/pvgis.js", "assets/viewer/js/energy_sim.js"],
        },
        {
            "title": "Traffic — Västtrafik public transport",
            "body": """
All three layers go through the backend. The backend holds the Västtrafik
OAuth2 credentials (`VASTTRAFIK_CLIENT_ID`, `VASTTRAFIK_CLIENT_SECRET`), so no
key reaches the browser.

| Layer | Endpoints | Refresh | How it is drawn |
|---|---|---|---|
| **Live Transit & Stops** | `/api/vasttrafik/stops`, `/positions`, `/journey/{ref}`, `/departures/{gid}` → Västtrafik Planera Resa v4 | vehicle positions every 5 s | stops as blue "B" icons with names. Trams and buses are drawn on a canvas as circles in their line colour, with a glow and a short trail, and a "VÄSTTRAFIK LIVE" count of trams and buses. Hovering a vehicle shows its next stops; clicking a stop opens its departures (line, destination, time, delay, cancellations) |
| **Disruptions** | `/api/vasttrafik/disruptions` → Västtrafik traffic situations | fetched **once** per page load | a list in a side panel, not map markers. Severity dot: severe red, moderate orange, slight yellow; affected lines as badges |
| **Commuter Parking** | `/api/vasttrafik/parking`, `/parking/{id}/availability` → Västtrafik parking API | availability on click; the list once per load | green "P" icons. Availability bar: green above 40% free, yellow above 15%, red below |

The query area is fixed to Gothenburg in the backend. Keys and services are
listed on **14. Services, Keys & Access**.
""",
            "files": ["assets/viewer/js/vasttrafik.js", "assets/viewer/js/trafik_canvas.js"],
        },
        {
            "title": "Traffic — Trafikverket roads",
            "body": """
**Source.** One backend call, `/api/trafikverket/data`, fetches four object
types from Trafikverket's open traffic API (trafikinfo v2) with the key
`TRAFIKVERKET_API_KEY` and caches them for 60 s. If the API cannot be reached,
the viewer uses the stored `trafikverket_data.json`, labelled "offline
snapshot". A collector also keeps a snapshot in `trafikverket.db`, which can
be browsed in the **Data Explorer → Traffic**.

| Layer | Refresh | How it is drawn |
|---|---|---|
| **Traffic Cameras** | the photo refreshes every 30 s while its popup is open | blue camera icons; clicking opens the latest photo |
| **Traffic Flow** | every 5 minutes | points 8–26 px by flow: green below 200 vehicles/h, amber 200–600, red above 600 |
| **Road Conditions** | with the data | points coloured by condition code: green (normal), amber, red (worst) |
| **Rest Stops & Parking** | with the data | P icons, green when open, grey otherwise |

All four have hover tooltips.
""",
            "files": ["assets/viewer/js/trafikverket.js", "frontend/public/trafikverket_data.json", "trafikverket.db"],
        },
        {
            "title": "Statistics — SCB",
            "body": """
**Source.** The browser asks Statistics Sweden's open map service directly (the
WFS at `geodata.scb.se`), for a fixed box around Gothenburg and at most 10,000
features, with no key needed. Household income is joined in the backend,
`/api/scb/deso-income`, from SCB's statistics database (table TAB6684). A
layer is fetched the first time it is switched on, then kept in the browser.

**Twelve layers, 50 year versions** (a year menu per layer):

| Layer | Drawn as |
|---|---|
| Population grid (1 km) | six classes: 1–49, 50–149, 150–299, 300–599, 600–999, 1,000+ inhabitants |
| Household income (DeSO, median) | red → yellow → green from lowest to highest |
| DeSO zones · RegSO zones | statistical area outlines |
| Urban areas (tätorter) · Small settlements (småorter) | settlement outlines |
| Green areas (grönområden) | green polygons |
| Workplace, business and retail zones | fixed colour per group |
| Holiday cottages (fritidshus) · Statistical grid (1 km) | outlines |

Hovering shows the values. Switching a layer on moves a 3D view to Satellite and
turns the camera to look straight down.

The (i) text says 47 layers; the code has 12 groups with 50 year versions.
""",
            "files": ["assets/viewer/js/scb_layers.js"],
        },
        {
            "title": "Urban analysis",
            "body": """
| Layer | What it is | Notes |
|---|---|---|
| **Green Index** | points on a ~280 m grid coloured by distance to the nearest green area, $e^{-d/200}$ | method on **11. Climate & Environmental Analysis** |
| **Heat Island Proxy** | ~667 m cells, extruded 80 m, coloured by a building-stock score (energy class, age, use) lowered near green | not a temperature |
| **Green Accessibility** | points in three distance bands: under 400 m, 400–800 m, over 800 m | straight-line distance |
| **Space Syntax** | street segments coloured by centrality: betweenness (through-movement), integration (closeness) or reach (network within 1 km), with a Recompute control | see *Space syntax* below, and the live example on **13. Analysis Inventory** |

**Data.** Green areas come from `assets/gothenburg_greenspaces.json`, 22,851
OpenStreetMap areas. That file exists **only** in `assets/`.

- **Where it fails:** the development server returns the viewer's HTML page
  instead of the file (checked 2026-09-15), and the FastAPI backend does not
  serve it either.
- **Effect:** there the Green Index and Accessibility quietly fall back to
  "building proxies" (some building types used as stand-ins for green).
- **Where it works:** only when `assets/` is served directly (`launch.py`).
""",
            "files": ["assets/viewer/js/urban_analysis.js", "assets/gothenburg_greenspaces.json",
                      "backend/space_syntax.py"],
        },
        {
            "title": "Space syntax — street-network centrality",
            "body": """
Switched on from Urban Analysis. The viewer asks the backend for the streets in
the current view and colours every segment by one of three measures; thicker,
hotter lines are more central. It reads best from straight above — the analysis
is two-dimensional.

| Measure | What it answers | Computed as |
|---|---|---|
| **Betweenness** ("choice") | which streets carry through-movement: how often a street lies on the shortest path between other places | betweenness centrality, sampled from 500 source nodes on large networks (the result is then marked *approx.*) |
| **Integration** | how central a street is — how close it is to everywhere else | closeness centrality, exact; the slowest of the three |
| **Reach** | how much of the network is within 1 km of a street | number of intersections reachable within the radius |

**The chain.** `assets/viewer/js/space_syntax.js` → `/api/urban/space-syntax` →
OpenStreetMap streets through Overpass → `backend/space_syntax.py`, which builds
a graph of intersections (nodes) and street segments (edges weighted by their
length in metres) with `networkx`, computes the measure per node, and gives each
segment the mean of its nodes. The response is plain GeoJSON with a `value` and a
0–1 `value_norm` per segment, so the engine can later be swapped for the
Spatial Morphology Group's Pstalgo without touching the viewer.

**Area and speed.** The request is clamped to about 0.9 km each way around the
view centre, which is roughly 2,250 segments and 7,800 intersections in central
Gothenburg. Measured on this computer on 2026-09-16: **betweenness 17 s, reach
about 40 s, integration 98 s**. The clamp matters: at 3.3 km each way a
betweenness run did not finish in eleven minutes. Zoom in and press *Recompute
for current view* to analyse a smaller area.

**What it needs.** The `networkx` package in the backend environment (pinned in
`requirements.txt`), and the Overpass service for the street download.
""",
            "files": ["assets/viewer/js/space_syntax.js", "backend/space_syntax.py"],
        },
        {
            "title": "Info buttons, legends and layer docs",
            "body": """
**The (i) buttons.**

- `layer_docs.js` holds a title, description and source for 23 layers.
- `ui.js` fills each (i) button from it, unless the HTML already carries the
  text.
- One shared tooltip opens on click.
- SCB rows build their own (i) buttons from the layer list.

**Legends.** Each overlay draws its own: the building legend, the Urban
Analysis legend, the analysis panels, the SCB status text, the Västtrafik
canvas legend and the Trafikverket status line.

**Sidebar memory.** Which sections are open is kept in the browser
(`ppg.viewer.sections`). A folded section shows how many of its layers are on,
and the Display header names the active base map.

""",
            "files": ["assets/viewer/js/layer_docs.js", "assets/viewer/js/legend.js", "assets/viewer/js/ui.js"],
        },
    ],
}

UK_VIEWER = {
    "title": "UK · Viewer Layers",
    "stage": "result",
    "purpose": """
The UK viewer, `assets/uk_3d.html`: one page for five areas — four London
districts and Rotherham — with far fewer layers than Gothenburg. It has no
traffic, no statistics, no terrain relief and no Environmental Analysis
section (the three analyses sit under Building Analysis instead). This tab
lists what is there and what is hidden or missing. Everything
was read from the served code (`assets/viewer/js/`) and the UK building files
on 2026-09-15.
""",
    "overview": {
        "title": "What the UK viewer has",
        "subtitle": "In sidebar order.",
        "items": [
            ("City pills", "King's Cross, Westminster, Canary Wharf, Southwark (all London) and Rotherham; switching reloads the page."),
            ("Building Analysis", "The building card, façade inspection, rooftop PV, an EnergyPlus run — and sun hours, radiation and comfort."),
            ("Base Map", "Light, Dark, Satellite, Photorealistic 3D — no Terrain relief."),
            ("Additional Layers", "Buildings with Use type / Energy / Year era colours, OSM Buildings, the street network — and two Swedish layers that should not be there."),
            ("Urban Analysis", "Green index and green accessibility from live OpenStreetMap data; no heat-island proxy, no space syntax."),
        ],
    },
    "sections": [
        {
            "title": "How the viewer is put together",
            "body": """
**The page and its profile.** `assets/uk_3d.html` is the page;
`assets/uk_3d.meta.js` sets `VIEWER_PROFILE`: country `gb`, five cities, one
building file per city (`uk/buildings_<city>.json`), and the eight English
Housing Survey age bands. The city pills (`city_switcher.js`) reload the page
with `?city=`.

**Scripts.** The same `bootstrap.js` list as Gothenburg, **without** the four
Swedish scripts (`trafik_canvas.js`, `vasttrafik.js`, `trafikverket.js`,
`scb_layers.js`).

**Not in the UK viewer:**

- the Display thumbnails, the Color By dropdown and the Terrain relief map;
- the Environmental Analysis section;
- Traffic and Statistics (hidden, and their scripts never load);
- the heat-island proxy and Space Syntax;
- the compass and top-view buttons.
""",
            "files": ["assets/uk_3d.html", "assets/uk_3d.meta.js", "assets/viewer/js/city_switcher.js",
                      "assets/viewer/js/bootstrap.js"],
        },
        {
            "title": "Base maps",
            "body": """
Four radio buttons, the same sources as Gothenburg:

| Base map | Source | Key needed |
|---|---|---|
| **Light** (default) | Esri Canvas Light Gray, or CARTO with `CARTO_API` | none |
| **Dark** | Esri Dark Gray Canvas, or CARTO | none |
| **Satellite** | Esri World Imagery | none |
| **Photorealistic 3D** | Google Photorealistic 3D Tiles through Cesium ion | Cesium ion token |

There is no Terrain relief: the hillshade exists only for Gothenburg. As in
Sweden, the globe has no terrain model, and the viewer's own buildings are
hidden in 3D mode.
""",
            "files": ["assets/viewer/js/cesium.js", "assets/viewer/js/layers.js"],
        },
        {
            "title": "Buildings — data and colours",
            "body": """
**Data.** One file per area, with OpenStreetMap footprints; how they are built
is on the United Kingdom tab of **3. Pipelines**.

| Area | File | Buildings | With a certificate | Class estimated from the English Housing Survey |
|---|---|---|---|---|
| King's Cross | `buildings_london_kings_cross.json` | 3,018 | 319 | 1,499 |
| Westminster | `buildings_london_westminster.json` | 1,590 | 177 | 533 |
| Canary Wharf | `buildings_london_canary_wharf.json` | 1,283 | 455 | 436 |
| Southwark | `buildings_london_southwark.json` | 1,829 | 120 | 612 |
| Rotherham | `buildings_rotherham.json` | 14,483 | 7,824 | 4,414 |
| **Total** | | **22,203** | **8,895** | **7,494** |

The energy class comes from the certificate register where an address matches.
Otherwise it is estimated from the English Housing Survey band shares
(`epc_source` starting with `ehs_prior`). The counters at the top are computed
from the loaded file, unlike Gothenburg's fixed text. The Buildings (i) text
still says "10,235 building footprints across 5 areas"; the files hold 22,203.

**Colours** — three tabs: **Use type**, **Energy** and **Year era**. Use type
and Energy use the same colours as Sweden. Year era uses the eight survey age
bands: pre-1919, 1919–44, 1945–64, 1965–80, 1981–90, 1991–2002, 2003–13,
post-2013.

**Year era is mostly grey.** The colouring reads only `tabula_period`, but the
legend counts `tabula_period` *or* `tabula_period_used`.

- Only **7,697 of 22,203** buildings have `tabula_period`.
- A further 8,530 have only `tabula_period_used`: they are counted in the legend
  but drawn grey.
- In the London districts almost nothing is coloured (King's Cross: 14 of
  3,018).
""",
            "files": ["frontend/public/uk", "assets/viewer/js/legend.js", "assets/viewer/js/cesium.js"],
        },
        {
            "title": "Additional layers",
            "body": """
| Layer | Data | Behaviour |
|---|---|---|
| **OSM Buildings** | Cesium ion OSM Buildings | switched on at start, but only visible in the Photorealistic 3D map |
| **Street network** | `/api/osm/roads` → OpenStreetMap through Overpass | works as in Sweden: live, cached per area |
| **Trees & shrubs** | the **Gothenburg** file `dtcc_vegetation.json` | should not be here: `vegetation.js` has no country check, so the Gothenburg trees are loaded. It is on by default but draws nothing near London or Rotherham |
| **Pitched roofs** | the **Gothenburg** file `roofs_gothenburg.json` | should not be here: the roof file is matched to buildings by their position in the list, so switching it on would put Gothenburg roof shapes on unrelated UK buildings |
""",
            "files": ["assets/viewer/js/vegetation.js", "assets/viewer/js/roofs.js", "assets/viewer/js/street_network.js"],
        },
        {
            "title": "Building analysis, including the environmental analyses",
            "body": """
**The building tools** are the same as in Sweden (façade inspection, rooftop PV,
EnergyPlus run). The simulation is sent with country `gb` and the city, so it
uses the London City or Doncaster Sheffield weather file.

**Sun hours, incident radiation and thermal comfort** appear under Building
Analysis, below a "Site analysis · click a point" label. The UK page has no
Environmental Analysis section, so the scripts fall back to that group. They
use the UK buildings and UK weather files; there is no tree shading, since
trees exist only for Gothenburg. Sun-hours clock labels use UTC+0, plus one
hour in summer. Methods are on **11. Climate & Environmental Analysis**.

**Address search** (Nominatim) is limited to the UK and adds the city and
"United Kingdom" to the query.
""",
            "files": ["assets/viewer/js/sunhours.js", "assets/viewer/js/search.js"],
        },
        {
            "title": "Urban analysis",
            "body": """
**Green Index** and **Green Accessibility** work as in Sweden, with one
difference in the data. There is no pre-built file: green areas are fetched
live through `/api/urban/green-areas` from OpenStreetMap (Overpass), for a box
of ±0.09° latitude and ±0.14° longitude around the view centre, and cached in
the backend.

**Heat Island Proxy** is hidden, because it needs Swedish certificate data.
**Space Syntax** is not in the UK page at all.
""",
            "files": ["assets/viewer/js/urban_analysis.js", "backend/main.py"],
        },
    ],
}

VIEWER_LAYERS = {
    "number": 12,
    "title": "Viewer Layers & Visualisation",
    "stage": "result",
    "purpose": """
Everything that can be switched on in the two 3D viewers: base maps, the
building layer and its colours, extra layers, live traffic, statistics and
analysis overlays. For each: where the data comes from, whether it is live or
pre-built, and how it is drawn. Sweden and the UK have very
different viewers — Gothenburg has traffic, SCB statistics, terrain relief and
its own Environmental Analysis section — so each has its own tab. The analyses
the viewers can run are on **13. Analysis Inventory**; the colour-vision
palette of the web app is in `frontend/src/config/colors.ts`.
""",
    "tabs": [("Sweden", SE_VIEWER), ("United Kingdom", UK_VIEWER)],
}

# ─────────────────────────────────────────────────────────────────────────────
LIMITATIONS = {
    "number": 16,
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
    "number": 13,
    "title": "Analysis Inventory",
    "stage": "method",
    "purpose": """
Every analysis the tool can run, one card each: where it lives in the tool,
what it computes, what it runs on, and which page documents its method. The
3D-viewer analyses come with a **recording** of them running in the real
viewer, and every analysis the backend can run without writing anything has a
**live example**. The example sends the same request the tool sends and draws
the answer, so you can try another place, day or price. The tables below the
cards are the index: where each analysis runs, what is built in and what is
external, and where each appears in the app.
""",
    "overview": {
        "title": "Seventeen analyses in five families",
        "subtitle": "Grouped by what they compute, not by which page of the app shows them.",
        "items": [
            ("Environmental", "Sun hours, incident radiation and outdoor comfort around a clicked point — recorded and live."),
            ("Building energy and cost", "EnergyPlus through EPSM, the Pareto optimiser (live), rooftop PV (live), heating systems, LCA."),
            ("Decision support", "Prioritising buildings and choosing packages under uncertainty — both run in the browser."),
            ("Urban", "Space syntax — reactivated in the viewer, and live here — plus the city-wide green and heat indices."),
            ("AI and data", "Façade defects, window-to-wall ratio, the data assistant and TABULA matching."),
        ],
    },
    "sections": [
        {
            "title": "The full inventory",
            "badge": "method",
            "table": [
                ["Analysis", "Runs in", "Method", "Origin", "Status on 2026-09-15"],
                ["EnergyPlus simulation", "EPSM service :8010", "Full-year simulation of a single-zone shoebox model", "External — EPSM, Chalmers", "works; median 12 s per building in a batch"],
                ["Optimisation (Pareto front)", "Backend /api/optimize", "Enumerate combinations, degree-day physics, skyline on cost/carbon/energy", "Adapted from DT4PED", "works; 71,820 combinations in under 2 s"],
                ["Retrofit prioritisation (MCDA)", "Browser", "Weighted expert-rule score over four criteria; AHP weights", "Built in", "works"],
                ["Decision under uncertainty", "Browser", "Minimax regret, uncertainty range, Hurwicz over price scenarios", "Built in", "works"],
                ["Retrofit scenario analyser", "Browser + backend", "Package comparison against a simulated baseline", "Built in", "works"],
                ["Life-cycle assessment", "Browser + Boverket API", "Embodied carbon from emission factors plus operational carbon", "Built in", "works"],
                ["Heating-system comparison", "Browser", "Economics on top of an unchanged demand; SPF catalogue", "Built in", "works"],
                ["Sun hours", "Backend /api/analysis/sun-hours", "Astronomical sun position + height-field shadow test", "Built in, clean-room", "works"],
                ["Incident radiation", "Backend /api/analysis/incident-radiation, …/incident-surfaces", "EPW cumulative sky matrix, 145 patches", "Built in, clean-room", "works"],
                ["Thermal comfort (UTCI)", "Backend /api/analysis/thermal-comfort", "UTCI + SolarCal mean radiant temperature", "Built in, on pythermalcomfort", "fails on the local backend: library not installed"],
                ["Rooftop PV yield", "Backend /api/pvgis → EC PVGIS", "Orientation- and tilt-aware annual yield", "External — EC JRC", "works (live external call)"],
                ["Space-syntax centrality", "Backend /api/urban/space-syntax", "Street-network centrality with networkx", "Built in", "works; the viewer layer was reconnected on 2026-09-16"],
                ["Green index / accessibility / heat-island proxy", "Browser (urban_analysis.js)", "Distance to OSM green areas; building-stock score", "Built in", "works; indices, not temperatures"],
                ["TABULA archetype matching", "Pipeline + backend", "Lookup by construction period and building type", "External typology, own matcher", "works"],
                ["Façade defect detection", "Host ML service :8020", "Object detection over façade images", "External ML project", "service not running"],
                ["Window-to-wall ratio", "Backend /api/estimate-wwr", "Vision-model estimate from a façade image", "Built-in prompt, hosted model", "works with API keys; saves store position 0,0"],
                ["Data assistant", "Backend /api/chat", "Tool-calling LLM over the project's own datasets", "Built in", "works with API keys"],
            ],
        },
        {
            "title": "How the recordings and live examples were made",
            "body": """
**Recordings.** Each animation is the real 3D viewer (the development server
on port 5173), driven by a script in a headless browser:

- **Place:** a fixed point in central Gothenburg (57.6985 N, 11.9690 E).
- **Camera:** set by the script, which then switches the analysis on and runs
  it through the real backend.
- **Stepping:** the script moves the viewer's own time slider or clicks its
  season buttons, reading the map image after each step.
- **Rendering:** software rendering (no graphics card), so the tree layer was
  switched off to keep it responsive.
- **Cropping:** the sidebar is cropped out, because the analysis panels' white
  text is unreadable on the light sidebar — a real viewer bug, listed on
  **12. Viewer Layers & Visualisation**. The caption bar and colour key in each
  animation are added afterwards and state what the panel would show.

Thermal comfort could not come from the local backend, which is missing its
library. Its one request was answered by the same engine,
`backend/thermal_comfort.py`, run next to the browser.

**Live examples.** The *Run it* panels call the backend at
`http://127.0.0.1:8080`, or at the address in the `PPG_API` environment
variable, with the same request body the tool sends. Only analyses that write
nothing and cost nothing are offered:

- **Not offered:** EnergyPlus runs are stored, and the AI models are paid
  requests.
- **External services:** PVGIS and the street-network download call them live,
  just as the tool does.

If the backend is unreachable, or answers with an error, a panel shows a
**stored example** instead and says so. The stored examples were computed on
2026-09-15 by the same code for the same Gothenburg point, and are kept in
`logbook/assets/analysis/examples/`.
""",
            "files": ["logbook/scripts/analysis_gallery.py", "logbook/scripts/live_requests.py",
                      "logbook/assets/analysis"],
        },
        {
            "title": "Built in versus external",
            "badge": "metadata",
            "body": """
Only four things in the list are not this project's own code:

| External | What it is | Consequence |
|---|---|---|
| **EPSM** | containerised EnergyPlus manager, :8010 | needs Docker running; its end-use schema limits what we can report (**16. Known Limitations**) |
| **PVGIS** | European Commission solar API | network dependency; not cached — a result is kept only when a user saves it |
| **Façade defect model** | trained detector from a separate ML project | needs its own torch environment on the host |
| **Vision / chat models** | hosted LLM APIs | need API keys; degrade to a heuristic or refuse rather than failing hard |

Everything else runs from source in this repository, which is why the methods
can be documented to the level of individual thresholds elsewhere in this
logbook.

**One missing Python package.** The backend running on this computer (the
project's `.venv`) lacks `pythermalcomfort`, although `requirements.txt` pins
it (2.10.0), so thermal comfort fails there with a server error while the
Docker image, which installs `requirements.txt`, runs it. `networkx` was
missing in the same way until 2026-09-16 and is now installed, which is what
space syntax needs.
""",
            "files": ["requirements.txt"],
        },
        {
            "title": "Where each one surfaces in the app",
            "badge": "result",
            "table": [
                ["Surface", "Analyses available there"],
                ["3D viewer — Sweden", "Environmental Analysis: sun hours · incident radiation · thermal comfort. Building Analysis: façade inspection (WWR, defects) · rooftop PV · EnergyPlus run. Urban Analysis: green index · heat-island proxy · green accessibility · space syntax"],
                ["3D viewer — UK", "The same three environmental analyses, but placed under Building Analysis; green index and accessibility; no heat-island proxy, no space syntax"],
                ["Wizard step 2", "Retrofit prioritisation · façade defect detection"],
                ["Wizard step 3", "Baseline EnergyPlus simulation"],
                ["Wizard step 4", "Optimisation · decision under uncertainty · heating-system comparison · LCA"],
                ["Analysis Tools page", "The registry itself, with per-method attribution"],
                ["Data Explorer (app)", "Scraped market data · SCB statistics · EPC dataset queries"],
                ["Chat widget", "The data assistant, over all of the above datasets"],
            ],
            "files": ["frontend/src/pages/AnalysisTools.tsx", "assets/viewer/js/bootstrap.js"],
        },
        {
            "title": "Status flags in the app's own registry",
            "badge": "metadata",
            "body": """
`AnalysisTools.tsx` carries a `status` per method. As of 2026-09-03 eight are
`integrated` — PVGIS, WWR estimation, façade defect detection, the optimisation
model, MCDA prioritisation, decision under uncertainty, the retrofit scenario
analyser and LCA — and one, **EPSM**, is `external`.

The registry flags nothing as planned or unavailable. The inventory above shows
what that hides: the façade defect service is not running, and thermal comfort
fails on the local backend for want of one package.
""",
        },
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
PROJECT_TEAM = {
    "number": 17,
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
            "title": "Credited collaborators — EPSM",
            "badge": "metadata",
            "body": """
Every EnergyPlus simulation in the tool runs on **EPSM**, the Energy
Performance Simulation Manager developed at Chalmers. Its developers are
credited here; they are not part of the core project team. How the tool uses
EPSM is on **6. Energy Simulation — EPSM & IDF**.
""",
            "table": [
                ["Name", "Role", "Contribution"],
                ["Sanjay Somanath", "Lead developer, EPSM",
                 "Developed EPSM, the simulation manager that queues and runs every EnergyPlus simulation in the tool and returns its energy-use results."],
                ["Alexander Hollberg", "Principal investigator, EPSM",
                 "Principal investigator for EPSM at Chalmers."],
            ],
            "files": ["docker-compose.epsm.yml"],
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

The simulation workflow is documented in **6. Energy Simulation — EPSM & IDF** and the
optimisation logic in **8. Optimisation Process**. Those pages are the
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
**14. Services, Keys & Access**.
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
    ("Methods", ["digital_twin", "shoebox_idf", "prioritisation",
                 "optimisation", "decision", "facade_ml", "climate_env",
                 "viewer_layers", "analysis_index"]),
    ("Reference", ["access", "script_browser", "limitations", "project_team"]),
]
