import { useState, useMemo } from "react";
import { useWizardStore } from "../store/wizard";
import { WIKELLS_CARBON_MAP } from "../config/wikellsCarbonMapping";
import { WIKELLS_CHAPTERS } from "../config/wikellsData";
import type { WikellsItem } from "../config/wikellsData";
import { generateReport } from "../utils/reportGenerator";
import type { ReportComputedValues } from "../utils/reportGenerator";
import {
  Calendar, DollarSign, Package,
  ChevronDown, ChevronUp, Leaf, Info, Download,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

import { getDeliverableSections, CROSS_CUTTING } from "../config/deliverables";

/* ─── timeline constants ────────────────────────────────────────── */
const EFFORT_BASE: Record<string, number> = {
  "Renovation Planning":        65,
  "Energy Community Planning":  60,
  "Renewable Energy Planning":  50,
};
const SCALE_MULT: Record<string, number> = { Building: 1.0, Neighborhood: 1.8, City: 2.5 };
const PHASE_SPLIT: [string, number][] = [
  ["Scoping",              0.10],
  ["Data Collection",      0.30],
  ["Modelling & Analysis", 0.35],
  ["Validation & QA",      0.15],
  ["Reporting",            0.10],
];
const TL_COLORS = ["#721CB8", "#995BD5", "#2FB477", "#509724", "#3a6e1a"];

function fmt(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

/* ─── budget constants ──────────────────────────────────────────── */
const CONSULTANT_RATES: Record<string, number> = {
  SEK: 1400, EUR: 140, USD: 150, GBP: 130, NOK: 1500, DKK: 1050,
};
const PIE_COLORS = ["#721CB8", "#995BD5", "#2FB477", "#509724", "#3a6e1a"];

function fmtNum(n: number) { return n.toLocaleString(); }

/* ─── Wikells helper (mirrors RenovationPackages logic) ─────────── */
function allWikellsItems(): WikellsItem[] {
  return WIKELLS_CHAPTERS.flatMap(ch => ch.subGroups.flatMap(sg => sg.items));
}
function wikellsByCode(code: string) {
  return allWikellsItems().find(i => i.code === code);
}

/* ─── collapsible section ───────────────────────────────────────── */
function Section({
  title, icon, defaultOpen = true, children,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
          <span className="font-bold text-sm text-slate-800">{title}</span>
        </div>
        {open
          ? <ChevronUp   className="w-4 h-4 text-slate-400 flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
      </button>
      {open && <div className="border-t border-slate-100 px-5 py-5">{children}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
export default function ResultsBudget() {
  const { project } = useWizardStore();

  const isRenovation = project.projectType === "Renovation Planning";

  /* ─── Packages summary from step 4 ─── */
  const packages = project.renovationPackages ?? [];
  const packageTotals = useMemo(() =>
    packages.map(pkg => {
      let costSEK = 0;
      let carbonKg = 0;
      let carbonEstimated = false;
      for (const sel of Object.values(pkg.selections)) {
        const item = wikellsByCode(sel.wikellsCode);
        if (!item || sel.areaM2 <= 0) continue;
        costSEK  += item.costSEK * sel.areaM2;
        const cd  = WIKELLS_CARBON_MAP[sel.wikellsCode];
        carbonKg += (cd ? cd.kgCO2ePerM2 : 30) * sel.areaM2;
        if (!cd) carbonEstimated = true;
      }
      return { pkg, costSEK, carbonKg, carbonEstimated };
    })
  , [packages]);

  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(
    project.selectedPackageId ?? (packages[0]?.id ?? null)
  );
  const selectedPkg   = packageTotals.find(t => t.pkg.id === selectedPkgId);
  const packageCostSEK = selectedPkg?.costSEK ?? 0;

  /* ─── Deliverables count (for stat strip + report) ─── */
  const delivSections = useMemo(
    () => getDeliverableSections(project.projectType, project.systemsInScope),
    [project.projectType, project.systemsInScope]
  );
  const totalDelivs = delivSections.reduce((s, [, items]) => s + items.length, 0) + CROSS_CUTTING.length;

  /* ─── Timeline ─── */
  const baseHours  = EFFORT_BASE[project.projectType ?? ""] ?? 60;
  const scaleMult  = SCALE_MULT[project.scale ?? "Building"] ?? 1.0;
  const totalHours = Math.round(baseHours * scaleMult);
  const [phaseHours, setPhaseHours] = useState<Record<string, number>>(
    () => Object.fromEntries(PHASE_SPLIT.map(([p, f]) => [p, Math.round(totalHours * f)]))
  );
  const [startDate, setStartDate] = useState(fmt(new Date()));
  const userTotalHours = useMemo(() => Object.values(phaseHours).reduce((a, b) => a + b, 0), [phaseHours]);
  const userWeeks      = Math.max(1, Math.round(userTotalHours / 30));
  const maxPhaseHrs    = Math.max(...Object.values(phaseHours), 1);

  const timelineRows = useMemo(() => {
    let cur = new Date(startDate);
    return PHASE_SPLIT.map(([phase]) => {
      const hrs   = phaseHours[phase] ?? 0;
      const weeks = Math.max(1, Math.round(hrs / 30));
      const end   = addDays(cur, weeks * 7);
      const row   = { phase, start: fmt(cur), end: fmt(end), hrs, weeks };
      cur = end;
      return row;
    });
  }, [phaseHours, startDate]);

  /* ─── Budget ─── */
  const [currency, setCurrency]   = useState("SEK");
  const [rate, setRate]           = useState<number>(CONSULTANT_RATES.SEK!);
  const baseLaborCost  = Math.round(userTotalHours * rate);
  const lkpCost        = Math.round(baseLaborCost * 0.575);
  const overheadCost   = Math.round(baseLaborCost * 0.30);
  const serviceCost    = baseLaborCost + lkpCost + overheadCost;

  /* ─── Create Report ─── */
  function handleCreateReport() {
    const computed: ReportComputedValues = {
      totalHours: userTotalHours,
      userWeeks,
      currency,
      baseLaborCost,
      lkpCost,
      overheadCost,
      serviceCost,
      capex: { construction: 0, design: 0, permits: 0, equipment: 0 },
      contingencyPct: 0,
      capexBase: 0,
      capexTotal: 0,
      opex: { energy: 0, maintenance: 0, staffing: 0, other: 0 },
      timelineRows,
      delivSections,
      packageTotals: packageTotals.map(t => ({
        name: t.pkg.name,
        color: t.pkg.color,
        costSEK: t.costSEK,
        carbonKg: t.carbonKg,
        carbonEstimated: t.carbonEstimated,
        selections: t.pkg.selections,
      })),
      selectedPackageId: selectedPkgId,
    };
    const html = generateReport({
      projectName:                   project.projectName,
      projectType:                   project.projectType,
      buildingDevelopmentType:       project.buildingDevelopmentType,
      country:                       project.country,
      scale:                         project.scale,
      systemsInScope:                project.systemsInScope,
      selectedKpis:                  project.selectedKpis,
      explorationApproaches:         project.explorationApproaches,
      buildingUses:                  project.buildingUses,
      renovationEnvelopeComponents:  project.renovationEnvelopeComponents,
      address:                       project.address,
      locationLabel:                 project.locationLabel,
      lat:                           project.lat,
      lon:                           project.lon,
      radiusM:                       project.radiusM,
      lookedUpBuilding:              project.lookedUpBuilding,
      bboxStats:                     project.bboxStats,
      dataInputs:                    project.dataInputs,
      savedWWR:                      project.savedWWR,
      bboxRows:                      project.bboxRows ?? [],
    }, computed);

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  }

  /* ═══════════════════ RENDER ═══════════════════ */
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Step 5 – Timeline & Cost</h2>
          <p className="text-sm text-slate-500 mt-1">
            Review your expected deliverables, project timeline, and cost estimate.
          </p>
        </div>
        <a
          href="/reports"
          className="flex items-center gap-1.5 text-xs font-semibold text-[#2FB477] hover:underline mt-1 whitespace-nowrap"
        >
          View sample reports →
        </a>
      </div>

      {/* Summary stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { value: String(totalDelivs),          label: "Deliverables",  color: "text-[#721CB8]", bg: "bg-[#721CB8]/8" },
          { value: `${userTotalHours} hrs`,       label: "Est. Effort",   color: "text-[#995BD5]", bg: "bg-[#995BD5]/10" },
          { value: `${userWeeks} wk`,             label: "Duration",      color: "text-[#509724]", bg: "bg-[#2FB477]/20" },
          { value: `${fmtNum(serviceCost)} ${currency}`, label: "Service Cost", color: "text-[#3a6e1a]", bg: "bg-[#509724]/10" },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl border border-slate-200 px-4 py-3 text-center ${s.bg}`}>
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Package selector (Renovation only) ── */}
      {isRenovation && packages.length > 0 && (
        <Section title="Selected Renovation Package" icon={<Package className="w-5 h-5 text-violet-600" />}>
          <p className="text-xs text-slate-500 mb-3">
            Select which package to use for CAPEX pre-fill below.
          </p>
          <div className="flex flex-wrap gap-2">
            {packageTotals.map(t => (
              <button
                key={t.pkg.id}
                onClick={() => setSelectedPkgId(t.pkg.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                  selectedPkgId === t.pkg.id
                    ? "border-[#721CB8] bg-[#721CB8]/8 text-[#721CB8]"
                    : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: t.pkg.color }} />
                {t.pkg.name}
                <span className="tabular-nums ml-1">
                  {(t.costSEK / 1000).toFixed(0)} kSEK
                </span>
                <span className={`tabular-nums ${t.carbonEstimated ? "text-amber-500" : "text-emerald-600"}`}>
                  <Leaf className="inline w-3 h-3 mr-0.5" />
                  {t.carbonKg.toFixed(0)} kg
                </span>
              </button>
            ))}
          </div>
          {selectedPkg?.carbonEstimated && (
            <p className="mt-2 text-[11px] text-amber-600 flex items-center gap-1">
              <Info className="w-3 h-3" /> Carbon partly estimated using 30 kg CO₂e/m² fallback
            </p>
          )}
        </Section>
      )}

      {/* ── Timeline ── */}
      <Section title="Project Timeline" icon={<Calendar className="w-5 h-5 text-[#995BD5]" />}>
        <div className="flex flex-wrap gap-4 mb-4">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#721CB8]/30"
            />
          </div>
          <button
            onClick={() => setPhaseHours(Object.fromEntries(PHASE_SPLIT.map(([p, f]) => [p, Math.round(totalHours * f)])))}
            className="self-end text-xs text-[#995BD5] hover:underline"
          >
            Reset to estimates
          </button>
        </div>

        {/* Phase bars */}
        <div className="space-y-2.5 mb-4">
          {PHASE_SPLIT.map(([phase], idx) => {
            const hrs = phaseHours[phase] ?? 0;
            const pct = (hrs / maxPhaseHrs) * 100;
            return (
              <div key={phase} className="grid grid-cols-[2fr_1fr_4fr] gap-3 items-center">
                <span className="text-xs font-medium text-slate-700">{phase}</span>
                <input
                  type="number" min={0} value={hrs}
                  onChange={e => setPhaseHours(prev => ({ ...prev, [phase]: Number(e.target.value) }))}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-center w-full focus:outline-none"
                />
                <div className="h-5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: TL_COLORS[idx] }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Gantt-style table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                {["Phase", "Start", "End", "Duration", "Hours"].map(h => (
                  <th key={h} className="text-left py-2 pr-3 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timelineRows.map((r, i) => (
                <tr key={r.phase} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-medium text-slate-700">{r.phase}</td>
                  <td className="py-2 pr-3 tabular-nums text-slate-500">{r.start}</td>
                  <td className="py-2 pr-3 tabular-nums text-slate-500">{r.end}</td>
                  <td className="py-2 pr-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                      style={{ background: TL_COLORS[i] }}>
                      {r.weeks} wk
                    </span>
                  </td>
                  <td className="py-2 tabular-nums text-slate-600">{r.hrs} h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5 flex gap-6 text-xs">
          <span className="text-slate-500">Total: <strong className="text-slate-800">{userTotalHours} hours</strong></span>
          <span className="text-slate-500">Duration: <strong className="text-slate-800">{userWeeks} weeks</strong></span>
        </div>
      </Section>

      {/* ── Budget ── */}
      <Section title="Budget & Cost" icon={<DollarSign className="w-5 h-5 text-[#3a6e1a]" />}>

        {/* Top summary */}
        <div className="grid grid-cols-1 gap-3 mb-4">
          {[
            { v: `${fmtNum(serviceCost)} ${currency}`, l: "Service Cost",  c: "text-[#721CB8]", bg: "bg-[#721CB8]/8" },
          ].map(s => (
            <div key={s.l} className={`rounded-xl border border-slate-200 px-3 py-2.5 text-center ${s.bg}`}>
              <div className={`text-lg font-bold ${s.c}`}>{s.v}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">{s.l}</div>
            </div>
          ))}
        </div>

        {/* Currency + rate */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Currency</label>
            <select
              value={currency}
              onChange={e => { setCurrency(e.target.value); setRate(CONSULTANT_RATES[e.target.value] ?? 150); }}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {Object.keys(CONSULTANT_RATES).map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Consultant hourly rate</label>
            <input
              type="number" min={0} value={rate}
              onChange={e => setRate(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Service cost breakdown */}
        <div className="rounded-xl border border-slate-200 overflow-hidden mb-4">
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Service Cost Breakdown</span>
          </div>
          <table className="w-full text-xs">
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="px-4 py-2 text-slate-600">Base Labour ({fmtNum(userTotalHours)} hrs × {fmtNum(rate)} {currency})</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{fmtNum(baseLaborCost)} {currency}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="px-4 py-2 text-slate-600">LKP — Employer Social Charges (57.5%)</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{fmtNum(lkpCost)} {currency}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="px-4 py-2 text-slate-600">Overhead (30%)</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{fmtNum(overheadCost)} {currency}</td>
              </tr>
              <tr className="bg-slate-50">
                <td className="px-4 py-2.5 font-semibold text-slate-800">Total Service Cost</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-bold text-[#721CB8]">{fmtNum(serviceCost)} {currency}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* Report actions (Back/Continue live in the wizard footer) */}
      <div className="flex justify-end pt-2 pb-8">
        <div className="flex gap-3">
          <button
            onClick={handleCreateReport}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#721CB8] text-white font-semibold text-sm shadow hover:bg-[#5c16a0] transition-colors"
          >
            <Download className="w-4 h-4" />
            Create Report
          </button>
          <button
            onClick={() => window.print()}
            className="ppg-btn-secondary"
          >
            Export / Print
          </button>
        </div>
      </div>
    </div>
  );
}


