// ═══════════════════════════════════════════════════════════════════════════
// trafik_canvas.js — Canvas-based live vehicle animation for Cesium viewer
//
// Adapted from MR-Studio-Demo/animations/trafik.js (SB-Chalmers/Nodal-Works)
// Key change: coordinate projection via Cesium.SceneTransforms instead of
//             Mapbox map.project(), data from local FastAPI backend.
//
// API: exposes window.trafikCanvasAnimation = { start, stop, isActive }
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Canvas setup ──────────────────────────────────────────────────────────
  const trafikCanvas = document.createElement('canvas');
  trafikCanvas.id = 'trafik-canvas';
  trafikCanvas.style.cssText = `
    position: absolute;
    left: 0; top: 0;
    width: 100%; height: 100%;
    z-index: 10;
    pointer-events: none;
    display: none;
  `;
  const trafikCtx = trafikCanvas.getContext('2d');

  // ── Animation state ───────────────────────────────────────────────────────
  let animFrame     = null;
  let isAnimating   = false;
  let vehicles      = [];
  let lastFetchTime = 0;
  let fetchPending  = false;

  // ── Configuration ─────────────────────────────────────────────────────────
  const CONFIG = {
    apiBase:             'http://localhost:8000/api/vasttrafik',
    fetchIntervalMs:     3000,    // fetch new positions every 3 s
    viewPad:             0.07,    // degrees bounding box padding from camera centre
    vehicleSize:         22,      // radius of vehicle circle
    glowRadius:          42,
    trailHistoryLength:  100,     // max stored positions per vehicle
    interpolationSpeed:  0.08,    // lerp factor (0-1) — lower = smoother/slower
    trailWidth:          7,
    trailFadeStart:      0.85,    // opacity of trail at newest point

    // Västtrafik brand colours + data-viz palette
    colors: {
      BUS:     { fill: '#00A5E0' },   // Västtrafik blue
      TRAM:    { fill: '#FFD700' },   // gold / yellow (fallback)
      TRAIN:   { fill: '#E31837' },   // red
      FERRY:   { fill: '#00B4A0' },   // teal
      UNKNOWN: { fill: '#FFFFFF' },
    },

    // Official Gothenburg tram/bus line colours (fallback when API omits them).
    // Source: Västtrafik line map — bg / fg pairs.
    lineColors: {
      // Trams (Göteborgs Spårvägar)
      '1':  { bg: '#009640', fg: '#ffffff' },  // green
      '2':  { bg: '#e30613', fg: '#ffffff' },  // red
      '3':  { bg: '#f39200', fg: '#ffffff' },  // orange
      '4':  { bg: '#0068b4', fg: '#ffffff' },  // blue
      '5':  { bg: '#e30613', fg: '#ffffff' },  // red
      '6':  { bg: '#e30613', fg: '#ffffff' },  // red
      '7':  { bg: '#009640', fg: '#ffffff' },  // green
      '8':  { bg: '#0068b4', fg: '#ffffff' },  // blue
      '9':  { bg: '#0068b4', fg: '#ffffff' },  // blue
      '10': { bg: '#0068b4', fg: '#ffffff' },  // blue
      '11': { bg: '#009640', fg: '#ffffff' },  // green
      '13': { bg: '#f7d100', fg: '#000000' },  // yellow
      // Express buses
      '16': { bg: '#e30613', fg: '#ffffff' },
      '55': { bg: '#e30613', fg: '#ffffff' },
      '58': { bg: '#f39200', fg: '#ffffff' },
    },
  };

  // ── Cesium coordinate projection ──────────────────────────────────────────
  // Handles both old wgs84ToWindowCoordinates and new worldToWindowCoordinates
  const _cesiumProject = (function () {
    if (typeof Cesium === 'undefined') return null;
    return Cesium.SceneTransforms.worldToWindowCoordinates
        || Cesium.SceneTransforms.wgs84ToWindowCoordinates;
  })();

  function projectToCanvas(lng, lat) {
    if (!_cesiumProject) return null;
    const cartesian = Cesium.Cartesian3.fromDegrees(lng, lat, 0);
    return _cesiumProject(viewer.scene, cartesian) || null;
  }

  function isOnScreen(pos, padding) {
    if (!pos) return false;
    const p = padding ?? 50;
    return pos.x >= -p && pos.x <= trafikCanvas.width  + p
        && pos.y >= -p && pos.y <= trafikCanvas.height + p;
  }

  // ── Canvas sizing ─────────────────────────────────────────────────────────
  function resizeCanvas() {
    const el = document.getElementById('cesium-container');
    if (!el) return;
    trafikCanvas.width  = el.clientWidth;
    trafikCanvas.height = el.clientHeight;
  }

  // ── Fetch positions from FastAPI backend ──────────────────────────────────
  async function fetchPositions() {
    try {
      const cart = viewer.scene.globe.ellipsoid
                       .cartesianToCartographic(viewer.camera.position);
      const clat = Cesium.Math.toDegrees(cart.latitude);
      const clon = Cesium.Math.toDegrees(cart.longitude);
      const pad  = CONFIG.viewPad;
      const params = new URLSearchParams({
        south: (clat - pad).toFixed(5),
        north: (clat + pad).toFixed(5),
        west:  (clon - pad).toFixed(5),
        east:  (clon + pad).toFixed(5),
      });
      const r = await fetch(`${CONFIG.apiBase}/positions?${params}`);
      if (!r.ok) return [];
      const data = await r.json();
      return (data.vehicles || [])
        .filter(v => v.lat && v.lon)
        .map(v => ({
          lat:       v.lat,
          lng:       v.lon,
          type:      (v.transportMode || 'BUS').toUpperCase(),
          line:      v.line || '',
          apiColors: v.bgColor ? {
            bg: v.bgColor.startsWith('#') ? v.bgColor : '#' + v.bgColor,
            fg: v.fgColor ? (v.fgColor.startsWith('#') ? v.fgColor : '#' + v.fgColor) : '#ffffff',
          } : null,
        }));
    } catch (err) {
      console.warn('[trafik_canvas] fetch error', err.message);
      return [];
    }
  }

  // ── Nearest-neighbour matching for smooth interpolation ───────────────────
  // (backend doesn't expose stable vehicle IDs, so we match by closest
  //  same-type/same-line vehicle within a ~200m distance threshold)
  function matchAndMerge(newPositions) {
    const oldVehicles = vehicles;
    const used        = new Set();

    return newPositions.map(v => {
      let bestOld  = null;
      let bestDist = Infinity;

      for (let i = 0; i < oldVehicles.length; i++) {
        if (used.has(i)) continue;
        const old = oldVehicles[i];
        if (old.type !== v.type || old.line !== v.line) continue;
        const dlat = old.lat - v.lat;
        const dlng = old.lng - v.lng;
        const dist = dlat * dlat + dlng * dlng;   // ~(deg)²
        if (dist < bestDist) { bestDist = dist; bestOld = { old, i }; }
      }

      // Accept match within ~0.002 deg² ≈ ~200 m radius
      if (bestOld && bestDist < 0.000004) {
        used.add(bestOld.i);
        const old = bestOld.old;
        v.displayLng     = old.displayLng ?? old.lng;
        v.displayLat     = old.displayLat ?? old.lat;
        v.positionHistory = old.positionHistory || [];

        // Record current interpolated position if it moved meaningfully
        const last = v.positionHistory[v.positionHistory.length - 1];
        if (!last
            || Math.abs(last.lng - v.displayLng) > 0.00001
            || Math.abs(last.lat - v.displayLat) > 0.00001) {
          v.positionHistory.push({ lng: v.displayLng, lat: v.displayLat });
          if (v.positionHistory.length > CONFIG.trailHistoryLength) {
            v.positionHistory.shift();
          }
        }
      } else {
        // New vehicle — start at actual position, empty trail
        v.displayLng      = v.lng;
        v.displayLat      = v.lat;
        v.positionHistory = [];
      }

      return v;
    });
  }

  async function fetchAndUpdate() {
    if (fetchPending) return;
    fetchPending = true;
    const newPositions = await fetchPositions();
    if (isAnimating && newPositions.length > 0) {
      vehicles = matchAndMerge(newPositions);
    }
    fetchPending = false;
  }

  // ── Interpolation (lerp display position toward target each frame) ────────
  function interpolateVehicles() {
    const speed = CONFIG.interpolationSpeed;
    vehicles.forEach(v => {
      if (v.displayLng === undefined) {
        v.displayLng = v.lng;
        v.displayLat = v.lat;
        return;
      }
      v.displayLng += (v.lng - v.displayLng) * speed;
      v.displayLat += (v.lat - v.displayLat) * speed;

      if (!v.positionHistory) v.positionHistory = [];
      const last = v.positionHistory[v.positionHistory.length - 1];
      if (!last
          || Math.abs(last.lng - v.displayLng) > 0.0000005
          || Math.abs(last.lat - v.displayLat) > 0.0000005) {
        v.positionHistory.push({ lng: v.displayLng, lat: v.displayLat });
        if (v.positionHistory.length > CONFIG.trailHistoryLength) {
          v.positionHistory.shift();
        }
      }
    });
  }

  // ── Drawing ───────────────────────────────────────────────────────────────
  function drawVehicle(ctx, vehicle) {
    const displayLng = vehicle.displayLng ?? vehicle.lng;
    const displayLat = vehicle.displayLat ?? vehicle.lat;
    const pos = projectToCanvas(displayLng, displayLat);
    if (!isOnScreen(pos)) return;

    let bgColor = CONFIG.colors[vehicle.type]?.fill || '#FFFFFF';
    let fgColor = '#FFFFFF';

    // Priority 1: colours returned by the Västtrafik API
    if (vehicle.apiColors?.bg) {
      bgColor = vehicle.apiColors.bg;
      fgColor = vehicle.apiColors.fg || '#FFFFFF';
    }
    // Priority 2: hardcoded Gothenburg line-colour lookup
    else {
      const lc = CONFIG.lineColors[vehicle.line];
      if (lc) { bgColor = lc.bg; fgColor = lc.fg; }
    }

    const size = CONFIG.vehicleSize;
    ctx.save();

    // ── Trail ──────────────────────────────────────────────────────────────
    const history = vehicle.positionHistory || [];
    if (history.length > 1) {
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';

      for (let i = 1; i < history.length; i++) {
        const p1 = projectToCanvas(history[i - 1].lng, history[i - 1].lat);
        const p2 = projectToCanvas(history[i].lng,     history[i].lat);
        if (!p1 || !p2) continue;
        const progress = i / history.length;
        const opacity  = CONFIG.trailFadeStart * progress;
        const width    = CONFIG.trailWidth * (0.3 + 0.7 * progress);
        ctx.strokeStyle = bgColor + Math.round(opacity * 255).toString(16).padStart(2, '0');
        ctx.lineWidth   = width;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }

      // Final segment: last history point → current display position
      const lastHist = history[history.length - 1];
      const p1 = projectToCanvas(lastHist.lng, lastHist.lat);
      if (p1) {
        ctx.strokeStyle = bgColor + 'CC';
        ctx.lineWidth   = CONFIG.trailWidth;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      }
    }

    // ── Soft glow ──────────────────────────────────────────────────────────
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, CONFIG.glowRadius);
    glow.addColorStop(0,   bgColor + '88');
    glow.addColorStop(0.5, bgColor + '44');
    glow.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, CONFIG.glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // ── Vehicle circle ─────────────────────────────────────────────────────
    ctx.globalCompositeOperation = 'source-over';
    // White ring border
    ctx.fillStyle   = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, size + 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle   = bgColor;
    ctx.shadowColor = bgColor;
    ctx.shadowBlur  = 20;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // ── Line number ────────────────────────────────────────────────────────
    if (vehicle.line) {
      const fontSize = vehicle.line.length > 3 ? Math.round(size * 0.7) : Math.round(size * 0.85);
      ctx.font         = `bold ${fontSize}px "Inter", sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      // Slight text shadow for legibility
      ctx.shadowColor  = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur   = 3;
      ctx.fillStyle    = fgColor;
      ctx.fillText(vehicle.line, pos.x, pos.y + 1);
      ctx.shadowBlur   = 0;
    }

    ctx.restore();
  }

  function drawLegend(ctx) {
    const x     = 20;
    let   y     = trafikCanvas.height - 100;
    const lineH = 18;

    const counts = { BUS: 0, TRAM: 0 };
    vehicles.forEach(v => { if (v.type in counts) counts[v.type]++; });

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle   = 'rgba(0,0,0,0.75)';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x - 10, y - 15, 125, 94, 5);
    } else {
      ctx.rect(x - 10, y - 15, 125, 94);
    }
    ctx.fill();

    ctx.font      = 'bold 11px "Inter", sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('VÄSTTRAFIK LIVE', x, y);
    y += lineH;

    ctx.font      = '10px "Inter", sans-serif';
    ctx.fillStyle = '#AAAAAA';
    ctx.fillText(`${vehicles.length} fordon`, x, y);
    y += lineH + 4;

    [{ type: 'TRAM', label: 'Spårvagn' }, { type: 'BUS', label: 'Buss' }].forEach(({ type, label }) => {
      const col   = CONFIG.colors[type];
      const count = counts[type];
      ctx.fillStyle   = col.fill;
      ctx.shadowColor = col.fill;
      ctx.shadowBlur  = 4;
      ctx.beginPath();
      ctx.arc(x + 5, y - 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle  = count > 0 ? '#FFFFFF' : '#666666';
      ctx.fillText(`${label} (${count})`, x + 15, y);
      y += lineH;
    });

    ctx.restore();
  }

  function drawFrame() {
    trafikCtx.clearRect(0, 0, trafikCanvas.width, trafikCanvas.height);
    vehicles.forEach(v => drawVehicle(trafikCtx, v));
    if (vehicles.length > 0) drawLegend(trafikCtx);
  }

  // ── Animation loop ────────────────────────────────────────────────────────
  function animate() {
    if (!isAnimating) return;

    // Fire-and-forget fetch when interval elapsed
    const now = Date.now();
    if (now - lastFetchTime >= CONFIG.fetchIntervalMs) {
      lastFetchTime = now;
      fetchAndUpdate();
    }

    interpolateVehicles();
    drawFrame();
    animFrame = requestAnimationFrame(animate);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function start() {
    if (isAnimating) return;

    // Mount canvas inside cesium-container on first start
    if (!trafikCanvas.parentElement) {
      const container = document.getElementById('cesium-container');
      if (container) {
        if (!container.style.position || container.style.position === 'static') {
          container.style.position = 'relative';
        }
        container.appendChild(trafikCanvas);
      }
    }

    isAnimating   = true;
    lastFetchTime = 0;   // force immediate fetch on first frame
    trafikCanvas.style.display = 'block';
    resizeCanvas();
    animate();
    console.log('✓ trafik_canvas: animation started');
  }

  function stop() {
    isAnimating = false;
    trafikCanvas.style.display = 'none';
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    trafikCtx.clearRect(0, 0, trafikCanvas.width, trafikCanvas.height);
    vehicles = [];
    console.log('trafik_canvas: animation stopped');
  }

  window.addEventListener('resize', () => { if (isAnimating) resizeCanvas(); });

  window.trafikCanvasAnimation = {
    start,
    stop,
    isActive:    () => isAnimating,
    getVehicles: () => vehicles,
  };

  console.log('trafik_canvas: module loaded');
})();
