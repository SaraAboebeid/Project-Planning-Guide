// =============================================================
// cesium.js — Viewer init, Google tiles, EUBUCCO overlay,
//             color modes, startup sequence
// Depends on: legend.js (updateLegend), DATA (injected)
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
const PERIOD_COLORS = {
  '...1960':     Cesium.Color.fromBytes(100,149,237,220),
  '1961-1975':   Cesium.Color.fromBytes(255,165, 50,220),
  '1976-1985':   Cesium.Color.fromBytes(154,205, 50,220),
  '1986-1995':   Cesium.Color.fromBytes(218,165, 32,220),
  '1996-2005':   Cesium.Color.fromBytes(255, 99, 71,220),
  'post-2005':   Cesium.Color.fromBytes(147,112,219,220),
};

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

// Viewer: globe:false per Cesium guide — photorealistic tiles replace the globe entirely
const viewer = new Cesium.Viewer('cesium-container', {
  timeline:false, animation:false, baseLayerPicker:false,
  geocoder:false, homeButton:false, sceneModePicker:false,
  navigationHelpButton:false, fullscreenButton:false,
  selectionIndicator:false, infoBox:false,
  globe: false,
});
viewer.cesiumWidget.creditContainer.style.display = 'none';
// Fix black sky — enable atmosphere and sky box
viewer.scene.skyAtmosphere = new Cesium.SkyAtmosphere();
viewer.scene.skyBox = new Cesium.SkyBox({
  sources: {
    positiveX: 'https://cdn.jsdelivr.net/npm/cesium@1.124.0/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_px.jpg',
    negativeX: 'https://cdn.jsdelivr.net/npm/cesium@1.124.0/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_mx.jpg',
    positiveY: 'https://cdn.jsdelivr.net/npm/cesium@1.124.0/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_py.jpg',
    negativeY: 'https://cdn.jsdelivr.net/npm/cesium@1.124.0/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_my.jpg',
    positiveZ: 'https://cdn.jsdelivr.net/npm/cesium@1.124.0/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_pz.jpg',
    negativeZ: 'https://cdn.jsdelivr.net/npm/cesium@1.124.0/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_80_mz.jpg',
  }
});
viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#87CEEB');  // sky blue fallback

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

async function loadGoogleTiles(token) {
  try {
    setLoading('Loading Google Photorealistic 3D Tiles…');
    Cesium.Ion.defaultAccessToken = token;
    if (googleTileset) { viewer.scene.primitives.remove(googleTileset); googleTileset = null; }
    // Exactly as per https://cesium.com/learn/cesiumjs-learn/cesiumjs-photorealistic-3d-tiles/
    googleTileset = await Cesium.createGooglePhotorealistic3DTileset();
    viewer.scene.primitives.add(googleTileset);
    tilesEnabled = true;
    ION_TOKEN = token;
    document.getElementById('btn-tiles').classList.add('active');
    document.getElementById('token-panel').style.display = 'none';
    localStorage.setItem('cesium_ion_token', token);
    setLoading('');
    console.log('✅ Google Photorealistic 3D Tiles loaded');
  } catch(err) {
    setLoading('');
    tilesEnabled = false;
    document.getElementById('btn-tiles').classList.remove('active');
    console.error('❌ Google 3D Tiles failed:', err.message);
    // Always show token panel on failure
    const panel = document.getElementById('token-panel');
    panel.style.display = 'block';
    document.getElementById('token-error').textContent = 'Error: ' + err.message + ' — Paste a valid token from ion.cesium.com';
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

// Toggle tiles on/off
document.getElementById('btn-tiles').addEventListener('click', () => {
  if (!tilesEnabled) {
    if (ION_TOKEN) { loadGoogleTiles(ION_TOKEN); }
    else { document.getElementById('token-panel').style.display = 'block'; }
  } else {
    tilesEnabled = false;
    if (googleTileset) { viewer.scene.primitives.remove(googleTileset); googleTileset = null; }
    document.getElementById('btn-tiles').classList.remove('active');
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

async function rebuildBuildings() {
  setLoading('Loading ' + DATA.length.toLocaleString() + ' buildings…');
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
      const col = getBuildingColor(b);

      // Roof cap — flat polygon on top
      const eRoof = buildingDS.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(flat)),
          height: h,
          material: col.brighten(0.15, new Cesium.Color()).withAlpha(0.95),
          outline: false,
        },
      });
      eRoof._dataIdx = i;

      // Facade walls — explicit vertical surfaces, clearly visible from any angle
      const wallPositions = Cesium.Cartesian3.fromDegreesArray(flat);
      const maxH = new Array(ring.length).fill(h);
      const minH = new Array(ring.length).fill(0);
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
    setLoading('Loading buildings… ' + Math.round(end / DATA.length * 100) + '%');
    await new Promise(r => setTimeout(r, 0));
  }
  await viewer.dataSources.add(buildingDS);
  setLoading('');
}

// ─────────────────────────────────────────────────────────────────
// Loading helper
// ─────────────────────────────────────────────────────────────────
function setLoading(msg) {
  const el = document.getElementById('loading');
  if (!msg) { el.style.display = 'none'; return; }
  document.getElementById('loading-status').textContent = msg;
  el.style.display = 'flex';
}

// ─────────────────────────────────────────────────────────────────
// Fly to Gothenburg + start building
// ─────────────────────────────────────────────────────────────────
viewer.camera.flyTo({
  destination: Cesium.Cartesian3.fromDegrees(MAP_CENTER.lon, MAP_CENTER.lat, 800),
  orientation: { heading:0, pitch: Cesium.Math.toRadians(-40), roll:0 },
  duration: 0,
});

// Start: if token already saved, load tiles immediately; always load buildings
(async () => {
  if (ION_TOKEN) {
    document.getElementById('token-panel').style.display = 'none';
    await loadGoogleTiles(ION_TOKEN);
  }
  await rebuildBuildings();
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
    destination: Cesium.Cartesian3.fromDegrees(MAP_CENTER.lon, MAP_CENTER.lat, 800),
    orientation: { heading:0, pitch: Cesium.Math.toRadians(-40), roll:0 },
    duration: 1.5,
  });
});
