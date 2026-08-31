# Code Map — what each file does

**Snapshot: 2026-08-26.** A map of the code as it exists *today*, not a history.
Every entry below was read from the file itself (module docstring, header comment,
route decorator or import graph) rather than from memory.

Companion docs: **[NOTEBOOK.md](NOTEBOOK.md)** for the methods in full — why each
step is done that way, with thresholds, rationale and failure modes;
[README.md](README.md) for the project pitch,
[TROUBLESHOOTING.md](TROUBLESHOOTING.md) for failure modes,
[docker/README.md](docker/README.md) for containers.

This file answers *where is the code*. The notebook answers *why is it done this
way*. The [logbook](logbook/) is the browsable stage-by-stage version of both.

> **Stale-doc warning.** [CHANGELOG.md](CHANGELOG.md) and several `HOW_TO_*` /
> `*_RULES_ENGINE*` files still describe the original **Streamlit** app (v1.0.0,
> Jan 2026). That application no longer exists — and as of 2026-08-26 neither
> does its code. See [§10 Not wired in](#10-not-wired-in) for what was removed
> and what still has no caller.

---

## 1. The four runtimes

| Part | Entry point | Port | Start command |
|---|---|---|---|
| Backend API | [backend/main.py](backend/main.py) | 8000 | `python -m uvicorn backend.main:app --port 8000` |
| Wizard SPA | [frontend/](frontend/) (React 19 + Vite) | 5173 | `cd frontend && npm run dev` |
| 3D viewer (standalone) | [assets/gothenburg_3d.html](assets/gothenburg_3d.html) | 8765 | `python launch.py` |
| EPSM (EnergyPlus) | [docker-compose.epsm.yml](docker-compose.epsm.yml) | 8010 | `docker compose -f docker-compose.epsm.yml up -d` |

The Vite dev server also serves the viewer directly (middleware in
[frontend/vite.config.ts](frontend/vite.config.ts)), so `launch.py` is only needed
for the standalone viewer. Vite proxies `/api` to `localhost:8000`; override with
`VITE_API_PROXY_TARGET` if the backend runs elsewhere.

**Vite binds IPv6 `localhost` only** — use `http://localhost:5173`, never `127.0.0.1:5173`.

---

## 2. Backend — `backend/`

FastAPI, **70 routes** in one 4,748-line module.

| File | Role |
|---|---|
| [backend/main.py](backend/main.py) | All 70 HTTP routes. Wraps the EPC / TABULA / Boverket / sensitivity modules. Only local imports are `tools.idf.generate_idf` and `backend.simdb`. |
| [backend/config.py](backend/config.py) | Runtime config; secrets read from env, never source. |
| [backend/simdb.py](backend/simdb.py) | SQLite simulation datastore — replaced the old flat `data/simulation_database.json`. |
| [backend/sun_hours.py](backend/sun_hours.py) | Direct sun-hours over a ground disc. Clean-room implementation (no Ladybug code); compact astronomical sun-position algorithm. |
| [backend/incident_radiation.py](backend/incident_radiation.py) | Incident solar radiation on a ground disc. Clean-room implementation, EPW-driven sky matrix. |
| [backend/thermal_comfort.py](backend/thermal_comfort.py) | Outdoor UTCI + solar mean radiant temperature. Builds on `pythermalcomfort`. |
| [backend/space_syntax.py](backend/space_syntax.py) | Pure-Python street-network centrality (space syntax). |

### Route groups

| Prefix | Count | Serves |
|---|---|---|
| `/api/buildings*`, `/api/building`, `/api/districts`, `/api/geocode` | 8 | Building lookup, bbox queries, district and Gothenburg boundaries |
| `/api/epc/*`, `/api/tabula/match`, `/api/boverket/materials` | 5 | EPC snapshot & passport, archetype matching, material database |
| `/api/uk/*` | 7 | UK cities, EHS, EPC band priors, TABULA, retrofit cost, buildings |
| `/api/simulation-*`, `/api/baseline-batch-lookup` | 11 | EPSM submit / status / results / batch / timeseries |
| `/api/facade-*`, `/api/wwr-*`, `/api/estimate-wwr` | 10 | Facade images, ML defect detection, GPT-4 vision WWR, WWR store |
| `/api/pvgis*` | 4 | Rooftop PV estimation + cache |
| `/api/analysis/*` | 4 | Sun hours, incident radiation, incident surfaces, thermal comfort |
| `/api/vasttrafik/*`, `/api/trafikverket/data`, `/api/osm/roads` | 10 | Live transit, traffic, road network |
| `/api/urban/*`, `/api/scb/deso-income` | 3 | Green areas, space syntax, SCB income |
| `/api/optimize`, `/api/recommend-retrofit`, `/api/chat`, `/api/energy-price` | 4 | Optimiser, agentic retrofit advice, data assistant, price feed |
| `/api/health`, `/api/status`, `/api/country-profile` | 3 | Health & profile |
| `/gothenburg_3d.html`, `/uk_3d.html` | 2 | Viewer HTML passthrough |

> `/api/facade-detect` **proxies to a separate host service on :8020**
> ([tools/ml/facade_detect_service.py](tools/ml/facade_detect_service.py)) — don't
> put anything else on that port.

---

## 3. Frontend — `frontend/src/`

90 TS/TSX files, ~30,700 lines.

### Routes to pages

| Route | Page |
|---|---|
| `/` | [LandingPage.tsx](frontend/src/pages/LandingPage.tsx) |
| `/workspace` | [WorkspaceSelect.tsx](frontend/src/pages/WorkspaceSelect.tsx) |
| `/data` · `/data/uk` | [DataExplorer.tsx](frontend/src/pages/DataExplorer.tsx) · [UKDataExplorer.tsx](frontend/src/pages/UKDataExplorer.tsx) |
| `/pathways` | [Scenarios.tsx](frontend/src/pages/Scenarios.tsx) |
| `/analysis` | [AnalysisTools.tsx](frontend/src/pages/AnalysisTools.tsx) |
| `/viewer` · `/viewer/uk` | [MapViewer.tsx](frontend/src/pages/MapViewer.tsx) · [UKMapViewer.tsx](frontend/src/pages/UKMapViewer.tsx) |
| `/budget` | [Budget.tsx](frontend/src/pages/Budget.tsx) |
| `/reports` | [SampleReports.tsx](frontend/src/pages/SampleReports.tsx) |
| `/team` | [ProjectTeam.tsx](frontend/src/pages/ProjectTeam.tsx) |
| `/map` | redirect to `/viewer` |

### The 5-step wizard

Steps 3–5 **branch on project type** (`Step3Router` … `Step5Router` in
[App.tsx](frontend/src/App.tsx)): Energy-Community / Renewable-Energy projects get a
different page from Renovation projects.

| Step | Renovation track | EC / RE track |
|---|---|---|
| 1 — Define Project | [DefineProject/index.tsx](frontend/src/pages/DefineProject/index.tsx) | same |
| 2 — Building Data & Prioritisation | [DataCoverage.tsx](frontend/src/pages/DataCoverage.tsx) | same |
| 3 — Select & Baseline | [BaselineSetup.tsx](frontend/src/pages/BaselineSetup.tsx) | [DataAssumptions.tsx](frontend/src/pages/DataAssumptions.tsx) |
| 4 — Renovation Calculator | [RenovationSimulator.tsx](frontend/src/pages/RenovationSimulator.tsx) | [StepScenarios.tsx](frontend/src/pages/StepScenarios.tsx) |
| 5 — Report | [RenovationReport.tsx](frontend/src/pages/RenovationReport.tsx) | [ResultsBudget.tsx](frontend/src/pages/ResultsBudget.tsx) |

[RenovationPackages.tsx](frontend/src/pages/RenovationPackages.tsx) is not routed —
it is rendered *inside* `StepScenarios`.

### Components

| Component | Role |
|---|---|
| [WizardLayout.tsx](frontend/src/components/WizardLayout.tsx) | Wizard shell + the **single** Back/Continue footer |
| [wizardNav.ts](frontend/src/components/wizardNav.ts) | Module singleton the footer reads at click time; step pages register `onNext`/`onBack` and gate `canNext` here instead of drawing their own buttons |
| [RetrofitPriorityPanel.tsx](frontend/src/components/RetrofitPriorityPanel.tsx) | Step 2 MCDA ranking of buildings |
| [FacadeDefectPanel.tsx](frontend/src/components/FacadeDefectPanel.tsx) | Step 2 facade photo upload + ML defect detection |
| [DecisionAnalysisPanel.tsx](frontend/src/components/DecisionAnalysisPanel.tsx) | Step 4 minimax-regret / Hurwicz analysis |
| [HeatingSystemPanel.tsx](frontend/src/components/HeatingSystemPanel.tsx) | Step 4 heating-system swap comparison |
| [OptimizerPanel.tsx](frontend/src/components/OptimizerPanel.tsx) · [ParetoChart.tsx](frontend/src/components/ParetoChart.tsx) · [ParallelCoordinates.tsx](frontend/src/components/ParallelCoordinates.tsx) | Multi-objective optimisation UI |
| [AssemblyBuilder.tsx](frontend/src/components/AssemblyBuilder.tsx) | Component build-up editor (layers to U-value) |
| [ChatWidget.tsx](frontend/src/components/ChatWidget.tsx) | "Ask the data" assistant, calls `/api/chat` |
| [LocationMap.tsx](frontend/src/components/LocationMap.tsx) | Step 1 map + municipality boundary gating |
| [ClimateGoalPanel.tsx](frontend/src/components/ClimateGoalPanel.tsx) · [ClimateGoalBuildingTable.tsx](frontend/src/components/ClimateGoalBuildingTable.tsx) | Climate-target tracking |
| [MethodEquationsPanel.tsx](frontend/src/components/MethodEquationsPanel.tsx) | Methods + equations reference |
| [BaselineLoadProfile.tsx](frontend/src/components/BaselineLoadProfile.tsx) | Baseline demand profile chart |
| [CountryCitySelector.tsx](frontend/src/components/CountryCitySelector.tsx) · [TopBar.tsx](frontend/src/components/TopBar.tsx) · [BrandedHeader.tsx](frontend/src/components/BrandedHeader.tsx) · [ThemeToggle.tsx](frontend/src/components/ThemeToggle.tsx) · [SettingsModal.tsx](frontend/src/components/SettingsModal.tsx) | Chrome |
| [PanelShell.tsx](frontend/src/components/PanelShell.tsx) · [CollapsibleCard.tsx](frontend/src/components/CollapsibleCard.tsx) · [DataLayout.tsx](frontend/src/components/DataLayout.tsx) · [StepIndicator.tsx](frontend/src/components/StepIndicator.tsx) · [ErrorBoundary.tsx](frontend/src/components/ErrorBoundary.tsx) | Layout primitives |
| `panels/` | [EpcPanel](frontend/src/components/panels/EpcPanel.tsx), [TabulaPanel](frontend/src/components/panels/TabulaPanel.tsx), [WikellsPanel](frontend/src/components/panels/WikellsPanel.tsx), [SensitivityPanel](frontend/src/components/panels/SensitivityPanel.tsx), [EubuccoValidationPanel](frontend/src/components/panels/EubuccoValidationPanel.tsx), [BuildingMap](frontend/src/components/panels/BuildingMap.tsx), [InnovativeCharts](frontend/src/components/panels/InnovativeCharts.tsx) |

### Logic & config

| File | Role |
|---|---|
| [store/wizard.ts](frontend/src/store/wizard.ts) | Zustand store — the wizard's whole state |
| [api/client.ts](frontend/src/api/client.ts) | Single HTTP client for `/api/*` |
| [utils/retrofitPriority.ts](frontend/src/utils/retrofitPriority.ts) | Step 2 weighted priority score (AHP weights) |
| [utils/regretAnalysis.ts](frontend/src/utils/regretAnalysis.ts) | Minimax-regret / range / Hurwicz under energy-price scenarios |
| [utils/assemblyCosting.ts](frontend/src/utils/assemblyCosting.ts) · [componentAreas.ts](frontend/src/utils/componentAreas.ts) | Cost + area derivation for build-ups |
| [utils/hvacAnalysis.ts](frontend/src/utils/hvacAnalysis.ts) | Heating-system economics on top of demand |
| [utils/reportGenerator.ts](frontend/src/utils/reportGenerator.ts) | Step 5 report assembly |
| [utils/baselineShortlist.ts](frontend/src/utils/baselineShortlist.ts) · [materialRecommendation.ts](frontend/src/utils/materialRecommendation.ts) · [ukArchetype.ts](frontend/src/utils/ukArchetype.ts) | Shortlisting, material picks, UK archetype mapping |
| [config/colors.ts](frontend/src/config/colors.ts) | **Central colour tokens** — colourblind-safe palette; change hues here, not per-component |
| [config/wikellsData.ts](frontend/src/config/wikellsData.ts) · [wikellsCarbonMapping.ts](frontend/src/config/wikellsCarbonMapping.ts) | Wikells cost catalogue + carbon mapping |
| [config/assemblyLayers.ts](frontend/src/config/assemblyLayers.ts) · [materialProperties.ts](frontend/src/config/materialProperties.ts) | Layer library and material physics |
| [config/hvacSystems.ts](frontend/src/config/hvacSystems.ts) | Swedish heating catalogue (SPF, cost, carbon) |
| [config/climateGoals.ts](frontend/src/config/climateGoals.ts) · [deliverables.ts](frontend/src/config/deliverables.ts) · [countryNav.ts](frontend/src/config/countryNav.ts) · [projectConfig.ts](frontend/src/config/projectConfig.ts) | Targets, deliverables, navigation, project types |
| [config/ukPlaceholderCostCarbon.ts](frontend/src/config/ukPlaceholderCostCarbon.ts) | **Synthetic placeholder data** — never present as real |

---

## 4. 3D viewer — `viewer/`

Classic scripts sharing globals — **no `import`/`export`**. Editing `viewer/`
alone changes nothing: [build.py](build.py) assembles them into
`assets/*_3d.html`, which is the artifact the browser loads. Validate with
`node --check <file>` before rebuilding.

| File | Lines | Role |
|---|---|---|
| [bootstrap.js](viewer/js/bootstrap.js) | 159 | Resolves active country/city, loads that location's building payload, wires the other scripts in order |
| [cesium.js](viewer/js/cesium.js) | 1128 | Viewer init, Google tiles, EUBUCCO overlay, colour modes, startup sequence |
| [ui.js](viewer/js/ui.js) | 576 | Click handler, hover tooltip, info panel |
| [layers.js](viewer/js/layers.js) | 62 | Layer controller — base maps (radio) + overlays |
| [legend.js](viewer/js/legend.js) | 294 | Legend tabs, performance cards, compare basket |
| [layer_docs.js](viewer/js/layer_docs.js) | 34 | Copy for every info button, kept out of `index.html` |
| [search.js](viewer/js/search.js) | 78 | Address geocoding via Nominatim |
| [city_switcher.js](viewer/js/city_switcher.js) | 50 | City pills for multi-city countries (UK) |
| [country_profile.js](viewer/js/country_profile.js) | 151 | Country KPI panel derived from loaded data |
| **Analysis** | | |
| [sunhours.js](viewer/js/sunhours.js) | 392 | Direct sun-hours disc |
| [incident.js](viewer/js/incident.js) | 390 | Incident solar radiation disc (EPW-driven) |
| [comfort.js](viewer/js/comfort.js) | 434 | Outdoor UTCI + solar MRT, hour scrub / season % |
| [energy_sim.js](viewer/js/energy_sim.js) | 160 | EnergyPlus shoebox simulation via EPSM |
| [pvgis.js](viewer/js/pvgis.js) | 95 | Rooftop PV via PVGIS |
| [space_syntax.js](viewer/js/space_syntax.js) | 162 | Street-network centrality overlay |
| [urban_analysis.js](viewer/js/urban_analysis.js) | 432 | City-wide overlays incl. green index |
| **Facade** | | |
| [facade_inspector.js](viewer/js/facade_inspector.js) | 784 | Camera fly, rubber-band crop, GPT-4 vision WWR estimate + save |
| [facade_comparison.js](viewer/js/facade_comparison.js) | 932 | Compare facades within/across buildings for prioritisation |
| **LiDAR / terrain** | | |
| [vegetation.js](viewer/js/vegetation.js) | 217 | Trees & shrubs from DTCC LiDAR |
| [roofs.js](viewer/js/roofs.js) | 184 | Pitched/gable roof caps from DTCC LiDAR |
| **Live city data** | | |
| [vasttrafik.js](viewer/js/vasttrafik.js) | 450 | Real-time transit — stops, vehicles, departures |
| [trafikverket.js](viewer/js/trafikverket.js) | 456 | Traffic cameras, road conditions |
| [trafik_canvas.js](viewer/js/trafik_canvas.js) | 621 | Canvas-based live vehicle animation |
| [scb_layers.js](viewer/js/scb_layers.js) | 519 | Statistics Sweden WFS overlays |
| [roads.js](viewer/js/roads.js) | 134 | OSM road network |
| [street_network.js](viewer/js/street_network.js) | 172 | Neutral OSM street underlay |

Also: [viewer/index.html](viewer/index.html) (the DOM contract — the scripts wire
by `getElementById`, so preserve every id) and
[viewer/styles/main.css](viewer/styles/main.css).

**Performance rule:** never one Cesium `Entity` per building (~186k kills the tab) —
one batched `Primitive` with per-instance colour.

---

## 5. Data pipeline — root scripts

| File | Lines | Role |
|---|---|---|
| [data_pipeline.py](data_pipeline.py) | 857 | **The core.** Loads EUBUCCO + EPC + TABULA, processes ~92k buildings, returns the viewer payload. Imported by 12 other modules. |
| [build.py](build.py) | 464 | Assembles the 3D viewers from `viewer/` sources + the pipelines. **The entry point.** |
| [launch.py](launch.py) | 100 | Starts static server (:8765) + backend (:8000) and opens the viewer |
| [visualize_3d_buildings.py](visualize_3d_buildings.py) | 2210 | **Broken** — `IndentationError` at line 22. Its docstring offers it as an equivalent to `build.py`; it does not run. Body is legacy code marked "do not edit". |

> **After every `build.py` run:** `python tools/se/ingest_districts.py`.
> `build.py` regenerates `buildings.json` and wipes district tags; skipping this
> drops `primary_area` to 0 and breaks the neighborhood picker and the chatbot's
> district tools (~75,719 of 92,973 should be tagged).

### EUBUCCO acquisition

[download_eubucco_sweden.py](download_eubucco_sweden.py) then `_v2.py` (Zenodo)
then `_v3.py` (DuckDB + S3). **v3 is current**; v1/v2 are superseded.
[convert_eubucco_to_parquet.py](convert_eubucco_to_parquet.py) and
[plot_eubucco_gothenburg.py](plot_eubucco_gothenburg.py) are ad-hoc helpers.

### Checks & analysis

| File | Role |
|---|---|
| [compare_floors.py](compare_floors.py) | Cross-check building floors: EUBUCCO SE23 vs Swedish EPC |
| [check_crs.py](check_crs.py) · [check_footprint.py](check_footprint.py) | WKB / geometry sanity checks |
| [check_material_overlap.py](check_material_overlap.py) · [material_analysis.py](material_analysis.py) | Wikells vs Boverket material overlap |
| [address_match_check.py](address_match_check.py) | Address-matching spot check |

---

## 6. `tools/`

### `tools/se/` — Sweden

| File | Role |
|---|---|
| [se_cities.py](tools/se/se_cities.py) | **Single source of truth** for adding a Swedish city |
| [build_city.py](tools/se/build_city.py) | Build `buildings_<slug>.json` from EUBUCCO + national EPC + TABULA |
| [download_eubucco_city.py](tools/se/download_eubucco_city.py) | Stream one city's NUTS-2 parquet from S3, clip to bbox |
| [ingest_districts.py](tools/se/ingest_districts.py) | Tag buildings with primärområde (96 official, Göteborgs Stad ArcGIS) |
| [geocode_epc.py](tools/se/geocode_epc.py) | Cached geocoder for EPC addresses the geometric match can't place |
| [dtcc_vegetation.py](tools/se/dtcc_vegetation.py) | Trees + shrubs from DTCC LiDAR (EPSG:3006 / SWEREF99) |
| [dtcc_roofs.py](tools/se/dtcc_roofs.py) | Per-building roof metrics for pitched-roof rendering |
| [dtcc_terrain_water.py](tools/se/dtcc_terrain_water.py) | Water mask + shaded-relief terrain image |
| [filter_vegetation_water.py](tools/se/filter_vegetation_water.py) | Drop trees that landed on water |

### `tools/uk/` — United Kingdom

| File | Role |
|---|---|
| [uk_data_pipeline.py](tools/uk/uk_data_pipeline.py) | Build UK payloads for London, Birmingham, Nottingham |
| [cities.py](tools/uk/cities.py) | UK focus areas the viewer can fly to |
| [ingest_epc.py](tools/uk/ingest_epc.py) | Official EPC open-data service client |
| [ingest_eubucco.py](tools/uk/ingest_eubucco.py) | EUBUCCO UK attributes (v0.2) |
| [ingest_tabula.py](tools/uk/ingest_tabula.py) | Parse EPISCOPE/TABULA England brochure (BRE 2014) into U-value archetypes |
| [ingest_ehs.py](tools/uk/ingest_ehs.py) | English Housing Survey 2024-25 annex tables (.ods, MHCLG) |
| [sample_epc_matches.py](tools/uk/sample_epc_matches.py) | Print/save a sample of building-to-EPC matches for review |

### `tools/idf/` — EnergyPlus input generation

| File | Role |
|---|---|
| [generate_idf.py](tools/idf/generate_idf.py) | Single-zone "shoebox" IDF from one building record. **Imported by `backend/main.py`.** |
| [geometry.py](tools/idf/geometry.py) | lon/lat ring to local-metre E+ surface vertices |
| [defaults.py](tools/idf/defaults.py) | Fallback constants when a record lacks TABULA/EPC values |

### `tools/ml/`

[facade_detect_service.py](tools/ml/facade_detect_service.py) — crack/defect
detector. Runs **on the host** (torch env, trained model) on **:8020**; the backend
proxies to it. Launch with [run_facade_service.ps1](tools/ml/run_facade_service.ps1).

### `scripts/`

[fetch_epc_db.py](scripts/fetch_epc_db.py) — ensures `epc_sweden.duckdb` (~461 MB)
is present; powers the chat assistant's whole-dataset questions.
**Open it read-only.**

---

## 7. Scrapers & scheduled jobs

| Source | Scraper | Exporter | Store | Cadence |
|---|---|---|---|---|
| Boplats (rentals) | [boplats_scraper.py](boplats_scraper.py) | [boplats_to_assets.py](boplats_to_assets.py) | `boplats_apartments.db` (688 KB) | daily |
| Booli (sales) | [booli_scraper.py](booli_scraper.py) | [booli_to_assets.py](booli_to_assets.py) | `booli_listings.db` (4.9 MB) | weekly |
| Trafikverket | [trafikverket_scraper.py](trafikverket_scraper.py) | — | `trafikverket.db` (676 KB) | on demand |

Booli is a Next.js site — the scraper reads the embedded page data, no paid API.
[boplats_notify.py](boplats_notify.py) sends a failure-alert email.

Runners: [tools/refresh_boplats.ps1](tools/refresh_boplats.ps1) / `.sh`,
[tools/refresh_booli.ps1](tools/refresh_booli.ps1) / `.sh`,
[run_boplats_daily.ps1](run_boplats_daily.ps1).
Linux scheduling: [deploy/systemd/](deploy/systemd/) — `ppg-boplats-refresh` and
`ppg-booli-refresh` `.service` + `.timer` pairs.

---

## 8. Data & artefacts

| Path | Size | Contents |
|---|---|---|
| `data/dtcc/` | 6.3 GB | DTCC LiDAR tiles (Chalmers, EPSG:3006) |
| `data/eubucco/` | 706 MB | EUBUCCO building geometry |
| `data/sensitivity/` | 654 MB | incl. `epc_sweden.duckdb` (461 MB, national EPC register) |
| `data/os/` | 596 MB | Ordnance Survey (UK, incl. Open UPRN) |
| `data/simulation_database.sqlite3` | 2.0 GB | EPSM run results (`backend/simdb.py`) |
| `data/epw/` | 20 MB | Weather files for sun / radiation / comfort |
| `data/districts/` | 1 MB | Primärområde boundaries |
| `data/uk_raw/`, `data/bso/`, `data/facade_images/` | — | UK source data, BSO, uploaded facade photos |
| `data/wikells_catalogue.json`, `wwr_database.json`, `epc_geocode_cache.json` | — | Cost catalogue, WWR store, geocode cache |

Build outputs in `assets/`: `buildings.json` (**57 MB** — fetch with
`cache: 'default'`, never `'no-store'`), `gothenburg_3d.html` (38 KB),
`uk_3d.html` (27 KB), `buildings_malmo.json`, `dtcc_vegetation.json`,
`roofs_gothenburg.json`, `terrain_hillshade.png`, `booli_data.json`,
`boplats_data.json`, `trafikverket_data.json`.

---

## 9. Deployment

| Stack | File | Ports |
|---|---|---|
| Dev | [docker-compose.yml](docker-compose.yml) | backend 8000, Vite **5180** (single origin) |
| Prod | [docker-compose.prod.yml](docker-compose.prod.yml) | nginx **8080** public; backend internal only |
| EPSM | [docker-compose.epsm.yml](docker-compose.epsm.yml) | 8010 (+ postgres, redis, worker) |

Images: [docker/Dockerfile.backend](docker/Dockerfile.backend),
[docker/Dockerfile.web](docker/Dockerfile.web),
[docker/nginx.conf](docker/nginx.conf). **Data is mounted, not baked in.**

Docker Desktop on Windows doesn't forward inotify across bind mounts, so the dev
stack sets `VITE_USE_POLLING=1` — without it HMR silently stops and you keep
seeing the old UI.

---

## 10. Not wired in

Verified by searching for real `import` statements across every `.py` and `.tsx`
in the repo. Streamlit is no longer in `requirements.txt`.

### Removed 2026-08-26

The Streamlit-era Python layer and three unreachable React pages were deleted
after confirming no `import` statement anywhere in the repo referenced them:

- `rules_engine.py` — "business logic for the Project Planning Guide", the old app's core
- `steps/` — held only `__init__.py` ("UI rendering logic for each wizard step")
- `utils/shared_css.py` — injected CSS for Streamlit pages
- `utils/sensitivity_plots.py`, `utils/sensitivity_plots_innovative.py` — Plotly charts
- `utils/data_requirements.py` — superseded by `config/step2plus_data_inputs.py`
- `frontend/src/pages/Recommendations.tsx`, `ExpectedResults.tsx`, `Timeline.tsx` — not routed, not imported

All were tracked by git and remain recoverable from history. Backend import and
`tsc --noEmit` were both clean before and after.

**Live** in `utils/` after the deletion: only
[boverket_api.py](utils/boverket_api.py),
[location_data.py](utils/location_data.py),
[tabula_matching.py](utils/tabula_matching.py).

### Still orphaned — no Python importer found

| File | Note |
|---|---|
| `config/sensitivity_config.py` | Was imported only by `rules_engine.py` and the two `sensitivity_plots` modules — all three now deleted, so this is newly orphaned |
| `config/analysis_types.py`, `data_inputs.py`, `project_types.py`, `sensitivity.py`, `step2plus_data_inputs.py` | No Python importer found — confirm before deleting |

### One-off HTML patch scripts

[_inject_facade_inspector.py](_inject_facade_inspector.py),
[patch_boplats.py](patch_boplats.py), [fix_panel_nesting.py](fix_panel_nesting.py),
[find_html_anchors.py](find_html_anchors.py), [find_panel.py](find_panel.py),
plus `_facade_quality_wwr_style.js` and `tv_test.js`. These patched
`assets/gothenburg_3d.html` **before** `build.py` became the assembler. Running
them now would edit a generated file. Superseded.

### Backup files

`viewer/js/_facade_inspector_pre_revert.js.bak`,
`assets/gothenburg_3d.html.backup_facade`,
`boplats_apartments.db.bak-20260730`, `boplats_apartments.db-journal.bak-20260730`.

---

## 11. Known limitations

- **EPSM end-use rows have no district-cooling column**, so ideal-loads cooling
  reads as **0** in every total even though the trace shows otherwise.
- **DHW is now simulated** (Sveby intensity via `WaterHeater:Mixed`). Totals now
  include hot water, so **runs from before this change are not comparable** to
  runs after it.
- UK cost/carbon in
  [ukPlaceholderCostCarbon.ts](frontend/src/config/ukPlaceholderCostCarbon.ts) is
  **synthetic placeholder data**.
- Swedish EPC-to-building matching is **geometric (overlap-based) only**.
  Cadastral and address joins were investigated and cannot raise coverage.

---

## 12. Logbook — `logbook/`

A standalone Streamlit app documenting the project stage by stage, in the same
shape as [DT4PED_logbook](https://github.com/SaraAboebeid/DT4PED_logbook).
**Read-only** with respect to this repository, and running in its own venv, so
it cannot affect the tool.

| File | Role |
|---|---|
| [logbook/Tool.py](logbook/Tool.py) | Entry point — contents, live repo stats, consistency check. The filename is the first sidebar entry, so it reads "Tool" |
| [logbook/logbook_content.py](logbook/logbook_content.py) | **All prose** — the only file to edit for wording |
| [logbook/scripts/ui_utils.py](logbook/scripts/ui_utils.py) | Layout, repo introspection, markdown/zip export |
| [logbook/scripts/check_content.py](logbook/scripts/check_content.py) | Validates numbering, page files, cited paths and cross-references |
| [logbook/pages/](logbook/pages/) | 16 pages, ordered by numeric prefix; intentionally thin |
| [logbook/run.bat](logbook/run.bat) · [setup.bat](logbook/setup.bat) | Launch on :8501 / create the venv |

Page 2 (*Script Browser*) renders **this file** live, so the logbook cannot
drift from the code map. Pages resolve their `files` lists against the real
repository on load and flag anything missing in red.

**Sweden and the UK have a page each** (4 and 5) because the chains differ
fundamentally — see §6 above: Sweden takes footprints from EUBUCCO and joins
certificates geometrically; the UK takes footprints from OpenStreetMap via
Overpass and joins by UPRN or postcode plus house number, falling back to
English Housing Survey band priors. Only the output schema is shared, which is
why one viewer renders both.

Start it with `logbook\run.bat` (or `run.bat 8502` for a different port).

---

## Keeping this current

Re-run the checks that built it:

```bash
# Backend route count
grep -cE '^@app\.(get|post|put|delete)' backend/main.py

# Orphan check — real imports of utils/ and config/
grep -rnE "^\s*(from|import)\s+(utils|config)[\. ]" --include="*.py" .

# Viewer scripts still parse
for f in viewer/js/*.js; do node --check "$f" || echo "BROKEN: $f"; done
```
