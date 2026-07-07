// >>> URBAN_ANALYSIS_BEGIN >>>
// Urban Analysis overlay module — Green Index, Heat Island Proxy, Green Accessibility
// Adds three city-wide analysis layers to the Gothenburg 3D viewer.
// Depends on: global `viewer` (Cesium.Viewer), global `DATA` (92k buildings).
(function () {
  'use strict';

  const UA_API = 'http://localhost:8000';

  // ─── Per-layer state ─────────────────────────────────────────────────────
  const LAYERS = {
    green:  { ds: null, active: false, btnId: 'btn-urban-green',  label: 'Green Index' },
    uhi:    { ds: null, active: false, btnId: 'btn-urban-uhi',    label: 'Heat Island Proxy' },
    access: { ds: null, active: false, btnId: 'btn-urban-access', label: 'Green Accessibility' },
  };

  // Shared cached OSM data
  let _greenAreas  = null;  // [{centroid_lon, centroid_lat, name, green_type, coords}]
  let _streets     = null;  // [{midLon, midLat, coords, road_class}]
  let _loading     = false;

  // ─── UI helpers ──────────────────────────────────────────────────────────
  function $id(id) { return document.getElementById(id); }

  function setStatus(msg) {
    const el = $id('urban-status');
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  }

  function setLegend(html) {
    const el = $id('urban-legend');
    if (!el) return;
    el.innerHTML = html;
    el.style.display = html ? 'block' : 'none';
  }

  function updateBtn(key) {
    const btn = $id(LAYERS[key].btnId);
    if (!btn) return;
    const check = btn.querySelector('.overlay-check');
    if (LAYERS[key].active) {
      btn.classList.add('active');
      if (check) check.style.background = '#5B21B6';
    } else {
      btn.classList.remove('active');
      if (check) check.style.background = '';
    }
  }

  // ─── Geometry math ───────────────────────────────────────────────────────
  // Returns approximate distance in metres between two lon/lat points
  function distM(lon1, lat1, lon2, lat2) {
    const R = 111320;
    const dlat = (lat2 - lat1) * R;
    const dlon = (lon2 - lon1) * R * 0.536; // cos(57.7°) ≈ 0.536
    return Math.sqrt(dlat * dlat + dlon * dlon);
  }

  // Returns nearest green-area centroid and its distance in metres
  function nearestGreen(lon, lat) {
    let best = Infinity, bestG = null;
    for (const g of _greenAreas) {
      const d = distM(lon, lat, g.centroid_lon, g.centroid_lat);
      if (d < best) { best = d; bestG = g; }
    }
    return { dist: best, green: bestG };
  }

  // ─── Data fetchers ───────────────────────────────────────────────────────
  async function fetchGreenAreas() {
    if (_greenAreas) return _greenAreas;
    const r = await fetch(`${UA_API}/api/urban/green-areas`);
    if (!r.ok) throw new Error(`Green-areas fetch failed: ${r.status}`);
    const j = await r.json();
    _greenAreas = (j.features || [])
      .map(f => ({
        centroid_lon: f.properties.centroid_lon,
        centroid_lat: f.properties.centroid_lat,
        name: f.properties.name,
        green_type: f.properties.green_type,
        coords: f.geometry.coordinates[0],
      }))
      .filter(g => g.centroid_lon && g.centroid_lat);
    return _greenAreas;
  }

  async function fetchStreets() {
    if (_streets) return _streets;
    const r = await fetch(`${UA_API}/api/urban/streets`);
    if (!r.ok) throw new Error(`Streets fetch failed: ${r.status}`);
    const j = await r.json();
    _streets = (j.features || []).map(f => ({
      coords: f.geometry.coordinates,
      midLon: f.properties.mid_lon,
      midLat: f.properties.mid_lat,
      road_class: f.properties.road_class,
    }));
    return _streets;
  }

  // ─── DataSource helpers ───────────────────────────────────────────────────
  function removeLayer(key) {
    const layer = LAYERS[key];
    if (layer.ds) {
      viewer.dataSources.remove(layer.ds, true);
      layer.ds = null;
    }
    // Also remove any primitives stored on the layer
    if (layer.primCollection) {
      viewer.scene.primitives.remove(layer.primCollection);
      layer.primCollection = null;
    }
  }

  // ─── LAYER 1: GREEN INDEX ────────────────────────────────────────────────
  // Scores each road segment 0–1 based on proximity to green areas.
  // Colour: green (score=1, near parks) → red (score=0, no green nearby).
  async function buildGreenIndex() {
    setStatus('Fetching road network & green areas…');
    const [streets, greens] = await Promise.all([fetchStreets(), fetchGreenAreas()]);

    setStatus(`Computing Green Index for ${streets.length} road segments…`);

    const D_m = 200; // distance-decay constant: 200 m half-life

    // PolylineCollection for performance
    const col = new Cesium.PolylineCollection();
    viewer.scene.primitives.add(col);

    for (const seg of streets) {
      if (!seg.coords || seg.coords.length < 2) continue;

      const { dist } = nearestGreen(seg.midLon, seg.midLat);
      const score = Math.exp(-dist / D_m); // 1 = near green, 0 = far

      // HSL: 120° green → 0° red
      const h = score * 120 / 360;
      const color = Cesium.Color.fromHsl(h, 0.88, 0.42, 0.85);

      const positions = seg.coords.map(c =>
        Cesium.Cartesian3.fromDegrees(c[0], c[1], 3)
      );
      col.add({
        positions,
        width: seg.road_class === 'primary' ? 3.5 : 2.0,
        material: Cesium.Material.fromType('Color', { color }),
      });
    }

    LAYERS.green.primCollection = col;

    setLegend(`
      <div style="font-weight:600;margin-bottom:4px">Street Green Index</div>
      <div style="display:flex;gap:6px;align-items:center;font-size:10px">
        <span style="width:28px;height:5px;background:linear-gradient(to right,#e4391b,#f59e0b,#16a34a);border-radius:2px;display:inline-block"></span>
        <span style="color:var(--muted)">Far from green → Close to green</span>
      </div>
      <div style="color:var(--faint);font-size:9px;margin-top:3px">${greens.length} green areas · ${streets.length} segments · decay D=200 m</div>`);
    setStatus('');
  }

  // ─── LAYER 2: URBAN HEAT ISLAND PROXY ────────────────────────────────────
  // Grid-based proxy from EUBUCCO buildings (energy class + age + use type).
  // Cooled by proximity to OSM green areas.
  async function buildUHI() {
    setStatus('Computing Urban Heat Island proxy…');

    // Grid parameters (Gothenburg bbox)
    const LAT0 = 57.60, LAT1 = 57.83;
    const LON0 = 11.79, LON1 = 12.15;
    const dLat = 0.006; // ~667 m per cell
    const dLon = 0.011; // ~655 m per cell

    const nLat = Math.ceil((LAT1 - LAT0) / dLat);
    const nLon = Math.ceil((LON1 - LON0) / dLon);

    // Energy class → heat score (A=best, G=worst)
    const ECLASS = { A: 0.05, B: 0.18, C: 0.32, D: 0.50, E: 0.65, F: 0.80, G: 1.0 };
    // Construction year → insulation score
    function ageScore(yr) {
      if (!yr) return 0.55;
      if (yr >= 2005) return 0.12;
      if (yr >= 2000) return 0.20;
      if (yr >= 1990) return 0.30;
      if (yr >= 1980) return 0.40;
      if (yr >= 1970) return 0.55;
      if (yr >= 1960) return 0.65;
      if (yr >= 1950) return 0.75;
      return 0.85;
    }
    // Use category → activity heat
    const USE_SCORE = {
      industri:          1.0,
      verksamhet:        0.70,
      samhalle:          0.60,
      bostad_flerfamilj: 0.48,
      bostad_enfamilj:   0.38,
      komplement:        0.25,
      ovrigt:            0.45,
    };

    // Accumulate per grid cell
    const cells = {}; // key: iLat+'_'+iLon → {sum, count, cx, cy}

    if (typeof DATA === 'undefined') {
      setStatus('Building data not available.'); return;
    }

    for (const b of DATA) {
      if (!b.coordinates || !b.coordinates[0]) continue;
      // Centroid from polygon ring
      const ring = b.coordinates[0];
      let clon = 0, clat = 0;
      for (const pt of ring) { clon += pt[0]; clat += pt[1]; }
      clon /= ring.length; clat /= ring.length;

      if (clon < LON0 || clon > LON1 || clat < LAT0 || clat > LAT1) continue;

      const iLat = Math.floor((clat - LAT0) / dLat);
      const iLon = Math.floor((clon - LON0) / dLon);
      const k = iLat + '_' + iLon;

      const es = ECLASS[b.eclass] !== undefined ? ECLASS[b.eclass] : 0.55;
      const as = ageScore(b.year);
      const us = USE_SCORE[b.use_cat] || 0.45;
      const raw = es * 0.50 + as * 0.30 + us * 0.20;

      if (!cells[k]) {
        cells[k] = {
          sum: 0, count: 0,
          cx: LON0 + (iLon + 0.5) * dLon,
          cy: LAT0 + (iLat + 0.5) * dLat,
          iLat, iLon,
        };
      }
      cells[k].sum += raw;
      cells[k].count++;
    }

    // Fetch green areas for cooling
    setStatus('Fetching green areas for cooling factor…');
    await fetchGreenAreas();

    const ds = new Cesium.CustomDataSource('urban-uhi');
    await viewer.dataSources.add(ds);
    LAYERS.uhi.ds = ds;

    for (const k of Object.keys(cells)) {
      const cell = cells[k];
      if (cell.count === 0) continue;

      let score = cell.sum / cell.count;

      // Green cooling: reduce UHI score near parks
      const { dist } = nearestGreen(cell.cx, cell.cy);
      const cooling = Math.exp(-dist / 300) * 0.35;
      score = Math.max(0, score * (1 - cooling));

      // Color: 0 cool (blue) → 0.5 warm (amber) → 1 hot (red)
      let color;
      if (score < 0.5) {
        const t = score * 2;
        color = new Cesium.Color(
          0.23 + t * (0.97 - 0.23),
          0.51 + t * (0.62 - 0.51),
          0.96 + t * (0.04 - 0.96),
          0.45 + t * 0.1
        );
      } else {
        const t = (score - 0.5) * 2;
        color = new Cesium.Color(
          0.97,
          0.62 + t * (0.18 - 0.62),
          0.04 * (1 - t),
          0.55 + t * 0.15
        );
      }

      const minLon = LON0 + cell.iLon * dLon;
      const minLat = LAT0 + cell.iLat * dLat;

      ds.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(
            Cesium.Cartesian3.fromDegreesArray([
              minLon,       minLat,
              minLon+dLon,  minLat,
              minLon+dLon,  minLat+dLat,
              minLon,       minLat+dLat,
            ])
          ),
          material:       color,
          outline:        false,
          height:         0,
          extrudedHeight: 0,
        },
      });
    }

    setLegend(`
      <div style="font-weight:600;margin-bottom:4px">Heat Island Proxy</div>
      <div style="display:flex;gap:4px;align-items:center;font-size:10px">
        <span style="width:10px;height:10px;background:#3a82f6;border-radius:2px;display:inline-block"></span><span>Cool</span>
        <span style="width:10px;height:10px;background:#f59e0b;border-radius:2px;display:inline-block;margin-left:4px"></span><span>Warm</span>
        <span style="width:10px;height:10px;background:#dc2626;border-radius:2px;display:inline-block;margin-left:4px"></span><span>Hot</span>
      </div>
      <div style="color:var(--faint);font-size:9px;margin-top:3px">${Object.keys(cells).length} grid cells · ~667 m resolution · energy class + age + use</div>`);
    setStatus('');
  }

  // ─── LAYER 3: GREEN SPACE ACCESSIBILITY ──────────────────────────────────
  // Regular 250 m grid; each point coloured by walking distance to nearest
  // green area: green <400 m · amber 400–800 m · red >800 m.
  async function buildAccessibility() {
    setStatus('Fetching green areas for accessibility analysis…');
    await fetchGreenAreas();

    if (!_greenAreas.length) {
      setStatus('No green areas found in this area.'); return;
    }

    setStatus(`Mapping accessibility from ${_greenAreas.length} green areas…`);

    const LAT0 = 57.60, LAT1 = 57.83;
    const LON0 = 11.79, LON1 = 12.15;
    const STEP_LAT = 0.0025; // ~278 m
    const STEP_LON = 0.0047; // ~280 m

    const ds = new Cesium.CustomDataSource('urban-access');
    await viewer.dataSources.add(ds);
    LAYERS.access.ds = ds;

    let under400 = 0, under800 = 0, over800 = 0;

    for (let lat = LAT0; lat <= LAT1; lat += STEP_LAT) {
      for (let lon = LON0; lon <= LON1; lon += STEP_LON) {
        const { dist } = nearestGreen(lon, lat);

        let color, size;
        if (dist < 400) {
          color = Cesium.Color.fromCssColorString('rgba(22,163,74,0.72)');
          size = 5; under400++;
        } else if (dist < 800) {
          color = Cesium.Color.fromCssColorString('rgba(217,119,6,0.72)');
          size = 5; under800++;
        } else {
          color = Cesium.Color.fromCssColorString('rgba(220,38,38,0.68)');
          size = 5; over800++;
        }

        ds.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat, 20),
          point: { pixelSize: size, color, outlineWidth: 0 },
        });
      }
    }

    const total = under400 + under800 + over800;
    const pct = (n) => ((n / total) * 100).toFixed(0);

    setLegend(`
      <div style="font-weight:600;margin-bottom:4px">Green Space Accessibility</div>
      <div style="display:flex;flex-direction:column;gap:3px;font-size:10px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="width:10px;height:10px;background:#16a34a;border-radius:50%;display:inline-block"></span>
          <span>&lt; 400 m &nbsp;<b>${pct(under400)}%</b> of city</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="width:10px;height:10px;background:#d97706;border-radius:50%;display:inline-block"></span>
          <span>400 – 800 m &nbsp;<b>${pct(under800)}%</b></span>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="width:10px;height:10px;background:#dc2626;border-radius:50%;display:inline-block"></span>
          <span>&gt; 800 m &nbsp;<b>${pct(over800)}%</b></span>
        </div>
      </div>
      <div style="color:var(--faint);font-size:9px;margin-top:3px">${_greenAreas.length} green areas · 280 m grid</div>`);
    setStatus('');
  }

  // ─── TOGGLE LOGIC ─────────────────────────────────────────────────────────
  async function toggle(key) {
    if (_loading) return;
    const layer = LAYERS[key];
    _loading = true;
    try {
      if (layer.active) {
        // Turn off
        removeLayer(key);
        layer.active = false;
        updateBtn(key);
        // Clear legend only if no other layer active
        const anyActive = Object.values(LAYERS).some(l => l.active);
        if (!anyActive) { setLegend(''); setStatus(''); }
      } else {
        // Turn on
        layer.active = true;
        updateBtn(key);
        if (key === 'green')  await buildGreenIndex();
        if (key === 'uhi')    await buildUHI();
        if (key === 'access') await buildAccessibility();
      }
    } catch (err) {
      setStatus('Error: ' + err.message);
      layer.active = false;
      updateBtn(key);
      console.error('[UrbanAnalysis]', key, err);
    } finally {
      _loading = false;
    }
  }

  // ─── INIT ─────────────────────────────────────────────────────────────────
  function init() {
    for (const key of Object.keys(LAYERS)) {
      const btn = $id(LAYERS[key].btnId);
      if (btn) btn.addEventListener('click', () => toggle(key));
    }
  }

  // Wait for Cesium viewer to be ready
  if (typeof viewer !== 'undefined') {
    init();
  } else {
    window.addEventListener('load', init);
  }

  window.UrbanAnalysis = { toggle, layers: LAYERS };
})();
// <<< URBAN_ANALYSIS_END <<<
