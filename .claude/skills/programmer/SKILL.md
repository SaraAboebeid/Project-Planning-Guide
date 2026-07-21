---
description: Engineering conventions for this repo — stack layout, how to run and verify each service, the typecheck baseline, build/rebuild order, and the traps that have actually broken things here. Use when writing, changing, debugging or reviewing any code in this project — backend endpoints, React components, viewer scripts, data pipeline or tooling.
when_to_use: add a feature, fix a bug, refactor, new API endpoint, new component, edit the viewer, run the app, restart a server, typecheck, build, debug an error, review a change
---

# Programmer — how this project is built and run

## The four runtimes

| Part | Where | Runs on | Start |
|---|---|---|---|
| Backend API | `backend/main.py` (single large FastAPI file) | **:8000** | `python -m uvicorn backend.main:app --port 8000` |
| Wizard SPA | `frontend/` (React 19 + Vite) | **:5173** | `cd frontend && npm run dev` |
| 3D viewer | `viewer/` → built into `assets/*_3d.html` | **:8765** | `python launch.py`, or serve `assets/` |
| EPSM (EnergyPlus) | `docker-compose.epsm.yml` | **:8010** | `docker compose -f docker-compose.epsm.yml up -d` |

Bare uvicorn — there's no run script. **Vite binds IPv6 `localhost` only**: use `http://localhost:5173`, never `127.0.0.1:5173`.

## Non-negotiables

**1. Typecheck baseline is 60 errors.** All pre-existing. Your change must not add any:
```bash
cd frontend && cat > tsconfig.check.json <<'EOF'
{ "extends": "./tsconfig.json", "compilerOptions": { "ignoreDeprecations": "5.0", "noEmit": true } }
EOF
npx tsc -p tsconfig.check.json --noEmit 2>&1 | grep -c "error TS"; rm -f tsconfig.check.json
```
The scratch tsconfig is temporary — always delete it.

**2. `build.py` wipes the district tags.** It regenerates `buildings.json`, so **always** follow it with:
```bash
python build.py && python tools/se/ingest_districts.py
```
Skip this and `primary_area` drops to 0, breaking the neighborhood picker and the chatbot's district tools (should be ~75,719 tagged of 92,973).

**3. Viewer scripts are classic scripts, not modules.** `viewer/js/*.js` share globals — no `import`/`export`. Validate with `node --check <file>`, then rebuild with `build.py` (editing `viewer/` alone changes nothing; `assets/*_3d.html` is the artifact).

**4. Never break the viewer's DOM contract.** `cesium.js`, `vasttrafik.js`, `legend.js` and `scb_layers.js` all wire by `getElementById`. When restructuring `viewer/index.html`, **preserve every id** and verify:
```bash
python - <<'PY'
from pathlib import Path
h = Path("viewer/index.html").read_text(encoding="utf-8")
print([i for i in ["info-panel","btn-inspect","legend-container"] if f'id="{i}"' not in h] or "all present")
PY
```

**5. A `MutationObserver` that writes into the subtree it observes will loop forever.**
This hung the viewer for real: the observer watched `childList` on `#left-panel`, and its
callback set `badge.textContent` — which *is* a childList mutation, so it re-triggered
itself endlessly and pegged the main thread. Cesium's `await createGooglePhotorealistic3DTileset()`
could then never resume, so the loading overlay never cleared. It looked exactly like a
network/token failure; it wasn't.

If you observe a subtree you also mutate, apply all three:
```js
obs.observe(panel, { subtree: true, attributes: true, attributeFilter: ['class'] }); // narrow
let busy = false;                                    // re-entrancy guard
function refresh() { if (busy) return; busy = true; try { … } finally { busy = false; } }
if (el.textContent !== next) el.textContent = next;  // idempotent writes
```
**A frozen page that looks like a stuck async/network call is often a runaway observer or
render loop.** Time a trivial `page.evaluate(() => 1+1)` — if it takes seconds, the main
thread is blocked, not the network.

**6. Restart the backend after editing `main.py`** — uvicorn here isn't watching:
```powershell
$p = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
     Select-Object -First 1 -ExpandProperty OwningProcess
if ($p) { Stop-Process -Id $p -Force }
```
then relaunch. Confirm with `curl -s localhost:8000/api/health`.

## Windows shell traps

- **Non-ASCII in a `curl` JSON body gets mangled** → `{"detail":"There was an error parsing the body"}`. Post via Python instead:
  ```python
  urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"),
                         headers={"Content-Type": "application/json"})
  ```
- **`å ä ö` printing as `?` or `�` is the console encoding, not corrupted data.** Verify the bytes before "fixing" anything.
- Avoid full-repo `find` — `node_modules` and `.venv` make it time out. Scope the path or use Glob/Grep.

## Secrets

`.env` is gitignored and holds `OPENAI_API_KEY`, `UK_EPC_API_TOKEN`, `LANTMATERIET_USER`/`_PASSWORD`. **Never commit, never echo a value** — print names or lengths only when checking they exist.

## Performance rules that came from real failures

- **Never one Cesium `Entity` per building** — ~186k entities exhausts memory and kills the tab. Use one batched `Primitive` with per-instance colour and `id: { _dataIdx: i }` for picking.
- `buildings.json` is ~58 MB — fetch with `cache: 'default'`, not `'no-store'`.
- Open the EPC DuckDB **read-only**: `duckdb.connect(path, read_only=True)`.
- Avoid O(n²) over the big datasets (90k buildings, 370k footprints, 1.88M EPC rows). The Pareto filter uses a sorted skyline sweep for exactly this reason.

## House style

Match the file you're editing — the frontend mixes Tailwind (`DefineProject/`) and inline `style={{}}` (Step 3/4, newer panels); don't convert one to the other as a side effect. Comment the *why*, not the *what*, and keep comment density like its neighbours.

**Report data honestly.** Show `—` / "not available" rather than a plausible zero; keep the source next to any cited constant; keep `provisional` flags visible. UK cost/carbon is synthetic placeholder data — never present it as real.

## Verify before claiming done

Run the thing, don't just typecheck it. Check the HTTP status of every service you touched:
```bash
for u in http://localhost:8000/api/health http://localhost:5173/ \
         http://localhost:8765/gothenburg_3d.html http://localhost:8010/; do
  printf "%-50s " "$u"; curl -s -o /dev/null -w "HTTP %{http_code}\n" -m 8 "$u"
done
```
If EPSM simulations fail, check Docker Desktop is running **first** — that has been the cause every time.

### Viewer changes: load the page, don't just check it serves

A 200 on `gothenburg_3d.html` proves nothing about whether the viewer *boots* — the hang
above served a perfect 200 while being completely broken. Playwright is installed
(`python -m playwright`); this takes ~30 s and catches boot failures, freezes and console errors:

```python
import time
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True, args=["--enable-unsafe-swiftshader"])
    p = b.new_page(viewport={"width": 1400, "height": 900})
    errs = []
    p.on("pageerror", lambda e: errs.append(str(e)))
    p.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    p.goto("http://localhost:8765/gothenburg_3d.html", wait_until="domcontentloaded", timeout=60000)
    booted = True
    try:  # boot is done when the #loading overlay hides
        p.wait_for_function("()=>{const e=document.getElementById('loading');"
                            "return e&&getComputedStyle(e).display==='none';}", timeout=90000)
    except Exception:
        booted = False
    t0 = time.time(); p.evaluate("()=>1+1"); rt = time.time() - t0   # main thread blocked?
    p.screenshot(path="viewer_check.png")
    print("booted:", booted, "| main-thread:", f"{rt*1000:.0f}ms", "| errors:", len(errs))
    b.close()
```
Healthy looks like `booted: True | main-thread: <100ms | errors: 0`. **Look at the
screenshot** — a blank frame is a failed launch. Headless renders via SwiftShader, so an
empty 3D scene is expected; the sidebar and boot completion are what you're checking.

Remember the browser caches the viewer's JS — **hard-refresh (Ctrl+F5)** before concluding
a fix didn't work.
