// =============================================================
// legend.js — Legend tabs, performance cards, compare basket
// Depends on: DATA (the building array). Performance cards (best/worst per
//   use/class/era + median energy) are computed live from DATA below, so the
//   legend works for any country/city without build-time card injection.
// =============================================================

const USE_LABELS_JS = {
  bostad_enfamilj:   'Single-family residential',
  bostad_flerfamilj: 'Multi-family residential',
  verksamhet:        'Commercial / Workplace',
  industri:          'Industrial',
  samhalle:          'Public / School / Care',
  komplement:        'Complement (garage/shed)',
  ovrigt:            'Other / Unknown',
};
const ECLASS_LABELS_JS = {
  A:'A – Very efficient', B:'B – Efficient', C:'C – Above average',
  D:'D – Average', E:'E – Below average', F:'F – Poor', G:'G – Very poor',
};
const USE_CSS = {
  bostad_enfamilj:'rgb(255,165,50)',   bostad_flerfamilj:'rgb(255,210,60)',
  verksamhet:'rgb(70,180,255)',         industri:'rgb(200,80,60)',
  samhalle:'rgb(70,210,140)',           komplement:'rgb(140,140,160)',
  ovrigt:'rgb(160,120,200)',
};
// EPC and Boverket both band energy A–G, so this palette is country-independent.
const ECLASS_CSS = {
  A:'rgb(22,163,74)',   B:'rgb(74,222,128)',  C:'rgb(190,242,60)',
  D:'rgb(250,204,21)',  E:'rgb(251,146,60)',  F:'rgb(239,68,68)',
  G:'rgb(153,27,27)',
};

// Construction eras are the one dimension that genuinely differs by country:
// Sweden uses TABULA periods, the UK uses English Housing Survey age bands. The
// active set comes from the build-time profile; these are the Swedish defaults.
const PERIOD_LABELS_JS = (window.VIEWER_PROFILE && window.VIEWER_PROFILE.period_labels) || {
  '...1960':'Pre-1960','1961-1975':'1961–1975','1976-1985':'1976–1985',
  '1986-1995':'1986–1995','1996-2005':'1996–2005','post-2005':'Post-2005',
};
const PERIOD_CSS = (window.VIEWER_PROFILE && window.VIEWER_PROFILE.period_colors) || {
  '...1960':'rgb(100,149,237)', '1961-1975':'rgb(255,165,50)',
  '1976-1985':'rgb(154,205,50)','1986-1995':'rgb(218,165,32)',
  '1996-2005':'rgb(255,99,71)', 'post-2005':'rgb(147,112,219)',
};

// Count buildings per key AND build the best/worst performance cards live
// from the DATA array (computed once at load).
//
// The cards used to be injected by build.py as PERIOD_CARDS/ECLASS_CARDS/
// USE_CARDS/PERIOD_STATS constants - but the UK build injects EMPTY objects
// for those (its per-era energy stats weren't precomputed), so the UK legend
// showed counts only, with nothing clickable and no median energy. Computing
// them here from DATA makes the legend country-agnostic and always current:
//   - energy metric  = measured EPC value (Sweden) OR the TABULA estimate (UK)
//   - construction era = real period OR the EHS-sampled era used for the UK
//     archetype (tabula_period is null for most UK buildings; tabula_period_used
//     carries the era the archetype was actually matched on)
const _useCounts = {}, _eclassCounts = {}, _periodCounts = {};
const _byUse = {}, _byEclass = {}, _byPeriod = {};
for (let i = 0; i < DATA.length; i++) {
  const b = DATA[i];
  const energy = (b.energy != null ? b.energy : b.tabula_kwh_m2_yr);
  const period = b.tabula_period || b.tabula_period_used || null;
  _useCounts[b.use_cat] = (_useCounts[b.use_cat] || 0) + 1;
  // Outbuildings never have their own certificate (older data gave them the house's).
  const isOut = b.use_cat === 'komplement';
  if (b.eclass && !isOut) _eclassCounts[b.eclass] = (_eclassCounts[b.eclass] || 0) + 1;
  if (period && !isOut)   _periodCounts[period]   = (_periodCounts[period]   || 0) + 1;

  if (energy != null) {
    const card = {
      idx: i, addr: b.address || '(no address)', energy: Math.round(energy),
      eclass: b.eclass || null, year: b.year || null,
      area: b.footprint_m2 ? Math.round(b.footprint_m2) : null, period,
    };
    if (!_byUse[b.use_cat]) _byUse[b.use_cat] = [];
    _byUse[b.use_cat].push(card);
    if (b.eclass && !isOut) { if (!_byEclass[b.eclass]) _byEclass[b.eclass] = []; _byEclass[b.eclass].push(card); }
    if (period && !isOut)   { if (!_byPeriod[period])   _byPeriod[period]   = []; _byPeriod[period].push(card); }
  }
}

// Buildings outside every bucket are painted grey on the map (cesium.js
// getBuildingColor); the legend lists them too so the key accounts for every building.
const _sumCounts = (c) => Object.values(c).reduce((a, n) => a + n, 0);
const _NONE_CSS = 'rgba(60,60,70,0.55)';
// "Energy certificate", "Energy class" and "Year era" modes (cesium.js getBuildingColor):
// outbuildings (komplement) are greyed out and not counted - they never need a certificate.
let _epcHas = 0, _epcNone = 0, _epcExcluded = 0;
for (let i = 0; i < DATA.length; i++) {
  const b = DATA[i];
  if (b.use_cat === 'komplement') _epcExcluded++;
  else if (b.eclass || b.energy != null) _epcHas++;
  else _epcNone++;
}
const _noEclass = DATA.length - _epcExcluded - _sumCounts(_eclassCounts);
const _noPeriod = DATA.length - _epcExcluded - _sumCounts(_periodCounts);
const _OUTBUILDING_NOTE = () => 'Outbuildings (garages, sheds, waste rooms) are greyed out and not counted: '
  + _epcExcluded.toLocaleString() + ' buildings. They never need a certificate.';

// Header stats for the city actually loaded. The page ships Gothenburg's figures
// (92,973 buildings · 85,670 EPC matched · 26,263 TABULA matched) and nothing
// replaced them, so Nacka, Malmö, ... showed Gothenburg's numbers. Same
// definitions as the home page's dataset card: has_epc / a TABULA era.
(function updateHeaderStats() {
  try {
    const n = DATA.length;
    const epc = DATA.filter((b) => b.has_epc).length;
    const tab = DATA.filter((b) => b.tabula_period).length;
    const nums = document.querySelectorAll('.stat-box .stat-num');
    if (nums[0]) nums[0].textContent = epc.toLocaleString('en-GB');
    if (nums[1]) nums[1].textContent = tab.toLocaleString('en-GB');
    const sub = document.getElementById('city-subtitle');
    if (sub) sub.textContent = sub.textContent.replace(/[\d,]+ buildings/, n.toLocaleString('en-GB') + ' buildings');
    const info = document.querySelector('.info-btn[data-title="Buildings"]');
    if (info) info.setAttribute('data-desc', info.getAttribute('data-desc')
      .replace(/^[\d,]+ building footprints/, n.toLocaleString('en-GB') + ' building footprints')
      .replace(' for Gothenburg.', '.'));
  } catch (e) { /* header stats are cosmetic */ }
})();

function _bestWorst(list, n = 15) {
  const sorted = [...list].sort((a, b) => a.energy - b.energy);
  return { best: sorted.slice(0, n), worst: sorted.slice(-n).reverse() };
}
function _medianEnergy(list) {
  if (!list.length) return null;
  const vals = list.map(c => c.energy).sort((a, b) => a - b);
  const m = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[m] : Math.round((vals[m - 1] + vals[m]) / 2);
}

// Computed replacements for the (possibly empty) build-injected card constants.
const _USE_CARDS = {}, _ECLASS_CARDS = {}, _PERIOD_CARDS = {}, _PERIOD_STATS = {};
for (const k in _byUse) {
  _USE_CARDS[k] = { buildings: [..._byUse[k]].sort((a, b) => a.energy - b.energy).slice(0, 100) };
}
for (const k in _byEclass) _ECLASS_CARDS[k] = _bestWorst(_byEclass[k]);
for (const k in _byPeriod) {
  _PERIOD_CARDS[k] = _bestWorst(_byPeriod[k]);
  _PERIOD_STATS[k] = { median_kwh: _medianEnergy(_byPeriod[k]) };
}

function updateLegend(mode) {
  const container = document.getElementById('legend-container');
  let rows = [];
  let note = '';

  if (mode === 'epc') {
    const pct = (n) => (_epcHas + _epcNone) ? ' (' + Math.round(100 * n / (_epcHas + _epcNone)) + '%)' : '';
    rows = [
      { key: 'has',  lbl: 'Has an energy certificate' + pct(_epcHas),  color: 'rgb(50,130,220)', cnt: _epcHas,  hasCards: false },
      { key: 'none', lbl: 'No energy certificate' + pct(_epcNone),     color: 'rgb(240,140,30)', cnt: _epcNone, hasCards: false },
    ];
    note = _OUTBUILDING_NOTE();
    container.innerHTML = '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Energy certificate</div>';

  } else if (mode === 'use') {
    rows = Object.entries(USE_LABELS_JS).map(([key, lbl]) => {
      const cnt = _useCounts[key] || 0;
      const cards = _USE_CARDS[key];
      return { key, lbl, color: USE_CSS[key], cnt, hasCards: cards && cards.buildings.length > 0 };
    });
    container.innerHTML = '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Building use type</div>';

  } else if (mode === 'eclass') {
    rows = Object.entries(ECLASS_LABELS_JS).map(([key, lbl]) => {
      const cnt = _eclassCounts[key] || 0;
      const cards = _ECLASS_CARDS[key];
      return { key, lbl, color: ECLASS_CSS[key], cnt, hasCards: cards && (cards.best.length || cards.worst.length) };
    });
    if (_noEclass > 0) rows.push({ key: '_none', lbl: 'Unknown – no energy class', color: _NONE_CSS, cnt: _noEclass, hasCards: false });
    note = _OUTBUILDING_NOTE();
    container.innerHTML = '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Energy class (A–G)</div>';

  } else { // year/period
    rows = Object.keys(PERIOD_LABELS_JS).map(key => {
      const cnt = _periodCounts[key] || 0;
      const st  = _PERIOD_STATS[key] || {};
      const cards = _PERIOD_CARDS[key];
      const sub = st.median_kwh ? ' · ' + st.median_kwh + ' kWh/m²' : '';
      return { key, lbl: PERIOD_LABELS_JS[key] + sub, color: PERIOD_CSS[key], cnt, hasCards: cards && (cards.best.length || cards.worst.length) };
    });
    if (_noPeriod > 0) rows.push({ key: '_none', lbl: 'Unknown – no construction year', color: _NONE_CSS, cnt: _noPeriod, hasCards: false });
    note = _OUTBUILDING_NOTE();
    container.innerHTML = '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Construction era</div>';
  }

  for (const r of rows) {
    const div = document.createElement('div');
    div.className = 'legend-row';
    div.style.cssText = 'display:flex;align-items:center;gap:6px;margin:5px 0;font-size:11px;cursor:'+(r.hasCards?'pointer':'default')+';border-radius:6px;padding:3px 5px;transition:background .15s';
    div.innerHTML = '<div style="width:12px;height:12px;border-radius:3px;background:'+r.color+';flex-shrink:0"></div>'
      + '<span style="flex:1">'+r.lbl+'</span>'
      + '<span style="color:var(--faint);font-size:10px">'+r.cnt.toLocaleString()+'</span>'
      + (r.hasCards ? '<span style="margin-left:4px;font-size:10px;color:#c1afd6" title="Click to see best/worst">&#9654;</span>' : '');
    if (r.hasCards) {
      const _key = r.key, _mode = mode;
      // Interactive rows are real controls: reachable and operable by keyboard.
      div.setAttribute('role', 'button');
      div.setAttribute('tabindex', '0');
      div.setAttribute('aria-label', r.lbl + ' — show best and worst performers');
      div.addEventListener('mouseenter', () => div.style.background = 'rgba(193,175,214,0.1)');
      div.addEventListener('mouseleave', () => div.style.background = '');
      div.addEventListener('focus', () => div.style.background = 'rgba(193,175,214,0.16)');
      div.addEventListener('blur', () => div.style.background = '');
      div.addEventListener('click', () => showPerfCards(_mode, _key));
      div.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showPerfCards(_mode, _key); }
      });
    }
    container.appendChild(div);
  }
  if (note) {
    const n = document.createElement('div');
    n.style.cssText = 'margin-top:6px;font-size:10px;line-height:1.4;color:var(--faint)';
    n.textContent = note;
    container.appendChild(n);
  }
}

// ─────────────────────────────────────────────────────────────────
// Performance card panel — sortable + compare
// ─────────────────────────────────────────────────────────────────
const ECLASS_BADGE = { A:'#16a34a',B:'#4ade80',C:'#bef264',D:'#facc15',E:'#fb923c',F:'#ef4444',G:'#991b1b' };
const ECLASS_TEXT  = { A:'#fff',   B:'#000',   C:'#000',   D:'#000',   E:'#fff',   F:'#fff',   G:'#fff' };
const PERIOD_SHORT = { '...1960':'<1960','1961-1975':'61–75','1976-1985':'76–85','1986-1995':'86–95','1996-2005':'96–05','post-2005':'>2005' };

let _perfMode = null, _perfKey = null;
let _sortMode  = 'energy';
let _compareSet = new Set();
let _perfList   = [];
let _perfLocated = null;   // DATA index of the card last shown on the map

// Fly to a listed building and select it exactly as a click on the map would
// (highlight, roof pin, info card), so the best/worst list can be read in place.
function _perfLocate(idx) {
  const b = DATA[idx];
  const ring = b && b.coordinates && b.coordinates[0];
  if (!ring || !ring.length) return;
  let lon = 0, lat = 0;
  for (const [lo, la] of ring) { lon += lo; lat += la; }
  lon /= ring.length; lat /= ring.length;
  const baseH = (typeof window.getBuildingBaseOffset === 'function') ? window.getBuildingBaseOffset(lon, lat) : 0;
  const centre = Cesium.Cartesian3.fromDegrees(lon, lat, baseH + (b.height || 6) / 2);
  viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(centre, 25), {
    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-40), 220),
    duration: 1.5,
  });
  showInfoPanel(b, idx);
  if (window.isPhotoMode && window.isPhotoMode()) window.setSelectedBuilding(idx);
  _perfLocated = idx;
  renderPerfList();
}

function showPerfCards(mode, key) {
  _perfMode = mode; _perfKey = key;
  _compareSet.clear();
  _perfLocated = null;

  if (mode === 'use') {
    const entry = _USE_CARDS[key];
    if (!entry || !entry.buildings.length) return;
    _perfList = [...entry.buildings];
    document.getElementById('perf-title').textContent = USE_LABELS_JS[key];
    document.getElementById('perf-sub').textContent = _perfList.length + ' buildings with energy data';
  } else if (mode === 'eclass') {
    const cards = _ECLASS_CARDS[key];
    if (!cards) return;
    const seen = new Set();
    _perfList = [...cards.best, ...cards.worst].filter(c => { const ok = !seen.has(c.addr); seen.add(c.addr); return ok; });
    document.getElementById('perf-title').textContent = 'Energy Class ' + key;
    document.getElementById('perf-sub').textContent = (ECLASS_LABELS_JS[key]||key) + ' · ' + _perfList.length + ' shown';
  } else {
    const cards = _PERIOD_CARDS[key];
    if (!cards) return;
    const seen = new Set();
    _perfList = [...cards.best, ...cards.worst].filter(c => { const ok = !seen.has(c.addr); seen.add(c.addr); return ok; });
    document.getElementById('perf-title').textContent = PERIOD_LABELS_JS[key] || key;
    document.getElementById('perf-sub').textContent = 'Construction era · ' + _perfList.length + ' shown';
  }

  _sortMode = 'energy';
  renderPerfList();
  document.getElementById('token-panel').style.display = 'none';
  document.getElementById('perf-panel').style.display = 'flex';
}

function renderPerfList() {
  const sorted = [..._perfList].sort((a,b) => {
    if (_sortMode === 'year')   return (a.year||9999) - (b.year||9999);
    if (_sortMode === 'eclass') return (a.eclass||'Z').localeCompare(b.eclass||'Z');
    return (a.energy||9999) - (b.energy||9999);
  });

  const tabs = [['energy','⚡ Energy'],['year','📅 Year built'],['eclass','🏷 Class']].map(([m,lbl]) =>
    '<button onclick="_sortMode=\''+m+'\';renderPerfList()" style="flex:1;padding:5px 0;font-size:11px;border:none;border-radius:6px;cursor:pointer;font-family:inherit;'
    +(_sortMode===m ? 'background:#9171b6;color:#fff;font-weight:600' : 'background:rgba(0,0,0,0.07);color:var(--muted)')
    +'">'+lbl+'</button>'
  ).join('');

  let cmpHtml = '';
  if (_compareSet.size >= 2) {
    const sel = sorted.filter(b => _compareSet.has(b.addr));
    const minE = Math.min(...sel.map(b=>b.energy||999));
    const maxE = Math.max(...sel.map(b=>b.energy||0));
    cmpHtml = '<div style="background:#7c3aed22;border:1px solid #7c3aed55;border-radius:8px;padding:10px;margin-bottom:8px">';
    cmpHtml += '<div style="font-weight:600;color:#7e58a9;font-size:11px;margin-bottom:8px">⚖ Compare ('+_compareSet.size+')</div>';
    for (const b of sel) {
      const span = maxE > minE ? (b.energy - minE)/(maxE - minE) : 0.5;
      const pct  = Math.round(span * 100);
      const barC = pct < 33 ? '#15803d' : pct < 66 ? '#b45309' : '#dc2626';
      const badge = b.eclass ? '<span style="background:'+(ECLASS_BADGE[b.eclass]||'#555')+';color:'+(ECLASS_TEXT[b.eclass]||'#fff')+';border-radius:3px;padding:0 4px;font-size:9px">'+b.eclass+'</span>' : '';
      cmpHtml += '<div style="margin-bottom:7px">';
      cmpHtml +=   '<div style="display:flex;align-items:center;gap:5px"><span style="flex:1;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+b.addr+'</span>'+badge+'</div>';
      cmpHtml +=   '<div style="display:flex;align-items:center;gap:6px;margin-top:3px">';
      cmpHtml +=     '<div style="flex:1;height:6px;background:rgba(0,0,0,0.1);border-radius:3px"><div style="width:'+Math.max(4,pct)+'%;height:100%;background:'+barC+';border-radius:3px;transition:width .3s"></div></div>';
      cmpHtml +=     '<span style="font-size:11px;color:'+barC+';font-weight:700;white-space:nowrap">'+b.energy+' kWh/m²</span>';
      cmpHtml +=   '</div>';
      const meta = [b.year?'Built '+b.year:'', b.area?b.area+' m²':''].filter(Boolean).join(' · ');
      if (meta) cmpHtml += '<div style="font-size:9px;color:var(--faint);margin-top:1px">'+meta+'</div>';
      cmpHtml += '</div>';
    }
    cmpHtml += '</div>';
  }

  let rows = '';
  for (const b of sorted) {
    const inCmp = _compareSet.has(b.addr);
    const isLoc = b.idx === _perfLocated;
    const ec    = b.energy || 0;
    const eColor = ec < 100 ? '#15803d' : ec < 200 ? '#b45309' : '#dc2626';
    const badge = b.eclass
      ? '<span style="background:'+(ECLASS_BADGE[b.eclass]||'#555')+';color:'+(ECLASS_TEXT[b.eclass]||'#fff')+';border-radius:3px;padding:1px 5px;font-size:10px">'+b.eclass+'</span>'
      : '<span style="color:var(--faint);font-size:10px">–</span>';
    const perBadge = b.period
      ? '<span style="background:rgba(0,0,0,0.07);border-radius:3px;padding:1px 4px;font-size:9px;color:var(--muted)">'+(PERIOD_SHORT[b.period]||b.period)+'</span>'
      : '';
    const meta = [b.year?'Built '+b.year:'', b.area?b.area+' m²':''].filter(Boolean).join(' · ');
    const safeAddr = (b.addr||'').replace(/"/g,'&quot;');
    rows += '<div data-addr="'+safeAddr+'" data-idx="'+b.idx+'" class="pr"'
      + ' style="background:'+(inCmp?'rgba(145,113,182,0.18)':'rgba(0,0,0,0.04)')+';border-radius:8px;padding:8px 10px;margin:4px 0;cursor:pointer;'
      + 'border:1px solid '+(inCmp?'#9171b6':'transparent')+';'+(isLoc?'box-shadow:inset 3px 0 0 #9171b6;':'')+'transition:all .15s">';
    rows +=   '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">'
            + '<span style="flex:1;font-size:11px;font-weight:600;line-height:1.3">'+b.addr+'</span>'
            + badge + ' ' + perBadge
            + '<button class="pr-loc" title="Show on map" aria-label="Show '+safeAddr+' on map"'
            + ' style="border:1px solid '+(isLoc?'#9171b6':'rgba(15,23,42,0.15)')+';background:'+(isLoc?'#9171b6':'#fff')+';color:'+(isLoc?'#fff':'#475569')+';'
            + 'border-radius:6px;padding:1px 6px;font-size:11px;line-height:16px;cursor:pointer;font-family:inherit">📍</button>'
            + '</div>';
    rows +=   '<div style="display:flex;align-items:center;gap:6px;margin-top:4px">'
            + '<span style="font-size:13px;font-weight:700;color:'+eColor+'">'+b.energy+'</span>'
            + '<span style="font-size:10px;color:var(--muted)">kWh/m²</span>'
            + (meta?'<span style="font-size:10px;color:var(--faint);margin-left:auto">'+meta+'</span>':'')
            + '</div>';
    rows += '</div>';
  }

  const hint = '<div style="text-align:center;font-size:10px;color:var(--muted);padding:8px 0">📍 shows the building on the map · tap a card to compare (max 3)</div>';

  document.getElementById('perf-content').innerHTML =
    '<div style="display:flex;gap:4px;margin-bottom:10px">'+tabs+'</div>'
    + cmpHtml + rows + hint;

  document.querySelectorAll('#perf-content .pr').forEach(el => {
    const addr = el.getAttribute('data-addr');
    el.addEventListener('click', () => toggleCompare(addr));
    el.querySelector('.pr-loc').addEventListener('click', (e) => {
      e.stopPropagation();   // locating is separate from adding to compare
      _perfLocate(Number(el.getAttribute('data-idx')));
    });
    el.addEventListener('mouseenter', () => { el.style.background = 'rgba(0,0,0,0.08)'; });
    el.addEventListener('mouseleave', () => { el.style.background = _compareSet.has(addr) ? 'rgba(145,113,182,0.18)' : 'rgba(0,0,0,0.04)'; });
  });
}

function toggleCompare(addr) {
  if (_compareSet.has(addr)) { _compareSet.delete(addr); renderPerfList(); return; }
  if (_compareSet.size >= 3) return;
  _compareSet.add(addr);
  renderPerfList();
}

document.getElementById('perf-close').addEventListener('click', () => {
  document.getElementById('perf-panel').style.display = 'none';
  // The selection card made room for the list; give it its corner back.
  if (typeof selCard !== 'undefined' && selCard) selCard.style.right = '';
});
