import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import {
  CheckCircle2, AlertTriangle, XCircle,
  ChevronDown, ChevronUp, Database,
  FileText, Layers, Zap, TrendingUp, Activity, Info, ArrowRight, MapPin,
} from "lucide-react";
import BuildingMapPanel from "../components/panels/BuildingMap";
import SensitivityPanel from "../components/panels/SensitivityPanel";
import EubuccoValidationPanel from "../components/panels/EubuccoValidationPanel";
import EpcPanel from "../components/panels/EpcPanel";
import TabulaPanel from "../components/panels/TabulaPanel";
import WikellsPanel from "../components/panels/WikellsPanel";
import { getImportanceRanking } from "../config/sensitivityData";

/* ─────────────────────────────────────────────
   Source normalisation
───────────────────────────────────────────── */
function normaliseSource(proxy: string | null): string {
  if (!proxy || proxy.startsWith("—")) return "Requires user input";
  if (proxy.includes("TABULA"))                             return "TABULA Archetypes";
  if (proxy.includes("Boverket"))                           return "Boverket Database";
  if (proxy.includes("EPC") || proxy.includes("Energy Performance Certificate")) return "EPC Register";
  if (proxy.includes("Street-level imagery"))               return "Street-level Imagery / GIS";
  if (proxy.includes("Urban datasets"))                     return "Urban Datasets";
  if (proxy.includes("PVGIS") || proxy.includes("irradiance")) return "PVGIS / Climate Data";
  if (proxy.includes("Synthetic") || proxy.includes("demand profile")) return "Synthetic Load Profiles";
  if (proxy.includes("Nordpool") || proxy.includes("price")) return "Nordpool Market Data";
  if (proxy.includes("IEA") || proxy.includes("Trafikverket")) return "National Mobility Data";
  if (proxy.includes("IEC") || proxy.includes("standard"))  return "Industry Standards";
  if (proxy.includes("DSO") || proxy.includes("grid capacity")) return "DSO / Grid Data";
  return "Other reference data";
}

const SOURCE_DOT: Record<string, string> = {
  "TABULA Archetypes":          "bg-emerald-500",
  "EPC Register":               "bg-amber-400",
  "Boverket Database":          "bg-rose-500",
  "Street-level Imagery / GIS": "bg-sky-500",
  "Urban Datasets":             "bg-violet-500",
  "PVGIS / Climate Data":       "bg-yellow-500",
  "Synthetic Load Profiles":    "bg-indigo-500",
  "Nordpool Market Data":       "bg-teal-500",
  "National Mobility Data":     "bg-blue-500",
  "Industry Standards":         "bg-slate-400",
  "DSO / Grid Data":            "bg-cyan-500",
  "Requires user input":        "bg-red-500",
  "Other reference data":       "bg-gray-400",
};
const SOURCE_TEXT: Record<string, string> = {
  "TABULA Archetypes":          "text-emerald-700",
  "EPC Register":               "text-amber-700",
  "Boverket Database":          "text-rose-700",
  "Street-level Imagery / GIS": "text-sky-700",
  "Urban Datasets":             "text-violet-700",
  "PVGIS / Climate Data":       "text-yellow-700",
  "Synthetic Load Profiles":    "text-indigo-700",
  "Nordpool Market Data":       "text-teal-700",
  "National Mobility Data":     "text-blue-700",
  "Industry Standards":         "text-slate-600",
  "DSO / Grid Data":            "text-cyan-700",
  "Requires user input":        "text-red-700",
  "Other reference data":       "text-gray-600",
};

/* ─────────────────────────────────────────────
   SA cross-reference mapping
───────────────────────────────────────────── */
const SA_BRIDGE: Record<string, { keys: string[]; dataLabel: string }> = {
  infiltration:         { keys: ["r_mat"],              dataLabel: "construction materials" },
  construction_package: { keys: ["r_mat", "r_matlist"], dataLabel: "construction quality" },
  heating_setpoint:     { keys: ["r_ht"],               dataLabel: "heating system type" },
  floors_total:         { keys: ["r_flrs"],             dataLabel: "number of floors" },
  footprint_length:     { keys: ["r_fp"],               dataLabel: "building footprint" },
  window_ratio:         { keys: ["r_mat"],              dataLabel: "window / facade properties" },
};

/* ─────────────────────────────────────────────
   Shared collapsible section card
───────────────────────────────────────────── */
function SectionCard({
  icon, title, subtitle, open, onToggle, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
          <div>
            <span className="font-bold text-sm text-slate-800">{title}</span>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          </div>
        </div>
        {open
          ? <ChevronUp   className="w-4 h-4 text-slate-400 flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 px-5 py-5">
          {children}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main component
───────────────────────────────────────────── */
export default function DataAssumptions() {
  const navigate = useNavigate();
  const { project } = useWizardStore();

  const [openSec, setOpenSec] = useState<Set<string>>(
    () => new Set(["confidence", "sensitivity", "eubucco", "data"])
  );
  const [openDb, setOpenDb] = useState<Set<string>>(new Set());

  const toggleSec = (id: string) =>
    setOpenSec(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleDb = (id: string) =>
    setOpenDb(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  /* ── Step 2 summary from store ── */
  const entries = Object.entries(project.dataInputs);
  const avail   = entries.filter(([, v]) =>  v.available).length;
  const estim   = entries.filter(([, v]) => !v.available && v.confidence > 0).length;
  const miss    = entries.filter(([, v]) => !v.available && v.confidence === 0).length;
  const total   = entries.length;
  const hasStep2 = total > 0;

  /* ── Fallback database breakdown ── */
  const dbBreakdown = useMemo(() => {
    const groups: Record<string, number> = {};
    entries.forEach(([, v]) => {
      if (!v.available) {
        const src = normaliseSource(v.proxy);
        groups[src] = (groups[src] ?? 0) + 1;
      }
    });
    const gapTotal = Object.values(groups).reduce((a, b) => a + b, 0);
    return Object.entries(groups)
      .sort((a, b) => b[1] - a[1])
      .map(([src, count]) => ({
        src, count,
        pct: gapTotal ? Math.round((count / gapTotal) * 100) : 0,
        dot:  SOURCE_DOT[src]  ?? "bg-gray-400",
        text: SOURCE_TEXT[src] ?? "text-gray-600",
      }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.dataInputs]);

  /* ── Context flags ── */
  const isRenovation = project.projectType === "Renovation Planning";
  const isEC         = project.projectType === "Energy Community Planning";
  const isRE         = project.projectType === "Renewable Energy Planning";
  const sys          = new Set(project.systemsInScope);
  const hasPV        = sys.has("Rooftop PV") || sys.has("Facade PV") || sys.has("Community PV");
  const hasBuildings = sys.has("Buildings") ||
    sys.has("Building Envelope (Windows, Roof, Walls, Floors)") ||
    sys.has("Heating System") || isRenovation;

  /* ── SA cross-reference (Renovation only) ── */
  const saRanking = useMemo(
    () => (isRenovation ? getImportanceRanking().slice(0, 6) : []),
    [isRenovation]
  );
  const crossRefs = useMemo(() => {
    if (!isRenovation || !hasStep2) return [];
    return saRanking
      .map(r => {
        const bridge = SA_BRIDGE[r.key];
        if (!bridge) return null;
        const isGap = bridge.keys.some(k => {
          const item = project.dataInputs[k];
          return item && !item.available;
        });
        return isGap ? { label: r.label, dataLabel: bridge.dataLabel, pct: r.pct } : null;
      })
      .filter((x): x is { label: string; dataLabel: string; pct: number } => x !== null);
  }, [isRenovation, hasStep2, saRanking, project.dataInputs]);

  /* ── Overall confidence % ── */
  const confPct = total > 0
    ? Math.round(((avail + estim * 0.5) / total) * 100)
    : 0;

  /* ─────────────────────────────────────────────
     Reference DB card definitions (context-filtered)
  ───────────────────────────────────────────── */
  interface DbCard {
    id: string;
    icon: React.ReactNode;
    iconBg: string;
    title: string;
    subtitle: string;
    badge: string;
    badgeColor: string;
    relevance: string;
    panel: React.ReactNode;
  }

  const dbCards: DbCard[] = [
    ...(isRenovation || (isEC && hasBuildings) ? [{
      id: "tabula",
      icon: <Layers className="w-5 h-5 text-emerald-600" />,
      iconBg: "bg-emerald-50",
      title: "TABULA Archetypes",
      subtitle: "U-values · infiltration rates · archetypes by construction year",
      badge: "EU reference",
      badgeColor: "bg-emerald-50 border-emerald-200 text-emerald-700",
      relevance: isRenovation
        ? "Fills gaps for envelope U-values, construction quality, and infiltration when measured data is unavailable"
        : "Provides default thermal properties for community building archetypes",
      panel: <TabulaPanel />,
    }] : []),
    ...(isRenovation || isEC ? [{
      id: "epc",
      icon: <FileText className="w-5 h-5 text-amber-600" />,
      iconBg: "bg-amber-50",
      title: "EPC Register",
      subtitle: "Energy class · kWh/m² · heating system prevalence",
      badge: "National register",
      badgeColor: "bg-amber-50 border-amber-200 text-amber-700",
      relevance: isRenovation
        ? "Used for heating system type fallbacks, annual energy demand estimates, and construction year benchmarks"
        : "Provides building energy demand baselines and heating system distribution across the community",
      panel: <EpcPanel />,
    }] : []),
    ...(hasPV || isRE ? [{
      id: "pvgis",
      icon: <Zap className="w-5 h-5 text-yellow-600" />,
      iconBg: "bg-yellow-50",
      title: "PVGIS / Climate Data",
      subtitle: "GHI · DNI · DHI · T_amb · wind speed",
      badge: "EC / SMHI",
      badgeColor: "bg-yellow-50 border-yellow-200 text-yellow-700",
      relevance: "Provides hourly solar irradiance and climate time series for PV yield calculations and load profile generation",
      panel: (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-800">PVGIS 5.3 – Typical Meteorological Year</p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
            {[
              ["Resolution",   "Hourly (8 760 values/year)"],
              ["Irradiance",   "GHI · DNI · DHI"],
              ["Climate vars", "T_amb · wind speed · humidity"],
              ["Coverage",     "Europe + Africa + Asia"],
              ["Data period",  "2005–2020 (reanalysis)"],
              ["Validation",   "Satellite-corrected · High confidence"],
            ].map(([label, value]) => (
              <div key={label}>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
                <span className="text-xs font-medium text-slate-700">{value}</span>
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800">
            <strong>Key sensitivity:</strong> ±10% irradiance uncertainty → ±9–11% annual PV yield.
            Irradiance quality is the single largest driver of PV model uncertainty.
          </div>
        </div>
      ),
    }] : []),
    ...(isEC ? [{
      id: "nordpool",
      icon: <TrendingUp className="w-5 h-5 text-sky-600" />,
      iconBg: "bg-sky-50",
      title: "Nordpool Spot Prices",
      subtitle: "Hourly electricity price profiles · SE1–SE4",
      badge: "Market data",
      badgeColor: "bg-sky-50 border-sky-200 text-sky-700",
      relevance: "Historical price time series for computing ToU tariff profiles and economic performance of batteries, EV charging, and flexibility assets",
      panel: (
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-800">Nordpool Historical Day-Ahead Prices</p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
            {[
              ["Bidding zones", "SE1 · SE2 · SE3 · SE4"],
              ["Resolution",    "Hourly"],
              ["Period",        "2015 – present"],
              ["Currency",      "EUR/MWh"],
              ["Confidence",    "Medium — historical ≠ future"],
              ["Usage",         "ToU profiles · battery dispatch · NPV"],
            ].map(([label, value]) => (
              <div key={label}>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
                <span className="text-xs font-medium text-slate-700">{value}</span>
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-sky-50 border border-sky-200 px-3 py-2 text-xs text-sky-800">
            <strong>Note:</strong> Price volatility is high. Scenario analysis with low/mid/high
            price trajectories is recommended for economic assessments.
          </div>
        </div>
      ),
    }] : []),
  ];

  /* ─────────────────────────────────────────────
     Render
  ───────────────────────────────────────────── */
  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-navy">Step 3 – Model Review</h2>
        <p className="text-sm text-slate-500 mt-1">
          Review your model confidence profile, understand how data gaps translate to output
          uncertainty, and explore the reference datasets that fill them.
        </p>
      </div>

      {/* Context chips */}
      <div className="flex flex-wrap gap-2">
        {project.projectType && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-navy/10 text-navy text-xs font-semibold">
            <Layers className="w-3 h-3" /> {project.projectType}
          </span>
        )}
        {project.scale && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-lime/10 text-olive text-xs font-semibold">
            {project.scale} scale
          </span>
        )}
      </div>

      {/* 3D Building Explorer */}
      <BuildingMapPanel />

      {/* ══════════════════════════════════════════
          SECTION 1 – Confidence & Data Gaps
      ══════════════════════════════════════════ */}
      <SectionCard
        icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
        title="Confidence & Data Gaps"
        subtitle="Live summary derived from your Step 2 selections"
        open={openSec.has("confidence")}
        onToggle={() => toggleSec("confidence")}
      >
        {!hasStep2 ? (
          <div className="flex items-start gap-3 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3.5 text-sm text-blue-800">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Complete <strong>Step 2 – Data Requirements</strong> to see your personalised
              confidence profile and database breakdown here.
            </span>
          </div>
        ) : (
          <div className="space-y-6">

            {/* Coverage bar */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">Overall Model Confidence</span>
                <span className="text-xl font-bold text-navy">{confPct}%</span>
              </div>
              <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden flex">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(avail / total) * 100}%` }} />
                <div className="h-full bg-amber-400  transition-all" style={{ width: `${(estim / total) * 100}%` }} />
                <div className="h-full bg-red-400    transition-all" style={{ width: `${(miss  / total) * 100}%` }} />
              </div>
              <div className="flex flex-wrap gap-5 text-xs">
                {[
                  { dot: "bg-emerald-500", label: "Provided by user",        count: avail, icon: <CheckCircle2 className="w-3 h-3 text-emerald-500" /> },
                  { dot: "bg-amber-400",   label: "Estimated from database", count: estim, icon: <AlertTriangle className="w-3 h-3 text-amber-500" /> },
                  { dot: "bg-red-400",     label: "Missing / needs input",   count: miss,  icon: <XCircle className="w-3 h-3 text-red-500" /> },
                ].map(({ label, count, icon }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    {icon}
                    <span className="text-slate-500">{label}</span>
                    <span className="font-bold text-slate-700 tabular-nums">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Fallback database breakdown */}
            {dbBreakdown.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                  Fallback databases filling your gaps
                </p>
                <div className="space-y-2.5">
                  {dbBreakdown.map(({ src, count, pct, dot, text }) => (
                    <div key={src} className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`} />
                      <span className={`text-xs font-medium w-52 flex-shrink-0 ${text}`}>{src}</span>
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${dot}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-slate-400 tabular-nums w-16 text-right">
                        {count} param{count !== 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-3">
                  Expand a dataset in Section 3 below to inspect what it contains and how
                  confident you can be in the estimates.
                </p>
              </div>
            )}

            {/* SA cross-reference callout (Renovation only) */}
            {isRenovation && crossRefs.length > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3.5 space-y-2.5">
                <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  High-sensitivity parameters currently estimated
                </p>
                <div className="space-y-1.5">
                  {crossRefs.map(r => (
                    <div key={r.label} className="flex items-start gap-2 text-xs text-amber-700">
                      <ArrowRight className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>
                        <strong>{r.label}</strong> (drives ~{r.pct.toFixed(0)}% of output
                        variance) — currently using estimated <em>{r.dataLabel}</em>
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-amber-600 border-t border-amber-200 pt-2">
                  Providing measured values for these parameters will have the greatest impact
                  on model accuracy. See the full sensitivity breakdown in Section 2 below.
                </p>
              </div>
            )}

          </div>
        )}
      </SectionCard>

      {/* ══════════════════════════════════════════
          SECTION 2 – Sensitivity Analysis
      ══════════════════════════════════════════ */}
      <SectionCard
        icon={<Activity className="w-5 h-5 text-indigo-600" />}
        title="Sensitivity Analysis"
        subtitle={
          isRenovation
            ? "Parameter importance rankings for your heating demand model"
            : "Key uncertainty drivers for your project type"
        }
        open={openSec.has("sensitivity")}
        onToggle={() => toggleSec("sensitivity")}
      >
        {isRenovation ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-3 text-xs text-indigo-800">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>
                Results from <strong>One-At-a-Time (OAT)</strong> analysis on a Swedish
                multi-family building archetype. Click any bar to drill into the full
                response curve for that parameter.
              </span>
            </div>
            <SensitivityPanel />
          </div>
        ) : (isEC || isRE) ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Top uncertainty drivers — {project.projectType}
            </p>
            <div className="space-y-2">
              {(isEC ? [
                { driver: "Solar irradiance (GHI)",        impact: "±10% irradiance → ±9–11% annual PV yield",                  risk: "Medium" },
                { driver: "Building electricity demand",   impact: "Load profile uncertainty → ±15–25% self-consumption ratio", risk: "High" },
                { driver: "Battery round-trip efficiency", impact: "±5% efficiency → ±3–4% energy cost saving",                 risk: "Low" },
                { driver: "Grid tariff structure",         impact: "ToU vs flat → up to ±30% economic performance difference",  risk: "High" },
                { driver: "EV charging behaviour",         impact: "Session timing → ±20% peak demand prediction",              risk: "Medium" },
              ] : [
                { driver: "Solar irradiance (GHI)",           impact: "±10% irradiance → ±9–11% annual energy yield",          risk: "Medium" },
                { driver: "Module degradation rate",          impact: "0.5% vs 0.8%/year → ±5% lifetime yield difference",     risk: "Low" },
                { driver: "System losses (shading / wiring)", impact: "±3% losses → ±3% annual output",                        risk: "Low" },
                { driver: "Electricity demand timing",        impact: "Load profile timing → ±10–20% self-consumption ratio",   risk: "High" },
                { driver: "Roof / site geometry",             impact: "Tilt ±15° → ±5–8% yield; orientation ±30° → ±4–7%",    risk: "Medium" },
              ]).map(({ driver, impact, risk }) => {
                const rc = risk === "High"   ? "text-red-700   bg-red-50   border-red-200"
                         : risk === "Medium" ? "text-amber-700 bg-amber-50 border-amber-200"
                         :                    "text-emerald-700 bg-emerald-50 border-emerald-200";
                return (
                  <div key={driver} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border mt-0.5 ${rc}`}>
                      {risk}
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">{driver}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{impact}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Full quantitative sensitivity analysis (Sobol indices) will be generated when
              your simulation runs.
            </p>
          </div>
        ) : (
          <div className="text-sm text-slate-400 text-center py-6 italic">
            Select a project type in Step 1 to see relevant sensitivity drivers.
          </div>
        )}
      </SectionCard>

      {/* ══════════════════════════════════════════
          SECTION 2b – EUBUCCO Building Data Validation
      ══════════════════════════════════════════ */}
      <SectionCard
        icon={<MapPin className="w-5 h-5 text-violet-600" />}
        title="EUBUCCO Building Data — Validation vs EPC"
        subtitle="Cross-check: floors accuracy for 90 198 buildings in Gothenburg (SE23)"
        open={openSec.has("eubucco")}
        onToggle={() => toggleSec("eubucco")}
      >
        <EubuccoValidationPanel />
      </SectionCard>

      {/* ══════════════════════════════════════════
          SECTION 3 – Reference Data Explorer
      ══════════════════════════════════════════ */}
      <SectionCard
        icon={<Database className="w-5 h-5 text-navy" />}
        title="Reference Data Explorer"
        subtitle="Context-filtered datasets — only those relevant to your project and systems"
        open={openSec.has("data")}
        onToggle={() => toggleSec("data")}
      >
        {dbCards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-400 text-sm">
            No reference datasets configured for this project type.
            <br />
            <span className="text-xs mt-1 block">Return to Step 1 and select a project type and systems.</span>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Expand each dataset to inspect what it contains, how it&apos;s used in your model,
              and what confidence level it provides.
            </p>
            {dbCards.map(card => (
              <div key={card.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <button
                  onClick={() => toggleDb(card.id)}
                  className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl ${card.iconBg} flex items-center justify-center flex-shrink-0`}>
                      {card.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-slate-800">{card.title}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${card.badgeColor}`}>
                          {card.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{card.subtitle}</p>
                    </div>
                  </div>
                  {openDb.has(card.id)
                    ? <ChevronUp   className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                </button>
                {openDb.has(card.id) && (
                  <div className="border-t border-slate-100 px-4 py-4 space-y-4">
                    <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
                      <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                      <span><strong>Why it&apos;s relevant: </strong>{card.relevance}</span>
                    </div>
                    {card.panel}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Navigation */}
      <div className="flex justify-between pt-4 pb-8">
        <button
          onClick={() => navigate("/step/2")}
          className="px-5 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50"
        >
          &#x2190; Back
        </button>
        <button
          onClick={() => navigate("/step/4")}
          className="ppg-btn-primary px-6 py-2"
        >
          Renovation Packages &#x2192;
        </button>
      </div>
    </div>
  );
}