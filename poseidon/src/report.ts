/* Renovation report: what the wizard saves (a snapshot, so a saved report
   never changes when the data does), and one HTML renderer used for the
   on-screen view, the Reports folder and printing. */
import { t, locale } from "./i18n";

export interface ReportRankRow {
  rank: number; address: string; area: string | null; year: number | null; eclass: string | null;
  P: number; E: number; F: number | null; C: number; confidence: number; why: string;
  parts: Record<string, string>;   // component → needed / consider / ok / unknown
  heating: number | null;          // EPSM RC kWh/m²·yr
  flagged: boolean;
}

export interface ReportMeasureRow {
  address: string;
  /** uAfter null = not an envelope part (the heating system). */
  parts: { component: string; measure: string; uBefore: number | null; uAfter: number | null; areaM2: number; cost: number }[];
  heatBeforeMWh: number; heatAfterMWh: number; savingMWh: number; savingPct: number;
  cost: number; annualSavingSEK: number; paybackYr: number | null;
  // Life-cycle figures (reports saved before these existed lack them)
  heating?: string;            // heating system after renovation
  embodiedT?: number;          // embodied carbon of the measures incl. replacements, t CO2e
  opCo2BeforeT?: number; opCo2AfterT?: number;   // operational carbon per year, t CO2e
  lccSavingSEK?: number;       // life-cycle cost of doing nothing − of this package
  petBefore?: number; petAfter?: number; meetsGoal?: boolean;
}

export interface ReportDecisionRow {
  label: string; invest: number; carbonT: number; meet: number; n: number;
  benefits: number[]; maxRegret: number; hurwicz: number; range: number; isBaseline?: boolean;
}

export interface ReportContent {
  createdAt: string;
  scope: { description: string; buildings: number; atempM2: number };
  weights: { E: number; F: number; C: number; how: string };
  method: string[];
  ranking: ReportRankRow[];
  measures: ReportMeasureRow[];
  totals: { cost: number; savingMWh: number; heatBeforeMWh: number; annualSavingSEK: number;
    embodiedT?: number; lccSavingSEK?: number; opCo2BeforeT?: number; opCo2AfterT?: number; meetGoal?: number } | null;
  heatPriceSEK: number;
  elPriceSEK?: number;
  studyPeriodYr?: number;
  climate?: { goal: string; basis: string; source: string; petGoal: number; stockPet: number | null; stockOk: number; stockN: number };
  decision?: { scenarios: string[]; rows: ReportDecisionRow[]; picks: { minimaxRegret: string | null; hurwicz: string | null; mostRobust: string | null }; alpha: number };
  assumptions?: string[];
  staged?: {
    startYear: number; years: number; budget: number; carbonPriceSekT: number; costGrowthPct: number; maxBuildingsPerYear: number | null;
    planCost: number; fittedCost: number; measures: number; fitted: number; unscheduled: string[];
    rows: { year: number; spend: number; cum: number; budgetCum: number; done: string; bill: number; co2T: number; meet: number; n: number; final?: boolean }[];
  };
  notes: string[];
}

export interface SavedReport { id: string; title: string; created_at: string; content: ReportContent }

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const num = (v: number | null | undefined, d = 0) =>
  v == null || !Number.isFinite(v) ? "–" : new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const sek = (v: number) => (Math.abs(v) >= 1e6 ? `${num(v / 1e6, 1)} MSEK` : Math.abs(v) >= 1e4 ? `${num(v / 1e3)} kSEK` : `${num(v)} SEK`);
const LEVEL_COLOR: Record<string, string> = { needed: "#c00000", consider: "#b45309", ok: "#2e7d32", unknown: "#808080" };

/** A complete, self-contained HTML document (for an iframe or a print window). */
export function reportHtml(title: string, c: ReportContent): string {
  const date = new Date(c.createdAt).toLocaleString(locale());
  const parts = (p: Record<string, string>) => Object.entries(p).map(([k, v]) =>
    `<span class="chip" style="background:${LEVEL_COLOR[v] ?? "#808080"}" title="${esc(t(v))}">${esc(t(k))}</span>`).join(" ");
  const rank = c.ranking.map((r) => `<tr${r.flagged ? ' class="flag"' : ""}>
      <td class="n">${r.rank}</td><td>${r.flagged ? "⚑ " : ""}${esc(r.address)}</td><td>${esc(r.area ?? "–")}</td>
      <td class="n">${r.year ?? "–"}</td><td>${esc(r.eclass ?? "–")}</td><td class="n">${num(r.heating, 1)}</td>
      <td class="n"><b>${num(r.P)}</b></td><td class="n">${num(r.E)}</td><td class="n">${r.F == null ? "–" : num(r.F)}</td>
      <td class="n">${num(r.C)}</td><td class="n">${num(r.confidence * 100)} %</td>
      <td>${parts(r.parts)}</td><td class="why">${esc(r.why)}</td></tr>`).join("");
  const lcaCols = c.measures.some((m) => m.lccSavingSEK != null);
  const meas = c.measures.map((m) => `<tr>
      <td>${esc(m.address)}</td>
      <td>${m.parts.map((p) => p.uAfter == null
        ? `${esc(t(p.component))}: ${esc(t(p.measure))} <span class="muted">(${sek(p.cost)})</span>`
        : `${esc(t(p.component))}: ${esc(p.measure)} <span class="muted">(U ${p.uBefore == null ? "?" : num(p.uBefore, 2)} → ${num(p.uAfter, 2)}, ${num(p.areaM2)} m², ${sek(p.cost)})</span>`).join("<br>")}</td>
      <td class="n">${num(m.heatBeforeMWh, 1)}</td><td class="n">${num(m.heatAfterMWh, 1)}</td>
      <td class="n"><b>${num(m.savingMWh, 1)}</b> (${num(m.savingPct)} %)</td>
      <td class="n">${sek(m.cost)}</td><td class="n">${sek(m.annualSavingSEK)}</td>
      <td class="n">${m.paybackYr == null ? "–" : num(m.paybackYr)}</td>
      ${lcaCols ? `<td class="n">${m.lccSavingSEK == null ? "–" : sek(m.lccSavingSEK)}</td><td class="n">${num(m.embodiedT, 1)}</td>
      <td class="n">${num(m.opCo2BeforeT, 1)} → ${num(m.opCo2AfterT, 1)}</td>
      <td class="n">${num(m.petBefore)} → <b>${num(m.petAfter)}</b> ${m.meetsGoal ? "✓" : "✗"}</td>` : ""}</tr>`).join("");
  const dec = c.decision;
  const decision = dec ? `<h2>${esc(t("Which plan holds up if energy prices change?"))}</h2>
<div class="muted">${esc(t("Net benefit over {n} years (energy bills saved minus investment, replacements and upkeep, present value) in each price future. Regret = how much worse than the best plan for that future. Minimax regret picks the plan whose worst regret is smallest.", { n: c.studyPeriodYr ?? 50 }))}</div>
<table><thead><tr><th>${esc(t("Plan"))}</th><th>${esc(t("Investment"))}</th><th>${esc(t("Life-cycle carbon (t CO₂e)"))}</th><th>${esc(t("Meets climate goal"))}</th>
${dec.scenarios.map((s) => `<th>${esc(t(s))}</th>`).join("")}<th>${esc(t("Max regret"))}</th><th>Hurwicz (α ${num(dec.alpha, 1)})</th></tr></thead>
<tbody>${dec.rows.map((r) => `<tr${dec.picks.minimaxRegret === r.label ? ' class="flag"' : ""}><td>${dec.picks.minimaxRegret === r.label ? "★ " : ""}${esc(t(r.label))}</td>
<td class="n">${sek(r.invest)}</td><td class="n">${num(r.carbonT)}</td><td class="n">${r.meet} / ${r.n}</td>
${r.benefits.map((b) => `<td class="n">${sek(b)}</td>`).join("")}<td class="n">${r.isBaseline ? "–" : sek(r.maxRegret)}</td><td class="n">${r.isBaseline ? "–" : sek(r.hurwicz)}</td></tr>`).join("")}</tbody></table>
<div>★ ${esc(t("Minimax regret"))}: <b>${esc(t(dec.picks.minimaxRegret ?? "–"))}</b> · ${esc(t("Hurwicz"))}: ${esc(t(dec.picks.hurwicz ?? "–"))} · ${esc(t("Smallest range"))}: ${esc(t(dec.picks.mostRobust ?? "–"))}</div>` : "";
  const cl = c.climate;
  const climate = cl ? `<h2>${esc(t(cl.goal))}</h2>
<div>${esc(t(cl.basis))} <span class="muted">(${esc(cl.source)})</span></div>
<div>${esc(t("Buildings in scope today: Atemp-weighted PET {pet} kWh/m²; {ok} of {n} at or below {goal}.", { pet: num(cl.stockPet), ok: cl.stockOk, n: cl.stockN, goal: cl.petGoal }))}</div>
${c.totals?.meetGoal != null ? `<div>${esc(t("With the planned measures: {ok} of {n} flagged buildings at or below {goal} kWh/m² PET.", { ok: c.totals.meetGoal, n: c.measures.length, goal: cl.petGoal }))}</div>` : ""}` : "";
  return `<!doctype html><html lang="${locale().slice(0, 2)}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body { font: 12px/1.45 Tahoma, "Segoe UI", Arial, sans-serif; color: #000; margin: 18px 22px; background: #fff; }
  h1 { font-size: 20px; margin: 0 0 2px; color: #00505a; } h2 { font-size: 14px; margin: 18px 0 6px; color: #00505a; border-bottom: 2px solid #00505a; }
  .meta { color: #444; margin-bottom: 10px; } .muted { color: #666; }
  table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #c8c8c8; padding: 3px 5px; vertical-align: top; text-align: left; }
  th { background: #e6eeef; font-weight: bold; } td.n { text-align: right; white-space: nowrap; } td.why { font-size: 11px; min-width: 220px; }
  tr.flag td { background: #fff6c8; } .chip { display: inline-block; color: #fff; font-size: 10px; font-weight: bold; padding: 0 3px; margin: 1px 0; }
  ul { margin: 4px 0 0 18px; padding: 0; } .totals td { font-weight: bold; background: #f2f2f2; }
  .logo { float: right; height: 46px; }
  @media print { body { margin: 10mm; } h2 { break-after: avoid; } tr { break-inside: avoid; } @page { size: A4 landscape; margin: 10mm; } }
</style></head><body>
<img class="logo" src="${esc(location.origin)}/logo-full.png" alt="Poseidon">
<h1>${esc(title)}</h1>
<div class="meta">${esc(t("Created"))} ${esc(date)} · ${esc(c.scope.description)} · ${c.scope.buildings} ${esc(t("buildings"))} · ${num(c.scope.atempM2)} m² Atemp</div>
<h2>${esc(t("How the buildings were ranked"))}</h2>
<div>${esc(t("Weights"))}: ${esc(t("Energy"))} ${num(c.weights.E * 100)} % · ${esc(t("Façade condition"))} ${num(c.weights.F * 100)} % · ${esc(t("Building characteristics"))} ${num(c.weights.C * 100)} % <span class="muted">(${esc(c.weights.how)})</span></div>
<ul>${c.method.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
<h2>${esc(t("Ranking"))} (${c.ranking.length})</h2>
<table><thead><tr><th>#</th><th>${esc(t("Address"))}</th><th>${esc(t("Area"))}</th><th>${esc(t("Year"))}</th><th>${esc(t("Energy class"))}</th>
<th>${esc(t("RC heating (kWh/m²·yr)"))}</th><th>${esc(t("Priority"))}</th><th>E</th><th>F</th><th>C</th><th>${esc(t("Confidence"))}</th><th>${esc(t("Parts"))}</th><th>${esc(t("Why"))}</th></tr></thead>
<tbody>${rank}</tbody></table>
${c.measures.length ? `<h2>${esc(t("Recommended measures"))} (${c.measures.length})</h2>
<table><thead><tr><th>${esc(t("Building"))}</th><th>${esc(t("Measures"))}</th><th>${esc(t("Heating before (MWh/yr)"))}</th><th>${esc(t("Heating after (MWh/yr)"))}</th>
<th>${esc(t("Saving (MWh/yr)"))}</th><th>${esc(t("Cost"))}</th><th>${esc(t("Saving per year"))}</th><th>${esc(t("Payback (years)"))}</th>
${lcaCols ? `<th>${esc(t("Life-cycle saving ({n} yr)", { n: c.studyPeriodYr ?? 50 }))}</th><th>${esc(t("Embodied carbon (t CO₂e)"))}</th><th>${esc(t("Operational CO₂ (t/yr)"))}</th><th>${esc(t("PET (kWh/m²)"))}</th>` : ""}</tr></thead>
<tbody>${meas}${c.totals ? `<tr class="totals"><td colspan="2">${esc(t("Total"))}</td><td class="n">${num(c.totals.heatBeforeMWh, 1)}</td><td class="n"></td>
<td class="n">${num(c.totals.savingMWh, 1)}</td><td class="n">${sek(c.totals.cost)}</td><td class="n">${sek(c.totals.annualSavingSEK)}</td>
<td class="n">${c.totals.annualSavingSEK > 0 ? num(c.totals.cost / c.totals.annualSavingSEK) : "–"}</td>
${lcaCols ? `<td class="n">${c.totals.lccSavingSEK == null ? "–" : sek(c.totals.lccSavingSEK)}</td><td class="n">${num(c.totals.embodiedT, 1)}</td>
<td class="n">${num(c.totals.opCo2BeforeT, 1)} → ${num(c.totals.opCo2AfterT, 1)}</td><td class="n">${c.totals.meetGoal ?? "–"} ✓</td>` : ""}</tr>` : ""}</tbody></table>
<div class="muted">${esc(t("Heat price used:"))} ${num(c.heatPriceSEK, 2)} SEK/kWh${c.elPriceSEK != null ? ` · ${esc(t("Electricity"))} ${num(c.elPriceSEK, 2)} SEK/kWh` : ""}</div>` : ""}
${climate}
${decision}
${c.staged ? `<h2>${esc(t("Staged plan"))} ${c.staged.startYear}–${c.staged.startYear + c.staged.years - 1}</h2>
<div>${esc(t("Budget"))} ${sek(c.staged.budget)} ${esc(t("over"))} ${c.staged.years} ${esc(t("years"))} · ${esc(t("CO₂ price (SEK/t)"))} ${num(c.staged.carbonPriceSekT)} · ${esc(t("Cost growth (%/yr)"))} ${num(c.staged.costGrowthPct, 1)}${c.staged.maxBuildingsPerYear ? ` · ${esc(t("Max buildings per year"))} ${c.staged.maxBuildingsPerYear}` : ""}</div>
<div>${esc(t("Fits in the budget"))}: <b>${c.staged.fitted} / ${c.staged.measures}</b> ${esc(t("measures"))} (${sek(c.staged.fittedCost)} ${esc(t("of"))} ${sek(c.staged.planCost)})</div>
${c.staged.unscheduled.length ? `<div style="color:#a00000">${esc(t("Does not fit"))}: ${esc(c.staged.unscheduled.join(" · "))}</div>` : ""}
<table><thead><tr><th>${esc(t("Year"))}</th><th>${esc(t("Spend"))}</th><th>${esc(t("Spent so far / budget released"))}</th><th>${esc(t("Measures done this year"))}</th>
<th>${esc(t("Energy bills per year"))}</th><th>${esc(t("CO₂ per year (t)"))}</th><th>${esc(t("Buildings meeting the climate goal"))}</th></tr></thead>
<tbody>${c.staged.rows.map((r) => `<tr${r.final ? ' class="totals"' : ""}><td>${r.year}${r.final ? ` (${esc(t("after the plan"))})` : ""}</td><td class="n">${r.spend ? sek(r.spend) : "–"}</td>
<td class="n">${r.final ? "" : `${sek(r.cum)} / ${sek(r.budgetCum)}`}</td><td>${esc(r.done)}</td><td class="n">${sek(r.bill)}</td><td class="n">${num(r.co2T, 1)}</td><td class="n">${r.meet} / ${r.n}</td></tr>`).join("")}</tbody></table>` : ""}
${c.assumptions?.length ? `<h2>${esc(t("Assumptions"))}</h2><ul>${c.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
<h2>${esc(t("Notes and limitations"))}</h2>
<ul>${c.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
</body></html>`;
}

/** Open the report in its own browser window and bring up the print dialog. */
export function printReport(title: string, c: ReportContent) {
  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) return false;
  w.document.open();
  w.document.write(reportHtml(title, c));
  w.document.close();
  // Once, after the logo has loaded (or after a second if load never fires).
  let done = false;
  const go = () => { if (done) return; done = true; try { w.focus(); w.print(); } catch { /* window closed */ } };
  w.onload = go;
  setTimeout(go, 1200);
  return true;
}

export async function saveReport(title: string, content: ReportContent): Promise<SavedReport> {
  const r = await fetch("/api/poseidon/reports", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, content }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? `save ${r.status}`);
  return r.json();
}
export async function listReports(): Promise<{ id: string; title: string; created_at: string; buildings: number; measures: number }[]> {
  const r = await fetch("/api/poseidon/reports");
  if (!r.ok) throw new Error(`reports ${r.status}`);
  return r.json();
}
export async function getReport(id: string): Promise<SavedReport> {
  const r = await fetch(`/api/poseidon/reports/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`report ${r.status}`);
  return r.json();
}
export async function deleteReport(id: string) {
  await fetch(`/api/poseidon/reports/${encodeURIComponent(id)}`, { method: "DELETE" });
}
