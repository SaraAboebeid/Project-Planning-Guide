// vegetation.js — trees & shrubs from DTCC LiDAR (tools/se/dtcc_vegetation.py).
//
// Data: dtcc_vegetation.json { trees:[{lon,lat,h,crown}], shrubs:[{lon,lat,h}] }
// City-wide there can be ~1M trees, so we render only what's NEAR the camera:
// a spatial grid indexes every tree/shrub, and on each camera move we (re)build
// 3D trunk+crown instances for those within R metres (capped), grounded on the
// same datum as the buildings. Toggle injected into the Buildings panel.

let _vegTrunks = null, _vegCrowns = null, _vegShrubs = null;
let _vegVisible = true, _vegData = null;
let _treeGrid = null, _shrubGrid = null, _refreshTimer = null, _lastKey = '';

const _TRUNK = '#6b4a2f';
const _CROWNS = ['#2f9e4f', '#3fa65a', '#4bb567', '#358a46'];
const _SHRUB = ['#7d9440', '#8aa34b'];
const R_M = 1100;            // render trees within this radius of the camera
const MAX_TREES = 12000;     // hard cap on rendered trees (subsample beyond)
const GRID_DEG = 0.005;      // ~350 m spatial-index cell

function _vegGround(lon, lat) {
  try { return window.getBuildingBaseOffset ? window.getBuildingBaseOffset(lon, lat) : 0; }
  catch { return 0; }
}
function _placement(lon, lat, base, dz) {
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(Cesium.Cartesian3.fromDegrees(lon, lat, base));
  return Cesium.Matrix4.multiplyByTranslation(enu, new Cesium.Cartesian3(0, 0, dz), new Cesium.Matrix4());
}
function _key(lon, lat) { return Math.floor(lon / GRID_DEG) + ':' + Math.floor(lat / GRID_DEG); }
function _index(items) {
  const g = new Map();
  for (const it of items) { const k = _key(it.lon, it.lat); (g.get(k) || g.set(k, []).get(k)).push(it); }
  return g;
}
function _near(grid, lon, lat, radDeg) {
  const out = [];
  const c0 = Math.floor((lon - radDeg) / GRID_DEG), c1 = Math.floor((lon + radDeg) / GRID_DEG);
  const r0 = Math.floor((lat - radDeg) / GRID_DEG), r1 = Math.floor((lat + radDeg) / GRID_DEG);
  for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
    const cell = grid.get(c + ':' + r); if (cell) out.push(...cell);
  }
  return out;
}

function _camGround() {
  const cc = viewer.camera.positionCartographic;
  return { lon: Cesium.Math.toDegrees(cc.longitude), lat: Cesium.Math.toDegrees(cc.latitude) };
}

function _clear() {
  [_vegTrunks, _vegCrowns, _vegShrubs].forEach(p => { if (p) viewer.scene.primitives.remove(p); });
  _vegTrunks = _vegCrowns = _vegShrubs = null;
}

function _refresh(force) {
  if (!_vegData || !_vegVisible) return;
  const cam = _camGround();
  const key = cam.lon.toFixed(3) + ',' + cam.lat.toFixed(3);
  if (!force && key === _lastKey) return;
  _lastKey = key;
  const radDeg = R_M / 111320;
  const mPerLon = 111320 * Math.cos(cam.lat * Math.PI / 180);
  const within = (o) => {
    const dx = (o.lon - cam.lon) * mPerLon, dy = (o.lat - cam.lat) * 111320;
    return dx * dx + dy * dy <= R_M * R_M;
  };
  let trees = _near(_treeGrid, cam.lon, cam.lat, radDeg).filter(within);
  const shrubs = _near(_shrubGrid, cam.lon, cam.lat, radDeg).filter(within);
  if (trees.length > MAX_TREES) {              // keep the tallest when overloaded
    trees = trees.sort((a, b) => b.h - a.h).slice(0, MAX_TREES);
  }
  _clear();
  const col = (hex) => Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.fromCssColorString(hex));
  const trunkInst = [], crownInst = [], shrubInst = [];
  for (let i = 0; i < trees.length; i++) {
    const t = trees[i], base = _vegGround(t.lon, t.lat);
    const h = Math.max(2.5, t.h || 6), crown = Math.max(1.5, t.crown || 3);
    const trunkH = Math.max(1.2, h * 0.4), crownH = h - trunkH;
    const trunkR = Math.max(0.15, Math.min(0.45, crown * 0.09));
    trunkInst.push(new Cesium.GeometryInstance({
      geometry: new Cesium.CylinderGeometry({ length: trunkH, topRadius: trunkR * 0.8, bottomRadius: trunkR, slices: 7 }),
      modelMatrix: _placement(t.lon, t.lat, base, trunkH / 2), attributes: { color: col(_TRUNK) } }));
    crownInst.push(new Cesium.GeometryInstance({
      geometry: new Cesium.EllipsoidGeometry({ radii: new Cesium.Cartesian3(crown, crown, crownH / 2), stackPartitions: 6, slicePartitions: 8 }),
      modelMatrix: _placement(t.lon, t.lat, base, trunkH + crownH / 2), attributes: { color: col(_CROWNS[i % _CROWNS.length]) } }));
  }
  for (let i = 0; i < shrubs.length; i++) {
    const s = shrubs[i], base = _vegGround(s.lon, s.lat), h = Math.max(0.5, s.h || 1);
    shrubInst.push(new Cesium.GeometryInstance({
      geometry: new Cesium.EllipsoidGeometry({ radii: new Cesium.Cartesian3(1.4, 1.4, h * 0.6), stackPartitions: 5, slicePartitions: 7 }),
      modelMatrix: _placement(s.lon, s.lat, base, h * 0.4), attributes: { color: col(_SHRUB[i % _SHRUB.length]) } }));
  }
  const app = () => new Cesium.PerInstanceColorAppearance({ flat: true, translucent: false });
  if (trunkInst.length) _vegTrunks = viewer.scene.primitives.add(new Cesium.Primitive({ geometryInstances: trunkInst, appearance: app(), asynchronous: true }));
  if (crownInst.length) _vegCrowns = viewer.scene.primitives.add(new Cesium.Primitive({ geometryInstances: crownInst, appearance: app(), asynchronous: true }));
  if (shrubInst.length) _vegShrubs = viewer.scene.primitives.add(new Cesium.Primitive({ geometryInstances: shrubInst, appearance: app(), asynchronous: true }));
  viewer.scene.requestRender && viewer.scene.requestRender();
}

async function vegetationInit() {
  if (_vegData) return;
  if (typeof viewer === 'undefined' || !viewer || !window.getBuildingBaseOffset) { setTimeout(vegetationInit, 400); return; }
  try {
    const r = await fetch('dtcc_vegetation.json', { cache: 'default' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    _vegData = await r.json();
  } catch (err) { console.warn('[vegetation] no data for this city:', err && err.message); return; }
  _treeGrid = _index(_vegData.trees || []);
  _shrubGrid = _index(_vegData.shrubs || []);
  console.log(`[vegetation] ${(_vegData.trees || []).length} trees + ${(_vegData.shrubs || []).length} shrubs indexed; rendering near camera`);
  _injectVegToggle();
  _refresh(true);
  viewer.camera.moveEnd.addEventListener(() => {
    clearTimeout(_refreshTimer); _refreshTimer = setTimeout(() => _refresh(false), 350);
  });
  setTimeout(() => _refresh(true), 6000);   // re-ground once calibration settles
}

function vegetationShow() { _vegVisible = true; _refresh(true); }
function vegetationHide() { _vegVisible = false; _clear(); viewer.scene.requestRender && viewer.scene.requestRender(); }
function vegetationIsVisible() { return _vegVisible; }

function _injectVegToggle() {
  const group = document.querySelector('#buildings-content .overlay-group');
  if (!group || document.getElementById('btn-overlay-vegetation')) return;
  const row = document.createElement('div');
  row.className = 'overlay-row';
  row.innerHTML =
    '<button class="overlay-btn active" id="btn-overlay-vegetation" aria-pressed="true">' +
      '<span class="overlay-check"></span><span class="base-name">Trees &amp; shrubs</span>' +
      '<span class="layer-pill">DTCC LiDAR</span></button>';
  group.appendChild(row);
  const btn = row.querySelector('#btn-overlay-vegetation');
  btn.addEventListener('click', () => {
    const on = !vegetationIsVisible();
    on ? vegetationShow() : vegetationHide();
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  });
}

if (typeof window !== 'undefined') {
  window.vegetationShow = vegetationShow;
  window.vegetationHide = vegetationHide;
  window.vegetationIsVisible = vegetationIsVisible;
}
vegetationInit();
