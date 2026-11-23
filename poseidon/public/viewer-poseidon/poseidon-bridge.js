/* Poseidon bridge for the shared 3D viewer.
   Injected ONLY by the Poseidon app (src/apps/Viewer3D.tsx) into the viewer it
   embeds (same origin), never loaded by the main planner. It:
     - marks <body class="poseidon"> so poseidon-theme.css applies
     - adds a "Poseidon" section to the left panel: colour the buildings by
       Poseidon stock (Boplats / added by you) or by renovation priority
       (the Renovation Wizard's 0–100 score), legend, counts, zoom
     - adds a Poseidon card to the selected-building panel with buttons that open
       the matching Poseidon windows (table, history, façade, add/remove)
   It hooks the viewer through its global functions (getBuildingColor,
   setColorMode, showInfoPanel, rebuildBuildings) and calls the originals, so
   every viewer feature keeps working. Talks to the app with postMessage,
   same-origin only. */
(function () {
  'use strict';
  if (window.__poseidonBridge) return;
  window.__poseidonBridge = true;
  document.body.classList.add('poseidon');

  const S = {
    mode: 'stock',                 // 'stock' | 'priority' | 'off'
    labels: {},                    // translated strings from the app
    byData: new Map(),             // DATA object → Poseidon item
    items: [],
    grid: null,                    // centroid grid over DATA
    hooked: false,
    rankOpen: false,               // the ranked-buildings list is open
    lastIdx: null,
  };
  const L = (k, vars) => {
    let s = S.labels[k] || k;
    if (vars) for (const v in vars) s = s.replace('{' + v + '}', vars[v]);
    return s;
  };
  const post = (msg) => window.parent.postMessage(Object.assign({ source: 'poseidon-bridge' }, msg), location.origin);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ── matching Poseidon ids ("lat,lon" outline centroids) to viewer buildings ── */
  function centroidOf(i) {
    const ring = DATA[i].coordinates && DATA[i].coordinates[0];
    if (!ring || ring.length < 3) return null;
    let lo = 0, la = 0;
    for (const p of ring) { lo += p[0]; la += p[1]; }
    return [la / ring.length, lo / ring.length];
  }
  const cellOf = (la, lo) => Math.floor(la * 2000) + ':' + Math.floor(lo * 1000);
  function buildGrid() {
    S.grid = new Map();
    for (let i = 0; i < DATA.length; i++) {
      const c = centroidOf(i);
      if (!c) continue;
      const k = cellOf(c[0], c[1]);
      let b = S.grid.get(k);
      if (!b) { b = []; S.grid.set(k, b); }
      b.push([i, c[0], c[1]]);
    }
  }
  /** Viewer building whose centroid is within ~4 m of (lat, lon). */
  function indexAt(la, lo) {
    const y = Math.floor(la * 2000), x = Math.floor(lo * 1000);
    let best = null, bestD = (4e-5) * (4e-5);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const b = S.grid.get((y + dy) + ':' + (x + dx));
      if (!b) continue;
      for (const [i, cla, clo] of b) {
        const d = (cla - la) * (cla - la) + ((clo - lo) * 0.53) * ((clo - lo) * 0.53);
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    return best;
  }

  /* ── colours ── */
  const C = () => ({
    boplats: Cesium.Color.fromCssColorString('#00707a'),
    added: Cesium.Color.fromCssColorString('#f2b600'),
    other: Cesium.Color.fromCssColorString('#d6d6d6'),
    unranked: Cesium.Color.fromCssColorString('#7fb3b8'),
  });
  let COL = null;
  function priorityColor(P) {
    // green (low) → amber → red (high priority); same idea as the wizard's bars
    const t = Math.max(0, Math.min(1, P / 100));
    const stops = [[46, 125, 50], [230, 160, 0], [192, 0, 0]];
    const x = t * 2, i = Math.min(1, Math.floor(x)), f = x - i;
    const a = stops[i], b = stops[i + 1];
    return Cesium.Color.fromBytes(Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f), 255);
  }

  function hook() {
    if (S.hooked) return;
    S.hooked = true;
    COL = C();
    const origColor = window.getBuildingColor;
    window.getBuildingColor = function (b) {
      if (S.mode === 'off') return origColor(b);
      const it = S.byData.get(b);
      if (!it) return COL.other;
      if (S.mode === 'priority') return it.P == null ? COL.unranked : priorityColor(it.P);
      return it.status === 'added' ? COL.added : COL.boplats;
    };
    // Choosing one of the viewer's own colourings ("Colour by", market tint)
    // hands the colours back to the viewer.
    const origSet = window.setColorMode;
    window.setColorMode = function (m) {
      if (S.mode !== 'off') { S.mode = 'off'; renderSection(); }
      return origSet.apply(this, arguments);
    };
    const origShow = window.showInfoPanel;
    window.showInfoPanel = function (b, idx) {
      const r = origShow.apply(this, arguments);
      S.lastIdx = idx;
      renderCard(b, idx);
      return r;
    };
  }

  function setMode(m) {
    S.mode = m;
    renderSection();
    if (typeof rebuildBuildings === 'function') rebuildBuildings();
  }

  /* ── left-panel section ── */
  function renderSection() {
    const host = document.getElementById('lp-scroll');
    if (!host) return;
    let sec = document.getElementById('pz-section');
    if (!sec) {
      sec = document.createElement('div');
      sec.id = 'pz-section';
      host.insertBefore(sec, host.firstChild);
    }
    // Count buildings (table rows), not 3D bodies — one row can span several outlines.
    const rowsB = new Set(), rowsA = new Set();
    S.items.forEach((i) => (i.status === 'boplats' ? rowsB : rowsA).add(i.rowId));
    rowsB.forEach((r) => rowsA.delete(r));
    const n = rowsB.size + rowsA.size, nB = rowsB.size, nA = rowsA.size;
    const shown = new Set(); S.byData.forEach((v) => shown.add(v.rowId));
    const btn = (m, label) => '<button type="button" data-mode="' + m + '" class="' + (S.mode === m ? 'on' : '') + '">' + esc(label) + '</button>';
    let legend = '';
    if (S.mode === 'stock') {
      legend = '<div><span class="pz-sw" style="background:#00707a"></span>' + esc(L('Poseidon (found in Boplats plans)')) + '</div>'
        + '<div><span class="pz-sw" style="background:#f2b600"></span>' + esc(L('Poseidon (added by you)')) + '</div>'
        + '<div><span class="pz-sw" style="background:#d6d6d6"></span>' + esc(L('Other buildings')) + '</div>';
    } else if (S.mode === 'priority') {
      legend = '<div class="pz-ramp"></div><div style="display:flex;justify-content:space-between"><span>0 · ' + esc(L('low')) + '</span><span>100 · ' + esc(L('high')) + '</span></div>'
        + '<div class="pz-note">' + esc(L('Renovation priority from the Renovation Wizard (same weights), across the whole Poseidon stock.')) + '</div>';
    } else {
      legend = '<div class="pz-note">' + esc(L('The viewer\'s own colours are shown.')) + '</div>';
    }
    // With Poseidon colours on, the viewer's own colour legend (building use type) describes
    // colours that are not on the map — hide it (poseidon-theme.css: body.pz-colours).
    document.body.classList.toggle('pz-colours', S.mode !== 'off');
    sec.innerHTML = '<div class="pz-title"><img src="/logo.png" alt="">Poseidon</div>'
      + '<div class="pz-sub">' + esc(L('Colour by')) + '</div>'
      + '<div class="pz-modes">' + btn('stock', L('Poseidon stock')) + btn('priority', L('Renovation priority')) + btn('off', L('Off')) + '</div>'
      + '<div class="pz-legend">' + legend + '</div>'
      + '<div style="font-size:11px;margin-bottom:6px">' + esc(L('{n} buildings · {b} from Boplats · {a} added by you', { n: shown.size, b: nB, a: nA })) + '</div>'
      + '<div class="pz-modes"><button type="button" class="pz-rank-btn' + (S.rankOpen ? ' on' : '') + '">' + esc(L('Ranked buildings (worst first)')) + '</button>'
      + '<button type="button" class="pz-zoom">' + esc(L('Zoom to Poseidon')) + '</button></div>';
    sec.querySelectorAll('.pz-modes button[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    sec.querySelector('.pz-zoom').addEventListener('click', zoomToPoseidon);
    sec.querySelector('.pz-rank-btn').addEventListener('click', () => { S.rankOpen = !S.rankOpen; renderSection(); renderRank(); });
  }

  /* ── ranked list: Poseidon buildings from worst (renovate first) to best ──
     By energy class (G → A; no certificate last), then energy use per m² —
     the certificate's figure, or the EPSM RC model's heating when there is none. */
  const CLASS_ORDER = { G: 0, F: 1, E: 2, D: 3, C: 4, B: 5, A: 6 };
  const CLASS_COLOR = { A: '#2e7d32', B: '#55a630', C: '#a7c957', D: '#f2b600', E: '#f08c00', F: '#d9480f', G: '#c00000' };
  function rankedRows() {
    const byRow = new Map();
    for (const it of S.items) if (!byRow.has(it.rowId)) byRow.set(it.rowId, it);
    const rows = [...byRow.values()].map((it) => ({ it, kwh: it.epcKwh != null ? it.epcKwh : it.rcKwh, src: it.epcKwh != null ? 'certificate' : (it.rcKwh != null ? 'model' : null) }));
    const cls = (r) => (r.it.eclass && CLASS_ORDER[r.it.eclass] != null ? CLASS_ORDER[r.it.eclass] : 99);
    rows.sort((a, b) => cls(a) - cls(b) || (b.kwh ?? -1) - (a.kwh ?? -1));
    return rows;
  }
  function locateRow(rowId) {
    let idx = null;
    S.byData.forEach((v, b) => { if (idx == null && v.rowId === rowId) idx = DATA.indexOf(b); });
    if (idx == null || idx < 0) return;
    const b = DATA[idx];
    const c = centroidOf(idx);
    if (!c) return;
    const baseH = typeof window.getBuildingBaseOffset === 'function' ? window.getBuildingBaseOffset(c[1], c[0]) : 0;
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(c[1], c[0], baseH + (b.height || 6) / 2), 25), {
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-40), 220), duration: 1.5,
    });
    window.showInfoPanel(b, idx);
  }
  function renderRank() {
    let p = document.getElementById('pz-rank');
    if (!S.rankOpen) { if (p) p.remove(); return; }
    if (!p) { p = document.createElement('div'); p.id = 'pz-rank'; document.body.appendChild(p); }
    const rows = rankedRows();
    p.innerHTML = '<div class="pz-rank-title"><span>' + esc(L('Poseidon buildings, worst first')) + ' (' + rows.length + ')</span>'
      + '<button type="button" class="pz-rank-close" aria-label="' + esc(L('Close')) + '">×</button></div>'
      + '<div class="pz-rank-note">' + esc(L('Energy class (G worst → A best), then energy use per m². Click a building to fly to it.')) + '</div>'
      + '<div class="pz-rank-list"><table><thead><tr><th>#</th><th>' + esc(L('Address')) + '</th><th>' + esc(L('Class')) + '</th><th>' + esc(L('Energy use')) + '</th></tr></thead><tbody>'
      + rows.map((r, i) => '<tr data-row="' + esc(r.it.rowId) + '"><td>' + (i + 1) + '</td><td>' + esc(r.it.label) + '</td><td>'
        + (r.it.eclass ? '<span class="pz-cls" style="background:' + (CLASS_COLOR[r.it.eclass] || '#808080') + '">' + esc(r.it.eclass) + '</span>' : '<span class="pz-muted">' + esc(L('no certificate')) + '</span>')
        + '</td><td class="n">' + (r.kwh != null ? Math.round(r.kwh) + ' kWh/m² <span class="pz-muted">' + esc(L(r.src)) + '</span>' : '–') + '</td></tr>').join('')
      + '</tbody></table></div>';
    p.querySelector('.pz-rank-close').addEventListener('click', () => { S.rankOpen = false; renderSection(); renderRank(); });
    p.querySelectorAll('tr[data-row]').forEach((tr) => tr.addEventListener('click', () => {
      p.querySelectorAll('tr.on').forEach((x) => x.classList.remove('on'));
      tr.classList.add('on');
      locateRow(tr.dataset.row);
    }));
  }

  function zoomToPoseidon() {
    let w = 180, s = 90, e = -180, n = -90;
    S.byData.forEach((_, b) => {
      const ring = b.coordinates && b.coordinates[0];
      if (!ring) return;
      for (const p of ring) { w = Math.min(w, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]); }
    });
    if (w > e) return;
    viewer.camera.flyTo({ destination: Cesium.Rectangle.fromDegrees(w - 0.01, s - 0.008, e + 0.01, n + 0.008), duration: 1.4 });
  }

  /* ── selected-building card ── */
  function renderCard(b, idx) {
    const panel = document.getElementById('info-panel');
    if (!panel) return;
    let card = document.getElementById('pz-card');
    if (!card) { card = document.createElement('div'); card.id = 'pz-card'; panel.insertBefore(card, panel.firstChild); }
    const it = S.byData.get(b);
    const c = centroidOf(idx);
    let status;
    if (!it) status = L('Not on the Poseidon list');
    else if (it.status === 'added') status = L('Poseidon: added by you');
    else status = L('Poseidon: found in Boplats floor plans');
    let prio = '';
    if (it && it.P != null) {
      const col = priorityColor(it.P).toCssColorString();
      prio = '<div>' + esc(L('Renovation priority')) + ': <span class="pz-chip" style="background:' + col + '">' + Math.round(it.P) + '</span>'
        + (it.rank ? ' · ' + esc(L('rank {r} of {n}', { r: it.rank, n: it.of })) : '') + '</div>';
    }
    const actions = it
      ? [['table', L('Building Table')], ['history', L('Renovation history')], ['facade', L('Façade inspection')], ['toggle', L('Not Poseidon')]]
      : [['toggle', L('Mark as Poseidon')]];
    card.innerHTML = '<div class="pz-status">' + esc(status) + '</div>' + prio
      + '<div class="pz-actions">' + actions.map((a) => '<button type="button" data-act="' + a[0] + '">' + esc(a[1]) + '</button>').join('') + '</div>';
    card.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => {
      post({ type: 'action', action: btn.dataset.act, rowId: it ? it.rowId : null, lat: c && c[0], lon: c && c[1],
        address: b.address || b.all_addresses || null });
    }));
  }

  /* ── data from the app ── */
  function setItems(items) {
    S.items = items;
    S.byData = new Map();
    if (!S.grid) buildGrid();
    for (const it of items) {
      const i = indexAt(it.lat, it.lon);
      if (i != null) S.byData.set(DATA[i], it);
    }
    renderSection();
    renderRank();
    if (S.lastIdx != null && DATA[S.lastIdx] && document.getElementById('pz-card')) renderCard(DATA[S.lastIdx], S.lastIdx);
    if (S.mode !== 'off' && typeof rebuildBuildings === 'function') rebuildBuildings();
    post({ type: 'matched', matched: S.byData.size, of: items.length });
  }

  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.source !== 'poseidon-app') return;
    const m = e.data;
    if (m.type === 'labels') {
      S.labels = m.labels || {};
      if (m.title) { const t = document.querySelector('#lp-header .lp-title'); if (t) t.textContent = m.title; }
      renderSection();
      renderRank();
    } else if (m.type === 'items') {
      setItems(m.items || []);
    } else if (m.type === 'mode') {
      setMode(m.mode);
    }
  });

  // Wait for the viewer's globals, then hook and say hello.
  (function waitReady() {
    const ok = typeof viewer !== 'undefined' && window.DATA && DATA.length
      && typeof window.getBuildingColor === 'function' && typeof window.showInfoPanel === 'function'
      && typeof window.setColorMode === 'function' && document.getElementById('lp-scroll');
    if (!ok) { setTimeout(waitReady, 300); return; }
    hook();
    renderSection();
    post({ type: 'ready' });
  })();
})();
