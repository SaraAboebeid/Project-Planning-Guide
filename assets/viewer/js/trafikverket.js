// ─────────────────────────────────────────────────────────────────────────────
// trafikverket.js — Trafikverket live road layers for the Gothenburg 3D viewer
//
//   Layer 1 – Traffic cameras   (btn-tv-cameras)     live roadside photos
//   Layer 2 – Traffic flow      (btn-tv-flow)        vehicles/h + avg speed
//   Layer 3 – Road conditions   (btn-tv-conditions)  ice / wet / warnings
//   Layer 4 – Road parking      (btn-tv-parking)     rest stops & facilities
//
// History: this layer originally lived as an inline <script> block inside the
// generated assets/gothenburg_3d.html. That file is a BUILD ARTIFACT — the next
// `python build.py` regenerated it from viewer/ and silently deleted the whole
// feature. It now lives here, in the sources build.py actually copies, so a
// rebuild can no longer lose it.
//
// Depends on:
//   • Cesium viewer (global `viewer`)
//   • FastAPI backend on http://localhost:8000 (live data; falls back to the
//     static snapshot in assets/trafikverket_data.json when the backend or the
//     API key is unavailable)
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  const TV_API          = 'http://localhost:8000/api/trafikverket/data';
  const TV_STATIC       = 'trafikverket_data.json';   // legacy snapshot fallback
  const FLOW_REFRESH_MS = 5 * 60 * 1000;   // 5 min
  const CAM_REFRESH_MS  = 30 * 1000;       // 30 s while a camera popup is open

  const _ents    = { cameras: [], flow: [], conditions: [], parking: [] };
  const _visible = { cameras: false, flow: false, conditions: false, parking: false };
  let _data      = null;
  let _stale     = false;   // true when serving the on-disk snapshot
  let _camTimer  = null;
  let _flowTimer = null;

  // Read by ui.js to stand its building hover card down while the pointer is
  // over one of our entities. Defined up front so the contract is explicit
  // rather than springing into existence on first hover.
  window._tvHoverActive = false;

  const _statusEl = () => document.getElementById('tv-status');
  function setStatus(msg, kind) {
    const el = _statusEl();
    if (!el) return;
    if (!msg) { el.style.display = 'none'; return; }
    el.textContent = msg;
    el.style.color = kind === 'warn' ? '#F5A623' : kind === 'error' ? '#f87171' : 'var(--muted)';
    el.style.display = 'block';
  }

  // ── Data loading ────────────────────────────────────────────────────────────
  // Live proxy first; the static snapshot is a fallback so the layer still draws
  // something when the backend is down — but it is labelled as stale rather than
  // passed off as live, because the file can be months old.
  // Single-flight: toggling several layers before the first response lands used
  // to fire one identical request per layer (4 full API round-trips on open).
  // Callers now share the in-flight promise.
  let _loading = null;
  function loadData(opts) {
    if (_data && !(opts && opts.force)) return Promise.resolve(true);
    if (_loading) return _loading;
    _loading = _loadDataInner(opts || {}).finally(() => { _loading = null; });
    return _loading;
  }

  async function _loadDataInner({ force = false } = {}) {
    try {
      const r = await fetch(TV_API + (force ? '?refresh=true' : ''));
      if (r.ok) {
        _data = await r.json();
        _stale = false;
        return true;
      }
      let detail = '';
      try { detail = (await r.json()).detail || ''; } catch (_) {}
      if (r.status === 503 && /API key/i.test(detail)) {
        setStatus('Trafikverket API key not configured — add TRAFIKVERKET_API_KEY to .env and restart the backend.', 'warn');
      } else {
        setStatus(detail || `Live traffic unavailable (HTTP ${r.status})`, 'error');
      }
    } catch (_) {
      setStatus('Backend not reachable on :8000 — trying the local snapshot...', 'warn');
    }

    try {
      const r = await fetch(TV_STATIC + '?t=' + Date.now());
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      _data = await r.json();
      _stale = true;
      const when = _data.fetched_at ? new Date(_data.fetched_at).toLocaleDateString('sv-SE') : 'unknown date';
      setStatus(`Showing an offline snapshot (${when}) — not live data.`, 'warn');
      return true;
    } catch (err) {
      setStatus('No Trafikverket data available: ' + err.message, 'error');
      return false;
    }
  }

  // ── Colour helpers ──────────────────────────────────────────────────────────
  function flowColor(rate) {
    if (rate == null) return Cesium.Color.GRAY.withAlpha(0.65);
    if (rate < 200)   return Cesium.Color.fromCssColorString('#22c55e').withAlpha(0.85);
    if (rate < 600)   return Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.85);
    return Cesium.Color.fromCssColorString('#ef4444').withAlpha(0.85);
  }
  function condColor(code) {
    if (code == null) return Cesium.Color.GRAY.withAlpha(0.8);
    if (code <= 0) return Cesium.Color.fromCssColorString('#22c55e').withAlpha(0.9);
    if (code <= 2) return Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.9);
    return Cesium.Color.fromCssColorString('#ef4444').withAlpha(0.9);
  }

  // ── Canvas pin factories ────────────────────────────────────────────────────
  function camPin() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const x = cv.getContext('2d');
    x.fillStyle = '#1d4ed8'; x.beginPath(); x.arc(16, 16, 14, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; x.font = '16px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('📷', 16, 17);
    return cv.toDataURL();
  }
  function parkPin(open) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 28;
    const x = cv.getContext('2d');
    x.fillStyle = open ? '#059669' : '#9ca3af';
    x.beginPath(); x.arc(14, 14, 12, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#fff'; x.font = 'bold 14px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('P', 14, 15);
    return cv.toDataURL();
  }

  // ── Layer rendering ─────────────────────────────────────────────────────────
  function clear(key) { _ents[key].forEach(e => viewer.entities.remove(e)); _ents[key] = []; }

  function renderCameras() {
    clear('cameras');
    if (!_data || !_visible.cameras) return;
    const img = camPin();
    (_data.cameras || []).forEach(cam => {
      if (!cam.lon || !cam.lat) return;
      _ents.cameras.push(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, 20),
        billboard: {
          image: img, width: 30, height: 30,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: { _tv: 'camera', _tvd: cam },
      }));
    });
  }

  function renderFlow() {
    clear('flow');
    if (!_data || !_visible.flow) return;
    (_data.traffic_flow || []).forEach(f => {
      if (!f.lon || !f.lat) return;
      const r = f.flow_rate || 0;
      const sz = Math.max(12, Math.min(r / 30, 40));
      _ents.flow.push(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(f.lon, f.lat, 5),
        ellipse: {
          semiMajorAxis: sz, semiMinorAxis: sz, height: 5,
          material: flowColor(r), outline: false,
        },
        properties: { _tv: 'flow', _tvd: f },
      }));
    });
    if (!_stale) {
      setStatus('Flow updated ' + new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }));
    }
  }

  function renderConditions() {
    clear('conditions');
    if (!_data || !_visible.conditions) return;
    (_data.road_conditions || []).forEach(c => {
      if (!c.lon || !c.lat) return;
      _ents.conditions.push(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(c.lon, c.lat, 15),
        point: {
          pixelSize: 13, color: condColor(c.condition_code),
          outlineColor: Cesium.Color.WHITE, outlineWidth: 1.5,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: { _tv: 'condition', _tvd: c },
      }));
    });
  }

  function renderParking() {
    clear('parking');
    if (!_data || !_visible.parking) return;
    (_data.parking || []).forEach(p => {
      if (!p.lon || !p.lat) return;
      const open = (p.open_status || '').toLowerCase().includes('open');
      _ents.parking.push(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 20),
        billboard: {
          image: parkPin(open), width: 28, height: 28,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: { _tv: 'parking', _tvd: p },
      }));
    });
  }

  const RENDER = {
    cameras: renderCameras, flow: renderFlow,
    conditions: renderConditions, parking: renderParking,
  };

  // ── Public toggle ───────────────────────────────────────────────────────────
  window.tvToggleLayer = async function (key, btn) {
    _visible[key] = !_visible[key];
    if (btn) {
      btn.classList.toggle('active', _visible[key]);
      btn.setAttribute('aria-pressed', String(_visible[key]));
    }
    if (_visible[key] && !_data) {
      const ok = await loadData();
      if (!ok) {
        _visible[key] = false;
        if (btn) { btn.classList.remove('active'); btn.setAttribute('aria-pressed', 'false'); }
        return;
      }
    }
    (RENDER[key] || function () {})();
    if (key === 'flow') { _visible.flow ? startFlowTimer() : stopFlowTimer(); }
    if (!Object.values(_visible).some(Boolean)) setStatus('');
  };

  // ── Flow auto-refresh ───────────────────────────────────────────────────────
  function startFlowTimer() {
    if (_flowTimer) return;
    _flowTimer = setInterval(async () => {
      if (!_visible.flow) return;
      // force=true so the backend re-queries rather than serving its short cache
      if (await loadData({ force: true })) renderFlow();
    }, FLOW_REFRESH_MS);
  }
  function stopFlowTimer() { if (_flowTimer) { clearInterval(_flowTimer); _flowTimer = null; } }

  // ── Picking ─────────────────────────────────────────────────────────────────
  // Unwrap a Cesium ConstantProperty (or return the raw value).
  function _gv(v) { return v && typeof v === 'object' && typeof v.getValue === 'function' ? v.getValue() : v; }

  function tvPick(pos) {
    const p = viewer.scene.pick(pos);
    if (!p || !p.id || !p.id.properties) return null;
    const t = _gv(p.id.properties._tv);
    const d = _gv(p.id.properties._tvd);
    return (t && d) ? { t, d } : null;
  }

  // Own handler instance. The original took over viewer.screenSpaceEventHandler's
  // MOUSE_MOVE and LEFT_CLICK, which in the modular viewer would REPLACE ui.js's
  // building hover/click (Cesium allows one action per input type per handler)
  // and break building selection. A dedicated handler receives the same events
  // without displacing anyone else's.
  const _handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);

  _handler.setInputAction(function (click) {
    const hit = tvPick(click.position);
    if (!hit) return;
    showPopup(hit.t, hit.d, click.position);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // ── Hover tooltip ───────────────────────────────────────────────────────────
  const _tt = document.createElement('div');
  Object.assign(_tt.style, {
    position: 'fixed', pointerEvents: 'none', zIndex: '1001',
    background: 'rgba(15,23,42,0.93)', color: '#e2e8f0',
    borderRadius: '9px', padding: '9px 12px', fontSize: '11px',
    lineHeight: '1.6', display: 'none', maxWidth: '230px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
    border: '1px solid rgba(255,255,255,0.09)',
  });
  document.body.appendChild(_tt);

  function _ttHtml(type, d) {
    const row = (lbl, val, col) =>
      `<div style="display:flex;justify-content:space-between;gap:10px;margin-top:2px">` +
      `<span style="color:#94a3b8">${lbl}</span>` +
      `<span${col ? ` style="color:${col}"` : ''}>${val}</span></div>`;

    if (type === 'camera') {
      const ac = d.active ? '#4ade80' : '#9ca3af';
      return `<div style="font-weight:600;margin-bottom:4px">${d.name || d.id}</div>` +
        `<div style="color:#94a3b8;font-size:10px;margin-bottom:4px">${d.type || 'Vägkamera'}</div>` +
        row('Status', d.active ? '● Active' : '○ Inactive', ac) +
        (d.description ? `<div style="color:#64748b;font-size:10px;margin-top:4px">${d.description}</div>` : '') +
        `<div style="color:#475569;font-size:10px;margin-top:5px">Click to view live image</div>`;
    }
    if (type === 'flow') {
      const fc = d.flow_rate > 600 ? '#f87171' : d.flow_rate > 200 ? '#fbbf24' : '#4ade80';
      const label = d.flow_rate > 600 ? 'Heavy traffic' : d.flow_rate > 200 ? 'Moderate' : 'Free flow';
      return `<div style="font-weight:600;margin-bottom:4px">Traffic Flow</div>` +
        row('Flow rate', d.flow_rate != null ? `${Math.round(d.flow_rate)} veh/h` : '—', fc) +
        row('Label', label, fc) +
        row('Avg speed', d.avg_speed != null ? `${Number(d.avg_speed).toFixed(1)} km/h` : '—') +
        (d.vehicle_type ? row('Vehicle type', d.vehicle_type) : '') +
        (d.lane ? row('Lane', d.lane) : '') +
        (d.time ? `<div style="color:#475569;font-size:10px;margin-top:4px">Measured ${new Date(d.time).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}</div>` : '');
    }
    if (type === 'condition') {
      const cc = d.condition_code > 2 ? '#f87171' : d.condition_code > 0 ? '#fbbf24' : '#4ade80';
      return `<div style="font-weight:600;margin-bottom:4px">Road Condition</div>` +
        row('Status', d.condition_text || '—', cc) +
        (d.road_number ? row('Road', d.road_number) : '') +
        (d.location ? `<div style="color:#64748b;font-size:10px;margin-top:4px">${d.location}</div>` : '');
    }
    if (type === 'parking') {
      const open = (d.open_status || '').toLowerCase().includes('open');
      return `<div style="font-weight:600;margin-bottom:4px">${d.name || 'Parking'}</div>` +
        row('Status', d.open_status || '—', open ? '#4ade80' : '#9ca3af') +
        (d.total_capacity != null ? row('Capacity', `${d.total_capacity} spaces`) : '') +
        (d.operation_status ? row('Operation', d.operation_status) : '') +
        (d.description ? `<div style="color:#64748b;font-size:10px;margin-top:4px">${d.description}</div>` : '');
    }
    return '';
  }

  // Throttled to ~30fps like ui.js's hover: this runs a scene.pick on every
  // mouse-move event, on top of ui.js's own drillPick, and unthrottled that is
  // real work on a 93k-building scene.
  let _hoverThrottle = 0;
  _handler.setInputAction(function (move) {
    const now = Date.now();
    if (now - _hoverThrottle < 33) return;
    _hoverThrottle = now;

    // Nothing to hit until a layer is on — skip the pick entirely.
    if (!Object.values(_visible).some(Boolean)) {
      if (window._tvHoverActive) { window._tvHoverActive = false; _tt.style.display = 'none'; }
      return;
    }

    const hit = tvPick(move.endPosition);
    const html = hit ? _ttHtml(hit.t, hit.d) : '';
    if (html) {
      _tt.innerHTML = html;
      _tt.style.left = Math.min(move.endPosition.x + 18, window.innerWidth - 250) + 'px';
      _tt.style.top  = Math.max(move.endPosition.y - 20, 8) + 'px';
      _tt.style.display = 'block';
      viewer.canvas.style.cursor = 'pointer';
      // ui.js reads this and stands down, so the building card and this tooltip
      // can't both claim the pointer.
      window._tvHoverActive = true;
      const hc = document.getElementById('hover-card');
      if (hc) hc.style.display = 'none';
      return;
    }
    _tt.style.display = 'none';
    if (window._tvHoverActive) {
      window._tvHoverActive = false;
      viewer.canvas.style.cursor = '';
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  // ── Popup ───────────────────────────────────────────────────────────────────
  function showPopup(type, data, screenPos) {
    const popup = document.getElementById('tv-popup');
    const title = document.getElementById('tv-popup-title');
    const body  = document.getElementById('tv-popup-body');
    if (!popup || !title || !body) return;

    popup.style.left = Math.min(screenPos.x + 18, window.innerWidth - 290) + 'px';
    popup.style.top  = Math.max(screenPos.y - 50, 10) + 'px';
    popup.style.display = 'block';
    if (_camTimer) { clearInterval(_camTimer); _camTimer = null; }

    const row = (lbl, val, col) =>
      `<div class="tt-row"><span class="tt-lbl">${lbl}</span>` +
      `<span class="tt-val"${col ? ` style="color:${col}"` : ''}>${val}</span></div>`;

    if (type === 'camera') {
      title.textContent = data.name || data.id;
      const updTime = data.photo_time
        ? new Date(data.photo_time).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
        : '--:--';
      body.innerHTML =
        `<div style="font-size:10px;color:#64748b;margin-bottom:6px">${data.type || 'Vägkamera'}</div>` +
        '<div style="position:relative;background:#0f172a;border-radius:8px;overflow:hidden;aspect-ratio:4/3">' +
          `<img id="tv-cam-img" src="${data.photo_url}" style="width:100%;height:100%;object-fit:cover" ` +
            `onerror="this.style.display='none';document.getElementById('tv-cam-err').style.display='flex'">` +
          '<div id="tv-cam-err" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;flex-direction:column;gap:5px;color:#94a3b8;font-size:11px">' +
            '<span style="font-size:22px">📷</span><span>Image unavailable</span></div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:10px;color:#64748b">' +
          `<span>${data.active ? '<span style="color:#059669">● Active</span>' : '<span style="color:#9ca3af">○ Inactive</span>'}</span>` +
          `<span id="tv-cam-time">📸 ${updTime}</span>` +
        '</div>' +
        `<button id="tv-cam-refresh" style="margin-top:7px;width:100%;padding:5px 8px;border-radius:7px;border:1px solid #e2e8f0;background:#f8fafc;font-size:11px;cursor:pointer;font-family:inherit">↻ Refresh image</button>`;

      // Listener rather than an inline onclick with the URL interpolated into a
      // quoted attribute — camera URLs contain characters that broke out of it.
      const btn = document.getElementById('tv-cam-refresh');
      if (btn) btn.addEventListener('click', () => window.tvRefreshCam(data.photo_url));

      _camTimer = setInterval(function () {
        const img = document.getElementById('tv-cam-img');
        if (img && popup.style.display !== 'none') {
          img.src = data.photo_url + '?t=' + Date.now();
          const ct = document.getElementById('tv-cam-time');
          if (ct) ct.textContent = '📸 ' + new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
        }
      }, CAM_REFRESH_MS);

    } else if (type === 'flow') {
      title.textContent = 'Traffic Flow – site ' + (data.site_id || data.id);
      const fc = data.flow_rate > 600 ? '#ef4444' : data.flow_rate > 200 ? '#f59e0b' : '#22c55e';
      body.innerHTML =
        row('Flow rate', data.flow_rate != null ? Math.round(data.flow_rate) + ' veh/h' : '—', fc) +
        row('Avg speed', data.avg_speed != null ? Number(data.avg_speed).toFixed(1) + ' km/h' : '—') +
        row('Lane', data.lane || '—') +
        row('Vehicle type', data.vehicle_type || '—') +
        row('Measured', data.time ? new Date(data.time).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '—');

    } else if (type === 'condition') {
      title.textContent = 'Road Condition';
      body.innerHTML =
        row('Condition', data.condition_text || '—') +
        row('Road', data.road_number || '—') +
        row('Location', data.location || '—') +
        row('Code', data.condition_code != null ? data.condition_code : '—');

    } else if (type === 'parking') {
      title.textContent = data.name || 'Parking';
      const sc = (data.open_status || '').toLowerCase().includes('open') ? '#059669' : '#9ca3af';
      body.innerHTML =
        row('Status', data.open_status || '—', sc) +
        row('Operation', data.operation_status || '—') +
        row('Capacity', data.total_capacity != null ? data.total_capacity + ' spaces' : '—') +
        row('Usage', data.usage || '—');
    }
  }

  window.tvRefreshCam = function (url) {
    const img = document.getElementById('tv-cam-img');
    const err = document.getElementById('tv-cam-err');
    if (img) { if (err) { err.style.display = 'none'; img.style.display = ''; } img.src = url + '?t=' + Date.now(); }
  };
  window.tvClosePopup = function () {
    const p = document.getElementById('tv-popup');
    if (p) p.style.display = 'none';
    if (_camTimer) { clearInterval(_camTimer); _camTimer = null; }
  };

  // ── Button wiring ───────────────────────────────────────────────────────────
  [['btn-tv-cameras', 'cameras'], ['btn-tv-flow', 'flow'],
   ['btn-tv-conditions', 'conditions'], ['btn-tv-parking', 'parking']].forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => window.tvToggleLayer(key, el));
  });
  const _closeBtn = document.getElementById('btn-tv-popup-close');
  if (_closeBtn) _closeBtn.addEventListener('click', window.tvClosePopup);

  console.log('✓ trafikverket: module loaded');
})();
