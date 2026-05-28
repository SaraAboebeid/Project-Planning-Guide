/**
 * Generates a self-contained HTML project report from the wizard state.
 * Open the result in a new tab — user can print to PDF or save as HTML.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface ReportTimeline {
  phase: string;
  start: string;
  end: string;
  hrs: number;
  weeks: number;
}

export interface ReportPackage {
  name: string;
  color: string;
  costSEK: number;
  carbonKg: number;
  carbonEstimated: boolean;
  selections: Record<string, { wikellsCode: string; areaM2: number }>;
}

export interface ReportComputedValues {
  totalHours: number;
  userWeeks: number;
  currency: string;
  baseLaborCost: number;
  lkpCost: number;
  overheadCost: number;
  serviceCost: number;
  capex: { construction: number; design: number; permits: number; equipment: number };
  contingencyPct: number;
  capexBase: number;
  capexTotal: number;
  opex: { energy: number; maintenance: number; staffing: number; other: number };
  timelineRows: ReportTimeline[];
  delivSections: [string, [string, string][]][];
  packageTotals: ReportPackage[];
  selectedPackageId: string | null;
}

export interface ReportProject {
  projectName: string;
  projectType: string | null;
  buildingDevelopmentType: string | null;
  country: string | null;
  scale: string | null;
  systemsInScope: string[];
  selectedKpis: string[];
  explorationApproaches: string[];
  buildingUses: string[];
  renovationEnvelopeComponents: string[];
  address: string;
  locationLabel: string;
  lat: number | null;
  lon: number | null;
  radiusM: number;
  lookedUpBuilding: {
    address: string | null;
    year: number | null;
    height: number | null;
    floors: number | null;
    footprint_m2: number | null;
    area_atemp: number | null;
    use_cat: string | null;
    energy: number | null;
    eclass: string | null;
    tabula_period: string | null;
    tabula_u_wall: number | null;
    tabula_u_win: number | null;
    has_epc: boolean;
    dist_m: number;
  } | null;
  bboxStats: {
    count: number;
    with_height: number;
    with_year: number;
    with_energy: number;
    with_epc: number;
    avg_height: number | null;
    avg_year: number | null;
    avg_energy: number | null;
    avg_footprint: number | null;
    common_use: string | null;
  } | null;
  dataInputs: Record<string, { available: boolean; proxy: string | null; confidence: number }>;
  savedWWR: { average_wwr: number; source: string; saved_at: string } | null;
  bboxRows: {
    address: string;
    building_use: string | null;
    year_built: number | null;
    height_m: number | null;
    floors: number | null;
    footprint_m2: number | null;
    energy_kwh_m2: number | null;
    epc_class: string | null;
    has_epc: boolean | null;
    tabula_period: string | null;
    u_wall: number | null;
    u_roof: number | null;
    u_window: number | null;
  }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtNum = (n: number) => n.toLocaleString("en-SE");
const pct = (n: number, total: number) => total > 0 ? Math.round((n / total) * 100) : 0;

function badge(text: string, bg = "#721CB8", fg = "#fff") {
  return `<span style="display:inline-block;background:${bg};color:${fg};border-radius:6px;padding:1px 8px;font-size:11px;font-weight:600;margin:1px;">${esc(text)}</span>`;
}

function esc(s: unknown): string {
  if (s == null) return "—";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function section(title: string, content: string, accentColor = "#721CB8") {
  return `
  <div class="section">
    <div class="section-header" style="border-left-color:${accentColor}">
      <h2 style="color:${accentColor}">${esc(title)}</h2>
    </div>
    <div class="section-body">${content}</div>
  </div>`;
}

function kv(label: string, value: unknown, unit = "") {
  const v = value == null || value === "" ? "—" : String(value);
  return `<tr><td class="kv-label">${esc(label)}</td><td class="kv-value">${esc(v)}${unit ? `<span class="unit"> ${unit}</span>` : ""}</td></tr>`;
}

function confidenceBadge(conf: number) {
  const pctVal = Math.round(conf * 100);
  const color = pctVal >= 70 ? "#509724" : pctVal >= 40 ? "#d97706" : "#dc2626";
  return `<span style="color:${color};font-weight:600;">${pctVal}%</span>`;
}

function coveragePill(available: boolean) {
  return available
    ? `<span style="color:#509724;font-weight:600;">✔ Available</span>`
    : `<span style="color:#dc2626;font-weight:600;">✘ Missing / Proxy</span>`;
}

function useLabel(raw: string | null) {
  if (!raw) return "—";
  const map: Record<string, string> = {
    bostad_enfamilj: "Single-family residential",
    bostad_flerfamilj: "Multi-family residential",
    handel: "Retail",
    kontor: "Office",
    industri: "Industrial",
    komplement: "Ancillary / Garage",
    ovrigt: "Other",
  };
  return map[raw] ?? raw;
}

// ── Main generator ─────────────────────────────────────────────────────────

export function generateReport(project: ReportProject, computed: ReportComputedValues): string {
  const now = new Date().toLocaleDateString("en-SE", { year: "numeric", month: "long", day: "numeric" });
  const projectName = project.projectName || "Untitled Project";

  /* ── 1. Project Definition ── */
  const defContent = `
    <table class="kv-table">
      ${kv("Project Name", projectName)}
      ${kv("Project Type", project.projectType)}
      ${kv("Building Development Type", project.buildingDevelopmentType)}
      ${kv("Country", project.country)}
      ${kv("Scale", project.scale)}
    </table>
    ${project.systemsInScope.length ? `<p class="sub-label">Systems in Scope</p><div class="tag-row">${project.systemsInScope.map(s => badge(s, "#721CB8")).join("")}</div>` : ""}
    ${project.selectedKpis.length ? `<p class="sub-label">Key Performance Indicators</p><div class="tag-row">${project.selectedKpis.map(k => badge(k, "#995BD5")).join("")}</div>` : ""}
    ${project.explorationApproaches.length ? `<p class="sub-label">Exploration Approaches</p><div class="tag-row">${project.explorationApproaches.map(a => badge(a, "#3a6e1a", "#fff")).join("")}</div>` : ""}
    ${project.renovationEnvelopeComponents.length ? `<p class="sub-label">Envelope Components</p><div class="tag-row">${project.renovationEnvelopeComponents.map(c => badge(c, "#96D74C", "#2d5f0e")).join("")}</div>` : ""}
    ${project.buildingUses.length ? `<p class="sub-label">Building Uses</p><div class="tag-row">${project.buildingUses.map(u => badge(u, "#e0d7f7", "#4a1d96")).join("")}</div>` : ""}
  `;

  /* ── 2. Location & Building Data ── */
  const loc = project.lookedUpBuilding;
  const bbox = project.bboxStats;
  let locContent = `
    <table class="kv-table">
      ${kv("Address / Label", project.locationLabel || project.address)}
      ${kv("Latitude", project.lat)}
      ${kv("Longitude", project.lon)}
      ${project.radiusM ? kv("Radius", project.radiusM, "m") : ""}
    </table>`;

  if (loc) {
    locContent += `
    <p class="sub-label">Looked-up Building</p>
    <table class="kv-table">
      ${kv("Address", loc.address)}
      ${kv("Building Use", useLabel(loc.use_cat))}
      ${kv("Year Built", loc.year)}
      ${kv("Height", loc.height, "m")}
      ${kv("Floors", loc.floors)}
      ${kv("Footprint Area", loc.footprint_m2, "m²")}
      ${kv("Conditioned Area (Atemp)", loc.area_atemp, "m²")}
      ${kv("EPC Class", loc.eclass)}
      ${kv("Energy Use", loc.energy, "kWh/m²/yr")}
      ${kv("EPC Available", loc.has_epc ? "Yes" : "No")}
      ${kv("TABULA Period", loc.tabula_period)}
      ${kv("U-value Wall", loc.tabula_u_wall != null ? loc.tabula_u_wall.toFixed(3) : null, "W/m²K")}
      ${kv("U-value Window", loc.tabula_u_win != null ? loc.tabula_u_win.toFixed(3) : null, "W/m²K")}
      ${kv("Distance from Search Point", loc.dist_m != null ? Math.round(loc.dist_m) : null, "m")}
    </table>`;
  }

  if (bbox) {
    locContent += `
    <p class="sub-label">Bounding Box — Building Stock</p>
    <table class="kv-table">
      ${kv("Total Buildings", bbox.count)}
      ${kv("With Height Data", `${bbox.with_height} (${pct(bbox.with_height, bbox.count)}%)`)}
      ${kv("With Year Data", `${bbox.with_year} (${pct(bbox.with_year, bbox.count)}%)`)}
      ${kv("With Energy Data", `${bbox.with_energy} (${pct(bbox.with_energy, bbox.count)}%)`)}
      ${kv("With EPC", `${bbox.with_epc} (${pct(bbox.with_epc, bbox.count)}%)`)}
      ${kv("Avg. Height", bbox.avg_height != null ? bbox.avg_height.toFixed(1) : null, "m")}
      ${kv("Avg. Year Built", bbox.avg_year != null ? Math.round(bbox.avg_year) : null)}
      ${kv("Avg. Energy Use", bbox.avg_energy != null ? bbox.avg_energy.toFixed(0) : null, "kWh/m²/yr")}
      ${kv("Avg. Footprint", bbox.avg_footprint != null ? bbox.avg_footprint.toFixed(0) : null, "m²")}
      ${kv("Most Common Use", useLabel(bbox.common_use))}
    </table>`;
  }

  if (project.savedWWR) {
    locContent += `
    <p class="sub-label">Window-to-Wall Ratio (WWR)</p>
    <table class="kv-table">
      ${kv("Average WWR", (project.savedWWR.average_wwr * 100).toFixed(1), "%")}
      ${kv("Source", project.savedWWR.source)}
      ${kv("Saved At", project.savedWWR.saved_at)}
    </table>`;
  }

  /* ── Building list table (from bbox) ── */
  if (project.bboxRows.length > 0) {
    const allComplete   = project.bboxRows.filter(r => r.year_built && r.u_wall && r.epc_class && r.energy_kwh_m2);
    const allMissing    = project.bboxRows.filter(r => !r.year_built && !r.u_wall && !r.epc_class && !r.energy_kwh_m2);
    const buildingRows  = project.bboxRows;

    const rowHtml = (rows: typeof buildingRows) => rows.map(r => `
      <tr>
        <td>${esc(r.address)}</td>
        <td>${esc(useLabel(r.building_use))}</td>
        <td>${esc(r.year_built)}</td>
        <td>${r.epc_class ? `<strong>${esc(r.epc_class)}</strong>` : "—"}</td>
        <td>${r.energy_kwh_m2 != null ? r.energy_kwh_m2.toFixed(0) : "—"}</td>
        <td>${r.u_wall != null ? r.u_wall.toFixed(3) : "—"}</td>
        <td>${r.u_window != null ? r.u_window.toFixed(3) : "—"}</td>
        <td>${esc(r.tabula_period)}</td>
        <td>${r.footprint_m2 != null ? r.footprint_m2.toFixed(0) : "—"}</td>
      </tr>`).join("");

    const colHeaders = `<tr><th>Address</th><th>Use</th><th>Year</th><th>EPC</th><th>Energy<br>kWh/m²</th><th>U-wall<br>W/m²K</th><th>U-win<br>W/m²K</th><th>TABULA</th><th>Footprint<br>m²</th></tr>`;

    locContent += `
    <p class="sub-label">All Buildings (${buildingRows.length} total &nbsp;·&nbsp; ${allComplete.length} fully covered &nbsp;·&nbsp; ${allMissing.length} no data)</p>
    <div style="overflow-x:auto;">
    <table class="full-table">
      <thead>${colHeaders}</thead>
      <tbody>${rowHtml(buildingRows)}</tbody>
    </table>
    </div>`;
  }

  /* ── 3. Data Coverage ── */
  const dataInputEntries = Object.entries(project.dataInputs);
  let dataContent = "";
  if (dataInputEntries.length === 0) {
    dataContent = `<p style="color:#888;font-style:italic;">No data coverage information recorded.</p>`;
  } else {
    dataContent = `
    <table class="full-table">
      <thead>
        <tr>
          <th>Parameter / Source</th>
          <th>Status</th>
          <th>Confidence</th>
        </tr>
      </thead>
      <tbody>
        ${dataInputEntries.map(([key, di]) => `
        <tr>
          <td>${esc(di.proxy || key)}</td>
          <td>${coveragePill(di.available)}</td>
          <td>${confidenceBadge(di.confidence)}</td>
        </tr>`).join("")}
      </tbody>
    </table>`;
  }

  /* ── 4. Renovation Packages ── */
  let packagesContent = "";
  if (computed.packageTotals.length > 0) {
    packagesContent = computed.packageTotals.map(t => {
      const isSelected = t.name === computed.selectedPackageId || computed.packageTotals.length === 1;
      const components = Object.entries(t.selections);
      return `
      <div class="package-card" style="border-left:4px solid ${esc(t.color)};">
        <div class="package-header">
          <span class="dot" style="background:${esc(t.color)}"></span>
          <strong>${esc(t.name)}</strong>
          ${isSelected && computed.packageTotals.length > 1 ? `<span class="selected-badge">Selected</span>` : ""}
        </div>
        <table class="kv-table" style="margin-top:6px;">
          ${kv("Material Cost (SEK)", fmtNum(Math.round(t.costSEK)))}
          ${kv("Embodied Carbon", `${t.carbonKg.toFixed(0)} kg CO₂e${t.carbonEstimated ? " (estimated)" : ""}`)}
        </table>
        ${components.length ? `
        <p class="sub-label" style="margin-top:8px;">Components</p>
        <table class="full-table" style="margin-top:4px;">
          <thead><tr><th>Component</th><th>Wikells Code</th><th>Area</th></tr></thead>
          <tbody>
            ${components.map(([label, comp]) => `<tr><td>${esc(label)}</td><td>${esc(comp.wikellsCode)}</td><td>${esc(comp.areaM2)} m²</td></tr>`).join("")}
          </tbody>
        </table>` : ""}
      </div>`;
    }).join("");
  } else {
    packagesContent = `<p style="color:#888;font-style:italic;">No renovation packages defined.</p>`;
  }

  /* ── 5. Expected Deliverables ── */
  const CROSS_CUTTING: [string, string][] = [
    ["Executive Summary", "High-level findings and recommendations for decision-makers"],
    ["Limitations & Assumptions", "Methodology caveats, data gaps, and proxy impacts"],
    ["Methodology Statement", "Tools, standards, and data sources used"],
  ];
  let delivContent = "";
  if (computed.delivSections.length === 0) {
    delivContent = `<p style="color:#888;font-style:italic;">Complete Step 1 to determine deliverables.</p>`;
  } else {
    delivContent = computed.delivSections.map(([title, items]) => `
      <p class="sub-label">${esc(title)}</p>
      <table class="full-table">
        <thead><tr><th>Deliverable</th><th>Description</th></tr></thead>
        <tbody>${items.map(([n, d]) => `<tr><td><strong>${esc(n)}</strong></td><td>${esc(d)}</td></tr>`).join("")}</tbody>
      </table>`).join("") +
    `<p class="sub-label">Cross-Cutting</p>
      <table class="full-table">
        <thead><tr><th>Deliverable</th><th>Description</th></tr></thead>
        <tbody>${CROSS_CUTTING.map(([n, d]) => `<tr><td><strong>${esc(n)}</strong></td><td>${esc(d)}</td></tr>`).join("")}</tbody>
      </table>`;
  }

  /* ── 6. Timeline ── */
  const tlContent = `
    <table class="full-table">
      <thead><tr><th>Phase</th><th>Start</th><th>End</th><th>Duration</th><th>Hours</th></tr></thead>
      <tbody>
        ${computed.timelineRows.map(r => `
        <tr>
          <td><strong>${esc(r.phase)}</strong></td>
          <td>${esc(r.start)}</td>
          <td>${esc(r.end)}</td>
          <td>${r.weeks} wk</td>
          <td>${r.hrs} h</td>
        </tr>`).join("")}
        <tr class="total-row">
          <td colspan="3"><strong>Total</strong></td>
          <td>${computed.userWeeks} wk</td>
          <td>${computed.totalHours} h</td>
        </tr>
      </tbody>
    </table>`;

  /* ── 7. Budget ── */
  const opexTotal = Object.values(computed.opex).reduce((a, b) => a + b, 0);
  const contingencyAmt = computed.capexTotal - computed.capexBase;
  const currency = computed.currency;
  const budgetContent = `
    <p class="sub-label">Service Cost Breakdown</p>
    <table class="full-table" style="margin-bottom:16px;">
      <thead><tr><th>Item</th><th>Amount (${esc(currency)})</th></tr></thead>
      <tbody>
        <tr><td>Base Labour (${computed.totalHours} hrs × ${fmtNum(Math.round(computed.baseLaborCost / (computed.totalHours || 1)))} ${esc(currency)}/hr)</td><td>${fmtNum(computed.baseLaborCost)}</td></tr>
        <tr><td>LKP — Employer Social Charges (57.5%)</td><td>${fmtNum(computed.lkpCost)}</td></tr>
        <tr><td>Overhead (30%)</td><td>${fmtNum(computed.overheadCost)}</td></tr>
        <tr class="total-row"><td><strong>Total Service Cost</strong></td><td><strong>${fmtNum(computed.serviceCost)}</strong></td></tr>
      </tbody>
    </table>
    <p class="sub-label">CAPEX</p>
    <table class="full-table">
      <thead><tr><th>Item</th><th>Amount (${esc(currency)})</th></tr></thead>
      <tbody>
        <tr><td>Construction</td><td>${fmtNum(computed.capex.construction)}</td></tr>
        <tr><td>Design & Engineering</td><td>${fmtNum(computed.capex.design)}</td></tr>
        <tr><td>Permits & Approvals</td><td>${fmtNum(computed.capex.permits)}</td></tr>
        <tr><td>Equipment & Materials</td><td>${fmtNum(computed.capex.equipment)}</td></tr>
        <tr><td>Contingency (${computed.contingencyPct}%)</td><td>${fmtNum(contingencyAmt)}</td></tr>
        <tr class="total-row"><td><strong>CAPEX Total</strong></td><td><strong>${fmtNum(computed.capexTotal)}</strong></td></tr>
      </tbody>
    </table>
    <p class="sub-label">Annual OPEX</p>
    <table class="full-table">
      <thead><tr><th>Item</th><th>Amount (${esc(currency)})</th></tr></thead>
      <tbody>
        <tr><td>Energy & Utilities</td><td>${fmtNum(computed.opex.energy)}</td></tr>
        <tr><td>Maintenance</td><td>${fmtNum(computed.opex.maintenance)}</td></tr>
        <tr><td>Staffing</td><td>${fmtNum(computed.opex.staffing)}</td></tr>
        <tr><td>Other</td><td>${fmtNum(computed.opex.other)}</td></tr>
        <tr class="total-row"><td><strong>Annual OPEX Total</strong></td><td><strong>${fmtNum(opexTotal)}</strong></td></tr>
      </tbody>
    </table>`;

  /* ── Assemble HTML ── */
  const isRenovation = project.projectType === "Renovation Planning";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(projectName)} — Project Report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #1e293b;
      background: #f8fafc;
      margin: 0;
      padding: 0;
    }
    .page { max-width: 820px; margin: 0 auto; padding: 32px 24px 64px; }

    /* ── Cover ── */
    .cover {
      background: linear-gradient(135deg, #721CB8 0%, #995BD5 50%, #3a6e1a 100%);
      color: #fff;
      border-radius: 16px;
      padding: 48px 40px;
      margin-bottom: 32px;
    }
    .cover-label { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; opacity: 0.75; margin-bottom: 8px; }
    .cover h1 { font-size: 32px; font-weight: 800; margin: 0 0 12px; }
    .cover-type { font-size: 16px; font-weight: 500; opacity: 0.9; margin-bottom: 4px; }
    .cover-meta { font-size: 13px; opacity: 0.7; margin-top: 24px; }

    /* ── Download bar ── */
    .download-bar {
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 28px;
    }
    .download-bar span { font-size: 13px; color: #64748b; flex: 1; }
    .btn-print {
      background: #721CB8;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 8px 18px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-print:hover { background: #5c16a0; }

    /* ── Sections ── */
    .section { margin-bottom: 28px; }
    .section-header {
      border-left: 4px solid #721CB8;
      padding: 8px 0 8px 16px;
      margin-bottom: 12px;
    }
    .section-header h2 { margin: 0; font-size: 16px; font-weight: 700; }
    .section-body { padding: 0 4px; }

    /* ── KV table ── */
    .kv-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .kv-table tr { border-bottom: 1px solid #f1f5f9; }
    .kv-table tr:last-child { border-bottom: none; }
    .kv-label { color: #64748b; padding: 5px 12px 5px 0; width: 46%; font-weight: 500; vertical-align: top; }
    .kv-value { color: #1e293b; padding: 5px 0; font-weight: 600; }
    .unit { font-weight: 400; color: #94a3b8; }

    /* ── Full table ── */
    .full-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .full-table th {
      background: #f1f5f9;
      color: #475569;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 6px 10px;
      text-align: left;
    }
    .full-table td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }
    .full-table tr:last-child td { border-bottom: none; }
    .total-row td { background: #f8fafc; font-weight: 700; border-top: 2px solid #e2e8f0 !important; }

    /* ── Tags / badges ── */
    .tag-row { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
    .sub-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin: 14px 0 4px; }

    /* ── Package cards ── */
    .package-card {
      background: #fafafa;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px 18px;
      margin-bottom: 14px;
    }
    .package-header { display: flex; align-items: center; gap: 8px; font-size: 14px; }
    .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
    .selected-badge { background: #721CB8; color: #fff; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px; }

    /* ── Divider ── */
    hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }

    /* ── Footer ── */
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center; }

    /* ── Print ── */
    @media print {
      body { background: #fff; }
      .page { padding: 20px 16px; }
      .download-bar { display: none; }
      .cover { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="page">

    <!-- Cover -->
    <div class="cover">
      <div class="cover-label">Project Report</div>
      <h1>${esc(projectName)}</h1>
      <div class="cover-type">${esc(project.projectType ?? "—")}</div>
      ${project.buildingDevelopmentType ? `<div class="cover-type" style="opacity:0.75;font-size:14px;">${esc(project.buildingDevelopmentType)}</div>` : ""}
      <div class="cover-meta">
        ${project.locationLabel || project.address ? `📍 ${esc(project.locationLabel || project.address)}<br>` : ""}
        ${project.scale ? `Scale: ${esc(project.scale)} &nbsp;·&nbsp; ` : ""}
        ${project.country ? `Country: ${esc(project.country)} &nbsp;·&nbsp; ` : ""}
        Generated: ${now}
      </div>
    </div>

    <!-- Download bar -->
    <div class="download-bar">
      <span>Use your browser's <strong>Print</strong> (Ctrl+P / ⌘P) to save as PDF.</span>
      <button class="btn-print" onclick="window.print()">🖨 Print / Save as PDF</button>
    </div>

    ${section("1. Project Definition", defContent, "#721CB8")}
    ${section("2. Location & Building Data", locContent, "#995BD5")}
    ${section("3. Data Coverage", dataContent, "#509724")}
    ${isRenovation ? section("4. Renovation Packages", packagesContent, "#d97706") : ""}
    ${section(isRenovation ? "5. Expected Deliverables" : "4. Expected Deliverables", delivContent, "#721CB8")}
    ${section(isRenovation ? "6. Project Timeline" : "5. Project Timeline", tlContent, "#995BD5")}
    ${section(isRenovation ? "7. Budget & Cost" : "6. Budget & Cost", budgetContent, "#3a6e1a")}

    <div class="footer">
      Generated by Project Planning Guide &nbsp;·&nbsp; ${now}
    </div>
  </div>
</body>
</html>`;
}
