// ══════════════════════════════════════════════════════════════════
// FACADE INSPECTOR - WWR-STYLE PER-FACADE VISUAL CONDITION ASSESSMENT
// (AI vision simulation: cracks, mold, paint peel, water damage, ...)
// + Multi-building comparison & renovation priority ranking
// ══════════════════════════════════════════════════════════════════

(function () {
  const FQ_DIRS = ['N', 'E', 'S', 'W'];
  const FQ_HEAD = { N: 0, E: 90, S: 180, W: 270 };

  // Comparison cohort (buildings inspected so far this session)
  const fqCohort = [];

  // ── helpers ──────────────────────────────────────────────────────
  function fqCenter(b) {
    if (!b || !b.coordinates || !b.coordinates[0]) return null;
    const ring = b.coordinates[0];
    let lo = 0, la = 0;
    for (const [x, y] of ring) { lo += x; la += y; }
    return { lon: lo / ring.length, lat: la / ring.length };
  }
  function fqRadius(b) {
    const ring = b.coordinates[0];
    const c = fqCenter(b);
    let m = 0;
    for (const [x, y] of ring) {
      const d = Math.hypot(x - c.lon, y - c.lat);
      if (d > m) m = d;
    }
    return Math.max(15, m * 111320 * Math.cos(c.lat * Math.PI / 180));
  }
  function fqGroundAlt(b) {
    if (typeof getGroundAlt === 'function') {
      try { return getGroundAlt(b); } catch (_) {}
    }
    return b._terrainH || 0;
  }

  // ── AI vision simulation ────────────────────────────────────────
  // Maps building characteristics → likely visible facade defects.
  // (Stand-in for a real GPT-4 Vision / segmentation model call.)
  const ISSUE_LIB = {
    cracks_vertical:    'Vertical cracks',
    cracks_diagonal:    'Diagonal cracks (settlement)',
    mold:               'Mold / mildew patches',
    biological_growth:  'Algae / lichen growth',
    water_staining:     'Water staining / runoff',
    efflorescence:      'Efflorescence (salt bloom)',
    paint_peeling:      'Paint peeling / blistering',
    spalling:           'Spalling / concrete loss',
    joint_deterioration:'Joint / sealant decay',
    discoloration:      'UV discoloration / fading',
    rust_staining:      'Rust staining (rebar)'
  };

  function analyzeFacade(b, dir) {
    const year = b.year || 1980;
    const age  = 2026 - year;
    const use  = b.use_cat || b.use || 'unknown';
    const eclass = b.eclass || null;
    const height = b.height || 10;

    // Pseudo-random but deterministic per (building, dir)
    const seed = ((b.address || '') + dir + year).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const rand = (n) => ((seed * 9301 + n * 49297) % 233280) / 233280;

    const detected = [];
    let score = 92;

    // Age-driven defects
    if (age > 60) {
      detected.push('cracks_diagonal');
      if (rand(1) > 0.4) detected.push('spalling');
      score -= 28;
    } else if (age > 40) {
      if (rand(2) > 0.3) detected.push('cracks_vertical');
      if (rand(3) > 0.5) detected.push('joint_deterioration');
      score -= 18;
    } else if (age > 20) {
      if (rand(4) > 0.5) detected.push('paint_peeling');
      score -= 8;
    }

    // Direction-driven defects
    if (dir === 'N') {
      if (rand(5) > 0.3) detected.push('mold');
      if (rand(6) > 0.5) detected.push('biological_growth');
      score -= 10;
    } else if (dir === 'S') {
      if (age > 15 && rand(7) > 0.4) detected.push('discoloration');
      score += 4;
    } else if (dir === 'W') {
      if (rand(8) > 0.4) detected.push('water_staining');
      score -= 6;
    } else if (dir === 'E') {
      if (rand(9) > 0.7) detected.push('efflorescence');
      score -= 2;
    }

    // Use-driven defects
    if (use.includes('industri')) {
      if (rand(10) > 0.4) detected.push('rust_staining');
      score -= 14;
    } else if (use.includes('flerfamilj') && age > 30) {
      if (rand(11) > 0.5) detected.push('efflorescence');
      score -= 5;
    }

    // Energy-class proxy (poor envelope ⇒ moisture damage visible)
    if (eclass === 'G' || eclass === 'F') {
      if (!detected.includes('water_staining')) detected.push('water_staining');
      score -= 12;
    } else if (eclass === 'E' || eclass === 'D') {
      score -= 5;
    }

    // Height penalty
    if (height > 30) score -= 8;
    else if (height > 15) score -= 4;

    // Convert score into condition + colour
    score = Math.max(5, Math.min(100, Math.round(score)));
    const condition = score >= 80 ? 'Good'
                    : score >= 60 ? 'Fair'
                    : score >= 40 ? 'Poor' : 'Critical';
    const color = score >= 75 ? '#16a34a'
                : score >= 55 ? '#f59e0b'
                : score >= 35 ? '#ea580c' : '#dc2626';
    const priority = score < 40 ? 'High'
                   : score < 60 ? 'Medium'
                   : score < 80 ? 'Low' : 'None';

    // Map detected codes → labels (top 3, deduped)
    const issues = detected
      .filter((v, i, a) => a.indexOf(v) === i)
      .map(k => ISSUE_LIB[k] || k)
      .slice(0, 3);

    return { dir, score, condition, color, priority, issues };
  }

  // ── camera fly to a single facade ───────────────────────────────
  async function flyToFacade(b, dir) {
    const c = fqCenter(b);
    if (!c) throw new Error('Building has no coordinates');
    const r = fqRadius(b);
    const bldH = Math.max(5, b.height || 10);
    const ground = fqGroundAlt(b);
    const dist = Math.max(bldH * 1.2, r * 1.6);
    const h = FQ_HEAD[dir] * Math.PI / 180;
    const dLon = Math.sin(h) * dist / (111320 * Math.cos(c.lat * Math.PI / 180));
    const dLat = Math.cos(h) * dist / 111320;
    await viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(c.lon + dLon, c.lat + dLat, ground + bldH * 0.55),
      orientation: {
        heading: Cesium.Math.toRadians((FQ_HEAD[dir] + 180) % 360),
        pitch:   Cesium.Math.toRadians(-6),
        roll:    0
      },
      duration: 1.0
    });
    await new Promise(res => setTimeout(res, 350));
  }

  function captureToCanvas(targetId) {
    const c = document.getElementById(targetId);
    if (!c || !viewer || !viewer.canvas) return;
    const ctx = c.getContext('2d');
    ctx.drawImage(viewer.canvas, 0, 0, c.width, c.height);
  }

  // ── render results into the panel ───────────────────────────────
  function renderResults(building, results) {
    const rows = document.getElementById('quality-facades-rows');
    if (!rows) return;
    rows.innerHTML = '';

    const avg = Math.round(results.reduce((a, r) => a + r.score, 0) / results.length);
    const worst = results.slice().sort((a, b) => a.score - b.score)[0];

    // Summary header
    const summary = document.createElement('div');
    summary.style.cssText = 'display:flex;gap:10px;align-items:center;padding:8px;margin-bottom:8px;background:rgba(114,28,184,0.08);border:1px solid rgba(114,28,184,0.25);border-radius:6px';
    summary.innerHTML =
      '<div style="flex:1">' +
        '<div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">AI Visual Score</div>' +
        '<div style="font-size:18px;font-weight:700;color:#721CB8;line-height:1.1">' + avg + '<span style="font-size:11px;color:var(--muted)"> / 100</span></div>' +
      '</div>' +
      '<div style="flex:1">' +
        '<div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">Worst Facade</div>' +
        '<div style="font-size:13px;font-weight:700;color:' + worst.color + ';line-height:1.1">' + worst.dir + ' · ' + worst.condition + '</div>' +
      '</div>' +
      '<button id="quality-add-cohort" class="btn" style="font-size:10px;padding:4px 8px;background:rgba(114,28,184,0.12);border-color:rgba(114,28,184,0.4);color:#721CB8;font-weight:600">+ Add to compare</button>';
    rows.appendChild(summary);

    // Per-facade rows
    results.forEach(r => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px;padding:6px;background:rgba(114,28,184,0.04);border-radius:4px';
      row.innerHTML =
        '<div style="font-weight:700;font-size:11px;color:var(--muted);width:18px">' + r.dir + '</div>' +
        '<div style="flex:1;height:14px;background:rgba(0,0,0,0.12);border-radius:3px;overflow:hidden">' +
          '<div style="width:' + r.score + '%;height:100%;background:' + r.color + ';border-radius:3px;transition:width .3s"></div>' +
        '</div>' +
        '<div style="font-size:11px;font-weight:600;color:' + r.color + ';min-width:54px;text-align:right">' + r.condition + '</div>' +
        '<div style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;background:' + r.color + '22;color:' + r.color + ';min-width:46px;text-align:center">' + r.priority + '</div>';
      rows.appendChild(row);

      const det = document.createElement('div');
      if (r.issues.length) {
        det.style.cssText = 'font-size:9px;color:var(--muted);margin:0 0 6px 26px';
        det.textContent = '🔍 ' + r.issues.join(' · ');
      } else {
        det.style.cssText = 'font-size:9px;color:#16a34a;margin:0 0 6px 26px';
        det.textContent = '✓ No visible defects detected';
      }
      rows.appendChild(det);
    });

    // Wire "Add to compare"
    const addBtn = document.getElementById('quality-add-cohort');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const cen = fqCenter(building);
        const id = building.address || (cen.lat.toFixed(5) + ',' + cen.lon.toFixed(5));
        if (fqCohort.find(x => x.id === id)) {
          addBtn.textContent = '✓ Already added';
          addBtn.disabled = true;
          return;
        }
        fqCohort.push({
          id,
          label: building.address || 'Unknown',
          year: building.year,
          use: building.use_cat || building.use,
          eclass: building.eclass,
          avg,
          worst: worst.dir + ' (' + worst.condition + ')',
          worstScore: worst.score,
          results
        });
        addBtn.textContent = '✓ Added (' + fqCohort.length + ' in cohort)';
        addBtn.disabled = true;
        renderCohort();
      });
    }
  }

  // ── multi-building comparison ───────────────────────────────────
  function renderCohort() {
    const wrap = document.getElementById('quality-compare-results');
    if (!wrap) return;
    if (fqCohort.length === 0) {
      wrap.style.display = 'none';
      wrap.innerHTML = '';
      return;
    }
    // Rank by lowest avg score (most urgent first)
    const ranked = fqCohort.slice().sort((a, b) => a.avg - b.avg);

    wrap.style.display = 'block';
    let html =
      '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin:6px 0 4px">Renovation priority ranking · ' + ranked.length + ' buildings</div>' +
      '<div style="display:flex;flex-direction:column;gap:4px">';
    ranked.forEach((b, i) => {
      const c = b.avg >= 75 ? '#16a34a' : b.avg >= 55 ? '#f59e0b' : b.avg >= 35 ? '#ea580c' : '#dc2626';
      html +=
        '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(114,28,184,0.05);border-left:3px solid ' + c + ';border-radius:3px">' +
          '<div style="font-size:14px;font-weight:800;color:' + c + ';width:22px">#' + (i + 1) + '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:11px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + b.label + '</div>' +
            '<div style="font-size:9px;color:var(--muted)">' + (b.year || '?') + ' · ' + (b.use || '?') + ' · worst ' + b.worst + '</div>' +
          '</div>' +
          '<div style="font-size:14px;font-weight:700;color:' + c + '">' + b.avg + '</div>' +
        '</div>';
    });
    html += '</div>' +
      '<button id="quality-clear-cohort" class="btn" style="margin-top:8px;width:100%;font-size:10px;padding:4px;background:rgba(220,38,38,0.08);border-color:rgba(220,38,38,0.3);color:#dc2626">Clear comparison</button>';
    wrap.innerHTML = html;
    const clr = document.getElementById('quality-clear-cohort');
    if (clr) clr.addEventListener('click', () => { fqCohort.length = 0; renderCohort(); });
  }

  // ── main inspection workflow ────────────────────────────────────
  async function performInspection() {
    if (typeof selectedBuilding === 'undefined' || !selectedBuilding) {
      alert('Please click a building first to select it.');
      return;
    }
    const b = selectedBuilding;
    if (!b.coordinates || !b.coordinates[0]) {
      alert('Selected building has no geometry.');
      return;
    }

    const panel = document.getElementById('quality-panel');
    if (!panel) return;
    panel.style.display = 'block';

    // Header
    const nameEl = document.getElementById('quality-building-name');
    const infoEl = document.getElementById('quality-building-info');
    if (nameEl) nameEl.textContent = b.address || 'Unknown Address';
    if (infoEl) {
      infoEl.textContent = (b.year || '?') + ' · ' + (b.use_cat || b.use || '?') + ' · class ' + (b.eclass || '?');
    }

    // Reset canvases with placeholder
    for (const d of FQ_DIRS) {
      const c = document.getElementById('quality-canvas-' + d);
      if (c) {
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = '#a78bfa'; ctx.font = '11px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('Capturing…', c.width / 2, c.height / 2);
      }
    }
    const rows = document.getElementById('quality-facades-rows');
    if (rows) rows.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:8px">Flying camera & capturing facades…</div>';

    const results = [];
    try {
      for (const dir of FQ_DIRS) {
        await flyToFacade(b, dir);
        captureToCanvas('quality-canvas-' + dir);
        results.push(analyzeFacade(b, dir));
      }
    } catch (err) {
      console.error('[Facade Inspector] capture failed:', err);
      if (rows) rows.innerHTML = '<div style="color:#dc2626;padding:8px;font-size:11px">Capture error: ' + err.message + '</div>';
      return;
    }

    // Return to a tilted overview of the building
    const c = fqCenter(b);
    if (c) {
      try {
        await viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(c.lon, c.lat - 0.001, fqGroundAlt(b) + Math.max(80, (b.height || 10) * 4)),
          orientation: {
            heading: 0,
            pitch:   Cesium.Math.toRadians(-40),
            roll:    0
          },
          duration: 1.0
        });
      } catch (_) {}
    }

    renderResults(b, results);
    renderCohort();
  }

  // ── button enable / wiring ─────────────────────────────────────
  function setupAutoEnable() {
    const info = document.getElementById('info-panel');
    const btn  = document.getElementById('btn-facade-quality');
    if (!btn) return;
    const sync = () => {
      const has = (typeof selectedBuilding !== 'undefined') && !!selectedBuilding;
      btn.disabled = !has;
      btn.style.opacity = has ? '1' : '0.38';
      btn.style.cursor  = has ? 'pointer' : 'not-allowed';
    };
    sync();
    if (info) {
      new MutationObserver(sync).observe(info, { attributes: true, attributeFilter: ['style'] });
    }
    setInterval(sync, 800);
  }

  function init() {
    setupAutoEnable();

    const btn = document.getElementById('btn-facade-quality');
    if (btn) btn.addEventListener('click', performInspection);

    const close = document.getElementById('quality-close');
    if (close) close.addEventListener('click', () => {
      const p = document.getElementById('quality-panel');
      if (p) p.style.display = 'none';
    });

    const cmp = document.getElementById('btn-compare-buildings');
    if (cmp) cmp.addEventListener('click', () => {
      if (fqCohort.length < 2) {
        alert('Inspect at least 2 buildings and click "+ Add to compare" on each.\nThe ranking will appear here automatically.');
      }
      renderCohort();
    });

    console.log('[Facade Inspector] Ready — AI vision sim + multi-building ranking');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.FacadeInspector = {
    inspect: performInspection,
    analyze: analyzeFacade,
    cohort:  fqCohort
  };
})();
