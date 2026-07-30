// sunhours.js — direct sun-hours analysis. Turn it on, click a point, and the
// ground disc around it shows the sun. One backend call returns the whole day's
// per-timestep shadow frames; the slider scrubs them client-side (no re-fetch).
// Two views of the same result:
//   • Sun hours (heatmap) — cumulative sunlit hours up to the chosen time, blue
//     (shaded) → yellow (full sun). Slider at the end = the whole-day total.
//   • Shadow at time — sun/shade at that one instant (gold = sun, blue = shade).
//
// Geometry is built once per result and, in photorealistic mode, clamped to the
// Google mesh per-point so the disc follows the real terrain (and isn't buried
// under it). Slider/mode changes only recolour the existing points.

let _shActive = false;
let _shPrims = null;          // Cesium.PointPrimitiveCollection
let _shRefs = [];             // per-cell PointPrimitive, parallel to _shData.points
let _shHandler = null;
let _shDate = "2026-06-21";
let _shRadius = 150;
let _shBusy = false;
let _shData = null;           // last backend result (points + frames + cumulative)
let _shHourIdx = 0;           // selected timestep in _shData.frames
let _shMode = "hours";        // "hours" (cumulative heatmap) | "shadow" (instant)

const _SH_DATES = [
  ["2026-06-21", "Jun (summer)"],
  ["2026-03-21", "Mar/Sep (equinox)"],
  ["2026-12-21", "Dec (winter)"],
];

// heatmap ramp: shaded (low) → blue; sunny (high) → yellow/orange
function _shColorHours(h, maxh) {
  const t = Math.max(0, Math.min(1, h / Math.max(0.5, maxh)));
  return Cesium.Color.fromHsl(0.66 - t * 0.57, 0.95, 0.5, 0.98);
}
// instant view: two flat colours so the shadow pattern reads as one surface
const _SH_LIT = Cesium.Color.fromCssColorString("#FFC83D").withAlpha(0.98);
const _SH_SHADE = Cesium.Color.fromCssColorString("#1E3A8A").withAlpha(0.95);

function _shBaseTz() {
  return (window.VIEWER_COUNTRY === "gb") ? 0.0 : 1.0;  // DST added server-side
}
function _shCountry() { return window.VIEWER_COUNTRY || "se"; }
function _shCityId() { return (window.VIEWER_CITY && window.VIEWER_CITY.id) || "gothenburg"; }

// True while the Google photorealistic tiles are the basemap — the only view
// with real per-point terrain worth clamping to.
function _shPhotoMode() {
  try { if (typeof _flatGroundMode !== "undefined" && _flatGroundMode) return false; } catch (_) {}
  try { if (typeof tilesEnabled !== "undefined") return !!tilesEnabled; } catch (_) {}
  return false;
}

function _shClear() {
  if (_shPrims) { try { viewer.scene.primitives.remove(_shPrims); } catch (_) {} _shPrims = null; }
  _shRefs = [];
}

// Cumulative sunlit hours per cell through the selected timestep (heatmap value).
function _shCumThrough(idx) {
  const frames = _shData.frames || [];
  const M = _shData.points.length;
  const cum = new Float32Array(M);
  if (!frames.length) return cum;
  const stepH = (_shData.possible_hours || 0) / frames.length;
  for (let k = 0; k <= idx && k < frames.length; k++) {
    const lit = frames[k].lit;
    for (let i = 0; i < M; i++) if (lit[i]) cum[i] += stepH;
  }
  return cum;
}

// Recolour existing points for the current mode/hour — cheap, runs on every
// slider drag. No geometry rebuild, no clamp, no re-fetch.
function _shApplyColors() {
  if (!_shData || !_shRefs.length) return;
  const M = _shData.points.length;
  if (_shMode === "shadow" && _shData.frames && _shData.frames.length) {
    const lit = _shData.frames[Math.max(0, Math.min(_shData.frames.length - 1, _shHourIdx))].lit;
    for (let i = 0; i < M; i++) _shRefs[i].color = lit[i] ? _SH_LIT : _SH_SHADE;
  } else {
    const maxh = _shData.possible_hours || _shData.max_hours || 1;
    const cum = _shCumThrough(_shHourIdx);
    for (let i = 0; i < M; i++) _shRefs[i].color = _shColorHours(cum[i], maxh);
  }
  viewer.scene.requestRender && viewer.scene.requestRender();
}

// Snap the disc onto the real photorealistic mesh, per-point, so it follows the
// terrain instead of floating on (or sinking under) one averaged elevation.
async function _shClampToMesh() {
  if (!_shPrims || !_shRefs.length) return;
  if (typeof viewer.scene.clampToHeightMostDetailed !== "function") return;
  const carts = _shRefs.map(p => p.position);
  const token = _shData;                 // bail if a new analysis started meanwhile
  let clamped;
  try { clamped = await viewer.scene.clampToHeightMostDetailed(carts); }
  catch (_) { return; }
  if (_shData !== token || !clamped) return;
  const pts = _shData.points;
  const carto = new Cesium.Cartographic();
  // A cell that clamps well above the local ground didn't land on ground — it
  // landed on a roof, wall, or tree (our footprints don't line up perfectly with
  // Google's mesh). Hide those; keep the cells that sit on real ground.
  const ROOF_MARGIN = 3.0;
  for (let i = 0; i < _shRefs.length; i++) {
    const c = clamped[i];
    if (!c) { _shRefs[i].show = true; continue; }   // clamp failed → leave on coarse ground
    Cesium.Cartographic.fromCartesian(c, undefined, carto);
    const ground = window.getBuildingBaseOffset ? window.getBuildingBaseOffset(pts[i][0], pts[i][1]) : 0;
    if (carto.height - ground > ROOF_MARGIN) { _shRefs[i].show = false; continue; }
    _shRefs[i].show = true;
    carto.height += 1.5;                 // sit just above the surface, avoid z-fight
    _shRefs[i].position = Cesium.Cartographic.toCartesian(carto);
    _shRefs[i].disableDepthTestDistance = 0;   // now on the mesh → depth-correct
  }
  viewer.scene.requestRender && viewer.scene.requestRender();
}

// Build the disc geometry from the cached result using CURRENT ground offsets,
// then colour it and (in photo mode) clamp to the mesh.
function _shRenderFrame() {
  if (!_shData) return;
  _shClear();
  const pts = _shData.points;
  const pc = new Cesium.PointPrimitiveCollection();
  _shRefs = new Array(pts.length);
  // Photorealistic: start always-on-top so the disc shows the instant it's drawn;
  // the mesh-clamp below flips each point to depth-correct once tiles are sampled.
  // Depth-tested keeps ground cells behind a building row hidden (no roof-painting).
  const onTop = _shPhotoMode() ? Number.POSITIVE_INFINITY : 0;
  for (let i = 0; i < pts.length; i++) {
    const plon = pts[i][0], plat = pts[i][1];
    const base = window.getBuildingBaseOffset ? window.getBuildingBaseOffset(plon, plat) : 0;
    _shRefs[i] = pc.add({
      position: Cesium.Cartesian3.fromDegrees(plon, plat, base + 0.6),
      color: Cesium.Color.GRAY, pixelSize: 10,
      disableDepthTestDistance: onTop,
    });
  }
  _shPrims = viewer.scene.primitives.add(pc);
  _shApplyColors();
  if (_shPhotoMode()) _shClampToMesh();
}

async function _shRun(lon, lat) {
  if (_shBusy) return;
  _shBusy = true;
  _shStatus(`Analysing (r=${_shRadius} m)…`);
  try {
    const r = await fetch("/api/analysis/sun-hours", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ lat, lon, radius_m: _shRadius, grid_m: 5, date: _shDate,
                             base_tz: _shBaseTz(), country: _shCountry(), city_id: _shCityId() }),
    });
    const d = await r.json();
    _shData = d;
    // default the slider to the end of day → the full-day heatmap on first sight
    _shHourIdx = (d.frames && d.frames.length) ? d.frames.length - 1 : 0;
    _shBuildHourSlider();
    _shRenderFrame();
    _shStatus(`${d.n_cells} cells · ${d.n_context_buildings} buildings · click again to move.`);
    _shSyncView();
    _shHint(false);   // a point has been chosen — drop the prompt
  } catch (err) {
    _shStatus("Sun-hours failed: " + (err && err.message));
  } finally {
    _shBusy = false;
  }
}

function _shClick(movement) {
  let cart = null;
  try { cart = viewer.scene.pickPosition(movement.position); } catch (_) {}
  if (!cart && viewer.scene.globe) {
    const ray = viewer.camera.getPickRay(movement.position);
    if (ray) cart = viewer.scene.globe.pick(ray, viewer.scene);
  }
  if (!cart) {
    try { cart = viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid); } catch (_) {}
  }
  if (!cart) return;
  const c = Cesium.Cartographic.fromCartesian(cart);
  _shRun(Cesium.Math.toDegrees(c.longitude), Cesium.Math.toDegrees(c.latitude));
}

function _shKeydown(e) { if (e.key === "Escape") _shExit(); }
function _shExit() {
  sunHoursSetActive(false);
  const tb = document.getElementById("btn-overlay-sunhours");
  if (tb) { tb.classList.remove("active"); tb.setAttribute("aria-pressed", "false"); }
}

function sunHoursSetActive(on) {
  _shActive = on;
  const panel = document.getElementById("sunhours-panel");
  if (panel) panel.style.display = on ? "block" : "none";
  if (on) {
    if (!_shHandler) {
      _shHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      _shHandler.setInputAction(_shClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }
    _shStatus("Click a point on the map to analyse the sun around it.");
    _shHint(!_shData);   // show the on-map prompt until a point has been chosen
    document.addEventListener("keydown", _shKeydown);
  } else {
    if (_shHandler) { _shHandler.destroy(); _shHandler = null; }
    _shClear();
    _shHint(false);
    document.removeEventListener("keydown", _shKeydown);
  }
}

// Floating prompt over the map telling the user to click where to run it.
function _shHint(show) {
  let el = document.getElementById("sunhours-hint");
  if (show) {
    if (!el) {
      el = document.createElement("div");
      el.id = "sunhours-hint";
      el.style.cssText =
        "position:absolute;top:16px;left:50%;transform:translateX(-50%);z-index:30;" +
        "background:rgba(17,24,39,0.88);color:#fff;padding:9px 16px;border-radius:20px;" +
        "font:13px/1.3 Inter,system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.35);" +
        "pointer-events:none;display:flex;align-items:center;gap:8px;white-space:nowrap";
      el.innerHTML = '<span style="font-size:15px">☀️</span>' +
        '<span>Click anywhere on the map to run the sun analysis there</span>';
      ((viewer && viewer.container) || document.body).appendChild(el);
    }
    el.style.display = "flex";
  } else if (el) {
    el.style.display = "none";
  }
}

function _shStatus(msg) {
  const el = document.getElementById("sunhours-status");
  if (el) el.textContent = msg;
}

function _shSyncView() {
  document.querySelectorAll(".sh-mode-btn").forEach(b => {
    b.style.background = (b.dataset.mode === _shMode) ? "rgba(245,158,11,0.25)" : "transparent";
  });
  _shUpdateHourLabel();
  _shLegend();
}

function _shBuildHourSlider() {
  const slider = document.getElementById("sunhours-hour");
  const haveFrames = _shData && _shData.frames && _shData.frames.length;
  if (!slider || !haveFrames) return;
  slider.min = 0;
  slider.max = _shData.frames.length - 1;
  slider.value = _shHourIdx;
  _shUpdateHourLabel();
}

function _shUpdateHourLabel() {
  const lbl = document.getElementById("sunhours-hourlbl");
  if (!lbl || !_shData || !_shData.frames || !_shData.frames.length) return;
  const f = _shData.frames[_shHourIdx];
  const last = _shHourIdx >= _shData.frames.length - 1;
  lbl.textContent = (_shMode === "shadow")
    ? `${f.t} · sun ${Math.round(f.alt)}° high`
    : (last ? `whole day (through ${f.t})` : `sun collected up to ${f.t}`);
}

function _shLegend() {
  const el = document.getElementById("sunhours-legend");
  if (!el) return;
  if (_shMode === "shadow") {
    const lit = `rgb(${Math.round(_SH_LIT.red*255)},${Math.round(_SH_LIT.green*255)},${Math.round(_SH_LIT.blue*255)})`;
    const sh = `rgb(${Math.round(_SH_SHADE.red*255)},${Math.round(_SH_SHADE.green*255)},${Math.round(_SH_SHADE.blue*255)})`;
    el.innerHTML =
      `<div style="display:flex;gap:12px;font-size:10px;color:rgba(255,255,255,0.7)">` +
      `<span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${lit};margin-right:4px"></span>in sun</span>` +
      `<span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${sh};margin-right:4px"></span>in shade</span></div>`;
    return;
  }
  const maxh = (_shData && (_shData.possible_hours || _shData.max_hours)) || 1;
  let grad = "";
  for (let i = 0; i <= 10; i++) {
    const c = _shColorHours((i / 10) * maxh, maxh);
    grad += `rgba(${Math.round(c.red*255)},${Math.round(c.green*255)},${Math.round(c.blue*255)},1) ${i*10}%,`;
  }
  el.innerHTML =
    `<div style="height:8px;border-radius:4px;background:linear-gradient(90deg,${grad.slice(0,-1)})"></div>` +
    `<div style="display:flex;justify-content:space-between;font-size:9px;color:rgba(255,255,255,0.5);margin-top:2px"><span>0 h (shaded)</span><span>${maxh} h (full sun)</span></div>`;
}

function _injectSunHours() {
  // Live under the "Analysis" section (formerly Urban Analysis), alongside the
  // other spatial analyses; fall back to the Buildings panel if that section
  // isn't present (e.g. a non-SE viewer profile).
  // Live in the analysis tools group (with WWR / PV / Energy Simulation); fall
  // back to the old locations if that group isn't present.
  const group = document.querySelector(".analysis-tools-group")
             || document.querySelector("#urban-analysis-section .overlay-group")
             || document.querySelector("#buildings-content .overlay-group");
  if (!group || document.getElementById("btn-overlay-sunhours")) return;
  if (!document.getElementById("site-analysis-label")) {
    const lbl = document.createElement("div");
    lbl.id = "site-analysis-label";
    lbl.textContent = "Site analysis · click a point";
    lbl.style.cssText = "font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:10px 2px 4px";
    group.appendChild(lbl);
  }
  const btn = document.createElement("button");
  btn.className = "tool-btn";
  btn.id = "btn-overlay-sunhours";
  btn.setAttribute("aria-pressed", "false");
  btn.textContent = "☀️ Sun-hours";
  group.appendChild(btn);
  const panel = document.createElement("div");
  panel.id = "sunhours-panel";
  panel.style.cssText = "display:none;padding:8px 10px;margin:4px 0 8px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08)";
  panel.innerHTML =
    '<div style="font-size:10px;color:rgba(255,255,255,0.45);margin-bottom:6px">Day of year</div>' +
    '<div id="sunhours-dates" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px"></div>' +
    '<div style="font-size:10px;color:rgba(255,255,255,0.45);margin-bottom:4px">Radius: <span id="sunhours-rval">150</span> m</div>' +
    '<input id="sunhours-radius" type="range" min="60" max="400" step="10" value="150" style="width:100%">' +
    '<div style="display:flex;gap:4px;margin:10px 0 6px">' +
      '<button class="sh-mode-btn" data-mode="hours" style="flex:1;padding:4px 6px;border-radius:6px;font-size:10px;cursor:pointer;border:1px solid rgba(255,255,255,0.12);background:rgba(245,158,11,0.25);color:rgba(255,255,255,0.85)">Sun hours</button>' +
      '<button class="sh-mode-btn" data-mode="shadow" style="flex:1;padding:4px 6px;border-radius:6px;font-size:10px;cursor:pointer;border:1px solid rgba(255,255,255,0.12);background:transparent;color:rgba(255,255,255,0.85)">Shadow at time</button>' +
    '</div>' +
    '<div id="sunhours-hourlbl" style="font-size:10px;color:rgba(255,255,255,0.7);margin-bottom:2px;text-align:center">—</div>' +
    '<input id="sunhours-hour" type="range" min="0" max="1" step="1" value="0" style="width:100%">' +
    '<div id="sunhours-legend" style="margin-top:8px"></div>' +
    '<div id="sunhours-status" style="font-size:10px;color:rgba(255,255,255,0.55);margin-top:6px;line-height:1.4"></div>' +
    '<button id="sunhours-exit" style="width:100%;margin-top:8px;padding:6px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid rgba(239,68,68,0.45);background:rgba(239,68,68,0.15);color:#fca5a5">✕ Exit analysis</button>';
  btn.after(panel);
  panel.querySelector("#sunhours-exit").onclick = _shExit;

  const dates = panel.querySelector("#sunhours-dates");
  _SH_DATES.forEach(([val, label]) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = "sh-date-btn";
    b.style.cssText = "padding:4px 8px;border-radius:6px;font-size:10px;cursor:pointer;border:1px solid rgba(255,255,255,0.12);background:" +
      (val === _shDate ? "rgba(245,158,11,0.25)" : "transparent") + ";color:rgba(255,255,255,0.8)";
    b.onclick = () => {
      _shDate = val;
      panel.querySelectorAll(".sh-date-btn").forEach(x => x.style.background = "transparent");
      b.style.background = "rgba(245,158,11,0.25)";
      if (_shData && _shData.center) _shRun(_shData.center[0], _shData.center[1]);
    };
    dates.appendChild(b);
  });

  const rad = panel.querySelector("#sunhours-radius");
  rad.oninput = () => { _shRadius = +rad.value; panel.querySelector("#sunhours-rval").textContent = rad.value; };
  // Re-run for the chosen point when the slider is released so the disc resizes.
  rad.onchange = () => { if (_shData && _shData.center) _shRun(_shData.center[0], _shData.center[1]); };

  panel.querySelectorAll(".sh-mode-btn").forEach(b => {
    b.onclick = () => { _shMode = b.dataset.mode; _shSyncView(); _shApplyColors(); };
  });

  const hour = panel.querySelector("#sunhours-hour");
  hour.oninput = () => { _shHourIdx = +hour.value; _shUpdateHourLabel(); _shApplyColors(); };

  btn.addEventListener("click", () => {
    const on = !_shActive;
    sunHoursSetActive(on);
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", String(on));
  });
}

// Keep the disc glued to the ground: buildings rebuild whenever the basemap
// switches (photorealistic mesh ⇄ flat map), which changes ground offsets — so
// rebuild the disc from the cached result right after every rebuild.
function _shHookBasemap() {
  const orig = window.rebuildBuildings;
  if (typeof orig === "function" && !orig._shWrapped) {
    const wrapped = function () {
      const p = orig.apply(this, arguments);
      Promise.resolve(p).then(() => { if (_shData && _shActive) _shRenderFrame(); }).catch(() => {});
      return p;
    };
    wrapped._shWrapped = true;
    window.rebuildBuildings = wrapped;
  }
}

(function initSunHours() {
  if (typeof viewer === "undefined" || !viewer) { setTimeout(initSunHours, 500); return; }
  _injectSunHours();
  _shHookBasemap();
})();
