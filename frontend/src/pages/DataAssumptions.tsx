import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import {
  BarChart2, Database, FileText, ChevronDown, ChevronUp,
  ExternalLink, TrendingUp, Layers, Zap,
} from "lucide-react";

/* ─────────────────────────────────────────────
   Reference dataset card definitions
───────────────────────────────────────────── */
interface RefCard {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  badgeColor: string;
  details: { label: string; value: string }[];
  cta: string;
}

const REF_CARDS: RefCard[] = [
  {
    id: "sensitivity",
    icon: <BarChart2 className="w-5 h-5 text-indigo-600" />,
    title: "Sensitivity Analysis",
    subtitle: "Parameter importance & response curves",
    description:
      "Understand which input parameters have the greatest impact on your results. Use one-at-a-time (OAT) and global sensitivity analysis to prioritise data collection effort.",
    badge: "Built-in dataset",
    badgeColor: "bg-indigo-50 border-indigo-200 text-indigo-700",
    details: [
      { label: "Method",    value: "OAT + Sobol global SA" },
      { label: "Coverage",  value: "Envelope · HVAC · Occupancy · Climate" },
      { label: "Outputs",   value: "S₁ index · total effect · tornado chart" },
      { label: "Source",    value: "Pre-computed from archetype models" },
    ],
    cta: "View sensitivity results",
  },
  {
    id: "tabula",
    icon: <Layers className="w-5 h-5 text-emerald-600" />,
    title: "TABULA Data",
    subtitle: "Building archetype U-values & energy",
    description:
      "Pan-European database of residential building archetypes. Provides default U-values, infiltration rates, and specific energy demands per construction period and building type — used when measured values are unavailable.",
    badge: "EU reference database",
    badgeColor: "bg-emerald-50 border-emerald-200 text-emerald-700",
    details: [
      { label: "Countries",     value: "20+ EU member states incl. Sweden" },
      { label: "Parameters",    value: "U-wall · U-roof · U-window · U-floor · ACH" },
      { label: "Period",        value: "Pre-1945 → 2010+" },
      { label: "Confidence",    value: "Medium — archetype represents typical, not actual" },
    ],
    cta: "Browse TABULA archetypes",
  },
  {
    id: "epc",
    icon: <FileText className="w-5 h-5 text-amber-600" />,
    title: "EPC Data",
    subtitle: "Energy performance certificates & trends",
    description:
      "National EPC register provides declared energy demand per m², energy class distribution, heating system prevalence, and renovation rates. Used to fill gaps when building-specific EPC is unavailable.",
    badge: "National register",
    badgeColor: "bg-amber-50 border-amber-200 text-amber-700",
    details: [
      { label: "Source",        value: "Boverket / national EPC register" },
      { label: "Parameters",    value: "Energy class · kWh/m²·year · heating system" },
      { label: "Coverage",      value: "Residential & non-residential (SE)" },
      { label: "Confidence",    value: "High for national average · Medium for local" },
    ],
    cta: "Explore EPC statistics",
  },
  {
    id: "boverket",
    icon: <Database className="w-5 h-5 text-rose-600" />,
    title: "Boverket Building Stock",
    subtitle: "Swedish national building statistics",
    description:
      "Boverket's building stock database covers construction year, building category, floor area, and installed systems across Sweden. Used for community-scale energy demand estimation and archetype matching.",
    badge: "SE national data",
    badgeColor: "bg-rose-50 border-rose-200 text-rose-700",
    details: [
      { label: "Source",        value: "Boverket · SCB building register" },
      { label: "Parameters",    value: "Construction year · area · system type · count" },
      { label: "Granularity",   value: "Municipality / district / building level" },
      { label: "Confidence",    value: "High for stock-level · Low for individual buildings" },
    ],
    cta: "View Boverket data",
  },
  {
    id: "pvgis",
    icon: <Zap className="w-5 h-5 text-yellow-600" />,
    title: "PVGIS / Climate Data",
    subtitle: "Solar irradiance, temperature & wind",
    description:
      "European Commission PVGIS provides hourly solar irradiance, ambient temperature, and wind speed time series. SMHI data supplements for Swedish locations. Feeds directly into PV yield and load profile calculations.",
    badge: "EC / SMHI dataset",
    badgeColor: "bg-yellow-50 border-yellow-200 text-yellow-700",
    details: [
      { label: "Source",        value: "PVGIS 5.3 · SMHI Open Data" },
      { label: "Parameters",    value: "GHI · DNI · DHI · T_amb · wind speed" },
      { label: "Resolution",    value: "Hourly (8,760 values/year)" },
      { label: "Confidence",    value: "High — reanalysis + satellite-validated" },
    ],
    cta: "Access climate data",
  },
  {
    id: "nordpool",
    icon: <TrendingUp className="w-5 h-5 text-sky-600" />,
    title: "Nordpool Spot Prices",
    subtitle: "Hourly electricity price profiles",
    description:
      "Historical Nordpool spot prices for SE1–SE4 bidding zones. Used to calculate time-of-use tariff profiles and economic performance of storage and flexibility assets.",
    badge: "Market data",
    badgeColor: "bg-sky-50 border-sky-200 text-sky-700",
    details: [
      { label: "Source",        value: "Nordpool historical day-ahead prices" },
      { label: "Zones",         value: "SE1 · SE2 · SE3 · SE4" },
      { label: "Resolution",    value: "Hourly · 2015–present" },
      { label: "Confidence",    value: "Medium — historical ≠ future prices" },
    ],
    cta: "View price data",
  },
];

/* ─────────────────────────────────────────────
   Component
───────────────────────────────────────────── */
export default function DataAssumptions() {
  const navigate = useNavigate();
  const { project } = useWizardStore();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-navy">Step 3 &ndash; Reference Data</h2>
        <p className="text-sm text-slate-500 mt-1">
          Explore the analysis databases and reference datasets that inform data gap decisions
          and estimated parameter values in your project.
        </p>
      </div>

      {/* Context chip */}
      {project.projectType && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-navy/10 text-navy text-xs font-semibold">
            <Layers className="w-3 h-3" /> {project.projectType}
          </span>
        </div>
      )}

      {/* Intro banner */}
      <div className="rounded-2xl bg-slate-50 border border-slate-200 px-5 py-4 text-sm text-slate-600 leading-relaxed">
        <span className="font-semibold text-slate-800">How these datasets are used: </span>
        When a parameter is marked <span className="font-semibold text-amber-700">Estimated</span> in Step 2,
        the value is drawn from one of the reference databases below rather than your project files.
        Click any card to see what data is available and how confident you can be in the estimate.
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 gap-4">
        {REF_CARDS.map(card => {
          const isOpen = expanded.has(card.id);
          return (
            <div key={card.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">

              {/* Card header — always visible */}
              <button
                onClick={() => toggle(card.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition text-left"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mt-0.5">
                    {card.icon}
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-slate-800">{card.title}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${card.badgeColor}`}>
                        {card.badge}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{card.subtitle}</p>
                  </div>
                </div>
                {isOpen
                  ? <ChevronUp   className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
              </button>

              {/* Expanded detail panel */}
              {isOpen && (
                <div className="border-t border-slate-100 px-5 py-4 space-y-4">
                  <p className="text-sm text-slate-600 leading-relaxed">{card.description}</p>

                  {/* Detail grid */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {card.details.map(({ label, value }) => (
                      <div key={label} className="flex flex-col">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
                        <span className="text-xs text-slate-700 font-medium mt-0.5">{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* CTA button */}
                  <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy border border-navy/30 bg-navy/5 hover:bg-navy/10 px-4 py-2 rounded-lg transition">
                    <ExternalLink className="w-3.5 h-3.5" />
                    {card.cta}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

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
          Continue &#x2192;
        </button>
      </div>
    </div>
  );
}
