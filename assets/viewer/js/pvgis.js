// =============================================================
// pvgis.js — Rooftop PV estimation via PVGIS API
// Depends on: ui.js (selectedBuilding), facade_inspector.js (lastPvgis)
// =============================================================

document.getElementById('btn-pvgis').addEventListener('click', () => {
  if (!selectedBuilding) return;
  fetchPVGIS(selectedBuilding);
});

// NOTE: All innerHTML strings use double-quotes (") for HTML attribute values.
async function fetchPVGIS(b) {
  const el = document.getElementById('pvgis-result');
  if (!b.footprint_m2 || !b.coordinates) {
    el.style.display = 'block';
    el.innerHTML = '<span style="color:#f87171">No footprint data available</span>';
    return;
  }
  const ring = b.coordinates[0];
  let sumLon = 0, sumLat = 0;
  for (const [lo, la] of ring) { sumLon += lo; sumLat += la; }
  const lat = (sumLat / ring.length).toFixed(5);
  const lon = (sumLon / ring.length).toFixed(5);
  const kWp = Math.round(b.footprint_m2 * 0.7 * 0.2 * 10) / 10;
  el.style.display = 'block';
  el.innerHTML = '<span style="color:#94a3b8">Fetching PVGIS\u2026</span>';
  try {
    const url = `http://localhost:8000/api/pvgis?lat=${lat}&lon=${lon}&peakpower=${kWp}&loss=14&angle=35&aspect=0`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const Ey = data.outputs && data.outputs.totals && data.outputs.totals.fixed && data.outputs.totals.fixed.E_y;
    if (!Ey) throw new Error('No yield data in response');
    const totalKwh = Math.round(Ey * kWp);
    const mwh = (totalKwh / 1000).toFixed(1);
    lastPvgis = { lat: parseFloat(lat), lon: parseFloat(lon), kWp, Ey, totalKwh, mwh, b };
    el.innerHTML =
      '<div style="color:#000000;font-weight:700;margin-bottom:4px">&#9728; Rooftop PV (PVGIS)</div>' +
      '<div style="display:grid;grid-template-columns:1fr auto;gap:2px 8px;color:#000000">' +
      '<span>System size</span><span style="font-weight:600">' + kWp + ' kWp</span>' +
      '<span>Annual yield</span><span style="color:#16a34a;font-weight:700">' + mwh + ' MWh/yr</span>' +
      '<span>Specific yield</span><span style="font-weight:600">' + Math.round(Ey) + ' kWh/kWp</span>' +
      '<span>Usable roof</span><span style="font-weight:600">' + Math.round(b.footprint_m2 * 0.7) + ' m\u00b2</span>' +
      '</div>' +
      '<button onclick="savePVGIS()" style="margin-top:8px;width:100%;padding:4px 8px;font-size:10px;' +
      'border-radius:6px;border:1px solid rgba(245,158,11,0.5);background:rgba(245,158,11,0.12);' +
      'color:#92400e;cursor:pointer;font-family:inherit">&#128190; Save PV result</button>' +
      '<div id="pvgis-save-status" style="font-size:10px;color:var(--muted);margin-top:3px"></div>';
  } catch(e) {
    const _netErr = (e instanceof TypeError) || (e.message || '').toLowerCase().includes('fetch');
    const _msg = _netErr
      ? '&#9888; Backend not running — restart with: python launch.py'
      : 'PVGIS error: ' + e.message;
    el.innerHTML = '<span style="color:#f87171">' + _msg + '</span>';
  }
}

async function savePVGIS() {
  if (!lastPvgis) return;
  const { lat, lon, kWp, Ey, totalKwh, b } = lastPvgis;
  const statusEl = document.getElementById('pvgis-save-status');
  if (statusEl) statusEl.textContent = 'Saving…';
  try {
    await fetch('http://localhost:8000/api/pvgis-save', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        lat, lon,
        address: b.address || null,
        kWp,
        annual_kwh: Math.round(Ey * kWp),
        specific_kwh_kwp: Math.round(Ey),
        roof_area_m2: Math.round(b.footprint_m2 * 0.7),
        building_info: { year: b.year, use: b.use_cat, eclass: b.eclass },
      }),
    });
    if (statusEl) statusEl.textContent = '\u2713 Saved';
    // Update sidebar badge
    const badge = document.getElementById('pvgis-saved-badge');
    badge.innerHTML = '&#128190; Saved: ' + lastPvgis.mwh + ' MWh/yr · ' + kWp + ' kWp';
    badge.style.display = 'block';
  } catch(e) {
    if (statusEl) statusEl.textContent = 'Save failed: ' + e.message;
  }
}
