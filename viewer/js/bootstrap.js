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

  // Optional focus from the caller (e.g. Step 2's "3D view" button passes the
  // bounding box of the selected buildings / neighborhood / area) — open the
  // camera there instead of the city default. ?bbox=north,south,east,west
  const bboxParam = params.get('bbox');
  if (bboxParam) {
    const [north, south, east, west] = bboxParam.split(',').map(Number);
    if ([north, south, east, west].every(Number.isFinite) && north !== south && east !== west) {
      const midLat = (north + south) / 2, midLon = (east + west) / 2;
      const latM = Math.abs(north - south) * 111320;
      const lonM = Math.abs(east - west) * 111320 * Math.cos(midLat * Math.PI / 180);
      const span = Math.max(latM, lonM, 120);
      window.VIEW_CENTER = { lon: midLon, lat: midLat };
      // Frame the whole selection: taller camera for a bigger area, clamped.
      window.VIEW_HEIGHT = Math.min(6000, Math.max(400, span * 1.5));
      window.FOCUS_BBOX = { north, south, east, west };
    }
  }

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
  // The ?v=<build version> suffix already busts the cache on every rebuild, so
  // let the browser cache this ~58 MB payload between reloads of the same build
  // (was cache:'no-store', which re-downloaded it every single time).
  const response = await fetch(`${dataUrl}${versionSuffix}`, { cache: 'default' });
  if (!response.ok) {
    throw new Error(`Could not load ${dataUrl} (${response.status})`);
  }

  const records = await response.json();
  // Keep a single in-memory copy; avoid re-serializing a very large payload.
  window.DATA = records;

  // Västtrafik and SCB are Swedish services with no UK equivalent, so they are
  // only loaded for Sweden rather than left to fail at runtime.
  const scripts = [
    'viewer/js/layer_docs.js',   // must precede ui.js — it hydrates the info buttons
    'viewer/js/legend.js',
    'viewer/js/cesium.js',
    'viewer/js/ui.js',
    'viewer/js/pvgis.js',
    'viewer/js/energy_sim.js',
    'viewer/js/facade_inspector.js',
    'viewer/js/search.js',
    'viewer/js/roads.js',
    ...(profile.country === 'se'
      ? ['viewer/js/trafik_canvas.js', 'viewer/js/vasttrafik.js', 'viewer/js/trafikverket.js', 'viewer/js/urban_analysis.js']
      : []),
    'viewer/js/layers.js',
    'viewer/js/vegetation.js',   // DTCC LiDAR-derived trees & shrubs (data is Gothenburg-only; no-ops elsewhere)
    'viewer/js/roofs.js',        // DTCC LiDAR-derived pitched roof caps (Gothenburg-only; no-ops elsewhere)
    'viewer/js/sunhours.js',     // direct sun-hours analysis (click a point → coloured disc)
    'viewer/js/incident.js',     // incident solar radiation (EPW sky matrix → kWh/m² disc)
    'viewer/js/comfort.js',      // outdoor thermal comfort (UTCI + solar MRT disc)
    ...(profile.country === 'se' ? ['viewer/js/scb_layers.js'] : []),
    'viewer/js/city_switcher.js',
  ];

  for (const src of scripts) {
    // Classic scripts preserve the existing global-variable architecture.
    // Loading them in order keeps the current viewer behavior intact.
    // eslint-disable-next-line no-await-in-loop
    await loadScript(src);
  }
})().catch((err) => {
  // Any boot failure (data fetch, a script failing to load, JSON parse) used to
  // throw unhandled and leave the viewer stuck forever on the loading screen.
  // Surface it instead so the problem is visible.
  const el = document.getElementById('loading');
  if (el) {
    el.style.display = 'flex';
    el.innerHTML =
      '<div style="text-align:center;padding:40px;max-width:460px">' +
      '<div style="font-size:44px;margin-bottom:14px">&#9888;&#65039;</div>' +
      '<h1 style="color:#F5A623;font-size:17px;margin-bottom:10px">The 3D viewer failed to load</h1>' +
      '<p style="color:#94a3b8;font-size:13px;line-height:1.7">' +
      String((err && err.message) || err).replace(/[<>&]/g, '') +
      '<br><br>Check that the backend/dev server is running, then reload. ' +
      'If it persists, open the browser console for details.</p>' +
      '</div>';
  }
  // eslint-disable-next-line no-console
  console.error('[viewer] boot failed:', err);
});
