// roofs.js — pitched/gable roof caps from DTCC LiDAR (tools/se/dtcc_roofs.py).
//
// Data: roofs_gothenburg.json { roofs:[{i, eave, ridge, az}] } where i is the
// building index in DATA, eave/ridge are heights above ground (m) and az is the
// ridge azimuth (footprint long axis, degrees).
//
// Rendering: for each pitched building we draw a ridge-draped gable cap sitting
// on the existing flat roof top — walls are left untouched (low risk), and the
// cap rises by (ridge-eave) to a ridge line along the building's long axis. Each
// footprint edge is lifted to its projection on that ridge line, so arbitrary
// footprints get a plausible gable/hip cap. Toggle injected into the Buildings
// panel; off by default.

let _roofPrims = [];
let _roofData = null;          // Map(buildingIdx -> {eave,ridge,az})
let _roofVisible = false;
const ROOF_CHUNK = 6000;

function _roofColor(b) {
  // Match the building's colour so roofs read as part of the building, a touch
  // darker so the ridge reads against the walls.
  try {
    const c = getBuildingColor(b);
    return new Cesium.Color(c.red * 0.82, c.green * 0.82, c.blue * 0.82, 1.0);
  } catch (_) { return Cesium.Color.fromCssColorString('#8a7266'); }
}

// Build a gable-cap Geometry for one building (positions only — flat appearance).
function _roofGeometry(ring, meta) {
  const C = ringCentroid(ring);
  const baseH = window.getBuildingBaseOffset(C.lon, C.lat);
  const latR = C.lat * Math.PI / 180;
  const mLon = 111320 * Math.cos(latR), mLat = 110540;
  const azR = meta.az * Math.PI / 180;
  const ux = Math.cos(azR), uy = Math.sin(azR);   // long (ridge) axis
  const wx = -Math.sin(azR), wy = Math.cos(azR);  // short (cross) axis

  const N = ring.length;
  const closed = (ring[0][0] === ring[N - 1][0] && ring[0][1] === ring[N - 1][1]);
  const count = closed ? N - 1 : N;
  if (count < 3) return null;

  // Oriented bounding box in the (u,w) frame → a clean rectangle for the gable.
  let uMin = Infinity, uMax = -Infinity, wMin = Infinity, wMax = -Infinity;
  for (let k = 0; k < count; k++) {
    const e = (ring[k][0] - C.lon) * mLon, n = (ring[k][1] - C.lat) * mLat;
    const pu = e * ux + n * uy, pw = e * wx + n * wy;
    if (pu < uMin) uMin = pu; if (pu > uMax) uMax = pu;
    if (pw < wMin) wMin = pw; if (pw > wMax) wMax = pw;
  }
  const wC = (wMin + wMax) / 2, halfW = (wMax - wMin) / 2;

  // Rectangularity gate: a single gable only reads correctly on a footprint that
  // (roughly) fills its oriented bounding box. L-shaped / courtyard blocks would
  // get one giant wrong gable over the whole bbox — leave those flat.
  let area2 = 0;
  for (let k = 0; k < count; k++) {
    const e1 = (ring[k][0] - C.lon) * mLon, n1 = (ring[k][1] - C.lat) * mLat;
    const e2 = (ring[(k + 1) % count][0] - C.lon) * mLon, n2 = (ring[(k + 1) % count][1] - C.lat) * mLat;
    area2 += e1 * n2 - e2 * n1;
  }
  const obbArea = (uMax - uMin) * (wMax - wMin);
  if (obbArea < 1 || (Math.abs(area2) / 2) / obbArea < 0.72) return null;

  const b = DATA[meta.i];
  const topH = Math.max(3, b.height || (b.floors ? b.floors * 3 : 6));
  let rise = Math.max(0.8, Math.min(6, meta.ridge - meta.eave));
  rise = Math.min(rise, halfW * 0.9);      // never out-rise the building's half-width
  if (rise < 0.5) return null;
  const eaveUp = baseH + topH, ridgeUp = eaveUp + rise;

  const M = Cesium.Transforms.eastNorthUpToFixedFrame(Cesium.Cartesian3.fromDegrees(C.lon, C.lat, 0));
  const P = (pu, pw, up) => {
    const e = pu * ux + pw * wx, n = pu * uy + pw * wy;
    return Cesium.Matrix4.multiplyByPoint(M, new Cesium.Cartesian3(e, n, up), new Cesium.Cartesian3());
  };
  // 4 eave corners + 2 ridge ends
  const V = [
    P(uMin, wMin, eaveUp), P(uMax, wMin, eaveUp),   // 0,1  (wMin eave edge)
    P(uMax, wMax, eaveUp), P(uMin, wMax, eaveUp),   // 2,3  (wMax eave edge)
    P(uMin, wC, ridgeUp), P(uMax, wC, ridgeUp),     // 4,5  (ridge ends)
  ];
  const positions = [];
  V.forEach(p => positions.push(p.x, p.y, p.z));
  // Double-sided (fwd + reversed) so back-face culling can never hide the roof.
  const idx = [];
  const quad = (a, b2, c, d) => idx.push(a, b2, c, a, c, d, a, c, b2, a, d, c);
  const tri = (a, b2, c) => idx.push(a, b2, c, a, c, b2);
  quad(0, 1, 5, 4);   // slope on the wMin side
  quad(3, 2, 5, 4);   // slope on the wMax side
  tri(0, 3, 4);       // gable end at uMin
  tri(1, 2, 5);       // gable end at uMax

  return new Cesium.Geometry({
    attributes: {
      position: new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: new Float64Array(positions),
      }),
    },
    indices: new Uint16Array(idx),
    primitiveType: Cesium.PrimitiveType.TRIANGLES,
    boundingSphere: Cesium.BoundingSphere.fromVertices(positions),
  });
}

function _clearRoofs() {
  _roofPrims.forEach(p => { try { viewer.scene.primitives.remove(p); } catch (_) {} });
  _roofPrims = [];
}

function _buildRoofs() {
  _clearRoofs();
  if (!_roofData || !_roofVisible || typeof DATA === 'undefined') return;
  const app = () => new Cesium.PerInstanceColorAppearance({ flat: true, translucent: false });
  let instances = [];
  const flush = () => {
    if (!instances.length) return;
    _roofPrims.push(viewer.scene.primitives.add(new Cesium.Primitive({
      geometryInstances: instances, appearance: app(), asynchronous: true,
    })));
    instances = [];
  };
  _roofData.forEach((meta, i) => {
    const b = DATA[i];
    const ring = b && b.coordinates && b.coordinates[0];
    if (!ring || ring.length < 4) return;
    let geom = null;
    try { geom = _roofGeometry(ring, meta); } catch (_) { geom = null; }
    if (!geom) return;
    instances.push(new Cesium.GeometryInstance({
      geometry: geom,
      attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(_roofColor(b)) },
    }));
    if (instances.length >= ROOF_CHUNK) flush();
  });
  flush();
  viewer.scene.requestRender && viewer.scene.requestRender();
}

function roofsShow() { _roofVisible = true; _buildRoofs(); }
function roofsHide() { _roofVisible = false; _clearRoofs(); viewer.scene.requestRender && viewer.scene.requestRender(); }
function roofsIsVisible() { return _roofVisible; }
// Re-ground after a basemap switch changes the building base offset.
window.roofsRebuild = function () { if (_roofVisible) _buildRoofs(); };

function _injectRoofToggle() {
  const group = document.querySelector('#buildings-content .overlay-group');
  if (!group || document.getElementById('btn-overlay-roofs')) return;
  const row = document.createElement('div');
  row.className = 'overlay-row';
  row.innerHTML =
    '<button class="overlay-btn" id="btn-overlay-roofs" aria-pressed="false">' +
      '<span class="overlay-check"></span><span class="base-name">Pitched roofs</span>' +
      '<span class="layer-pill">Lantmäteriet LiDAR</span></button>';
  group.appendChild(row);
  const btn = row.querySelector('#btn-overlay-roofs');
  btn.addEventListener('click', () => {
    const on = !roofsIsVisible();
    on ? roofsShow() : roofsHide();
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  });
}

async function roofsInit() {
  if (_roofData) return;
  if (typeof viewer === 'undefined' || !viewer || typeof DATA === 'undefined' || !window.getBuildingBaseOffset) {
    setTimeout(roofsInit, 500); return;
  }
  try {
    const r = await fetch('roofs_gothenburg.json', { cache: 'default' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    _roofData = new Map((j.roofs || []).map(o => [o.i, o]));
  } catch (err) {
    console.warn('[roofs] no data for this city:', err && err.message); return;
  }
  console.log(`[roofs] ${_roofData.size} pitched-roof caps available (toggle in Buildings)`);
  _injectRoofToggle();
}

roofsInit();
