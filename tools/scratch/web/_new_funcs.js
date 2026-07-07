async function showInfoPanel(b, idx) {
  selectedBuilding = { ...b, _idx: idx };
  lastPvgis = null; lastWWR = null;
  // Enable analysis tool buttons
  document.getElementById('btn-inspect').disabled = false;
  document.getElementById('btn-pvgis').disabled   = false;
  document.getElementById('lp-no-selection').style.display = 'none';
  // Reset PVGIS result and saved badges when switching buildings
  const pvr = document.getElementById('pvgis-result');
  pvr.style.display = 'none'; pvr.innerHTML = '';
  document.getElementById('pvgis-saved-badge').style.display = 'none';
  document.getElementById('inspect-saved-badge').style.display = 'none';
  // Auto-load saved results for this building
  const bRing = b.coordinates && b.coordinates[0];
  if (bRing && bRing.length) {
    const bLat = (bRing.reduce((s,c) => s+c[1], 0) / bRing.length).toFixed(5);
    const bLon = (bRing.reduce((s,c) => s+c[0], 0) / bRing.length).toFixed(5);
    try {
      const [pvRes, wwrRes] = await Promise.all([
        fetch(`http://localhost:8000/api/pvgis-lookup?lat=${bLat}&lon=${bLon}`).then(r=>r.json()),
        fetch(`http://localhost:8000/api/wwr-lookup?lat=${bLat}&lon=${bLon}`).then(r=>r.json()),
      ]);
      if (pvRes.found) {
        const r = pvRes.record;
        const mwh = (r.annual_kwh / 1000).toFixed(1);
        const badge = document.getElementById('pvgis-saved-badge');
        badge.innerHTML = '&#128190; Saved: ' + mwh + ' MWh/yr · ' + r.kWp + ' kWp';
        badge.style.display = 'block';
      }
      if (wwrRes.found) {
        const r = wwrRes.record;
        const badge = document.getElementById('inspect-saved-badge');
        badge.innerHTML = '&#128190; Saved WWR: ' + r.average_wwr + '% (AI)';
        badge.style.display = 'block';
      }
    } catch(e) { /* lookup not critical */ }
  }
  const rows = [];
  const row = (l,v) => v != null && v !== '' ? rows.push('<div class="tt-row"><span class="tt-lbl">'+l+'</span><span class="tt-val">'+v+'</span></div>') : null;
  row('Address',  b.address);
  row('Use',      b.use_cat ? b.use_cat.replace(/_/g,' ') : null);
  row('Energy class', b.eclass);
  row('Energy',   b.energy ? b.energy + ' kWh/m²' : null);
  row('Year',     b.year);
  row('Footprint', b.footprint_m2 ? Math.round(b.footprint_m2) + ' m²' : null);
  row('Height',   b.height ? Math.round(b.height) + ' m' : null);
  row('Floors',   b.floors);
  row('Period',   b.tabula_period);
  row('U-wall',   b.tabula_u_wall ? b.tabula_u_wall + ' W/m²K' : null);
  row('U-win',    b.tabula_u_win  ? b.tabula_u_win  + ' W/m²K' : null);
  // Populate sidebar building detail
  document.getElementById('lp-sel-addr').textContent  = b.address || 'Building';
  document.getElementById('lp-sel-badge-row').innerHTML = b.use_cat
    ? '<span class="use-badge">' + b.use_cat.replace(/_/g,' ') + '</span>' : '';
  document.getElementById('lp-info-content').innerHTML = rows.join('');

  // Switch sidebar: hide overview, show detail
  document.getElementById('lp-selected').style.display = 'flex';
  document.getElementById('lp-stats').style.display    = 'none';
  document.getElementById('lp-tabs').style.display     = 'none';
  document.getElementById('legend-container').style.display = 'none';
  document.getElementById('lp-hint').style.display     = 'none';

  // Highlight outline
  if (highlightEntity) viewer.entities.remove(highlightEntity);
  const ring = b.coordinates[0];
  if (ring && ring.length >= 3) {
    const flat = [];
    for (const [lo, la] of ring) { flat.push(lo, la); }
    highlightEntity = viewer.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(flat)),
        extrudedHeight: Math.max(3, b.height || 6) + 0.5,
        height: 0,
        material: Cesium.Color.fromCssColorString('#a78bfa').withAlpha(0.0),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#a78bfa'),
        outlineWidth: 3,
      },
    });
  }
}

function hideInfoPanel() {
  if (highlightEntity) { viewer.entities.remove(highlightEntity); highlightEntity = null; }
  selectedBuilding = null;
  // Disable analysis tool buttons
  document.getElementById('btn-inspect').disabled = true;
  document.getElementById('btn-pvgis').disabled   = true;
  document.getElementById('lp-no-selection').style.display = 'block';
  // Switch sidebar back to overview
  document.getElementById('lp-selected').style.display    = 'none';
  document.getElementById('lp-stats').style.display       = 'grid';
  document.getElementById('lp-tabs').style.display        = 'flex';
  document.getElementById('legend-container').style.display = '';
  document.getElementById('lp-hint').style.display        = '';
}

document.getElementById('info-close').addEventListener('click', hideInfoPanel);
document.getElementById('lp-back').addEventListener('click', hideInfoPanel);

// ─────────────────────────────────────────────────────────────────
// Facade Inspector
// ─────────────────────────────────────────────────────────────────
let facadeBuilding = null;
let lastPvgis = null;
let lastWWR   = null;
const DIRS = ['N','E','S','W'];
const DIR_HEADINGS = { N:0, E:90, S:180, W:270 };

document.getElementById('btn-pvgis').addEventListener('click', () => {
  if (!selectedBuilding) return;
  fetchPVGIS(selectedBuilding);
});

async function fetchPVGIS(b) {
  const el = document.getElementById('pvgis-result');
  if (!b.footprint_m2 || !b.coordinates) {
    el.style.display = 'block';
    el.innerHTML = '<span style="color:#f87171">No footprint data available</span>';
    return;
  }
  const ring = b.coordinates[0];
  let sumLon = 0, sumLat = 0;
  for (const [lo, la] of ring) { sumLon += lo; sumLat += la; }
  const lat = (sumLat / ring.length).toFixed(5);
  const lon = (sumLon / ring.length).toFixed(5);
  const kWp = Math.round(b.footprint_m2 * 0.7 * 0.2 * 10) / 10;
  el.style.display = 'block';
  el.innerHTML = '<span style="color:#94a3b8">Fetching PVGIS…</span>';
  try {
    const url = `http://localhost:8000/api/pvgis?lat=${lat}&lon=${lon}&peakpower=${kWp}&loss=14&angle=35&aspect=0`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const Ey = data.outputs && data.outputs.totals && data.outputs.totals.fixed && data.outputs.totals.fixed.E_y;
    if (!Ey) throw new Error('No yield data in response');
    const totalKwh = Math.round(Ey * kWp);
    const mwh = (totalKwh / 1000).toFixed(1);
    lastPvgis = { lat: parseFloat(lat), lon: parseFloat(lon), kWp, Ey, totalKwh, mwh, b };
    el.innerHTML =
      '<div style="color:#000000;font-weight:700;margin-bottom:4px">&#9728; Rooftop PV (PVGIS)</div>' +
      '<div style="display:grid;grid-template-columns:1fr auto;gap:2px 8px;color:#000000">' +
      '<span>System size</span><span style="font-weight:600">' + kWp + ' kWp</span>' +
      '<span>Annual yield</span><span style="color:#16a34a;font-weight:700">' + mwh + ' MWh/yr</span>' +
      '<span>Specific yield</span><span style="font-weight:600">' + Math.round(Ey) + ' kWh/kWp</span>' +
      '<span>Usable roof</span><span style="font-weight:600">' + Math.round(b.footprint_m2 * 0.7) + ' m²</span>' +
      '</div>' +
      '<button onclick="savePVGIS()" style="margin-top:8px;width:100%;padding:4px 8px;font-size:10px;' +
      'border-radius:6px;border:1px solid rgba(245,158,11,0.5);background:rgba(245,158,11,0.12);' +
      'color:#92400e;cursor:pointer;font-family:inherit'>💾 Save PV result</button>' +
      '<div id="pvgis-save-status" style="font-size:10px;color:var(--muted);margin-top:3px"></div>';
  } catch(e) {
    el.innerHTML = '<span style="color:#f87171">PVGIS error: ' + e.message + '</span>';
  }
}

async function savePVGIS() {
  if (!lastPvgis) return;
  const { lat, lon, kWp, Ey, totalKwh, mwh, b } = lastPvgis;
  const statusEl = document.getElementById('pvgis-save-status');
  if (statusEl) statusEl.textContent = 'Saving…';
  try {
    await fetch('http://localhost:8000/api/pvgis-save', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        lat, lon,
        address: b.address || null,
        kWp,
        annual_kwh: Math.round(Ey * kWp),
        specific_kwh_kwp: Math.round(Ey),
        roof_area_m2: Math.round(b.footprint_m2 * 0.7),
        building_info: { year: b.year, use: b.use_cat, eclass: b.eclass },
      }),
    });
    if (statusEl) statusEl.textContent = '✓ Saved';
    const badge = document.getElementById('pvgis-saved-badge');
    badge.innerHTML = '&#128190; Saved: ' + mwh + ' MWh/yr · ' + kWp + ' kWp';
    badge.style.display = 'block';
  } catch(e) {
    if (statusEl) statusEl.textContent = 'Save failed: ' + e.message;
  }
}

document.getElementById('btn-inspect').addEventListener('click', () => {
  if (!selectedBuilding) return;
  facadeBuilding = selectedBuilding;
  document.getElementById('info-panel').style.display = 'none';
  document.getElementById('facade-panel').style.display = 'block';
  document.getElementById('wwr-panel').style.display = 'block';
  // Clear canvases
  for (const d of DIRS) {
    const ctx = document.getElementById('canvas-'+d).getContext('2d');
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0,0,200,150);
    ctx.fillStyle = '#475569'; ctx.font = '11px Inter';
    ctx.textAlign = 'center'; ctx.fillText('Click to capture', 100, 75);
  }
  // Fly to first facade
  flyToFacade('N');
  // Show heuristic WWR immediately
  showWWR(heuristicWWR(facadeBuilding), null, 'heuristic', null);
});

function getBuildingCenter(b) {
  const ring = b.coordinates[0];
  let lo = 0, la = 0;
  for (const [x, y] of ring) { lo += x; la += y; }
  return { lon: lo / ring.length, lat: la / ring.length };
}

function getBuildingRadius(b) {
  const ring = b.coordinates[0];
  const c = getBuildingCenter(b);
  let maxDeg = 0;
  for (const [x, y] of ring) {
    const d = Math.sqrt((x-c.lon)**2 + (y-c.lat)**2);
    if (d > maxDeg) maxDeg = d;
  }
  // Convert degrees to approx metres at this latitude
  return Math.max(15, maxDeg * 111320 * Math.cos(c.lat * Math.PI / 180));
}

function flyToFacade(dir) {
  if (!facadeBuilding) return;
  const c = getBuildingCenter(facadeBuilding);
  const r = getBuildingRadius(facadeBuilding);
  const dist = r * 3.5;
  const h = DIR_HEADINGS[dir] * Math.PI / 180;
  const offsetLon = Math.sin(h) * dist / (111320 * Math.cos(c.lat * Math.PI/180));
  const offsetLat = Math.cos(h) * dist / 111320;
  const bldH = Math.max(3, facadeBuilding.height || 6);
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(c.lon + offsetLon, c.lat + offsetLat, bldH * 0.6),
    orientation: {
      heading: Cesium.Math.toRadians(DIR_HEADINGS[dir] + 180),
      pitch:   Cesium.Math.toRadians(-5),
      roll: 0,
    },
    duration: 1.2,
  });
  // Highlight active thumb
  for (const d of DIRS) document.getElementById('thumb-'+d).classList.remove('active');
  document.getElementById('thumb-'+dir).classList.add('active');
}

// Capture facade
function captureToCanvas(dir) {
  flyToFacade(dir);
  setTimeout(() => {
    viewer.render();
    const srcCanvas = viewer.canvas;
    const dstCanvas = document.getElementById('canvas-'+dir);
    const ctx = dstCanvas.getContext('2d');
    ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height,
                  0, 0, dstCanvas.width, dstCanvas.height);
  }, 1400);
}

// Visual WWR from canvas pixel analysis
function analyseCanvasWWR(canvas) {
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let windowPx = 0, wallPx = 0;
  // Heuristic: dark-grey/reflective = window; warm/opaque = wall
  for (let i = 0; i < imgData.length; i += 4) {
    const r = imgData[i], g = imgData[i+1], b = imgData[i+2];
    const bright = (r + g + b) / 3;
    const sat = Math.max(r,g,b) - Math.min(r,g,b);
    if (bright < 90 && sat < 30) windowPx++;   // dark unsaturated = window/glass
    else if (bright > 40)        wallPx++;
  }
  const total = windowPx + wallPx;
  return total > 0 ? Math.round((windowPx / total) * 100) : null;
}

document.getElementById('btn-capture-all').addEventListener('click', async () => {
  document.getElementById('facade-sub').textContent = 'Capturing all 4 facades…';
  document.getElementById('wwr-ai-status').textContent = '';
  const capturedB64 = {};
  for (const dir of DIRS) {
    await new Promise(resolve => {
      flyToFacade(dir);
      setTimeout(() => {
        viewer.render();
        const src = viewer.canvas;
        const dst = document.getElementById('canvas-'+dir);
        const ctx = dst.getContext('2d');
        ctx.drawImage(src,0,0,src.width,src.height,0,0,dst.width,dst.height);
        // Convert to base64 JPEG for GPT-4 vision
        capturedB64[dir] = dst.toDataURL('image/jpeg', 0.85).split(',')[1];
        resolve();
      }, 1500);
    });
  }
  document.getElementById('facade-sub').textContent = 'Captured – sending to GPT-4 vision…';
  document.getElementById('wwr-ai-status').textContent = '⏳ Analysing with GPT-4 vision…';

  const hWWR = heuristicWWR(facadeBuilding);
  const aiWWRs = [];
  const aiNotes = [];

  for (const dir of DIRS) {
    try {
      const resp = await fetch('http://localhost:8000/api/estimate-wwr', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          image_base64: capturedB64[dir],
          direction: dir,
          building_info: {
            address: facadeBuilding.address,
            year: facadeBuilding.year,
            use: facadeBuilding.use_cat,
            eclass: facadeBuilding.eclass,
          },
        }),
      });
      const result = await resp.json();
      aiWWRs.push(result.wwr);
      aiNotes.push(dir + ': ' + result.wwr + '%' + (result.confidence ? ' (' + result.confidence + ')' : ''));
    } catch(e) {
      aiWWRs.push(hWWR);
      aiNotes.push(dir + ': fallback');
    }
  }

  const aiAvg = Math.round(aiWWRs.reduce((a,b)=>a+b,0) / aiWWRs.length);
  document.getElementById('facade-sub').textContent = 'Analysis complete';
  document.getElementById('wwr-ai-status').textContent = '';
  showWWR(aiAvg, aiWWRs, 'gpt4-vision', aiNotes);
});

// Thumb click → fly + capture
for (const dir of DIRS) {
  document.getElementById('thumb-'+dir).addEventListener('click', () => captureToCanvas(dir));
}

function showWWR(wwr, perFacade, source, notes) {
  document.getElementById('wwr-value').textContent = wwr;
  document.getElementById('wwr-bar').style.width = Math.min(100, wwr * 1.4) + '%';

  // Always show TABULA reference
  if (facadeBuilding) {
    const tWWR = heuristicWWR(facadeBuilding);
    const period = facadeBuilding.tabula_period || '–';
    document.getElementById('wwr-tabula-val').textContent = tWWR;
    document.getElementById('wwr-tabula-period').textContent = period;
    document.getElementById('wwr-tabula-row').style.display = 'block';
  }

  let breakdown = '';
  if (source === 'heuristic') {
    breakdown = 'Source: TABULA heuristic only (capture facades for AI estimate)';
  } else if (source === 'gpt4-vision') {
    lastWWR = { wwr, perFacade, notes, source };
    breakdown = '&#129302; GPT-4 vision per facade:<br>';
    if (notes) breakdown += notes.join(' &nbsp;·&nbsp; ');
  } else {
    breakdown = 'Source: ' + source;
    if (perFacade) breakdown += '<br>Per facade: ' + DIRS.map((d,i) => d+':'+perFacade[i]+'%').join(' ');
  }
  document.getElementById('wwr-breakdown').innerHTML = breakdown;
  const aiStatus = document.getElementById('wwr-ai-status');
  if (source === 'gpt4-vision') {
    aiStatus.innerHTML =
      '<button onclick="saveWWR()" style="margin-top:4px;width:100%;padding:4px 8px;font-size:10px;' +
      'border-radius:6px;border:1px solid rgba(139,92,246,0.5);background:rgba(139,92,246,0.1);' +
      'color:#6d28d9;cursor:pointer;font-family:inherit'>💾 Save WWR result</button>' +
      '<div id="wwr-save-status" style="font-size:10px;color:var(--muted);margin-top:3px"></div>';
  } else {
    aiStatus.innerHTML = '';
  }
}

async function saveWWR() {
  if (!lastWWR || !facadeBuilding) return;
  const statusEl = document.getElementById('wwr-save-status');
  if (statusEl) statusEl.textContent = 'Saving…';
  const ring = facadeBuilding.coordinates && facadeBuilding.coordinates[0];
  if (!ring) return;
  const lat = ring.reduce((s,c) => s+c[1], 0) / ring.length;
  const lon = ring.reduce((s,c) => s+c[0], 0) / ring.length;
  try {
    await fetch('http://localhost:8000/api/wwr-save', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        lat, lon,
        address: facadeBuilding.address || null,
        average_wwr: lastWWR.wwr,
        per_facade: lastWWR.perFacade || [],
        directions: DIRS,
        source: lastWWR.source,
        building_info: { year: facadeBuilding.year, use: facadeBuilding.use_cat, eclass: facadeBuilding.eclass },
      }),
    });
    if (statusEl) statusEl.textContent = '✓ Saved';
    const badge = document.getElementById('inspect-saved-badge');
    badge.innerHTML = '&#128190; Saved WWR: ' + lastWWR.wwr + '% (AI)';
    badge.style.display = 'block';
  } catch(e) {
    if (statusEl) statusEl.textContent = 'Save failed: ' + e.message;
  }
}

document.getElementById('btn-exit-inspect').addEventListener('click', () => {
  document.getElementById('facade-panel').style.display = 'none';
  document.getElementById('wwr-panel').style.display = 'none';
  facadeBuilding = null;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(11.962039, 57.703044, 1800),
    orientation: { heading:0, pitch:Cesium.Math.toRadians(-50), roll:0 },
    duration: 1.5,
  });
});

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
    destination: Cesium.Cartesian3.fromDegrees(11.962039, 57.703044, 800),
    orientation: { heading:0, pitch:Cesium.Math.toRadians(-40), roll:0 },
    duration: 1.5,
  });
});

// ─────────────────────────────────────────────────────────────────
// Address search (Nominatim)
// ─────────────────────────────────────────────────────────────────
const searchInput   = document.getElementById('search-input');
const searchBtn     = document.getElementById('search-btn');
const searchResults = document.getElementById('search-results');

async function geocodeAddress() {
  const q = searchInput.value.trim();
  if (!q) return;
  searchBtn.textContent = '…';
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=6&q=' +
                encodeURIComponent(q + ' Gothenburg');
    const data = await (await fetch(url)).json();
    if (!data.length) { searchResults.innerHTML='<div class="result-item">No results</div>'; searchResults.style.display='block'; return; }
    searchResults.innerHTML = data.map((r,i) =>
      '<div class="result-item" data-idx="'+i+'">'+r.display_name+'</div>'
    ).join('');
    searchResults.style.display = 'block';
    searchResults._data = data;
  } catch(e) {
    searchResults.innerHTML = '<div class="result-item">Search failed</div>';
    searchResults.style.display = 'block';
  } finally {
    searchBtn.innerHTML = '&#128269; Search';
  }
}

searchBtn.addEventListener('click', geocodeAddress);
searchInput.addEventListener('keydown', e => { if (e.key==='Enter') geocodeAddress(); });
searchResults.addEventListener('click', e => {
  const item = e.target.closest('.result-item');
  if (!item) return;
  const r = searchResults._data[parseInt(item.dataset.idx)];
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(parseFloat(r.lon), parseFloat(r.lat), 300),
    orientation: { heading:0, pitch:Cesium.Math.toRadians(-45), roll:0 },
    duration: 1.5,
  });
  searchResults.style.display = 'none';
});
document.addEventListener('click', e => {
  if (!document.getElementById('search-wrap').contains(e.target))
    searchResults.style.display = 'none';
});
