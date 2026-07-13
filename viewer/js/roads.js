// ─────────────────────────────────────────────────────────────────────────────
// roads.js  —  OSM road-network layer for the Gothenburg 3D viewer
//
//  Called by layers.js when the Street Layer is toggled on/off.
//  Fetches the GeoJSON from /api/osm/roads and renders polylines in Cesium.
// ─────────────────────────────────────────────────────────────────────────────

const ROADS_API = 'http://localhost:8000/api/osm/roads';

// Per-class visual styling
const ROAD_STYLE = {
  major:      { color: Cesium.Color.fromCssColorString('#f97316'), width: 3.5 }, // orange
  primary:    { color: Cesium.Color.fromCssColorString('#facc15'), width: 2.8 }, // yellow
  secondary:  { color: Cesium.Color.fromCssColorString('#a78bfa'), width: 2.2 }, // purple
  local:      { color: Cesium.Color.fromCssColorString('#cbd5e1'), width: 1.6 }, // light
  service:    { color: Cesium.Color.fromCssColorString('#94a3b8'), width: 1.2 }, // muted
  pedestrian: { color: Cesium.Color.fromCssColorString('#6ee7b7'), width: 1.0 }, // teal
  cycling:    { color: Cesium.Color.fromCssColorString('#34d399'), width: 1.2 }, // green
};
function _roadStyle(cls) { return ROAD_STYLE[cls] || ROAD_STYLE.local; }

let _roadEntities  = [];
let _roadsLoaded   = false;
let _roadsVisible  = false;

// ── Public API ────────────────────────────────────────────────────────────────

async function roadsShow() {
  if (_roadsLoaded) {
    _roadEntities.forEach(e => e.show = true);
    _roadsVisible = true;
    return;
  }
  await _roadsFetch();
}

function roadsHide() {
  _roadEntities.forEach(e => e.show = false);
  _roadsVisible = false;
}

function roadsIsVisible() { return _roadsVisible; }

// ── Internal ──────────────────────────────────────────────────────────────────

async function _roadsFetch() {
  // Use current camera view bbox (clamped to Gothenburg metro area)
  const cam = viewer.camera;
  const rect = cam.computeViewRectangle(viewer.scene.globe.ellipsoid, new Cesium.Rectangle());
  let south, north, west, east;
  if (rect) {
    south = Math.max(Cesium.Math.toDegrees(rect.south), 57.55);
    north = Math.min(Cesium.Math.toDegrees(rect.north), 57.90);
    west  = Math.max(Cesium.Math.toDegrees(rect.west),  11.70);
    east  = Math.min(Cesium.Math.toDegrees(rect.east),  12.20);
  } else {
    south = 57.68; north = 57.74; west = 11.93; east = 12.00;
  }

  try {
    const url = `${ROADS_API}?south=${south.toFixed(4)}&north=${north.toFixed(4)}&west=${west.toFixed(4)}&east=${east.toFixed(4)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const geojson = await r.json();
    _roadsRender(geojson);
  } catch (err) {
    console.error('[roads] fetch error', err);
  }
}

function _roadsRender(geojson) {
  // Remove any previously rendered roads
  _roadEntities.forEach(e => viewer.entities.remove(e));
  _roadEntities = [];

  for (const feat of (geojson.features || [])) {
    if (feat.geometry.type !== 'LineString') continue;
    const coords = feat.geometry.coordinates; // [[lon,lat], ...]
    if (coords.length < 2) continue;

    const cls   = feat.properties.road_class || 'local';
    const style = _roadStyle(cls);

    // Skip very minor pedestrian paths to reduce clutter
    if (cls === 'pedestrian' || cls === 'cycling') {
      // Only render if zoomed in (altitude < 1500m).
      // Guard null camera cartographic state to avoid render-loop crashes.
      const carto = viewer?.camera?.positionCartographic;
      const alt = carto && Number.isFinite(carto.height) ? carto.height : Number.POSITIVE_INFINITY;
      if (alt > 1500) continue;
    }

    const positions = Cesium.Cartesian3.fromDegreesArray(coords.flat());
    const entity = viewer.entities.add({
      polyline: {
        positions:           positions,
        width:               style.width,
        material:            new Cesium.PolylineOutlineMaterialProperty({
          color:        style.color.withAlpha(0.85),
          outlineColor: Cesium.Color.BLACK.withAlpha(0.4),
          outlineWidth: cls === 'major' ? 1.5 : 0.8,
        }),
        clampToGround:       true,
        classificationType:  Cesium.ClassificationType.TERRAIN,
      },
      properties: {
        type:     'road',
        highway:  feat.properties.highway,
        name:     feat.properties.name,
        maxspeed: feat.properties.maxspeed,
      },
    });
    _roadEntities.push(entity);
  }

  _roadsLoaded  = true;
  _roadsVisible = true;
  console.log(`[roads] rendered ${_roadEntities.length} road segments`);
}
