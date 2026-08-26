# Project Planning Guide

An interactive step-by-step wizard for planning urban development projects — covering data coverage review, analysis assumptions, recommendations, expected results, timelines, and budget.

---

## How to Run

```powershell
# If Node is not on your PATH (run once per terminal session):
$env:PATH += ";C:\Program Files\nodejs"

cd "C:\Users\saraabo\Desktop\Project Planning Guide\frontend"
npm run dev
```

Then open **http://localhost:5173** in your browser.

That is it. The only thing you need to run is Vite.

---

## Project Structure at a Glance

```
Project Planning Guide/
├── frontend/                    ← Everything you run and edit
│   ├── src/
│   │   ├── pages/               ← ONE FILE PER PAGE (edit here to change what you see)
│   │   ├── components/          ← Shared UI building blocks
│   │   ├── config/              ← All project logic & data rules
│   │   ├── store/               ← Global state (what the user has selected)
│   │   ├── api/                 ← Backend API calls
│   │   └── types/               ← Shared TypeScript types
│   ├── package.json
│   └── vite.config.ts
│
├── planning_guide.py            ← Original Streamlit app (NOT used to run — logic reference only)
├── pages/                       ← Original Streamlit pages (NOT used to run — logic reference only)
└── config/                      ← Original Python config (NOT used to run — logic reference only)
```

> **Note on the Python files**: `planning_guide.py`, the `pages/` folder, and the `config/` folder are the original Streamlit prototype.
> They are **not part of the running app** — Vite is the only interface. They are kept as a logic reference.

---

## Pages — Where to Find and Edit Each Step

| URL | File to Edit | What It Does |
|-----|-------------|--------------|
| `/` | `frontend/src/pages/LandingPage.tsx` | Home / entry screen |
| `/step/1` | `frontend/src/pages/DefineProject/index.tsx` | Define project type, name, country, scale |
| `/step/2` | `frontend/src/pages/DataCoverage.tsx` | Review data availability & coverage |
| `/step/3` | `BaselineSetup.tsx` — or `DataAssumptions.tsx` | Select buildings & run the baseline — or set assumptions |
| `/step/4` | `RenovationSimulator.tsx` — or `StepScenarios.tsx` | Renovation packages, cost & carbon — or community scenarios |
| `/step/5` | `RenovationReport.tsx` — or `ResultsBudget.tsx` | Report — or results & budget |
| `/budget` | `frontend/src/pages/Budget.tsx` | Tasks & cost breakdown |

**Steps 3–5 branch on project type.** The first file in each row is the
Renovation track; the second is the Energy-Community / Renewable-Energy track.
The switch lives in `Step3Router` … `Step5Router` in `frontend/src/App.tsx`.

All page files live in `frontend/src/pages/`. Open any file and edit directly — Vite hot-reloads instantly.

---

## Config & Logic — Where the Rules Live

| File | What It Controls |
|------|-----------------|
| `frontend/src/config/projectConfig.ts` | **All project logic**: project types, systems per type, KPIs, exploration approaches, countries, scale options, follow-up questions |
| `frontend/src/config/sensitivityData.ts` | Sensitivity analysis data (OAT results, global SA) |
| `frontend/src/store/wizard.ts` | Global wizard state — everything the user has filled in across all steps |
| `frontend/src/types/index.ts` | Shared TypeScript types (ProjectType, ProjectScale, etc.) |

**To add a new project type** — edit `projectConfig.ts`: add to `PROJECT_TYPES`, `SYSTEMS_BY_PROJECT_TYPE`, `KPIS_BY_PROJECT_TYPE`, and `SCALE_OPTIONS_BY_TYPE`.

**To add a new wizard step** — add a route in `frontend/src/App.tsx` and create a new file in `frontend/src/pages/`.

---

## Shared Components

| File | What It Does |
|------|-------------|
| `frontend/src/components/WizardLayout.tsx` | Wrapper used by every step — includes header + step indicator |
| `frontend/src/components/BrandedHeader.tsx` | Top navigation bar |
| `frontend/src/components/StepIndicator.tsx` | Progress dots / step numbers |
| `frontend/src/components/panels/EpcPanel.tsx` | EPC data panel (used in DataCoverage) |
| `frontend/src/components/panels/TabulaPanel.tsx` | TABULA archetype panel |
| `frontend/src/components/panels/SensitivityPanel.tsx` | Sensitivity analysis charts |

---

## Gothenburg 3D Viewer + Boplats Rental Data

The file `assets/gothenburg_3d.html` is an interactive 3D map of all ~93,000 Gothenburg buildings.
It is served by a small Python HTTP server on **http://localhost:8765**.

### Start the 3D viewer

```powershell
cd "C:\Users\saraabo\Desktop\Project Planning Guide\Project-Planning-Guide"
python visualize_3d_buildings.py
```

Then open **http://localhost:8765/gothenburg_3d.html** in your browser.

### Boplats rental data in the viewer

When you click a building that has listings in the Boplats database, the info panel shows:
- Average rent per m² and rent range
- A **"More data from Boplats"** button that expands per-apartment cards with rooms, floor, rent, size, date retrieved, and the floor plan image

Hovering over a matched building shows a small orange badge: `🏠 Boplats: from X kr/mo · N unit(s)`

### How the data pipeline works

| Step | Script | What it does |
|------|--------|-------------|
| 1. Scrape | `boplats_scraper.py` | Fetches all listings from boplats.se, saves to `boplats_apartments.db` |
| 2. Export | `boplats_to_assets.py` | Copies floor plan images to `assets/boplats_images/` and writes `assets/boplats_data.json` |
| 3. View | Open the 3D viewer | The viewer loads the JSON at startup automatically |

**Important — data is always cumulative, never overwritten:**
- Each scrape run only *adds* new apartments or updates the `last_seen` date of existing ones
- Apartments that disappear from boplats.se are **kept** in the database with their original data and `first_seen` date
- Running the scraper again will never delete or reset anything

### Run a manual scrape + refresh the viewer data

```powershell
cd "C:\Users\saraabo\Desktop\Project Planning Guide\Project-Planning-Guide"
python boplats_scraper.py
python boplats_to_assets.py
```

Then reload the browser tab — the viewer picks up the new data automatically.

### Scheduled daily scrape (already set up)

Windows Task Scheduler runs `boplats_scraper.py` every day at **12:00 PM** (task name: *Boplats Database*).
After the scheduled scrape completes, run `python boplats_to_assets.py` to refresh the viewer JSON.

To check or edit the scheduled task:

```powershell
# See next run time
Get-ScheduledTask -TaskName "Boplats Database" | Get-ScheduledTaskInfo | Select-Object NextRunTime, LastRunTime, LastTaskResult

# Run it manually right now
Start-ScheduledTask -TaskName "Boplats Database"
```

### Database location

`boplats_apartments.db` — SQLite file in the project root.
Query it directly with any SQLite viewer or from Python:

```python
import sqlite3
conn = sqlite3.connect('boplats_apartments.db')
rows = conn.execute('SELECT address, rooms, size_m2, rent_sek, first_seen, last_seen FROM apartments ORDER BY last_seen DESC').fetchall()
for r in rows: print(r)
```

---

## Trafikverket Traffic Data

Fetches live traffic data for Gothenburg (cameras, vehicle counts, road incidents, parking) from Trafikverket's free Open Data API and stores it in `trafikverket.db`.

### One-time setup — add your API key

1. Register for a free key at https://data.trafikverket.se/oauth2/Account/register
2. Open `trafikverket_scraper.py` and replace line 24:

```python
API_KEY = "YOUR_API_KEY_HERE"   # <── paste your key here
```

### Run a scrape

```powershell
cd "C:\Users\saraabo\Desktop\Project Planning Guide\Project-Planning-Guide"

# Scrape and save to DB only
python trafikverket_scraper.py

# Scrape + export JSON for the 3D viewer in one step
python trafikverket_scraper.py --export

# Just refresh assets/ without re-scraping (uses existing DB)
python trafikverket_scraper.py --export-only
```

### What gets collected

| Data type | What it is | How often changes |
|-----------|-----------|-------------------|
| **Camera** | Traffic cameras + live photo URLs | Minutes |
| **TrafficFlow** | Vehicle counts + avg speed per road | Minutes |
| **Situation** | Roadworks, accidents, closures | Real-time |
| **Parking** | Parking facilities + free spaces | Real-time |

All data is stored in `trafikverket.db` with `first_seen` / `last_seen` columns. Records are **never deleted** — each scrape only adds new records or updates existing ones.

### After scraping — view in the 3D viewer

Running with `--export` copies the data to `assets/trafikverket_data.json`. Reload the browser tab and the viewer will have access to the data (integration with the building click panel can be added as a next step).

### Database location

`trafikverket.db` — SQLite file in the project root with four tables: `cameras`, `traffic_flow`, `situations`, `parking`.

```python
import sqlite3
conn = sqlite3.connect('trafikverket.db')
# Active road situations
rows = conn.execute("SELECT type, severity, description, start_time FROM situations ORDER BY start_time DESC").fetchall()
for r in rows: print(r)
```

---

## API / Backend

`frontend/src/api/client.ts` contains all backend calls (geocoding, EPC lookup, TABULA match, sensitivity analysis).
These call a FastAPI backend via `/api/...`. The Vite dev server proxies these — see `frontend/vite.config.ts`.

If you are running without a backend, the app still works for all UI steps. API calls are only triggered
when using map/location features or the data panels.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI Framework | React 19 + TypeScript |
| Build Tool | Vite 6 |
| Styling | Tailwind CSS 4 |
| Routing | React Router 7 |
| State | Zustand 5 |
| Charts | Recharts |
| Maps | Leaflet + React-Leaflet |
| Icons | Lucide React |

---

## Quick Editing Tips

- **Change text or labels on a page** → open the page file in `frontend/src/pages/` and edit directly
- **Change which systems appear for a project type** → edit `SYSTEMS_BY_PROJECT_TYPE` in `projectConfig.ts`
- **Change step order or add a step** → edit `STEPS_STANDARD` / `STEPS_RENOVATION` in `wizard.ts` and routes in `App.tsx`
- **Change colors or styling** → Tailwind classes are inline in each component; global styles are in `frontend/src/index.css`
- **The browser auto-updates when you save** — no need to restart the dev server
