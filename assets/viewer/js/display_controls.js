/* display_controls.js — wires the Display section's "Visualization Mode" and
   "Color By" dropdowns to the viewer's globals (setBasemap / setColorMode).

   The old basemap radio buttons and colour tabs stay hidden in the DOM so their
   IDs and click handlers remain valid; these dropdowns just drive the same
   functions. "Color By" is only shown in the Solid modes (Light / Dark) — on
   Satellite the city is uniform grey, and Photorealistic/Terrain have no
   coloured overlay to tint. */
(function () {
  function init() {
    const thumbs = Array.prototype.slice.call(document.querySelectorAll('.bm-thumb'));
    const cby = document.getElementById('color-by-select');
    const cbyRow = document.getElementById('color-by-row');
    if (!thumbs.length || typeof window.setBasemap !== 'function' || typeof window.setColorMode !== 'function') {
      setTimeout(init, 300);
      return;
    }
    // "Color By" only makes sense on the Solid (Light/Dark) maps.
    const syncColorBy = (mode) => {
      const solid = mode === 'light' || mode === 'dark';
      if (cbyRow) cbyRow.style.display = solid ? 'flex' : 'none';
    };
    let current = 'photo';   // default active thumbnail (matches the viewer's startup)
    thumbs.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        if (mode === current) return;
        current = mode;
        thumbs.forEach((t) => {
          const on = t === btn;
          t.classList.toggle('active', on);
          t.setAttribute('aria-checked', String(on));
        });
        window.setBasemap(mode);
        syncColorBy(mode);
      });
    });
    if (cby) cby.addEventListener('change', () => window.setColorMode(cby.value));
    syncColorBy(current);   // Photorealistic default → Color By hidden
  }
  init();
})();
