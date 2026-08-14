// ─────────────────────────────────────────────────────────────────────────────
// layers.js  —  Google Maps-style layer controller
//
//  Base Maps (radio — pick one):    Light · Dark · Satellite · Photorealistic 3D
//  Overlays  (checkboxes — mix freely): Buildings · Live Transit · Störning · Parking
// ─────────────────────────────────────────────────────────────────────────────

function syncBaseSelection(type) {
  const target = type ? document.getElementById('btn-base-' + type) : null;
  document.querySelectorAll('.base-btn').forEach((btn) => {
    const active = btn === target;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-checked', active ? 'true' : 'false');
  });
}

function layersInit() {
  // ── Base Map selector ────────────────────────────────────────────────────
  ['light', 'dark', 'satellite', 'terrain', 'photo'].forEach(type => {
    const btn = document.getElementById('btn-base-' + type);
    if (!btn) return;   // e.g. the UK viewer has no "terrain" basemap button
    btn.addEventListener('click', () => {
      syncBaseSelection(type);
      window.setBasemap(type);
    });
  });

  // Keep the sidebar badge/list state aligned with the actual basemap.
  document.addEventListener('basemapReset', () => {
    syncBaseSelection('light');
  });

  syncBaseSelection('light');
  if (window.setBasemap) window.setBasemap('light');

  // ── Buildings overlay ────────────────────────────────────────────────────
  document.getElementById('btn-overlay-buildings').addEventListener('click', () => {
    document.getElementById('btn-eubucco').click();
    const on = document.getElementById('btn-eubucco').classList.contains('active');
    document.getElementById('btn-overlay-buildings').classList.toggle('active', on);
  });

  // ── Transit overlay ──────────────────────────────────────────────────────
  document.getElementById('btn-overlay-transit').addEventListener('click', () => {
    document.getElementById('btn-transit').click();
    // Active class sync is handled inside toggleTransit() itself
  });

  // ── Störning overlay ─────────────────────────────────────────────────────
  document.getElementById('btn-overlay-disruptions').addEventListener('click', () => {
    document.getElementById('btn-disruptions').click();
    document.getElementById('btn-overlay-disruptions').classList.toggle('active', _vtDisrVisible);
  });

  // ── Parking overlay ──────────────────────────────────────────────────────
  document.getElementById('btn-overlay-parking').addEventListener('click', () => {
    document.getElementById('btn-parking').click();
    document.getElementById('btn-overlay-parking').classList.toggle('active', _vtParkVisible);
  });
}

layersInit();
