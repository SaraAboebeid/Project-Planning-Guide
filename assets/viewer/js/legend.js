// =============================================================
// legend.js — Legend tabs, performance cards, compare basket
// Depends on: DATA, PERIOD_CARDS, ECLASS_CARDS, USE_CARDS,
//             PERIOD_STATS (all injected by build.py as constants)
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
const PERIOD_LABELS_JS = {
  '...1960':'Pre-1960','1961-1975':'1961–1975','1976-1985':'1976–1985',
  '1986-1995':'1986–1995','1996-2005':'1996–2005','post-2005':'Post-2005',
};
const USE_CSS = {
  bostad_enfamilj:'rgb(255,165,50)',   bostad_flerfamilj:'rgb(255,210,60)',
  verksamhet:'rgb(70,180,255)',         industri:'rgb(200,80,60)',
  samhalle:'rgb(70,210,140)',           komplement:'rgb(140,140,160)',
  ovrigt:'rgb(160,120,200)',
};
const ECLASS_CSS = {
  A:'rgb(22,163,74)',   B:'rgb(74,222,128)',  C:'rgb(190,242,60)',
  D:'rgb(250,204,21)',  E:'rgb(251,146,60)',  F:'rgb(239,68,68)',
  G:'rgb(153,27,27)',
};
const PERIOD_CSS = {
  '...1960':'rgb(100,149,237)', '1961-1975':'rgb(255,165,50)',
  '1976-1985':'rgb(154,205,50)','1986-1995':'rgb(218,165,32)',
  '1996-2005':'rgb(255,99,71)', 'post-2005':'rgb(147,112,219)',
};

// Count buildings per key from DATA array (computed once at load)
const _useCounts = {}, _eclassCounts = {}, _periodCounts = {};
for (const b of DATA) {
  _useCounts[b.use_cat]         = (_useCounts[b.use_cat]         || 0) + 1;
  if (b.eclass)        _eclassCounts[b.eclass]        = (_eclassCounts[b.eclass]        || 0) + 1;
  if (b.tabula_period) _periodCounts[b.tabula_period] = (_periodCounts[b.tabula_period] || 0) + 1;
}

function updateLegend(mode) {
  const container = document.getElementById('legend-container');
  let rows = [];

  if (mode === 'use') {
    rows = Object.entries(USE_LABELS_JS).map(([key, lbl]) => {
      const cnt = _useCounts[key] || 0;
      const cards = USE_CARDS[key];
      return { key, lbl, color: USE_CSS[key], cnt, hasCards: cards && cards.buildings.length > 0 };
    });
    container.innerHTML = '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Building use type</div>';

  } else if (mode === 'eclass') {
    rows = Object.entries(ECLASS_LABELS_JS).map(([key, lbl]) => {
      const cnt = _eclassCounts[key] || 0;
      const cards = ECLASS_CARDS[key];
      return { key, lbl, color: ECLASS_CSS[key], cnt, hasCards: cards && (cards.best.length || cards.worst.length) };
    });
    container.innerHTML = '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Energy class (A–G)</div>';

  } else { // year/period
    rows = Object.keys(PERIOD_LABELS_JS).map(key => {
      const cnt = _periodCounts[key] || 0;
      const st  = PERIOD_STATS[key] || {};
      const cards = PERIOD_CARDS[key];
      const sub = st.median_kwh ? ' · ' + st.median_kwh + ' kWh/m²' : '';
      return { key, lbl: PERIOD_LABELS_JS[key] + sub, color: PERIOD_CSS[key], cnt, hasCards: cards && (cards.best.length || cards.worst.length) };
    });
    container.innerHTML = '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Construction era</div>';
  }

  for (const r of rows) {
    const div = document.createElement('div');
    div.className = 'legend-row';
    div.style.cssText = 'display:flex;align-items:center;gap:6px;margin:5px 0;font-size:11px;cursor:'+(r.hasCards?'pointer':'default')+';border-radius:6px;padding:3px 5px;transition:background .15s';
    div.innerHTML = '<div style="width:12px;height:12px;border-radius:3px;background:'+r.color+';flex-shrink:0"></div>'
      + '<span style="flex:1">'+r.lbl+'</span>'
      + '<span style="color:var(--faint);font-size:10px">'+r.cnt.toLocaleString()+'</span>'
      + (r.hasCards ? '<span style="margin-left:4px;font-size:10px;color:#a78bfa" title="Click to see best/worst">&#9654;</span>' : '');
    if (r.hasCards) {
      const _key = r.key, _mode = mode;
      div.addEventListener('mouseenter', () => div.style.background = 'rgba(167,139,250,0.1)');
      div.addEventListener('mouseleave', () => div.style.background = '');
      div.addEventListener('click', () => showPerfCards(_mode, _key));
    }
    container.appendChild(div);
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

function showPerfCards(mode, key) {
  _perfMode = mode; _perfKey = key;
  _compareSet.clear();

  if (mode === 'use') {
    const entry = USE_CARDS[key];
    if (!entry || !entry.buildings.length) return;
    _perfList = [...entry.buildings];
    document.getElementById('perf-title').textContent = USE_LABELS_JS[key];
    document.getElementById('perf-sub').textContent = _perfList.length + ' buildings with EPC data';
  } else if (mode === 'eclass') {
    const cards = ECLASS_CARDS[key];
    if (!cards) return;
    const seen = new Set();
    _perfList = [...cards.best, ...cards.worst].filter(c => { const ok = !seen.has(c.addr); seen.add(c.addr); return ok; });
    document.getElementById('perf-title').textContent = 'Energy Class ' + key;
    document.getElementById('perf-sub').textContent = (ECLASS_LABELS_JS[key]||key) + ' · ' + _perfList.length + ' shown';
  } else {
    const cards = PERIOD_CARDS[key];
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
    +(_sortMode===m ? 'background:#7c3aed;color:#fff;font-weight:600' : 'background:rgba(0,0,0,0.07);color:var(--muted)')
    +'">'+lbl+'</button>'
  ).join('');

  let cmpHtml = '';
  if (_compareSet.size >= 2) {
    const sel = sorted.filter(b => _compareSet.has(b.addr));
    const minE = Math.min(...sel.map(b=>b.energy||999));
    const maxE = Math.max(...sel.map(b=>b.energy||0));
    cmpHtml = '<div style="background:#7c3aed22;border:1px solid #7c3aed55;border-radius:8px;padding:10px;margin-bottom:8px">';
    cmpHtml += '<div style="font-weight:600;color:#a78bfa;font-size:11px;margin-bottom:8px">⚖ Compare ('+_compareSet.size+')</div>';
    for (const b of sel) {
      const span = maxE > minE ? (b.energy - minE)/(maxE - minE) : 0.5;
      const pct  = Math.round(span * 100);
      const barC = pct < 33 ? '#22c55e' : pct < 66 ? '#f59e0b' : '#ef4444';
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
    const ec    = b.energy || 0;
    const eColor = ec < 100 ? '#22c55e' : ec < 200 ? '#f59e0b' : '#ef4444';
    const badge = b.eclass
      ? '<span style="background:'+(ECLASS_BADGE[b.eclass]||'#555')+';color:'+(ECLASS_TEXT[b.eclass]||'#fff')+';border-radius:3px;padding:1px 5px;font-size:10px">'+b.eclass+'</span>'
      : '<span style="color:var(--faint);font-size:10px">–</span>';
    const perBadge = b.period
      ? '<span style="background:rgba(0,0,0,0.07);border-radius:3px;padding:1px 4px;font-size:9px;color:var(--muted)">'+(PERIOD_SHORT[b.period]||b.period)+'</span>'
      : '';
    const meta = [b.year?'Built '+b.year:'', b.area?b.area+' m²':''].filter(Boolean).join(' · ');
    const safeAddr = (b.addr||'').replace(/"/g,'&quot;');
    rows += '<div data-addr="'+safeAddr+'" class="pr"'
      + ' style="background:'+(inCmp?'rgba(124,58,237,0.18)':'rgba(0,0,0,0.04)')+';border-radius:8px;padding:8px 10px;margin:4px 0;cursor:pointer;'
      + 'border:1px solid '+(inCmp?'#7c3aed':'transparent')+';transition:all .15s">';
    rows +=   '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">'
            + '<span style="flex:1;font-size:11px;font-weight:600;line-height:1.3">'+b.addr+'</span>'
            + badge + ' ' + perBadge
            + '</div>';
    rows +=   '<div style="display:flex;align-items:center;gap:6px;margin-top:4px">'
            + '<span style="font-size:13px;font-weight:700;color:'+eColor+'">'+b.energy+'</span>'
            + '<span style="font-size:10px;color:var(--muted)">kWh/m²</span>'
            + (meta?'<span style="font-size:10px;color:var(--faint);margin-left:auto">'+meta+'</span>':'')
            + '</div>';
    rows += '</div>';
  }

  const hint = '<div style="text-align:center;font-size:10px;color:var(--faint);padding:8px 0">Tap a card to add to compare (max 3)</div>';

  document.getElementById('perf-content').innerHTML =
    '<div style="display:flex;gap:4px;margin-bottom:10px">'+tabs+'</div>'
    + cmpHtml + rows + hint;

  document.querySelectorAll('#perf-content .pr').forEach(el => {
    const addr = el.getAttribute('data-addr');
    el.addEventListener('click', () => toggleCompare(addr));
    el.addEventListener('mouseenter', () => { el.style.background = 'rgba(0,0,0,0.08)'; });
    el.addEventListener('mouseleave', () => { el.style.background = _compareSet.has(addr) ? 'rgba(124,58,237,0.18)' : 'rgba(0,0,0,0.04)'; });
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
});
