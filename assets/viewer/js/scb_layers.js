// ─────────────────────────────────────────────────────────────────────────────
// scb_layers.js  —  Statistics Sweden (SCB) WFS overlay layers
//
// Data: CC0 1.0 Universal · https://geodata.scb.se
// 11 layer groups · 47 year variants · all fetched on-demand from SCB WFS
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  const WFS_BASE =
    'https://geodata.scb.se/geoserver/stat/wfs'
    + '?service=WFS&version=1.1.0&request=GetFeature'
    + '&outputFormat=application%2Fjson&maxFeatures=10000'
    + '&srsName=EPSG%3A4326';  // force WGS84 — Cesium can't parse SWEREF99 (EPSG:3006)

  const GBG_BBOX = '11.85,57.60,12.10,57.80,EPSG:4326';

  // ── Colour helpers ───────────────────────────────────────────────────────────
  function col(r, g, b, a) { return new Cesium.Color(r/255, g/255, b/255, (a||255)/255); }

  // Population heatmap — 7 colour stops (0 people → transparent)
  const HEAT = [
    col(  0,   0,   0,   0),   // 0 (transparent — no cell drawn)
    col( 69, 140, 199,  65),   // 1–49
    col(120, 198, 130,  80),   // 50–149
    col(250, 224, 110,  95),   // 150–299
    col(245, 155,  80, 110),   // 300–599
    col(222,  95,  60, 125),   // 600–999
    col(170,  45,  45, 145),   // 1000+
  ];
  function heatColor(bef) {
    if (!bef || bef <=    0) return HEAT[0];
    if (bef   <    50)       return HEAT[1];
    if (bef   <   150)       return HEAT[2];
    if (bef   <   300)       return HEAT[3];
    if (bef   <   600)       return HEAT[4];
    if (bef   <  1000)       return HEAT[5];
    return HEAT[6];
  }

  // ── Layer group definitions ───────────────────────────────────────────────────
  const GROUPS = [
    {
      id:    'befolkning',
      label: 'Population Grid',
      icon:  '👥',
      pill:  '1 km',
      desc:  '1×1 km grid cells showing population totals broken down by sex and five-year age bands. Covers all of Sweden.',
      source:'SCB – Statistics Sweden · CC0 1.0',
      years: ['2025','2024','2023','2022','2021','2020','2019','2018','2017','2016','2015'],
      tn:    y => `stat:befolkning_1km_${y}`,
      style: 'heatmap',
      tip(p) {
        const c    = n => (n || 0);
        const a0   = c(p.ald0_4)+c(p.ald5_9)+c(p.ald10_14);
        const a65  = [65,70,75,80,85,90,95].reduce((s,a)=>s+c(p['ald'+a+'_'+(a+4)]),0)+c(p.ald100w);
        const a15  = c(p.beftotalt) - a0 - a65;
        return `<b>Population grid (${p.referenstid||''})</b><br>`
          + `Total: <b>${c(p.beftotalt).toLocaleString()}</b>`
          + `&nbsp;&nbsp;👨 ${c(p.man).toLocaleString()} 👩 ${c(p.kvinna).toLocaleString()}<br>`
          + `Age 0–14: ${a0} &nbsp; 15–64: ${a15} &nbsp; 65+: ${a65}`;
      },
    },
    {
      id:     'deso',
      label:  'DeSO Zones',
      icon:   '🗺',
      pill:   'Statistical',
      desc:   'Demographic Statistical Areas — Sweden\'s primary unit for socioeconomic statistics. ~5,900 zones nationwide, defined 2018.',
      source: 'SCB – Statistics Sweden · CC0 1.0',
      years:  ['2025','2018'],
      tn:     y => `stat:DeSO_${y}`,
      style:  'zone',
      fill:   col(100,149,237, 45),
      stroke: col(100,149,237,230),
      sw: 1.5,
      tip(p) {
        return `<b>DeSO Zone</b><br>`
          + `Code: <b>${p.desokod||''}</b><br>`
          + `RegSO: ${p.regsokod||''}<br>`
          + `Municipality: ${p.kommunkod||''}`;
      },
    },
    {
      id:     'regso',
      label:  'RegSO Zones',
      icon:   '📐',
      pill:   'Statistical',
      desc:   'Regional Statistical Areas — larger than DeSO, composed of aggregated DeSO zones. Used for regional comparisons.',
      source: 'SCB – Statistics Sweden · CC0 1.0',
      years:  ['2025','2020'],
      tn:     y => `stat:RegSO_${y}`,
      style:  'zone',
      fill:   col(167,139,250, 45),
      stroke: col(167,139,250,230),
      sw: 2,
      tip(p) {
        return `<b>RegSO Zone</b><br>Code: <b>${p.regsokod||p.objectid||''}</b>`;
      },
    },
    {
      id:     'tatorter',
      label:  'Urban Areas',
      icon:   '🏙',
      pill:   'Tätorter',
      desc:   'Delimited urban built-up areas (≥200 inhabitants, ≤200 m between buildings). Historical series from 1980.',
      source: 'SCB – Statistics Sweden · CC0 1.0',
      years:  ['2023','2020','2018','2015','2010','2005','2000','1995','1990','1980'],
      tn:     y => `stat:Tatorter_${y}`,
      style:  'zone',
      fill:   col(  0,188,212, 45),
      stroke: col(  0,188,212,210),
      sw: 1.5,
      tip(p) {
        return `<b>${p.tatort||'Urban area'}</b><br>`
          + `Population: <b>${p.bef!=null?Number(p.bef).toLocaleString():'-'}</b><br>`
          + `Area: ${p.area_ha!=null?Number(p.area_ha).toFixed(0)+' ha':'-'}<br>`
          + `Year: ${p.ar||''}`;
      },
    },
    {
      id:     'smaorter',
      label:  'Small Settlements',
      icon:   '🏘',
      pill:   'Småorter',
      desc:   'Smaller built-up areas (50–199 inhabitants) not meeting the tätort threshold. Historical series from 1990.',
      source: 'SCB – Statistics Sweden · CC0 1.0',
      years:  ['2023','2020','2015','2010','2005','2000','1995','1990'],
      tn:     y => `stat:Smaorter_${y}`,
      style:  'zone',
      fill:   col(  0,150,136, 45),
      stroke: col(  0,150,136,210),
      sw: 1.5,
      tip(p) {
        return `<b>${p.tatort||p.smaort||'Small settlement'}</b><br>`
          + `Year: ${p.ar||p.referenstid||''}`;
      },
    },
    {
      id:     'gronomraden',
      label:  'Green Areas',
      icon:   '🌳',
      pill:   'Grönområden',
      desc:   'Urban parks, forests, and recreation areas within tätort boundaries. Mapped in collaboration with municipalities.',
      source: 'SCB – Statistics Sweden · CC0 1.0',
      years:  ['2020','2015','2010'],
      tn:     y => `stat:Gronomraden_${y}_tatort`,
      style:  'zone',
      fill:   col( 56,142, 60, 65),
      stroke: col( 56,142, 60,220),
      sw: 1,
      tip(p) {
        return `<b>Green area</b><br>`
          + `Size: <b>${p.areakvm!=null?(p.areakvm/10000).toFixed(2)+' ha':'-'}</b>`;
      },
    },
    {
      id:     'arbetsplats',
      label:  'Workplace Zones',
      icon:   '💼',
      pill:   'Arbetsplats',
      desc:   'Statistical zones delineated around concentrations of workplaces. Used for commuting analysis and labour market statistics.',
      source: 'SCB – Statistics Sweden · CC0 1.0',
      years:  ['2010','2005','2000'],
      tn:     y => `stat:Arbetsplatsomraden_${y}`,
      style:  'zone',
      fill:   col(255,152,  0, 50),
      stroke: col(255,152,  0,210),
      sw: 1.5,
      tip(p) { return `<b>Workplace zone</b><br>ID: ${p.objectid||''}`; },
    },
    {
      id:     'verksamhet',
      label:  'Business Zones',
      icon:   '🏭',
      pill:   'Verksamhet',
      desc:   'Areas dominated by industrial or commercial activity (verksamhetsområden). Useful for land-use and mobility analysis.',
      source: 'SCB – Statistics Sweden · CC0 1.0',
      years:  ['2020','2015'],
      tn:     y => `stat:Verksamhetsomraden_${y}`,
      style:  'zone',
      fill:   col(255, 87, 34, 50),
      stroke: col(255, 87, 34,210),
      sw: 1.5,
      tip(p) { return `<b>Business zone</b><br>ID: ${p.objectid||''}`; },
    },
    {
      id:     'handel',
      label:  'Retail Zones',
      icon:   '🛍',
      pill:   'Handel',
      desc:   'Concentrated retail areas (handelsområden), including shopping centres and retail parks. Useful for accessibility studies.',
      source: 'SCB – Statistics Sweden · CC0 1.0',
      years:  ['2020','2015'],
      tn:     y => `stat:Handelsomraden_${y}`,
      style:  'zone',
      fill:   col(233, 30, 99, 50),
      stroke: col(233, 30, 99,210),
      sw: 1.5,
      tip(p) { return `<b>Retail zone</b><br>ID: ${p.objectid||''}`; },
    },
    {
      id:     'fritidshus',
      label:  'Holiday Cottages',
      icon:   '🏡',
      pill:   'Fritidshus',
      desc:   'Concentrations of seasonal and holiday dwellings (fritidshusområden). Historical series from 2000.',
      source: 'SCB – Statistics Sweden · CC0 1.0',
      years:  ['2020','2015','2010','2005','2000'],
      tn:     y => `stat:Fritidshusomraden_${y}`,
      style:  'zone',
      fill:   col(251,192, 45, 50),
      stroke: col(200,140,  0,210),
      sw: 1.5,
      tip(p) { return `<b>Holiday cottage area</b><br>ID: ${p.objectid||''}`; },
    },
    {
      id:     'rutnat',
      label:  'Statistical Grid (1km)',
      icon:   '⊞',
      pill:   '1 km',
      desc:   'The SWEREF99TM 1×1 km national reference grid — the spatial framework used for all SCB grid statistics.',
      source: 'SCB – Statistics Sweden · CC0 1.0',
      years:  [''],                          // single layer, no year suffix
      tn:     () => 'stat:Rutnat_1x1km_sweref99tm',
      style:  'grid',
      fill:   col(  0,  0,  0,  0),
      stroke: col(180,180,180, 80),
      sw: 0.5,
      tip(p) { return `<b>Grid cell</b><br>ID: ${p.rutid_scb||''}`; },
    },
  ];

  // ── Runtime state ────────────────────────────────────────────────────────────
  const _state  = {};   // id → { active:bool, year:string }
  const _cache  = {};   // typeName → GeoJsonDataSource (or null while loading)
  const _byId   = {};   // id → group definition
  const _entMap = new WeakMap();  // entity → groupId (for hover)

  GROUPS.forEach(g => {
    _state[g.id] = { active: false, year: g.years[0] };
    _byId[g.id]  = g;
  });

  // ── WFS URL ──────────────────────────────────────────────────────────────────
  function wfsUrl(typeName) {
    return `${WFS_BASE}&typeName=${encodeURIComponent(typeName)}&bbox=${GBG_BBOX}`;
  }

  // ── Extract raw properties from a Cesium entity's PropertyBag ────────────────
  function getProps(entity) {
    const out = {};
    if (!entity.properties) return out;
    const now = Cesium.JulianDate.now();
    (entity.properties.propertyNames || []).forEach(k => {
      try { out[k] = entity.properties[k].getValue(now); } catch (_) {}
    });
    return out;
  }

  // ── Apply visual style to every entity in a loaded datasource ────────────────
  function applyStyle(ds, g) {
    for (const e of ds.entities.values) {
      _entMap.set(e, g.id);

      if (g.style === 'heatmap') {
        if (!e.polygon) continue;
        const bef = (() => {
          try { return e.properties.beftotalt.getValue(); } catch(_) { return 0; }
        })();
        e.polygon.material           = heatColor(bef);
        e.polygon.outline            = false;
        e.polygon.heightReference    = Cesium.HeightReference.CLAMP_TO_GROUND;
        e.polygon.classificationType = Cesium.ClassificationType.BOTH;  // drapes on photorealistic 3D tiles

      } else {
        if (e.polygon) {
          e.polygon.material           = g.fill;
          e.polygon.outline            = true;
          e.polygon.outlineColor       = g.stroke;
          e.polygon.heightReference    = Cesium.HeightReference.CLAMP_TO_GROUND;
          e.polygon.classificationType = Cesium.ClassificationType.BOTH;  // drapes on photorealistic 3D tiles
        }
        if (e.polyline) {
          e.polyline.material = new Cesium.ColorMaterialProperty(g.stroke);
          e.polyline.width    = g.sw || 1;
          e.polyline.clampToGround = true;
        }
      }
    }
  }

  // ── Load and cache a WFS layer ────────────────────────────────────────────────
  async function loadLayer(typeName, g) {
    if (_cache[typeName]) {
      if (!viewer.dataSources.contains(_cache[typeName]))
        await viewer.dataSources.add(_cache[typeName]);
      return;
    }
    _cache[typeName] = null;   // loading sentinel
    setStatus(g.id, '⏳ Loading…');

    let ds;
    try {
      ds = await Cesium.GeoJsonDataSource.load(wfsUrl(typeName), {
        fill:        Cesium.Color.TRANSPARENT,
        stroke:      Cesium.Color.TRANSPARENT,
        strokeWidth: 0,
      });
    } catch (err) {
      console.error('[SCB] Failed to load', typeName, err);
      delete _cache[typeName];
      setStatus(g.id, '⚠ Load failed');
      return;
    }

    ds.name = 'scb::' + typeName;
    applyStyle(ds, g);
    _cache[typeName] = ds;
    await viewer.dataSources.add(ds);
    setStatus(g.id, '');
  }

  // ── Hide a layer (keep in cache for re-use) ───────────────────────────────────
  function hideLayer(typeName) {
    const ds = _cache[typeName];
    if (ds && viewer.dataSources.contains(ds))
      viewer.dataSources.remove(ds, false);   // false = keep in memory
  }

  // ── Toggle a group on / off ───────────────────────────────────────────────────
  async function scbToggle(id) {
    const s = _state[id];
    const g = _byId[id];
    s.active = !s.active;
    // Flag for ui.js: suppress the per-building hover card while any SCB layer is on.
    window._scbActive = Object.values(_state).some((x) => x.active);

    document.getElementById('scb-btn-'+id).classList.toggle('active', s.active);
    const sub = document.getElementById('scb-sub-'+id);
    if (sub) sub.style.display = s.active ? 'flex' : 'none';

    if (s.active) {
      // Translucent grids can't classify onto the Photorealistic 3D mesh (they go
      // black), so drop to a flat basemap first; then frame the city top-down.
      if (window.ensureFlatBasemap) window.ensureFlatBasemap();
      if (window.viewTopDown) window.viewTopDown();
      await loadLayer(g.tn(s.year), g);
    } else hideLayer(g.tn(s.year));
  }

  // ── Switch to a different year ────────────────────────────────────────────────
  async function scbSetYear(id, year) {
    const s = _state[id];
    const g = _byId[id];
    const oldTn = g.tn(s.year);
    s.year = year;
    if (s.active) {
      hideLayer(oldTn);
      await loadLayer(g.tn(year), g);
    }
  }

  // ── Status text helper ────────────────────────────────────────────────────────
  function setStatus(id, msg) {
    const el = document.getElementById('scb-status-'+id);
    if (el) el.textContent = msg;
  }

  // ── Build the panel UI dynamically ───────────────────────────────────────────
  function buildPanel() {
    const container = document.getElementById('scb-layers-container');
    if (!container) return;
    container.innerHTML = '';

    for (const g of GROUPS) {
      const wrap = document.createElement('div');
      wrap.className = 'scb-row';

      // ── Toggle button ──────────────────────────────────────────────────────
      const row = document.createElement('div');
      row.className = 'overlay-row';

      const btn = document.createElement('button');
      btn.className = 'overlay-btn';
      btn.id        = 'scb-btn-' + g.id;
      btn.innerHTML =
        `<span class="overlay-check"></span>`
        + `<span class="base-name">${g.label}</span>`
        + `<span class="layer-pill">${g.pill}</span>`;
      btn.addEventListener('click', () => scbToggle(g.id));
      row.appendChild(btn);

      const infoBtn = document.createElement('button');
      infoBtn.className = 'info-btn';
      infoBtn.dataset.title  = g.label;
      infoBtn.dataset.desc   = g.desc   || '';
      infoBtn.dataset.source = g.source || '';
      row.appendChild(infoBtn);

      wrap.appendChild(row);

      // ── Sub-row: year selector + status ───────────────────────────────────
      const sub = document.createElement('div');
      sub.id        = 'scb-sub-' + g.id;
      sub.className = 'scb-sub';
      sub.style.display = 'none';

      // Only show year dropdown when there are multiple year options
      if (g.years.length > 1) {
        const sel = document.createElement('select');
        sel.className = 'scb-year-sel';
        g.years.forEach(y => {
          const o = document.createElement('option');
          o.value = y; o.textContent = y || '—';
          sel.appendChild(o);
        });
        sel.value = g.years[0];
        sel.addEventListener('change', e => scbSetYear(g.id, e.target.value));
        sub.appendChild(sel);
      }

      const status = document.createElement('span');
      status.id        = 'scb-status-' + g.id;
      status.className = 'scb-status';
      sub.appendChild(status);

      wrap.appendChild(sub);
      container.appendChild(wrap);
    }
  }

  // ── Hover hook: called by ui.js when no building is under the cursor ──────────
  // Only fires when at least one SCB layer is active.
  window.scbOnHover = function (movement) {
    if (!Object.values(_state).some(s => s.active)) return;
    const hoverCard = document.getElementById('hover-card');
    const picked    = viewer.scene.pick(movement.endPosition);
    if (!picked || !picked.id) return;
    const groupId = _entMap.get(picked.id);
    if (!groupId) return;

    const g     = _byId[groupId];
    const props = getProps(picked.id);
    const x = movement.endPosition.x, y = movement.endPosition.y;
    hoverCard.innerHTML     = g.tip(props);
    hoverCard.style.left    = Math.min(x+18, window.innerWidth-300)  + 'px';
    hoverCard.style.top     = Math.min(y-10,  window.innerHeight-200) + 'px';
    hoverCard.style.display = 'block';
  };

  buildPanel();
})();
