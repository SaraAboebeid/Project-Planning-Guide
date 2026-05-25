// ─────────────────────────────────────────────────────────────────────────────
// vasttrafik.js  —  Västtrafik transit layer for the Gothenburg 3D viewer
//
// Depends on:
//   • Cesium viewer   (global `viewer`)
//   • MAP_CENTER      (global constant injected by build.py)
//   • FastAPI backend running on http://localhost:8000
//     Endpoints used:
//       GET /api/vasttrafik/stops
//       GET /api/vasttrafik/positions
//       GET /api/vasttrafik/departures/{gid}
// ─────────────────────────────────────────────────────────────────────────────

const VT_API = 'http://localhost:8000/api/vasttrafik';

let _vtVisible       = false;   // is transit layer on?
let _vtStopEntities  = [];      // Cesium entity handles for stop icons
let _vtVehicleEntities = [];    // Cesium entity handles for live vehicle icons
let _vtPositionTimer = null;    // setInterval handle for position refresh
let _vtStopsLoaded   = false;   // stops fetched at least once?
let _vtCredsMissing  = false;   // backend reported missing credentials

// ─── Transport-mode icon colours ────────────────────────────────────────────
const VT_MODE_COLOR = {
  tram:    Cesium.Color.fromCssColorString('#e9c24e'),
  bus:     Cesium.Color.fromCssColorString('#3b82f6'),
  ferry:   Cesium.Color.fromCssColorString('#22d3ee'),
  train:   Cesium.Color.fromCssColorString('#a78bfa'),
  subway:  Cesium.Color.fromCssColorString('#f97316'),
};
function _vtModeColor(mode) {
  return VT_MODE_COLOR[mode] || VT_MODE_COLOR.bus;
}

// ─── Toggle transit layer on / off ──────────────────────────────────────────
function toggleTransit() {
  _vtVisible = !_vtVisible;
  const btn = document.getElementById('btn-transit');

  if (_vtVisible) {
    btn.classList.add('active');
    _vtShowLayer();
  } else {
    btn.classList.remove('active');
    _vtHideLayer();
  }
}

// ─── Show layer: load stops + start position refresh ────────────────────────
async function _vtShowLayer() {
  const statusEl = document.getElementById('vt-status');
  statusEl.textContent = 'Loading transit stops…';
  statusEl.style.display = 'block';

  if (!_vtStopsLoaded) {
    await _vtLoadStops();
  } else {
    // Make previously loaded stop entities visible again
    for (const e of _vtStopEntities) e.show = true;
  }

  // Start live vehicle position refresh every 15 seconds
  _vtLoadPositions();
  _vtPositionTimer = setInterval(_vtLoadPositions, 15000);
}

// ─── Hide layer: remove all entities, stop timer ────────────────────────────
function _vtHideLayer() {
  for (const e of _vtStopEntities)   { e.show = false; }
  for (const e of _vtVehicleEntities){ viewer.entities.remove(e); }
  _vtVehicleEntities = [];
  if (_vtPositionTimer) { clearInterval(_vtPositionTimer); _vtPositionTimer = null; }
  document.getElementById('vt-status').style.display = 'none';
  document.getElementById('vt-panel').style.display  = 'none';
}

// ─── Fetch and render stop areas ─────────────────────────────────────────────
async function _vtLoadStops() {
  try {
    const r = await fetch(`${VT_API}/stops`);
    if (!r.ok) {
      const msg = await r.text();
      if (r.status === 503) {
        _vtCredsMissing = true;
        document.getElementById('vt-status').innerHTML =
          '⚠ Västtrafik credentials not configured.<br>'
          + 'Set <code>VT_CLIENT_ID</code> and <code>VT_CLIENT_SECRET</code> in '
          + '<code>backend/main.py</code> and restart the backend.';
        return;
      }
      throw new Error(msg);
    }
    const data = await r.json();

    for (const stop of (data.stops || [])) {
      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(stop.lon, stop.lat, 2),
        billboard: {
          image:             _vtBusStopSvg(),
          width:             22,
          height:            22,
          verticalOrigin:    Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance:   new Cesium.NearFarScalar(200, 1.4, 2000, 0.4),
        },
        label: {
          text:              stop.name,
          font:              '10px Inter, sans-serif',
          fillColor:         Cesium.Color.WHITE,
          outlineColor:      Cesium.Color.BLACK,
          outlineWidth:      2,
          style:             Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset:       new Cesium.Cartesian2(0, -28),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance:   new Cesium.NearFarScalar(200, 1.0, 1500, 0.0),
          translucencyByDistance: new Cesium.NearFarScalar(400, 1.0, 1200, 0.0),
        },
        // Store stop metadata for click handler
        properties: { gid: stop.gid, name: stop.name, type: 'vt-stop' },
      });
      _vtStopEntities.push(entity);
    }

    _vtStopsLoaded = true;
    document.getElementById('vt-status').textContent =
      `${data.count} stops loaded`;
    setTimeout(() => {
      if (_vtVisible) document.getElementById('vt-status').style.display = 'none';
    }, 2500);
  } catch (err) {
    console.error('[vasttrafik] stops error', err);
    document.getElementById('vt-status').textContent = 'Could not load stops: ' + err.message;
  }
}

// ─── Fetch and render live vehicle positions ──────────────────────────────────
async function _vtLoadPositions() {
  if (!_vtVisible) return;
  try {
    const cam     = viewer.camera;
    const ellipsoid = viewer.scene.globe.ellipsoid;
    // Use a ~10 km box around the camera ground position
    const cart = ellipsoid.cartesianToCartographic(cam.position);
    const clat  = Cesium.Math.toDegrees(cart.latitude);
    const clon  = Cesium.Math.toDegrees(cart.longitude);
    const pad   = 0.07; // ~7 km
    const params = new URLSearchParams({
      south: (clat - pad).toFixed(5), north: (clat + pad).toFixed(5),
      west:  (clon - pad).toFixed(5), east:  (clon + pad).toFixed(5),
    });

    const r = await fetch(`${VT_API}/positions?${params}`);
    if (!r.ok) return;
    const data = await r.json();

    // Remove old vehicle markers
    for (const e of _vtVehicleEntities) viewer.entities.remove(e);
    _vtVehicleEntities = [];

    for (const v of (data.vehicles || [])) {
      const color = _vtModeColor(v.transportMode);
      const e = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(v.lon, v.lat, 3),
        billboard: {
          image:  _vtVehicleSvg(color.toCssHexString(), v.line),
          width:  28,
          height: 28,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(100, 1.2, 3000, 0.3),
        },
        properties: { type: 'vt-vehicle', line: v.line, mode: v.transportMode },
      });
      _vtVehicleEntities.push(e);
    }
  } catch (err) {
    // Silently ignore position refresh errors — network blips are common
    console.warn('[vasttrafik] positions refresh error', err.message);
  }
}

// ─── Show departures for a clicked stop ──────────────────────────────────────
async function _vtShowDepartures(gid, name) {
  const panel = document.getElementById('vt-panel');
  document.getElementById('vt-panel-title').textContent = name;
  document.getElementById('vt-departures').innerHTML =
    '<div style="color:var(--muted);padding:8px 0">Loading…</div>';
  panel.style.display = 'block';

  try {
    const r = await fetch(`${VT_API}/departures/${encodeURIComponent(gid)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    _vtRenderDepartures(data.departures || []);
  } catch (err) {
    document.getElementById('vt-departures').innerHTML =
      `<div style="color:#f87171;font-size:11px">Failed to load departures: ${err.message}</div>`;
  }
}

function _vtRenderDepartures(departures) {
  const el = document.getElementById('vt-departures');
  if (!departures.length) {
    el.innerHTML = '<div style="color:var(--muted);padding:8px 0">No upcoming departures</div>';
    return;
  }

  const rows = departures.map(d => {
    const planned   = _vtFormatTime(d.plannedTime);
    const estimated = _vtFormatTime(d.estimatedTime);
    const delay     = _vtDelayMinutes(d.plannedTime, d.estimatedTime);
    const delayStr  = delay > 0 ? `<span style="color:#f87171">+${delay}m</span>`
                    : delay < 0 ? `<span style="color:#4ade80">${delay}m</span>`
                    : '';
    const cancelled = d.isCancelled
      ? '<span style="color:#f87171;font-weight:600"> CANCELLED</span>' : '';

    return `<div class="vt-dep-row">
      <span class="vt-line-badge" style="background:${d.bgColor};color:${d.fgColor}">${d.line}</span>
      <span class="vt-dest">${d.destination || ''}</span>
      <span class="vt-time">${estimated || planned}${delayStr}${cancelled}</span>
    </div>`;
  }).join('');

  el.innerHTML = rows;
}

function _vtFormatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  } catch { return iso.slice(11, 16) || ''; }
}

function _vtDelayMinutes(planned, estimated) {
  if (!planned || !estimated) return 0;
  try {
    return Math.round((new Date(estimated) - new Date(planned)) / 60000);
  } catch { return 0; }
}

// ─── SVG helpers (inline SVG as data URIs so no extra assets are needed) ─────
function _vtBusStopSvg() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
    <circle cx="11" cy="11" r="10" fill="#1e3a5f" stroke="#60a5fa" stroke-width="1.5"/>
    <text x="11" y="15" text-anchor="middle" font-size="11" font-family="sans-serif"
          font-weight="bold" fill="#60a5fa">B</text>
  </svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

function _vtVehicleSvg(hexColor, lineLabel) {
  const label = (lineLabel || '').slice(0, 4);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <rect x="2" y="2" width="24" height="24" rx="5" fill="${hexColor}" stroke="#ffffff" stroke-width="1.5"/>
    <text x="14" y="19" text-anchor="middle" font-size="${label.length > 2 ? 8 : 10}"
          font-family="sans-serif" font-weight="bold" fill="#ffffff">${label}</text>
  </svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

// ─── Wire up click handler on Cesium viewer (add to existing pick handler) ───
(function _vtRegisterPickHandler() {
  // We extend the existing mouse handler rather than replacing it.
  // The ui.js `handler` for MOUSE_MOVE/LEFT_CLICK is already set up;
  // here we add a supplementary handler just for transit entities.
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  handler.setInputAction(evt => {
    if (!_vtVisible) return;
    const picked = viewer.scene.pick(evt.position);
    if (!picked || !picked.id) return;
    const props = picked.id.properties;
    if (!props) return;
    const type = props.type && props.type.getValue ? props.type.getValue() : props.type;
    if (type === 'vt-stop') {
      const gid  = props.gid  && props.gid.getValue  ? props.gid.getValue()  : props.gid;
      const name = props.name && props.name.getValue ? props.name.getValue() : props.name;
      _vtShowDepartures(gid, name);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
})();

// ─── Close departures panel ───────────────────────────────────────────────────
document.getElementById('btn-vt-close').addEventListener('click', () => {
  document.getElementById('vt-panel').style.display = 'none';
});

// ─── Main toggle button ───────────────────────────────────────────────────────
document.getElementById('btn-transit').addEventListener('click', toggleTransit);
