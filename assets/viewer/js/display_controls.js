/* display_controls.js — wires the Display section's "Visualization Mode" and
   "Color By" dropdowns to the viewer's globals (setBasemap / setColorMode).

   The old basemap radio buttons and colour tabs stay hidden in the DOM so their
   IDs and click handlers remain valid; these dropdowns just drive the same
   functions. "Color By" is only shown in the Solid modes (Light / Dark) — on
   Satellite the city is uniform grey, and Photorealistic/Terrain have no
   coloured overlay to tint. */
(function () {
  // Section icons keyed by the header label. 15px, stroke=currentColor.
  var SEC_ICONS = {
    'Display': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    'Building Analysis': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 8h.5M14.5 8h.5M9 12h.5M14.5 12h.5M10 21v-4h4v4"/></svg>',
    'Additional Layers': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
    'Environmental Analysis': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 4 13C4 6 12 2 20 2c0 8-5 16-9 18z"/><path d="M4 20c3.5-4 6-6 12-8"/></svg>',
    'Traffic': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13l1.3-4A2 2 0 0 1 9.2 8h5.6a2 2 0 0 1 1.9 1l1.3 4v5h-2v-2H8v2H6z"/><path d="M8 17h.5M15.5 17h.5"/></svg>',
    'Statistics': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M8 17v-5M13 17V8M18 17v-8"/></svg>',
    'Urban Analysis': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>'
  };
  function enhanceSectionHeaders() {
    var togs = document.querySelectorAll('.collapse-toggle');
    for (var i = 0; i < togs.length; i++) {
      var tog = togs[i];
      if (tog.querySelector('.sec-num')) continue;   // already enhanced
      var label = tog.querySelector('.collapse-label');
      if (!label) continue;
      var key = (label.textContent || '').trim();
      var num = document.createElement('span');
      num.className = 'sec-num';
      num.textContent = String(i + 1);
      var icon = document.createElement('span');
      icon.className = 'sec-icon';
      icon.innerHTML = SEC_ICONS[key] || '';
      tog.insertBefore(num, tog.firstChild);
      tog.insertBefore(icon, label);
      var chev = tog.querySelector('.collapse-chevron');
      if (chev) tog.appendChild(chev);            // chevron to the right, like the mockup
    }
  }

  function init() {
    enhanceSectionHeaders();
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
    let current = 'light';   // default active thumbnail for the viewer startup
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
    syncColorBy(current);   // Light default → Color By stays available
  }
  init();
})();
