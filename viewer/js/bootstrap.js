// Viewer bootstrap: resolves the active country/city, loads that location's
// building payload, then wires the viewer scripts in their existing order.
//
// VIEWER_PROFILE is emitted per country by build.py (see gothenburg_3d.meta.js /
// uk_3d.meta.js). The country decides which data layers exist; the city decides
// where the camera starts and which payload to fetch. Both can be overridden from
// the query string, which is how the React MapViewer pages switch cities:
//
//     /uk_3d.html?city=birmingham
//
// Everything downstream reads window.VIEW_CENTER and window.VIEWER_CITY rather
// than a build-time constant, so one viewer serves every location.

(async function bootViewer() {
  if (window.location.protocol === 'file:') {
    document.getElementById('loading').innerHTML =
      '<div style="text-align:center;padding:40px;max-width:440px">' +
      '<div style="font-size:48px;margin-bottom:16px">&#128274;</div>' +
      '<h1 style="color:#96D74C;font-size:18px;margin-bottom:12px">Run via local server</h1>' +
      '<p style="color:#94a3b8;font-size:13px;line-height:1.8">Cesium cannot load its 3D engine from <b>file://</b>.<br><br>' +
      'Open a terminal in the project folder and run:<br><br>' +
      '<code style="background:rgba(255,255,255,0.1);padding:8px 20px;border-radius:8px;font-size:14px">python launch.py</code><br><br>' +
      'Your browser will open automatically at<br><b style="color:#a78bfa">http://localhost:8765</b></p>' +
      '</div>';
    throw new Error('file:// not supported');
  }

  const versionSuffix = typeof VIEWER_BUILD_VERSION === 'string' ? `?v=${encodeURIComponent(VIEWER_BUILD_VERSION)}` : '';

  // ── Resolve the active location ────────────────────────────────────────
  // Falls back to a single Gothenburg city so a profile-less build still boots.
  const profile = (typeof VIEWER_PROFILE !== 'undefined' && VIEWER_PROFILE) || {
    country: 'se',
    cities: [{ id: 'gothenburg', name: 'Gothenburg', lat: MAP_CENTER.lat, lon: MAP_CENTER.lon, data_file: 'buildings.json' }],
  };

  const params = new URLSearchParams(window.location.search);
  const wanted = (params.get('city') || '').toLowerCase();
  const city = profile.cities.find(c => c.id === wanted) || profile.cities[0];

  window.VIEWER_PROFILE = profile;
  window.VIEWER_COUNTRY = profile.country;
  window.VIEWER_CITY = city;
  window.VIEW_CENTER = { lon: city.lon, lat: city.lat };
  window.VIEW_HEIGHT = city.camera_height || 800;

  // Country gates the Sweden-only layers (Västtrafik, SCB) via CSS.
  document.body.setAttribute('data-country', profile.country);

  const loadScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${src}${versionSuffix}`;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });

  const dataUrl = city.data_file || 'buildings.json';
  const response = await fetch(`${dataUrl}${versionSuffix}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Could not load ${dataUrl} (${response.status})`);
  }

  const records = await response.json();
  // Keep a single in-memory copy; avoid re-serializing a very large payload.
  window.DATA = records;

  // Västtrafik and SCB are Swedish services with no UK equivalent, so they are
  // only loaded for Sweden rather than left to fail at runtime.
  const scripts = [
    'viewer/js/legend.js',
    'viewer/js/cesium.js',
    'viewer/js/ui.js',
    'viewer/js/pvgis.js',
    'viewer/js/facade_inspector.js',
    'viewer/js/search.js',
    'viewer/js/roads.js',
    ...(profile.country === 'se'
      ? ['viewer/js/trafik_canvas.js', 'viewer/js/vasttrafik.js']
      : []),
    'viewer/js/layers.js',
    ...(profile.country === 'se' ? ['viewer/js/scb_layers.js'] : []),
    'viewer/js/city_switcher.js',
    'viewer/js/country_profile.js',
  ];

  for (const src of scripts) {
    // Classic scripts preserve the existing global-variable architecture.
    // Loading them in order keeps the current viewer behavior intact.
    // eslint-disable-next-line no-await-in-loop
    await loadScript(src);
  }
})();
