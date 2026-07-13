// =============================================================
// city_switcher.js — city pills for multi-city countries (UK).
// Depends on: VIEWER_PROFILE, VIEWER_CITY (set by bootstrap.js)
//
// Switching city reloads the page with ?city=<id> rather than swapping the
// payload in place: each city is a separate buildings file and a separate camera,
// and a reload is both simpler and cheaper than tearing down the Cesium scene.
// =============================================================

(function initCitySwitcher() {
  const profile = window.VIEWER_PROFILE;
  const wrap = document.getElementById('city-switcher');
  if (!wrap || !profile) return;

  const cities = profile.cities || [];
  // A single-city country (Sweden) has nothing to switch between.
  if (cities.length < 2) {
    wrap.style.display = 'none';
    return;
  }

  const active = window.VIEWER_CITY;
  wrap.innerHTML = '';

  // Several entries can share the same city name (London has four districts) -
  // disambiguate those with the district instead of showing four identical pills.
  const nameCounts = {};
  for (const c of cities) nameCounts[c.name] = (nameCounts[c.name] || 0) + 1;

  for (const c of cities) {
    const btn = document.createElement('button');
    btn.className = 'lp-tab' + (c.id === active.id ? ' active' : '');
    btn.style.cssText = 'flex:0 0 auto;padding:5px 9px';
    btn.textContent = nameCounts[c.name] > 1 && c.district ? c.district : c.name;
    btn.title = c.district ? `${c.name} — ${c.district}` : c.name;
    if (c.id !== active.id) {
      btn.addEventListener('click', () => {
        const url = new URL(window.location.href);
        url.searchParams.set('city', c.id);
        window.location.href = url.toString();
      });
    }
    wrap.appendChild(btn);
  }

  const sub = document.getElementById('city-subtitle');
  if (sub && active.district) {
    sub.textContent = `${active.name} — ${active.district}`;
  }
})();
