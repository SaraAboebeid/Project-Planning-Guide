// =============================================================
// cesium.js — Viewer init, Google tiles, EUBUCCO overlay,
//             color modes, startup sequence
// Depends on: legend.js (updateLegend), DATA (loaded by bootstrap)
// =============================================================

// Cesium.Color objects for 3D building extrusion coloring
const USE_COLORS = {
  bostad_enfamilj:   Cesium.Color.fromBytes(255,165, 50,210),
  bostad_flerfamilj: Cesium.Color.fromBytes(255,210, 60,210),
  verksamhet:        Cesium.Color.fromBytes( 70,180,255,210),
  industri:          Cesium.Color.fromBytes(200, 80, 60,210),
  samhalle:          Cesium.Color.fromBytes( 70,210,140,210),
  komplement:        Cesium.Color.fromBytes(140,140,160,180),
  ovrigt:            Cesium.Color.fromBytes(160,120,200,180),
};
const ECLASS_COLORS = {
  A: Cesium.Color.fromBytes( 22,163, 74,230),
  B: Cesium.Color.fromBytes( 74,222,128,220),
  C: Cesium.Color.fromBytes(190,242, 60,210),
  D: Cesium.Color.fromBytes(250,204, 21,215),
  E: Cesium.Color.fromBytes(251,146, 60,220),
  F: Cesium.Color.fromBytes(239, 68, 68,225),
  G: Cesium.Color.fromBytes(153, 27, 27,230),
};
// Construction eras differ by country (TABULA periods in Sweden, English Housing
// Survey age bands in the UK), so derive the extrusion colours from the same
// PERIOD_CSS the legend uses rather than hardcoding a second copy here.
const PERIOD_COLORS = Object.fromEntries(
  Object.entries(PERIOD_CSS).map(([key, css]) => {
    const [r, g, b] = css.match(/\d+/g).map(Number);
    return [key, Cesium.Color.fromBytes(r, g, b, 220)];
  })
);

// ─────────────────────────────────────────────────────────────────
if (window.location.protocol === 'file:') {
  document.getElementById('loading').innerHTML =
    '<div style="text-align:center;padding:40px;max-width:440px">' +
    '<div style="font-size:48px;margin-bottom:16px">&#128274;</div>' +
    '<h1 style="color:#96D74C;font-size:18px;margin-bottom:12px">Run via local server</h1>' +
    '<p style="color:#94a3b8;font-size:13px;line-height:1.8">Cesium cannot load its 3D engine from <b>file://</b>.<br><br>' +
    'Open a terminal in the project folder and run:<br><br>' +
    '<code style="background:rgba(255,255,255,0.1);padding:8px 20px;border-radius:8px;font-size:14px">python launch.py</code><br><br>' +
    'Your browser will open automatically at<br><b style="color:#a78bfa">http://localhost:8765</b></p>' +
    '</div>';
  throw new Error('file:// not supported');
}

// ─────────────────────────────────────────────────────────────────
// Cesium ion token — get yours free at ion.cesium.com
// Required for Google Photorealistic 3D Tiles (real building textures)
// ─────────────────────────────────────────────────────────────────
let ION_TOKEN = localStorage.getItem('cesium_ion_token') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI4NmE0YWM4NS1hMjI0LTRiY2YtOGFkYS0yOGNiNTA2ZGM2MGIiLCJpZCI6NDI3NDMzLCJzdWIiOiJzYXJhYWJvIiwiaXNzIjoiaHR0cHM6Ly9pb24uY2VzaXVtLmNvbSIsImF1ZCI6IkJ1aWxkaW5ncyIsImlhdCI6MTc3Nzk4NDUwMn0.YfKFn0wvu95IcXJORmvmhTMAQ44-y8_qoajP_339Y4o';
if (ION_TOKEN) Cesium.Ion.defaultAccessToken = ION_TOKEN;

// Viewer with globe — CartoDB Light as default basemap
const viewer = new Cesium.Viewer('cesium-container', {
  timeline:false, animation:false, baseLayerPicker:false,
  geocoder:false, homeButton:false, sceneModePicker:false,
  navigationHelpButton:false, fullscreenButton:false,
  selectionIndicator:false, infoBox:false,
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
});
viewer.cesiumWidget.creditContainer.style.display = 'none';
viewer.scene.skyAtmosphere = new Cesium.SkyAtmosphere();

// Replace default imagery with CartoDB Positron (light/subtle — ideal for data overlays)
viewer.imageryLayers.removeAll();
viewer.imageryLayers.addImageryProvider(
  new Cesium.UrlTemplateImageryProvider({
    url: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    credit: '\u00a9 OpenStreetMap contributors \u00a9 CARTO',
  })
);

// ─────────────────────────────────────────────────────────────────
// Basemap switching — called by layers.js base-map radio buttons
// Options: 'light' | 'dark' | 'satellite' | 'photo'
// ─────────────────────────────────────────────────────────────────
let _currentBasemap = 'light';
window.setBasemap = function(type) {
  _currentBasemap = type;
  if (type === 'photo') {
    viewer.imageryLayers.removeAll();
    if (!tilesEnabled) {
      if (ION_TOKEN) loadGoogleTiles(ION_TOKEN);
      else document.getElementById('token-panel').style.display = 'block';
    }
  } else {
    if (tilesEnabled) {
      tilesEnabled = false;
      if (googleTileset) { viewer.scene.primitives.remove(googleTileset); googleTileset = null; }
      // Recalibrate rather than reset to 0 outright: if OSM Buildings is still
      // on (the UK default), it's still real-world-elevation ground truth even
      // with Google tiles gone, and blindly zeroing the offset here would
      // un-align our buildings from it again.
      refreshBuildingBaseOffsetFromTiles().then(() => { if (buildingDS) rebuildBuildings(); });
      document.getElementById('btn-tiles').classList.remove('active');
    }
    viewer.imageryLayers.removeAll();
    const tileUrls = {
      light:     'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      dark:      'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    };
    const credits = {
      light:     '\u00a9 OpenStreetMap contributors \u00a9 CARTO',
      dark:      '\u00a9 OpenStreetMap contributors \u00a9 CARTO',
      satellite: 'Esri, DigitalGlobe, GeoEye',
    };
    if (tileUrls[type]) {
      viewer.imageryLayers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({ url: tileUrls[type], credit: credits[type] })
      );
    }
  }
};

// Maps-style camera controls
// Scroll = zoom · Drag = pan · Right-drag / Ctrl+drag = tilt/rotate
const camCtrl = viewer.scene.screenSpaceCameraController;
camCtrl.zoomEventTypes        = [Cesium.CameraEventType.WHEEL, Cesium.CameraEventType.PINCH];
camCtrl.translateEventTypes   = Cesium.CameraEventType.LEFT_DRAG;
camCtrl.tiltEventTypes        = [
  Cesium.CameraEventType.RIGHT_DRAG,
  { eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.CTRL },
];
camCtrl.rotateEventTypes      = [
  Cesium.CameraEventType.RIGHT_DRAG,
  { eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.CTRL },
];
camCtrl.lookEventTypes        = [];
camCtrl.enableCollisionDetection = false;

// ─────────────────────────────────────────────────────────────────
// Google Photorealistic 3D Tiles — real facade + roof textures from Google Maps
// ─────────────────────────────────────────────────────────────────
let googleTileset = null;
let tilesEnabled  = false;
let eubuccoVisible = true;
let buildingBaseOffsetMeters = 0;
let groundOffsetGrid = null;
let calibrationInProgress = false;
let rebuildInProgress = false;
let rebuildPending = false;

window.getBuildingBaseOffset = function getBuildingBaseOffset(lon, lat) {
  if (groundOffsetGrid && Number.isFinite(lon) && Number.isFinite(lat)) {
    return sampleGroundOffsetGrid(lon, lat);
  }
  return buildingBaseOffsetMeters;
};

function resetGroundCalibration() {
  buildingBaseOffsetMeters = 0;
  groundOffsetGrid = null;
}

function sampleGroundOffsetGrid(lon, lat) {
  if (!groundOffsetGrid) return buildingBaseOffsetMeters;
  const g = groundOffsetGrid;

  const u = (lon - g.minLon) / g.lonStep;
  const v = (lat - g.minLat) / g.latStep;
  const uu = Math.min(g.cols - 1, Math.max(0, u));
  const vv = Math.min(g.rows - 1, Math.max(0, v));

  const c0 = Math.floor(uu), c1 = Math.min(g.cols - 1, c0 + 1);
  const r0 = Math.floor(vv), r1 = Math.min(g.rows - 1, r0 + 1);
  const tx = uu - c0, ty = vv - r0;

  const i00 = r0 * g.cols + c0;
  const i10 = r0 * g.cols + c1;
  const i01 = r1 * g.cols + c0;
  const i11 = r1 * g.cols + c1;

  const q00 = g.values[i00];
  const q10 = g.values[i10];
  const q01 = g.values[i01];
  const q11 = g.values[i11];

  const a = q00 * (1 - tx) + q10 * tx;
  const b = q01 * (1 - tx) + q11 * tx;
  return a * (1 - ty) + b * ty;
}

async function refreshBuildingBaseOffsetFromTiles() {
  if (calibrationInProgress) return;
  // Any loaded ground-truth massing (Google's photorealistic mesh, or Cesium OSM
  // Buildings) sits at real-world elevation, while our own extruded buildings are
  // drawn at raw ellipsoid height (0) unless calibrated against one of them. With
  // neither loaded there's nothing to align to - the flat ellipsoid is correct.
  const hasGroundTruth = (tilesEnabled && googleTileset) || osmEnabled;
  if (!hasGroundTruth) {
    resetGroundCalibration();
    return;
  }

  calibrationInProgress = true;
  try {
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (let i = 0; i < DATA.length; i++) {
      const ring = DATA[i].coordinates && DATA[i].coordinates[0];
      if (!ring) continue;
      for (let j = 0; j < ring.length; j++) {
        const lon = ring[j][0], lat = ring[j][1];
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }

    const pad = 0.001;
    minLon -= pad; maxLon += pad; minLat -= pad; maxLat += pad;

    const cols = 10;
    const rows = 8;
    const lonStep = (maxLon - minLon) / (cols - 1);
    const latStep = (maxLat - minLat) / (rows - 1);
    const points = [];
    const perNode = 3;
    const dLon = lonStep * 0.18;
    const dLat = latStep * 0.18;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lon = minLon + c * lonStep;
        const lat = minLat + r * latStep;
        points.push(Cesium.Cartesian3.fromDegrees(lon, lat, 0));
        points.push(Cesium.Cartesian3.fromDegrees(lon - dLon, lat, 0));
        points.push(Cesium.Cartesian3.fromDegrees(lon + dLon, lat, 0));
      }
    }

    // clampToHeightMostDetailed needs the tileset to have actually streamed in
    // geometry around these points to hit anything - on a fresh page load (or a
    // slow connection/GPU) the first attempt can time out simply because nothing
    // has rendered there yet. One timeout used to mean "give up forever, extrude
    // at raw ellipsoid height" - retry a few times with a short pause instead, so
    // buildings self-correct once the tileset catches up rather than staying
    // permanently misaligned with it.
    let clamped = null;
    let lastErr = null;
    for (let attempt = 1; attempt <= 3 && !clamped; attempt++) {
      try {
        clamped = await Promise.race([
          viewer.scene.clampToHeightMostDetailed(points),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Ground calibration timeout')), 12000)),
        ]);
      } catch (err) {
        lastErr = err;
        if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
      }
    }
    if (!clamped) throw lastErr || new Error('Ground calibration failed');

    const raw = clamped.map(p => {
      if (!p) return NaN;
      const carto = Cesium.Cartographic.fromCartesian(p);
      return carto && Number.isFinite(carto.height) ? Math.max(0, carto.height) : NaN;
    });

    const values = [];
    for (let i = 0; i < rows * cols; i++) {
      const chunk = raw.slice(i * perNode, i * perNode + perNode).filter(Number.isFinite);
      values.push(chunk.length ? Math.min.apply(null, chunk) : NaN);
    }

    const finite = values.filter(Number.isFinite);
    const avg = finite.length ? (finite.reduce((a, b) => a + b, 0) / finite.length) : 0;
    for (let i = 0; i < values.length; i++) {
      if (!Number.isFinite(values[i])) values[i] = avg;
    }

    groundOffsetGrid = { minLon, maxLon, minLat, maxLat, lonStep, latStep, cols, rows, values, avg };
    buildingBaseOffsetMeters = avg;
  } catch (err) {
    console.warn('Could not calibrate building base offset from 3D tiles:', err.message);
    resetGroundCalibration();
  } finally {
    calibrationInProgress = false;
  }
}

// skipAutoRebuild: the startup sequence below calibrates and builds explicitly,
// exactly once, in order. rebuildBuildings() always tears down and re-extrudes
// every building from scratch (no incremental update), so on a large dataset
// (Gothenburg's 93k buildings, ~90s per pass) letting this function's own
// auto-rebuild ALSO fire during startup doesn't just risk a race - the
// pending-rebuild safety net (see rebuildBuildings) turns that race into a
// second full ~90s pass every time. Interactive callers (the tiles toggle
// button, pasting a token) have no concurrent initial build to compete with,
// so they keep the automatic behavior.
async function loadGoogleTiles(token, { skipAutoRebuild = false } = {}) {
  try {
    setLoading('Loading Google Photorealistic 3D Tiles...');
    Cesium.Ion.defaultAccessToken = token;
    if (googleTileset) { viewer.scene.primitives.remove(googleTileset); googleTileset = null; }
    // Exactly as per https://cesium.com/learn/cesiumjs-learn/cesiumjs-photorealistic-3d-tiles/
    googleTileset = await Cesium.createGooglePhotorealistic3DTileset();
    viewer.scene.primitives.add(googleTileset);
    viewer.imageryLayers.removeAll(); // tiles render the ground - imagery not needed
    tilesEnabled = true;
    ION_TOKEN = token;
    document.getElementById('btn-tiles').classList.add('active');
    document.getElementById('token-panel').style.display = 'none';
    localStorage.setItem('cesium_ion_token', token);
    setLoading('');
    console.log('Google Photorealistic 3D Tiles loaded');

    if (!skipAutoRebuild) {
      // Run calibration in background so the viewer is interactive immediately.
      (async () => {
        await refreshBuildingBaseOffsetFromTiles();
        if (buildingDS) await rebuildBuildings();
      })();
    }
  } catch(err) {
    setLoading('');
    tilesEnabled = false;
    document.getElementById('btn-tiles').classList.remove('active');
    console.error('Google 3D Tiles failed:', err.message);
    // Always show token panel on failure
    const panel = document.getElementById('token-panel');
    panel.style.display = 'block';
    document.getElementById('token-error').textContent = 'Error: ' + err.message + ' - Paste a valid token from ion.cesium.com';
  }
}

// Token apply button
document.getElementById('token-apply').addEventListener('click', () => {
  const t = document.getElementById('token-input').value.trim();
  if (t) loadGoogleTiles(t);
});
document.getElementById('token-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('token-apply').click();
});

// Toggle tiles on/off (internal — also driven by setBasemap)
document.getElementById('btn-tiles').addEventListener('click', () => {
  if (!tilesEnabled) {
    if (ION_TOKEN) { loadGoogleTiles(ION_TOKEN); }
    else { document.getElementById('token-panel').style.display = 'block'; }
  } else {
    tilesEnabled = false;
    if (googleTileset) { viewer.scene.primitives.remove(googleTileset); googleTileset = null; }
    resetGroundCalibration();
    if (buildingDS) rebuildBuildings();
    document.getElementById('btn-tiles').classList.remove('active');
    // Restore previous basemap if photo was active
    if (_currentBasemap === 'photo') {
      _currentBasemap = 'light';
      viewer.imageryLayers.removeAll();
      viewer.imageryLayers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({
          url: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
          credit: '\u00a9 OpenStreetMap contributors \u00a9 CARTO',
        })
      );
      document.dispatchEvent(new CustomEvent('basemapReset'));
    }
  }
});

// Toggle EUBUCCO overlay
document.getElementById('btn-eubucco').addEventListener('click', () => {
  eubuccoVisible = !eubuccoVisible;
  document.getElementById('btn-eubucco').classList.toggle('active', eubuccoVisible);
  if (buildingDS) buildingDS.show = eubuccoVisible;
});

// ─────────────────────────────────────────────────────────────────
// Build extruded buildings — CustomDataSource (no Cesium workers needed)
// ─────────────────────────────────────────────────────────────────
let colorMode = 'use';
let buildingDS = null;

function getBuildingColor(b) {
  if (colorMode === 'eclass')
    return (b.eclass && ECLASS_COLORS[b.eclass]) ? ECLASS_COLORS[b.eclass] : Cesium.Color.fromBytes(60,60,70,140);
  if (colorMode === 'year')
    return (b.tabula_period && PERIOD_COLORS[b.tabula_period]) ? PERIOD_COLORS[b.tabula_period] : Cesium.Color.fromBytes(60,60,70,140);
  return USE_COLORS[b.use_cat] || USE_COLORS.ovrigt;
}

function ringCentroid(ring) {
  let lon = 0, lat = 0;
  for (let i = 0; i < ring.length; i++) {
    lon += ring[i][0];
    lat += ring[i][1];
  }
  const n = ring.length || 1;
  return { lon: lon / n, lat: lat / n };
}

async function rebuildBuildings() {
  // A rebuild requested while one is already running (e.g. ground calibration
  // finishing mid-build) must not be silently dropped - that left buildings
  // permanently stuck at the wrong height, floating below the real tiles/OSM
  // Buildings mesh. Queue it instead: exactly one follow-up rebuild runs once
  // the current one finishes, picking up the latest calibration.
  if (rebuildInProgress) { rebuildPending = true; return; }
  rebuildInProgress = true;
  rebuildPending = false;
  setLoading('Loading ' + DATA.length.toLocaleString() + ' buildings...');
  try {
    if (buildingDS) { viewer.dataSources.remove(buildingDS, true); buildingDS = null; }
    buildingDS = new Cesium.CustomDataSource('buildings');
    const CHUNK = 300;
    for (let start = 0; start < DATA.length; start += CHUNK) {
      const end = Math.min(start + CHUNK, DATA.length);
      for (let i = start; i < end; i++) {
        const b = DATA[i];
        const ring = b.coordinates[0];
        if (!ring || ring.length < 3) continue;
        const flat = [];
        for (const [lo, la] of ring) { flat.push(lo, la); }
        const h = Math.max(3, b.height || (b.floors ? b.floors * 3 : 6));
        const c = ringCentroid(ring);
        const baseH = window.getBuildingBaseOffset(c.lon, c.lat);
        const roofH = baseH + h;
        const col = getBuildingColor(b);

        // Roof cap — flat polygon on top
        const eRoof = buildingDS.entities.add({
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(flat)),
            height: roofH,
            material: col.brighten(0.15, new Cesium.Color()).withAlpha(0.95),
            outline: false,
          },
        });
        eRoof._dataIdx = i;

        // Facade walls — explicit vertical surfaces, clearly visible from any angle
        const wallPositions = Cesium.Cartesian3.fromDegreesArray(flat);
        const maxH = new Array(ring.length).fill(roofH);
        const minH = new Array(ring.length).fill(baseH);
        const eWall = buildingDS.entities.add({
          wall: {
            positions: wallPositions,
            maximumHeights: maxH,
            minimumHeights: minH,
            material: col.withAlpha(0.90),
            outline: true,
            outlineColor: col.darken(0.3, new Cesium.Color()).withAlpha(1.0),
          },
        });
        eWall._dataIdx = i;
      }
      setLoading('Loading buildings... ' + Math.round(end / DATA.length * 100) + '%');
      await new Promise(r => setTimeout(r, 0));
    }
    await viewer.dataSources.add(buildingDS);
    setLoading('');
  } finally {
    rebuildInProgress = false;
    if (rebuildPending) {
      rebuildPending = false;
      rebuildBuildings();
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Loading helper
// ─────────────────────────────────────────────────────────────────
function setLoading(msg) {
  const el = document.getElementById('loading');
  if (!msg) { el.style.display = 'none'; return; }
  const safeMsg = String(msg)
    .replace(/\u2026/g, '...')
    .replace(/â€¦/g, '...')
    .replace(/â€”|â€“/g, '-');
  document.getElementById('loading-status').textContent = safeMsg;
  el.style.display = 'flex';
}

// ─────────────────────────────────────────────────────────────────
// Cesium OSM Buildings — context massing for the wider city, independent of the
// analysis buildings. Useful in the UK, where the extruded EPC layer only covers
// the focus district and the surrounding blocks would otherwise be flat.
// ─────────────────────────────────────────────────────────────────
let osmBuildings = null;
let osmEnabled   = false;

// skipAutoRebuild: see loadGoogleTiles - the startup sequence calibrates and
// builds explicitly, exactly once, after this call returns.
async function toggleOsmBuildings(on, { skipAutoRebuild = false } = {}) {
  const btn = document.getElementById('btn-osm-buildings');
  if (on && !osmBuildings) {
    try {
      setLoading('Loading OSM Buildings...');
      osmBuildings = await Cesium.createOsmBuildingsAsync();
      viewer.scene.primitives.add(osmBuildings);
      setLoading('');
    } catch (err) {
      setLoading('');
      console.error('OSM Buildings failed:', err.message);
      if (btn) btn.classList.remove('active');
      return;
    }
  }
  osmEnabled = on;
  if (osmBuildings) osmBuildings.show = on;
  if (btn) btn.classList.toggle('active', on);

  if (!skipAutoRebuild) {
    // OSM Buildings sits at real-world elevation, same as Google's photorealistic
    // mesh - recalibrate against whichever ground-truth layer(s) are now active so
    // our own extruded buildings don't end up floating below/above it.
    await refreshBuildingBaseOffsetFromTiles();
    if (buildingDS) await rebuildBuildings();
  }
}
window.toggleOsmBuildings = toggleOsmBuildings;

const _osmBtn = document.getElementById('btn-osm-buildings');
if (_osmBtn) _osmBtn.addEventListener('click', () => toggleOsmBuildings(!osmEnabled));

// ─────────────────────────────────────────────────────────────────
// Fly to the active city + start building
// VIEW_CENTER is set by bootstrap.js from the profile + ?city=; MAP_CENTER is
// the build-time default and only used if the profile is missing.
// ─────────────────────────────────────────────────────────────────
const VIEW_AT = window.VIEW_CENTER || MAP_CENTER;
const VIEW_ALT = window.VIEW_HEIGHT || 800;

viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(VIEW_AT.lon, VIEW_AT.lat, VIEW_ALT),
  orientation: { heading:0, pitch: Cesium.Math.toRadians(-40), roll:0 },
  duration: 0,
});

// Start: if token already saved, load tiles immediately; always load buildings.
// The UK's analysis districts are small city fragments (a few square km) rather
// than the whole city, so OSM Buildings' plain grey massing is switched on by
// default there to give the surrounding city visual continuity; Sweden's
// dataset already covers most of Gothenburg and doesn't need it.
//
// Both loadGoogleTiles and toggleOsmBuildings normally recalibrate and rebuild
// on their own - suppressed here (skipAutoRebuild) because this sequence does
// exactly that itself, once, at the end. Without the flag both would race the
// explicit calibrate-then-build below, and since rebuildBuildings() always
// re-extrudes the entire dataset from scratch (no incremental update), that
// race used to cost a second full ~90s rebuild pass on Gothenburg's 93k
// buildings rather than a quick correction.
(async () => {
  if (ION_TOKEN) {
    document.getElementById('token-panel').style.display = 'none';
    await loadGoogleTiles(ION_TOKEN, { skipAutoRebuild: true });
  }
  if (window.VIEWER_COUNTRY && window.VIEWER_COUNTRY !== 'se') {
    await toggleOsmBuildings(true, { skipAutoRebuild: true });
  }
  // buildingDS is still null here, so calibrating first means the very first
  // build is already correctly aligned - no misaligned flash on first load.
  await refreshBuildingBaseOffsetFromTiles();
  await rebuildBuildings();
})();

// ─────────────────────────────────────────────────────────────────
// Ghost mode — WebGL post-process stage that converts the Cesium
// scene to white/grey.  Transit vehicles (trafik-canvas DOM element)
// are unaffected and remain fully colorful.
// No entity iteration → instant, no freeze.
// ─────────────────────────────────────────────────────────────────
let _ghostStage  = null;
let _ghostModeOn = false;

function _ensureGhostStage() {
  if (_ghostStage) return;
  _ghostStage = new Cesium.PostProcessStage({
    name: 'buildingGhost',
    fragmentShader: `
      uniform sampler2D colorTexture;
      in vec2 v_textureCoordinates;
      void main() {
        vec4 c = texture(colorTexture, v_textureCoordinates);
        // Convert to luminance then push strongly towards white
        float lum   = dot(c.rgb, vec3(0.299, 0.587, 0.114));
        float ghost = mix(lum, 1.0, 0.72);
        out_FragColor = vec4(ghost, ghost, ghost, c.a);
      }
    `,
  });
  _ghostStage.enabled = false;
  viewer.scene.postProcessStages.add(_ghostStage);
}

function setBuildingGhostMode(enabled) {
  _ghostModeOn = enabled;
  window._ghostModeOn = enabled;
  _ensureGhostStage();
  if (_ghostStage) _ghostStage.enabled = enabled;
}
window.setBuildingGhostMode = setBuildingGhostMode;

// ─────────────────────────────────────────────────────────────────
// Color mode toggle
// ─────────────────────────────────────────────────────────────────
function setColorMode(mode) {
  colorMode = mode;
  ['use','eclass','year'].forEach(m => {
    document.getElementById('btn-'+m).classList.toggle('active', m === mode);
  });
  updateLegend(mode);
  rebuildBuildings();
}
document.getElementById('btn-use').addEventListener('click',    () => setColorMode('use'));
document.getElementById('btn-eclass').addEventListener('click', () => setColorMode('eclass'));
document.getElementById('btn-year').addEventListener('click',   () => setColorMode('year'));

// Initialise legend for default mode
updateLegend('use');

// ─────────────────────────────────────────────────────────────────
// Reset view
// ─────────────────────────────────────────────────────────────────
document.getElementById('btn-reset').addEventListener('click', () => {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(VIEW_AT.lon, VIEW_AT.lat, VIEW_ALT),
    orientation: { heading:0, pitch: Cesium.Math.toRadians(-40), roll:0 },
    duration: 1.5,
  });
});
