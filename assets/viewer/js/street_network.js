// ─────────────────────────────────────────────────────────────────────────────
// street_network.js — Additional Layers · plain OSM street-network reference
//
// A neutral map underlay: the same OSM road centrelines the space-syntax analysis
// consumes (/api/osm/roads), but drawn as thin, subtle white lines with NO
// analysis colouring — just for orientation under the buildings. Self-injects a
// checkbox toggle into the "Additional Layers" group so it matches the other
// layer rows (Trees & shrubs, Roofs, …). Refreshes for the current view as the
// camera settles; road results are cached per-bbox on the backend.
// ─────────────────────────────────────────────────────────────────────────────

const SN_API      = '/api/osm/roads';
const SN_MAX_DEG  = 0.04;   // clamp the fetch box (~4.4 km) so a zoomed-out view can't ask for a whole region

let _snEntities = [];
let _snActive   = false;
let _snBusy     = false;
let _snLastKey  = null;      // avoid re-fetching the same (rounded) bbox
let _snMoveHooked = false;
let _snRefreshTimer = null;

// Subtle white lines; slightly thicker/brighter for bigger roads.
function _snStyle(roadClass) {
  switch (roadClass) {
    case 'major':     return { width: 2.2, alpha: 0.70 };
    case 'primary':   return { width: 1.9, alpha: 0.62 };
    case 'secondary': return { width: 1.5, alpha: 0.52 };
    case 'service':
    case 'pedestrian':
    case 'cycling':   return { width: 0.9, alpha: 0.32 };
    default:          return { width: 1.1, alpha: 0.42 };   // local / unclassified
  }
}

// Camera view rectangle, clamped to a manageable box around the centre.
function _snBox() {
  const c = window.VIEW_CENTER || (typeof MAP_CENTER !== 'undefined' ? MAP_CENTER : { lat: 57.70, lon: 11.96 });
  let south = c.lat - SN_MAX_DEG, north = c.lat + SN_MAX_DEG, west = c.lon - SN_MAX_DEG, east = c.lon + SN_MAX_DEG;
  const rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid, new Cesium.Rectangle());
  if (rect) {
    south = Math.max(Cesium.Math.toDegrees(rect.south), c.lat - SN_MAX_DEG);
    north = Math.min(Cesium.Math.toDegrees(rect.north), c.lat + SN_MAX_DEG);
    west  = Math.max(Cesium.Math.toDegrees(rect.west),  c.lon - SN_MAX_DEG);
    east  = Math.min(Cesium.Math.toDegrees(rect.east),  c.lon + SN_MAX_DEG);
  }
  return { south, north, west, east };
}

async function _snFetch(force) {
  if (_snBusy || !_snActive) return;
  const b = _snBox();
  const key = [b.south, b.north, b.west, b.east].map(x => x.toFixed(3)).join(',');
  if (!force && key === _snLastKey) return;   // same view already drawn
  _snBusy = true;
  _snSetStatus('Loading street network…');
  try {
    const url = `${SN_API}?south=${b.south.toFixed(4)}&north=${b.north.toFixed(4)}&west=${b.west.toFixed(4)}&east=${b.east.toFixed(4)}`;
    const r = await fetch(url);
    if (!r.ok) {
      let t = ''; try { t = await r.text(); } catch (_) {}
      throw new Error(`${r.status}${t ? ': ' + t.slice(0, 120) : ''}`);
    }
    const gj = await r.json();
    if (!_snActive) return;   // toggled off while loading
    _snRender(gj);
    _snLastKey = key;
    _snSetStatus(`${(gj.count || 0).toLocaleString()} street segments`);
  } catch (e) {
    console.error('[street-network]', e);
    _snSetStatus('Street network unavailable: ' + (e.message || e));
  } finally {
    _snBusy = false;
  }
}

function _snRender(gj) {
  _snClear();
  for (const f of (gj.features || [])) {
    const coords = f.geometry && f.geometry.coordinates;
    if (!coords || coords.length < 2) continue;
    const st = _snStyle(f.properties && f.properties.road_class);
    _snEntities.push(viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(coords.flat()),
        width: st.width,
        material: Cesium.Color.WHITE.withAlpha(st.alpha),
        clampToGround: true,
        classificationType: Cesium.ClassificationType.TERRAIN,
      },
      properties: { type: 'street-network', name: (f.properties && f.properties.name) || '', highway: f.properties && f.properties.highway },
    }));
  }
  viewer.scene.requestRender && viewer.scene.requestRender();
}

function _snClear() {
  _snEntities.forEach(e => viewer.entities.remove(e));
  _snEntities = [];
  viewer.scene.requestRender && viewer.scene.requestRender();
}

function _snSetStatus(msg) {
  const el = document.getElementById('street-network-status');
  if (el) { el.style.display = 'block'; el.textContent = msg; }
}

// ── Public toggle ────────────────────────────────────────────────────────────
function streetNetworkShow() {
  _snActive = true;
  _snLastKey = null;
  _snHookCamera();
  _snFetch(true);
}
function streetNetworkHide() {
  _snActive = false;
  _snClear();
  const el = document.getElementById('street-network-status');
  if (el) el.style.display = 'none';
}
window.streetNetworkShow = streetNetworkShow;
window.streetNetworkHide = streetNetworkHide;

// Re-fetch (debounced) when the camera settles on a new area.
function _snHookCamera() {
  if (_snMoveHooked || typeof viewer === 'undefined' || !viewer) return;
  viewer.camera.moveEnd.addEventListener(() => {
    if (!_snActive) return;
    clearTimeout(_snRefreshTimer);
    _snRefreshTimer = setTimeout(() => _snFetch(false), 400);
  });
  _snMoveHooked = true;
}

// ── Self-inject the toggle row into "Additional Layers" ──────────────────────
(function initStreetNetwork() {
  function inject() {
    if (typeof viewer === 'undefined' || !viewer) return false;
    const group = document.querySelector('#buildings-content .overlay-group');
    if (!group) return false;
    if (document.getElementById('btn-overlay-streetnetwork')) return true;
    const row = document.createElement('div');
    row.className = 'overlay-row';
    row.innerHTML =
      '<button class="overlay-btn" id="btn-overlay-streetnetwork" aria-pressed="false">' +
        '<span class="overlay-check"></span><span class="base-name">Street network</span>' +
        '<span class="layer-pill">OSM</span></button>';
    group.appendChild(row);
    const status = document.createElement('div');
    status.id = 'street-network-status';
    status.style.cssText = 'display:none;font-size:9.5px;color:var(--muted);padding:2px 12px 6px;line-height:1.4';
    group.appendChild(status);
    const btn = row.querySelector('#btn-overlay-streetnetwork');
    btn.addEventListener('click', () => {
      const on = !_snActive;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
      if (on) streetNetworkShow(); else streetNetworkHide();
    });
    return true;
  }
  if (inject()) return;
  let tries = 0;
  const iv = setInterval(() => { if (inject() || ++tries > 30) clearInterval(iv); }, 400);
})();
