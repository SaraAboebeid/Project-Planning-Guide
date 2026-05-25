// =============================================================
// facade_inspector.js — Facade camera orbit, canvas capture,
//                       WWR heuristic + GPT-4 vision, save
// Depends on: cesium.js (viewer), ui.js (selectedBuilding)
// =============================================================

let facadeBuilding = null;
let lastPvgis = null;   // set by pvgis.js; read by ui.js showInfoPanel
let lastWWR   = null;   // set here; used by saveWWR

const DIRS         = ['N','E','S','W'];
const DIR_HEADINGS = { N:0, E:90, S:180, W:270 };

// ─────────────────────────────────────────────────────────────────
// WWR heuristic — TABULA archetypes + literature
// ─────────────────────────────────────────────────────────────────
const WWR_TABLE = {
  bostad_enfamilj:   { '...1960':15, '1961-1975':17, '1976-1985':19, '1986-1995':21, '1996-2005':23, 'post-2005':26 },
  bostad_flerfamilj: { '...1960':22, '1961-1975':28, '1976-1985':26, '1986-1995':30, '1996-2005':33, 'post-2005':38 },
  verksamhet:        { '...1960':30, '1961-1975':40, '1976-1985':45, '1986-1995':50, '1996-2005':55, 'post-2005':60 },
  industri:          { '...1960': 8, '1961-1975':10, '1976-1985':12, '1986-1995':12, '1996-2005':14, 'post-2005':15 },
  samhalle:          { '...1960':25, '1961-1975':35, '1976-1985':38, '1986-1995':40, '1996-2005':45, 'post-2005':50 },
  komplement:        { '...1960': 5, '1961-1975': 5, '1976-1985': 5, '1986-1995': 8, '1996-2005':10, 'post-2005':10 },
  ovrigt:            { '...1960':20, '1961-1975':22, '1976-1985':24, '1986-1995':25, '1996-2005':28, 'post-2005':30 },
};

// Energy class modifier: A=efficient+glazed, G=poorly insulated/old
const ECLASS_WWR_ADJ = { A:+5, B:+3, C:+1, D:0, E:-1, F:-2, G:-3 };

function heuristicWWR(building) {
  const use    = building.use_cat      || 'ovrigt';
  const period = building.tabula_period || '1961-1975';
  const eclass = building.eclass        || null;
  const base   = (WWR_TABLE[use] || WWR_TABLE.ovrigt)[period] || 20;
  const adj    = eclass ? (ECLASS_WWR_ADJ[eclass] || 0) : 0;
  return Math.min(75, Math.max(5, base + adj));
}

// ─────────────────────────────────────────────────────────────────
// Facade inspector — enter
// ─────────────────────────────────────────────────────────────────
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
  // Fly to first facade and show heuristic WWR immediately
  flyToFacade('N');
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
  const c    = getBuildingCenter(b);
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
  const c    = getBuildingCenter(facadeBuilding);
  const r    = getBuildingRadius(facadeBuilding);
  const dist = r * 3.5;
  const h    = DIR_HEADINGS[dir] * Math.PI / 180;
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

// ─────────────────────────────────────────────────────────────────
// Capture facade
// ─────────────────────────────────────────────────────────────────
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
  const ctx     = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let windowPx = 0, wallPx = 0;
  // Heuristic: dark-grey/reflective = window; warm/opaque = wall
  for (let i = 0; i < imgData.length; i += 4) {
    const r = imgData[i], g = imgData[i+1], b = imgData[i+2];
    const bright = (r + g + b) / 3;
    const sat    = Math.max(r,g,b) - Math.min(r,g,b);
    if (bright < 90 && sat < 30) windowPx++;   // dark unsaturated = window/glass
    else if (bright > 40)        wallPx++;
  }
  const total = windowPx + wallPx;
  return total > 0 ? Math.round((windowPx / total) * 100) : null;
}

// ─────────────────────────────────────────────────────────────────
// Capture all facades + GPT-4 vision
// ─────────────────────────────────────────────────────────────────
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

  const hWWR   = heuristicWWR(facadeBuilding);
  const aiWWRs = [];
  const aiNotes = [];

  let _backendDown = false;
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
            year:    facadeBuilding.year,
            use:     facadeBuilding.use_cat,
            eclass:  facadeBuilding.eclass,
          },
        }),
      });
      const result = await resp.json();
      aiWWRs.push(result.wwr);
      aiNotes.push(dir + ': ' + result.wwr + '%' + (result.confidence ? ' (' + result.confidence + ')' : ''));
    } catch(e) {
      const _netErr = (e instanceof TypeError) || (e.message || '').toLowerCase().includes('fetch');
      if (_netErr) _backendDown = true;
      aiWWRs.push(hWWR);
      aiNotes.push(dir + ': fallback');
    }
  }

  document.getElementById('facade-sub').textContent = 'Analysis complete';
  if (_backendDown) {
    document.getElementById('wwr-ai-status').textContent =
      '\u26a0 Backend not running \u2014 restart with: python launch.py';
    showWWR(hWWR, null, 'heuristic', null);
  } else {
    const aiAvg = Math.round(aiWWRs.reduce((a,b)=>a+b,0) / aiWWRs.length);
    document.getElementById('wwr-ai-status').textContent = '';
    showWWR(aiAvg, aiWWRs, 'gpt4-vision', aiNotes);
  }
});

// Thumb click → fly + capture
for (const dir of DIRS) {
  document.getElementById('thumb-'+dir).addEventListener('click', () => captureToCanvas(dir));
}

// ─────────────────────────────────────────────────────────────────
// Show + save WWR results
// NOTE: All innerHTML strings use double-quotes (") for HTML attribute values.
// ─────────────────────────────────────────────────────────────────
function showWWR(wwr, perFacade, source, notes) {
  document.getElementById('wwr-value').textContent = wwr;
  document.getElementById('wwr-bar').style.width = Math.min(100, wwr * 1.4) + '%';

  // Always show TABULA reference
  if (facadeBuilding) {
    const tWWR   = heuristicWWR(facadeBuilding);
    const period = facadeBuilding.tabula_period || '–';
    document.getElementById('wwr-tabula-val').textContent    = tWWR;
    document.getElementById('wwr-tabula-period').textContent = period;
    document.getElementById('wwr-tabula-row').style.display  = 'block';
  }

  let breakdown = '';
  if (source === 'heuristic') {
    breakdown = 'Source: TABULA heuristic only (capture facades for AI estimate)';
  } else if (source === 'gpt4-vision') {
    lastWWR   = { wwr, perFacade, notes, source };
    breakdown = '&#129302; GPT-4 vision per facade:<br>';
    if (notes) breakdown += notes.join(' &nbsp;\xb7&nbsp; ');
  } else {
    breakdown = 'Source: ' + source;
    if (perFacade) breakdown += '<br>Per facade: ' + DIRS.map((d,i) => d+':'+perFacade[i]+'%').join(' ');
  }
  document.getElementById('wwr-breakdown').innerHTML = breakdown;

  // Show save button only for AI results
  const aiStatus = document.getElementById('wwr-ai-status');
  if (source === 'gpt4-vision') {
    aiStatus.innerHTML =
      '<button onclick="saveWWR()" style="margin-top:4px;width:100%;padding:4px 8px;font-size:10px;' +
      'border-radius:6px;border:1px solid rgba(139,92,246,0.5);background:rgba(139,92,246,0.1);' +
      'color:#6d28d9;cursor:pointer;font-family:inherit">&#128190; Save WWR result</button>' +
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
        address:     facadeBuilding.address || null,
        average_wwr: lastWWR.wwr,
        per_facade:  lastWWR.perFacade || [],
        directions:  DIRS,
        source:      lastWWR.source,
        building_info: { year: facadeBuilding.year, use: facadeBuilding.use_cat, eclass: facadeBuilding.eclass },
      }),
    });
    if (statusEl) statusEl.textContent = '\u2713 Saved';
    // Update sidebar badge
    const badge = document.getElementById('inspect-saved-badge');
    badge.innerHTML = '&#128190; Saved WWR: ' + lastWWR.wwr + '% (AI)';
    badge.style.display = 'block';
  } catch(e) {
    if (statusEl) statusEl.textContent = 'Save failed: ' + e.message;
  }
}

// ─────────────────────────────────────────────────────────────────
// Exit inspector — fly back to overview
// ─────────────────────────────────────────────────────────────────
document.getElementById('btn-exit-inspect').addEventListener('click', () => {
  document.getElementById('facade-panel').style.display = 'none';
  document.getElementById('wwr-panel').style.display    = 'none';
  facadeBuilding = null;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(MAP_CENTER.lon, MAP_CENTER.lat, 1800),
    orientation: { heading:0, pitch:Cesium.Math.toRadians(-50), roll:0 },
    duration: 1.5,
  });
});
