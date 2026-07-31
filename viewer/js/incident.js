// incident.js — incident solar radiation on the ground (MIT clean-room, EPW-driven).
// Turn it on, click a point, and the ground disc is coloured by cumulative
// radiation (kWh/m²) for the chosen season, shaded by the surrounding buildings.
// One backend call returns all seasons; the season buttons recolour instantly.
// Shares the sun-hours disc machinery: mesh-clamp, roof filtering, depth-correct
// points, and an on-map click prompt.

let _irActive = false;
let _irPrims = null;
let _irRefs = [];
let _irHandler = null;
let _irRadius = 150;
let _irBusy = false;
let _irData = null;        // last backend result (points + per-season radiation)
let _irSeason = "year";    // year | summer | equinox | winter
let _irMode = "ground";    // "ground" | "surfaces" (roofs & facades)
let _irSurf = null;        // surfaces result (roof/facade quads + per-season values)
let _irSurfPrim = null;    // Cesium Primitive holding the coloured surface quads

const _IR_SEASONS = [
  ["year", "Full year"],
  ["summer", "Summer"],
  ["equinox", "Spring/Autumn"],
  ["winter", "Winter"],
];

// radiation ramp: low → blue, through cyan/green/yellow, high → red
function _irColor(v, maxv) {
  const t = Math.max(0, Math.min(1, v / Math.max(1, maxv)));
  return Cesium.Color.fromHsl(0.66 * (1 - t), 0.95, 0.5, 0.98);
}

function _irPhotoMode() {
  try { if (typeof _flatGroundMode !== "undefined" && _flatGroundMode) return false; } catch (_) {}
  try { if (typeof tilesEnabled !== "undefined") return !!tilesEnabled; } catch (_) {}
  return false;
}

function _irCityId() {
  return (window.VIEWER_CITY && window.VIEWER_CITY.id) || "gothenburg";
}
function _irCountry() { return window.VIEWER_COUNTRY || "se"; }

function _irClear() {
  if (_irPrims) { try { viewer.scene.primitives.remove(_irPrims); } catch (_) {} _irPrims = null; }
  _irRefs = [];
}
function _irClearSurf() {
  if (_irSurfPrim) { try { viewer.scene.primitives.remove(_irSurfPrim); } catch (_) {} _irSurfPrim = null; }
}

function _irMax() {
  const src = _irMode === "surfaces" ? _irSurf : _irData;
  return (src && src.max && src.max[_irSeason]) || 1;
}

// Recolour existing points for the current season — cheap, no geometry rebuild.
function _irApplyColors() {
  if (!_irData || !_irRefs.length) return;
  const vals = _irData.radiation[_irSeason] || [];
  const maxv = _irMax();
  for (let i = 0; i < _irRefs.length; i++) _irRefs[i].color = _irColor(vals[i], maxv);
  viewer.scene.requestRender && viewer.scene.requestRender();
}

// Snap the disc onto the real mesh per-point (photorealistic) and hide any cell
// that landed on a roof/wall/tree instead of ground — same approach as sun-hours.
async function _irClampToMesh() {
  if (!_irPrims || !_irRefs.length) return;
  if (typeof viewer.scene.clampToHeightMostDetailed !== "function") return;
  const carts = _irRefs.map(p => p.position);
  const token = _irData;
  let clamped;
  try { clamped = await viewer.scene.clampToHeightMostDetailed(carts); }
  catch (_) { return; }
  if (_irData !== token || !clamped) return;
  const pts = _irData.points;
  const carto = new Cesium.Cartographic();
  const ROOF_MARGIN = 3.0;
  for (let i = 0; i < _irRefs.length; i++) {
    const c = clamped[i];
    if (!c) { _irRefs[i].show = true; continue; }
    Cesium.Cartographic.fromCartesian(c, undefined, carto);
    const ground = window.getBuildingBaseOffset ? window.getBuildingBaseOffset(pts[i][0], pts[i][1]) : 0;
    if (carto.height - ground > ROOF_MARGIN) { _irRefs[i].show = false; continue; }
    _irRefs[i].show = true;
    carto.height += 1.5;
    _irRefs[i].position = Cesium.Cartographic.toCartesian(carto);
    _irRefs[i].disableDepthTestDistance = 0;   // now on the mesh → depth-correct
  }
  viewer.scene.requestRender && viewer.scene.requestRender();
}

function _irRenderFrame() {
  if (!_irData) return;
  _irClear();
  const pts = _irData.points;
  const pc = new Cesium.PointPrimitiveCollection();
  _irRefs = new Array(pts.length);
  // In photorealistic mode start always-on-top so the disc is visible the instant
  // it's drawn; the mesh-clamp below then flips each point to depth-correct once
  // the tiles have been sampled. Flat basemaps are depth-correct from the start.
  const onTop = _irPhotoMode() ? Number.POSITIVE_INFINITY : 0;
  for (let i = 0; i < pts.length; i++) {
    const base = window.getBuildingBaseOffset ? window.getBuildingBaseOffset(pts[i][0], pts[i][1]) : 0;
    _irRefs[i] = pc.add({
      position: Cesium.Cartesian3.fromDegrees(pts[i][0], pts[i][1], base + 0.6),
      color: Cesium.Color.GRAY, pixelSize: 10, disableDepthTestDistance: onTop,
    });
  }
  _irPrims = viewer.scene.primitives.add(pc);
  _irApplyColors();
  if (_irPhotoMode()) _irClampToMesh();
}

async function _irRun(lon, lat) {
  if (_irBusy) return;
  _irBusy = true;
  _irStatus(`Analysing radiation (r=${_irRadius} m)…`);
  try {
    const r = await fetch("/api/analysis/incident-radiation", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ lat, lon, radius_m: _irRadius, grid_m: 5, country: _irCountry(), city_id: _irCityId() }),
    });
    const d = await r.json();
    if (!d.points) throw new Error(d.detail || "no result");
    _irData = d;
    _irRenderFrame();
    _irStatus(`${d.n_cells} cells · ${d.n_context_buildings} buildings · click again to move.`);
    _irSyncView();
    _irHint(false);
  } catch (err) {
    _irStatus("Radiation analysis failed: " + (err && err.message));
  } finally {
    _irBusy = false;
  }
}

async function _irRunSurfaces(lon, lat) {
  if (_irBusy) return;
  _irBusy = true;
  _irStatus(`Analysing roofs & facades (r=${Math.min(_irRadius, 250)} m)…`);
  try {
    const r = await fetch("/api/analysis/incident-surfaces", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ lat, lon, radius_m: Math.min(_irRadius, 250), grid_m: 5,
                             country: _irCountry(), city_id: _irCityId() }),
    });
    const d = await r.json();
    if (!d.cells) throw new Error(d.detail || "no result");
    _irSurf = d;
    _irRenderSurfaces();
    _irStatus(`${d.n_cells} surface cells · ${d.n_context_buildings} buildings · click again to move.`);
    _irSyncView();
    _irHint(false);
  } catch (err) {
    _irStatus("Surface analysis failed: " + (err && err.message));
  } finally {
    _irBusy = false;
  }
}

// Colour each roof/facade cell as a CoplanarPolygon quad (handles both the flat
// roof cells and the vertical wall cells). Rebuilt on season change.
function _irRenderSurfaces() {
  _irClearSurf();
  if (!_irSurf || !_irSurf.cells.length) return;
  const maxv = _irMax();
  const VF = Cesium.PerInstanceColorAppearance.VERTEX_FORMAT;
  const inst = [];
  for (const cell of _irSurf.cells) {
    const cs = cell.c;
    const base = window.getBuildingBaseOffset ? window.getBuildingBaseOffset(cs[0][0], cs[0][1]) : 0;
    const eps = cell.k === "roof" ? 0.15 : 0.05;   // lift off the surface a touch
    const positions = cs.map(p => Cesium.Cartesian3.fromDegrees(p[0], p[1], base + p[2] + eps));
    const col = _irColor(cell.v[_irSeason], maxv);
    inst.push(new Cesium.GeometryInstance({
      geometry: new Cesium.CoplanarPolygonGeometry({
        polygonHierarchy: new Cesium.PolygonHierarchy(positions),
        vertexFormat: VF,
      }),
      attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(col) },
    }));
  }
  _irSurfPrim = viewer.scene.primitives.add(new Cesium.Primitive({
    geometryInstances: inst,
    appearance: new Cesium.PerInstanceColorAppearance({ translucent: false, flat: true }),
    asynchronous: false,
  }));
  viewer.scene.requestRender && viewer.scene.requestRender();
}

function _irClick(movement) {
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
  const lo = Cesium.Math.toDegrees(c.longitude), la = Cesium.Math.toDegrees(c.latitude);
  if (_irMode === "surfaces") _irRunSurfaces(lo, la); else _irRun(lo, la);
}

function _irKeydown(e) { if (e.key === "Escape") _irExit(); }

// Fully exit: clear the disc/surfaces, drop the click handler, un-press the tool
// button. Called by the Exit button, the Esc key, or toggling the tool off.
function _irExit() {
  incidentSetActive(false);
  const tb = document.getElementById("btn-overlay-incident");
  if (tb) { tb.classList.remove("active"); tb.setAttribute("aria-pressed", "false"); }
}

function incidentSetActive(on) {
  _irActive = on;
  window._irActive = on;   // read by ui.js to suppress the building hover card
  const panel = document.getElementById("incident-panel");
  if (panel) panel.style.display = on ? "block" : "none";
  if (on) {
    if (!_irHandler) {
      _irHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      _irHandler.setInputAction(_irClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }
    _irStatus("Click a point on the map to analyse radiation around it.");
    _irHint(!_irData);
    document.addEventListener("keydown", _irKeydown);
  } else {
    if (_irHandler) { _irHandler.destroy(); _irHandler = null; }
    _irClear();
    _irClearSurf();
    _irHint(false);
    document.removeEventListener("keydown", _irKeydown);
  }
}

function _irStatus(msg) {
  const el = document.getElementById("incident-status");
  if (el) el.textContent = msg;
}

function _irHint(show) {
  let el = document.getElementById("incident-hint");
  if (show) {
    if (!el) {
      el = document.createElement("div");
      el.id = "incident-hint";
      el.style.cssText =
        "position:absolute;top:16px;left:50%;transform:translateX(-50%);z-index:30;" +
        "background:rgba(17,24,39,0.88);color:#fff;padding:9px 16px;border-radius:20px;" +
        "font:13px/1.3 Inter,system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.35);" +
        "pointer-events:none;display:flex;align-items:center;gap:8px;white-space:nowrap";
      el.innerHTML = '<span style="font-size:15px">☀️</span>' +
        '<span>Click anywhere on the map to run the radiation analysis there</span>';
      ((viewer && viewer.container) || document.body).appendChild(el);
    }
    el.style.display = "flex";
  } else if (el) {
    el.style.display = "none";
  }
}

function _irSyncView() {
  document.querySelectorAll(".ir-season-btn").forEach(b => {
    b.style.background = (b.dataset.season === _irSeason) ? "rgba(245,158,11,0.25)" : "transparent";
  });
  document.querySelectorAll(".ir-mode-btn").forEach(b => {
    b.style.background = (b.dataset.mode === _irMode) ? "rgba(245,158,11,0.25)" : "transparent";
  });
  _irLegend();
}

function _irLegend() {
  const el = document.getElementById("incident-legend");
  if (!el) return;
  const maxv = _irMax();
  let grad = "";
  for (let i = 0; i <= 10; i++) {
    const c = _irColor((i / 10) * maxv, maxv);
    grad += `rgba(${Math.round(c.red*255)},${Math.round(c.green*255)},${Math.round(c.blue*255)},1) ${i*10}%,`;
  }
  el.innerHTML =
    `<div style="height:8px;border-radius:4px;background:linear-gradient(90deg,${grad.slice(0,-1)})"></div>` +
    `<div style="display:flex;justify-content:space-between;font-size:9px;color:rgba(255,255,255,0.5);margin-top:2px"><span>0</span><span>${Math.round(maxv)} kWh/m² (${_irSeason})</span></div>`;
}

function _injectIncident() {
  const group = document.querySelector(".analysis-tools-group")
             || document.querySelector("#urban-analysis-section .overlay-group")
             || document.querySelector("#buildings-content .overlay-group");
  if (!group || document.getElementById("btn-overlay-incident")) return;
  const btn = document.createElement("button");
  btn.className = "tool-btn";
  btn.id = "btn-overlay-incident";
  btn.setAttribute("aria-pressed", "false");
  btn.textContent = "☀️ Incident radiation";
  // place right after the Sun-hours control (keep the sun analyses together)
  const shPanel = document.getElementById("sunhours-panel");
  if (shPanel) shPanel.after(btn); else group.appendChild(btn);

  const panel = document.createElement("div");
  panel.id = "incident-panel";
  panel.style.cssText = "display:none;padding:8px 10px;margin:4px 0 8px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08)";
  panel.innerHTML =
    '<div style="display:flex;gap:4px;margin-bottom:8px">' +
      '<button class="ir-mode-btn" data-mode="ground" style="flex:1;padding:4px 6px;border-radius:6px;font-size:10px;cursor:pointer;border:1px solid rgba(255,255,255,0.12);background:rgba(245,158,11,0.25);color:rgba(255,255,255,0.85)">Ground</button>' +
      '<button class="ir-mode-btn" data-mode="surfaces" style="flex:1;padding:4px 6px;border-radius:6px;font-size:10px;cursor:pointer;border:1px solid rgba(255,255,255,0.12);background:transparent;color:rgba(255,255,255,0.85)">Roofs &amp; facades</button>' +
    '</div>' +
    '<div style="font-size:10px;color:rgba(255,255,255,0.45);margin-bottom:6px">Period</div>' +
    '<div id="incident-seasons" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px"></div>' +
    '<div style="font-size:10px;color:rgba(255,255,255,0.45);margin-bottom:4px">Radius: <span id="incident-rval">150</span> m</div>' +
    '<input id="incident-radius" type="range" min="60" max="350" step="10" value="150" style="width:100%">' +
    '<div id="incident-legend" style="margin-top:8px"></div>' +
    '<div id="incident-status" style="font-size:10px;color:rgba(255,255,255,0.55);margin-top:6px;line-height:1.4"></div>' +
    '<div style="font-size:9px;color:rgba(255,255,255,0.4);margin-top:6px;line-height:1.4">Cumulative solar radiation from an EPW typical-year sky matrix. Ground disc, or roofs &amp; facades of nearby buildings. Shaded by buildings + trees (semi-transparent, Gothenburg).</div>' +
    '<button id="incident-exit" style="width:100%;margin-top:8px;padding:6px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid rgba(239,68,68,0.45);background:rgba(239,68,68,0.15);color:#fca5a5">✕ Exit analysis</button>';
  btn.after(panel);
  panel.querySelector("#incident-exit").onclick = _irExit;

  panel.querySelectorAll(".ir-mode-btn").forEach(b => {
    b.onclick = () => {
      _irMode = b.dataset.mode;
      _irSyncView();
      if (_irMode === "surfaces") {
        _irClear();
        if (_irSurf) _irRenderSurfaces();
        else if (_irData && _irData.center) _irRunSurfaces(_irData.center[0], _irData.center[1]);
      } else {
        _irClearSurf();
        if (_irData) _irRenderFrame();
        else if (_irSurf && _irSurf.center) _irRun(_irSurf.center[0], _irSurf.center[1]);
      }
    };
  });

  const seasons = panel.querySelector("#incident-seasons");
  _IR_SEASONS.forEach(([val, label]) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = "ir-season-btn";
    b.dataset.season = val;
    b.style.cssText = "padding:4px 8px;border-radius:6px;font-size:10px;cursor:pointer;border:1px solid rgba(255,255,255,0.12);background:" +
      (val === _irSeason ? "rgba(245,158,11,0.25)" : "transparent") + ";color:rgba(255,255,255,0.8)";
    b.onclick = () => { _irSeason = val; _irSyncView(); if (_irMode === "surfaces") _irRenderSurfaces(); else _irApplyColors(); };
    seasons.appendChild(b);
  });

  const rad = panel.querySelector("#incident-radius");
  rad.oninput = () => { _irRadius = +rad.value; panel.querySelector("#incident-rval").textContent = rad.value; };
  // Re-run for the chosen point when the slider is released so it resizes.
  rad.onchange = () => {
    if (_irMode === "surfaces") { if (_irSurf && _irSurf.center) _irRunSurfaces(_irSurf.center[0], _irSurf.center[1]); }
    else if (_irData && _irData.center) _irRun(_irData.center[0], _irData.center[1]);
  };

  btn.addEventListener("click", () => {
    const on = !_irActive;
    incidentSetActive(on);
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", String(on));
  });
}

function _irHookBasemap() {
  const orig = window.rebuildBuildings;
  if (typeof orig === "function" && !orig._irWrapped) {
    const wrapped = function () {
      const p = orig.apply(this, arguments);
      Promise.resolve(p).then(() => {
        if (!_irActive) return;
        if (_irMode === "surfaces") { if (_irSurf) _irRenderSurfaces(); }
        else if (_irData) _irRenderFrame();
      }).catch(() => {});
      return p;
    };
    wrapped._irWrapped = true;
    window.rebuildBuildings = wrapped;
  }
}

(function initIncident() {
  if (typeof viewer === "undefined" || !viewer) { setTimeout(initIncident, 500); return; }
  _injectIncident();
  _irHookBasemap();
})();
