import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import { WIKELLS_CARBON_MAP } from "../config/wikellsCarbonMapping";
import { WIKELLS_CHAPTERS } from "../config/wikellsData";
import type { WikellsItem } from "../config/wikellsData";
import {
  FileText, Layers, ShieldCheck, Calendar, DollarSign,
  ChevronDown, ChevronUp, Package, Leaf, Info,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

/* ─── deliverables catalog ─────────────────────────────────────── */
type Deliverable = [string, string];

const DELIVERABLES: Record<string, Deliverable[]> = {
  "Building Condition": [
    ["Building Condition Assessment", "Current state of fabric, systems, and services"],
    ["Energy Performance Baseline", "Current EUI and carbon intensity"],
    ["EPC / Certification Impact", "Predicted rating improvement"],
  ],
  "Retrofit Measures": [
    ["Retrofit Measure Catalog", "Prioritized list of improvement interventions"],
    ["Energy Savings Potential", "kWh and % reduction per measure"],
    ["Carbon Reduction Pathway", "kgCO₂e savings per intervention"],
    ["Cost-Benefit Analysis", "CAPEX, payback, NPV per measure"],
    ["Embodied Carbon of Retrofit", "kgCO₂e from new materials and works"],
  ],
  "Building Geometry": [
    ["Building Footprint & Orientation", "Floor area, height, cardinal orientation"],
    ["Roof / Façade Area Assessment", "Available surface area for solar installations"],
  ],
  "Energy Demand": [
    ["Annual Electricity Consumption", "Total kWh per year per building"],
    ["Annual Heating Demand", "Thermal energy demand (kWh)"],
    ["Monthly / Hourly Load Profiles", "Demand curves for sizing and simulation"],
  ],
  "PV System": [
    ["Incident Radiation Analysis", "Annual & seasonal solar irradiance maps (kWh/m²)"],
    ["Optimal PV Panel Placement & Coverage %", "Best tilt, azimuth, and usable area"],
    ["Energy Yield Estimate", "Annual PV production (kWh/yr)"],
    ["Self-Consumption Ratio", "Share of PV output consumed on-site"],
    ["ROI / Payback Period", "Return on investment and simple payback (years)"],
    ["LCOE", "Levelized cost of energy over system lifetime"],
  ],
  "Site & Climate": [
    ["Wind & Solar Resource Assessment", "Irradiance / wind speed characterization"],
    ["Shading Analysis", "Impact of obstacles on energy yield"],
  ],
  "System Design": [
    ["Capacity & Layout Optimization", "Sizing and placement of generation assets"],
    ["Annual Energy Production", "Expected kWh/yr from the designed system"],
    ["Financial Analysis", "ROI, payback period, LCOE over system lifetime"],
  ],
};

const CROSS_CUTTING: Deliverable[] = [
  ["Executive Summary", "High-level findings and recommendations for decision-makers"],
  ["Limitations & Assumptions", "Methodology caveats, data gaps, and proxy impacts"],
  ["Methodology Statement", "Tools, standards, and data sources used"],
];

function getDeliverableSections(
  projectType: string | null,
  systems: string[]
): [string, Deliverable[]][] {
  const sys = new Set(systems);
  if (projectType === "Renovation Planning") {
    return [
      ["Building Condition", DELIVERABLES["Building Condition"]!],
      ["Retrofit Measures",  DELIVERABLES["Retrofit Measures"]!],
    ];
  }
  if (projectType === "Energy Community Planning") {
    const sects: [string, Deliverable[]][] = [
      ["Building Geometry", DELIVERABLES["Building Geometry"]!],
      ["Energy Demand",     DELIVERABLES["Energy Demand"]!],
    ];
    if (sys.has("Rooftop PV") || sys.has("Community PV") || sys.has("Facade PV"))
      sects.push(["PV System", DELIVERABLES["PV System"]!]);
    return sects;
  }
  if (projectType === "Renewable Energy Planning") {
    return [
      ["Site & Climate", DELIVERABLES["Site & Climate"]!],
      ["System Design",  DELIVERABLES["System Design"]!],
    ];
  }
  return [];
}

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
const TL_COLORS = ["#721CB8", "#995BD5", "#96D74C", "#509724", "#3a6e1a"];

function fmt(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

/* ─── budget constants ──────────────────────────────────────────── */
const CONSULTANT_RATES: Record<string, number> = {
  SEK: 1400, EUR: 140, USD: 150, GBP: 130, NOK: 1500, DKK: 1050,
};
const PIE_COLORS = ["#721CB8", "#995BD5", "#96D74C", "#509724", "#3a6e1a"];

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
  const navigate = useNavigate();
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

  /* ─── Deliverables ─── */
  const delivSections = useMemo(
    () => getDeliverableSections(project.projectType, project.systemsInScope),
    [project.projectType, project.systemsInScope]
  );
  const totalDelivs = delivSections.reduce((s, [, items]) => s + items.length, 0) + CROSS_CUTTING.length;
  const [openSects, setOpenSects] = useState<Set<string>>(
    () => new Set(delivSections.map(([t]) => t))
  );
  const toggleSect = (k: string) =>
    setOpenSects(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const [crossOpen, setCrossOpen] = useState(false);

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
  const serviceCost = Math.round(userTotalHours * rate * 1.1);

  const [capex, setCapex] = useState({
    construction: Math.round(packageCostSEK),
    design: 0,
    permits: 0,
    equipment: 0,
  });
  /* Keep construction in sync when package selection changes */
  useMemo(() => {
    setCapex(prev => ({ ...prev, construction: Math.round(packageCostSEK) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageCostSEK]);

  const [contingencyPct, setContingencyPct] = useState(10);
  const capexBase  = Object.values(capex).reduce((a, b) => a + b, 0);
  const capexTotal = Math.round(capexBase * (1 + contingencyPct / 100));

  const [opex, setOpex] = useState({ energy: 0, maintenance: 0, staffing: 0, other: 0 });
  const opexTotal = Object.values(opex).reduce((a, b) => a + b, 0);

  const pieData = useMemo(() => {
    const contingencyAmt = capexTotal - capexBase;
    return [
      { name: "Construction",  value: capex.construction },
      { name: "Design",        value: capex.design },
      { name: "Permits",       value: capex.permits },
      { name: "Equipment",     value: capex.equipment },
      { name: "Contingency",   value: contingencyAmt },
    ].filter(d => d.value > 0);
  }, [capex, capexTotal, capexBase]);

  /* ═══════════════════ RENDER ═══════════════════ */
  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">Step 5 – Results & Budget</h2>
        <p className="text-sm text-slate-500 mt-1">
          Review your expected deliverables, project timeline, and cost estimate.
        </p>
      </div>

      {/* Summary stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { value: String(totalDelivs),          label: "Deliverables",  color: "text-[#721CB8]", bg: "bg-[#721CB8]/8" },
          { value: `${userTotalHours} hrs`,       label: "Est. Effort",   color: "text-[#995BD5]", bg: "bg-[#995BD5]/10" },
          { value: `${userWeeks} wk`,             label: "Duration",      color: "text-[#509724]", bg: "bg-[#96D74C]/20" },
          { value: `${fmtNum(serviceCost)} ${currency}`, label: "Service Cost", color: "text-[#3a6e1a]", bg: "bg-[#509724]/10" },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl border border-slate-200 px-4 py-3 text-center ${s.bg}`}>
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── 1. Package selector (Renovation only) ── */}
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

      {/* ── 2. Deliverables ── */}
      <Section title="Expected Deliverables" icon={<FileText className="w-5 h-5 text-[#721CB8]" />}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          {[
            { v: totalDelivs,         l: "Report Items",    c: "text-[#721CB8]" },
            { v: delivSections.length, l: "Sections",       c: "text-[#995BD5]" },
            { v: CROSS_CUTTING.length, l: "Cross-cutting",  c: "text-[#509724]" },
          ].map(s => (
            <div key={s.l} className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-center">
              <div className={`text-xl font-bold ${s.c}`}>{s.v}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">{s.l}</div>
            </div>
          ))}
        </div>

        {delivSections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-400 text-sm">
            No deliverables mapped yet — complete Step 1 to see your report scope.
          </div>
        ) : (
          <div className="space-y-2">
            {delivSections.map(([title, items]) => {
              const open = openSects.has(title);
              return (
                <div key={title} className="rounded-xl border border-slate-200 overflow-hidden">
                  <button
                    onClick={() => toggleSect(title)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition text-left"
                  >
                    <span className="font-semibold text-xs text-slate-700">
                      {title} <span className="text-slate-400 font-normal">({items.length})</span>
                    </span>
                    {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                  </button>
                  {open && (
                    <div className="px-4 pb-3 space-y-1.5">
                      {items.map(([name, desc]) => (
                        <div key={name} className="pl-3 py-1.5 rounded-lg bg-slate-50 border-l-[3px] border-[#995BD5]">
                          <div className="text-xs font-semibold text-slate-800">{name}</div>
                          <div className="text-[11px] text-slate-500">{desc}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <button
                onClick={() => setCrossOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition text-left"
              >
                <span className="font-semibold text-xs text-slate-700">
                  Cross-Cutting <span className="text-slate-400 font-normal">({CROSS_CUTTING.length})</span>
                </span>
                {crossOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
              </button>
              {crossOpen && (
                <div className="px-4 pb-3 space-y-1.5">
                  {CROSS_CUTTING.map(([name, desc]) => (
                    <div key={name} className="pl-3 py-1.5 rounded-lg bg-slate-50 border-l-[3px] border-slate-300">
                      <div className="text-xs font-semibold text-slate-800">{name}</div>
                      <div className="text-[11px] text-slate-500">{desc}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Section>

      {/* ── 3. Timeline ── */}
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

      {/* ── 4. Budget ── */}
      <Section title="Budget & Cost" icon={<DollarSign className="w-5 h-5 text-[#3a6e1a]" />}>

        {/* Top summary */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { v: `${fmtNum(serviceCost)} ${currency}`, l: "Service Cost",  c: "text-[#721CB8]", bg: "bg-[#721CB8]/8" },
            { v: `${fmtNum(capexTotal)} ${currency}`,  l: "CAPEX Total",   c: "text-[#995BD5]", bg: "bg-[#995BD5]/10" },
            { v: `${fmtNum(opexTotal)} ${currency}`,   l: "Annual OPEX",   c: "text-[#509724]", bg: "bg-[#96D74C]/20" },
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

        {/* CAPEX */}
        <div className="space-y-3 mb-4">
          <h4 className="font-semibold text-xs text-slate-700 uppercase tracking-wider">CAPEX</h4>
          {isRenovation && packageCostSEK > 0 && (
            <div className="rounded-xl bg-violet-50 border border-violet-200 px-3 py-2 text-xs text-violet-800 flex items-center gap-2">
              <Package className="w-3.5 h-3.5 flex-shrink-0" />
              Construction pre-filled from <strong>{selectedPkg?.pkg.name}</strong>
              ({(packageCostSEK / 1000).toFixed(0)} kSEK material cost)
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {([ ["construction", "Construction"], ["design", "Design & Engineering"],
                 ["permits", "Permits & Approvals"], ["equipment", "Equipment & Materials"],
              ] as const).map(([key, label]) => (
              <div key={key}>
                <label className="block text-xs text-slate-600 mb-1">{label}</label>
                <input
                  type="number" min={0} value={capex[key]}
                  onChange={e => setCapex(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Contingency: {contingencyPct}%</label>
            <input
              type="range" min={0} max={30} value={contingencyPct}
              onChange={e => setContingencyPct(Number(e.target.value))}
              className="w-full accent-[#995BD5]"
            />
          </div>
        </div>

        {/* OPEX */}
        <div className="space-y-3 mb-4">
          <h4 className="font-semibold text-xs text-slate-700 uppercase tracking-wider">Annual OPEX</h4>
          <div className="grid grid-cols-2 gap-3">
            {([ ["energy", "Energy & Utilities"], ["maintenance", "Maintenance"],
                 ["staffing", "Staffing"], ["other", "Other"],
              ] as const).map(([key, label]) => (
              <div key={key}>
                <label className="block text-xs text-slate-600 mb-1">{label}</label>
                <input
                  type="number" min={0} value={opex[key]}
                  onChange={e => setOpex(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Pie chart */}
        {pieData.length > 0 && (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => [`${fmtNum(v)} ${currency}`, ""]} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </Section>

      {/* Navigation */}
      <div className="flex justify-between pt-2 pb-8">
        <button onClick={() => navigate("/step/4")} className="ppg-btn-secondary">← Back</button>
        <button
          onClick={() => window.print()}
          className="ppg-btn-primary"
        >
          Export / Print
        </button>
      </div>
    </div>
  );
}


