// =============================================================
// ui.js — Click handler, hover tooltip, info panel
// Depends on: cesium.js (viewer), facade_inspector.js (lastPvgis, lastWWR)
// =============================================================

// ── Shared analysis-result row builder ───────────────────────────────────
// Used by pvgis.js and energy_sim.js so both cards format labels, values and
// units identically. label | value <unit>, with an optional accent colour on
// the value and a `total` flag for the ruled summary row.
window.arRow = function (label, value, unit, opts) {
  opts = opts || {};
  const t = opts.total ? ' ar-total' : '';
  const style = opts.color ? ' style="color:' + opts.color + '"' : '';
  const u = unit ? '<span class="ar-unit">' + unit + '</span>' : '';
  return '<span class="ar-label' + t + '">' + label + '</span>' +
         '<span class="ar-val' + t + '"' + style + '>' + value + u + '</span>';
};

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

// =============================================================
// Sidebar shell: consistent accordions (persisted), active-layer
// badges on collapsed sections, ARIA state sync, and the SCB filter.
// =============================================================
(function initSidebarShell() {
  const LS_KEY = 'ppg.viewer.sections';

  // Info buttons carry only a data-layer key in the markup; the prose lives in
  // layer_docs.js. Hydrate them into the data-title/desc/source the tooltip reads.
  function hydrateLayerDocs() {
    const docs = window.LAYER_DOCS || {};
    document.querySelectorAll('.info-btn[data-layer]').forEach(btn => {
      const d = docs[btn.dataset.layer];
      if (!d) return;
      // Never overwrite an attribute already in the markup — that's how a button
      // keeps a build-time templated value (e.g. {{BUILDINGS_SOURCE}}).
      if (!btn.dataset.title && d.title) btn.dataset.title = d.title;
      if (!btn.dataset.desc && d.desc) btn.dataset.desc = d.desc;
      if (!btn.dataset.source && d.source) btn.dataset.source = d.source;
    });
  }

  function applyInfoButtonA11y() {
    hydrateLayerDocs();
    document.querySelectorAll('.info-btn').forEach(btn => {
      if (!btn.getAttribute('aria-label')) {
        const title = btn.dataset.title || 'Layer information';
        btn.setAttribute('aria-label', 'More info: ' + title);
        btn.setAttribute('title', 'More info: ' + title);
      }
    });
  }

  // ── Open/closed state persists across reloads ──────────────────────────
  function readState() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (_e) { return {}; }
  }
  function writeState(state) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (_e) { /* private mode */ }
  }

  // Every section in the sidebar uses the same accordion pattern — no more
  // "some sections collapse, some don't".
  function bindAllCollapses() {
    const saved = readState();
    document.querySelectorAll('.collapse-toggle').forEach(toggle => {
      const contentId = toggle.getAttribute('aria-controls');
      const content = contentId && document.getElementById(contentId);
      if (!content || toggle.dataset.collapseBound === '1') return;
      toggle.dataset.collapseBound = '1';

      if (Object.prototype.hasOwnProperty.call(saved, contentId)) {
        toggle.setAttribute('aria-expanded', saved[contentId] ? 'true' : 'false');
      }
      content.classList.toggle('collapsed', toggle.getAttribute('aria-expanded') !== 'true');

      toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        content.classList.toggle('collapsed', expanded);
        const state = readState();
        state[contentId] = !expanded;
        writeState(state);
        refreshBadges();
      });
    });
  }

  // ── Active-layer count badges ─────────────────────────────────────────
  // A collapsed section can hide active layers; the badge says how many are
  // on so the map never looks cluttered for no visible reason.
  const BADGES = [
    ['buildings-badge', 'buildings-content'],
    ['traffic-badge',   'traffic-content'],
    ['stats-badge',     'stats-content'],
    ['urban-badge',     'urban-content'],
  ];

  // Writes MUST be idempotent: this runs from a MutationObserver, and assigning
  // textContent replaces child nodes, which would re-trigger the observer.
  function setBadge(badge, text) {
    if (!badge) return;
    if (text == null) {
      if (!badge.hidden) badge.hidden = true;
      return;
    }
    if (badge.textContent !== text) badge.textContent = text;
    if (badge.hidden) badge.hidden = false;
  }

  function refreshBadges() {
    BADGES.forEach(([badgeId, contentId]) => {
      const badge = document.getElementById(badgeId);
      const content = document.getElementById(contentId);
      if (!badge || !content) return;
      const n = content.querySelectorAll('.overlay-btn.active').length;
      setBadge(badge, n > 0 ? n + ' on' : null);
    });
    // Base map is exclusive — show which one is active.
    const activeBase = document.querySelector('.base-btn.active .base-name');
    setBadge(document.getElementById('basemap-badge'),
             activeBase ? activeBase.textContent.trim() : null);
  }

  // ── Keep ARIA in sync with whatever toggled the .active class ──────────
  function syncAria() {
    document.querySelectorAll('.base-btn').forEach(b =>
      b.setAttribute('aria-checked', b.classList.contains('active') ? 'true' : 'false'));
    document.querySelectorAll('.overlay-btn').forEach(b =>
      b.setAttribute('aria-pressed', b.classList.contains('active') ? 'true' : 'false'));
    document.querySelectorAll('#lp-tabs .lp-tab').forEach(b =>
      b.setAttribute('aria-selected', b.classList.contains('active') ? 'true' : 'false'));
  }

  // Re-entrancy guard: refreshAll writes into the very subtree the observer
  // below watches, so without this a single mutation can feed itself forever.
  let _refreshing = false;
  function refreshAll() {
    if (_refreshing) return;
    _refreshing = true;
    try { syncAria(); refreshBadges(); }
    finally { _refreshing = false; }
  }

  // Other scripts (cesium.js, vasttrafik.js, scb_layers.js) flip .active
  // directly, so observe the panel rather than trying to hook every caller.
  // Watch ONLY class changes — never childList: refreshBadges() writes
  // textContent, which is a childList mutation and would loop endlessly,
  // pegging the main thread and hanging the viewer's async boot.
  const panel = document.getElementById('left-panel');
  if (panel && typeof MutationObserver !== 'undefined') {
    const obs = new MutationObserver(() => refreshAll());
    obs.observe(panel, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  // ── SCB layer filter (47 layers is unusable as a flat list) ───────────
  function bindScbFilter() {
    const input = document.getElementById('scb-filter');
    const container = document.getElementById('scb-layers-container');
    const countEl = document.getElementById('scb-filter-count');
    if (!input || !container || input.dataset.bound === '1') return;
    input.dataset.bound = '1';

    const apply = () => {
      const q = input.value.trim().toLowerCase();
      const rows = container.querySelectorAll('.scb-row');
      let shown = 0;
      rows.forEach(row => {
        const nameEl = row.querySelector('.base-name');
        const name = (nameEl ? nameEl.textContent : '').toLowerCase();
        const hit = !q || name.indexOf(q) !== -1;
        row.style.display = hit ? '' : 'none';
        if (hit) shown++;
      });
      if (countEl) countEl.textContent = rows.length ? shown + '/' + rows.length : '';
    };
    input.addEventListener('input', apply);
    apply();
  }

  applyInfoButtonA11y();
  bindAllCollapses();
  refreshAll();
  bindScbFilter();

  // SCB rows and info buttons are injected asynchronously — re-run once the
  // layer list has rendered.
  const scbContainer = document.getElementById('scb-layers-container');
  if (scbContainer && typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => { applyInfoButtonA11y(); bindScbFilter(); refreshBadges(); })
      .observe(scbContainer, { childList: true });
  }

  window.refreshSidebarState = refreshAll;
})();

let selectedBuilding = null;

// Resolve the building under a screen position. Normally that means picking the
// extruded boxes, which carry the index. On the photorealistic basemap they are
// not drawn at all (see cesium.js), so fall back to picking the rendered surface
// and looking the position up in the footprint index.
function buildingIndexAt(windowPosition) {
  const hits = viewer.scene.drillPick(windowPosition, 10);
  for (const h of hits) {
    if (h && h.id && h.id._dataIdx !== undefined) return h.id._dataIdx;
  }
  return window.pickBuildingIndexAt ? window.pickBuildingIndexAt(windowPosition) : null;
}

viewer.screenSpaceEventHandler.setInputAction(movement => {
  const idx = buildingIndexAt(movement.position);
  if (idx != null && DATA[idx]) {
    showInfoPanel(DATA[idx], idx);
    if (window.isPhotoMode && window.isPhotoMode()) window.setSelectedBuilding(idx);
  } else {
    hideInfoPanel();
    if (window.isPhotoMode && window.isPhotoMode()) window.setSelectedBuilding(null);
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
  // Suppress the building hover card while the pointer is over a Trafikverket
  // entity, which shows its own tooltip — without this both would fight over
  // the same pointer position.
  if (window._tvHoverActive) { hoverCard.style.display = 'none'; return; }

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

  // drillPick pierces Google 3D tile mesh to reach EUBUCCO entities underneath;
  // in photorealistic mode there are no boxes and this falls through to the
  // footprint lookup instead.
  const found = buildingIndexAt(movement.endPosition);

  // Hide ONLY the building data card while an analytical overlay is active
  // (environmental analysis / urban analysis / statistics). We still fall through
  // to the else branch so the layer's own hover card — e.g. the SCB population-grid
  // cell — keeps working.
  const suppressBuilding = window._shActive || window._irActive || window._tcActive ||
      window._urbanActive || window._scbActive || window._facadeInspectActive;

  // The selected building already has the full card; a hover card over it would
  // repeat the same facts, so it is only shown for other buildings.
  const isSelected = selectedBuilding && selectedBuilding._idx === found;

  if (found != null && DATA[found] && !suppressBuilding && !isSelected) {
    const idx = found;
    const x = movement.endPosition.x, y = movement.endPosition.y;
    hoverCard.style.left = Math.min(x + 18, window.innerWidth  - 300) + 'px';
    hoverCard.style.top  = Math.min(y - 10,  window.innerHeight - 200) + 'px';

    if (idx === lastHoverId) { hoverCard.style.display = 'block'; return; }
    lastHoverId = idx;
    if (window.isPhotoMode && window.isPhotoMode()) window.setHoverBuilding(idx);
    const b = DATA[idx];
    const isResidential = RESIDENTIAL.has(b.use_cat);
    const eclassColor = b.eclass ? (ECLASS_COLORS_CSS[b.eclass] || '#94a3b8') : '#94a3b8';
    const tabulaLabel = b.tabula_period ? (TABULA_LABELS[b.tabula_period] || b.tabula_period) : null;

    let html = '<div style="font-weight:600;font-size:13px;margin-bottom:4px;color:#6d28d9">' +
      (b.address || b.all_addresses || 'Building') + '</div>';
    // Show every entrance when one EPC covers multiple addresses (pipe-separated)
    if (b.all_addresses && b.all_addresses.indexOf('|') !== -1) {
      const _entrances = b.all_addresses.split('|').map(function (s) { return s.trim(); }).filter(Boolean);
      if (_entrances.length > 1) {
        html += '<div style="font-size:10px;color:#64748b;margin-bottom:5px">' +
          _entrances.length + ' addresses: ' + _entrances.join(', ') + '</div>';
      }
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
  window.lastSavedWWR = null;
  // Enable analysis tool buttons
  document.getElementById('btn-inspect').disabled = false;
  document.getElementById('btn-pvgis').disabled   = false;
  document.getElementById('btn-sim').disabled     = false;
  document.getElementById('lp-no-selection').style.display = 'none';
  // Name the selection on the section header and make sure the section is open,
  // so the building's data and its tools are visible together.
  const _bBadge = document.getElementById('building-badge');
  if (_bBadge) {
    const _label = b.address || b.all_addresses || 'Selected';
    _bBadge.textContent = _label.length > 24 ? _label.slice(0, 23) + '…' : _label;
    _bBadge.hidden = false;
  }
  const _bToggle  = document.getElementById('building-toggle');
  const _bContent = document.getElementById('building-content');
  if (_bToggle && _bContent) {
    _bToggle.setAttribute('aria-expanded', 'true');
    _bContent.classList.remove('collapsed');
  }
  // Reset PVGIS result and saved badges when switching buildings
  const pvr = document.getElementById('pvgis-result');
  pvr.style.display = 'none'; pvr.innerHTML = '';
  document.getElementById('pvgis-saved-badge').style.display = 'none';
  document.getElementById('inspect-saved-badge').style.display = 'none';
  const simr = document.getElementById('sim-result');
  simr.style.display = 'none'; simr.innerHTML = '';
  document.getElementById('sim-saved-badge').style.display = 'none';
  if (typeof window.stopSimulationPolling === 'function') window.stopSimulationPolling();
  // Auto-load saved results for this building
  const bRing = b.coordinates && b.coordinates[0];
  if (bRing && bRing.length) {
    const bLat = (bRing.reduce((s,c) => s+c[1], 0) / bRing.length).toFixed(5);
    const bLon = (bRing.reduce((s,c) => s+c[0], 0) / bRing.length).toFixed(5);
    try {
      const [pvRes, wwrRes, simRes] = await Promise.all([
        fetch(`/api/pvgis-lookup?lat=${bLat}&lon=${bLon}`).then(r=>r.json()),
        fetch(`/api/wwr-lookup?lat=${bLat}&lon=${bLon}`).then(r=>r.json()),
        fetch(`/api/simulation-lookup?lat=${bLat}&lon=${bLon}`).then(r=>r.json()),
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
        window.lastSavedWWR = r;
        const badge = document.getElementById('inspect-saved-badge');
        badge.innerHTML = '&#128190; Saved WWR: ' + r.average_wwr + '% (AI)';
        badge.style.display = 'block';
      }
      if (simRes.found && typeof window.renderSimulationRecord === 'function') {
        window.renderSimulationRecord(simRes.record);
      }
    } catch(e) { /* lookup not critical */ }
  }
  const rows = [];
  const row = (l,v) => v != null && v !== '' ? rows.push('<div class="tt-row"><span class="tt-lbl">'+l+'</span><span class="tt-val">'+v+'</span></div>') : null;
  row('Address',  b.address);
  if (b.all_addresses && b.all_addresses.indexOf('|') !== -1) {
    const _e = b.all_addresses.split('|').map(function (s) { return s.trim(); }).filter(Boolean);
    if (_e.length > 1) row('All entrances', _e.join(', '));
  }
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

  // Selection effect (glowing volume + roof pin) and the floating card beside it.
  drawSelectionEffect(b);
  showSelectionCard(b, idx);
}

function hideInfoPanel() {
  document.getElementById('info-panel').style.display = 'none';
  clearSelectionEffect();
  selectedBuilding = null;
  // Disable analysis tool buttons
  document.getElementById('btn-inspect').disabled = true;
  document.getElementById('btn-pvgis').disabled   = true;
  document.getElementById('btn-sim').disabled     = true;
  document.getElementById('lp-no-selection').style.display = 'block';
  const _bBadge = document.getElementById('building-badge');
  if (_bBadge) _bBadge.hidden = true;
  if (typeof window.stopSimulationPolling === 'function') window.stopSimulationPolling();
}

/** The selection effect drawn around the selected building. Hidden during a
 *  facade capture for the same reason as the fill highlight. */
window.setSelectionOutlineVisible = function (visible) {
  for (const e of selectionEntities) e.show = visible;
  selectionHidden = !visible;
};

document.getElementById('info-close').addEventListener('click', hideInfoPanel);

// The UK page (and the Belgian page derived from it) hard-codes "London — King's
// Cross" as the sidebar subtitle; name the district actually loaded instead.
(function syncCitySubtitle() {
  const el = document.getElementById('city-subtitle');
  const c = window.VIEWER_CITY;
  if (el && c && c.name && c.district) el.textContent = c.district.startsWith(c.name) ? c.district : `${c.name} — ${c.district}`;
})();

// =============================================================
// Selection effect + floating building card
//
// Clicking a building lights it up (translucent violet volume, glowing roof and
// base outline, a pin on the roof) and opens a card beside the map with its key
// facts and a street-level photo, joined to the pin by a leader line. The sidebar
// info panel and its tools are unchanged - the card is a summary on top.
// =============================================================
const SEL_VIOLET = '#8b5cf6';
let selectionEntities = [];
let selectionHidden = false;
let selPinPos = null;       // Cartesian3 of the roof pin, for the leader line
let selCard = null, selLeader = null, selToken = 0;
const selPhotoCache = new Map();  // idx -> {image,date,copyright} | {error}

function clearSelectionEffect() {
  for (const e of selectionEntities) viewer.entities.remove(e);
  selectionEntities = [];
  selPinPos = null;
  selToken++;
  if (selCard) selCard.style.display = 'none';
  if (selLeader) selLeader.style.display = 'none';
}

function drawSelectionEffect(b) {
  clearSelectionEffect();
  const ring = b.coordinates && b.coordinates[0];
  if (!ring || ring.length < 3) return;
  let cLon = 0, cLat = 0;
  for (const [lo, la] of ring) { cLon += lo; cLat += la; }
  cLon /= ring.length; cLat /= ring.length;
  const baseH = (typeof window.getBuildingBaseOffset === 'function') ? window.getBuildingBaseOffset(cLon, cLat) : 0;
  const roofH = baseH + Math.max(3, b.height || 6) + 0.3;
  const violet = Cesium.Color.fromCssColorString(SEL_VIOLET);
  // The tint is a shell ~0.6 m outside the building box: drawn exactly on top of
  // the box, its faces z-fight with the box's own and the tint never shows.
  const mLat = 111320, mLon = 111320 * Math.cos(cLat * Math.PI / 180), GROW = 0.6;
  const flat = [], roof = [], base = [];
  for (const [lo, la] of ring) {
    const dx = (lo - cLon) * mLon, dy = (la - cLat) * mLat, d = Math.hypot(dx, dy) || 1;
    flat.push(lo + (dx / d) * GROW / mLon, la + (dy / d) * GROW / mLat);
    roof.push(lo, la, roofH); base.push(lo, la, baseH + 0.3);
  }
  const add = (ent) => { const e = viewer.entities.add(ent); e.show = !selectionHidden; selectionEntities.push(e); };

  // Translucent volume tinting the building.
  add({ polygon: {
    hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(flat)),
    // Photorealistic mesh: a light veil so the real building stays readable;
    // flat coloured boxes need a stronger tint to stand out from their own colour.
    height: baseH, extrudedHeight: roofH + 0.4,
    material: violet.withAlpha(window.isPhotoMode && window.isPhotoMode() ? 0.22 : 0.62),
  } });
  // Glowing roof and base outlines (polylines: polygon outlines are 1 px on WebGL).
  add({ polyline: { positions: Cesium.Cartesian3.fromDegreesArrayHeights(roof), width: 14,
    material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.3, color: violet.withAlpha(1.0) }) } });
  add({ polyline: { positions: Cesium.Cartesian3.fromDegreesArrayHeights(base), width: 9,
    material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.2, color: violet.withAlpha(0.7) }) } });
  // Vertical edges at the corners (skip near-collinear points so curved outlines stay light).
  const n = ring.length - (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? 1 : 0);
  for (let i = 0; i < n && n <= 60; i++) {
    const p = ring[(i - 1 + n) % n], q = ring[i], r = ring[(i + 1) % n];
    const turn = Math.abs(Math.atan2(r[1] - q[1], r[0] - q[0]) - Math.atan2(q[1] - p[1], q[0] - p[0]));
    if (Math.min(turn, 2 * Math.PI - turn) < 0.35) continue;
    add({ polyline: { positions: Cesium.Cartesian3.fromDegreesArrayHeights([q[0], q[1], baseH, q[0], q[1], roofH]), width: 7,
      material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.25, color: violet.withAlpha(0.8) }) } });
  }
  // Roof pin: soft halo + white dot with a violet ring, always drawn on top.
  selPinPos = Cesium.Cartesian3.fromDegrees(cLon, cLat, roofH + 1);
  add({ position: selPinPos, point: { pixelSize: 30, color: violet.withAlpha(0.28), disableDepthTestDistance: Number.POSITIVE_INFINITY } });
  add({ position: selPinPos, point: { pixelSize: 15, color: Cesium.Color.WHITE, outlineColor: violet, outlineWidth: 4,
    disableDepthTestDistance: Number.POSITIVE_INFINITY } });
}

// ── Card ────────────────────────────────────────────────────────
const SEL_ICONS = {
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  use: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M11 21v-3h2v3"/>',
  energy: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  year: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  area: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  height: '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>',
  floors: '<path d="M4 20h4v-4h4v-4h4V8h4"/>',
};
const USE_LABELS = {
  bostad_enfamilj: 'Residential – house', bostad_flerfamilj: 'Residential – apartments',
  verksamhet: 'Commercial / Office', industri: 'Industrial', samhalle: 'Public / institutional',
  komplement: 'Ancillary building', ovrigt: 'Other',
};
const ESTIMATED_YEAR = new Set(['statbel_prior', 'ehs_prior', 'ehs_sampled', 'tabula_prior']);

function _selEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function _selEnsureDom() {
  if (selCard) return;
  const style = document.createElement('style');
  style.textContent = `
  .sel-card{position:fixed;top:105px;right:30px;width:480px;max-width:calc(125vw - 60px);z-index:950;display:none;zoom:0.8;
    background:#fff;color:#0f172a;border-radius:18px;box-shadow:0 22px 50px rgba(15,23,42,.22),0 0 0 1px rgba(139,92,246,.18);
    font-family:inherit;overflow:hidden}
  .sel-card .sc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:18px 20px 10px}
  .sel-card h3{margin:0;font-size:21px;font-weight:700;line-height:1.2;color:#1e1b4b}
  .sel-card .sc-sub{display:flex;align-items:center;gap:5px;margin-top:5px;font-size:13px;color:#64748b}
  .sel-card .sc-badge{display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0}
  .sel-card .sc-badge b{display:flex;align-items:center;justify-content:center;min-width:46px;height:40px;border-radius:9px;
    font-size:22px;font-weight:800;color:#0f172a}
  .sel-card .sc-badge span{font-size:11px;color:#64748b;white-space:nowrap}
  .sel-card .sc-body{display:grid;grid-template-columns:1fr 168px;gap:14px;padding:6px 20px 16px}
  .sel-card .sc-row{display:grid;grid-template-columns:18px 76px 1fr;align-items:center;gap:8px;padding:6px 0;font-size:13px}
  .sel-card .sc-row svg{width:17px;height:17px;stroke:#475569;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  .sel-card .sc-lbl{color:#64748b}
  .sel-card .sc-val{font-weight:600;color:#0f172a;white-space:nowrap}
  .sel-card .sc-val small{font-weight:400;color:#94a3b8;margin-left:3px}
  .sel-card .sc-photo{border-radius:12px;overflow:hidden;background:#f1f5f9;height:150px;position:relative;align-self:start}
  .sel-card .sc-photo img{width:100%;height:100%;object-fit:cover;display:block}
  .sel-card .sc-photo .sc-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
    text-align:center;padding:10px;font-size:11px;color:#94a3b8}
  .sel-card .sc-credit{font-size:9.5px;color:#94a3b8;margin-top:4px;text-align:right}
  .sel-card .sc-close{border:none;background:transparent;color:#94a3b8;font-size:16px;cursor:pointer;padding:0 0 0 6px;line-height:1}
  .sel-card .sc-close:hover{color:#475569}
  @keyframes scPulse{0%,100%{opacity:.55}50%{opacity:1}}
  .sel-card .sc-loading{animation:scPulse 1.2s ease-in-out infinite}`;
  document.head.appendChild(style);

  selCard = document.createElement('div');
  selCard.className = 'sel-card';
  document.body.appendChild(selCard);

  // Leader line from the roof pin to the card, redrawn every frame.
  selLeader = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  selLeader.setAttribute('style', 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:949;display:none');
  selLeader.innerHTML = `<line stroke="${SEL_VIOLET}" stroke-width="2.5" stroke-linecap="round" opacity="0.9"/>` +
    `<circle r="4" fill="${SEL_VIOLET}"/>`;
  document.body.appendChild(selLeader);
  const toWindow = Cesium.SceneTransforms.worldToWindowCoordinates || Cesium.SceneTransforms.wgs84ToWindowCoordinates;
  viewer.scene.postRender.addEventListener(() => {
    if (!selPinPos || selCard.style.display === 'none' || selectionHidden) { selLeader.style.display = 'none'; return; }
    const w = toWindow(viewer.scene, selPinPos);
    if (!w) { selLeader.style.display = 'none'; return; }
    const c = viewer.canvas.getBoundingClientRect();
    const px = c.left + w.x, py = c.top + w.y;
    const r = selCard.getBoundingClientRect();
    if (px > r.left - 8) { selLeader.style.display = 'none'; return; }   // pin is behind the card
    const ex = r.left, ey = Math.min(Math.max(py, r.top + 30), r.bottom - 30);
    const line = selLeader.firstChild, dot = selLeader.lastChild;
    line.setAttribute('x1', px); line.setAttribute('y1', py); line.setAttribute('x2', ex); line.setAttribute('y2', ey);
    dot.setAttribute('cx', ex); dot.setAttribute('cy', ey);
    selLeader.style.display = 'block';
  });
}

function showSelectionCard(b, idx) {
  _selEnsureDom();
  const token = ++selToken;
  const city = window.VIEWER_CITY || {};
  const profile = (typeof VIEWER_PROFILE !== 'undefined' && VIEWER_PROFILE) || {};
  const place = [city.name, profile.country_name || (document.body.getAttribute('data-country') === 'se' ? 'Sweden' : null)]
    .filter(Boolean).join(', ');
  const country = profile.country || document.body.getAttribute('data-country') || 'se';

  // Energy class: real certificate, estimated band, or none (Belgium has no open EPCs).
  let badge;
  if (b.eclass) {
    const col = ECLASS_COLORS_CSS[b.eclass] || '#cbd5e1';
    const est = country === 'gb' && b.has_epc === false;
    badge = `<b style="background:${col}">${_selEsc(b.eclass)}</b><span>Energy class${est ? ' (est.)' : ''}</span>`;
  } else {
    badge = `<b style="background:#f1f5f9;color:#94a3b8">—</b><span>${country === 'be' ? 'No open EPC' : 'No EPC'}</span>`;
  }

  const rows = [];
  const row = (icon, lbl, val, note) => {
    if (val == null || val === '') return;
    rows.push(`<div class="sc-row"><svg viewBox="0 0 24 24">${SEL_ICONS[icon]}</svg><span class="sc-lbl">${lbl}</span>` +
      `<span class="sc-val">${val}${note ? `<small>${note}</small>` : ''}</span></div>`);
  };
  row('use', 'Use', USE_LABELS[b.use_cat] || (b.use_cat ? _selEsc(b.use_cat.replace(/_/g, ' ')) : null));
  if (b.energy != null) row('energy', 'Energy use', `${Math.round(b.energy)} kWh/m²/yr`);
  else if (b.tabula_kwh_m2_yr != null) row('energy', 'Energy use',
    `<span title="TABULA archetype heating need - no certificate for this building">${Math.round(b.tabula_kwh_m2_yr)} kWh/m²/yr</span>`, 'est.');
  if (b.year) row('year', 'Year built', b.year, ESTIMATED_YEAR.has(b.year_source) ? 'est.' : '');
  // Sweden: `area` is the EPC's Atemp (heated floor area); UK: certified heated area.
  const area = b.area || b.atemp || b.area_atemp || b.heated_area_m2 || b.floor_area_m2;
  if (area) row('area', 'Floor area', `${Math.round(area).toLocaleString('en-US')} m²`);
  else if (b.gross_floor_area_m2 || (b.footprint_m2 && b.floors))
    row('area', 'Floor area', `${Math.round(b.gross_floor_area_m2 || b.footprint_m2 * b.floors).toLocaleString('en-US')} m²`, 'gross est.');
  if (b.height) row('height', 'Height', `${Math.round(b.height)} m`);
  if (b.floors) row('floors', 'Floors', b.floors);

  selCard.innerHTML =
    `<div class="sc-head"><div><h3>${_selEsc(b.address || b.all_addresses || 'Building')}</h3>` +
      (place ? `<div class="sc-sub"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:#94a3b8;fill:none;stroke-width:2">${SEL_ICONS.pin}</svg>${_selEsc(place)}</div>` : '') +
    `</div><div style="display:flex;gap:6px;align-items:flex-start"><div class="sc-badge">${badge}</div>` +
    `<button class="sc-close" aria-label="Close">&#x2715;</button></div></div>` +
    `<div class="sc-body"><div>${rows.join('')}</div>` +
    `<div><div class="sc-photo"><div class="sc-msg sc-loading">Loading street view…</div></div><div class="sc-credit"></div></div></div>`;
  selCard.querySelector('.sc-close').onclick = hideInfoPanel;
  selCard.style.display = 'block';

  // Street-level photo, fetched once per building per session.
  const ring = b.coordinates && b.coordinates[0];
  if (!ring || !ring.length) return _selPhoto(null, { error: 'No location' });
  const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
  const lon = ring.reduce((s, c) => s + c[0], 0) / ring.length;
  const cached = selPhotoCache.get(idx);
  if (cached) return _selPhoto(token, cached);
  // Midpoints of the longest walls, for blocks whose centre is far from any street.
  const walls = [];
  for (let i = 0; i + 1 < ring.length; i++) {
    const [a, c] = [ring[i], ring[i + 1]];
    walls.push({ len: Math.hypot((c[0] - a[0]) * Math.cos(lat * Math.PI / 180), c[1] - a[1]), lat: (a[1] + c[1]) / 2, lon: (a[0] + c[0]) / 2 });
  }
  const alt = walls.sort((x, y) => y.len - x.len).slice(0, 6).map((w) => `${w.lat.toFixed(6)},${w.lon.toFixed(6)}`).join(';');
  const q = `lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}` + (b.height ? `&height_m=${Math.min(300, Math.max(1, b.height)).toFixed(1)}` : '') +
    (alt ? `&walls=${encodeURIComponent(alt)}` : '');
  fetch(`/api/streetview/thumbnail?${q}`)
    .then(async (r) => r.ok ? r.json() : { error: r.status === 404 ? 'No street-level photo near this building' : r.status === 503 ? 'Street View not configured' : 'Photo unavailable' })
    .catch(() => ({ error: 'Photo unavailable' }))
    .then((res) => { selPhotoCache.set(idx, res); _selPhoto(token, res); });
}

function _selPhoto(token, res) {
  if (token !== null && token !== selToken) return;   // another building was selected meanwhile
  const box = selCard.querySelector('.sc-photo'), credit = selCard.querySelector('.sc-credit');
  if (!box) return;
  if (res && res.image) {
    box.innerHTML = `<img alt="Street view of the building" src="${res.image}">`;
    credit.textContent = `${res.copyright || '© Google'}${res.date ? ' · ' + res.date : ''}`;
  } else {
    box.innerHTML = `<div class="sc-msg">${_selEsc((res && res.error) || 'Photo unavailable')}</div>`;
    credit.textContent = '';
  }
}

// =============================================================
// Draggable floating panels
//
// The facade inspector opens over the middle of the map — exactly where the
// building being inspected is. Rather than guess a position that is always out
// of the way, let it be moved, and remember where it was put.
// =============================================================
(function initDraggablePanels() {
  const LS_KEY = 'ppg.viewer.panelPos';

  function readPos() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (_e) { return {}; }
  }
  function writePos(all) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(all)); } catch (_e) { /* private mode */ }
  }

  // Keep at least this much of the panel on screen, so it can never be dragged
  // somewhere it cannot be grabbed again.
  const KEEP_VISIBLE = 60;

  function clampToViewport(panel, left, top) {
    const w = panel.offsetWidth, h = panel.offsetHeight;
    return {
      left: Math.min(Math.max(left, KEEP_VISIBLE - w), window.innerWidth - KEEP_VISIBLE),
      top:  Math.min(Math.max(top, 0), window.innerHeight - KEEP_VISIBLE),
    };
  }

  function place(panel, left, top) {
    const c = clampToViewport(panel, left, top);
    panel.classList.add('fi-moved');       // clears the centring transform
    panel.style.left = c.left + 'px';
    panel.style.top = c.top + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function makeDraggable(panel, handle, key) {
    if (!panel || !handle) return;

    const saved = readPos()[key];
    if (saved) {
      // Restore only once the panel has a size to clamp against.
      const restore = () => { if (panel.offsetWidth) place(panel, saved.left, saved.top); };
      if (panel.offsetWidth) restore(); else setTimeout(restore, 0);
    }

    handle.addEventListener('pointerdown', (e) => {
      // Let the close button and any other control in the header still work.
      if (e.target.closest('button')) return;
      e.preventDefault();
      const rect = panel.getBoundingClientRect();
      const dx = e.clientX - rect.left, dy = e.clientY - rect.top;
      handle.setPointerCapture(e.pointerId);

      const onMove = (ev) => place(panel, ev.clientX - dx, ev.clientY - dy);
      const onUp = () => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        const all = readPos();
        all[key] = { left: parseInt(panel.style.left, 10), top: parseInt(panel.style.top, 10) };
        writePos(all);
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
    });
  }

  makeDraggable(document.getElementById('facade-panel'),
                document.getElementById('facade-drag-handle'), 'facade');
  // The results panel is the facade inspector's other half — same treatment,
  // dragged by its title.
  const wwrPanel = document.getElementById('wwr-panel');
  if (wwrPanel) makeDraggable(wwrPanel, wwrPanel.querySelector('h2'), 'wwr');

  // A panel parked off-screen after a window resize would be unreachable.
  window.addEventListener('resize', () => {
    for (const id of ['facade-panel', 'wwr-panel']) {
      const panel = document.getElementById(id);
      if (panel && panel.classList.contains('fi-moved')) {
        place(panel, parseInt(panel.style.left, 10) || 0, parseInt(panel.style.top, 10) || 0);
      }
    }
  });

  window.makeDraggablePanel = makeDraggable;
})();
