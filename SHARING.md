# Sharing & Running the Tool on Another Computer

A complete, step-by-step guide for getting **Project Planning Guide** running on
someone else's machine.

---

## 1. The short answer

**No — you don't just share the Docker images.** The images are *built from the
source code*, and the big data files are *bind-mounted at runtime* (not baked into
the images). So the recipient needs **the whole project folder**, not just images.

What you share:

| # | What | How | Required? |
|---|------|-----|-----------|
| 1 | **The project folder** (code + committed data + compose files + Dockerfiles) | git clone, or a ZIP of the folder | ✅ Required |
| 2 | **`.env`** (API keys) | Sent **securely & separately** — it's git-ignored and holds secrets | ⚠️ Optional (only enables the keyed features) |
| 3 | **The facade-ML model folder** (`C:\Users\<you>\Desktop\ML`) + a Python/torch env | Copied separately — it lives outside this project | ⚪ Optional (only for AI façade defect detection) |

Everything else (Node, Python, the built SPA, all Python deps, EnergyPlus, EPSM's
own images) is either **built inside Docker** or **pulled from the internet** — the
recipient does **not** install Node or Python for the main app.

---

## 2. What the recipient must install

1. **Docker Desktop** — https://www.docker.com/products/docker-desktop
   - Windows: enable the **WSL 2** backend (Docker Desktop installer does this).
   - Make sure Docker Desktop is **running** before any command below.
2. *(Optional, only for façade defect detection)* **Python 3.10+** with **PyTorch**
   — see Section 7.

That's it for the main dashboard.

---

## 3. Get the project folder

**Option A — Git (best if they have repo access):**
```bash
git clone <your-repo-url> Project-Planning-Guide
cd Project-Planning-Guide
```

**Option B — ZIP the folder and send it.** Before zipping, delete these
regenerable / huge folders so the ZIP stays small (they rebuild automatically):
- `frontend/node_modules/`  (rebuilt inside Docker)
- `.venv/`, `venv/`  (not used by Docker)
- `.git/`  (optional — only if you don't need history)
- `data/eubucco/`, `data/dtcc/pointcloud/`, `data/sensitivity/archive/` (large, regenerable)

> ⚠️ **Keep the folder named `Project-Planning-Guide`.** Docker derives its project
> name (and the EPSM media volume path) from the folder name. If you must rename it,
> add a file named `.env` line `COMPOSE_PROJECT_NAME=project-planning-guide` so EPSM
> can still find its simulation output.

The committed data the tool needs to run **is included** in the folder:
`frontend/public/buildings.json`, `boplats_data.json`, `frontend/public/uk/…`,
`assets/…`, `data/…`. (A few large datasets are git-ignored and regenerate on demand
— they aren't needed for a normal run.)

### Complete inventory — what a `git clone` does NOT include

List it yourself anytime with:
```powershell
git ls-files --others --exclude-standard            # new/untracked files
git ls-files --others --ignored --exclude-standard  # git-ignored files
```

| Item | Size | Verdict |
|------|------|---------|
| **`.env`** | ~0 MB | **Share** (separately/securely) — your API keys |
| **`boplats_images/`** | ~95 MB | **Share** — apartment photos in the Data Explorer (untracked) |
| `data/dtcc/pointcloud/*.laz` | 6.3 GB | Regenerable — only makes `dtcc_vegetation.json` (already committed). Not needed to run. |
| `data/eubucco/` | 705 MB | Regenerable — only makes `buildings.json` (already committed). Not needed to run. |
| `data/sensitivity/*.duckdb` | 654 MB | Regenerable — EPC DB fetched on startup. Not needed to run. |
| `data/os/openuprn_gb.zip` | 596 MB | Re-downloadable. Not needed to run. |
| `data/simulation_database.sqlite3` | 767 MB | Regenerates as simulations run. Not needed to run. |
| `frontend/node_modules/` | 259 MB | **Never share** — rebuilt inside Docker. |
| `.venv/` | 540 MB | **Never share** — local venv, useless on another machine. |
| `frontend/dist/` | 122 MB | **Never share** — built fresh inside Docker. |
| `C:\Users\<you>\Desktop\ML` | 6.8 GB | Outside the project — **only** for façade-ML detection (Section 7). |

### Package everything in one command (robocopy)

Copy the whole folder minus the rebuild caches, then zip the copy:
```powershell
# EVERYTHING (incl. all data caches) — ~10 GB:
robocopy "<this-folder>" "..\PPG-to-share" /E /XD node_modules .venv .git

# LEANER — the complete working tool without the giant regenerable data — ~1.5 GB:
robocopy "<this-folder>" "..\PPG-to-share" /E /XD node_modules .venv .git "data\dtcc\pointcloud" "data\eubucco" "data\os" "frontend\dist" /XF "*.laz"
```
Then right-click `PPG-to-share` → *Send to → Compressed (zipped) folder*. Both copies
include `.env`, the images and all runtime data — only the caches differ.

---

## 4. API keys — where they live and where to paste them

All keys are **optional**. The tool runs without them; each missing key only
disables the one feature it powers (the UI degrades gracefully).

### Where the keys live
- The template is **`.env.example`** (committed, no secrets).
- The real file is **`.env`** in the **project root** — **git-ignored**, so it is
  **never** in the repo or the ZIP. You must move it separately.

### Create it on the recipient's machine
From the project root:
```bash
# macOS / Linux / Git-Bash
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```
Then open **`.env`** in a text editor and paste the values after each `=`:

```dotenv
# Fill these names in inside .env on the recipient machine.
# (Avoid example assignment values in docs to prevent secret-scan false positives.)
# Required names:
# OPENAI_API_KEY
# ANTHROPIC_API_KEY
# UK_EPC_API_TOKEN
# LANTMATERIET_USER
# LANTMATERIET_PASSWORD
# VASTTRAFIK_CLIENT_ID
# VASTTRAFIK_CLIENT_SECRET
# TRAFIKVERKET_API_KEY
# EPSM_BASE_URL is set for you by the compose file; only override to point elsewhere.
```

- **Copy your keys FROM** your own working **`.env`** (this same file on your machine).
- **Paste them INTO** the recipient's **`.env`** (same location, project root).
- The file is read automatically — by `docker-compose.prod.yml` (`env_file: .env`)
  **and** by `backend/main.py` via `python-dotenv`. No other file needs editing.

> 🔐 **Security:** `.env` contains live secrets. Send it over a secure channel
> (password manager, encrypted message) — **never** commit it, email it in plain
> text, or put it in the ZIP. Better still: have the recipient use **their own** keys.

**Minimum to be useful:** just `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY`). That
alone lights up the Data Assistant, the façade AI-vision second opinion, the WWR AI
estimate and the agentic retrofit recommender.

---

## 5. Run the main dashboard (required)

From the project root, with Docker Desktop running:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```
- First run builds the two images (a few minutes). Later runs are instant; add
  `--build` again only after code changes.
- Open **http://localhost:8080** — the whole tool is on this one port.

Stop it:
```bash
docker compose -f docker-compose.prod.yml down
```

### First run, click-by-click (for non-experts)

> Docker Desktop is the engine + a dashboard, but you don't "run the project" by
> opening the folder inside it — you start it with **one terminal command**, then the
> running app **appears** in Docker Desktop to watch/stop.

1. **Start Docker Desktop** and wait until the whale icon is steady and it says
   **"Docker Desktop is running."** Nothing works until then.
2. **Make the `.env`** (optional, for AI features): copy `.env.example`, rename the
   copy to exactly `.env`, paste your `OPENAI_API_KEY` (see Section 4).
3. **Open a terminal inside the folder:** in File Explorer, go *into*
   `Project-Planning-Guide`, click the **address bar**, type `powershell`, Enter. (Or
   right-click → "Open in Terminal.")
4. **Run:** `docker compose -f docker-compose.prod.yml up --build -d`
   - First time: lots of text scrolls (`Building` / `Pulling`) for a few minutes —
     it's installing everything *inside* Docker (no Node/Python needed on the host).
   - Done when you see `✔ Container …-web-1  Started` and `…-backend-1  Started`.
5. **Open** http://localhost:8080 in a browser. That's the whole tool.
6. **In Docker Desktop → Containers** you'll see a `project-planning-guide` group with
   `web` + `backend` running. Buttons there **Start/Stop** the stack and show **Logs**;
   clicking the `8080` link opens the app.

**Stop:** the ⏹ button in Docker Desktop, or `docker compose -f docker-compose.prod.yml down`.
**Start again later (no rebuild):** the ▶ button, or `docker compose -f docker-compose.prod.yml up -d`.

**Snags:** *"cannot connect to the Docker daemon"* = Docker Desktop not running.
*"can't reach this page"* = build not finished / containers not green yet — wait & refresh.
*"port is already allocated"* = something else uses 8080.

That's the whole app: the 3D viewers, Data Explorer, and the Steps 1–5 wizard all
work. Energy simulation (EPSM) and façade ML are **optional add-ons** below.

### The 3D viewers (`gothenburg_3d.html`, `uk_3d.html`) — and the Cesium Ion token

You do **not** share the viewer files separately. They are **baked into the web
image** (`docker/Dockerfile.web` runs `COPY assets/ …`) and served at
`http://localhost:8080/gothenburg_3d.html` and `…/uk_3d.html`. They work because:
- **Cesium** loads from the **jsDelivr CDN** (needs internet — no file to ship).
- **Building data** (`buildings.json`, `dtcc_vegetation.json`) is bind-mounted.
- **`/api` calls** are proxied to the backend.

⚠️ **One caveat — a Cesium Ion token is embedded.** The **Google Photorealistic
3D Tiles** layer (real façade/roof textures) needs a **Cesium Ion access token**,
and there is a **hard-coded fallback token — yours — in
`assets/viewer/js/cesium.js` (≈ line 55)**. If you share the folder as-is, the
recipient streams Google 3D Tiles **on your Cesium Ion quota** and your token is
exposed in the code. Everything *else* in the viewer (base globe, your buildings,
all analysis layers) needs **no token**.

Choose one before sharing:
1. **Recipient uses their own token (recommended)** — in the viewer they click
   *"🚀 Apply & Load 3D Tiles"* and paste a **free** token from
   https://ion.cesium.com (asset *Google Photorealistic 3D Tiles*, id 2275207). It's
   saved in their browser (`localStorage`) and overrides the embedded one.
2. **Remove your token first** — blank the fallback string in
   `assets/viewer/js/cesium.js` (line ~55) so the viewer is token-dialog-only, then
   rebuild the web image.
3. **Leave it** — acceptable if you don't mind them using your free-tier quota.

---

## 6. Run EPSM — energy simulation (optional)

Needed only for the **real EnergyPlus** runs in Step 3/4 (baseline + package
simulation). Without it, those steps show a "simulation backend offline" notice and
everything else still works.

```bash
docker compose -f docker-compose.epsm.yml up -d
```
- Pulls prebuilt images from the internet (EPSM backend, Postgres, Redis) — **no
  extra files to share**, just Docker + an internet connection on first start.
- The **first** EnergyPlus simulation also pulls `nrel/energyplus:23.2.0` (large,
  one-time).
- It exposes port **8010**; the dashboard backend already points at it
  (`EPSM_BASE_URL=http://host.docker.internal:8010`, set in the prod compose).
- It needs access to the Docker socket (already configured) — Docker Desktop
  provides this on Windows/Mac out of the box.

Stop it (keep data): `docker compose -f docker-compose.epsm.yml down`
Stop and wipe its DB: `docker compose -f docker-compose.epsm.yml down -v`

---

## 7. Run the façade-defect ML service (optional)

Needed only for the **AI façade defect detection** in Step 2 (the specialist
MBDD2025 model). Without it, that panel's ML boxes are unavailable and it falls back
to the **AI-vision** second opinion (which needs only an OpenAI/Anthropic key, no
torch). So most recipients can **skip this**.

This service is **not part of the project folder** — it lives in a separate ML repo:

1. Copy the ML folder (default `C:\Users\<you>\Desktop\ML`) to the recipient, or set
   the env var `FACADE_ML_ROOT` to wherever they put it.
2. On the recipient's machine, create a Python env with the model's deps **plus**
   `fastapi` and `uvicorn`:
   ```bash
   python -m pip install torch torchvision numpy pillow fastapi uvicorn
   ```
3. Start it from the **project root**:
   ```bash
   python tools/ml/facade_detect_service.py        # serves on :8020
   ```
   (Health check: open http://localhost:8020/health — it lists the model + classes.)
4. The dashboard backend already points at it
   (`FACADE_MODEL_URL=http://host.docker.internal:8020`, set in the prod compose).
   It must be relaunched **each session** — it does not auto-start.

---

## 8. Ports summary

| Port | Service | Started by |
|------|---------|-----------|
| **8080** | The whole dashboard (nginx + SPA + `/api` proxy) | `docker-compose.prod.yml` |
| 8000 | FastAPI backend (internal — nginx reaches it) | `docker-compose.prod.yml` |
| 8010 | EPSM energy-simulation API | `docker-compose.epsm.yml` |
| 8020 | Façade ML detector | `python tools/ml/facade_detect_service.py` (host) |

---

## 9. Quick recap — the minimal path

```bash
# 1. Install Docker Desktop and start it.
# 2. Get the folder:
git clone <repo>  &&  cd Project-Planning-Guide
# 3. Add keys (optional but recommended):
cp .env.example .env      # then paste OPENAI_API_KEY (at least)
# 4. Run the app:
docker compose -f docker-compose.prod.yml up --build -d
#    → open http://localhost:8080
# 5. (optional) energy simulation:
docker compose -f docker-compose.epsm.yml up -d
# 6. (optional) façade ML:  python tools/ml/facade_detect_service.py
```

**Degrades gracefully:** no `.env` → AI features off; no EPSM → real simulation off;
no ML service → façade ML off (AI-vision still works). The core dashboard, 3D
viewers, data, MCDA prioritization and the decision analyses all run with just
Step 5's `docker compose … prod up`.
