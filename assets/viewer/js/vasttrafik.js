// ─────────────────────────────────────────────────────────────────────────────
// vasttrafik.js  —  Västtrafik real-time layers for the Gothenburg 3D viewer
//
//  Layer 1 – Transit   (btn-transit)      stops + live vehicles + departures
//  Layer 2 – Störning  (btn-disruptions)  current traffic disruptions
//  Layer 3 – Parkering (btn-parking)      park-and-ride lots + live availability
//
// Depends on:
//   • Cesium viewer  (global `viewer`)
//   • FastAPI backend on 
// ─────────────────────────────────────────────────────────────────────────────

const VT_API = '/api/vasttrafik';

// Every transit panel used to report a bare `Failed: HTTP 503`, which describes
// the transport layer rather than the problem — the actual cause is almost
// always "no Västtrafik API credentials configured", and the backend already
// says so in the JSON {detail}. One helper so every panel reports the real
// reason, and so a setup step stops looking like a broken viewer.
window.VT_SETUP_HINT =
  'Live transit needs Västtrafik API credentials. Register a free app at ' +
  'developer.vasttrafik.se, add VASTTRAFIK_CLIENT_ID and VASTTRAFIK_CLIENT_SECRET ' +
  'to the project .env, then restart the backend.';

// Set once a request has established the service is unconfigured, so callers
// can stop retrying something that cannot succeed until the backend restarts.
window.vtUnavailable = null;

async function vtFetchJson(path) {
  let r;
  try {
    r = await fetch(`${VT_API}${path}`);
  } catch (_) {
    throw new Error('Backend not reachable on :8000 — is it running?');
  }
  if (r.ok) { window.vtUnavailable = null; return r.json(); }

  let detail = '';
  try { detail = (await r.json()).detail || ''; } catch (_) { /* non-JSON error body */ }

  if (r.status === 503 && /credential/i.test(detail)) {
    window.vtUnavailable = window.VT_SETUP_HINT;
    throw new Error(window.VT_SETUP_HINT);
  }
  throw new Error(detail || `HTTP ${r.status}`);
}
window.vtFetchJson = vtFetchJson;

// A missing setup step is not an error the user caused — render it as a note to
// act on (amber, with the instructions) rather than a red failure.
function _vtErrorHtml(err) {
  const msg = (err && err.message) ? err.message : String(err);
  const isSetup = msg === window.VT_SETUP_HINT;
  return `<div style="color:${isSetup ? '#F5A623' : '#f87171'};font-size:11px;line-height:1.6">`
       + (isSetup ? '⚙ ' : 'Failed: ') + msg + '</div>';
}

// ═══════════════════════════════════════════════════════════════════════════
// ── LAYER 1: TRANSIT  ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

let _vtVisible      = false;
let _vtStopEntities = [];
let _vtStopsLoaded  = false;

const VT_MODE_COLOR = {
  tram:   Cesium.Color.fromCssColorString('#e9c24e'),
  bus:    Cesium.Color.fromCssColorString('#3b82f6'),
  ferry:  Cesium.Color.fromCssColorString('#22d3ee'),
  train:  Cesium.Color.fromCssColorString('#a78bfa'),
  subway: Cesium.Color.fromCssColorString('#f97316'),
};
function _vtModeColor(mode) { return VT_MODE_COLOR[mode] || VT_MODE_COLOR.bus; }

function toggleTransit() {
  _vtVisible = !_vtVisible;
  const btn = document.getElementById('btn-transit');
  if (_vtVisible) { btn.classList.add('active');    _vtShowLayer(); }
  else            { btn.classList.remove('active'); _vtHideLayer(); }
  // Keep visible overlay button in sync regardless of how toggleTransit was invoked
  const overlayBtn = document.getElementById('btn-overlay-transit');
  if (overlayBtn) overlayBtn.classList.toggle('active', _vtVisible);
}

async function _vtShowLayer() {
  const statusEl = document.getElementById('vt-status');
  statusEl.textContent = 'Loading transit stops…';
  statusEl.style.display = 'block';
  if (!_vtStopsLoaded) {
    await _vtLoadStops();
  } else {
    for (const e of _vtStopEntities) e.show = true;
  }
  if (window.trafikCanvasAnimation) window.trafikCanvasAnimation.start();
}

function _vtHideLayer() {
  for (const e of _vtStopEntities) { e.show = false; }
  if (window.trafikCanvasAnimation) window.trafikCanvasAnimation.stop();
  document.getElementById('vt-status').style.display = 'none';
  document.getElementById('vt-panel').style.display  = 'none';
}

async function _vtLoadStops() {
  try {
    const data = await vtFetchJson('/stops');
    for (const stop of (data.stops || [])) {
      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(stop.lon, stop.lat, 2),
        billboard: {
          image:          _vtBusStopSvg(),
          width:          30, height: 30,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(200, 1.5, 2000, 0.5),
        },
        label: {
          text: stop.name,
          font: '10px Inter, sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -28),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance:        new Cesium.NearFarScalar(200, 1.0, 1500, 0.0),
          translucencyByDistance: new Cesium.NearFarScalar(400, 1.0, 1200, 0.0),
        },
        properties: { gid: stop.gid, name: stop.name, type: 'vt-stop' },
      });
      _vtStopEntities.push(entity);
    }
    _vtStopsLoaded = true;
    const statusEl = document.getElementById('vt-status');
    statusEl.textContent = `${data.count} stops loaded`;
    setTimeout(() => { if (_vtVisible) statusEl.style.display = 'none'; }, 2500);
  } catch (err) {
    console.error('[vasttrafik] stops error', err);
    document.getElementById('vt-status').textContent =
      (err.message === window.VT_SETUP_HINT) ? err.message : ('Could not load stops: ' + err.message);
  }
}

// Vehicle positions are now rendered by trafik_canvas.js (canvas overlay)
// with smooth interpolation, glow, and trails — adapted from MR-Studio-Demo.

async function _vtShowDepartures(gid, name) {
  const panel = document.getElementById('vt-panel');
  document.getElementById('vt-panel-title').textContent = name;
  document.getElementById('vt-departures').innerHTML =
    '<div style="color:var(--muted);padding:8px 0">Loading…</div>';
  panel.style.display = 'block';
  try {
    const data = await vtFetchJson(`/departures/${encodeURIComponent(gid)}`);
    _vtRenderDepartures(data.departures || []);
  } catch (err) {
    document.getElementById('vt-departures').innerHTML =
      _vtErrorHtml(err);
  }
}

function _vtRenderDepartures(departures) {
  const el = document.getElementById('vt-departures');
  if (!departures.length) {
    el.innerHTML = '<div style="color:var(--muted);padding:8px 0">No upcoming departures</div>';
    return;
  }
  el.innerHTML = departures.map(d => {
    const estimated = _vtFormatTime(d.estimatedTime || d.plannedTime);
    const delay     = _vtDelayMinutes(d.plannedTime, d.estimatedTime);
    const delayStr  = delay > 1  ? `<span style="color:#f87171;margin-left:3px">+${delay}m</span>`
                    : delay < -1 ? `<span style="color:#4ade80;margin-left:3px">${delay}m</span>` : '';
    const cancelled = d.isCancelled
      ? '<span style="color:#f87171;font-weight:600"> ✕</span>' : '';
    const bg = d.bgColor ? (d.bgColor.startsWith('#') ? d.bgColor : '#' + d.bgColor) : '#1d4ed8';
    const fg = d.fgColor ? (d.fgColor.startsWith('#') ? d.fgColor : '#' + d.fgColor) : '#ffffff';
    return `<div class="vt-dep-row">
      <span class="vt-line-badge" style="background:${bg};color:${fg}">${d.line}</span>
      <span class="vt-dest">${d.destination || ''}</span>
      <span class="vt-time">${estimated}${delayStr}${cancelled}</span>
    </div>`;
  }).join('');
}

function _vtFormatTime(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }); }
  catch { return iso.slice(11, 16) || ''; }
}
function _vtDelayMinutes(planned, estimated) {
  if (!planned || !estimated) return 0;
  try { return Math.round((new Date(estimated) - new Date(planned)) / 60000); }
  catch { return 0; }
}

// ═══════════════════════════════════════════════════════════════════════════
// ── LAYER 2: STÖRNING (DISRUPTIONS)  ──────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

let _vtDisrVisible = false;
let _vtDisrData    = null;

const VT_SEV_COLOR = {
  severe:   '#ef4444',
  moderate: '#f97316',
  slight:   '#facc15',
  unknown:  '#94a3b8',
};

function toggleDisruptions() {
  _vtDisrVisible = !_vtDisrVisible;
  const btn = document.getElementById('btn-disruptions');
  if (_vtDisrVisible) {
    btn.classList.add('active');
    _vtShowDisruptionPanel();
  } else {
    btn.classList.remove('active');
    document.getElementById('vt-disr-panel').style.display = 'none';
  }
}

async function _vtShowDisruptionPanel() {
  const panel  = document.getElementById('vt-disr-panel');
  const listEl = document.getElementById('vt-disr-list');
  panel.style.display = 'block';
  listEl.innerHTML = '<div style="color:var(--muted);padding:8px 0">Loading disruptions…</div>';
  try {
    if (!_vtDisrData) {
      const data = await vtFetchJson('/disruptions');
      _vtDisrData = data.disruptions || [];
    }
    _vtRenderDisruptions(_vtDisrData);
  } catch (err) {
    listEl.innerHTML = _vtErrorHtml(err);
  }
}

function _vtRenderDisruptions(disruptions) {
  const el = document.getElementById('vt-disr-list');
  document.getElementById('vt-disr-count').textContent =
    disruptions.length + ' active disruption' + (disruptions.length !== 1 ? 's' : '');
  if (!disruptions.length) {
    el.innerHTML = '<div style="color:#4ade80;padding:8px 0">✓ No active disruptions</div>';
    return;
  }
  el.innerHTML = disruptions.map(d => {
    const color   = VT_SEV_COLOR[d.severity] || VT_SEV_COLOR.unknown;
    const lineHtml = (d.lines || []).slice(0, 5).map(ln => {
      const bg = ln.bgColor ? (ln.bgColor.startsWith('#') ? ln.bgColor : '#' + ln.bgColor) : '#1d4ed8';
      const fg = ln.fgColor ? (ln.fgColor.startsWith('#') ? ln.fgColor : '#' + ln.fgColor) : '#ffffff';
      return `<span class="vt-line-badge" style="background:${bg};color:${fg}">${ln.designation}</span>`;
    }).join('');
    const extraLines = d.lines && d.lines.length > 5
      ? `<span style="color:var(--muted);font-size:10px"> +${d.lines.length - 5} more</span>` : '';
    const endDate = d.endTime ? _vtFormatDate(d.endTime) : '';
    return `<div class="vt-disr-row" onclick="_vtToggleDisrDetail(this)">
      <div class="vt-disr-header">
        <span class="vt-disr-dot" style="background:${color}"></span>
        <span class="vt-disr-title">${_vtEscape(d.title)}</span>
        <span class="vt-disr-sev">${d.severity}</span>
      </div>
      <div class="vt-disr-lines">${lineHtml}${extraLines}</div>
      <div class="vt-disr-body" style="display:none">
        <p style="margin:4px 0 2px;font-size:11px;color:var(--text-muted)">${_vtEscape(d.description)}</p>
        ${endDate ? `<p style="font-size:10px;color:var(--muted)">Until ${endDate}</p>` : ''}
      </div>
    </div>`;
  }).join('');
}

function _vtToggleDisrDetail(row) {
  const body = row.querySelector('.vt-disr-body');
  body.style.display = body.style.display === 'none' ? 'block' : 'none';
}

function _vtFormatDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso.slice(0, 10); }
}

// ═══════════════════════════════════════════════════════════════════════════
// ── LAYER 3: PENDELPARKERING (PARK-AND-RIDE)  ──────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

let _vtParkVisible  = false;
let _vtParkEntities = [];
let _vtParkData     = null;

function toggleParking() {
  _vtParkVisible = !_vtParkVisible;
  const btn = document.getElementById('btn-parking');
  if (_vtParkVisible) {
    btn.classList.add('active');
    _vtShowParkingLayer();
  } else {
    btn.classList.remove('active');
    _vtHideParkingLayer();
  }
}

async function _vtShowParkingLayer() {
  if (!_vtParkData) {
    try {
      const data = await vtFetchJson('/parking');
      _vtParkData = data.lots || [];
    } catch (err) {
      console.error('[vasttrafik] parking error', err);
      const st = document.getElementById('vt-status');
      st.textContent = 'Could not load parking: ' + err.message;
      st.style.display = 'block';
      return;
    }
  }
  for (const lot of _vtParkData) {
    const e = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lot.lon, lot.lat, 2),
      billboard: {
        image:  _vtParkSvg('#22c55e'),
        width:  38, height: 38,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(300, 1.4, 3000, 0.5),
      },
      label: {
        text: lot.name,
        font: '10px Inter, sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -30),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance:        new Cesium.NearFarScalar(200, 1.0, 1000, 0.0),
        translucencyByDistance: new Cesium.NearFarScalar(300, 1.0, 900, 0.0),
      },
      properties: { type: 'vt-parking', lotId: lot.lotId, name: lot.name, capacity: lot.capacity },
    });
    _vtParkEntities.push(e);
  }
}

function _vtHideParkingLayer() {
  for (const e of _vtParkEntities) viewer.entities.remove(e);
  _vtParkEntities = [];
  document.getElementById('vt-park-panel').style.display = 'none';
}

async function _vtShowParkingDetail(lotId, name, capacity) {
  const panel  = document.getElementById('vt-park-panel');
  const detail = document.getElementById('vt-park-detail');
  document.getElementById('vt-park-title').textContent = name;
  detail.innerHTML = '<div style="color:var(--muted);padding:6px 0">Fetching availability…</div>';
  panel.style.display = 'block';
  try {
    const data = await vtFetchJson(`/parking/${encodeURIComponent(lotId)}/availability`);
    const avail = data.available;
    const total = data.total || capacity;
    const pct   = (avail != null && total > 0) ? Math.round(avail / total * 100) : null;
    const color = pct == null ? '#94a3b8' : pct > 40 ? '#22c55e' : pct > 15 ? '#facc15' : '#ef4444';
    const bar   = pct != null
      ? `<div class="vt-park-bar-bg"><div class="vt-park-bar-fill" style="width:${pct}%;background:${color}"></div></div>` : '';
    detail.innerHTML = avail == null
      ? `<div style="color:var(--muted)">No live data — total capacity ${total}</div>`
      : `<div class="vt-park-avail">
          <span style="font-size:22px;font-weight:700;color:${color}">${avail}</span>
          <span style="color:var(--muted);font-size:12px"> / ${total} free spots</span>
        </div>${bar}
        ${data.updated ? `<div style="color:var(--muted);font-size:10px;margin-top:4px">Updated ${_vtFormatTime(data.updated)}</div>` : ''}`;
  } catch (err) {
    detail.innerHTML = _vtErrorHtml(err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ── SVG ICON HELPERS  ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function _vtBusStopSvg() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
    <circle cx="11" cy="11" r="10" fill="#1e3a5f" stroke="#60a5fa" stroke-width="1.5"/>
    <text x="11" y="15" text-anchor="middle" font-size="11" font-family="sans-serif"
          font-weight="bold" fill="#60a5fa">B</text></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

function _vtVehicleSvg(hexColor, lineLabel) {
  const label = (lineLabel || '').slice(0, 4);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <rect x="2" y="2" width="24" height="24" rx="5" fill="${hexColor}" stroke="#fff" stroke-width="1.5"/>
    <text x="14" y="19" text-anchor="middle" font-size="${label.length > 2 ? 8 : 10}"
          font-family="sans-serif" font-weight="bold" fill="#fff">${label}</text></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

function _vtParkSvg(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="38" viewBox="0 0 38 38">
    <circle cx="19" cy="19" r="17" fill="${color}" stroke="#fff" stroke-width="2"/>
    <circle cx="19" cy="19" r="17" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="5"/>
    <text x="19" y="26" text-anchor="middle" font-size="20" font-family="Inter,sans-serif"
          font-weight="bold" fill="#fff">P</text></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svg);
}

function _vtEscape(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ═══════════════════════════════════════════════════════════════════════════
// ── UNIFIED CESIUM PICK HANDLER  ───────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

(function _vtRegisterPickHandler() {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
  handler.setInputAction(evt => {
    const picked = viewer.scene.pick(evt.position);
    if (!picked || !picked.id) return;
    const props = picked.id.properties;
    if (!props) return;
    const type = props.type && props.type.getValue ? props.type.getValue() : props.type;
    if (type === 'vt-stop' && _vtVisible) {
      const gid  = props.gid  && props.gid.getValue  ? props.gid.getValue()  : props.gid;
      const name = props.name && props.name.getValue ? props.name.getValue() : props.name;
      _vtShowDepartures(gid, name);
    } else if (type === 'vt-parking' && _vtParkVisible) {
      const lotId    = props.lotId    && props.lotId.getValue    ? props.lotId.getValue()    : props.lotId;
      const name     = props.name     && props.name.getValue     ? props.name.getValue()     : props.name;
      const capacity = props.capacity && props.capacity.getValue ? props.capacity.getValue() : props.capacity;
      _vtShowParkingDetail(lotId, name, capacity);
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
})();

// ═══════════════════════════════════════════════════════════════════════════
// ── BUTTON + CLOSE WIRING  ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

document.getElementById('btn-transit').addEventListener('click', toggleTransit);
document.getElementById('btn-disruptions').addEventListener('click', toggleDisruptions);
document.getElementById('btn-parking').addEventListener('click', toggleParking);

document.getElementById('btn-vt-close').addEventListener('click', () => {
  document.getElementById('vt-panel').style.display = 'none';
});
document.getElementById('btn-disr-close').addEventListener('click', () => {
  document.getElementById('vt-disr-panel').style.display = 'none';
  _vtDisrVisible = false;
  document.getElementById('btn-disruptions').classList.remove('active');
});
document.getElementById('btn-park-close').addEventListener('click', () => {
  document.getElementById('vt-park-panel').style.display = 'none';
});
