// =============================================================
// energy_sim.js — EnergyPlus shoebox simulation via EPSM
// Depends on: ui.js (selectedBuilding, window.lastSavedWWR),
//             bootstrap.js (window.VIEWER_COUNTRY, window.VIEWER_CITY)
// =============================================================

let simPollHandle = null;
let simPollBuildingKey = null;

document.getElementById('btn-sim').addEventListener('click', () => {
  if (!selectedBuilding) return;
  submitSimulation(selectedBuilding);
});

function stopSimulationPolling() {
  if (simPollHandle) {
    clearInterval(simPollHandle);
    simPollHandle = null;
  }
  simPollBuildingKey = null;
}
window.stopSimulationPolling = stopSimulationPolling;

function _buildingCentroid(b) {
  const ring = b.coordinates && b.coordinates[0];
  if (!ring || !ring.length) return null;
  let sumLon = 0, sumLat = 0;
  for (const [lo, la] of ring) { sumLon += lo; sumLat += la; }
  return { lat: sumLat / ring.length, lon: sumLon / ring.length };
}

async function submitSimulation(b) {
  const el = document.getElementById('sim-result');
  const centroid = _buildingCentroid(b);
  if (!centroid || !b.height || !b.footprint_m2) {
    el.style.display = 'block';
    el.innerHTML = '<span style="color:#f87171">Not enough geometry data to simulate this building</span>';
    return;
  }
  const country = window.VIEWER_COUNTRY || 'se';
  const cityId = (window.VIEWER_CITY && window.VIEWER_CITY.id) || 'gothenburg';
  const wwrOverride = window.lastSavedWWR ? window.lastSavedWWR.average_wwr / 100 : null;

  el.style.display = 'block';
  el.innerHTML = '<span style="color:#94a3b8">Submitting simulation…</span>';
  stopSimulationPolling();

  try {
    const res = await fetch('http://localhost:8000/api/simulation-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: centroid.lat, lon: centroid.lon, address: b.address || null,
        country, city_id: cityId, building: b, wwr_override: wwrOverride,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    el.innerHTML = '<span style="color:#94a3b8">Simulation running… may take 1-3 min</span>';
    _pollSimulation(data.simulation_id, b);
  } catch (e) {
    const netErr = (e instanceof TypeError) || (e.message || '').toLowerCase().includes('fetch');
    el.innerHTML = '<span style="color:#f87171">' +
      (netErr ? '&#9888; Backend not running — restart with: python launch.py' : 'Simulation error: ' + e.message) +
      '</span>';
  }
}

function _pollSimulation(simulationId, b) {
  const key = simulationId;
  simPollBuildingKey = key;
  const el = document.getElementById('sim-result');

  const tick = async () => {
    // A newer poll (different building/simulation) has taken over - stop.
    if (simPollBuildingKey !== key) return;
    try {
      const res = await fetch(`http://localhost:8000/api/simulation-status/${simulationId}`);
      const status = await res.json();
      if (simPollBuildingKey !== key) return;
      if (status.status === 'completed') {
        stopSimulationPolling();
        const resultsRes = await fetch(`http://localhost:8000/api/simulation-results/${simulationId}`);
        const results = await resultsRes.json();
        _renderResults(results, b);
      } else if (status.status === 'failed') {
        stopSimulationPolling();
        el.innerHTML = '<span style="color:#f87171">Simulation failed: ' +
          (status.error_message || status.error || 'unknown error') + '</span>';
      }
      // else: still queued/running, keep polling
    } catch (e) {
      // transient network hiccup - keep polling, don't give up on one failed poll
    }
  };

  tick();
  simPollHandle = setInterval(tick, 4000);
}

function _renderResults(results, b) {
  const el = document.getElementById('sim-result');
  el.style.display = 'block';
  const compareRow = b.energy
    ? '<span>Recorded (energideklaration)</span><span style="color:var(--map-sidebar-text);font-weight:600">' + b.energy + ' kWh/m²</span>'
    : (b.tabula_kwh_m2_yr
      ? '<span>TABULA estimate</span><span style="color:var(--map-sidebar-text);font-weight:600">' + b.tabula_kwh_m2_yr + ' kWh/m²</span>'
      : '');
  el.innerHTML =
    // Colours come from the sidebar theme variables: this block was written with
    // hardcoded #000000 for a white panel, and reads as invisible black-on-black
    // now that the panel is dark. Labels muted, values bright.
    '<div style="color:var(--map-sidebar-text);font-weight:700;margin-bottom:4px">&#9889; EnergyPlus Simulation</div>' +
    '<div style="display:grid;grid-template-columns:1fr auto;gap:2px 8px;color:var(--map-sidebar-muted)">' +
    '<span>Heating</span><span style="color:#f87171;font-weight:700">' + results.heating_kwh_m2_yr + ' kWh/m²/yr</span>' +
    '<span>Cooling</span><span style="color:var(--map-sidebar-text);font-weight:600">' + results.cooling_kwh_m2_yr + ' kWh/m²/yr</span>' +
    '<span>Lighting</span><span style="color:var(--map-sidebar-text);font-weight:600">' + results.lighting_kwh_m2_yr + ' kWh/m²/yr</span>' +
    '<span>Equipment</span><span style="color:var(--map-sidebar-text);font-weight:600">' + results.equipment_kwh_m2_yr + ' kWh/m²/yr</span>' +
    '<span style="border-top:1px solid rgba(255,255,255,0.15);margin-top:2px;padding-top:2px">Total</span>' +
    '<span style="border-top:1px solid rgba(255,255,255,0.15);margin-top:2px;padding-top:2px;color:var(--map-sidebar-text);font-weight:700">' + results.total_kwh_m2_yr + ' kWh/m²/yr</span>' +
    compareRow +
    '</div>' +
    '<div style="font-size:10px;color:var(--muted);margin-top:4px">Single-zone shoebox model, ' +
    results.floors + ' floor' + (results.floors === 1 ? '' : 's') + ', ' + results.total_floor_area_m2 + ' m² total floor area</div>';
}

// Renders a simulation record found via /api/simulation-lookup when a
// building with a prior run is re-selected - resumes polling if it's still
// in flight, otherwise shows the cached completed result immediately.
function renderSimulationRecord(record) {
  if (!selectedBuilding) return;
  if (record.status === 'completed' && record.results) {
    _renderResults(record.results, selectedBuilding);
    const badge = document.getElementById('sim-saved-badge');
    badge.innerHTML = '&#128190; Saved: ' + record.results.total_kwh_m2_yr + ' kWh/m²/yr';
    badge.style.display = 'block';
  } else if (record.status === 'queued' || record.status === 'running') {
    const el = document.getElementById('sim-result');
    el.style.display = 'block';
    el.innerHTML = '<span style="color:#94a3b8">Simulation running… may take 1-3 min</span>';
    _pollSimulation(record.epsm_simulation_id, selectedBuilding);
  } else if (record.status === 'failed') {
    const el = document.getElementById('sim-result');
    el.style.display = 'block';
    el.innerHTML = '<span style="color:#f87171">Previous simulation failed: ' + (record.error || 'unknown error') + '</span>';
  }
}
window.renderSimulationRecord = renderSimulationRecord;
