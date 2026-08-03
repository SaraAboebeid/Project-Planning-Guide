// ─────────────────────────────────────────────────────────────────────────────
// space_syntax.js — Urban Analysis · space-syntax centrality of the street network
//
// Toggled from the "Urban Analysis" section. Fetches /api/urban/space-syntax for
// the current view and colours each street segment by the chosen measure:
//   betweenness — through-movement ("choice")
//   integration — closeness ("how central")
//   reach       — network reachable within a radius
// Method A engine is pure-Python networkx (backend/space_syntax.py); it can be
// swapped for SMoG's Pstalgo later WITHOUT touching this layer, since the endpoint
// returns the same GeoJSON (per-segment value / value_norm). Method after SMoG
// (Spatial Morphology Group, Chalmers).
// ─────────────────────────────────────────────────────────────────────────────

const SS_API = '/api/urban/space-syntax';
const SS_MAX_DEG = 0.03;   // clamp the analysis box (~3.3 km) so the compute stays fast

let _ssEntities = [];
let _ssActive   = false;
let _ssMetric   = 'betweenness';
let _ssBusy     = false;

const SS_METRIC_LABEL = { betweenness: 'Betweenness', integration: 'Integration', reach: 'Reach' };

// Turbo-style sequential ramp: low (cool) → high (hot).
const _SS_RAMP = [
  [0.00, [48, 18, 59]], [0.13, [70, 102, 220]], [0.28, [40, 190, 235]], [0.43, [80, 220, 140]],
  [0.60, [160, 235, 60]], [0.75, [250, 180, 40]], [0.88, [235, 90, 35]], [1.00, [122, 4, 3]],
];
function _ssColorBytes(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < _SS_RAMP.length; i++) {
    if (t <= _SS_RAMP[i][0]) {
      const a = _SS_RAMP[i - 1], b = _SS_RAMP[i];
      const f = (t - a[0]) / ((b[0] - a[0]) || 1);
      return [Math.round(a[1][0] + (b[1][0] - a[1][0]) * f),
              Math.round(a[1][1] + (b[1][1] - a[1][1]) * f),
              Math.round(a[1][2] + (b[1][2] - a[1][2]) * f)];
    }
  }
  return [122, 4, 3];
}

// Camera view rectangle, clamped to a manageable box around the city centre so a
// zoomed-out camera can't ask for (and slowly compute) a whole-region network.
function _ssBox() {
  const c = window.VIEW_CENTER || (typeof MAP_CENTER !== 'undefined' ? MAP_CENTER : { lat: 57.70, lon: 11.96 });
  let south = c.lat - SS_MAX_DEG, north = c.lat + SS_MAX_DEG, west = c.lon - SS_MAX_DEG, east = c.lon + SS_MAX_DEG;
  const rect = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid, new Cesium.Rectangle());
  if (rect) {
    south = Math.max(Cesium.Math.toDegrees(rect.south), c.lat - SS_MAX_DEG);
    north = Math.min(Cesium.Math.toDegrees(rect.north), c.lat + SS_MAX_DEG);
    west  = Math.max(Cesium.Math.toDegrees(rect.west),  c.lon - SS_MAX_DEG);
    east  = Math.min(Cesium.Math.toDegrees(rect.east),  c.lon + SS_MAX_DEG);
  }
  return { south, north, west, east };
}

async function _ssFetch() {
  if (_ssBusy) return;
  _ssBusy = true;
  _ssSetStatus(`Computing ${SS_METRIC_LABEL[_ssMetric].toLowerCase()} on the street network… (a few seconds)`);
  try {
    const b = _ssBox();
    const url = `${SS_API}?south=${b.south.toFixed(4)}&north=${b.north.toFixed(4)}&west=${b.west.toFixed(4)}&east=${b.east.toFixed(4)}&metric=${_ssMetric}&radius=1000`;
    const r = await fetch(url);
    if (!r.ok) {
      let t = ''; try { t = await r.text(); } catch (_) {}
      throw new Error(`${r.status}${t ? ': ' + t.slice(0, 140) : ''}`);
    }
    const gj = await r.json();
    if (!_ssActive) return;   // toggled off while it was computing
    _ssRender(gj);
    _ssSetStatus(`${(gj.count || 0).toLocaleString()} street segments · ${(gj.nodes || 0).toLocaleString()} nodes${gj.approx ? ' · approx. (large network)' : ''}`);
    _ssBuildLegend(gj);
  } catch (e) {
    console.error('[space-syntax]', e);
    _ssSetStatus('Analysis unavailable: ' + (e.message || e));
  } finally {
    _ssBusy = false;
  }
}

function _ssRender(gj) {
  _ssClear();
  for (const f of (gj.features || [])) {
    const coords = f.geometry && f.geometry.coordinates;
    if (!coords || coords.length < 2) continue;
    const v = f.properties.value_norm ?? 0;
    const [rr, gg, bb] = _ssColorBytes(v);
    _ssEntities.push(viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(coords.flat()),
        width: 1.4 + v * 4.6,   // busier streets drawn thicker
        material: new Cesium.PolylineOutlineMaterialProperty({
          color: Cesium.Color.fromBytes(rr, gg, bb, 235),
          outlineColor: Cesium.Color.BLACK.withAlpha(0.35), outlineWidth: 0.6,
        }),
        clampToGround: true, classificationType: Cesium.ClassificationType.TERRAIN,
      },
      properties: { type: 'space-syntax', metric: _ssMetric, value: f.properties.value, value_norm: v, name: f.properties.name },
    }));
  }
}

function _ssClear() { _ssEntities.forEach(e => viewer.entities.remove(e)); _ssEntities = []; }

function _ssSetStatus(msg) {
  const el = document.getElementById('ss-status');
  if (el) { el.style.display = 'block'; el.textContent = msg; }
}

function _ssBuildLegend(gj) {
  const el = document.getElementById('ss-legend'); if (!el) return;
  const stops = [];
  for (let i = 0; i <= 6; i++) { const [r, g, b] = _ssColorBytes(i / 6); stops.push(`rgb(${r},${g},${b}) ${(i / 6 * 100).toFixed(0)}%`); }
  const fmt = (x) => gj.metric === 'reach' ? Math.round(x).toLocaleString() : (x || 0).toFixed(3);
  el.style.display = 'block';
  el.innerHTML =
    `<div style="font-size:10px;color:var(--muted);margin-bottom:3px">${SS_METRIC_LABEL[gj.metric] || gj.metric} — low → high</div>` +
    `<div style="height:9px;border-radius:5px;background:linear-gradient(90deg,${stops.join(',')})"></div>` +
    `<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-top:2px"><span>${fmt(gj.min)}</span><span>${fmt(gj.max)}</span></div>`;
}

// ── Public toggle + controls ────────────────────────────────────────────────
async function spaceSyntaxShow() {
  _ssActive = true;
  const c = document.getElementById('ss-controls'); if (c) c.style.display = 'block';
  await _ssFetch();
}
function spaceSyntaxHide() {
  _ssActive = false;
  _ssClear();
  ['ss-controls', 'ss-status', 'ss-legend'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
}
window.spaceSyntaxHide = spaceSyntaxHide;

(function initSpaceSyntax() {
  const btn = document.getElementById('btn-urban-spacesyntax');
  if (btn) btn.addEventListener('click', () => {
    const on = !_ssActive;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) spaceSyntaxShow(); else spaceSyntaxHide();
  });
  ['betweenness', 'integration', 'reach'].forEach(m => {
    const t = document.getElementById('ss-tab-' + m);
    if (t) t.addEventListener('click', () => {
      _ssMetric = m;
      ['betweenness', 'integration', 'reach'].forEach(x => {
        const el = document.getElementById('ss-tab-' + x);
        if (el) el.classList.toggle('active', x === m);
      });
      if (_ssActive) _ssFetch();
    });
  });
  const rf = document.getElementById('ss-refresh');
  if (rf) rf.addEventListener('click', () => { if (_ssActive) _ssFetch(); });
})();
