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
// Cesium's default globe base colour is a bright blue that shows through wherever
// imagery/tiles haven't streamed yet - on first load that reads as "the app is
// broken", not "the map is still loading". Match the viewer's own dark chrome so
// any gap looks deliberate.
viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0d1117');

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
    _flatGroundMode = false;   // real Google-mesh elevation applies again
    window.setPhotoMode(true);
    viewer.imageryLayers.removeAll();
    if (!tilesEnabled) {
      if (ION_TOKEN) loadGoogleTiles(ION_TOKEN);
      else document.getElementById('token-panel').style.display = 'block';
    }
  } else {
    window.setPhotoMode(false);
    const wasPhoto = tilesEnabled;
    if (tilesEnabled) {
      tilesEnabled = false;
      if (googleTileset) { viewer.scene.primitives.remove(googleTileset); googleTileset = null; tilesGeometryReady = false; }
      document.getElementById('btn-tiles').classList.remove('active');
    }
    // Flat basemaps (light/dark/satellite/terrain) draw at ellipsoid height 0.
    // _flatGroundMode makes getBuildingBaseOffset return 0 (hard override), so the
    // buildings + trees + roofs sit ON the map and no background calibration can
    // re-float them. OSM Buildings (UK) stays real-elevation ground truth instead.
    const wasFlat = _flatGroundMode;
    // Flat imagery is at height 0, so everything sits on that plane. The grey OSM
    // mesh is georeferenced at real elevation and can't be flattened, so it's
    // hidden on flat basemaps (it would float) and only shown in photorealistic
    // view. Its toggle state is remembered and it reappears there.
    _flatGroundMode = true;
    if (osmBuildings) osmBuildings.show = false;
    if (wasPhoto || !wasFlat) {
      resetGroundCalibration();
      if (buildingPrimitives.length) rebuildBuildings();
      if (window.vegetationReground) window.vegetationReground();
      if (window.roofsRebuild) window.roofsRebuild();
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
    if (type === 'terrain') {
      _addTerrainImagery();
    } else if (tileUrls[type]) {
      viewer.imageryLayers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({ url: tileUrls[type], credit: credits[type] })
      );
    }
  }
};

// Drape the LiDAR shaded-relief terrain image over its WGS84 rectangle (a single
// georeferenced PNG built by tools/se/dtcc_terrain_water.py).
async function _addTerrainImagery() {
  try {
    const meta = await (await fetch('terrain_meta.json', { cache: 'default' })).json();
    const [w, s, e, n] = meta.rect;
    const prov = await Cesium.SingleTileImageryProvider.fromUrl('terrain_hillshade.png', {
      rectangle: Cesium.Rectangle.fromDegrees(w, s, e, n),
      credit: 'Terrain from Lantmäteriet LiDAR (DTCC)',
    });
    viewer.imageryLayers.addImageryProvider(prov);
  } catch (err) {
    console.warn('[terrain] load failed:', err && err.message);
  }
}

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
// Whether the tileset has actually rendered geometry (not merely been created) —
// ground calibration has nothing to clamp against until it has.
let tilesGeometryReady = false;
let eubuccoVisible = true;

// ── Photorealistic mode ──────────────────────────────────────────────────────
// On the photorealistic basemap the extruded EUBUCCO boxes are the wrong thing
// to look at: they hide the very facades you came to see, and they were also
// standing in front of the camera during a WWR capture, so the vision model was
// photographing a flat coloured box instead of the building.
//
// They were only ever on screen because they are the pickable thing — the Google
// mesh is one fused tileset with no per-building features or metadata. So in this
// mode we stop drawing them entirely and identify buildings geometrically
// instead: pickPosition gives the point under the cursor, and a footprint index
// turns that into a building.
//
// Not "draw them fully transparent": Cesium drops alpha-0 geometry from the pick
// pass (measured — 0.0 is unpickable, 0.004 is the first alpha that works), and a
// translucent pass over 93k invisible buildings measured ~47% more frame time
// than the opaque one. Hiding them costs nothing and picks just as well.
let photoMode = false;

function buildingsVisible() { return eubuccoVisible && !photoMode; }
function applyBuildingVisibility() {
  for (const p of buildingPrimitives) p.show = buildingsVisible();
}
window.isPhotoMode = () => photoMode;

window.setPhotoMode = function setPhotoMode(on) {
  if (photoMode === on) return;
  photoMode = on;
  applyBuildingVisibility();
  if (!on) { _pinnedIdx = null; setBuildingHighlight(null); }
  const hint = document.getElementById('photo-pick-hint');
  if (hint) hint.style.display = on ? 'block' : 'none';
  // The grey OSM Buildings mesh only sits correctly on the real Google ground, so
  // reveal it when entering photorealistic (if the user has it toggled on) and
  // hide it when leaving — that's what stops it floating over flat basemaps.
  if (osmBuildings) osmBuildings.show = on && osmEnabled;
  // Coloured building surfaces are invisible under Google's photorealistic mesh,
  // so hide the "Colour buildings by" control there — only useful on the flat
  // basemaps (light / dark / satellite / terrain).
  const colourGroup = document.getElementById('colour-by-group');
  if (colourGroup) colourGroup.style.display = on ? 'none' : 'block';
  // Trees & shrubs double up with Google's photorealistic mesh — auto-hide them
  // on photorealistic, restore the user's choice when leaving it.
  if (window.vegetationSetPhotoForced) window.vegetationSetPhotoForced(on);
};
let buildingBaseOffsetMeters = 0;
let groundOffsetGrid = null;
let calibrationInProgress = false;
let rebuildInProgress = false;
let rebuildPending = false;
// Flat basemaps (light/dark/satellite/terrain) draw at ellipsoid height 0. Force
// buildings + trees onto that plane there — a hard override so no stray/background
// calibration pass can re-float them to the Google-mesh real elevation. Only the
// photorealistic (and OSM-Buildings) basemaps carry real ground truth.
let _flatGroundMode = false;

window.getBuildingBaseOffset = function getBuildingBaseOffset(lon, lat) {
  if (_flatGroundMode) return 0;
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

// Resolves once the tileset has actually rendered some geometry (or the budget
// runs out). Used both to time the imagery hand-off and to give ground
// calibration a tileset worth sampling, instead of firing clampToHeightMostDetailed
// at an empty scene and eating a full timeout for it.
function waitForTilesetGeometry(tileset, budgetMs) {
  if (!tileset) return Promise.resolve(false);
  if (tileset.tilesLoaded) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => { if (settled) return; settled = true; clearTimeout(timer); resolve(ok); };
    const timer = setTimeout(() => finish(false), budgetMs);
    try {
      tileset.initialTilesLoaded.addEventListener(() => finish(true));
    } catch (_) {
      finish(false);
    }
  });
}

// attempts/timeoutMs are parameterised so startup can take one short, bounded
// shot at alignment (buildings on screen fast) while the slower retry budget
// moves to a background pass — see the startup sequence.
async function refreshBuildingBaseOffsetFromTiles({ attempts = 3, timeoutMs = 12000 } = {}) {
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
    for (let attempt = 1; attempt <= attempts && !clamped; attempt++) {
      try {
        clamped = await Promise.race([
          viewer.scene.clampToHeightMostDetailed(points),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Ground calibration timeout')), timeoutMs)),
        ]);
      } catch (err) {
        lastErr = err;
        if (attempt < attempts) await new Promise(r => setTimeout(r, 1500));
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
    if (googleTileset) { viewer.scene.primitives.remove(googleTileset); googleTileset = null; tilesGeometryReady = false; }
    // Exactly as per https://cesium.com/learn/cesiumjs-learn/cesiumjs-photorealistic-3d-tiles/
    googleTileset = await Cesium.createGooglePhotorealistic3DTileset();
    // Sharper mesh: default screen-space error is 16; lower = finer tiles pulled
    // in, at higher tile bandwidth + GPU. 4 ≈ maximum useful detail. Raise back
    // toward 12–16 if loading feels slow.
    googleTileset.maximumScreenSpaceError = 4;
    viewer.scene.primitives.add(googleTileset);
    // The tileset object resolves as soon as its root is fetched - actual ground
    // geometry is still streaming. Dropping the imagery here (as this used to do
    // unconditionally) therefore replaced a working basemap with bare globe for
    // however long the stream took. Hold the imagery until the first tiles have
    // rendered, and if they never do, keep it: a flat map beats an empty planet.
    tilesGeometryReady = await waitForTilesetGeometry(googleTileset, 6000);
    if (googleTileset && tilesGeometryReady) viewer.imageryLayers.removeAll();
    tilesEnabled = true;
    // Follow the tileset rather than only the basemap button — the startup
    // sequence calls this directly, so hooking setBasemap() alone left the very
    // first load in photorealistic view with the boxes still drawn.
    window.setPhotoMode(true);
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
        if (buildingPrimitives.length) await rebuildBuildings();
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
    window.setPhotoMode(false);
    if (googleTileset) { viewer.scene.primitives.remove(googleTileset); googleTileset = null; tilesGeometryReady = false; }
    resetGroundCalibration();
    if (buildingPrimitives.length) rebuildBuildings();
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
  applyBuildingVisibility();
});

// ─────────────────────────────────────────────────────────────────
// Build extruded buildings — batched Cesium.Primitives (memory-safe at
// city scale; tessellated in web workers, picked via per-instance id)
//
// Split across several primitives rather than one: a single primitive holding
// all ~93k buildings shows nothing at all until the last one has tessellated
// (a minute-plus of empty map on a cold/software-GL machine). In chunks the
// first buildings land within a couple of seconds and the rest fill in behind
// them, so the map is readable and interactive almost immediately. The cost is
// a handful of extra draw batches, which is not a measurable frame-rate change.
// ─────────────────────────────────────────────────────────────────
const BUILDING_CHUNK_SIZE = 12000;
let colorMode = 'use';
let buildingPrimitives = [];

function getBuildingColor(b) {
  if (colorMode === 'eclass')
    return (b.eclass && ECLASS_COLORS[b.eclass]) ? ECLASS_COLORS[b.eclass] : Cesium.Color.fromBytes(60,60,70,140);
  if (colorMode === 'year')
    return (b.tabula_period && PERIOD_COLORS[b.tabula_period]) ? PERIOD_COLORS[b.tabula_period] : Cesium.Color.fromBytes(60,60,70,140);
  return USE_COLORS[b.use_cat] || USE_COLORS.ovrigt;
}

// Chunks are drawn in the order this returns, so put what the camera is actually
// looking at first: the dataset's own order is arbitrary, which made the first
// chunk a scatter of buildings all over the city while the district on screen
// stayed empty. Ordering by distance from the camera fills the visible area
// almost immediately and leaves the far edges to stream in unnoticed.
function buildingDrawOrder() {
  const carto = viewer.camera.positionCartographic;
  const camLon = Cesium.Math.toDegrees(carto.longitude);
  const camLat = Cesium.Math.toDegrees(carto.latitude);
  // Longitude degrees shrink with latitude; without this correction the "nearest"
  // set is stretched east-west (~2x at Gothenburg's 57.7°N).
  const lonScale = Math.cos(Cesium.Math.toRadians(camLat));

  const order = new Array(DATA.length);
  const dist = new Float64Array(DATA.length);
  for (let i = 0; i < DATA.length; i++) {
    order[i] = i;
    // First vertex as a cheap stand-in for the centroid — this only decides
    // draw order, so ring-accurate positioning would be wasted work.
    const ring = DATA[i].coordinates && DATA[i].coordinates[0];
    if (!ring || !ring.length) { dist[i] = Infinity; continue; }
    const dx = (ring[0][0] - camLon) * lonScale;
    const dy = ring[0][1] - camLat;
    dist[i] = dx * dx + dy * dy;
  }
  order.sort((a, b) => dist[a] - dist[b]);
  return order;
}

// ── Footprint index — resolve a map position to a building ──────────────────
// Built once, lazily, the first time photorealistic picking needs it.
const FP_CELL_DEG = 0.002;            // ~220 m lat / ~120 m lon at this latitude
let _fpIndex = null;

function fpKey(lon, lat) {
  return Math.floor(lon / FP_CELL_DEG) + ':' + Math.floor(lat / FP_CELL_DEG);
}

function buildFootprintIndex() {
  _fpIndex = new Map();
  for (let i = 0; i < DATA.length; i++) {
    const ring = DATA[i].coordinates && DATA[i].coordinates[0];
    if (!ring || ring.length < 3) continue;
    // Index by bounding box so a footprint spanning several cells is findable
    // from any of them.
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lo, la] of ring) {
      if (lo < minLon) minLon = lo;
      if (lo > maxLon) maxLon = lo;
      if (la < minLat) minLat = la;
      if (la > maxLat) maxLat = la;
    }
    for (let x = Math.floor(minLon / FP_CELL_DEG); x <= Math.floor(maxLon / FP_CELL_DEG); x++) {
      for (let y = Math.floor(minLat / FP_CELL_DEG); y <= Math.floor(maxLat / FP_CELL_DEG); y++) {
        const k = x + ':' + y;
        let bucket = _fpIndex.get(k);
        if (!bucket) { bucket = []; _fpIndex.set(k, bucket); }
        bucket.push(i);
      }
    }
  }
}

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/** Building index at a lon/lat, or null. Exact containment first; if the point
 *  falls just outside every footprint — which happens when you pick high on a
 *  facade at an oblique angle — take the nearest footprint within a few metres
 *  rather than reporting nothing. */
function buildingIndexAtLonLat(lon, lat) {
  if (!_fpIndex) buildFootprintIndex();
  const cx = Math.floor(lon / FP_CELL_DEG), cy = Math.floor(lat / FP_CELL_DEG);
  let nearest = null, nearestD2 = Infinity;
  const NEAR_DEG = 0.00012;           // ~13 m — tolerance for the fallback
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const bucket = _fpIndex.get((cx + dx) + ':' + (cy + dy));
      if (!bucket) continue;
      for (const i of bucket) {
        const ring = DATA[i].coordinates[0];
        if (pointInRing(lon, lat, ring)) return i;
        for (const [lo, la] of ring) {
          const d2 = (lo - lon) * (lo - lon) + (la - lat) * (la - lat);
          if (d2 < nearestD2) { nearestD2 = d2; nearest = i; }
        }
      }
    }
  }
  return (nearestD2 < NEAR_DEG * NEAR_DEG) ? nearest : null;
}

/** Building index under a screen position, using the rendered surface (the
 *  photorealistic mesh, or the globe where it hasn't streamed). */
window.pickBuildingIndexAt = function pickBuildingIndexAt(windowPosition) {
  // 1) Pick pass against the hidden boxes. Cesium renders picking into its own
  //    framebuffer, separate from the frame you see, so flipping `show` around
  //    the call makes them pickable without ever drawing them. This returns the
  //    real instance id, so it is exact and — unlike reading back a depth value
  //    — independent of camera angle.
  if (buildingPrimitives.length) {
    for (const pr of buildingPrimitives) pr.show = true;
    try {
      const hits = viewer.scene.drillPick(windowPosition, 10);
      for (const h of hits) {
        if (h && h.id && h.id._dataIdx !== undefined) return h.id._dataIdx;
      }
    } finally {
      for (const pr of buildingPrimitives) pr.show = buildingsVisible();
    }
  }

  // 2) Fall back to the rendered surface + footprint lookup. Reliable looking
  //    straight down; at grazing angles the depth read-back loses precision, so
  //    it is the backstop rather than the primary path.
  if (!viewer.scene.pickPositionSupported) return null;
  const cart = viewer.scene.pickPosition(windowPosition);
  if (!Cesium.defined(cart)) return null;
  const c = Cesium.Cartographic.fromCartesian(cart);
  if (!c) return null;
  return buildingIndexAtLonLat(Cesium.Math.toDegrees(c.longitude), Cesium.Math.toDegrees(c.latitude));
};

// ── Highlight ───────────────────────────────────────────────────────────────
// With the boxes hidden there is nothing on screen to show which building the
// cursor is over, so paint just that one. A single instance — negligible cost.
let _highlightPrim = null;
let _highlightIdx  = null;

function setBuildingHighlight(idx, color) {
  if (idx === _highlightIdx) return;
  _highlightIdx = idx;
  if (_highlightPrim) { viewer.scene.primitives.remove(_highlightPrim); _highlightPrim = null; }
  if (idx == null || !DATA[idx]) return;

  const ring = DATA[idx].coordinates && DATA[idx].coordinates[0];
  if (!ring || ring.length < 3) return;
  const flat = [];
  for (const [lo, la] of ring) flat.push(lo, la);
  const b = DATA[idx];
  const h = Math.max(3, b.height || (b.floors ? b.floors * 3 : 6));
  const c = ringCentroid(ring);
  const baseH = window.getBuildingBaseOffset(c.lon, c.lat);

  _highlightPrim = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.PolygonGeometry({
        polygonHierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(flat)),
        height: baseH, extrudedHeight: baseH + h,
        vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(
        color || Cesium.Color.fromCssColorString('#a78bfa').withAlpha(0.42)) },
      id: { _dataIdx: idx },
    }),
    appearance: new Cesium.PerInstanceColorAppearance({ closed: true, translucent: true }),
    asynchronous: false,
  });
  viewer.scene.primitives.add(_highlightPrim);
}
window.setBuildingHighlight = setBuildingHighlight;
/** Hide/show the highlight without discarding it — used to keep it out of
 *  facade captures, which must photograph the building, not our overlay. */
window.setHighlightVisible = function (visible) {
  if (_highlightPrim) _highlightPrim.show = visible;
};

// Hover paints violet; a clicked building pins teal and hovering elsewhere no
// longer steals it, so "what is selected" stays legible while you move around.
// Kept deliberately faint: this sits ON the photorealistic facade, and anything
// heavier both obscures the building and tints the image the WWR vision model is
// asked to judge. (It is hidden outright during a capture — see
// setHighlightVisible below.)
const HL_HOVER  = Cesium.Color.fromCssColorString('#a78bfa').withAlpha(0.08);
const HL_SELECT = Cesium.Color.fromCssColorString('#4ECDC4').withAlpha(0.10);
let _pinnedIdx = null;

window.setSelectedBuilding = function (idx) {
  _pinnedIdx = idx;
  setBuildingHighlight(idx, HL_SELECT);
};
window.setHoverBuilding = function (idx) {
  if (_pinnedIdx != null) return;          // a selection outranks a hover
  setBuildingHighlight(idx, HL_HOVER);
};

function ringCentroid(ring) {
  let lon = 0, lat = 0;
  for (let i = 0; i < ring.length; i++) {
    lon += ring[i][0];
    lat += ring[i][1];
  }
  const n = ring.length || 1;
  return { lon: lon / n, lat: lat / n };
}

// Resolves when a primitive has finished tessellating (or the budget expires —
// never leave the overlay up forever on a stall).
function waitForPrimitive(primitive, budgetMs) {
  return new Promise((resolve) => {
    let waited = 0;
    const tick = () => {
      if (!primitive || primitive.isDestroyed() || primitive.ready || waited > budgetMs) { resolve(); return; }
      waited += 16;
      requestAnimationFrame(tick);
    };
    tick();
  });
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
  const total = DATA.length;
  // Hold the previous primitives on screen rather than removing them up front:
  // a rebuild (colour mode, re-alignment) would otherwise blank the whole city
  // and refill it chunk by chunk in front of the user. They're dropped as soon
  // as the first replacement chunk is ready, so the extra GPU memory is one
  // chunk's worth of overlap, not a second full copy. Declared outside the try so
  // the finally can still clean them up if the build throws.
  const stale = buildingPrimitives;
  buildingPrimitives = [];
  setLoading('Loading ' + total.toLocaleString() + ' buildings...');
  try {

    // One GeometryInstance per building — an extruded polygon (walls + roof +
    // floor as a single solid) — batched into a few Cesium.Primitives. This
    // draws ~93k buildings in a handful of GPU batches instead of ~186k Cesium
    // entities, which used to exhaust browser memory and crash the tab.
    const VF = Cesium.PerInstanceColorAppearance.VERTEX_FORMAT;
    const chunkCount = Math.max(1, Math.ceil(total / BUILDING_CHUNK_SIZE));
    const order = buildingDrawOrder();
    let firstChunkShown = false;

    for (let chunk = 0; chunk < chunkCount; chunk++) {
      const start = chunk * BUILDING_CHUNK_SIZE;
      const end = Math.min(total, start + BUILDING_CHUNK_SIZE);
      const instances = [];

      for (let n = start; n < end; n++) {
        const i = order[n];
        const b = DATA[i];
        const ring = b.coordinates && b.coordinates[0];
        if (!ring || ring.length < 3) continue;
        const flat = [];
        for (const [lo, la] of ring) { flat.push(lo, la); }
        const h = Math.max(3, b.height || (b.floors ? b.floors * 3 : 6));
        const c = ringCentroid(ring);
        const baseH = window.getBuildingBaseOffset(c.lon, c.lat);
        const col = getBuildingColor(b);
        instances.push(new Cesium.GeometryInstance({
          geometry: new Cesium.PolygonGeometry({
            polygonHierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(flat)),
            height: baseH,
            extrudedHeight: baseH + h,
            vertexFormat: VF,
          }),
          attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(col) },
          // Picked as h.id._dataIdx in ui.js — behaviour preserved.
          id: { _dataIdx: i },
        }));
        // Yield periodically so building the instance list never freezes the UI.
        if ((n & 4095) === 0) {
          // Only while the overlay is still up: once the first chunk is on
          // screen the map belongs to the user, and re-raising a loading screen
          // over it for every later chunk would be worse than the wait it
          // replaced.
          if (!firstChunkShown) {
            setLoading('Preparing ' + total.toLocaleString() + ' buildings... ' + Math.round(n / total * 100) + '%');
          }
          // eslint-disable-next-line no-await-in-loop
          await new Promise(r => setTimeout(r, 0));
        }
      }

      const primitive = new Cesium.Primitive({
        geometryInstances: instances,
        appearance: new Cesium.PerInstanceColorAppearance({ closed: true, translucent: false }),
        asynchronous: true,          // Cesium tessellates in web workers, off the main thread
        releaseGeometryInstances: true,
      });
      primitive.show = buildingsVisible();
      viewer.scene.primitives.add(primitive);
      buildingPrimitives.push(primitive);

      // Take the overlay down as soon as the first chunk is actually on screen —
      // the remaining chunks stream in behind a usable map rather than behind a
      // loading screen.
      if (!firstChunkShown) {
        setLoading('Rendering buildings...');
        // eslint-disable-next-line no-await-in-loop
        await waitForPrimitive(primitive, 20000);
        for (const p of stale) viewer.scene.primitives.remove(p);
        stale.length = 0;
        firstChunkShown = true;
        setLoading('');
      }
    }
  } finally {
    // Safety net: if the loop bailed before the swap (empty dataset, a throw),
    // the old primitives must still not be left in the scene alongside the new.
    for (const p of stale) viewer.scene.primitives.remove(p);
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
// Until the startup sequence has actually put buildings on screen, no optional
// stage is allowed to take the overlay down: loadGoogleTiles/toggleOsmBuildings
// both finish with setLoading('') long before the buildings exist, which used to
// uncover an empty globe for the whole calibrate+extrude stretch (~40s+). One
// latch here covers every caller, present and future, instead of each having to
// remember a flag.
let startupComplete = false;

function setLoading(msg) {
  const el = document.getElementById('loading');
  if (!msg) { if (startupComplete) el.style.display = 'none'; return; }
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
  // Only show the grey mesh in photorealistic view — on flat basemaps it floats
  // (real elevation vs height-0 imagery), so hide it there. The toggle stays
  // "on" so it reappears when you switch to Photorealistic 3D.
  if (osmBuildings) osmBuildings.show = on && photoMode;
  if (btn) btn.classList.toggle('active', on);

  // Recalibrate the extruded buildings against ground truth only when there IS
  // some (photorealistic). On flat basemaps everything stays flat, so no rebuild.
  if (!skipAutoRebuild && photoMode) {
    await refreshBuildingBaseOffsetFromTiles();
    if (buildingPrimitives.length) await rebuildBuildings();
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
// Pull the default city "first shot" back a bit for a wider establishing view;
// a bbox-focused entry (?bbox=) keeps its own tighter framing.
const VIEW_ALT = (window.VIEW_HEIGHT || 800) * (window.FOCUS_BBOX ? 1 : 1.7);

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
  // Each stage is isolated: the buildings are the point of this viewer, so
  // nothing optional above them is allowed to prevent them from rendering.
  try {
    if (ION_TOKEN) {
      document.getElementById('token-panel').style.display = 'none';
      await loadGoogleTiles(ION_TOKEN, { skipAutoRebuild: true });
    }
    if (window.VIEWER_COUNTRY && window.VIEWER_COUNTRY !== 'se') {
      await toggleOsmBuildings(true, { skipAutoRebuild: true });
    }
  } catch (err) {
    console.warn('Basemap / 3D tiles init failed - continuing without them:', err && err.message);
  }

  // Calibration only ALIGNS the extrusions to ground truth; it is not a
  // prerequisite for drawing them. It retries up to 3x12s and then THROWS
  // (tiles not streamed in yet, slow GPU, offline). That rejection used to
  // propagate out of this IIFE and skip rebuildBuildings() altogether, so a
  // slow tile stream left a blank map with no buildings at all.
  //
  // The full 3x12s retry budget also used to run BEFORE the first build, so a
  // machine where clamping times out (software GL, cold tile cache, offline)
  // stared at an empty globe for ~40s before extrusion even started. Take one
  // short shot here - by now waitForTilesetGeometry has given the clamp real
  // geometry to hit, so it usually lands - and move the patient retrying to a
  // background pass that only pays for a re-extrude if it actually changes the
  // alignment.
  // With no ground truth actually on screen yet, that one shot is guaranteed to
  // burn its whole timeout and return nothing — skip straight to the buildings
  // and let the background pass align them if the tiles ever turn up.
  const worthCalibratingNow = tilesGeometryReady || osmEnabled;
  if (worthCalibratingNow) {
    try {
      setLoading('Aligning buildings to ground...');
      await refreshBuildingBaseOffsetFromTiles({ attempts: 1, timeoutMs: 6000 });
    } catch (err) {
      console.warn('Ground calibration failed - extruding at ellipsoid height:', err && err.message);
    }
  }

  const calibratedOnFirstTry = groundOffsetGrid != null;

  try {
    startupComplete = true;   // rebuildBuildings' own setLoading('') may now clear the overlay
    await rebuildBuildings();
  } catch (err) {
    console.error('Building render failed:', err);
    startupComplete = true;
    setLoading('');
  }

  // Buildings are on screen and interactive from here on; anything below is a
  // silent correction pass.
  if (!calibratedOnFirstTry) {
    (async () => {
      const before = buildingBaseOffsetMeters;
      try {
        // Give the tiles a generous window to actually stream in first —
        // clamping against a tileset that hasn't rendered anything just burns
        // the retry budget on guaranteed timeouts, which is exactly how the old
        // sequence used to spend 40s and still come back empty-handed.
        if (googleTileset && !tilesGeometryReady) {
          tilesGeometryReady = await waitForTilesetGeometry(googleTileset, 30000);
        }
        await refreshBuildingBaseOffsetFromTiles({ attempts: 2, timeoutMs: 12000 });
      } catch (err) {
        console.warn('Background ground calibration failed:', err && err.message);
        return;
      }
      // Only worth a full re-extrude if the answer actually moved the buildings.
      if (groundOffsetGrid && Math.abs(buildingBaseOffsetMeters - before) > 0.5) {
        console.log('Ground calibration landed on retry - realigning buildings');
        await rebuildBuildings();
      }
    })();
  }
})();

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

// ─────────────────────────────────────────────────────────────────
// Fly straight down (nadir) over whatever is at screen centre. Exposed globally
// so the plan-view analytical overlays (statistics, green index, heat-island,
// green accessibility) can auto-orient the camera top-down when activated — they
// read as maps, not 3D scenes. Independent of the nav-button UI so it also works
// in the UK viewer.
window.viewTopDown = function viewTopDown() {
  if (typeof viewer === 'undefined' || !viewer) return;
  const c = window.VIEW_CENTER || (typeof MAP_CENTER !== 'undefined' ? MAP_CENTER : { lat: 57.70, lon: 11.96 });
  // Straight down AND zoomed out to frame the whole city, so city-wide analytical
  // overlays (green index, statistics, space syntax…) read at a glance.
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(c.lon, c.lat, 20000),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
    duration: 1.0,
  });
};

// Translucent classified overlays (the SCB grids) render BLACK on the Google
// Photorealistic 3D basemap — classification onto the mesh drops the alpha. When
// such a layer activates, drop to a flat basemap (Satellite) so it renders
// correctly. No-op if already on a flat basemap. Returns true if it switched.
window.ensureFlatBasemap = function ensureFlatBasemap() {
  const photo = document.getElementById('btn-base-photo');
  if (!photo || !photo.classList.contains('active')) return false;
  const sat = document.getElementById('btn-base-satellite');
  if (sat) { sat.click(); return true; }
  return false;
};

// Map navigation — compass (click to point north) + top-down view
// ─────────────────────────────────────────────────────────────────
(function initMapNav() {
  const rose = document.getElementById('compass-rose');
  const btnNorth = document.getElementById('btn-north');
  const btnTop = document.getElementById('btn-topview');
  if (!rose || !btnNorth || !btnTop) return;

  // Ground point at screen centre (what the camera looks at) so rotations orbit
  // the view centre rather than the camera position.
  function centerPoint() {
    const canvas = viewer.scene.canvas;
    const px = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
    const ell = (viewer.scene.globe && viewer.scene.globe.ellipsoid) || Cesium.Ellipsoid.WGS84;
    return viewer.camera.pickEllipsoid(px, ell) || viewer.camera.positionWC;
  }
  function flyAround(heading, pitch) {
    const c = centerPoint();
    const range = Math.max(50, Cesium.Cartesian3.distance(viewer.camera.positionWC, c));
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(c, 0), {
      offset: new Cesium.HeadingPitchRange(heading, pitch, range),
      duration: 0.8,
    });
  }
  btnNorth.addEventListener('click', () => flyAround(0, viewer.camera.pitch));
  btnTop.addEventListener('click', () => flyAround(0, Cesium.Math.toRadians(-90)));

  // Keep the compass rose pointing to true north, and light up the top-view
  // button when the camera is (nearly) straight down.
  function syncNav() {
    rose.setAttribute('transform', 'rotate(' + (-Cesium.Math.toDegrees(viewer.camera.heading)) + ' 20 20)');
    btnTop.classList.toggle('active', Cesium.Math.toDegrees(viewer.camera.pitch) < -80);
  }
  viewer.camera.percentageChanged = 0.01;
  viewer.camera.changed.addEventListener(syncNav);
  viewer.scene.postRender.addEventListener(syncNav);   // smooth during fly/rotate
  syncNav();
})();
