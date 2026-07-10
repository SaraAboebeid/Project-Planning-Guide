// =============================================================
// ui.js — Click handler, hover tooltip, info panel
// Depends on: cesium.js (viewer), facade_inspector.js (lastPvgis, lastWWR)
// =============================================================

// ── Info-button tooltip (layer descriptions) ─────────────────────────────
(function initInfoTooltip() {
  const tip = document.getElementById('info-tooltip');
  if (!tip) return;
  const titleEl  = tip.querySelector('.it-title');
  const descEl   = tip.querySelector('.it-desc');
  const sourceEl = tip.querySelector('.it-source');

  document.addEventListener('click', e => {
    const btn = e.target.closest('.info-btn');
    if (!btn) { tip.style.display = 'none'; return; }
    e.stopPropagation();

    titleEl.textContent  = btn.dataset.title  || '';
    descEl.textContent   = btn.dataset.desc   || '';
    sourceEl.textContent = btn.dataset.source ? '⊹ ' + btn.dataset.source : '';
    sourceEl.style.display = btn.dataset.source ? '' : 'none';

    tip.style.display = 'block';
    const rect = btn.getBoundingClientRect();
    const tipW = tip.offsetWidth  || 220;
    const tipH = tip.offsetHeight || 80;
    let left = rect.right + 8;
    if (left + tipW > window.innerWidth - 8) left = rect.left - tipW - 8;
    let top = rect.top - 4;
    if (top + tipH > window.innerHeight - 8) top = window.innerHeight - tipH - 8;
    tip.style.left = left + 'px';
    tip.style.top  = top  + 'px';
  });
})();

// Accessibility + collapsible panel wiring
(function initSidebarA11yAndCollapses() {
  const infoButtons = document.querySelectorAll('.info-btn');
  infoButtons.forEach(btn => {
    if (!btn.getAttribute('aria-label')) {
      const title = btn.dataset.title || 'Layer information';
      btn.setAttribute('aria-label', 'More info: ' + title);
      btn.setAttribute('title', 'More info: ' + title);
    }
  });

  function bindCollapse(toggleId, contentId) {
    const toggle = document.getElementById(toggleId);
    const content = document.getElementById(contentId);
    if (!toggle || !content) return;

    const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
    content.classList.toggle('collapsed', !isExpanded);

    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      content.classList.toggle('collapsed', expanded);
    });
  }

  bindCollapse('traffic-toggle', 'traffic-content');
  bindCollapse('stats-toggle', 'stats-content');
  bindCollapse('urban-toggle', 'urban-content');
  bindCollapse('analysis-tools-toggle', 'analysis-tools-content');
})();

let selectedBuilding = null;
let highlightEntity  = null;

viewer.screenSpaceEventHandler.setInputAction(movement => {
  const hits = viewer.scene.drillPick(movement.position, 10);
  let found = null;
  for (const h of hits) { if (h && h.id && h.id._dataIdx !== undefined) { found = h; break; } }
  if (found) {
    const b = DATA[found.id._dataIdx];
    if (b) showInfoPanel(b, found.id._dataIdx);
  } else {
    hideInfoPanel();
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// ─────────────────────────────────────────────────────────────────
// Hover tooltip (kept dark — floats over the 3D map scene)
// ─────────────────────────────────────────────────────────────────
const TABULA_LABELS = {
  '...1960':    'Pre-1960 (SFH/MFH)',
  '1961-1975':  '1961–1975 (Miljonprogrammet)',
  '1976-1985':  '1976–1985',
  '1986-1995':  '1986–1995',
  '1996-2005':  '1996–2005',
  'post-2005':  'Post-2005',
};
const RESIDENTIAL = new Set(['bostad_enfamilj','bostad_flerfamilj']);
const ECLASS_COLORS_CSS = { A:'#16a34a',B:'#4ade80',C:'#a3e635',D:'#facc15',E:'#fb923c',F:'#f87171',G:'#dc2626' };

const hoverCard = document.getElementById('hover-card');
let lastHoverId = null;
let hoverThrottle = 0;

viewer.screenSpaceEventHandler.setInputAction(movement => {
  // Suppress building hover card while ghost/transit mode is active
  if (window._ghostModeOn) { hoverCard.style.display = 'none'; return; }

  // Throttle to ~30fps
  const now = Date.now();
  if (now - hoverThrottle < 33) {
    // Still move card if already showing
    if (hoverCard.style.display !== 'none') {
      const x = movement.endPosition.x, y = movement.endPosition.y;
      hoverCard.style.left = Math.min(x + 18, window.innerWidth  - hoverCard.offsetWidth  - 10) + 'px';
      hoverCard.style.top  = Math.min(y - 10,  window.innerHeight - hoverCard.offsetHeight - 10) + 'px';
    }
    return;
  }
  hoverThrottle = now;

  // drillPick pierces Google 3D tile mesh to reach EUBUCCO entities underneath
  const hits = viewer.scene.drillPick(movement.endPosition, 10);
  let found = null;
  for (const h of hits) {
    if (h && h.id && h.id._dataIdx !== undefined) { found = h; break; }
  }

  if (found) {
    const idx = found.id._dataIdx;
    const x = movement.endPosition.x, y = movement.endPosition.y;
    hoverCard.style.left = Math.min(x + 18, window.innerWidth  - 300) + 'px';
    hoverCard.style.top  = Math.min(y - 10,  window.innerHeight - 200) + 'px';

    if (idx === lastHoverId) { hoverCard.style.display = 'block'; return; }
    lastHoverId = idx;
    const b = DATA[idx];
    const isResidential = RESIDENTIAL.has(b.use_cat);
    const eclassColor = b.eclass ? (ECLASS_COLORS_CSS[b.eclass] || '#94a3b8') : '#94a3b8';
    const tabulaLabel = b.tabula_period ? (TABULA_LABELS[b.tabula_period] || b.tabula_period) : null;

    let html = '<div style="font-weight:600;font-size:13px;margin-bottom:4px;color:#6d28d9">' +
      (b.address || b.all_addresses || 'Building') + '</div>';
    // Show all addresses if multiple units share this EPC
    if (b.all_addresses && b.all_addresses !== b.address && b.all_addresses.includes(',')) {
      html += '<div style="font-size:10px;color:#64748b;margin-bottom:5px">' + b.all_addresses + '</div>';
    }
    const useLabel = b.use_cat ? b.use_cat.replace(/_/g,' ') : 'Unknown';
    html += '<div style="margin-bottom:6px"><span style="background:rgba(114,28,184,0.12);color:#4c1d95;border-radius:4px;padding:2px 7px;font-size:11px">' + useLabel + '</span></div>';
    html += '<table style="width:100%;border-collapse:collapse">';
    const row = (lbl, val, color) => (val != null && val !== '') ?
      '<tr><td style="color:#64748b;padding:2px 0;white-space:nowrap">' + lbl + '</td>' +
      '<td style="text-align:right;padding:2px 0;font-weight:500' + (color?';color:'+color:'') + '">' + val + '</td></tr>' : '';
    if (b.eclass) html += row('Energy class','<span style="background:'+eclassColor+';color:#000;border-radius:3px;padding:1px 6px;font-weight:700">'+b.eclass+'</span>',null);
    if (b.energy) html += row('Energy use', b.energy+' kWh/m&#178;yr', b.energy>150?'#ea580c':'#16a34a');
    if (b.year)   html += row('Year built', b.year, null);
    if (b.footprint_m2) html += row('Footprint', Math.round(b.footprint_m2)+' m&#178;', null);
    if (b.height) html += row('Height', Math.round(b.height)+' m', null);
    if (b.floors) html += row('Floors', b.floors, null);
    if (isResidential && tabulaLabel) {
      html += '<tr><td colspan="2" style="padding-top:6px;padding-bottom:2px;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.5px">TABULA Archetype</td></tr>';
      html += row('Era', tabulaLabel, '#7c3aed');
      if (b.tabula_u_wall) html += row('U-wall', b.tabula_u_wall+' W/m&#178;K', null);
      if (b.tabula_u_win)  html += row('U-window', b.tabula_u_win+' W/m&#178;K', null);
    }
    html += '</table>';
    hoverCard.innerHTML = html;
    hoverCard.style.display = 'block';
  } else {
    hoverCard.style.display = 'none';
    lastHoverId = null;
    // Delegate to SCB layer hover (shows tooltip if cursor is over an SCB polygon)
    if (typeof window.scbOnHover === 'function') window.scbOnHover(movement);
  }
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

// ─────────────────────────────────────────────────────────────────
// Building info panel
// ─────────────────────────────────────────────────────────────────
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
  document.getElementById('info-content').innerHTML = rows.join('');
  document.getElementById('info-panel').style.display = 'block';

  // Highlight outline
  if (highlightEntity) viewer.entities.remove(highlightEntity);
  const ring = b.coordinates[0];
  if (ring && ring.length >= 3) {
    const flat = [];
    for (const [lo, la] of ring) { flat.push(lo, la); }
    let centerLon = 0, centerLat = 0;
    for (const [lo, la] of ring) { centerLon += lo; centerLat += la; }
    centerLon /= ring.length;
    centerLat /= ring.length;
    const baseH = (typeof window.getBuildingBaseOffset === 'function')
      ? window.getBuildingBaseOffset(centerLon, centerLat)
      : 0;
    const roofH = baseH + Math.max(3, b.height || 6) + 0.5;
    highlightEntity = viewer.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(flat)),
        extrudedHeight: roofH,
        height: baseH,
        material: Cesium.Color.fromCssColorString('#a78bfa').withAlpha(0.0),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString('#a78bfa'),
        outlineWidth: 3,
      },
    });
  }
}

function hideInfoPanel() {
  document.getElementById('info-panel').style.display = 'none';
  if (highlightEntity) { viewer.entities.remove(highlightEntity); highlightEntity = null; }
  selectedBuilding = null;
  // Disable analysis tool buttons
  document.getElementById('btn-inspect').disabled = true;
  document.getElementById('btn-pvgis').disabled   = true;
  document.getElementById('lp-no-selection').style.display = 'block';
}

document.getElementById('info-close').addEventListener('click', hideInfoPanel);
