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
  // Roof area ≈ building footprint (flat-roof plan projection). Assume 80% of it
  // is usable for panels, at ~0.2 kWp/m² module density (~5 m²/kWp).
  const ROOF_COVERAGE = 0.8;
  const KWP_PER_M2    = 0.2;
  const usableRoof = b.footprint_m2 * ROOF_COVERAGE;
  const kWp = Math.round(usableRoof * KWP_PER_M2 * 10) / 10;
  el.style.display = 'block';
  el.innerHTML = '<span style="color:#94a3b8">Fetching PVGIS\u2026</span>';
  try {
    const url = `/api/pvgis?lat=${lat}&lon=${lon}&peakpower=${kWp}&loss=14&angle=35&aspect=0`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    // PVGIS E_y = total annual production of the WHOLE system for the peakpower
    // we sent, already in kWh — NOT a per-kWp specific yield. Don't multiply by kWp.
    const Ey = data.outputs && data.outputs.totals && data.outputs.totals.fixed && data.outputs.totals.fixed.E_y;
    if (!Ey) throw new Error('No yield data in response');
    const annualKwh = Math.round(Ey);
    const mwh = (annualKwh / 1000).toFixed(1);
    const specificYield = Math.round(annualKwh / kWp);   // kWh per kWp installed
    lastPvgis = { lat: parseFloat(lat), lon: parseFloat(lon), kWp, annualKwh, mwh, specificYield, usableRoof, b };
    const R = window.arRow;   // shared row builder \u2014 identical formatting to the sim card
    el.innerHTML =
      '<div class="ar-head">&#9728; Rooftop PV (PVGIS)' +
      '<button class="ar-close" title="Close" onclick="closeAnalysis(\'pvgis-result\')">&#x2715;</button></div>' +
      '<div class="ar-grid">' +
      R('System size',   kWp, 'kWp') +
      R('Annual yield',  mwh, 'MWh/yr', { color: '#4ade80' }) +
      R('Specific yield', specificYield, 'kWh/kWp') +
      R('Usable roof',   Math.round(usableRoof), 'm\u00b2') +
      '</div>' +
      '<button onclick="savePVGIS()" style="margin-top:8px;width:100%;padding:5px 8px;font-size:10px;' +
      'border-radius:6px;border:1px solid rgba(245,158,11,0.5);background:rgba(245,158,11,0.12);' +
      'color:#fbbf24;cursor:pointer;font-family:inherit">&#128190; Save PV result</button>' +
      '<div id="pvgis-save-status" style="font-size:10px;color:var(--map-sidebar-muted);margin-top:5px"></div>';
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
  const { lat, lon, kWp, annualKwh, specificYield, usableRoof, b } = lastPvgis;
  const statusEl = document.getElementById('pvgis-save-status');
  if (statusEl) statusEl.textContent = 'Saving…';
  try {
    await fetch('/api/pvgis-save', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        lat, lon,
        address: b.address || null,
        kWp,
        annual_kwh: annualKwh,
        specific_kwh_kwp: specificYield,
        roof_area_m2: Math.round(usableRoof),
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
