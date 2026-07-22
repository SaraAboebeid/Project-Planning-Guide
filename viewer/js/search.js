// =============================================================
// search.js — Address geocoding via Nominatim
// Depends on: cesium.js (viewer)
// =============================================================

const searchInput   = document.getElementById('search-input');
const searchBtn     = document.getElementById('search-btn');
const searchResults = document.getElementById('search-results');
// The button's own label from the markup, captured before the first search
// overwrites it. It used to be restored as the literal string '&#128269;',
// which textContent renders verbatim — so after one search the button read
// "&#128269;" instead of "Search".
const SEARCH_LABEL = searchBtn.textContent || 'Search';

// Bias geocoding to the active city/country (set by bootstrap.js from the
// build-time VIEWER_PROFILE) instead of hardcoding Gothenburg - so the UK
// viewer searches London/Rotherham/etc., not Gothenburg.
function _searchSuffix() {
  const city = window.VIEWER_CITY || {};
  const profile = window.VIEWER_PROFILE || {};
  const parts = [city.name, profile.country_name].filter(Boolean);
  return parts.length ? ' ' + parts.join(', ') : '';
}

async function geocodeAddress() {
  const q = searchInput.value.trim();
  if (!q) return;
  searchBtn.textContent = '…';
  try {
    const params = new URLSearchParams({ format: 'json', limit: '6', q: q + _searchSuffix() });
    const cc = (window.VIEWER_COUNTRY || '').toLowerCase(); // 'se' | 'gb'
    if (cc) params.set('countrycodes', cc);
    // Soft bias toward the viewed area (ranks nearby results higher; not bounded).
    const c = window.VIEW_CENTER;
    if (c) {
      const d = 0.25;
      params.set('viewbox', [c.lon - d, c.lat + d, c.lon + d, c.lat - d].join(','));
    }
    const url = 'https://nominatim.openstreetmap.org/search?' + params.toString();
    const data = await (await fetch(url)).json();
    if (!data.length) {
      searchResults.innerHTML = '<div class="result-item">No results</div>';
      searchResults.style.display = 'block';
      return;
    }
    searchResults.innerHTML = data.map((r,i) =>
      '<div class="result-item" data-idx="'+i+'">'+r.display_name+'</div>'
    ).join('');
    searchResults.style.display = 'block';
    searchResults._data = data;
  } catch(e) {
    searchResults.innerHTML = '<div class="result-item">Search failed</div>';
    searchResults.style.display = 'block';
  } finally {
    searchBtn.textContent = SEARCH_LABEL;
  }
}

searchBtn.addEventListener('click', geocodeAddress);
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') geocodeAddress(); });

searchResults.addEventListener('click', e => {
  const item = e.target.closest('.result-item');
  if (!item) return;
  const r = searchResults._data[parseInt(item.dataset.idx)];
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(parseFloat(r.lon), parseFloat(r.lat), 300),
    orientation: { heading:0, pitch: Cesium.Math.toRadians(-45), roll:0 },
    duration: 1.5,
  });
  searchResults.style.display = 'none';
});

// Dismiss results on outside click
document.addEventListener('click', e => {
  if (!document.getElementById('search-wrap').contains(e.target))
    searchResults.style.display = 'none';
});
