import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import {
  ChevronDown, ChevronUp, MapPin,
  CheckCircle2, AlertTriangle, XCircle,
  Database, Layers,
} from "lucide-react";

/* ── Types ── */
interface DataItem {
  key: string;
  label: string;
  source: string;
  status: "Available" | "Estimated" | "Missing";
  proxy_options?: string[];
}
interface DataCategory {
  category: string;
  items: DataItem[];
}

/* ── Status config ── */
const STATUS_CFG = {
  Available: {
    borderL:       "border-l-emerald-400",
    dot:           "bg-emerald-500",
    pillBg:        "bg-emerald-50",
    pillBorder:    "border-emerald-200",
    pillText:      "text-emerald-700",
    panelBg:       "bg-emerald-50/60",
    panelBorder:   "border-emerald-200",
    calloutBg:     "bg-emerald-100",
    calloutBorder: "border-emerald-200",
    calloutText:   "text-emerald-800",
    Icon:          CheckCircle2,
    iconColor:     "text-emerald-500",
    desc:          "Value confirmed from source. No action required.",
  },
  Estimated: {
    borderL:       "border-l-amber-400",
    dot:           "bg-amber-400",
    pillBg:        "bg-amber-50",
    pillBorder:    "border-amber-200",
    pillText:      "text-amber-700",
    panelBg:       "bg-amber-50/60",
    panelBorder:   "border-amber-200",
    calloutBg:     "bg-amber-100",
    calloutBorder: "border-amber-200",
    calloutText:   "text-amber-800",
    Icon:          AlertTriangle,
    iconColor:     "text-amber-500",
    desc:          "Auto-estimated from a secondary source. Review before proceeding.",
  },
  Missing: {
    borderL:       "border-l-red-400",
    dot:           "bg-red-500",
    pillBg:        "bg-red-50",
    pillBorder:    "border-red-200",
    pillText:      "text-red-700",
    panelBg:       "bg-red-50/60",
    panelBorder:   "border-red-200",
    calloutBg:     "bg-red-100",
    calloutBorder: "border-red-200",
    calloutText:   "text-red-800",
    Icon:          XCircle,
    iconColor:     "text-red-500",
    desc:          "No data found. You will be prompted to enter this value manually.",
  },
} as const;

/* ── Confidence from source ── */
function confidenceFromSource(source: string): { label: string; pct: number; color: string } {
  const s = source.toLowerCase();
  if (s.includes("epc") || s.includes("utility") || s.includes("certificate") || s.includes("datasheet"))
    return { label: "High",   pct: 88, color: "#16a34a" };
  if (s.includes("tabula") || s.includes("boverket") || s.includes("pvgis") || s.includes("smhi") || s.includes("gis") || s.includes("drawing"))
    return { label: "Medium", pct: 58, color: "#d97706" };
  if (s.includes("estimate") || s.includes("synthetic") || s.includes("3d model") || s.includes("survey"))
    return { label: "Low",    pct: 28, color: "#dc2626" };
  return { label: "Medium", pct: 55, color: "#d97706" };
}

/* ── Filter tabs ── */
type FilterId = "All" | "Available" | "Estimated" | "Missing";
const FILTER_OPTS: { id: FilterId; dot: string | null }[] = [
  { id: "All",       dot: null },
  { id: "Available", dot: "bg-emerald-500" },
  { id: "Estimated", dot: "bg-amber-400"   },
  { id: "Missing",   dot: "bg-red-500"     },
];

/* ── Single coverage row ── */
function CoverageRow({ item }: { item: DataItem }) {
  const [expanded, setExpanded] = useState(false);
  const sc   = STATUS_CFG[item.status];
  const conf = confidenceFromSource(item.source);

  return (
    <div className={`border-l-4 ${sc.borderL} transition-colors`}>
      {/* Collapsed row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left px-4 py-3 hover:bg-slate-50/80 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          {/* Label + source */}
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-semibold text-slate-800 truncate">{item.label}</span>
            <div className="flex items-center gap-1">
              <Database className="w-3 h-3 text-slate-300 flex-shrink-0" />
              <span className="text-xs text-slate-400 truncate">{item.source}</span>
            </div>
          </div>

          {/* Right: status pill + action tag + chevron */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${sc.pillBg} ${sc.pillBorder} ${sc.pillText}`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sc.dot}`} />
              {item.status}
            </span>
            {item.status === "Missing" && (
              <span className="hidden sm:inline-flex items-center px-2 py-1 rounded-md bg-red-50 border border-red-200 text-red-600 text-xs font-medium">
                Action needed
              </span>
            )}
            {item.status === "Estimated" && (
              <span className="hidden sm:inline-flex items-center px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
                Review
              </span>
            )}
            {expanded
              ? <ChevronUp   className="w-3.5 h-3.5 text-slate-400 ml-1" />
              : <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />}
          </div>
        </div>
      </button>

      {/* Expanded detail panel */}
      {expanded && (
        <div className={`mx-4 mb-3 rounded-xl border ${sc.panelBorder} ${sc.panelBg} p-4 space-y-3`}>

          {/* Source chip + Confidence bar */}
          <div className="flex flex-wrap items-start gap-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Source</p>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-xs font-medium text-slate-700 shadow-sm">
                <Database className="w-3 h-3 text-slate-400" />
                {item.source}
              </span>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Data Confidence</p>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${conf.pct}%`, background: conf.color }}
                  />
                </div>
                <span className="text-xs font-bold" style={{ color: conf.color }}>{conf.label}</span>
              </div>
            </div>
          </div>

          {/* Proxy options */}
          {(item.proxy_options?.length ?? 0) > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Proxy options if primary data is unavailable
              </p>
              <div className="flex flex-wrap gap-1.5">
                {item.proxy_options!.map(opt => (
                  <span
                    key={opt}
                    className="inline-flex items-center gap-1.5 text-xs bg-white border border-slate-200 text-slate-600 px-2.5 py-1 rounded-full shadow-sm"
                  >
                    <Layers className="w-3 h-3 text-slate-400" />
                    {opt}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Status callout */}
          <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${sc.calloutBg} ${sc.calloutBorder}`}>
            <sc.Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${sc.iconColor}`} />
            <p className={`text-xs font-medium leading-relaxed ${sc.calloutText}`}>{sc.desc}</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Data input definitions ── */
function buildDataInputs(projectType: string | null, systems: string[]): DataCategory[] {
  if (!projectType) return [];
  const sysSet = new Set(systems);

  if (projectType === "Renovation Planning") {
    const cats: DataCategory[] = [
      {
        category: "Building Identity",
        items: [
          { key: "reno_address",       label: "Building address",                     source: "Project brief",       status: "Available" },
          { key: "reno_build_year",    label: "Construction year",                    source: "EPC / land registry", status: "Estimated" },
          { key: "reno_building_type", label: "Building type",                        source: "EPC",                 status: "Available" },
        ],
      },
      {
        category: "Energy Performance",
        items: [
          { key: "reno_epc_class",      label: "Energy performance class (A\u2013G)", source: "EPC certificate",     status: "Available" },
          { key: "reno_energy_demand",  label: "Annual energy demand (kWh/m\u00B2)",  source: "EPC / utility bills", status: "Estimated" },
          { key: "reno_heating_demand", label: "Heating energy demand",               source: "EPC",                 status: "Estimated" },
        ],
      },
    ];

    if (sysSet.has("Building Envelope (Windows, Roof, Walls, Floors)")) {
      cats.push({
        category: "Building Envelope",
        items: [
          { key: "reno_u_walls",   label: "U-value \u2013 Walls",   source: "Building survey", status: "Missing",
            proxy_options: ["TABULA archetype", "ISO 6946 default"] },
          { key: "reno_u_roof",    label: "U-value \u2013 Roof",    source: "Building survey", status: "Missing",
            proxy_options: ["TABULA archetype", "Building regulations"] },
          { key: "reno_u_windows", label: "U-value \u2013 Windows", source: "Building survey", status: "Missing",
            proxy_options: ["Manufacturer datasheet", "TABULA archetype"] },
          { key: "reno_u_floor",   label: "U-value \u2013 Floor",   source: "Building survey", status: "Missing",
            proxy_options: ["TABULA archetype"] },
        ],
      });
    }

    cats.push({
      category: "Geometry & Areas",
      items: [
        { key: "reno_atemp",      label: "Heated floor area (Atemp)", source: "EPC / drawings", status: "Available" },
        { key: "reno_footprint",  label: "Building footprint",         source: "Drawings / GIS", status: "Estimated",
          proxy_options: ["Aerial imagery", "Cadastral map"] },
        { key: "reno_num_floors", label: "Number of floors",           source: "Drawings",       status: "Available" },
      ],
    });

    const sysItems: DataItem[] = [];
    if (sysSet.has("Heating System"))
      sysItems.push({ key: "reno_heating_type", label: "Heating system type", source: "Building survey", status: "Available" });
    if (sysSet.has("Cooling System"))
      sysItems.push({ key: "reno_cooling_type", label: "Cooling system type", source: "Building survey", status: "Missing",
        proxy_options: ["Energy audit", "Building permit records"] });
    if (sysSet.has("Domestic Hot Water System (DHW)"))
      sysItems.push({ key: "reno_dhw_type", label: "DHW system type", source: "Building survey", status: "Estimated" });
    if (sysItems.length) cats.push({ category: "Systems", items: sysItems });

    return cats;
  }

  if (projectType === "Energy Community Planning") {
    const cats: DataCategory[] = [
      {
        category: "Building Geometry",
        items: [
          { key: "ec_footprint",   label: "Building footprint dimensions", source: "Architectural drawing", status: "Available" },
          { key: "ec_height",      label: "Building height",               source: "Architectural drawing", status: "Available" },
          { key: "ec_orientation", label: "Building orientation",          source: "Site plan / GIS",       status: "Estimated",
            proxy_options: ["Google Maps", "Cadastral GIS"] },
        ],
      },
      {
        category: "Energy Demand",
        items: [
          { key: "ec_elec_demand", label: "Annual electricity consumption", source: "Utility bills",       status: "Available" },
          { key: "ec_heat_demand", label: "Annual heating demand",          source: "Utility bills / EPC", status: "Estimated",
            proxy_options: ["EPC certificate", "TABULA archetype"] },
        ],
      },
    ];

    if (sysSet.has("Rooftop PV") || sysSet.has("Community PV") || sysSet.has("Facade PV (BIPV)")) {
      cats.push({
        category: "PV System",
        items: [
          { key: "ec_pv_capacity", label: "PV installed capacity (kWp)",        source: "System specs",  status: "Available" },
          { key: "ec_pv_azimuth",  label: "PV azimuth & tilt",                  source: "Site plan",     status: "Estimated",
            proxy_options: ["Aerial photo", "Compass measurement"] },
          { key: "ec_irradiance",  label: "Global horizontal irradiance (GHI)", source: "PVGIS / SMHI",  status: "Available" },
        ],
      });
    }

    if (sysSet.has("Battery System")) {
      cats.push({
        category: "Battery System",
        items: [
          { key: "ec_bat_capacity", label: "Battery capacity (kWh)",    source: "System specs", status: "Available" },
          { key: "ec_bat_power",    label: "Max charge/discharge (kW)", source: "System specs", status: "Available" },
        ],
      });
    }

    return cats;
  }

  if (projectType === "Renewable Energy Planning") {
    return [
      {
        category: "Site & Climate",
        items: [
          { key: "re_irradiance",  label: "Global horizontal irradiance (GHI)", source: "PVGIS / SMHI",           status: "Available" },
          { key: "re_temperature", label: "Ambient temperature profile",         source: "SMHI / Meteonorm",       status: "Available" },
          { key: "re_shading",     label: "Shading analysis",                    source: "3D model / site survey", status: "Missing",
            proxy_options: ["PVGIS horizon tool", "SunEye measurement", "Lidar scan"] },
        ],
      },
      {
        category: "PV System Design",
        items: [
          { key: "re_pv_capacity", label: "Planned PV capacity (kWp)", source: "System design",          status: "Available" },
          { key: "re_pv_module",   label: "Module specifications",      source: "Manufacturer datasheet", status: "Estimated",
            proxy_options: ["PVLib defaults", "Manufacturer spec sheet"] },
          { key: "re_pv_tilt",     label: "Tilt & azimuth angles",     source: "Site plan",              status: "Available" },
        ],
      },
      {
        category: "Load & Grid",
        items: [
          { key: "re_load_profile", label: "Hourly load profile",   source: "Smart meter / utility", status: "Missing",
            proxy_options: ["BDEW load profile", "SLP standard profile", "IEA synthetic profile"] },
          { key: "re_grid_tariff",  label: "Grid tariff structure", source: "Utility contract",      status: "Available" },
        ],
      },
    ];
  }

  return [];
}

/* ════════════════════════════════════════════════════════════════════ */

export default function DataCoverage() {
  const navigate = useNavigate();
  const { project, setProject } = useWizardStore();

  const dataInputs = useMemo(
    () => buildDataInputs(project.projectType, project.systemsInScope),
    [project.projectType, project.systemsInScope]
  );

  const [activeFilter, setActiveFilter] = useState<FilterId>("All");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(
    () => new Set(dataInputs.map(c => c.category))
  );

  useEffect(() => {
    setExpandedCats(new Set(dataInputs.map(c => c.category)));
  }, [dataInputs]);

  const toggleCat = (cat: string) =>
    setExpandedCats(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });

  const allItems       = dataInputs.flatMap(c => c.items);
  const availableCount = allItems.filter(i => i.status === "Available").length;
  const estimatedCount = allItems.filter(i => i.status === "Estimated").length;
  const missingCount   = allItems.filter(i => i.status === "Missing").length;
  const totalCount     = allItems.length;
  const confPct        = totalCount
    ? Math.round(((availableCount + estimatedCount * 0.5) / totalCount) * 100)
    : 0;

  const isReno = project.projectType === "Renovation Planning";

  const filtered = (items: DataItem[]) =>
    activeFilter === "All" ? items : items.filter(i => i.status === activeFilter);

  useEffect(() => {
    setProject({ dataCoveragePct: confPct } as never);
  }, [confPct, setProject]);

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-navy">Step 2 &ndash; Data Coverage</h2>
        <p className="text-sm text-slate-500 mt-1">
          Review what data is available for your project before proceeding to analysis.
        </p>
      </div>

      {/* Context chips */}
      <div className="flex flex-wrap gap-2">
        {project.projectType && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-navy/10 text-navy text-xs font-semibold">
            <Layers className="w-3 h-3" /> {project.projectType}
          </span>
        )}
        {project.systemsInScope.length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-lime/10 text-olive text-xs font-semibold">
            <Database className="w-3 h-3" /> {project.systemsInScope.length} system{project.systemsInScope.length !== 1 ? "s" : ""}
          </span>
        )}
        {project.country && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">
            <MapPin className="w-3 h-3" /> {project.country}
          </span>
        )}
      </div>

      {/* Coverage summary with stacked bar */}
      {totalCount > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Overall Data Coverage</span>
            <span className="text-xl font-bold text-navy">{confPct}%</span>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${(availableCount / totalCount) * 100}%` }}
            />
            <div
              className="h-full bg-amber-400 transition-all"
              style={{ width: `${(estimatedCount / totalCount) * 100}%` }}
            />
            <div
              className="h-full bg-red-400 transition-all"
              style={{ width: `${(missingCount / totalCount) * 100}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            {[
              { dot: "bg-emerald-500", label: "Available", count: availableCount },
              { dot: "bg-amber-400",   label: "Estimated", count: estimatedCount },
              { dot: "bg-red-400",     label: "Missing",   count: missingCount   },
            ].map(({ dot, label, count }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
                <span className="text-xs text-slate-500">{label}</span>
                <span className="text-xs font-bold text-slate-700">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {FILTER_OPTS.map(({ id, dot }) => {
          const count = id === "All" ? totalCount
            : allItems.filter(i => i.status === id).length;
          return (
            <button
              key={id}
              onClick={() => setActiveFilter(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeFilter === id
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {dot && <span className={`w-2 h-2 rounded-full ${dot}`} />}
              {id}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                activeFilter === id ? "bg-slate-100 text-slate-600" : "text-slate-400"
              }`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Category groups */}
      <div className="space-y-4">
        {dataInputs.map(cat => {
          const visibleItems = filtered(cat.items);
          if (activeFilter !== "All" && visibleItems.length === 0) return null;
          const expanded = expandedCats.has(cat.category);
          const counts = {
            available: cat.items.filter(i => i.status === "Available").length,
            estimated: cat.items.filter(i => i.status === "Estimated").length,
            missing:   cat.items.filter(i => i.status === "Missing").length,
          };
          return (
            <div key={cat.category} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
              {/* Category header */}
              <button
                onClick={() => toggleCat(cat.category)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="font-bold text-sm text-slate-800">{cat.category}</span>
                  <div className="flex items-center gap-1.5">
                    {counts.available > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />{counts.available}
                      </span>
                    )}
                    {counts.estimated > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{counts.estimated}
                      </span>
                    )}
                    {counts.missing > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />{counts.missing}
                      </span>
                    )}
                  </div>
                </div>
                {expanded
                  ? <ChevronUp   className="w-4 h-4 text-slate-400" />
                  : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>

              {/* Row list */}
              {expanded && (
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {visibleItems.map(item => (
                    <CoverageRow key={item.key} item={item} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {totalCount === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
          No data inputs configured for the selected project type and systems.
        </div>
      )}

      {/* EPC & TABULA info box (renovation only) */}
      {isReno && (
        <div className="bg-lime/10 border border-lime/30 rounded-2xl p-5 space-y-3">
          <p className="text-sm font-bold text-olive">About the data sources used</p>
          <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
            <p>
              <span className="font-semibold text-slate-700">EPC (Energy Performance Certificate)</span>
              {" "}&ndash; official document issued by a certified energy assessor. Contains energy class (A&ndash;G),
              annual energy demand, U-values, and installed system information.
            </p>
            <p>
              <span className="font-semibold text-slate-700">TABULA</span>
              {" "}&ndash; Pan-European residential building typology database. Used as a proxy when
              measured data is unavailable; values reflect archetype averages for your building age and type.
            </p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4 pb-8">
        <button
          onClick={() => navigate("/step/1")}
          className="px-5 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50"
        >
          &#x2190; Back
        </button>
        <button
          onClick={() => navigate("/step/3")}
          className="ppg-btn-primary px-6 py-2"
        >
          Continue &#x2192;
        </button>
      </div>
    </div>
  );
}
