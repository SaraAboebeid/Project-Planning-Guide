// country_profile.js — Sweden-first country insights, modular for more profiles
(function initCountryProfilePanel() {
  const panel = document.getElementById('country-profile');
  if (!panel) return;

  const tabsWrap = document.getElementById('country-tabs');
  const summaryEl = document.getElementById('country-summary');
  const kpisEl = document.getElementById('country-kpis');
  const barsEl = document.getElementById('country-energy-bars');
  if (!tabsWrap || !summaryEl || !kpisEl || !barsEl) return;

  const fallbackByCountry = {
    se: {
      country: 'se',
      name: 'Sweden',
      viewer: {
        summary: 'Current active country profile for Gothenburg digital twin baseline.',
        kpis: [
          { key: 'buildings', label: '3D Buildings', value: 92973, unit: 'count' },
          { key: 'epc_match', label: 'EPC Matched', value: 87712, unit: 'count' },
          { key: 'tabula_match', label: 'TABULA Matched', value: 18744, unit: 'count' },
          { key: 'boplats_listings', label: 'Boplats Listings', value: 379, unit: 'count' }
        ],
        energy_class_share: { A_B: 16, C_D: 43, E_G: 41 }
      }
    },
    gb: {
      country: 'gb',
      name: 'United Kingdom',
      viewer: { summary: 'Profile scaffold ready. Connect UK source metrics to activate KPIs.', kpis: [], energy_class_share: {} }
    },
    be: {
      country: 'be',
      name: 'Belgium',
      viewer: { summary: 'Profile scaffold ready. Connect Belgium source metrics to activate KPIs.', kpis: [], energy_class_share: {} }
    },
    ie: {
      country: 'ie',
      name: 'Ireland',
      viewer: { summary: 'Profile scaffold ready. Connect Ireland source metrics to activate KPIs.', kpis: [], energy_class_share: {} }
    }
  };

  function formatValue(value, unit) {
    if (typeof value !== 'number') return String(value ?? '-');
    if (unit === 'percent') return value.toFixed(0) + '%';
    return value.toLocaleString('en-US');
  }

  function setActiveCountryTab(countryCode) {
    tabsWrap.querySelectorAll('button[data-country]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.country === countryCode);
    });
  }

  function renderEnergyBars(share) {
    const rows = [
      { key: 'A_B', label: 'A-B', value: Number(share?.A_B || 0) },
      { key: 'C_D', label: 'C-D', value: Number(share?.C_D || 0) },
      { key: 'E_G', label: 'E-G', value: Number(share?.E_G || 0) }
    ];
    const nonZero = rows.some(r => r.value > 0);
    if (!nonZero) {
      barsEl.innerHTML = '<div style="font-size:10px;color:var(--muted)">Energy-class split will appear once country data is connected.</div>';
      return;
    }

    barsEl.innerHTML = rows.map(r => (
      '<div class="bar-row">' +
      '<span>' + r.label + '</span>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + Math.max(0, Math.min(100, r.value)) + '%"></div></div>' +
      '<span style="text-align:right">' + r.value + '%</span>' +
      '</div>'
    )).join('');
  }

  function renderCountryProfile(profile) {
    const viewerData = profile?.viewer || {};
    summaryEl.textContent = viewerData.summary || 'Country profile connected.';

    const kpis = Array.isArray(viewerData.kpis) ? viewerData.kpis : [];
    if (!kpis.length) {
      kpisEl.innerHTML = '<div style="grid-column:1 / -1;font-size:10px;color:var(--muted)">No KPI values yet for this country.</div>';
    } else {
      kpisEl.innerHTML = kpis.map(kpi => (
        '<div class="country-kpi">' +
        '<div class="k-label">' + (kpi.label || kpi.key || 'KPI') + '</div>' +
        '<div class="k-value">' + formatValue(kpi.value, kpi.unit) + '</div>' +
        '</div>'
      )).join('');
    }

    renderEnergyBars(viewerData.energy_class_share || {});
  }

  async function loadCountryProfile(countryCode) {
    setActiveCountryTab(countryCode);
    summaryEl.textContent = 'Loading profile…';
    kpisEl.innerHTML = '';
    barsEl.innerHTML = '';

    try {
      const res = await fetch('http://localhost:8000/api/country-profile?country=' + encodeURIComponent(countryCode), {
        cache: 'no-store'
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const profile = await res.json();
      renderCountryProfile(profile);
    } catch (_err) {
      renderCountryProfile(fallbackByCountry[countryCode] || fallbackByCountry.se);
    }
  }

  tabsWrap.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-country]');
    if (!btn) return;
    const code = (btn.dataset.country || 'se').toLowerCase();
    loadCountryProfile(code);
  });

  loadCountryProfile('se');
})();
