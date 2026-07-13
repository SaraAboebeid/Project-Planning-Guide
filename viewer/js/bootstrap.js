// Viewer bootstrap: loads the compact data payload and then wires the legacy
// viewer scripts in their existing order.

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
  const loadScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${src}${versionSuffix}`;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });

  const response = await fetch(`buildings.json${versionSuffix}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Could not load buildings.json (${response.status})`);
  }

  const records = await response.json();
  // Keep a single in-memory copy; avoid re-serializing a very large payload.
  window.DATA = records;

  const scripts = [
    'viewer/js/legend.js',
    'viewer/js/cesium.js',
    'viewer/js/ui.js',
    'viewer/js/pvgis.js',
    'viewer/js/facade_inspector.js',
    'viewer/js/search.js',
    'viewer/js/roads.js',
    'viewer/js/trafik_canvas.js',
    'viewer/js/vasttrafik.js',
    'viewer/js/layers.js',
    'viewer/js/scb_layers.js',
    'viewer/js/country_profile.js',
  ];

  for (const src of scripts) {
    // Classic scripts preserve the existing global-variable architecture.
    // Loading them in order keeps the current viewer behavior intact.
    // eslint-disable-next-line no-await-in-loop
    await loadScript(src);
  }
})();