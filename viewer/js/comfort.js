// comfort.js — outdoor thermal comfort (UTCI + solar MRT). Click a point, then
// either scrub the hour slider for a single day, or switch to "Season comfort %"
// to see the share of daytime hours each spot is comfortable across a season.
// One backend call per mode; season/hour switches recolour instantly. Shares the
// sun-hours disc machinery (mesh-clamp, roof filtering, depth-correct points).
// MIT clean-room + the MIT pythermalcomfort library — no Ladybug code. Works for
// SE and UK (correct city buildings + EPW selected by country/city).

let _tcActive = false;
let _tcPrims = null;
let _tcRefs = [];
let _tcHandler = null;
let _tcRadius = 150;
let _tcBusy = false;
let _tcHourIdx = 0;
let _tcDate = "2026-06-21";
let _tcMode = "hourly";        // "hourly" | "seasonal"
let _tcSeason = "summer";      // seasonal mode: year | summer | equinox | winter
let _tcData = null;            // hourly result (frames)
let _tcSeasonData = null;      // seasonal result (comfort_pct per season)
let _tcCenter = null;          // last clicked [lon, lat]

const _TC_DATES = [
  ["2026-06-21", "Jun (summer)"],
  ["2026-03-21", "Mar/Sep (equinox)"],
  ["2026-12-21", "Dec (winter)"],
];
const _TC_SEASONS = [
  ["year", "Full year"], ["summer", "Summer"],
  ["equinox", "Spring/Autumn"], ["winter", "Winter"],
];
// 10 UTCI stress categories: extreme cold → comfortable (green) → extreme heat
const _TC_PAL = ["#08306b", "#2171b5", "#4292c6", "#6baed6", "#9ecae1",
                 "#66bd63", "#fee08b", "#fdae61", "#f46d43", "#a50026"];

function _tcColor(cat) {
  return Cesium.Color.fromCssColorString(_TC_PAL[Math.max(0, Math.min(9, cat | 0))]).withAlpha(0.98);
}
// comfort %: 0% → red, 50% → yellow, 100% → green
function _tcPctColor(pct) {
  const t = Math.max(0, Math.min(1, pct / 100));
  return Cesium.Color.fromHsl(0.33 * t, 0.9, 0.5, 0.98);
}

function _tcPhotoMode() {
  try { if (typeof _flatGroundMode !== "undefined" && _flatGroundMode) return false; } catch (_) {}
  try { if (typeof tilesEnabled !== "undefined") return !!tilesEnabled; } catch (_) {}
  return false;
}
function _tcCityId() { return (window.VIEWER_CITY && window.VIEWER_CITY.id) || "gothenburg"; }
function _tcCountry() { return window.VIEWER_COUNTRY || "se"; }

function _tcActiveData() { return _tcMode === "seasonal" ? _tcSeasonData : _tcData; }

function _tcClear() {
  if (_tcPrims) { try { viewer.scene.primitives.remove(_tcPrims); } catch (_) {} _tcPrims = null; }
  _tcRefs = [];
}

function _tcApplyColors() {
  const data = _tcActiveData();
  if (!data || !_tcRefs.length) return;
  if (_tcMode === "seasonal") {
    const vals = data.comfort_pct[_tcSeason] || [];
    for (let i = 0; i < _tcRefs.length; i++) _tcRefs[i].color = _tcPctColor(vals[i]);
  } else {
    if (!data.frames.length) return;
    const fr = data.frames[Math.max(0, Math.min(data.frames.length - 1, _tcHourIdx))];
    for (let i = 0; i < _tcRefs.length; i++) _tcRefs[i].color = _tcColor(fr.cat[i]);
  }
  viewer.scene.requestRender && viewer.scene.requestRender();
}

async function _tcClampToMesh() {
  const data = _tcActiveData();
  if (!_tcPrims || !_tcRefs.length || !data) return;
  if (typeof viewer.scene.clampToHeightMostDetailed !== "function") return;
  const carts = _tcRefs.map(p => p.position);
  const token = data;
  let clamped;
  try { clamped = await viewer.scene.clampToHeightMostDetailed(carts); }
  catch (_) { return; }
  if (_tcActiveData() !== token || !clamped) return;
  const pts = data.points;
  const carto = new Cesium.Cartographic();
  const ROOF_MARGIN = 3.0;
  for (let i = 0; i < _tcRefs.length; i++) {
    const c = clamped[i];
    if (!c) { _tcRefs[i].show = true; continue; }
    Cesium.Cartographic.fromCartesian(c, undefined, carto);
    const ground = window.getBuildingBaseOffset ? window.getBuildingBaseOffset(pts[i][0], pts[i][1]) : 0;
    if (carto.height - ground > ROOF_MARGIN) { _tcRefs[i].show = false; continue; }
    _tcRefs[i].show = true;
    carto.height += 1.5;
    _tcRefs[i].position = Cesium.Cartographic.toCartesian(carto);
    _tcRefs[i].disableDepthTestDistance = 0;
  }
  viewer.scene.requestRender && viewer.scene.requestRender();
}

function _tcRenderFrame() {
  const data = _tcActiveData();
  if (!data) return;
  _tcClear();
  const pts = data.points;
  const pc = new Cesium.PointPrimitiveCollection();
  _tcRefs = new Array(pts.length);
  const onTop = _tcPhotoMode() ? Number.POSITIVE_INFINITY : 0;
  for (let i = 0; i < pts.length; i++) {
    const base = window.getBuildingBaseOffset ? window.getBuildingBaseOffset(pts[i][0], pts[i][1]) : 0;
    _tcRefs[i] = pc.add({
      position: Cesium.Cartesian3.fromDegrees(pts[i][0], pts[i][1], base + 0.6),
      color: Cesium.Color.GRAY, pixelSize: 10, disableDepthTestDistance: onTop,
    });
  }
  _tcPrims = viewer.scene.primitives.add(pc);
  _tcApplyColors();
  if (_tcPhotoMode()) _tcClampToMesh();
}

async function _tcRun(lon, lat) {          // hourly (Phase A)
  if (_tcBusy) return;
  _tcBusy = true;
  _tcStatus(`Analysing comfort (r=${_tcRadius} m)…`);
  try {
    const r = await fetch("/api/analysis/thermal-comfort", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ lat, lon, radius_m: _tcRadius, grid_m: 5, date: _tcDate,
                             mode: "hourly", country: _tcCountry(), city_id: _tcCityId() }),
    });
    const d = await r.json();
    if (!d.points) throw new Error(d.detail || "no result");
    _tcData = d;
    _tcHourIdx = 0;
    let best = -90;
    d.frames.forEach((f, i) => { if (f.sun_alt > best) { best = f.sun_alt; _tcHourIdx = i; } });
    _tcBuildSlider();
    _tcRenderFrame();
    _tcSyncView();
    _tcStatus(`${d.n_cells} cells · ${d.n_context_buildings} buildings · click again to move.`);
    _tcHint(false);
  } catch (err) {
    _tcStatus("Comfort analysis failed: " + (err && err.message));
  } finally {
    _tcBusy = false;
  }
}

async function _tcRunSeasonal(lon, lat) {  // seasonal aggregate (Phase B)
  if (_tcBusy) return;
  _tcBusy = true;
  _tcStatus(`Analysing season comfort (r=${_tcRadius} m)… this takes a few seconds`);
  try {
    const r = await fetch("/api/analysis/thermal-comfort", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ lat, lon, radius_m: _tcRadius, grid_m: 5,
                             mode: "seasonal", country: _tcCountry(), city_id: _tcCityId() }),
    });
    const d = await r.json();
    if (!d.points) throw new Error(d.detail || "no result");
    _tcSeasonData = d;
    _tcRenderFrame();
    _tcSyncView();
    _tcStatus(`${d.n_cells} cells · ${d.n_context_buildings} buildings · click again to move.`);
    _tcHint(false);
  } catch (err) {
    _tcStatus("Season comfort failed: " + (err && err.message));
  } finally {
    _tcBusy = false;
  }
}

function _tcRunCurrent(lon, lat) {
  _tcCenter = [lon, lat];
  _tcData = null; _tcSeasonData = null;   // new point → drop both caches
  if (_tcMode === "seasonal") _tcRunSeasonal(lon, lat); else _tcRun(lon, lat);
}

function _tcClick(movement) {
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
  _tcRunCurrent(Cesium.Math.toDegrees(c.longitude), Cesium.Math.toDegrees(c.latitude));
}

function thermalComfortSetActive(on) {
  _tcActive = on;
  const panel = document.getElementById("comfort-panel");
  if (panel) panel.style.display = on ? "block" : "none";
  if (on) {
    if (!_tcHandler) {
      _tcHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      _tcHandler.setInputAction(_tcClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }
    _tcStatus("Click a point on the map to analyse outdoor comfort around it.");
    _tcHint(!_tcActiveData());
    _tcSyncView();
  } else {
    if (_tcHandler) { _tcHandler.destroy(); _tcHandler = null; }
    _tcClear();
    _tcHint(false);
  }
}

function _tcStatus(msg) {
  const el = document.getElementById("comfort-status");
  if (el) el.textContent = msg;
}

function _tcHint(show) {
  let el = document.getElementById("comfort-hint");
  if (show) {
    if (!el) {
      el = document.createElement("div");
      el.id = "comfort-hint";
      el.style.cssText =
        "position:absolute;top:16px;left:50%;transform:translateX(-50%);z-index:30;" +
        "background:rgba(17,24,39,0.88);color:#fff;padding:9px 16px;border-radius:20px;" +
        "font:13px/1.3 Inter,system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.35);" +
        "pointer-events:none;display:flex;align-items:center;gap:8px;white-space:nowrap";
      el.innerHTML = '<span style="font-size:15px">🌡️</span>' +
        '<span>Click anywhere on the map to run the comfort analysis there</span>';
      ((viewer && viewer.container) || document.body).appendChild(el);
    }
    el.style.display = "flex";
  } else if (el) {
    el.style.display = "none";
  }
}

function _tcBuildSlider() {
  const sl = document.getElementById("comfort-hour");
  if (!sl || !_tcData || !_tcData.frames.length) return;
  sl.min = 0; sl.max = _tcData.frames.length - 1; sl.value = _tcHourIdx;
  _tcUpdateHourLabel();
}

function _tcUpdateHourLabel() {
  const lbl = document.getElementById("comfort-hourlbl");
  if (!lbl || !_tcData || !_tcData.frames.length) return;
  const f = _tcData.frames[_tcHourIdx];
  lbl.textContent = `${f.t} · air ${f.ta}°C · wind ${f.wind} m/s · sun ${Math.round(f.sun_alt)}°`;
  _tcReadout(f);
}

function _tcReadout(f) {
  const el = document.getElementById("comfort-readout");
  if (!el) return;
  if (_tcMode === "seasonal") {
    if (!_tcSeasonData) { el.innerHTML = ""; return; }
    const vals = _tcSeasonData.comfort_pct[_tcSeason] || [];
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const hrs = (_tcSeasonData.hours && _tcSeasonData.hours[_tcSeason]) || 0;
    el.innerHTML = `Comfortable <b>${Math.round(mean)}%</b> of ${hrs} daytime hours` +
      `<br><span style="font-weight:400;color:rgba(255,255,255,0.6)">${_tcSeason}, area average</span>`;
    return;
  }
  const u = f.utci;
  let mn = Infinity, mx = -Infinity;
  for (const v of u) { if (v < mn) mn = v; if (v > mx) mx = v; }
  const counts = {};
  for (const c of f.cat) counts[c] = (counts[c] || 0) + 1;
  let dom = 0, best = -1;
  for (const k in counts) if (counts[k] > best) { best = counts[k]; dom = +k; }
  const label = (_tcData.labels || [])[dom] || "";
  const rng = (Math.round(mn) === Math.round(mx)) ? `${Math.round(mn)}°C` : `${Math.round(mn)} to ${Math.round(mx)}°C`;
  el.innerHTML = `Feels like (UTCI) <b>${rng}</b><br><span style="font-weight:400;color:rgba(255,255,255,0.6)">${label}</span>`;
}

function _tcSyncView() {
  // mode buttons
  document.querySelectorAll(".tc-mode-btn").forEach(b => {
    b.style.background = (b.dataset.mode === _tcMode) ? "rgba(245,158,11,0.25)" : "transparent";
  });
  const hourly = document.getElementById("tc-hourly-group");
  const seasonal = document.getElementById("tc-seasonal-group");
  if (hourly) hourly.style.display = (_tcMode === "hourly") ? "block" : "none";
  if (seasonal) seasonal.style.display = (_tcMode === "seasonal") ? "block" : "none";
  // date + season active buttons
  document.querySelectorAll(".tc-date-btn").forEach(b => {
    b.style.background = (b.dataset.date === _tcDate) ? "rgba(245,158,11,0.25)" : "transparent";
  });
  document.querySelectorAll(".tc-season-btn").forEach(b => {
    b.style.background = (b.dataset.season === _tcSeason) ? "rgba(245,158,11,0.25)" : "transparent";
  });
  if (_tcMode === "hourly") _tcUpdateHourLabel(); else _tcReadout(null);
  _tcLegend();
}

function _tcLegend() {
  const el = document.getElementById("comfort-legend");
  if (!el) return;
  if (_tcMode === "seasonal") {
    let bar = "";
    for (let i = 0; i <= 10; i++) {
      const c = _tcPctColor(i * 10);
      bar += `rgba(${Math.round(c.red*255)},${Math.round(c.green*255)},${Math.round(c.blue*255)},1) ${i*10}%,`;
    }
    el.innerHTML =
      `<div style="height:8px;border-radius:4px;background:linear-gradient(90deg,${bar.slice(0, -1)})"></div>` +
      `<div style="display:flex;justify-content:space-between;font-size:9px;color:rgba(255,255,255,0.5);margin-top:2px"><span>0% comfortable</span><span>100%</span></div>`;
    return;
  }
  let bar = "";
  _TC_PAL.forEach((c, i) => { bar += `${c} ${i * 10}%, ${c} ${(i + 1) * 10}%,`; });
  el.innerHTML =
    `<div style="height:8px;border-radius:4px;background:linear-gradient(90deg,${bar.slice(0, -1)})"></div>` +
    `<div style="display:flex;justify-content:space-between;font-size:9px;color:rgba(255,255,255,0.5);margin-top:2px"><span>cold stress</span><span>comfortable</span><span>heat stress</span></div>`;
}

function _injectComfort() {
  const group = document.querySelector(".analysis-tools-group")
             || document.querySelector("#urban-analysis-section .overlay-group")
             || document.querySelector("#buildings-content .overlay-group");
  if (!group || document.getElementById("btn-overlay-comfort")) return;
  const btn = document.createElement("button");
  btn.className = "tool-btn";
  btn.id = "btn-overlay-comfort";
  btn.setAttribute("aria-pressed", "false");
  btn.textContent = "🌡️ Thermal comfort (UTCI)";
  const anchor = document.getElementById("incident-panel") || document.getElementById("sunhours-panel");
  if (anchor) anchor.after(btn); else group.appendChild(btn);

  const panel = document.createElement("div");
  panel.id = "comfort-panel";
  panel.style.cssText = "display:none;padding:8px 10px;margin:4px 0 8px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08)";
  panel.innerHTML =
    '<div style="display:flex;gap:4px;margin-bottom:8px">' +
      '<button class="tc-mode-btn" data-mode="hourly" style="flex:1;padding:4px 6px;border-radius:6px;font-size:10px;cursor:pointer;border:1px solid rgba(255,255,255,0.12);background:rgba(245,158,11,0.25);color:rgba(255,255,255,0.85)">Hour of day</button>' +
      '<button class="tc-mode-btn" data-mode="seasonal" style="flex:1;padding:4px 6px;border-radius:6px;font-size:10px;cursor:pointer;border:1px solid rgba(255,255,255,0.12);background:transparent;color:rgba(255,255,255,0.85)">Season comfort %</button>' +
    '</div>' +
    '<div id="tc-hourly-group">' +
      '<div style="font-size:10px;color:rgba(255,255,255,0.45);margin-bottom:6px">Day of year</div>' +
      '<div id="comfort-dates" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px"></div>' +
      '<div id="comfort-hourlbl" style="font-size:10px;color:rgba(255,255,255,0.7);margin:2px 0 2px;text-align:center">—</div>' +
      '<input id="comfort-hour" type="range" min="0" max="1" step="1" value="0" style="width:100%">' +
    '</div>' +
    '<div id="tc-seasonal-group" style="display:none">' +
      '<div style="font-size:10px;color:rgba(255,255,255,0.45);margin-bottom:6px">Season</div>' +
      '<div id="comfort-seasons" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px"></div>' +
    '</div>' +
    '<div style="font-size:10px;color:rgba(255,255,255,0.45);margin:8px 0 4px">Radius: <span id="comfort-rval">150</span> m</div>' +
    '<input id="comfort-radius" type="range" min="60" max="350" step="10" value="150" style="width:100%">' +
    '<div id="comfort-readout" style="font-size:11px;color:rgba(255,255,255,0.9);text-align:center;margin-top:6px;font-weight:600"></div>' +
    '<div id="comfort-legend" style="margin-top:8px"></div>' +
    '<div id="comfort-status" style="font-size:10px;color:rgba(255,255,255,0.55);margin-top:6px;line-height:1.4"></div>' +
    '<div style="font-size:9px;color:rgba(255,255,255,0.4);margin-top:6px;line-height:1.4">UTCI from EPW climate. Longwave MRT from sky temperature × sky-view; solar gain (SolarCal) orientation-averaged. Wind = EPW 10 m (UTCI standard). Season % = share of daytime hours in the no-stress band (9–26 °C).</div>';
  btn.after(panel);

  const dates = panel.querySelector("#comfort-dates");
  _TC_DATES.forEach(([val, label]) => {
    const b = document.createElement("button");
    b.textContent = label; b.className = "tc-date-btn"; b.dataset.date = val;
    b.style.cssText = "padding:4px 8px;border-radius:6px;font-size:10px;cursor:pointer;border:1px solid rgba(255,255,255,0.12);background:transparent;color:rgba(255,255,255,0.8)";
    b.onclick = () => { _tcDate = val; if (_tcCenter) _tcRun(_tcCenter[0], _tcCenter[1]); else _tcSyncView(); };
    dates.appendChild(b);
  });

  const seasons = panel.querySelector("#comfort-seasons");
  _TC_SEASONS.forEach(([val, label]) => {
    const b = document.createElement("button");
    b.textContent = label; b.className = "tc-season-btn"; b.dataset.season = val;
    b.style.cssText = "padding:4px 8px;border-radius:6px;font-size:10px;cursor:pointer;border:1px solid rgba(255,255,255,0.12);background:transparent;color:rgba(255,255,255,0.8)";
    b.onclick = () => { _tcSeason = val; _tcSyncView(); _tcApplyColors(); };
    seasons.appendChild(b);
  });

  const radEl = panel.querySelector("#comfort-radius");
  radEl.oninput = () => { _tcRadius = +radEl.value; panel.querySelector("#comfort-rval").textContent = radEl.value; };
  radEl.onchange = () => { if (_tcCenter) _tcRunCurrent(_tcCenter[0], _tcCenter[1]); };

  const hour = panel.querySelector("#comfort-hour");
  hour.oninput = () => { _tcHourIdx = +hour.value; _tcUpdateHourLabel(); _tcApplyColors(); };

  // mode toggle — refetch that mode for the current point if not already cached
  panel.querySelectorAll(".tc-mode-btn").forEach(b => {
    b.onclick = () => {
      _tcMode = b.dataset.mode;
      _tcSyncView();
      if (_tcCenter) {
        if (_tcActiveData()) { _tcRenderFrame(); }
        else if (_tcMode === "seasonal") _tcRunSeasonal(_tcCenter[0], _tcCenter[1]);
        else _tcRun(_tcCenter[0], _tcCenter[1]);
      }
    };
  });

  btn.addEventListener("click", () => {
    const on = !_tcActive;
    thermalComfortSetActive(on);
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", String(on));
  });
}

function _tcHookBasemap() {
  const orig = window.rebuildBuildings;
  if (typeof orig === "function" && !orig._tcWrapped) {
    const wrapped = function () {
      const p = orig.apply(this, arguments);
      Promise.resolve(p).then(() => { if (_tcActiveData() && _tcActive) _tcRenderFrame(); }).catch(() => {});
      return p;
    };
    wrapped._tcWrapped = true;
    window.rebuildBuildings = wrapped;
  }
}

(function initComfort() {
  if (typeof viewer === "undefined" || !viewer) { setTimeout(initComfort, 500); return; }
  _injectComfort();
  _tcHookBasemap();
})();
