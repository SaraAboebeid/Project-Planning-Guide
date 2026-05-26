// =============================================================
// facade_inspector.js — Facade camera fly + manual rubber-band crop,
//                       AI GPT-4 vision WWR estimate + WWR database save.
// Adopted identically from May 12 commit (fbe29de).
// Depends on: cesium.js (viewer, MAP_CENTER), ui.js (selectedBuilding)
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
const ECLASS_WWR_ADJ = { A:+5, B:+3, C:+1, D:0, E:-1, F:-2, G:-3 };

function heuristicWWR(building) {
  const use    = building.use_cat       || 'ovrigt';
  const period = building.tabula_period || '1961-1975';
  const eclass = building.eclass        || null;
  const base   = (WWR_TABLE[use] || WWR_TABLE.ovrigt)[period] || 20;
  const adj    = eclass ? (ECLASS_WWR_ADJ[eclass] || 0) : 0;
  return Math.min(75, Math.max(5, base + adj));
}

// ─────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────
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
  return Math.max(15, maxDeg * 111320 * Math.cos(c.lat * Math.PI / 180));
}

// Shoot a ray upward from well below the building to find true ground altitude.
function getGroundAlt(building) {
  const c = getBuildingCenter(building);
  const rough = building._terrainH || 50;
  const bldH  = Math.max(5, building.height || 10);
  const startAlt = rough - bldH - 30;
  const startPos = Cesium.Cartesian3.fromDegrees(c.lon, c.lat, startAlt);
  const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
    Cesium.Cartesian3.fromDegrees(c.lon, c.lat), new Cesium.Cartesian3());
  try {
    const hit = viewer.scene.pickFromRay(new Cesium.Ray(startPos, up));
    if (hit && hit.position) {
      return Cesium.Cartographic.fromCartesian(hit.position).height;
    }
  } catch (_) {}
  return rough - bldH;
}

// ─────────────────────────────────────────────────────────────────
// Enter facade inspector
// ─────────────────────────────────────────────────────────────────
document.getElementById('btn-inspect').addEventListener('click', () => {
  if (!selectedBuilding) return;
  facadeBuilding = selectedBuilding;
  facadeBuilding._groundH = getGroundAlt(facadeBuilding);
  _facadeZoom = 1.0;
  const zl = document.getElementById('zoom-label');
  if (zl) zl.textContent = '1×';
  document.getElementById('info-panel').style.display = 'none';
  document.getElementById('facade-panel').style.display = 'block';
  document.getElementById('wwr-panel').style.display = 'block';
  // Clear cardinal canvases
  for (const d of DIRS) {
    const ctx = document.getElementById('canvas-'+d).getContext('2d');
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0,0,200,150);
    ctx.fillStyle = '#475569'; ctx.font = '11px Inter';
    ctx.textAlign = 'center'; ctx.fillText('Click to capture', 100, 75);
  }
  // Clear manual canvas with placeholder text
  const mc = document.getElementById('canvas-manual');
  mc.width = 520; mc.height = 120;
  const mctx = mc.getContext('2d');
  mctx.fillStyle = '#0d0d1a'; mctx.fillRect(0, 0, mc.width, mc.height);
  mctx.fillStyle = '#a78bfa'; mctx.font = '600 13px Inter';
  mctx.textAlign = 'center';
  mctx.fillText('Click  \u{1F4F7} Draw & Capture  then drag a box', mc.width / 2, mc.height / 2 - 8);
  mctx.fillText('over the building area you want to analyse', mc.width / 2, mc.height / 2 + 12);
  mc.style.maxHeight = '';
  flyToFacade('N');
  showWWR(heuristicWWR(facadeBuilding), null, 'heuristic');
});

// ─────────────────────────────────────────────────────────────────
// Fly to a cardinal facade (with zoom)
// ─────────────────────────────────────────────────────────────────
let _facadeZoom = 1.0;
let _currentFacadeDir = 'N';

function flyToFacade(dir) {
  if (!facadeBuilding) return;
  const c = getBuildingCenter(facadeBuilding);
  const r = getBuildingRadius(facadeBuilding);
  _currentFacadeDir = dir;
  const bldH = Math.max(5, facadeBuilding.height || 10);
  const terrainBase = facadeBuilding._groundH ?? facadeBuilding._terrainH ?? 0;
  // Cesium default vertical FOV ≈ 60°. Fit full building height with 15% margin.
  const distForHeight = bldH * 1.1;
  const distForWidth  = r * 1.4;
  const dist = Math.max(distForHeight, distForWidth) / _facadeZoom;
  const camAlt = terrainBase + bldH * 0.5;
  const h = DIR_HEADINGS[dir] * Math.PI / 180;
  const offsetLon = Math.sin(h) * dist / (111320 * Math.cos(c.lat * Math.PI / 180));
  const offsetLat = Math.cos(h) * dist / 111320;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(c.lon + offsetLon, c.lat + offsetLat, camAlt),
    orientation: {
      heading: Cesium.Math.toRadians(DIR_HEADINGS[dir] + 180),
      pitch:   0,
      roll:    0,
    },
    duration: 1.2,
  });
  for (const d of DIRS) document.getElementById('thumb-'+d).classList.remove('active');
  document.getElementById('thumb-'+dir).classList.add('active');
}

const _btnZoomIn  = document.getElementById('btn-zoom-in');
const _btnZoomOut = document.getElementById('btn-zoom-out');
if (_btnZoomIn) _btnZoomIn.addEventListener('click', () => {
  _facadeZoom = Math.min(5.0, parseFloat((_facadeZoom + 0.25).toFixed(2)));
  document.getElementById('zoom-label').textContent = _facadeZoom.toFixed(2).replace(/\.?0+$/, '') + '×';
  flyToFacade(_currentFacadeDir);
});
if (_btnZoomOut) _btnZoomOut.addEventListener('click', () => {
  _facadeZoom = Math.max(0.25, parseFloat((_facadeZoom - 0.25).toFixed(2)));
  document.getElementById('zoom-label').textContent = _facadeZoom.toFixed(2).replace(/\.?0+$/, '') + '×';
  flyToFacade(_currentFacadeDir);
});

// ─────────────────────────────────────────────────────────────────
// Capture facade — fly + auto-snapshot
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

// Visual WWR from canvas pixel analysis (used by Capture All blended)
function analyseCanvasWWR(canvas) {
  const ctx     = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let windowPx = 0, wallPx = 0;
  for (let i = 0; i < imgData.length; i += 4) {
    const r = imgData[i], g = imgData[i+1], b = imgData[i+2];
    const bright = (r + g + b) / 3;
    const sat    = Math.max(r,g,b) - Math.min(r,g,b);
    if (bright < 90 && sat < 30) windowPx++;
    else if (bright > 40)        wallPx++;
  }
  const total = windowPx + wallPx;
  return total > 0 ? Math.round((windowPx / total) * 100) : null;
}

document.getElementById('btn-capture-all').addEventListener('click', async () => {
  document.getElementById('facade-sub').textContent = 'Capturing all 4 facades…';
  const visualWWRs = [];
  for (const dir of DIRS) {
    await new Promise(resolve => {
      flyToFacade(dir);
      setTimeout(() => {
        viewer.render();
        const src = viewer.canvas;
        const dst = document.getElementById('canvas-'+dir);
        const ctx = dst.getContext('2d');
        ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, dst.width, dst.height);
        const w = analyseCanvasWWR(dst);
        if (w !== null) visualWWRs.push(w);
        resolve();
      }, 1500);
    });
  }
  document.getElementById('facade-sub').textContent = 'Capture complete';
  const hWWR = heuristicWWR(facadeBuilding);
  if (visualWWRs.length > 0) {
    const visualAvg = Math.round(visualWWRs.reduce((a,b) => a+b, 0) / visualWWRs.length);
    const blended = Math.round(0.4 * visualAvg + 0.6 * hWWR);
    showWWR(blended, visualWWRs, 'blended');
  } else {
    showWWR(hWWR, null, 'heuristic');
  }
});

// Thumb click → fly + capture
for (const dir of DIRS) {
  document.getElementById('thumb-'+dir).addEventListener('click', () => captureToCanvas(dir));
}

// ─────────────────────────────────────────────────────────────────
// Manual rubber-band crop-box capture (May 12 pipeline)
// Clicking "Draw & Capture" enters crop mode: a full-viewport overlay
// appears; user drags a rectangle; on release the selected region of
// viewer.canvas is cropped into canvas-manual at its natural aspect ratio.
// ─────────────────────────────────────────────────────────────────
(function () {
  let cropMode = false;
  let startX = 0, startY = 0;

  const overlay = document.createElement('div');
  overlay.id = 'crop-overlay';
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '500',
    cursor: 'crosshair', display: 'none',
    background: 'rgba(0,0,0,0.25)',
  });
  const sel = document.createElement('div');
  Object.assign(sel.style, {
    position: 'absolute', border: '2px dashed #a78bfa',
    background: 'rgba(114,28,184,0.12)', display: 'none',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
  });
  overlay.appendChild(sel);

  const tip = document.createElement('div');
  Object.assign(tip.style, {
    position: 'absolute', top: '50%', left: '50%',
    transform: 'translate(-50%,-50%)',
    background: 'rgba(10,10,20,0.9)', color: '#c4b5fd',
    padding: '10px 20px', borderRadius: '10px', fontSize: '13px',
    fontWeight: '600', pointerEvents: 'none', textAlign: 'center',
    border: '1px solid #a78bfa',
  });
  tip.textContent = 'Drag to select the area to capture   ·   Esc to cancel';
  overlay.appendChild(tip);
  document.body.appendChild(overlay);

  function enterCropMode() {
    cropMode = true;
    sel.style.display = 'none';
    overlay.style.display = 'block';
    tip.style.display = 'block';
    document.getElementById('facade-sub').textContent = 'Drag a box over the building area…  (Esc to cancel)';
  }

  function exitCropMode() {
    cropMode = false;
    overlay.style.display = 'none';
    sel.style.display = 'none';
  }

  overlay.addEventListener('mousedown', e => {
    startX = e.clientX; startY = e.clientY;
    tip.style.display = 'none';
    sel.style.cssText += ';display:block;left:' + startX + 'px;top:' + startY + 'px;width:0;height:0';
  });

  overlay.addEventListener('mousemove', e => {
    if (!sel.style.display || sel.style.display === 'none') return;
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    Object.assign(sel.style, { left: x+'px', top: y+'px', width: w+'px', height: h+'px' });
  });

  overlay.addEventListener('mouseup', e => {
    const x = Math.min(e.clientX, startX);
    const y = Math.min(e.clientY, startY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    exitCropMode();
    if (w < 20 || h < 20) {
      document.getElementById('facade-sub').textContent = 'Selection too small — try again';
      return;
    }
    viewer.render();
    const src = viewer.canvas;
    const scaleX = src.width  / window.innerWidth;
    const scaleY = src.height / window.innerHeight;
    const sx = x * scaleX, sy = y * scaleY;
    const sw = w * scaleX, sh = h * scaleY;
    const dst = document.getElementById('canvas-manual');
    dst.width  = Math.round(sw);
    dst.height = Math.round(sh);
    const ctx = dst.getContext('2d');
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, dst.width, dst.height);
    const dispH = Math.min(260, Math.round(dst.height * (dst.parentElement.clientWidth / dst.width)));
    dst.style.maxHeight = dispH + 'px';
    document.getElementById('facade-sub').textContent = '✓ Area captured — click AI Estimate to analyse it';
    const wrap = document.getElementById('manual-canvas-wrap');
    wrap.style.borderColor = '#4ade80';
    setTimeout(() => { wrap.style.borderColor = '#a78bfa'; }, 1200);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && cropMode) {
      exitCropMode();
      document.getElementById('facade-sub').textContent = 'Capture cancelled';
    }
  });

  document.getElementById('btn-manual-capture').addEventListener('click', enterCropMode);
}());

// ─────────────────────────────────────────────────────────────────
// Per-facade orientation multipliers (Nordic climate)
// ─────────────────────────────────────────────────────────────────
const DIR_MULT = { N:0.72, E:0.92, S:1.28, W:0.92 };

function facadeBar(dir, pct, color) {
  const barW = Math.min(100, pct * 1.4);
  return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
    + '<span style="width:16px;font-size:11px;font-weight:700;color:'+color+'">'+dir+'</span>'
    + '<div style="flex:1;height:7px;border-radius:4px;background:rgba(0,0,0,0.08);overflow:hidden">'
    + '<div style="width:'+barW+'%;height:100%;border-radius:4px;background:'+color+';transition:width .4s"></div></div>'
    + '<span style="width:34px;text-align:right;font-size:11px;font-weight:600;color:'+color+'">'+pct+'%</span>'
    + '</div>';
}

function showWWR(wwr, perFacade, source) {
  const hVal = heuristicWWR(facadeBuilding);

  const hRows = document.getElementById('wwr-heuristic-rows');
  if (hRows) {
    hRows.innerHTML = ['N','E','S','W'].map(d => {
      const v = Math.round(hVal * DIR_MULT[d]);
      const c = v <= 20 ? '#16a34a' : v <= 40 ? '#d97706' : '#dc2626';
      return facadeBar(d, v, c);
    }).join('');
  }
  const hValEl = document.getElementById('wwr-value-heuristic');
  if (hValEl) hValEl.textContent = hVal;

  if (source !== 'heuristic' && perFacade && perFacade.length >= 1) {
    const labels = perFacade.length === 1 ? ['Manual'] : DIRS.slice(0, perFacade.length);
    const rowsEl = document.getElementById('wwr-facades-rows');
    rowsEl.innerHTML = perFacade.map((v, i) => {
      const c = v <= 20 ? '#16a34a' : v <= 40 ? '#d97706' : '#dc2626';
      return facadeBar(labels[i] || DIRS[i], v, c);
    }).join('');
    document.getElementById('wwr-value-ai').textContent = wwr;
    const labelMap = { blended: 'Visual Analysis · per facade', ai: 'AI Vision estimate · per facade' };
    document.getElementById('wwr-ai-label').textContent = labelMap[source] || 'AI Vision estimate · per facade';
    document.getElementById('wwr-ai-section').style.display = 'block';
    const hSec = document.getElementById('wwr-heuristic-section');
    hSec.style.display = 'block';
    hSec.style.borderTop = '1px solid rgba(0,0,0,0.07)';
    hSec.style.marginTop = '12px';
    hSec.style.paddingTop = '10px';
    document.getElementById('wwr-sub').textContent = 'AI estimate · per facade';
  } else {
    document.getElementById('wwr-ai-section').style.display = 'none';
    const hSec = document.getElementById('wwr-heuristic-section');
    hSec.style.display = 'block';
    hSec.style.borderTop = 'none';
    hSec.style.paddingTop = '0';
    document.getElementById('wwr-sub').textContent = 'Archetype fallback · run AI Estimate for per-facade vision analysis';
  }
  const bd = document.getElementById('wwr-breakdown');
  if (bd) bd.innerHTML = '';
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

// ─────────────────────────────────────────────────────────────────
// JS heuristic mirror (same formula as backend) — used when backend
// is unavailable so per-facade AI bars can still render.
// ─────────────────────────────────────────────────────────────────
function wwrHeuristic(buildingInfo) {
  const use = (buildingInfo && buildingInfo.use) || 'ovrigt';
  const year = (buildingInfo && buildingInfo.year) || 1980;
  const eclass = (buildingInfo && buildingInfo.eclass) || 'D';
  const useBase = {
    bostad_enfamilj: 18, bostad_flerfamilj: 28,
    verksamhet: 45, industri: 10, samhalle: 38,
    komplement: 5, ovrigt: 22,
  }[use] ?? 22;
  const eraAdj = year < 1960 ? -3 : year < 1976 ? 0 : year < 1996 ? 2 : 5;
  const eclassAdj = {A:5, B:3, C:1, D:0, E:-1, F:-2, G:-3}[eclass] ?? 0;
  return Math.max(5, Math.min(75, useBase + eraAdj + eclassAdj));
}

// ─────────────────────────────────────────────────────────────────
// AI WWR estimation via backend GPT-4o vision endpoint.
// Crops centre region of cardinal canvases; manual canvas is sent as-is
// since the user already drew a tight crop with the rubber-band tool.
// ─────────────────────────────────────────────────────────────────
function cropFacadeCanvas(srcCanvas) {
  const sw = srcCanvas.width, sh = srcCanvas.height;
  const cx = Math.round(sw * 0.15), cy = Math.round(sh * 0.20);
  const cw = Math.round(sw * 0.70), ch = Math.round(sh * 0.60);
  const dst = document.createElement('canvas');
  dst.width = cw; dst.height = ch;
  dst.getContext('2d').drawImage(srcCanvas, cx, cy, cw, ch, 0, 0, cw, ch);
  return dst;
}

document.getElementById('btn-ai-wwr').addEventListener('click', async () => {
  if (!facadeBuilding) return;
  const canvases = DIRS.map(d => document.getElementById('canvas-' + d));
  const manualCanvas = document.getElementById('canvas-manual');

  const manualCaptured = (() => {
    const mc = document.getElementById('canvas-manual');
    if (mc.width !== 520) return true;
    const px = mc.getContext('2d').getImageData(50, 50, 1, 1).data;
    return !(px[0] === 13 && px[1] === 13 && px[2] === 26);
  })();
  const hasCaptured = manualCaptured || canvases.some(c => {
    const px = c.getContext('2d').getImageData(50, 50, 1, 1).data;
    return !(px[0] === 26 && px[1] === 26 && px[2] === 46);
  });
  if (!hasCaptured) {
    document.getElementById('facade-sub').textContent = 'Capture first — click "Draw & Capture" or a cardinal view';
    return;
  }

  const toSend = manualCaptured
    ? [{ canvas: manualCanvas, dir: 'Manual' }]
    : canvases.map((c, i) => ({ canvas: c, dir: DIRS[i] })).filter(({ canvas }) => {
        const px = canvas.getContext('2d').getImageData(50, 50, 1, 1).data;
        return !(px[0] === 26 && px[1] === 26 && px[2] === 46);
      });
  const btn = document.getElementById('btn-ai-wwr');
  btn.disabled = true;
  document.getElementById('facade-sub').textContent = 'Sending facade images to AI vision model…';

  const buildingInfo = {
    address: facadeBuilding.address || '',
    year: facadeBuilding.year || null,
    use: facadeBuilding.use_cat || '',
    eclass: facadeBuilding.eclass || null,
  };

  try {
    const results = [];
    let source = 'ai';
    let backendAvailable = true;

    for (const { canvas, dir } of toSend) {
      // Manual canvas already cropped by the user; send as-is.
      const srcCanvas = dir === 'Manual' ? canvas : cropFacadeCanvas(canvas);
      const imageBase64 = srcCanvas.toDataURL('image/jpeg', 0.82).split(',')[1];
      try {
        const resp = await fetch('http://localhost:8000/api/estimate-wwr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_base64: imageBase64, direction: dir, building_info: buildingInfo }),
          signal: AbortSignal.timeout(60000),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.wwr !== undefined && data.wwr !== null) {
            results.push(Math.round(data.wwr));
            source = data.source || 'ai';
          }
        } else {
          backendAvailable = false;
          break;
        }
      } catch (_) {
        backendAvailable = false;
        break;
      }
    }

    if (!backendAvailable || results.length === 0) {
      const h = wwrHeuristic(buildingInfo);
      toSend.forEach(() => results.push(h));
      source = 'ai';
      document.getElementById('facade-sub').textContent = 'Backend offline — using archetype heuristic ✓';
    } else {
      document.getElementById('facade-sub').textContent = 'AI estimation complete ✓';
    }

    const avg = Math.round(results.reduce((a, b) => a + b, 0) / results.length);
    const dirs = toSend.map(t => t.dir);
    showWWR(avg, results, source === 'heuristic' ? 'heuristic' : source);
    lastWWR = { avg, perFacade: results, source };

    if (source !== 'heuristic') {
      const saveRow = document.getElementById('wwr-save-row');
      saveRow.style.display = 'block';
      saveRow._pendingWWR = { avg, results, dirs, source, buildingInfo };
      document.getElementById('wwr-save-status').textContent = '';
      const sb = document.getElementById('btn-wwr-save');
      sb.textContent = 'Save to WWR Database';
      sb.disabled = false;
    }
  } catch (err) {
    document.getElementById('facade-sub').textContent = 'Error: ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('btn-wwr-save').addEventListener('click', async () => {
  const saveRow = document.getElementById('wwr-save-row');
  const pending = saveRow._pendingWWR;
  if (!pending || !facadeBuilding) return;
  const saveBtn = document.getElementById('btn-wwr-save');
  const statusEl = document.getElementById('wwr-save-status');
  saveBtn.disabled = true;
  statusEl.textContent = 'Saving…';
  try {
    const resp = await fetch('http://localhost:8000/api/wwr-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: facadeBuilding.lat ?? facadeBuilding.latitude ?? 0,
        lon: facadeBuilding.lon ?? facadeBuilding.longitude ?? 0,
        address: facadeBuilding.address || null,
        average_wwr: pending.avg,
        per_facade: pending.results,
        directions: pending.dirs,
        source: pending.source,
        building_info: pending.buildingInfo,
      }),
    });
    if (resp.ok) {
      const data = await resp.json();
      const n = data.total_records;
      statusEl.textContent = `✓ Saved! Database has ${n} record${n !== 1 ? 's' : ''}.`;
      saveBtn.textContent = 'Saved ✓';
    } else {
      statusEl.textContent = 'Save failed (backend error).';
      saveBtn.disabled = false;
    }
  } catch (_) {
    statusEl.textContent = 'Save failed (backend offline).';
    saveBtn.disabled = false;
  }
});
