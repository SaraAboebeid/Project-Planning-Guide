/* market.js — Booli (property sales) + Boplats (rentals) market overlay.
   - Booli records carry lat/lon → shown as coloured points (kr/m²), click for details.
   - Boplats records have no coords → matched to buildings by address (rent SEK/m²).
   - Building tint modes: Rent (SEK/m²) and Retrofit value (kr/m² × poor EPC).
   - A "Market" section is added to the building info panel when a building matches.
   Data: static assets/booli_data.json + assets/boplats_data.json, keyed by
   lowercase address (value may be one record or an array of them). */
(function () {
  'use strict';

  const norm = s => (s || '').trim().toLowerCase();
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };

  let booli = {};        // addrKey -> [records]
  let boplats = {};      // addrKey -> [records]
  let loaded = false;
  let _visible = false;  // sales points shown
  let _tintMode = 'none'; // 'none' | 'rent' | 'retrofit'
  let _tintActive = false; // have WE set colorMode==='market'
  let _prevColorMode = 'use';
  let _pointsDS = null;
  let _clickHandler = null;

  // domains (computed from data)
  let saleDomain = [30000, 90000];   // kr/m²
  let rentDomain = [90, 220];        // SEK/m²/month

  // ── colour ramps (colourblind-tuned, distinct per mode) ──
  const RAMP_SALE = [[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]];        // viridis
  const RAMP_RENT = [[8,29,88],[34,94,168],[29,145,192],[65,182,196],[199,233,180]];       // blue→green
  const RAMP_RETRO = [[45,20,74],[114,28,184],[176,42,140],[232,136,12],[247,231,120]];    // low→high priority
  const EPC_POOR = { A: 0, B: 0.12, C: 0.28, D: 0.5, E: 0.68, F: 0.84, G: 1 };

  function rampRGB(stops, t) {
    t = Math.max(0, Math.min(1, t));
    const x = t * (stops.length - 1), i = Math.floor(x), f = x - i;
    const a = stops[i], b = stops[Math.min(stops.length - 1, i + 1)];
    return [Math.round(a[0] + (b[0]-a[0])*f), Math.round(a[1] + (b[1]-a[1])*f), Math.round(a[2] + (b[2]-a[2])*f)];
  }
  function rampColor(stops, t, alpha) {
    const c = rampRGB(stops, t);
    return Cesium.Color.fromBytes(c[0], c[1], c[2], alpha == null ? 235 : alpha);
  }
  function rampCss(stops) {
    return 'linear-gradient(90deg,' + stops.map((s, i) =>
      'rgb(' + s.join(',') + ') ' + Math.round(i / (stops.length - 1) * 100) + '%').join(',') + ')';
  }
  const DIM = Cesium.Color.fromBytes(70, 74, 92, 70);   // buildings with no data in a tint mode

  function pct(arr, p) {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.max(0, Math.min(s.length - 1, Math.floor(p * (s.length - 1))))];
  }

  // ── data ──
  function ingest(obj) {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    for (const k in obj) {
      const v = obj[k];
      out[norm(k)] = Array.isArray(v) ? v : [v];
    }
    return out;
  }
  async function load() {
    if (loaded) return;
    try {
      const [b1, b2] = await Promise.all([
        fetch('booli_data.json', { cache: 'default' }).then(r => r.ok ? r.json() : {}).catch(() => ({})),
        fetch('boplats_data.json', { cache: 'default' }).then(r => r.ok ? r.json() : {}).catch(() => ({})),
      ]);
      booli = ingest(b1);
      boplats = ingest(b2);
      loaded = true;
      // domains from data
      const salePrices = [];
      for (const k in booli) for (const r of booli[k]) { const q = num(r.sqm_price); if (q && q > 0) salePrices.push(q); }
      if (salePrices.length) saleDomain = [pct(salePrices, 0.05), pct(salePrices, 0.95)];
      const rents = [];
      for (const k in boplats) for (const r of boplats[k]) { const rr = rentPerM2(r); if (rr) rents.push(rr); }
      if (rents.length) rentDomain = [pct(rents, 0.05), pct(rents, 0.95)];
    } catch (e) { console.warn('market: load failed', e); }
  }

  const rentPerM2 = r => { const rent = num(r.rent_sek), a = num(r.size_m2); return (rent && a) ? rent / a : null; };
  const salePrice = r => num(r.sold_price) || num(r.list_price) || null;
  const saleSqm = r => num(r.sqm_price) || (salePrice(r) && num(r.living_area_m2) ? salePrice(r) / num(r.living_area_m2) : null);

  function addrKeys(b) {
    const set = new Set();
    if (b.address) set.add(norm(b.address));
    if (b.all_addresses) String(b.all_addresses).split('|').forEach(a => set.add(norm(a)));
    return [...set];
  }
  function listingsFor(b, store) {
    const out = [];
    for (const k of addrKeys(b)) if (store[k]) out.push(...store[k]);
    return out;
  }

  // ── building tint colour (called from cesium.js getBuildingColor when colorMode==='market') ──
  window.getMarketBuildingColor = function (b) {
    if (_tintMode === 'rent') {
      const ls = listingsFor(b, boplats);
      const vals = ls.map(rentPerM2).filter(v => v);
      if (!vals.length) return DIM;
      const avg = vals.reduce((a, c) => a + c, 0) / vals.length;
      const t = (avg - rentDomain[0]) / (rentDomain[1] - rentDomain[0] || 1);
      return rampColor(RAMP_RENT, t);
    }
    if (_tintMode === 'retrofit') {
      const ls = listingsFor(b, booli);
      const qs = ls.map(saleSqm).filter(v => v);
      const poor = EPC_POOR[b.eclass];
      if (!qs.length || poor == null) return DIM;
      const q = qs.reduce((a, c) => a + c, 0) / qs.length;
      const priceN = Math.max(0, Math.min(1, (q - saleDomain[0]) / (saleDomain[1] - saleDomain[0] || 1)));
      const score = priceN * poor;                    // high price + poor EPC = high retrofit value
      return rampColor(RAMP_RETRO, score);
    }
    return DIM;
  };

  // ── Booli sale points ──
  function buildPoints() {
    if (_pointsDS) { try { viewer.dataSources.remove(_pointsDS, true); } catch (e) {} }
    _pointsDS = new Cesium.CustomDataSource('market-sales');
    viewer.dataSources.add(_pointsDS);
    for (const k in booli) {
      for (const r of booli[k]) {
        const lat = num(r.latitude), lon = num(r.longitude), q = saleSqm(r);
        if (lat == null || lon == null) continue;
        const t = q ? (q - saleDomain[0]) / (saleDomain[1] - saleDomain[0] || 1) : 0.5;
        const col = rampColor(RAMP_SALE, t, 255);
        const sold = r.status === 'sold';
        _pointsDS.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat, 6),
          point: {
            pixelSize: sold ? 8 : 11,
            color: sold ? col.withAlpha(0.25) : col,
            outlineColor: sold ? col : Cesium.Color.WHITE.withAlpha(0.9),
            outlineWidth: 1.6,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(300, 1.3, 4000, 0.55),
          },
          properties: { _market: 'sale', addr: r.address || k, key: k },
        });
      }
    }
    if (!_clickHandler) {
      _clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
      _clickHandler.setInputAction(evt => {
        const picked = viewer.scene.pick(evt.position);
        if (!picked || !picked.id || !picked.id.properties) return;
        const p = picked.id.properties;
        const kind = p._market && p._market.getValue ? p._market.getValue() : (p._market || null);
        if (kind !== 'sale') return;                  // let building clicks pass through
        const key = p.key && p.key.getValue ? p.key.getValue() : p.key;
        showSalePopup(booli[key] || [], evt.position);
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }
  }
  function removePoints() {
    if (_pointsDS) { try { viewer.dataSources.remove(_pointsDS, true); } catch (e) {} _pointsDS = null; }
    if (_clickHandler) { try { _clickHandler.destroy(); } catch (e) {} _clickHandler = null; }
    hidePopup();
  }

  // ── formatting helpers ──
  const kr = n => n == null ? '—' : (n >= 1e6 ? (n / 1e6).toFixed(2) + ' M' : Math.round(n).toLocaleString('sv-SE'));
  const saleLine = r => {
    const price = salePrice(r), q = saleSqm(r);
    const tag = r.status === 'sold' ? 'Sold' + (r.sold_date ? ' ' + String(r.sold_date).slice(0, 10) : '') : 'For sale';
    return `<div style="font-size:11px;line-height:1.5;padding:5px 0;border-top:1px solid rgba(255,255,255,0.07)">
      <b style="color:#fff">${kr(price)} SEK</b> ${q ? '· <b style="color:#B98BE8">' + kr(q) + ' kr/m²</b>' : ''}
      <span style="color:rgba(255,255,255,0.4)"> · ${r.rooms || '?'} rok · ${r.living_area_m2 || '?'} m²${r.construction_year ? ' · ' + r.construction_year : ''}${r.energy_class ? ' · EPC ' + r.energy_class : ''}</span>
      <span style="display:inline-block;margin-left:4px;font-size:9px;font-weight:700;color:${r.status === 'sold' ? '#9B7FD4' : '#2FB477'}">${tag}</span>
      ${r.url ? ' · <a href="' + r.url + '" target="_blank" rel="noopener" style="color:#4A90E2;text-decoration:none">Booli ↗</a>' : ''}
    </div>`;
  };
  const rentLine = r => {
    const q = rentPerM2(r);
    return `<div style="font-size:11px;line-height:1.5;padding:5px 0;border-top:1px solid rgba(255,255,255,0.07)">
      <b style="color:#fff">${kr(num(r.rent_sek))} SEK/mo</b> ${q ? '· <b style="color:#4ECDC4">' + Math.round(q) + ' SEK/m²</b>' : ''}
      <span style="color:rgba(255,255,255,0.4)"> · ${r.rooms || '?'} rok · ${r.size_m2 || '?'} m²${r.floor_current ? ' · fl ' + r.floor_current : ''}</span>
    </div>`;
  };

  // ── info-panel Market section (called from ui.js showInfoPanel) ──
  window.marketInfoHtml = function (b) {
    if (!loaded) return '';
    const sales = listingsFor(b, booli), rents = listingsFor(b, boplats);
    if (!sales.length && !rents.length) return '';
    let html = '<div style="margin-top:12px;border-top:1px solid rgba(114,28,184,0.35);padding-top:9px">'
      + '<div style="font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#B98BE8;margin-bottom:4px">Market</div>';
    if (rents.length) {
      const q = rents.map(rentPerM2).filter(v => v);
      const avg = q.length ? Math.round(q.reduce((a, c) => a + c, 0) / q.length) : null;
      html += `<div style="font-size:10.5px;color:rgba(255,255,255,0.55);margin-top:2px">🏠 ${rents.length} rental${rents.length > 1 ? 's' : ''}${avg ? ' · avg ' + avg + ' SEK/m²' : ''} <span style="color:rgba(255,255,255,0.3)">(Boplats)</span></div>`;
      html += rents.slice(0, 4).map(rentLine).join('');
    }
    if (sales.length) {
      const q = sales.map(saleSqm).filter(v => v);
      const avg = q.length ? kr(q.reduce((a, c) => a + c, 0) / q.length) : null;
      html += `<div style="font-size:10.5px;color:rgba(255,255,255,0.55);margin-top:6px">🔑 ${sales.length} sale listing${sales.length > 1 ? 's' : ''}${avg ? ' · avg ' + avg + ' kr/m²' : ''} <span style="color:rgba(255,255,255,0.3)">(Booli)</span></div>`;
      html += sales.slice(0, 4).map(saleLine).join('');
    }
    html += '</div>';
    return html;
  };

  // ── sale-point popup ──
  let _popup = null;
  function ensurePopup() {
    if (_popup) return _popup;
    _popup = document.createElement('div');
    _popup.id = 'market-popup';
    _popup.style.cssText = 'position:absolute;z-index:60;max-width:280px;background:#0d1117;border:1px solid rgba(114,28,184,0.5);border-radius:10px;padding:10px 12px 11px;box-shadow:0 8px 30px rgba(0,0,0,0.55);display:none;color:#fff;font-family:inherit';
    (document.getElementById('cesiumContainer') || document.body).appendChild(_popup);
    return _popup;
  }
  function hidePopup() { if (_popup) _popup.style.display = 'none'; }
  function showSalePopup(records, screenPos) {
    const el = ensurePopup();
    const list = (records || []).slice(0, 6);
    if (!list.length) { hidePopup(); return; }
    const addr = list[0].address || '';
    const img = list[0].primary_image;
    el.innerHTML =
      '<button style="position:absolute;top:6px;right:8px;background:none;border:0;color:rgba(255,255,255,0.5);cursor:pointer;font-size:14px" onclick="this.parentNode.style.display=\'none\'">✕</button>'
      + (img ? '<img src="' + img + '" style="width:100%;height:90px;object-fit:cover;border-radius:6px;margin-bottom:6px" onerror="this.style.display=\'none\'">' : '')
      + '<div style="font-size:12px;font-weight:800;margin-bottom:2px">' + addr + '</div>'
      + '<div style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:2px">' + (list[0].area_name || '') + '</div>'
      + list.map(saleLine).join('');
    el.style.display = 'block';
    const x = Math.min(screenPos.x + 14, (viewer.canvas.clientWidth || 800) - 292);
    const y = Math.min(screenPos.y + 8, (viewer.canvas.clientHeight || 600) - 220);
    el.style.left = Math.max(8, x) + 'px';
    el.style.top = Math.max(8, y) + 'px';
  }

  // ── UI: toggle button + control panel ──
  function colorbar(stops, lo, hi, unit) {
    return '<div style="margin-top:6px">'
      + '<div style="height:9px;border-radius:5px;background:' + rampCss(stops) + '"></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:9px;color:rgba(255,255,255,0.45);margin-top:2px">'
      + '<span>' + kr(lo) + '</span><span>' + unit + '</span><span>' + kr(hi) + '</span></div></div>';
  }
  function renderPanel() {
    const p = document.getElementById('market-panel');
    if (!p) return;
    const radio = (val, label) => '<button class="mk-tint' + (_tintMode === val ? ' on' : '') + '" data-tint="' + val + '" '
      + 'style="flex:1;padding:4px 6px;border-radius:7px;border:1px solid ' + (_tintMode === val ? 'rgba(114,28,184,0.8)' : 'rgba(255,255,255,0.12)')
      + ';background:' + (_tintMode === val ? 'rgba(114,28,184,0.32)' : 'transparent') + ';color:' + (_tintMode === val ? '#fff' : 'rgba(255,255,255,0.6)')
      + ';font-size:10px;font-weight:700;cursor:pointer">' + label + '</button>';
    let legend = '';
    if (_tintMode === 'rent') legend = colorbar(RAMP_RENT, rentDomain[0], rentDomain[1], 'SEK/m²/mo');
    else if (_tintMode === 'retrofit') legend = '<div style="font-size:9.5px;color:rgba(255,255,255,0.42);margin-top:5px">High price/m² × poor EPC = most market value from a retrofit.</div>' + colorbar(RAMP_RETRO, 0, 1, 'low → high value');
    p.innerHTML =
      '<div style="font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#B98BE8;margin-bottom:6px">Market data</div>'
      + '<label style="display:flex;align-items:center;gap:7px;font-size:11px;color:rgba(255,255,255,0.75);cursor:pointer;margin-bottom:8px">'
      + '<input type="checkbox" id="mk-points"' + (_visible ? ' checked' : '') + ' style="accent-color:#B98BE8;cursor:pointer"> Sale &amp; sold points <span style="color:rgba(255,255,255,0.35)">(Booli)</span></label>'
      + (_visible ? colorbar(RAMP_SALE, saleDomain[0], saleDomain[1], 'kr/m²') + '<div style="font-size:9px;color:rgba(255,255,255,0.4);margin-top:3px">● filled = for sale · ○ hollow = sold</div>' : '')
      + '<div style="font-size:10px;color:rgba(255,255,255,0.5);margin:11px 0 5px">Colour buildings by</div>'
      + '<div style="display:flex;gap:5px">' + radio('none', 'Off') + radio('rent', 'Rent') + radio('retrofit', 'Retrofit value') + '</div>'
      + legend;
    // wire
    const cb = p.querySelector('#mk-points');
    if (cb) cb.addEventListener('change', () => { cb.checked ? showPoints() : hidePoints(); });
    p.querySelectorAll('.mk-tint').forEach(btn => btn.addEventListener('click', () => setTint(btn.getAttribute('data-tint'))));
  }
  function ensurePanel() {
    if (document.getElementById('market-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'market-panel';
    panel.className = 'panel';
    panel.style.cssText = 'display:none;margin-top:10px;background:rgba(13,17,40,0.72);border:1px solid rgba(114,28,184,0.34);border-radius:12px;padding:11px 13px';
    const anchor = document.getElementById('legend-container') || document.querySelector('#left-panel');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(panel, anchor);
    else document.querySelector('#left-panel')?.appendChild(panel);
  }

  // ── state transitions ──
  function showPoints() { _visible = true; if (loaded) buildPoints(); renderPanel(); }
  function hidePoints() { _visible = false; removePoints(); renderPanel(); }
  function readColorMode() { try { return (typeof colorMode !== 'undefined') ? colorMode : 'use'; } catch (e) { return 'use'; } }
  function setTint(mode) {
    _tintMode = mode;
    if (mode === 'none') {
      if (_tintActive) { setColorMode(_prevColorMode || 'use'); _tintActive = false; }
    } else {
      if (!_tintActive) { _prevColorMode = readColorMode(); _tintActive = true; }
      setColorMode('market');                        // triggers rebuild + our getMarketBuildingColor
    }
    renderPanel();
  }

  async function toggleMarket() {
    const on = !(_visible || _tintMode !== 'none');
    const btn = document.getElementById('btn-overlay-market');
    if (on) {
      await load();
      ensurePanel();
      document.getElementById('market-panel').style.display = 'block';
      showPoints();                                   // default: sale points on
      renderPanel();
    } else {
      hidePoints();
      setTint('none');
      const mp = document.getElementById('market-panel'); if (mp) mp.style.display = 'none';
    }
    if (btn) { btn.classList.toggle('active', on); btn.setAttribute('aria-pressed', String(on)); }
  }

  function injectToggle() {
    const group = document.querySelector('#buildings-content .overlay-group');
    if (!group || document.getElementById('btn-overlay-market')) return;
    const row = document.createElement('div');
    row.className = 'overlay-row';
    row.innerHTML =
      '<button class="overlay-btn" id="btn-overlay-market" aria-pressed="false">'
      + '<span class="overlay-check"></span><span class="base-name">Market data</span>'
      + '<span class="layer-pill">Booli · Boplats</span></button>';
    group.appendChild(row);
    row.querySelector('#btn-overlay-market').addEventListener('click', toggleMarket);
  }

  // ── init ──
  function init() {
    if (typeof viewer === 'undefined' || !window.DATA) { setTimeout(init, 400); return; }
    load();                                           // preload so the info-panel Market section works without toggling
    injectToggle();
  }
  init();
})();
