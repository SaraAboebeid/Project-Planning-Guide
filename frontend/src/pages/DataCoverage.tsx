import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import { ChevronDown, ChevronUp, MapPin } from "lucide-react";

/* â”€â”€ Types â”€â”€ */
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

/* â”€â”€ Status / confidence / action config â”€â”€ */
const STATUS_CFG: Record<string, { color: string; bg: string; icon: string }> = {
  Available: { color: "#33A9A0", bg: "rgba(51,169,160,0.10)", icon: "\u2705" },
  Estimated: { color: "#F59E0B", bg: "rgba(245,158,11,0.10)",  icon: "\u26A0\uFE0F" },
  Missing:   { color: "#EF4444", bg: "rgba(239,68,68,0.10)",   icon: "\u274C" },
};
const CONF_CFG: Record<string, { color: string; bg: string }> = {
  High:   { color: "#33A9A0", bg: "rgba(51,169,160,0.10)" },
  Medium: { color: "#F59E0B", bg: "rgba(245,158,11,0.10)" },
  Low:    { color: "#EF4444", bg: "rgba(239,68,68,0.10)" },
  "\u2013":    { color: "#94a3b8", bg: "rgba(148,163,184,0.10)" },
};
const ACTION_CFG: Record<string, { color: string; bg: string }> = {
  None:         { color: "#64748b", bg: "rgba(100,116,139,0.08)" },
  Review:       { color: "#F59E0B", bg: "rgba(245,158,11,0.10)" },
  "User input": { color: "#EF4444", bg: "rgba(239,68,68,0.10)" },
};

function confidenceFromSource(source: string): "High" | "Medium" | "Low" | "\u2013" {
  if (source.includes("EPC")) return "High";
  if (source.includes("TABULA") || source.includes("Boverket")) return "Medium";
  if (source.includes("Synthetic") || source.includes("estimate")) return "Low";
  return "Medium";
}
function actionFromStatus(status: string): string {
  if (status === "Available") return "None";
  if (status === "Estimated") return "Review";
  return "User input";
}
function hintFromStatus(status: string, source: string): string {
  if (status === "Available") return `\u2713 Value confirmed from ${source}. No action required.`;
  if (status === "Estimated") return `\u2699\uFE0F Auto-estimated from ${source}. Review and adjust if you have better data.`;
  return "\uD83D\uDCDD This value is missing. You will be prompted to enter it manually in the next step.";
}

/* â”€â”€ Filter pills â”€â”€ */
const FILTER_OPTS = [
  { id: "All",              icon: "\uD83D\uDCCB" },
  { id: "Available",        icon: "\u2705" },
  { id: "Estimated",        icon: "\u26A0\uFE0F" },
  { id: "Missing",          icon: "\u274C" },
  { id: "Needs user input", icon: "\uD83D\uDCDD" },
] as const;
type FilterId = typeof FILTER_OPTS[number]["id"];

/* â”€â”€ Single row component â”€â”€ */
function CoverageRow({ item }: { item: DataItem }) {
  const [expanded, setExpanded] = useState(false);
  const conf   = confidenceFromSource(item.source);
  const action = actionFromStatus(item.status);
  const hint   = hintFromStatus(item.status, item.source);
  const sc = STATUS_CFG[item.status];
  const cc = CONF_CFG[conf];
  const ac = ACTION_CFG[action];

  return (
    <div className="border-b border-gray-50 last:border-b-0">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left px-4 py-2.5 hover:bg-gray-50/60 transition-colors"
      >
        <div className="grid items-center gap-2" style={{ gridTemplateColumns: "1fr 100px 110px 80px 110px" }}>
          <span className="text-sm font-medium text-slate-800 truncate">{item.label}</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ color: sc?.color, background: sc?.bg }}>
            {sc?.icon} {item.status}
          </span>
          <span className="text-xs text-slate-500 truncate">{item.source}</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ color: cc?.color, background: cc?.bg }}>
            {conf}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ color: ac?.color, background: ac?.bg }}>
            {action}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="px-5 pb-3">
          <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">{hint}</p>
          {(item.proxy_options?.length ?? 0) > 0 && (
            <p className="text-xs text-slate-400 mt-1 pl-1">Proxy options: {item.proxy_options!.join(" · ")}</p>
          )}
        </div>
      )}
    </div>
  );
}

/* â”€â”€ Inline data input definitions â”€â”€ */

function buildDataInputs(
  projectType: string | null,
  systems: string[]
): DataCategory[] {
  if (!projectType) return [];
  const sysSet = new Set(systems);

  if (projectType === "Renovation Planning") {
    const cats: DataCategory[] = [
      {
        category: "Building Identity",
        items: [
          { key: "reno_address",       label: "Building address",               source: "Project brief",        status: "Available" },
          { key: "reno_build_year",    label: "Construction year",               source: "EPC / land registry",  status: "Estimated" },
          { key: "reno_building_type", label: "Building type",                   source: "EPC",                  status: "Available" },
        ],
      },
      {
        category: "Energy Performance",
        items: [
          { key: "reno_epc_class",      label: "Energy performance class (A\u2013G)", source: "EPC certificate",      status: "Available" },
          { key: "reno_energy_demand",  label: "Annual energy demand (kWh/m\u00B2)",  source: "EPC / utility bills",  status: "Estimated" },
          { key: "reno_heating_demand", label: "Heating energy demand",          source: "EPC",                  status: "Estimated" },
        ],
      },
    ];

    if (sysSet.has("Building Envelope (Windows, Roof, Walls, Floors)")) {
      cats.push({
        category: "Building Envelope",
        items: [
          { key: "reno_u_walls",   label: "U-value \u2013 Walls",   source: "Building survey", status: "Missing" },
          { key: "reno_u_roof",    label: "U-value \u2013 Roof",    source: "Building survey", status: "Missing" },
          { key: "reno_u_windows", label: "U-value \u2013 Windows", source: "Building survey", status: "Missing" },
          { key: "reno_u_floor",   label: "U-value \u2013 Floor",   source: "Building survey", status: "Missing" },
        ],
      });
    }

    cats.push({
      category: "Geometry & Areas",
      items: [
        { key: "reno_atemp",      label: "Heated floor area (Atemp)", source: "EPC / drawings", status: "Available" },
        { key: "reno_footprint",  label: "Building footprint",         source: "Drawings / GIS", status: "Estimated" },
        { key: "reno_num_floors", label: "Number of floors",           source: "Drawings",       status: "Available" },
      ],
    });

    const sysItems: DataItem[] = [];
    if (sysSet.has("Heating System"))
      sysItems.push({ key: "reno_heating_type", label: "Heating system type", source: "Building survey", status: "Available" });
    if (sysSet.has("Cooling System"))
      sysItems.push({ key: "reno_cooling_type", label: "Cooling system type", source: "Building survey", status: "Missing" });
    if (sysSet.has("Domestic Hot Water System (DHW)"))
      sysItems.push({ key: "reno_dhw_type",     label: "DHW system type",     source: "Building survey", status: "Estimated" });
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
          { key: "ec_orientation", label: "Building orientation",          source: "Site plan / GIS",       status: "Estimated" },
        ],
      },
      {
        category: "Energy Demand",
        items: [
          { key: "ec_elec_demand", label: "Annual electricity consumption", source: "Utility bills",       status: "Available" },
          { key: "ec_heat_demand", label: "Annual heating demand",          source: "Utility bills / EPC", status: "Estimated" },
        ],
      },
    ];

    if (sysSet.has("Rooftop PV") || sysSet.has("Community PV") || sysSet.has("Facade PV (BIPV)")) {
      cats.push({
        category: "PV System",
        items: [
          { key: "ec_pv_capacity", label: "PV installed capacity (kWp)",        source: "System specs",  status: "Available" },
          { key: "ec_pv_azimuth",  label: "PV azimuth & tilt",                  source: "Site plan",     status: "Estimated" },
          { key: "ec_irradiance",  label: "Global horizontal irradiance (GHI)", source: "PVGIS / SMHI", status: "Available" },
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
          { key: "re_shading",     label: "Shading analysis",                    source: "3D model / site survey", status: "Missing" },
        ],
      },
      {
        category: "PV System Design",
        items: [
          { key: "re_pv_capacity", label: "Planned PV capacity (kWp)", source: "System design",          status: "Available" },
          { key: "re_pv_module",   label: "Module specifications",      source: "Manufacturer datasheet", status: "Estimated" },
          { key: "re_pv_tilt",     label: "Tilt & azimuth angles",     source: "Site plan",              status: "Available" },
        ],
      },
      {
        category: "Load & Grid",
        items: [
          { key: "re_load_profile", label: "Hourly load profile",   source: "Smart meter / utility", status: "Missing" },
          { key: "re_grid_tariff",  label: "Grid tariff structure", source: "Utility contract",      status: "Available" },
        ],
      },
    ];
  }

  return [];
}
/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

export default function DataCoverage() {
  const navigate = useNavigate();
  const { project, setProject } = useWizardStore();

  const dataInputs = useMemo(
    () => buildDataInputs(project.projectType, project.systemsInScope),
    [project.projectType, project.systemsInScope]
  );

  const [activeFilter, setActiveFilter] = useState<FilterId>("All");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(
    () => new Set(dataInputs.map((c) => c.category))
  );

  useEffect(() => {
    setExpandedCats(new Set(dataInputs.map((c) => c.category)));
  }, [dataInputs]);

  const toggleCat = (cat: string) =>
    setExpandedCats((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });

  const allItems = dataInputs.flatMap((c) => c.items);
  const availableCount = allItems.filter((i) => i.status === "Available").length;
  const estimatedCount = allItems.filter((i) => i.status === "Estimated").length;
  const missingCount   = allItems.filter((i) => i.status === "Missing").length;
  const totalCount     = allItems.length;
  const confPct        = totalCount
    ? Math.round(((availableCount + estimatedCount * 0.5) / totalCount) * 100)
    : 0;

  const isReno = project.projectType === "Renovation Planning";

  const filtered = (items: DataItem[]) =>
    activeFilter === "All" ? items :
    activeFilter === "Needs user input" ? items.filter((i) => i.status === "Missing") :
    items.filter((i) => i.status === activeFilter);

  useEffect(() => {
    setProject({ dataCoveragePct: confPct } as never);
  }, [confPct, setProject]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-navy">Step 2 &ndash; Data Coverage</h2>

      {/* Context chips */}
      <div className="flex flex-wrap gap-2">
        {project.projectType && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-navy/10 text-navy text-xs font-semibold">
            &#x1F4CB; {project.projectType}
          </span>
        )}
        {project.systemsInScope.length > 0 && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-lime/10 text-olive text-xs font-semibold">
            &#x2699;&#xFE0F; {project.systemsInScope.length} system{project.systemsInScope.length !== 1 ? "s" : ""}
          </span>
        )}
        {project.country && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">
            <MapPin className="w-3 h-3" /> {project.country}
          </span>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Available",  value: availableCount, color: "text-teal",   bg: "bg-teal/10  border-teal/25" },
          { label: "Estimated",  value: estimatedCount, color: "text-olive",  bg: "bg-lime/10  border-lime/25" },
          { label: "Missing",    value: missingCount,   color: "text-red-500",bg: "bg-red-50   border-red-200" },
          { label: "Confidence", value: `${confPct}%`,  color: "text-navy",   bg: "bg-navy/10  border-navy/25" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`rounded-2xl border p-4 text-center ${bg}`}>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {FILTER_OPTS.map(({ id, icon }) => (
          <button
            key={id}
            onClick={() => setActiveFilter(id)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition
              ${activeFilter === id
                ? "bg-navy text-white border-navy"
                : "bg-white text-gray-600 border-gray-300 hover:border-navy hover:text-navy"
              }`}
          >
            {icon} {id}
          </button>
        ))}
      </div>

      {/* Column header */}
      <div className="hidden sm:grid items-center gap-2 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide" style={{ gridTemplateColumns: "1fr 100px 110px 80px 110px" }}>
        <span>Parameter</span>
        <span>Status</span>
        <span>Source</span>
        <span>Confidence</span>
        <span>Action Required</span>
      </div>

      {/* Category groups */}
      <div className="space-y-3">
        {dataInputs.map((cat) => {
          const visibleItems = filtered(cat.items);
          if (activeFilter !== "All" && visibleItems.length === 0) return null;
          const expanded = expandedCats.has(cat.category);
          const catCounts = {
            available: cat.items.filter((i) => i.status === "Available").length,
            estimated: cat.items.filter((i) => i.status === "Estimated").length,
            missing:   cat.items.filter((i) => i.status === "Missing").length,
          };
          return (
            <div key={cat.category} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => toggleCat(cat.category)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-sm text-dark">{cat.category}</span>
                  <span className="text-xs text-teal">&#x2705; {catCounts.available}</span>
                  <span className="text-xs text-olive">&#x1F536; {catCounts.estimated}</span>
                  {catCounts.missing > 0 && (
                    <span className="text-xs text-red-500">&#x274C; {catCounts.missing}</span>
                  )}
                </div>
                {expanded
                  ? <ChevronUp className="w-4 h-4 text-gray-400" />
                  : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>
              {expanded && (
                <div className="divide-y divide-gray-50">
                  {visibleItems.map((item) => (
                    <CoverageRow key={item.key} item={item} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {totalCount === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
          No data inputs configured for the current project type and systems.
        </div>
      )}

      {/* EPC & TABULA expander (renovation only) */}
      {isReno && (
        <details className="bg-lime/10 border border-lime/30 rounded-2xl p-4 text-sm">
          <summary className="cursor-pointer font-semibold text-olive">
            &#x1F504; About EPC &amp; TABULA data sources
          </summary>
          <div className="mt-3 space-y-2 text-gray-700">
            <p><strong>EPC (Energy Performance Certificate)</strong> &ndash; official document issued by a certified assessor. Contains energy class (A&ndash;G), annual energy demand, U-values, and system information.</p>
            <p><strong>TABULA</strong> &ndash; Pan-European typology database of residential building archetypes. Used as a proxy when measured data is unavailable.</p>
          </div>
        </details>
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
