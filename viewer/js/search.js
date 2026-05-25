// =============================================================
// search.js — Address geocoding via Nominatim
// Depends on: cesium.js (viewer)
// =============================================================

const searchInput   = document.getElementById('search-input');
const searchBtn     = document.getElementById('search-btn');
const searchResults = document.getElementById('search-results');

async function geocodeAddress() {
  const q = searchInput.value.trim();
  if (!q) return;
  searchBtn.textContent = '…';
  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=6&q=' +
                encodeURIComponent(q + ' Gothenburg');
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
    searchBtn.textContent = '&#128269;';
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
