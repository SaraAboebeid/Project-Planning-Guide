// country_profile.js — country insights panel.
//
// The active country's KPIs are derived from what is actually loaded (window.DATA)
// plus that country's national statistics file, so the panel always agrees with
// the buildings on screen. Other countries fall back to a scaffold until their
// data is wired up. A backend /api/country-profile response, when available,
// overrides the derived values.
(function initCountryProfilePanel() {
  const panel = document.getElementById('country-profile');
  if (!panel) return;

  const summaryEl = document.getElementById('country-summary');
  const kpisEl = document.getElementById('country-kpis');
  const barsEl = document.getElementById('country-energy-bars');
  if (!summaryEl || !kpisEl || !barsEl) return;

  // Country/city switching lives in the top-right navigation, so this panel is
  // purely a readout for whichever country the viewer is currently showing.
  const ACTIVE = (window.VIEWER_COUNTRY || 'se').toLowerCase();

  // ── Derive the active country's profile from the loaded buildings ─────────
  function shareFromData(data) {
    const counts = { A_B: 0, C_D: 0, E_G: 0 };
    let total = 0;
    for (const b of data) {
      if (!b.eclass) continue;
      total++;
      if (b.eclass === 'A' || b.eclass === 'B') counts.A_B++;
      else if (b.eclass === 'C' || b.eclass === 'D') counts.C_D++;
      else counts.E_G++;
    }
    if (!total) return {};
    return {
      A_B: Math.round((counts.A_B / total) * 100),
      C_D: Math.round((counts.C_D / total) * 100),
      E_G: Math.round((counts.E_G / total) * 100),
    };
  }

  async function deriveActiveProfile() {
    const data = window.DATA || [];
    const city = window.VIEWER_CITY || {};
    const kpis = [
      { label: '3D Buildings', value: data.length, unit: 'count' },
      { label: 'EPC Matched', value: data.filter(b => b.has_epc).length, unit: 'count' },
    ];

    let summary;

    if (ACTIVE === 'gb') {
      const estimated = data.filter(b => b.epc_source && b.epc_source.startsWith('ehs_prior')).length;
      kpis.push({ label: 'EHS Estimated', value: estimated, unit: 'count' });

      // National context from the English Housing Survey 2024-25.
      try {
        const res = await fetch('uk/ehs_2024_25.json', { cache: 'no-store' });
        if (res.ok) {
          const ehs = await res.json();
          const sap = (ehs.kpis || []).find(k => k.label === 'Mean SAP rating');
          const atC = (ehs.kpis || []).find(k => k.label && k.label.startsWith('Dwellings at EPC band C'));
          if (sap) kpis.push({ label: 'Mean SAP (England)', value: sap.value, unit: 'raw' });
          if (atC) kpis.push({ label: 'England at band C+', value: atC.value, unit: 'percent' });
        }
      } catch (_err) {
        /* national context is optional; the viewer KPIs stand on their own */
      }

      summary =
        `${city.name || 'UK'} — ${city.district || ''}. Bands from the Energy Performance of ` +
        'Buildings Register where a certificate matches, otherwise estimated from English ' +
        'Housing Survey 2024-25 distributions.';
    } else {
      kpis.push({ label: 'TABULA Matched', value: data.filter(b => b.tabula_period).length, unit: 'count' });
      summary = 'Current active country profile for Gothenburg digital twin baseline.';
    }

    return { viewer: { summary, kpis, energy_class_share: shareFromData(data) } };
  }

  function formatValue(value, unit) {
    if (typeof value !== 'number') return String(value ?? '-');
    if (unit === 'percent') return value.toFixed(0) + '%';
    if (unit === 'raw') return String(value);
    return value.toLocaleString('en-US');
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
    summaryEl.textContent = 'Loading profile...';
    kpisEl.innerHTML = '';
    barsEl.innerHTML = '';

    // The backend may serve a richer profile; if it is not running, derive the
    // active country's figures locally rather than showing another country's.
    try {
      const res = await fetch('/api/country-profile?country=' + encodeURIComponent(countryCode), {
        cache: 'no-store'
      });
      if (res.ok) {
        renderCountryProfile(await res.json());
        return;
      }
    } catch (_err) {
      /* backend offline - fall through to locally derived figures */
    }

    renderCountryProfile(await deriveActiveProfile());
  }

  // Always the country this viewer is actually showing.
  loadCountryProfile(ACTIVE);
})();
