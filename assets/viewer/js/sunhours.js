// sunhours.js — direct sun-hours analysis. Turn it on, click a point, and the
// ground disc around it shows the sun. Two views of the same result:
//   • Hour  — sun/shade at one instant; drag the slider through the day (winter
//             days are short, shadows long — the seasonal difference is obvious).
//   • Full day — total sunlit hours per spot, blue (shaded) → yellow (open sky).
// One backend call returns the whole day's frames; the slider scrubs them
// client-side (no re-fetch). Backend does the astronomy + raytraced shadow map.

let _shActive = false;
let _shPrims = null;
let _shHandler = null;
let _shDate = "2026-06-21";
let _shRadius = 150;
let _shBusy = false;
let _shData = null;      // last backend result (points + frames + cumulative hours)
let _shHourIdx = 0;      // selected timestep in _shData.frames
let _shMode = "hour";    // "hour" (instant) | "day" (cumulative)

const _SH_DATES = [
  ["2026-06-21", "Jun (summer)"],
  ["2026-03-21", "Mar/Sep (equinox)"],
  ["2026-12-21", "Dec (winter)"],
];

// cumulative-hours ramp: shaded (low) → blue; sunny (high) → yellow/orange
function _shColorHours(h, maxh) {
  const t = Math.max(0, Math.min(1, h / Math.max(0.5, maxh)));
  return Cesium.Color.fromHsl(0.66 - t * 0.57, 0.95, 0.5, 0.95);
}
// instant view: two flat colours so the shadow pattern reads as one surface
const _SH_LIT = Cesium.Color.fromCssColorString("#FFC83D").withAlpha(0.95);
const _SH_SHADE = Cesium.Color.fromCssColorString("#274690").withAlpha(0.9);

function _shBaseTz() {
  return (window.VIEWER_COUNTRY === "uk") ? 0.0 : 1.0;  // DST added server-side
}

function _shClear() {
  if (_shPrims) { try { viewer.scene.primitives.remove(_shPrims); } catch (_) {} _shPrims = null; }
}

// Rebuild the disc from the cached result using the CURRENT ground offsets, so it
// stays glued to whatever basemap is active (photorealistic mesh or flat map).
function _shRenderFrame() {
  if (!_shData) return;
  _shClear();
  const pts = _shData.points;
  const frame = (_shMode === "hour" && _shData.frames && _shData.frames.length)
    ? _shData.frames[Math.max(0, Math.min(_shData.frames.length - 1, _shHourIdx))]
    : null;
  const maxh = _shData.possible_hours || _shData.max_hours || 1;
  const pc = new Cesium.PointPrimitiveCollection();
  for (let i = 0; i < pts.length; i++) {
    const plon = pts[i][0], plat = pts[i][1];
    const base = window.getBuildingBaseOffset ? window.getBuildingBaseOffset(plon, plat) : 0;
    const color = frame
      ? (frame.lit[i] ? _SH_LIT : _SH_SHADE)
      : _shColorHours(pts[i][2], maxh);
    pc.add({
      position: Cesium.Cartesian3.fromDegrees(plon, plat, base + 0.6),
      color, pixelSize: 8, disableDepthTestDistance: 0,
    });
  }
  _shPrims = viewer.scene.primitives.add(pc);
  viewer.scene.requestRender && viewer.scene.requestRender();
}

async function _shRun(lon, lat) {
  if (_shBusy) return;
  _shBusy = true;
  _shStatus(`Analysing (r=${_shRadius} m)…`);
  try {
    const r = await fetch("/api/analysis/sun-hours", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ lat, lon, radius_m: _shRadius, grid_m: 5, date: _shDate, base_tz: _shBaseTz() }),
    });
    const d = await r.json();
    _shData = d;
    // start the slider at solar noon (highest sun) — the most legible frame
    _shHourIdx = 0;
    if (d.frames && d.frames.length) {
      let best = -90;
      d.frames.forEach((f, i) => { if (f.alt > best) { best = f.alt; _shHourIdx = i; } });
    }
    _shBuildHourSlider();
    _shRenderFrame();
    _shStatus(`${d.n_cells} cells · ${d.n_context_buildings} buildings · click again to move.`);
    _shSyncView();
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
  } else {
    if (_shHandler) { _shHandler.destroy(); _shHandler = null; }
    _shClear();
  }
}

function _shStatus(msg) {
  const el = document.getElementById("sunhours-status");
  if (el) el.textContent = msg;
}

// Update the mode buttons, hour-slider row, and legend for the current view.
function _shSyncView() {
  const hourRow = document.getElementById("sunhours-hourrow");
  const haveFrames = _shData && _shData.frames && _shData.frames.length;
  if (hourRow) hourRow.style.display = (_shMode === "hour" && haveFrames) ? "block" : "none";
  document.querySelectorAll(".sh-mode-btn").forEach(b => {
    const on = b.dataset.mode === _shMode;
    b.style.background = on ? "rgba(245,158,11,0.25)" : "transparent";
  });
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
  lbl.textContent = `${f.t} · sun ${Math.round(f.alt)}° high`;
}

function _shLegend() {
  const el = document.getElementById("sunhours-legend");
  if (!el) return;
  if (_shMode === "hour") {
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
  const group = document.querySelector("#buildings-content .overlay-group");
  if (!group || document.getElementById("btn-overlay-sunhours")) return;
  // toggle row
  const row = document.createElement("div");
  row.className = "overlay-row";
  row.innerHTML =
    '<button class="overlay-btn" id="btn-overlay-sunhours" aria-pressed="false">' +
    '<span class="overlay-check"></span><span class="base-name">Sun-hours</span>' +
    '<span class="layer-pill">Analysis</span></button>';
  group.appendChild(row);
  // control panel (hidden until active)
  const panel = document.createElement("div");
  panel.id = "sunhours-panel";
  panel.style.cssText = "display:none;padding:8px 10px;margin:4px 0 8px;border-radius:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08)";
  panel.innerHTML =
    '<div style="font-size:10px;color:rgba(255,255,255,0.45);margin-bottom:6px">Day of year</div>' +
    '<div id="sunhours-dates" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px"></div>' +
    '<div style="font-size:10px;color:rgba(255,255,255,0.45);margin-bottom:4px">Radius: <span id="sunhours-rval">150</span> m</div>' +
    '<input id="sunhours-radius" type="range" min="60" max="400" step="10" value="150" style="width:100%">' +
    '<div style="display:flex;gap:4px;margin:10px 0 6px">' +
      '<button class="sh-mode-btn" data-mode="hour" style="flex:1;padding:4px 8px;border-radius:6px;font-size:10px;cursor:pointer;border:1px solid rgba(255,255,255,0.12);background:rgba(245,158,11,0.25);color:rgba(255,255,255,0.85)">Hour of day</button>' +
      '<button class="sh-mode-btn" data-mode="day" style="flex:1;padding:4px 8px;border-radius:6px;font-size:10px;cursor:pointer;border:1px solid rgba(255,255,255,0.12);background:transparent;color:rgba(255,255,255,0.85)">Full day</button>' +
    '</div>' +
    '<div id="sunhours-hourrow" style="display:none">' +
      '<div id="sunhours-hourlbl" style="font-size:10px;color:rgba(255,255,255,0.7);margin-bottom:2px;text-align:center">—</div>' +
      '<input id="sunhours-hour" type="range" min="0" max="1" step="1" value="0" style="width:100%">' +
    '</div>' +
    '<div id="sunhours-legend" style="margin-top:8px"></div>' +
    '<div id="sunhours-status" style="font-size:10px;color:rgba(255,255,255,0.55);margin-top:6px;line-height:1.4"></div>';
  row.after(panel);

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
      // recompute for the new day if a point is already chosen
      if (_shData && _shData.center) _shRun(_shData.center[0], _shData.center[1]);
    };
    dates.appendChild(b);
  });

  const rad = panel.querySelector("#sunhours-radius");
  rad.oninput = () => { _shRadius = +rad.value; panel.querySelector("#sunhours-rval").textContent = rad.value; };

  // mode buttons — swap the view of the already-computed result (no re-fetch)
  panel.querySelectorAll(".sh-mode-btn").forEach(b => {
    b.onclick = () => { _shMode = b.dataset.mode; _shSyncView(); _shRenderFrame(); };
  });

  // hour slider — scrub the cached frames instantly
  const hour = panel.querySelector("#sunhours-hour");
  hour.oninput = () => {
    _shHourIdx = +hour.value;
    _shUpdateHourLabel();
    _shRenderFrame();
  };

  const btn = row.querySelector("#btn-overlay-sunhours");
  btn.addEventListener("click", () => {
    const on = !_shActive;
    sunHoursSetActive(on);
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", String(on));
  });
}

// Keep the disc glued to the ground: buildings rebuild whenever the basemap
// switches (photorealistic mesh ⇄ flat map), which changes ground offsets — so
// re-render the disc from the cached result right after every rebuild.
function _shHookBasemap() {
  const orig = window.rebuildBuildings;
  if (typeof orig === "function" && !orig._shWrapped) {
    const wrapped = function () {
      const p = orig.apply(this, arguments);
      Promise.resolve(p).then(() => { if (_shData) _shRenderFrame(); }).catch(() => {});
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
