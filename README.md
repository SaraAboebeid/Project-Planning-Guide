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
| `/step/3` | `frontend/src/pages/DataAssumptions.tsx` | Set data assumptions & proxies |
| `/step/4` | `frontend/src/pages/Recommendations.tsx` | Analysis method recommendations |
| `/step/5` | `frontend/src/pages/ExpectedResults.tsx` | Expected outputs & KPI targets |
| `/step/6` | `frontend/src/pages/Timeline.tsx` | Project timeline |
| `/step/7` | `frontend/src/pages/Budget.tsx` | Tasks & cost breakdown |

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
