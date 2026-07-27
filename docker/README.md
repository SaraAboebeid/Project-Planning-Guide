# Running the tool in Docker

The whole tool — FastAPI backend + React app + 3D viewer — runs from **one
origin**, so it works the same on your laptop or on a shared server. All the app
and viewer URLs are origin-relative, so nothing points at a hardcoded machine.

There are two stacks:

| Stack | File | Use it for |
|---|---|---|
| **Dev** (hot reload) | `docker-compose.yml` | Working on the code locally |
| **Prod** (shareable) | `docker-compose.prod.yml` | Sharing with someone / deploying to a server |

## First-time setup
```bash
cp .env.example .env     # fill in whatever keys you have (all optional)
```

## Dev — hot reload
```bash
docker compose up            # first run builds the backend image (geo stack)
```
| URL | What |
|---|---|
| http://localhost:5180 | The whole app (wizard, calculator, reports) |
| http://localhost:5180/gothenburg_3d.html | The 3D viewer directly |
| http://localhost:8000/docs | Backend API (FastAPI) |

Vite serves the React app **and** the 3D viewer and proxies `/api` to the
backend — one origin, port 5180 (chosen instead of Vite's default 5173 so this
can run alongside another local project's dev server). Editing `.py` / `.tsx` /
viewer JS hot-reloads live. Stop with `docker compose down`.

## Prod — shareable / server
```bash
docker compose -f docker-compose.prod.yml up --build -d
```
Open **http://localhost:8080** (or `http://<server-ip>:8080` from another
machine — because every URL is relative, it just works remotely too).

nginx serves the pre-built SPA + viewer and proxies `/api` to the backend, all
on the single port 8080. Stop with
`docker compose -f docker-compose.prod.yml down`.

## How it works
- **backend** — FastAPI/uvicorn (`docker/Dockerfile.backend`). Deps are baked;
  code + data are bind-mounted from the project folder.
- **dev frontend** — `node:20` running Vite with HMR, sharing the backend's
  network namespace so `/api` resolves with zero config changes.
- **prod web** — `docker/Dockerfile.web`: builds the SPA (`npx vite build`) and
  serves it + the viewer assets from nginx (`docker/nginx.conf`), proxying
  `/api` → backend.
- **Cesium** loads from its CDN, so no Cesium files are shipped.
- **Big data** (`buildings.json`, `dtcc_vegetation.json`, the DuckDB, EPW, the
  sim DB) is **bind-mounted from the project folder, never baked** — so it
  travels with the folder and can be refreshed without rebuilding an image.

## Making changes later
- **Dev — editing code** (`.py`, `.tsx`, viewer JS): saves hot-reload inside the
  containers, no rebuild.
- **Prod — editing code**: re-run the prod command with `--build`.
- **New dependency** (`requirements.txt` / `frontend/package.json`): rebuild with
  `--build` once.
- **Updating data** (new `buildings.json` etc.): just replace the file in the
  project folder — it's mounted, no rebuild.

## Energy simulation (EPSM) — optional, separate stack
EPSM runs as its own compose so it can be started/stopped independently:
```bash
docker compose -f docker-compose.epsm.yml up -d
```
The backend reaches it at `host.docker.internal:8010`. Its images are pulled
from a registry and its database initializes fresh, so it travels fine via git.
If EPSM isn't running, the simulation endpoints degrade gracefully — the rest of
the tool is unaffected.

## What travels via git vs. separately
Everything the **core tool** needs is committed, including the big
`buildings.json` and `dtcc_vegetation.json`.

The one asset that can't go in git (461 MB, over GitHub's 100 MB limit) is the
national EPC register `data/sensitivity/epc_sweden.duckdb`, which powers the
AI-chat "ask about the whole EPC dataset" feature (1.88M records × 262 fields).
It ships as a **zip** (`data/sensitivity/epc_sweden.duckdb.zip`, ~193 MB) plus an
auto-fetch script `scripts/fetch_epc_db.py`, which runs on every
`docker compose up` and makes the DB appear from whichever source is available:

1. **Already unpacked** → nothing to do.
2. **Local zip present** (`data/sensitivity/epc_sweden.duckdb.zip`) → unzips it.
   This is the simplest path for the IT team: hand over the folder including the
   zip (or drop the zip in), start the stack, done.
3. **Download URL** → set `EPC_DB_URL` in `.env` (e.g. a private GitHub Release
   asset API URL) and `EPC_DB_TOKEN` (a token with repo access); the script
   downloads the zip then unzips.
4. **None available** → the core tool still runs; only dataset-wide EPC chat is
   disabled, with a clear message saying so.

Neither the `.duckdb` nor its `.zip` is committed (both gitignored). To refresh
the zip after rebuilding the DB, re-run the one-off zip step in `docker/`'s notes
or just re-zip `epc_sweden.duckdb`.

## Caveats
- **Secrets**: `.env` is loaded at runtime (`env_file`, marked optional), never
  copied into an image. Keep it out of git. A recipient with no `.env` can still
  start the stack — features whose keys are unset are simply disabled.
- **Rebuilding data inside Docker**: the offline data-pipeline scripts
  (`data_pipeline.py`, the DTCC tools) have absolute Windows paths — fine for
  *running* the tool, but they'd need a tweak to regenerate data in-container.
  The tool ships with the data already built, so recipients don't need this.
