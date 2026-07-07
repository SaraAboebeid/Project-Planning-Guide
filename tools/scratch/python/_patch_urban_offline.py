"""
Inject Urban Analysis JS into gothenburg_3d.html.
Loads real OSM green spaces from gothenburg_greenspaces.json.
Falls back to building proxies if the file is unavailable.
"""
import pathlib

HTML = pathlib.Path(
    r"c:\Users\saraabo\Desktop\Project Planning Guide\Project-Planning-Guide\assets\gothenburg_3d.html"
)

# ── The JS block that replaces URBAN_ANALYSIS_BEGIN ... URBAN_ANALYSIS_END ──
JS = """\
// >>> URBAN_ANALYSIS_BEGIN >>>
// Urban Analysis overlay — Green Index, Heat Island Proxy, Green Accessibility
// Loads real OSM green spaces from gothenburg_greenspaces.json (21k features).
// Falls back to building proxies if the file is unavailable.
(function () {
  'use strict';

  const LAYERS = {
    green:  { ds: null, active: false, btnId: 'btn-urban-green',  label: 'Green Index' },
    uhi:    { ds: null, active: false, btnId: 'btn-urban-uhi',    label: 'Heat Island Proxy' },
    access: { ds: null, active: false, btnId: 'btn-urban-access', label: 'Green Accessibility' },
  };

  const LAT0 = 57.60, LAT1 = 57.83, LON0 = 11.79, LON1 = 12.15;
  let _greenProxies = null;   // null=not loaded; []=fallback; [...]= OSM data
  let _greenSource  = 'building-proxy';
  let _loading = false;

  // ── UI helpers ─────────────────────────────────────────────────────────────
  function $id(id) { return document.getElementById(id); }
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
    const check = btn.querySelector('.overlay-check');
    if (LAYERS[key].active) {
      btn.classList.add('active');
      if (check) check.style.background = '#5B21B6';
    } else {
      btn.classList.remove('active');
      if (check) check.style.background = '';
    }
  }

  // ── Geometry helpers ──────────────────────────────────────────────────────
  function distM(lon1, lat1, lon2, lat2) {
    const dlat = (lat2 - lat1) * 111320;
    const dlon = (lon2 - lon1) * 111320 * 0.536;
    return Math.sqrt(dlat * dlat + dlon * dlon);
  }
  function centroid(b) {
    if (!b.coordinates || !b.coordinates[0]) return null;
    const ring = b.coordinates[0];
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
    return Math.abs(a / 2) * 111320 * 111320 * 0.536;
  }

  // ── Min area thresholds per OSM green type (m²) ───────────────────────────
  const MIN_AREA = {
    'leisure=park':              200,
    'leisure=garden':            200,
    'leisure=nature_reserve':      0,
    'landuse=recreation_ground': 500,
    'landuse=grass':            2000,
    'landuse=forest':           1000,
    'landuse=meadow':           1000,
    'natural=wood':                0,
    'natural=scrub':            5000,
    'natural=grassland':           0,
  };

  // ── Load green proxies (async, cached) ────────────────────────────────────
  async function loadGreenProxies() {
    if (_greenProxies !== null) return _greenProxies;
    try {
      const res = await fetch('gothenburg_greenspaces.json');
      if (res.ok) {
        const raw = await res.json();
        _greenProxies = raw.filter(f => {
          const minA = MIN_AREA[f.type] ?? 500;
          return f.area >= minA &&
                 f.lon >= LON0 && f.lon <= LON1 &&
                 f.lat >= LAT0 && f.lat <= LAT1;
        });
        _greenSource = 'osm';
        console.log('[UrbanAnalysis] OSM green spaces loaded:', _greenProxies.length, '(from', raw.length, ')');
        return _greenProxies;
      }
    } catch (e) {
      console.warn('[UrbanAnalysis] Could not load gothenburg_greenspaces.json — falling back to building proxies:', e.message);
    }
    // Fallback: derive from embedded building DATA
    _greenSource = 'building-proxy';
    _greenProxies = [];
    if (typeof DATA !== 'undefined') {
      for (const b of DATA) {
        if (!b.coordinates || !b.coordinates[0]) continue;
        const use = b.use_cat || '';
        const isProxy = use === 'komplement' ||
          (use === 'samhalle' && (b.height || 10) < 6) ||
          (use === 'samhalle' && polyAreaM2(b.coordinates[0]) > 800);
        if (!isProxy) continue;
        const c = centroid(b);
        if (!c || c.lon < LON0 || c.lon > LON1 || c.lat < LAT0 || c.lat > LAT1) continue;
        _greenProxies.push(c);
      }
    }
    console.warn('[UrbanAnalysis] Using', _greenProxies.length, 'building proxies as fallback');
    return _greenProxies;
  }

  function nearestGreenDist(proxies, lon, lat) {
    let best = Infinity;
    for (const g of proxies) {
      const d = distM(lon, lat, g.lon, g.lat);
      // subtract effective radius so points *inside* the polygon score as 0
      // cap radius at 400m so large parks don't swallow the whole city
      const r = g.area ? Math.min(Math.sqrt(g.area / Math.PI), 400) : 0;
      best = Math.min(best, Math.max(0, d - r));
    }
    return best;
  }

  function removeLayer(key) {
    const l = LAYERS[key];
    if (l.ds) { viewer.dataSources.remove(l.ds, true); l.ds = null; }
  }

  // ── LAYER 1: GREEN INDEX ───────────────────────────────────────────────────
  async function buildGreenIndex() {
    setStatus('Loading green space data…');
    const proxies = await loadGreenProxies();
    setStatus('Computing Green Index…');
    const dLat = 0.0025, dLon = 0.0047, D = 200;
    const ds = new Cesium.CustomDataSource('urban-green');
    viewer.dataSources.add(ds);
    LAYERS.green.ds = ds;
    let n = 0;
    for (let lat = LAT0; lat <= LAT1; lat += dLat) {
      for (let lon = LON0; lon <= LON1; lon += dLon) {
        const dist = nearestGreenDist(proxies, lon + dLon / 2, lat + dLat / 2);
        const score = Math.exp(-dist / D);
        const h = score * 120 / 360;
        const color = Cesium.Color.fromHsl(h, 0.85, 0.50, 0.80);
        ds.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon + dLon / 2, lat + dLat / 2, 20),
          point: { pixelSize: 10, color, outlineWidth: 0,
                   disableDepthTestDistance: Number.POSITIVE_INFINITY },
        });
        n++;
      }
    }
    const src = _greenSource === 'osm' ? 'OSM parks/forests' : 'building proxies (fallback)';
    setLegend(`
      <div style="font-weight:600;margin-bottom:4px">Street Green Index</div>
      <div style="display:flex;gap:6px;align-items:center;font-size:10px">
        <span style="width:50px;height:6px;background:linear-gradient(to right,#e4391b,#f59e0b,#16a34a);border-radius:2px;display:inline-block"></span>
        <span style="color:var(--muted)">No green \\u2192 Near green</span>
      </div>
      <div style="color:var(--faint);font-size:9px;margin-top:3px">${proxies.length} green areas \\u00b7 ${n} pts \\u00b7 D=200 m \\u00b7 ${src}</div>`);
    setStatus('');
  }

  // ── LAYER 2: URBAN HEAT ISLAND PROXY ─────────────────────────────────────
  async function buildUHI() {
    setStatus('Loading green space data…');
    const proxies = await loadGreenProxies();
    setStatus('Computing Heat Island proxy…');
    if (typeof DATA === 'undefined') { setStatus('Building data not available.'); return; }
    const dLat = 0.006, dLon = 0.011;
    const EC = { A: 0.05, B: 0.18, C: 0.32, D: 0.50, E: 0.65, F: 0.80, G: 1.0 };
    function ageS(yr) {
      if (!yr) return 0.55;
      if (yr >= 2005) return 0.12; if (yr >= 2000) return 0.20;
      if (yr >= 1990) return 0.30; if (yr >= 1980) return 0.40;
      if (yr >= 1970) return 0.55; if (yr >= 1960) return 0.65;
      if (yr >= 1950) return 0.75; return 0.85;
    }
    const US = { industri:1.0, verksamhet:0.70, samhalle:0.60,
                 bostad_flerfamilj:0.48, bostad_enfamilj:0.38, komplement:0.25, ovrigt:0.45 };
    const cells = {};
    for (const b of DATA) {
      const c = centroid(b);
      if (!c || c.lon < LON0 || c.lon > LON1 || c.lat < LAT0 || c.lat > LAT1) continue;
      const iLat = Math.floor((c.lat - LAT0) / dLat);
      const iLon = Math.floor((c.lon - LON0) / dLon);
      const k = iLat + '_' + iLon;
      const raw = (EC[b.eclass] ?? 0.55) * 0.50 + ageS(b.year) * 0.30 + (US[b.use_cat] ?? 0.45) * 0.20;
      if (!cells[k]) cells[k] = { sum: 0, count: 0,
        cx: LON0 + (iLon + 0.5) * dLon, cy: LAT0 + (iLat + 0.5) * dLat, iLat, iLon };
      cells[k].sum += raw; cells[k].count++;
    }
    const ds = new Cesium.CustomDataSource('urban-uhi');
    viewer.dataSources.add(ds);
    LAYERS.uhi.ds = ds;
    for (const k of Object.keys(cells)) {
      const cell = cells[k];
      if (!cell.count) continue;
      let s = cell.sum / cell.count;
      s = Math.max(0, s * (1 - Math.exp(-nearestGreenDist(proxies, cell.cx, cell.cy) / 300) * 0.35));
      let color;
      if (s < 0.5) { const t = s * 2; color = new Cesium.Color(0.23+t*0.74, 0.51+t*0.11, 0.96-t*0.92, 0.45+t*0.1); }
      else         { const t = (s-0.5)*2; color = new Cesium.Color(0.97, 0.62-t*0.44, 0.04*(1-t), 0.55+t*0.15); }
      const ml = LON0 + cell.iLon * dLon, mb = LAT0 + cell.iLat * dLat;
      ds.entities.add({ polygon: { hierarchy: new Cesium.PolygonHierarchy(
        Cesium.Cartesian3.fromDegreesArray([ml,mb, ml+dLon,mb, ml+dLon,mb+dLat, ml,mb+dLat])),
        material: color, outline: false, height: 0, extrudedHeight: 80 }});
    }
    const src = _greenSource === 'osm' ? 'OSM green spaces' : 'building proxies (fallback)';
    setLegend(`
      <div style="font-weight:600;margin-bottom:4px">Heat Island Proxy</div>
      <div style="display:flex;gap:4px;align-items:center;font-size:10px">
        <span style="width:10px;height:10px;background:#3a82f6;border-radius:2px;display:inline-block"></span><span>Cool</span>
        <span style="width:10px;height:10px;background:#f59e0b;border-radius:2px;display:inline-block;margin-left:4px"></span><span>Warm</span>
        <span style="width:10px;height:10px;background:#dc2626;border-radius:2px;display:inline-block;margin-left:4px"></span><span>Hot</span>
      </div>
      <div style="color:var(--faint);font-size:9px;margin-top:3px">${Object.keys(cells).length} cells \\u00b7 ~667 m \\u00b7 energy class + age + use \\u00b7 ${src}</div>`);
    setStatus('');
  }

  // ── LAYER 3: GREEN SPACE ACCESSIBILITY ───────────────────────────────────
  async function buildAccessibility() {
    setStatus('Loading green space data…');
    const proxies = await loadGreenProxies();
    setStatus('Mapping green space accessibility…');
    if (!proxies.length) { setStatus('No green data available.'); return; }
    const STEP_LAT = 0.0025, STEP_LON = 0.0047;
    const ds = new Cesium.CustomDataSource('urban-access');
    viewer.dataSources.add(ds);
    LAYERS.access.ds = ds;
    let n400 = 0, n800 = 0, nFar = 0;
    for (let lat = LAT0; lat <= LAT1; lat += STEP_LAT) {
      for (let lon = LON0; lon <= LON1; lon += STEP_LON) {
        const d = nearestGreenDist(proxies, lon, lat);
        let color;
        if (d < 400)      { color = Cesium.Color.fromCssColorString('rgba(22,163,74,0.72)');  n400++; }
        else if (d < 800) { color = Cesium.Color.fromCssColorString('rgba(217,119,6,0.72)');   n800++; }
        else              { color = Cesium.Color.fromCssColorString('rgba(220,38,38,0.68)');   nFar++; }
        ds.entities.add({ position: Cesium.Cartesian3.fromDegrees(lon, lat, 20),
          point: { pixelSize: 9, color, outlineWidth: 1,
                   outlineColor: Cesium.Color.WHITE.withAlpha(0.4),
                   disableDepthTestDistance: Number.POSITIVE_INFINITY }});
      }
    }
    const tot = n400 + n800 + nFar;
    const pct = n => ((n / tot) * 100).toFixed(0);
    const src = _greenSource === 'osm' ? 'OSM parks/forests/gardens' : 'building proxies (fallback)';
    setLegend(`
      <div style="font-weight:600;margin-bottom:4px">Green Space Accessibility</div>
      <div style="display:flex;flex-direction:column;gap:3px;font-size:10px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="width:10px;height:10px;background:#16a34a;border-radius:50%;display:inline-block"></span>
          <span>&lt; 400 m &nbsp;<b>${pct(n400)}%</b></span></div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="width:10px;height:10px;background:#d97706;border-radius:50%;display:inline-block"></span>
          <span>400\\u2013800 m &nbsp;<b>${pct(n800)}%</b></span></div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="width:10px;height:10px;background:#dc2626;border-radius:50%;display:inline-block"></span>
          <span>&gt; 800 m &nbsp;<b>${pct(nFar)}%</b></span></div>
      </div>
      <div style="color:var(--faint);font-size:9px;margin-top:3px">${proxies.length} green areas \\u00b7 280 m grid \\u00b7 ${src}</div>`);
    setStatus('');
  }

  // ── Toggle ────────────────────────────────────────────────────────────────
  async function toggle(key) {
    if (_loading) return;
    const layer = LAYERS[key];
    _loading = true;
    try {
      if (layer.active) {
        removeLayer(key);
        layer.active = false;
        updateBtn(key);
        if (!Object.values(LAYERS).some(l => l.active)) { setLegend(''); setStatus(''); }
      } else {
        layer.active = true;
        updateBtn(key);
        if (key === 'green')  await buildGreenIndex();
        if (key === 'uhi')    await buildUHI();
        if (key === 'access') await buildAccessibility();
      }
    } catch (err) {
      setStatus('Error: ' + err.message);
      layer.active = false; updateBtn(key);
      console.error('[UrbanAnalysis]', key, err);
    } finally {
      _loading = false;
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    for (const key of Object.keys(LAYERS)) {
      const btn = $id(LAYERS[key].btnId);
      if (btn) btn.addEventListener('click', () => toggle(key));
    }
  }
  if (typeof viewer !== 'undefined') { init(); }
  else { window.addEventListener('load', init); }
  window.UrbanAnalysis = { toggle, layers: LAYERS };
})();
// <<< URBAN_ANALYSIS_END <<<"""

# ── Inject into HTML ──────────────────────────────────────────────────────────
txt = HTML.read_text(encoding='utf-8')
BEGIN = '// >>> URBAN_ANALYSIS_BEGIN >>>'
END   = '// <<< URBAN_ANALYSIS_END <<<'
i0 = txt.find(BEGIN)
i1 = txt.find(END)
if i0 == -1 or i1 == -1 or i1 < i0:
    raise SystemExit(f"Markers not found: BEGIN={i0} END={i1}")
new_txt = txt[:i0] + JS + txt[i1 + len(END):]
HTML.write_text(new_txt, encoding='utf-8')
print(f"Done — replaced 1 block. New block: {len(JS)} bytes. File: {len(new_txt):,} bytes")
