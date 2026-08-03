// =============================================================
// facade_comparison.js — Inspect facades within a building or across buildings
//                        for renovation prioritization
// Depends on: cesium.js (viewer, buildingDS), ui.js (selectedBuilding)
// =============================================================

// State management
let comparisonMode = 'single';  // 'single' or 'multiple'
let comparisonBuildings = [];   // Array of buildings for comparison (max 4)
let comparisonData = {};        // Stores facade data for each building

// Facade quality scoring factors
const QUALITY_FACTORS = {
  wwr: { weight: 0.3, label: 'Window-to-Wall Ratio' },
  age: { weight: 0.25, label: 'Building Age' },
  condition: { weight: 0.25, label: 'Visual Condition' },
  energy: { weight: 0.2, label: 'Energy Performance' }
};

// ─────────────────────────────────────────────────────────────────
// Enter facade comparison mode
// ─────────────────────────────────────────────────────────────────
document.getElementById('btn-compare')?.addEventListener('click', () => {
  if (!selectedBuilding && comparisonBuildings.length === 0) {
    alert('Please select a building first');
    return;
  }
  
  // Initialize with currently selected building if any
  if (selectedBuilding && !comparisonBuildings.find(b => b === selectedBuilding)) {
    comparisonBuildings = [selectedBuilding];
  }
  
  document.getElementById('info-panel').style.display = 'none';
  document.getElementById('comparison-panel').style.display = 'block';
  
  updateComparisonUI();
});

// ─────────────────────────────────────────────────────────────────
// Toggle between single building and multiple buildings mode
// ─────────────────────────────────────────────────────────────────
document.getElementById('btn-mode-single')?.addEventListener('click', () => {
  comparisonMode = 'single';
  document.getElementById('btn-mode-single').classList.add('active');
  document.getElementById('btn-mode-multiple').classList.remove('active');
  
  // Keep only first building in single mode
  if (comparisonBuildings.length > 1) {
    comparisonBuildings = [comparisonBuildings[0]];
  }
  
  updateComparisonUI();
});

document.getElementById('btn-mode-multiple')?.addEventListener('click', () => {
  comparisonMode = 'multiple';
  document.getElementById('btn-mode-multiple').classList.add('active');
  document.getElementById('btn-mode-single').classList.remove('active');
  updateComparisonUI();
});

// ─────────────────────────────────────────────────────────────────
// Add building to comparison (multiple buildings mode)
// ─────────────────────────────────────────────────────────────────
document.getElementById('btn-add-building')?.addEventListener('click', () => {
  if (!selectedBuilding) {
    document.getElementById('comparison-status').textContent = 
      'Please select a building on the map first';
    document.getElementById('comparison-status').style.color = '#f87171';
    return;
  }
  
  if (comparisonBuildings.find(b => b === selectedBuilding)) {
    document.getElementById('comparison-status').textContent = 
      'This building is already in the comparison';
    document.getElementById('comparison-status').style.color = '#d97706';
    return;
  }
  
  if (comparisonBuildings.length >= 4) {
    document.getElementById('comparison-status').textContent = 
      'Maximum 4 buildings can be compared';
    document.getElementById('comparison-status').style.color = '#f87171';
    return;
  }
  
  comparisonBuildings.push(selectedBuilding);
  document.getElementById('comparison-status').textContent = 
    `Added building: ${selectedBuilding.address || 'Unknown'}`;
  document.getElementById('comparison-status').style.color = '#4ade80';
  
  updateComparisonUI();
});

// ─────────────────────────────────────────────────────────────────
// Remove building from comparison
// ─────────────────────────────────────────────────────────────────
function removeBuilding(index) {
  comparisonBuildings.splice(index, 1);
  delete comparisonData[index];
  updateComparisonUI();
}

// ─────────────────────────────────────────────────────────────────
// Update comparison UI based on current state
// ─────────────────────────────────────────────────────────────────
function updateComparisonUI() {
  const container = document.getElementById('comparison-content');
  const modeControls = document.getElementById('comparison-mode-controls');
  
  // Show/hide mode controls based on mode
  if (comparisonMode === 'single') {
    modeControls.style.display = 'none';
    renderSingleBuildingComparison(container);
  } else {
    modeControls.style.display = 'flex';
    renderMultipleBuildingsComparison(container);
  }
}

// ─────────────────────────────────────────────────────────────────
// Render single building facade comparison (4 facades side-by-side)
// ─────────────────────────────────────────────────────────────────
function renderSingleBuildingComparison(container) {
  if (comparisonBuildings.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:var(--muted);padding:20px">No building selected</div>';
    return;
  }
  
  const building = comparisonBuildings[0];
  const buildingId = getBuildingId(building);
  const data = comparisonData[buildingId] || {};
  
  container.innerHTML = `
    <div style="margin-bottom:12px">
      <div style="font-size:13px;font-weight:600;color:var(--text)">
        ${building.address || 'Building ' + buildingId}
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">
        Year: ${building.year || 'N/A'} · Use: ${building.use_cat || 'N/A'} · 
        Energy: ${building.eclass || 'N/A'}
      </div>
    </div>
    
    <!-- Manual capture slot (full-width, prominent) -->
    <div style="margin-bottom:10px;position:relative;border-radius:8px;overflow:hidden;border:2px solid #a78bfa;background:#0d0d1a" id="cmp-manual-canvas-wrap">
      <canvas id="cmp-canvas-manual" width="520" height="120" style="width:100%;height:auto;display:block;max-height:200px;object-fit:contain"></canvas>
      <div style="position:absolute;bottom:5px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:700;background:rgba(114,28,184,0.85);color:#fff;padding:2px 10px;border-radius:4px">Manual View</div>
    </div>
    
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px">
      ${['N','E','S','W'].map(dir => `
        <div style="border:1px solid var(--border);border-radius:8px;padding:8px;background:rgba(0,0,0,0.02)">
          <div style="font-size:11px;font-weight:700;color:#7c3aed;margin-bottom:4px">${dir}</div>
          <canvas id="cmp-canvas-${dir}" width="160" height="120" 
                  style="width:100%;height:auto;border-radius:4px;background:#1a1a2e;cursor:pointer"></canvas>
          <div style="margin-top:6px;font-size:10px">
            <div style="display:flex;justify-content:space-between;margin-bottom:2px">
              <span style="color:var(--muted)">WWR:</span>
              <span style="font-weight:600;color:${data[dir]?.wwr > 40 ? '#dc2626' : '#16a34a'}">
                ${data[dir]?.wwr || '—'}%
              </span>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span style="color:var(--muted)">Score:</span>
              <span style="font-weight:600;color:#7c3aed">${data[dir]?.score || '—'}/100</span>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
    
    <!-- Capture action buttons -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
      <button class="btn" id="btn-cmp-manual-capture" style="background:rgba(114,28,184,0.4);border-color:#a78bfa;color:#c4b5fd;font-weight:600">📷 Draw & Capture</button>
      <button class="btn" id="btn-cmp-capture-all">▶ Capture All (N/E/S/W)</button>
    </div>
    
    <div style="padding:10px;background:rgba(124,58,237,0.08);border:1px solid #a78bfa;border-radius:8px;margin-bottom:10px">
      <div style="font-size:11px;font-weight:600;color:#7c3aed;margin-bottom:6px">Priority Ranking</div>
      <div id="facade-priority-list"></div>
    </div>
  `;
  
  // Add click handlers for facade captures
  ['N','E','S','W'].forEach(dir => {
    const canvas = document.getElementById(`cmp-canvas-${dir}`);
    if (canvas) {
      canvas.addEventListener('click', () => captureFacadeForComparison(building, dir));
      
      // Draw placeholder
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#475569';
      ctx.font = '11px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('Click to capture', canvas.width/2, canvas.height/2);
    }
  });
  
  // Initialize manual canvas with placeholder
  const mc = document.getElementById('cmp-canvas-manual');
  if (mc) {
    const mctx = mc.getContext('2d');
    mctx.fillStyle = '#0d0d1a';
    mctx.fillRect(0, 0, mc.width, mc.height);
    mctx.fillStyle = '#a78bfa';
    mctx.font = '600 13px Inter';
    mctx.textAlign = 'center';
    mctx.fillText('Click 📷 Draw & Capture then drag a box', mc.width / 2, mc.height / 2 - 8);
    mctx.fillText('over the building area you want to analyse', mc.width / 2, mc.height / 2 + 12);
  }
  
  // Add manual capture button handler
  const btnManual = document.getElementById('btn-cmp-manual-capture');
  if (btnManual) {
    btnManual.addEventListener('click', () => enterCropModeComparison(building));
  }
  
  // Add capture all button handler
  const btnCaptureAll = document.getElementById('btn-cmp-capture-all');
  if (btnCaptureAll) {
    btnCaptureAll.addEventListener('click', () => captureAllFacadesComparison(building));
  }
  
  updatePriorityRanking(buildingId);
}

// ─────────────────────────────────────────────────────────────────
// Render multiple buildings comparison
// ─────────────────────────────────────────────────────────────────
function renderMultipleBuildingsComparison(container) {
  if (comparisonBuildings.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;color:var(--muted);padding:30px 20px">
        <div style="font-size:13px;margin-bottom:8px">No buildings added yet</div>
        <div style="font-size:11px">Select buildings on the map and click "Add Building"</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      ${comparisonBuildings.map((building, idx) => {
        const buildingId = getBuildingId(building);
        const data = comparisonData[buildingId] || {};
        const avgScore = calculateAverageScore(data);
        const renovationPriority = getRenovationPriority(building, avgScore);
        
        return `
          <div style="border:1px solid var(--border);border-radius:8px;padding:10px;background:rgba(0,0,0,0.02)">
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
              <div style="flex:1">
                <div style="font-size:12px;font-weight:600;color:var(--text)">
                  ${building.address || 'Building ' + (idx + 1)}
                </div>
                <div style="font-size:10px;color:var(--muted);margin-top:2px">
                  ${building.year || 'N/A'} · ${building.use_cat || 'N/A'} · 
                  ${building.eclass || 'N/A'}
                </div>
              </div>
              <button onclick="removeBuilding(${idx})" 
                      style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:16px;padding:0 4px">
                ×
              </button>
            </div>
            
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:8px">
              ${['N','E','S','W'].map(dir => `
                <canvas id="cmp-multi-${idx}-${dir}" width="80" height="60" 
                        style="width:100%;height:auto;border-radius:4px;background:#1a1a2e;cursor:pointer"
                        onclick="captureFacadeForComparison(comparisonBuildings[${idx}], '${dir}')"></canvas>
              `).join('')}
            </div>
            
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;font-size:10px">
              <div>
                <div style="color:var(--muted)">Avg Score</div>
                <div style="font-weight:700;font-size:14px;color:#7c3aed">${avgScore}/100</div>
              </div>
              <div>
                <div style="color:var(--muted)">Priority</div>
                <div style="font-weight:700;font-size:14px;color:${renovationPriority.color}">
                  ${renovationPriority.label}
                </div>
              </div>
              <div>
                <div style="color:var(--muted)">Est. Cost</div>
                <div style="font-weight:600;font-size:12px;color:var(--text)">
                  ${formatCost(estimateRenovationCost(building))}
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    
    <div style="margin-top:12px;padding:10px;background:rgba(124,58,237,0.08);border:1px solid #a78bfa;border-radius:8px">
      <div style="font-size:11px;font-weight:600;color:#7c3aed;margin-bottom:6px">
        Renovation Priority Ranking
      </div>
      <div id="building-priority-list"></div>
    </div>
  `;
  
  // Initialize canvas placeholders
  comparisonBuildings.forEach((building, idx) => {
    ['N','E','S','W'].forEach(dir => {
      const canvas = document.getElementById(`cmp-multi-${idx}-${dir}`);
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#475569';
        ctx.font = '8px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(dir, canvas.width/2, canvas.height/2);
      }
    });
  });
  
  updateBuildingPriorityRanking();
}

// ─────────────────────────────────────────────────────────────────
// Capture facade for comparison (using existing facade inspector logic)
// ─────────────────────────────────────────────────────────────────
function captureFacadeForComparison(building, direction) {
  const buildingId = getBuildingId(building);
  
  document.getElementById('comparison-status').textContent = 
    `Capturing ${direction} facade...`;
  document.getElementById('comparison-status').style.color = '#7c3aed';
  
  // Use same fly logic from facade_inspector.js
  const center = getBuildingCenter(building);
  const radius = getBuildingRadius(building);
  const bldH = Math.max(5, building.height || 10);
  // Ground reference = where the building is really drawn. Prefer _groundH (set by the
  // facade inspector by sampling the Google mesh on photoreal); else the calibrated base.
  const terrainBase = building._groundH
    ?? (window.getBuildingBaseOffset ? window.getBuildingBaseOffset(center.lon, center.lat) : 0);
  
  const DIR_HEADINGS = { N:0, E:90, S:180, W:270 };
  const dist = Math.max(bldH * 1.1, radius * 1.4);
  const camAlt = terrainBase + bldH * 0.5;
  const h = DIR_HEADINGS[direction] * Math.PI / 180;
  const offsetLon = Math.sin(h) * dist / (111320 * Math.cos(center.lat * Math.PI / 180));
  const offsetLat = Math.cos(h) * dist / 111320;
  
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(
      center.lon + offsetLon, 
      center.lat + offsetLat, 
      camAlt
    ),
    orientation: {
      heading: Cesium.Math.toRadians(DIR_HEADINGS[direction] + 180),
      pitch: 0,
      roll: 0,
    },
    duration: 1.2,
    complete: () => {
      setTimeout(() => {
        viewer.render();
        const srcCanvas = viewer.canvas;
        
        // Find target canvas
        let targetCanvas;
        if (comparisonMode === 'single') {
          targetCanvas = document.getElementById(`cmp-canvas-${direction}`);
        } else {
          const idx = comparisonBuildings.indexOf(building);
          targetCanvas = document.getElementById(`cmp-multi-${idx}-${direction}`);
        }
        
        if (targetCanvas) {
          const ctx = targetCanvas.getContext('2d');
          ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height,
                       0, 0, targetCanvas.width, targetCanvas.height);
          
          // Store capture for analysis
          if (!comparisonData[buildingId]) {
            comparisonData[buildingId] = {};
          }
          comparisonData[buildingId][direction] = {
            captured: true,
            imageData: targetCanvas.toDataURL('image/jpeg', 0.8)
          };
          
          document.getElementById('comparison-status').textContent = 
            `✓ Captured ${direction} facade`;
          document.getElementById('comparison-status').style.color = '#4ade80';
        }
      }, 1400);
    }
  });
}

// ─────────────────────────────────────────────────────────────────
// Manual rubber-band crop-box capture for comparison
// ─────────────────────────────────────────────────────────────────
let _cropBuilding = null;

function enterCropModeComparison(building) {
  _cropBuilding = building;
  let cropMode = true;
  let startX = 0, startY = 0;

  const overlay = document.createElement('div');
  overlay.id = 'crop-overlay-comparison';
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '10001',
    cursor: 'crosshair', display: 'block',
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

  document.getElementById('comparison-status').textContent = 
    'Drag a box over the building area…  (Esc to cancel)';

  function exitCropMode() {
    cropMode = false;
    if (overlay.parentNode) {
      document.body.removeChild(overlay);
    }
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
      document.getElementById('comparison-status').textContent = 
        'Selection too small — try again';
      return;
    }
    
    viewer.render();
    const src = viewer.canvas;
    const scaleX = src.width  / window.innerWidth;
    const scaleY = src.height / window.innerHeight;
    const sx = x * scaleX, sy = y * scaleY;
    const sw = w * scaleX, sh = h * scaleY;
    
    const dst = document.getElementById('cmp-canvas-manual');
    if (dst) {
      dst.width  = Math.round(sw);
      dst.height = Math.round(sh);
      const ctx = dst.getContext('2d');
      ctx.drawImage(src, sx, sy, sw, sh, 0, 0, dst.width, dst.height);
      const dispH = Math.min(200, Math.round(dst.height * (dst.parentElement.clientWidth / dst.width)));
      dst.style.maxHeight = dispH + 'px';
      
      // Store capture for analysis
      const buildingId = getBuildingId(_cropBuilding);
      if (!comparisonData[buildingId]) {
        comparisonData[buildingId] = {};
      }
      comparisonData[buildingId]['manual'] = {
        captured: true,
        imageData: dst.toDataURL('image/jpeg', 0.8)
      };
      
      document.getElementById('comparison-status').textContent = 
        '✓ Area captured — click AI Analyze to analyse it';
      document.getElementById('comparison-status').style.color = '#4ade80';
      
      const wrap = document.getElementById('cmp-manual-canvas-wrap');
      if (wrap) {
        wrap.style.borderColor = '#4ade80';
        setTimeout(() => { wrap.style.borderColor = '#a78bfa'; }, 1200);
      }
    }
  });

  const escHandler = (e) => {
    if (e.key === 'Escape' && cropMode) {
      exitCropMode();
      document.getElementById('comparison-status').textContent = 'Capture cancelled';
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

// ─────────────────────────────────────────────────────────────────
// Capture all 4 facades automatically
// ─────────────────────────────────────────────────────────────────
async function captureAllFacadesComparison(building) {
  document.getElementById('comparison-status').textContent = 
    'Capturing all 4 facades…';
  document.getElementById('comparison-status').style.color = '#7c3aed';
  
  const DIRS = ['N','E','S','W'];
  
  for (const dir of DIRS) {
    await new Promise(resolve => {
      captureFacadeForComparison(building, dir);
      // Wait for capture to complete
      setTimeout(resolve, 2000);
    });
  }
  
  document.getElementById('comparison-status').textContent = 
    '✓ Captured all 4 facades';
  document.getElementById('comparison-status').style.color = '#4ade80';
}

// ─────────────────────────────────────────────────────────────────
// Detect facade defects via the ML model endpoint (/api/facade-defects).
// The facade-defect ML model (crack/leakage/abscission/corrosion/bulge) is
// trained separately and connected to the backend via FACADE_MODEL_URL;
// until then the endpoint returns model_connected=false and this surfaces a
// clear "not connected yet" message rather than failing silently. (This
// replaces the old call to /api/analyze-facade, which never existed.)
// ─────────────────────────────────────────────────────────────────
document.getElementById('btn-analyze-ai')?.addEventListener('click', async () => {
  const statusEl = document.getElementById('comparison-status');
  const btn = document.getElementById('btn-analyze-ai');
  statusEl.textContent = 'Detecting facade defects…';
  statusEl.style.color = '#7c3aed';
  btn.disabled = true;
  btn.textContent = 'Detecting…';

  // Every captured facade image across all comparison buildings.
  const jobs = [];
  for (const building of comparisonBuildings) {
    const buildingId = getBuildingId(building);
    const facadeData = comparisonData[buildingId] || {};
    for (const key of ['N', 'E', 'S', 'W', 'manual']) {
      if (facadeData[key]?.captured && facadeData[key].imageData) {
        jobs.push({ building, buildingId, key, facadeData });
      }
    }
  }

  if (jobs.length === 0) {
    statusEl.textContent = 'Capture at least one facade first';
    statusEl.style.color = '#d97706';
    btn.disabled = false;
    btn.textContent = '🔍 Detect Defects';
    return;
  }

  try {
    let modelConnected = null;
    let totalDefects = 0;
    for (const { building, buildingId, key, facadeData } of jobs) {
      const imageBase64 = facadeData[key].imageData.split(',')[1];
      const response = await fetch('/api/facade-defects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: imageBase64,
          direction: key,
          building_info: {
            address: building.address, year: building.year,
            use: building.use_cat, eclass: building.eclass,
          },
        }),
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const result = await response.json();
      modelConnected = result.model_connected;
      facadeData[key] = { ...facadeData[key], defects: result.defects || [] };
      totalDefects += (result.defects || []).length;
      comparisonData[buildingId] = facadeData;
    }

    if (modelConnected === false) {
      statusEl.textContent = '⏳ Facade-defect ML model not connected yet — placeholder wired, 0 defects returned.';
      statusEl.style.color = '#d97706';
    } else {
      statusEl.textContent = `✓ Defect detection complete — ${totalDefects} defect(s) found`;
      statusEl.style.color = '#4ade80';
    }
    updateComparisonUI();
  } catch (error) {
    console.error('Defect detection failed:', error);
    statusEl.textContent = '✗ Defect detection failed (backend offline?)';
    statusEl.style.color = '#f87171';
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Detect Defects';
  }
});

// ─────────────────────────────────────────────────────────────────
// Manual scoring interface
// ─────────────────────────────────────────────────────────────────
document.getElementById('btn-manual-score')?.addEventListener('click', () => {
  // Open modal for manual scoring
  showManualScoringModal();
});

function showManualScoringModal() {
  const modal = document.createElement('div');
  modal.id = 'manual-scoring-modal';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10000;
    display:flex;align-items:center;justify-content:center;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background:#fff;border-radius:12px;padding:20px;max-width:500px;
    max-height:80vh;overflow-y:auto;
  `;
  
  content.innerHTML = `
    <h3 style="margin:0 0 12px;color:#1e293b">Manual Facade Scoring</h3>
    <p style="font-size:12px;color:#64748b;margin-bottom:16px">
      Rate each facade on a scale of 0-100 based on visual condition, 
      weathering, cracks, and maintenance needs.
    </p>
    <div id="manual-scoring-forms"></div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button id="btn-save-manual" style="flex:1;padding:10px;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600">
        Save Scores
      </button>
      <button id="btn-cancel-manual" style="flex:1;padding:10px;background:#e2e8f0;color:#1e293b;border:none;border-radius:6px;cursor:pointer">
        Cancel
      </button>
    </div>
  `;
  
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  renderManualScoringForms();
  
  document.getElementById('btn-cancel-manual').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  document.getElementById('btn-save-manual').addEventListener('click', () => {
    saveManualScores();
    document.body.removeChild(modal);
    updateComparisonUI();
  });
}

function renderManualScoringForms() {
  const container = document.getElementById('manual-scoring-forms');
  let html = '';
  
  comparisonBuildings.forEach((building, bIdx) => {
    const buildingId = getBuildingId(building);
    html += `
      <div style="margin-bottom:16px;padding:12px;background:#f8fafc;border-radius:8px">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px">
          ${building.address || 'Building ' + (bIdx + 1)}
        </div>
        ${['N','E','S','W'].map(dir => `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="width:20px;font-size:11px;font-weight:700;color:#7c3aed">${dir}</span>
            <input type="range" min="0" max="100" value="50" 
                   id="score-${buildingId}-${dir}"
                   style="flex:1" />
            <span id="score-val-${buildingId}-${dir}" style="width:35px;text-align:right;font-size:12px;font-weight:600">50</span>
          </div>
        `).join('')}
      </div>
    `;
  });
  
  container.innerHTML = html;
  
  // Add event listeners for range inputs
  comparisonBuildings.forEach(building => {
    const buildingId = getBuildingId(building);
    ['N','E','S','W'].forEach(dir => {
      const input = document.getElementById(`score-${buildingId}-${dir}`);
      const valueSpan = document.getElementById(`score-val-${buildingId}-${dir}`);
      if (input && valueSpan) {
        input.addEventListener('input', (e) => {
          valueSpan.textContent = e.target.value;
        });
      }
    });
  });
}

function saveManualScores() {
  comparisonBuildings.forEach(building => {
    const buildingId = getBuildingId(building);
    if (!comparisonData[buildingId]) {
      comparisonData[buildingId] = {};
    }
    
    ['N','E','S','W'].forEach(dir => {
      const input = document.getElementById(`score-${buildingId}-${dir}`);
      if (input) {
        if (!comparisonData[buildingId][dir]) {
          comparisonData[buildingId][dir] = {};
        }
        comparisonData[buildingId][dir].score = parseInt(input.value);
        comparisonData[buildingId][dir].wwr = estimateWWRFromAge(building);
      }
    });
  });
  
  document.getElementById('comparison-status').textContent = 
    '✓ Manual scores saved';
  document.getElementById('comparison-status').style.color = '#4ade80';
}

// ─────────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────────
function getBuildingId(building) {
  return building.address || 
         `${building.coordinates[0][0][0].toFixed(6)}_${building.coordinates[0][0][1].toFixed(6)}`;
}

function getBuildingCenter(building) {
  const ring = building.coordinates[0];
  let lon = 0, lat = 0;
  for (const [x, y] of ring) { lon += x; lat += y; }
  return { lon: lon / ring.length, lat: lat / ring.length };
}

function getBuildingRadius(building) {
  const ring = building.coordinates[0];
  const c = getBuildingCenter(building);
  let maxDeg = 0;
  for (const [x, y] of ring) {
    const d = Math.sqrt((x - c.lon) ** 2 + (y - c.lat) ** 2);
    if (d > maxDeg) maxDeg = d;
  }
  return Math.max(15, maxDeg * 111320 * Math.cos(c.lat * Math.PI / 180));
}

function calculateAverageScore(facadeData) {
  const scores = Object.values(facadeData)
    .filter(d => d.score !== undefined)
    .map(d => d.score);
  
  if (scores.length === 0) return '—';
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function getRenovationPriority(building, avgScore) {
  const age = building.year ? 2024 - building.year : 50;
  const energyPenalty = { G: 30, F: 25, E: 20, D: 10, C: 5, B: 0, A: 0 }[building.eclass] || 15;
  
  const priorityScore = (100 - (typeof avgScore === 'number' ? avgScore : 50)) + 
                        (age > 50 ? 20 : age > 30 ? 10 : 0) + 
                        energyPenalty;
  
  if (priorityScore >= 70) return { label: 'High', color: '#dc2626' };
  if (priorityScore >= 40) return { label: 'Medium', color: '#d97706' };
  return { label: 'Low', color: '#16a34a' };
}

function estimateRenovationCost(building) {
  const area = building.footprint_m2 || 100;
  const floors = building.floors || 2;
  const totalArea = area * floors;
  
  // Rough estimate: 1500-3000 SEK/m² for facade renovation
  return totalArea * 2000;
}

function formatCost(cost) {
  if (cost >= 1000000) return (cost / 1000000).toFixed(1) + 'M kr';
  if (cost >= 1000) return (cost / 1000).toFixed(0) + 'k kr';
  return cost.toFixed(0) + ' kr';
}

function estimateWWRFromAge(building) {
  const year = building.year || 1970;
  if (year < 1960) return 20;
  if (year < 1975) return 25;
  if (year < 1990) return 30;
  if (year < 2005) return 35;
  return 40;
}

function updatePriorityRanking(buildingId) {
  const list = document.getElementById('facade-priority-list');
  if (!list) return;
  
  const facadeData = comparisonData[buildingId] || {};
  const facades = ['N','E','S','W'].map(dir => ({
    dir,
    score: facadeData[dir]?.score || 0,
    wwr: facadeData[dir]?.wwr || 0
  })).sort((a, b) => a.score - b.score);
  
  list.innerHTML = facades.map((f, idx) => `
    <div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 0">
      <span style="color:var(--muted)">${idx + 1}. ${f.dir} Facade</span>
      <span style="font-weight:600;color:${f.score < 40 ? '#dc2626' : f.score < 70 ? '#d97706' : '#16a34a'}">
        Score: ${f.score || '—'}/100
      </span>
    </div>
  `).join('');
}

function updateBuildingPriorityRanking() {
  const list = document.getElementById('building-priority-list');
  if (!list) return;
  
  const ranked = comparisonBuildings.map((building, idx) => {
    const buildingId = getBuildingId(building);
    const avgScore = calculateAverageScore(comparisonData[buildingId] || {});
    const priority = getRenovationPriority(building, avgScore);
    return { building, idx, avgScore, priority };
  }).sort((a, b) => {
    const scoreA = typeof a.avgScore === 'number' ? a.avgScore : 50;
    const scoreB = typeof b.avgScore === 'number' ? b.avgScore : 50;
    return scoreA - scoreB;
  });
  
  list.innerHTML = ranked.map((item, rank) => `
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:5px 0;
                border-bottom:1px solid rgba(0,0,0,0.06)">
      <div style="flex:1">
        <span style="font-weight:700;color:#7c3aed;margin-right:6px">${rank + 1}.</span>
        <span style="color:var(--text)">${item.building.address || 'Building ' + (item.idx + 1)}</span>
      </div>
      <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;
                   background:${item.priority.color}22;color:${item.priority.color}">
        ${item.priority.label}
      </span>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────────────────────────
// Export comparison data
// ─────────────────────────────────────────────────────────────────
document.getElementById('btn-export-comparison')?.addEventListener('click', () => {
  const exportData = {
    mode: comparisonMode,
    timestamp: new Date().toISOString(),
    buildings: comparisonBuildings.map(building => {
      const buildingId = getBuildingId(building);
      return {
        address: building.address,
        year: building.year,
        use: building.use_cat,
        eclass: building.eclass,
        facades: comparisonData[buildingId] || {}
      };
    })
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `facade-comparison-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  document.getElementById('comparison-status').textContent = 
    '✓ Comparison data exported';
  document.getElementById('comparison-status').style.color = '#4ade80';
});

// ─────────────────────────────────────────────────────────────────
// Exit comparison mode
// ─────────────────────────────────────────────────────────────────
document.getElementById('btn-exit-comparison')?.addEventListener('click', () => {
  document.getElementById('comparison-panel').style.display = 'none';
  
  // Reset view
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(MAP_CENTER.lon, MAP_CENTER.lat, 1800),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-50), roll: 0 },
    duration: 1.5,
  });
});

// ─────────────────────────────────────────────────────────────────
// Clear comparison data
// ─────────────────────────────────────────────────────────────────
document.getElementById('btn-clear-comparison')?.addEventListener('click', () => {
  if (confirm('Clear all comparison data?')) {
    comparisonBuildings = [];
    comparisonData = {};
    updateComparisonUI();
    document.getElementById('comparison-status').textContent = 
      'Comparison data cleared';
    document.getElementById('comparison-status').style.color = '#7c3aed';
  }
});
