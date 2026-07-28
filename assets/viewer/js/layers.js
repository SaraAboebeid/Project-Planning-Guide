// ─────────────────────────────────────────────────────────────────────────────
// layers.js  —  Google Maps-style layer controller
//
//  Base Maps (radio — pick one):    Light · Dark · Satellite · Photorealistic 3D
//  Overlays  (checkboxes — mix freely): Buildings · Live Transit · Störning · Parking
// ─────────────────────────────────────────────────────────────────────────────

function layersInit() {
  // ── Base Map selector ────────────────────────────────────────────────────
  ['light', 'dark', 'satellite', 'terrain', 'photo'].forEach(type => {
    document.getElementById('btn-base-' + type).addEventListener('click', () => {
      document.querySelectorAll('.base-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('btn-base-' + type).classList.add('active');
      window.setBasemap(type);
    });
  });

  // Sync when Google tiles fail / get disabled internally
  document.addEventListener('basemapReset', () => {
    document.querySelectorAll('.base-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-base-photo').classList.add('active');
  });

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
