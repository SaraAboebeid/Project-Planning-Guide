// ─────────────────────────────────────────────────────────────────────────────
// urban_analysis.js — city-wide analysis overlays for the Gothenburg 3D viewer
//
//   Layer 1 – Green Index          (btn-urban-green)   distance-decay greenness
//   Layer 2 – Heat Island Proxy    (btn-urban-uhi)     thermal stress per cell
//   Layer 3 – Green Accessibility  (btn-urban-access)  walk distance to green
//
// History: this shipped as `_urban_analysis.js`, a patch script that injected
// itself into the GENERATED assets/gothenburg_3d.html. `python build.py`
// regenerates that file from viewer/, so the next build deleted the whole
// feature — while the sidebar buttons, which live in the real source
// viewer/index.html, stayed behind and did nothing. Restored here, in the
// sources build.py actually copies, so a rebuild can no longer lose it.
//
// Self-contained: reads assets/gothenburg_greenspaces.json (22,851 OSM
// features) and the in-memory building DATA. No backend required — the earlier
// version called /api/urban/green-areas and /api/urban/streets, endpoints that
// no longer exist.
//
// Depends on: global `viewer` (Cesium.Viewer), global `DATA` (buildings).
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  const LAYERS = {
    green:  { ds: null, active: false, btnId: 'btn-urban-green',  label: 'Green Index' },
    uhi:    { ds: null, active: false, btnId: 'btn-urban-uhi',    label: 'Heat Island Proxy' },
    access: { ds: null, active: false, btnId: 'btn-urban-access', label: 'Green Accessibility' },
  };

  // Analysis extent + geometry. Gothenburg keeps its tuned bounds and pre-baked
  // green-space file; any other city derives a city-sized box around the viewer
  // centre and pulls green spaces live from OSM (/api/urban/green-areas). Green
  // Index & Green Accessibility are OSM-only so both work anywhere; Heat Island
  // still needs Swedish building-energy data and stays SE-only in the UI.
  const _ctr  = window.VIEW_CENTER || { lat: 57.70, lon: 11.96 };
  const _isSE = (window.VIEWER_COUNTRY === 'se');
  const LAT0 = _isSE ? 57.60 : _ctr.lat - 0.090;
  const LAT1 = _isSE ? 57.83 : _ctr.lat + 0.090;
  const LON0 = _isSE ? 11.79 : _ctr.lon - 0.140;
  const LON1 = _isSE ? 12.15 : _ctr.lon + 0.140;

  let _greenProxies = null;   // null = not loaded; [] = fallback; [...] = OSM data
  let _greenSource  = 'building-proxy';
  let _index        = null;   // spatial bucket index over _greenProxies
  let _loading      = false;

  // ── UI helpers ──────────────────────────────────────────────────────────────
  const $id = (id) => document.getElementById(id);
  function setStatus(msg) {
    const el = $id('urban-status');
    if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
  }
  function setLegend(html) {
    const el = $id('urban-legend');
    if (el) { el.innerHTML = html; el.style.display = html ? 'block' : 'none'; }
  }
  function updateBtn(key) {
    const btn = $id(LAYERS[key].btnId);
    if (!btn) return;
    btn.classList.toggle('active', LAYERS[key].active);
    btn.setAttribute('aria-pressed', String(LAYERS[key].active));
    const check = btn.querySelector('.overlay-check');
    if (check) check.style.background = LAYERS[key].active ? '#5B21B6' : '';
  }
  // Let the browser paint between chunks of a long computation.
  const yieldToUI = () => new Promise((r) => setTimeout(r, 0));

  // ── Geometry ────────────────────────────────────────────────────────────────
  const M_PER_DEG_LAT = 111320;
  const LON_SCALE     = Math.cos(_ctr.lat * Math.PI / 180);   // cos(city latitude)
  const M_PER_DEG_LON = M_PER_DEG_LAT * LON_SCALE;

  function distM(lon1, lat1, lon2, lat2) {
    const dlat = (lat2 - lat1) * M_PER_DEG_LAT;
    const dlon = (lon2 - lon1) * M_PER_DEG_LON;
    return Math.sqrt(dlat * dlat + dlon * dlon);
  }
  function centroid(b) {
    const ring = b.coordinates && b.coordinates[0];
    if (!ring) return null;
    let lo = 0, la = 0;
    for (const pt of ring) { lo += pt[0]; la += pt[1]; }
    return { lon: lo / ring.length, lat: la / ring.length };
  }
  function polyAreaM2(ring) {
    let a = 0;
    for (let i = 0, n = ring.length; i < n; i++) {
      const j = (i + 1) % n;
      a += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1];
    }
    return Math.abs(a / 2) * M_PER_DEG_LAT * M_PER_DEG_LON;
  }

  // Minimum area per OSM green type (m²) — filters out the long tail of tiny
  // grass verges that would otherwise dominate the 22k features.
  const MIN_AREA = {
    'leisure=park': 200, 'leisure=garden': 200, 'leisure=nature_reserve': 0,
    'landuse=recreation_ground': 500, 'landuse=grass': 2000, 'landuse=forest': 1000,
    'landuse=meadow': 1000, 'natural=wood': 0, 'natural=scrub': 5000,
    'natural=grassland': 0,
  };

  // ── Green-space data ────────────────────────────────────────────────────────
  async function loadGreenProxies() {
    if (_greenProxies !== null) return _greenProxies;
    try {
      const url = _isSE
        ? 'gothenburg_greenspaces.json'
        : `/api/urban/green-areas?south=${LAT0.toFixed(4)}&north=${LAT1.toFixed(4)}&west=${LON0.toFixed(4)}&east=${LON1.toFixed(4)}`;
      const res = await fetch(url);
      if (res.ok) {
        const raw = await res.json();
        _greenProxies = raw.filter((f) =>
          f.area >= (MIN_AREA[f.type] ?? 500) &&
          f.lon >= LON0 && f.lon <= LON1 && f.lat >= LAT0 && f.lat <= LAT1);
        _greenSource = 'osm';
        console.log('[UrbanAnalysis] OSM green spaces:', _greenProxies.length, 'of', raw.length);
        buildIndex();
        return _greenProxies;
      }
    } catch (e) {
      console.warn('[UrbanAnalysis] gothenburg_greenspaces.json unavailable — using building proxies:', e.message);
    }

    // Fallback: infer green-ish open space from the building layer itself.
    _greenSource = 'building-proxy';
    _greenProxies = [];
    if (typeof DATA !== 'undefined') {
      for (const b of DATA) {
        const ring = b.coordinates && b.coordinates[0];
        if (!ring) continue;
        const use = b.use_cat || '';
        const isProxy = use === 'komplement' ||
          (use === 'samhalle' && (b.height || 10) < 6) ||
          (use === 'samhalle' && polyAreaM2(ring) > 800);
        if (!isProxy) continue;
        const c = centroid(b);
        if (!c || c.lon < LON0 || c.lon > LON1 || c.lat < LAT0 || c.lat > LAT1) continue;
        _greenProxies.push({ lon: c.lon, lat: c.lat, area: 0 });
      }
    }
    console.warn('[UrbanAnalysis] falling back to', _greenProxies.length, 'building proxies');
    buildIndex();
    return _greenProxies;
  }

  // ── Nearest-green lookup ────────────────────────────────────────────────────
  // The original scanned every green area for every grid point: ~7,000 points x
  // ~10,000 areas x 2 layers is tens of millions of distance calculations on the
  // main thread, which locked the tab for many seconds. Bucket the areas into a
  // ~500 m grid and search outward ring by ring instead.
  const CELL_M    = 500;
  const CELL_LAT  = CELL_M / M_PER_DEG_LAT;
  const CELL_LON  = CELL_M / M_PER_DEG_LON;
  let _maxRadiusM = 0;

  // A green space is stored only as centroid + area, so "distance to the green
  // space" is approximated as distance-to-centroid minus the radius of a circle
  // of that area. Uncapped that badly over-credits sprawling forests, and this
  // dataset makes it worse: 1,652 of its 22,851 features have an area of
  // EXACTLY 10,000,000 m² — a clamp in whatever generated the file — each of
  // which would otherwise mark everything within 1,784 m as touching green.
  // The result was Accessibility reporting 100% of the city within 400 m, i.e.
  // a uniform map that answers nothing. Capping the credited radius restores a
  // usable spread (≈85% / 11% / 4% across the <400 m / 400–800 m / >800 m
  // bands). Raise or remove MAX_EFFECTIVE_RADIUS_M to trade back toward the
  // original behaviour.
  const MAX_EFFECTIVE_RADIUS_M = 300;

  function buildIndex() {
    _index = new Map();
    _maxRadiusM = 0;
    for (const g of _greenProxies) {
      // Effective radius, so a point *inside* a park scores 0 rather than the
      // distance to its centroid — capped, see MAX_EFFECTIVE_RADIUS_M above.
      g._r = g.area ? Math.min(Math.sqrt(g.area / Math.PI), MAX_EFFECTIVE_RADIUS_M) : 0;
      if (g._r > _maxRadiusM) _maxRadiusM = g._r;
      const key = Math.floor((g.lon - LON0) / CELL_LON) + ':' + Math.floor((g.lat - LAT0) / CELL_LAT);
      let bucket = _index.get(key);
      if (!bucket) { bucket = []; _index.set(key, bucket); }
      bucket.push(g);
    }
  }

  function nearestGreenDist(lon, lat) {
    if (!_index || !_greenProxies.length) return Infinity;
    const ci = Math.floor((lon - LON0) / CELL_LON);
    const cj = Math.floor((lat - LAT0) / CELL_LAT);
    let best = Infinity;

    for (let k = 0; k < 64; k++) {
      // Scan the ring of cells at Chebyshev distance k.
      for (let di = -k; di <= k; di++) {
        for (let dj = -k; dj <= k; dj++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== k) continue;   // ring only
          const bucket = _index.get((ci + di) + ':' + (cj + dj));
          if (!bucket) continue;
          for (const g of bucket) {
            const d = Math.max(0, distM(lon, lat, g.lon, g.lat) - g._r);
            if (d < best) best = d;
          }
        }
      }
      // Anything still unscanned sits at least k*CELL_M away, less its own
      // radius — once that floor exceeds the best found, no ring can improve it.
      if (best !== Infinity && k * CELL_M - _maxRadiusM > best) break;
    }
    return best;
  }

  function removeLayer(key) {
    const l = LAYERS[key];
    if (l.ds) { viewer.dataSources.remove(l.ds, true); l.ds = null; }
  }

  // ── LAYER 1: Green Index ────────────────────────────────────────────────────
  async function buildGreenIndex() {
    setStatus('Loading green space data...');
    const proxies = await loadGreenProxies();
    const dLat = 0.0025, dLon = 0.0047, D = 200;
    const ds = new Cesium.CustomDataSource('urban-green');
    viewer.dataSources.add(ds);
    LAYERS.green.ds = ds;

    let n = 0, row = 0;
    const rows = Math.ceil((LAT1 - LAT0) / dLat);
    for (let lat = LAT0; lat <= LAT1; lat += dLat, row++) {
      for (let lon = LON0; lon <= LON1; lon += dLon) {
        const score = Math.exp(-nearestGreenDist(lon + dLon / 2, lat + dLat / 2) / D);
        ds.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon + dLon / 2, lat + dLat / 2, 20),
          point: {
            pixelSize: 10,
            color: Cesium.Color.fromHsl(score * 120 / 360, 0.85, 0.50, 0.80),
            outlineWidth: 0,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        n++;
      }
      if ((row & 7) === 0) {
        setStatus(`Computing Green Index... ${Math.round(row / rows * 100)}%`);
        await yieldToUI();
        if (!LAYERS.green.active) { removeLayer('green'); return; }   // toggled off mid-build
      }
    }

    const src = _greenSource === 'osm' ? 'OSM parks/forests' : 'building proxies (fallback)';
    setLegend(
      '<div style="font-weight:600;margin-bottom:4px">Street Green Index</div>' +
      '<div style="display:flex;gap:6px;align-items:center;font-size:10px">' +
        '<span style="width:50px;height:6px;background:linear-gradient(to right,#e4391b,#f59e0b,#16a34a);' +
        'border-radius:2px;display:inline-block"></span>' +
        '<span style="color:var(--muted)">No green → Near green</span>' +
      '</div>' +
      `<div style="color:var(--faint);font-size:9px;margin-top:3px">${proxies.length} green areas · ${n} pts · D=200 m · ${src}</div>`);
    setStatus('');
  }

  // ── LAYER 2: Heat Island Proxy ──────────────────────────────────────────────
  async function buildUHI() {
    setStatus('Loading green space data...');
    const proxies = await loadGreenProxies();
    if (typeof DATA === 'undefined') { setStatus('Building data not available.'); return; }
    setStatus('Computing Heat Island proxy...');

    const dLat = 0.006, dLon = 0.011;
    const EC = { A: 0.05, B: 0.18, C: 0.32, D: 0.50, E: 0.65, F: 0.80, G: 1.0 };
    const US = { industri: 1.0, verksamhet: 0.70, samhalle: 0.60,
                 bostad_flerfamilj: 0.48, bostad_enfamilj: 0.38, komplement: 0.25, ovrigt: 0.45 };
    function ageS(yr) {
      if (!yr) return 0.55;
      if (yr >= 2005) return 0.12; if (yr >= 2000) return 0.20;
      if (yr >= 1990) return 0.30; if (yr >= 1980) return 0.40;
      if (yr >= 1970) return 0.55; if (yr >= 1960) return 0.65;
      if (yr >= 1950) return 0.75; return 0.85;
    }

    const cells = new Map();
    for (const b of DATA) {
      const c = centroid(b);
      if (!c || c.lon < LON0 || c.lon > LON1 || c.lat < LAT0 || c.lat > LAT1) continue;
      const iLat = Math.floor((c.lat - LAT0) / dLat);
      const iLon = Math.floor((c.lon - LON0) / dLon);
      const k = iLat + '_' + iLon;
      const raw = (EC[b.eclass] ?? 0.55) * 0.50 + ageS(b.year) * 0.30 + (US[b.use_cat] ?? 0.45) * 0.20;
      let cell = cells.get(k);
      if (!cell) {
        cell = { sum: 0, count: 0, cx: LON0 + (iLon + 0.5) * dLon, cy: LAT0 + (iLat + 0.5) * dLat, iLat, iLon };
        cells.set(k, cell);
      }
      cell.sum += raw; cell.count++;
    }

    const ds = new Cesium.CustomDataSource('urban-uhi');
    viewer.dataSources.add(ds);
    LAYERS.uhi.ds = ds;

    let done = 0;
    for (const cell of cells.values()) {
      if (!cell.count) continue;
      let s = cell.sum / cell.count;
      // Nearby green cools the cell.
      s = Math.max(0, s * (1 - Math.exp(-nearestGreenDist(cell.cx, cell.cy) / 300) * 0.35));
      let color;
      if (s < 0.5) { const t = s * 2;       color = new Cesium.Color(0.23 + t * 0.74, 0.51 + t * 0.11, 0.96 - t * 0.92, 0.45 + t * 0.10); }
      else         { const t = (s - 0.5) * 2; color = new Cesium.Color(0.97, 0.62 - t * 0.44, 0.04 * (1 - t), 0.55 + t * 0.15); }
      const ml = LON0 + cell.iLon * dLon, mb = LAT0 + cell.iLat * dLat;
      ds.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(
            [ml, mb, ml + dLon, mb, ml + dLon, mb + dLat, ml, mb + dLat])),
          material: color, outline: false, height: 0, extrudedHeight: 80,
        },
      });
      if ((++done & 63) === 0) {
        await yieldToUI();
        if (!LAYERS.uhi.active) { removeLayer('uhi'); return; }
      }
    }

    const src = _greenSource === 'osm' ? 'OSM green spaces' : 'building proxies (fallback)';
    setLegend(
      '<div style="font-weight:600;margin-bottom:4px">Heat Island Proxy</div>' +
      '<div style="display:flex;gap:4px;align-items:center;font-size:10px">' +
        swatch('#3a82f6', 'Cool') + swatch('#f59e0b', 'Warm') + swatch('#dc2626', 'Hot') +
      '</div>' +
      `<div style="color:var(--faint);font-size:9px;margin-top:3px">${cells.size} cells · ~667 m · energy class + age + use · ${src}</div>`);
    setStatus('');
  }

  function swatch(color, label) {
    return `<span style="width:10px;height:10px;background:${color};border-radius:2px;display:inline-block;margin-left:4px"></span><span>${label}</span>`;
  }

  // ── LAYER 3: Green Space Accessibility ──────────────────────────────────────
  async function buildAccessibility() {
    setStatus('Loading green space data...');
    const proxies = await loadGreenProxies();
    if (!proxies.length) { setStatus('No green space data available.'); return; }

    const dLat = 0.0025, dLon = 0.0047;
    const ds = new Cesium.CustomDataSource('urban-access');
    viewer.dataSources.add(ds);
    LAYERS.access.ds = ds;

    let n400 = 0, n800 = 0, nFar = 0, row = 0;
    const rows = Math.ceil((LAT1 - LAT0) / dLat);
    for (let lat = LAT0; lat <= LAT1; lat += dLat, row++) {
      for (let lon = LON0; lon <= LON1; lon += dLon) {
        const d = nearestGreenDist(lon, lat);
        let color;
        if (d < 400)      { color = Cesium.Color.fromCssColorString('rgba(22,163,74,0.72)'); n400++; }
        else if (d < 800) { color = Cesium.Color.fromCssColorString('rgba(217,119,6,0.72)'); n800++; }
        else              { color = Cesium.Color.fromCssColorString('rgba(220,38,38,0.68)'); nFar++; }
        ds.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat, 20),
          point: {
            pixelSize: 9, color, outlineWidth: 1,
            outlineColor: Cesium.Color.WHITE.withAlpha(0.4),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      }
      if ((row & 7) === 0) {
        setStatus(`Mapping green accessibility... ${Math.round(row / rows * 100)}%`);
        await yieldToUI();
        if (!LAYERS.access.active) { removeLayer('access'); return; }
      }
    }

    const tot = n400 + n800 + nFar;
    const pct = (n) => ((n / tot) * 100).toFixed(0);
    const dot = (color, label, value) =>
      '<div style="display:flex;align-items:center;gap:6px">' +
      `<span style="width:10px;height:10px;background:${color};border-radius:50%;display:inline-block"></span>` +
      `<span>${label} &nbsp;<b>${value}%</b></span></div>`;
    const src = _greenSource === 'osm' ? 'OSM parks/forests/gardens' : 'building proxies (fallback)';
    setLegend(
      '<div style="font-weight:600;margin-bottom:4px">Green Space Accessibility</div>' +
      '<div style="display:flex;flex-direction:column;gap:3px;font-size:10px">' +
        dot('#16a34a', '&lt; 400 m', pct(n400)) +
        dot('#d97706', '400–800 m', pct(n800)) +
        dot('#dc2626', '&gt; 800 m', pct(nFar)) +
      '</div>' +
      `<div style="color:var(--faint);font-size:9px;margin-top:3px">${proxies.length} green areas · 280 m grid · ${src}</div>`);
    setStatus('');
  }

  // ── Toggle ──────────────────────────────────────────────────────────────────
  const BUILD = { green: buildGreenIndex, uhi: buildUHI, access: buildAccessibility };

  async function toggle(key) {
    if (_loading) return;
    const layer = LAYERS[key];
    _loading = true;
    try {
      if (layer.active) {
        removeLayer(key);
        layer.active = false;
        updateBtn(key);
        if (!Object.values(LAYERS).some((l) => l.active)) { setLegend(''); setStatus(''); }
      } else {
        layer.active = true;
        updateBtn(key);
        // These grid/street overlays read as maps — orient the camera top-down.
        if (window.viewTopDown) window.viewTopDown();
        await BUILD[key]();
      }
    } catch (err) {
      setStatus('Error: ' + err.message);
      layer.active = false;
      updateBtn(key);
      console.error('[UrbanAnalysis]', key, err);
    } finally {
      _loading = false;
      // Flag for ui.js: suppress the per-building hover card while an urban
      // analysis layer (green index / heat island / green accessibility) is on.
      window._urbanActive = Object.values(LAYERS).some((l) => l.active);
    }
  }

  for (const key of Object.keys(LAYERS)) {
    const btn = $id(LAYERS[key].btnId);
    if (btn) btn.addEventListener('click', () => toggle(key));
  }

  window.UrbanAnalysis = { toggle, layers: LAYERS };
  console.log('✓ urban_analysis: module loaded');
})();
