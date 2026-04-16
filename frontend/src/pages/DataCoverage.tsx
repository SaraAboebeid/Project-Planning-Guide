import { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  MapPin,
  Activity,
  Database,
  Zap,
  X,
  Lightbulb,
  Info,
} from "lucide-react";

const SensitivityPanel = lazy(() => import("../components/panels/SensitivityPanel"));
const TabulaPanel = lazy(() => import("../components/panels/TabulaPanel"));
const EpcPanel = lazy(() => import("../components/panels/EpcPanel"));

/* ── Data item definitions ── */

interface DataItem {
  key: string;
  label: string;
  recommended_source: string;
  proxy_options: string[];
  auto_source?: "EPC" | "TABULA" | "EPC/TABULA" | null;
}

interface DataCategory {
  category: string;
  items: DataItem[];
}

function buildDataInputs(
  projectType: string | null,
  systems: string[],
  _envelopeComps: string[]
): DataCategory[] {
  if (!projectType) return [];
  const sysSet = new Set(systems);

  if (projectType === "Renovation Planning") {
    const cats: DataCategory[] = [
      {
        category: "Building Identity",
        items: [
          { key: "reno_address", label: "Building address", recommended_source: "Project brief", proxy_options: [], auto_source: null },
          { key: "reno_build_year", label: "Construction year", recommended_source: "EPC / land registry", proxy_options: ["TABULA archetype"], auto_source: "EPC" },
          { key: "reno_building_type", label: "Building type", recommended_source: "EPC", proxy_options: ["TABULA"], auto_source: "EPC" },
        ],
      },
      {
        category: "Energy Performance",
        items: [
          { key: "reno_epc_class", label: "Energy performance class (A–G)", recommended_source: "EPC certificate", proxy_options: ["National average"], auto_source: "EPC" },
          { key: "reno_energy_demand", label: "Annual energy demand (kWh/m²)", recommended_source: "EPC / utility bills", proxy_options: ["TABULA reference", "National average"], auto_source: "EPC" },
          { key: "reno_heating_demand", label: "Heating energy demand", recommended_source: "EPC", proxy_options: ["TABULA reference"], auto_source: "EPC" },
        ],
      },
    ];

    if (sysSet.has("Building Envelope (Windows, Roof, Walls, Floors)")) {
      cats.push({
        category: "Building Envelope",
        items: [
          { key: "reno_u_walls", label: "U-value — Walls", recommended_source: "Building survey", proxy_options: ["TABULA archetype", "National standard"], auto_source: "TABULA" },
          { key: "reno_u_roof", label: "U-value — Roof", recommended_source: "Building survey", proxy_options: ["TABULA archetype"], auto_source: "TABULA" },
          { key: "reno_u_windows", label: "U-value — Windows", recommended_source: "Building survey", proxy_options: ["TABULA archetype"], auto_source: "TABULA" },
          { key: "reno_u_floor", label: "U-value — Floor", recommended_source: "Building survey", proxy_options: ["TABULA archetype"], auto_source: "TABULA" },
        ],
      });
    }

    cats.push({
      category: "Geometry & Areas",
      items: [
        { key: "reno_atemp", label: "Heated floor area (Atemp)", recommended_source: "EPC / drawings", proxy_options: ["TABULA archetype"], auto_source: "EPC" },
        { key: "reno_footprint", label: "Building footprint", recommended_source: "Drawings / GIS", proxy_options: ["OpenStreetMap"], auto_source: null },
        { key: "reno_num_floors", label: "Number of floors", recommended_source: "Drawings", proxy_options: [], auto_source: null },
      ],
    });

    if (sysSet.has("Heating System") || sysSet.has("Cooling System") || sysSet.has("Domestic Hot Water System (DHW)")) {
      cats.push({
        category: "Systems",
        items: [
          ...(sysSet.has("Heating System")
            ? [{ key: "reno_heating_type", label: "Heating system type", recommended_source: "Building survey", proxy_options: ["National statistics"], auto_source: null as DataItem["auto_source"] }]
            : []),
          ...(sysSet.has("Cooling System")
            ? [{ key: "reno_cooling_type", label: "Cooling system type", recommended_source: "Building survey", proxy_options: [], auto_source: null as DataItem["auto_source"] }]
            : []),
          ...(sysSet.has("Domestic Hot Water System (DHW)")
            ? [{ key: "reno_dhw_type", label: "DHW system type", recommended_source: "Building survey", proxy_options: [], auto_source: null as DataItem["auto_source"] }]
            : []),
        ],
      });
    }

    return cats;
  }

  if (projectType === "Energy Community Planning") {
    return [
      {
        category: "Building Geometry",
        items: [
          { key: "ec_footprint", label: "Building footprint dimensions", recommended_source: "Architectural drawing", proxy_options: [], auto_source: null },
          { key: "ec_height", label: "Building height", recommended_source: "Architectural drawing", proxy_options: [], auto_source: null },
          { key: "ec_orientation", label: "Building orientation", recommended_source: "Site plan / GIS", proxy_options: ["Google Earth", "OpenStreetMap"], auto_source: null },
        ],
      },
      {
        category: "Energy Demand",
        items: [
          { key: "ec_elec_demand", label: "Annual electricity consumption", recommended_source: "Utility bills", proxy_options: ["National average"], auto_source: null },
          { key: "ec_heat_demand", label: "Annual heating demand", recommended_source: "Utility bills / EPC", proxy_options: ["TABULA", "National average"], auto_source: "EPC" },
        ],
      },
      ...(sysSet.has("Rooftop PV") || sysSet.has("Community PV") || sysSet.has("Facade PV (BIPV)")
        ? [{
            category: "PV System",
            items: [
              { key: "ec_pv_capacity", label: "PV installed capacity (kWp)", recommended_source: "System specs", proxy_options: ["Rule of thumb"], auto_source: null as DataItem["auto_source"] },
              { key: "ec_pv_azimuth", label: "PV azimuth & tilt", recommended_source: "Site plan", proxy_options: ["Google Earth"], auto_source: null as DataItem["auto_source"] },
              { key: "ec_irradiance", label: "Global horizontal irradiance (GHI)", recommended_source: "PVGIS / SMHI", proxy_options: ["PVGIS"], auto_source: null as DataItem["auto_source"] },
            ],
          }]
        : []),
      ...(sysSet.has("Battery System")
        ? [{
            category: "Battery System",
            items: [
              { key: "ec_bat_capacity", label: "Battery capacity (kWh)", recommended_source: "System specs", proxy_options: [], auto_source: null as DataItem["auto_source"] },
              { key: "ec_bat_power", label: "Max charge/discharge (kW)", recommended_source: "System specs", proxy_options: [], auto_source: null as DataItem["auto_source"] },
            ],
          }]
        : []),
    ];
  }

  if (projectType === "Renewable Energy Planning") {
    return [
      {
        category: "Site & Climate",
        items: [
          { key: "re_irradiance", label: "Global horizontal irradiance (GHI)", recommended_source: "PVGIS / SMHI", proxy_options: ["PVGIS"], auto_source: null },
          { key: "re_temperature", label: "Ambient temperature profile", recommended_source: "SMHI / Meteonorm", proxy_options: ["TMY dataset"], auto_source: null },
          { key: "re_shading", label: "Shading analysis", recommended_source: "3D model / site survey", proxy_options: ["Simplified estimate"], auto_source: null },
        ],
      },
      {
        category: "PV System Design",
        items: [
          { key: "re_pv_capacity", label: "Planned PV capacity (kWp)", recommended_source: "System design", proxy_options: ["Rule of thumb"], auto_source: null },
          { key: "re_pv_module", label: "Module specifications", recommended_source: "Manufacturer datasheet", proxy_options: ["Standard module"], auto_source: null },
          { key: "re_pv_tilt", label: "Tilt & azimuth angles", recommended_source: "Site plan", proxy_options: [], auto_source: null },
        ],
      },
      {
        category: "Load & Grid",
        items: [
          { key: "re_load_profile", label: "Hourly load profile", recommended_source: "Smart meter / utility", proxy_options: ["Standard load profile", "National average"], auto_source: null },
          { key: "re_grid_tariff", label: "Grid tariff structure", recommended_source: "Utility contract", proxy_options: ["Published tariff"], auto_source: null },
        ],
      },
    ];
  }

  return [];
}

/* ── Alternative suggestions per key ── */
const ALTERNATIVES: Record<string, string[]> = {
  reno_address: ["Use project brief or client-provided location"],
  reno_build_year: ["Look up in TABULA archetype database", "Use land registry records", "Estimate from architectural style"],
  reno_building_type: ["Match via TABULA building typology", "Infer from aerial imagery"],
  reno_epc_class: ["Use national average for building age", "Estimate from U-values & systems"],
  reno_energy_demand: ["Use TABULA reference values for archetype", "Estimate from heating degree-days", "Use national statistics for building type"],
  reno_heating_demand: ["Derive from TABULA archetype", "Calculate from U-values × area × HDD"],
  reno_u_walls: ["TABULA archetype U-value for building period", "National building regulation default", "Infrared thermography survey"],
  reno_u_roof: ["TABULA archetype U-value", "National building regulation default"],
  reno_u_windows: ["TABULA archetype glazing value", "Estimate from window age & type"],
  reno_u_floor: ["TABULA archetype U-value", "National building regulation default"],
  reno_atemp: ["Calculate from footprint × floors", "Use TABULA reference area"],
  reno_footprint: ["Extract from OpenStreetMap", "Measure from aerial imagery"],
  reno_num_floors: ["Count from street view / photos", "Estimate from building height"],
  reno_heating_type: ["Use national statistics for building age", "Infer from energy source"],
  reno_cooling_type: ["Assume none for older Swedish buildings"],
  reno_dhw_type: ["Assume linked to heating system"],
  ec_footprint: ["Extract from OpenStreetMap / cadastral data"],
  ec_height: ["Estimate from floors × 3m", "LiDAR data"],
  ec_orientation: ["Google Earth / OpenStreetMap"],
  ec_elec_demand: ["Use national average per household", "SCB statistics"],
  ec_heat_demand: ["TABULA reference + degree-day correction", "EPC database average"],
  ec_pv_capacity: ["Rule of thumb: ~150 W/m² roof area"],
  ec_pv_azimuth: ["Google Earth satellite view"],
  ec_irradiance: ["PVGIS online tool (free)", "SMHI open data"],
  ec_bat_capacity: ["Size from self-consumption target"],
  ec_bat_power: ["Typically 0.5–1× capacity in kW"],
  re_irradiance: ["PVGIS online tool (free)"],
  re_temperature: ["ERA5 reanalysis data", "TMY from PVGIS"],
  re_shading: ["Simplified horizon line estimate"],
  re_pv_capacity: ["Rule of thumb from roof area"],
  re_pv_module: ["Use standard 400 W mono-Si module"],
  re_pv_tilt: ["Latitude-based rule of thumb"],
  re_load_profile: ["Standard load profile (SLP) from grid operator"],
  re_grid_tariff: ["Published tariff from utility website"],
};

/* ── Data Explorer panels ── */
type PanelId = "sensitivity" | "tabula" | "epc";

const PANELS: { id: PanelId; label: string; icon: typeof Activity; gradient: string; desc: string }[] = [
  { id: "sensitivity", label: "Sensitivity Analysis", icon: Activity, gradient: "from-[#2b4a7e] to-[#2e9e96]", desc: "Parameter importance & response curves" },
  { id: "tabula", label: "TABULA Data", icon: Database, gradient: "from-[#f59e0b] to-[#ef4444]", desc: "Building archetype U-values & energy" },
  { id: "epc", label: "EPC Data", icon: Zap, gradient: "from-[#7da828] to-[#2e9e96]", desc: "Energy performance certificates & trends" },
];

function DataExplorer() {
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);
  return (
    <div className="space-y-4">
      <div>
        <p className="ppg-section-title">Reference Data</p>
        <h3 className="text-lg font-bold text-slate-800">Explore Analysis & Database Results</h3>
        <p className="text-sm text-gray-500 mt-1">Click a card to explore reference datasets that inform data gap decisions.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PANELS.map((p) => {
          const Icon = p.icon;
          const isActive = activePanel === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setActivePanel(isActive ? null : p.id)}
              className={`relative rounded-xl border-2 p-4 text-left transition-all ${
                isActive ? "border-teal shadow-md bg-white" : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
              }`}
            >
              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${p.gradient} flex items-center justify-center mb-2.5`}>
                <Icon className="w-4.5 h-4.5 text-white" />
              </div>
              <h4 className="text-sm font-semibold text-slate-800">{p.label}</h4>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{p.desc}</p>
              {isActive && (
                <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                  <X className="w-3 h-3 text-gray-400" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {activePanel && (
        <div className="ppg-card">
          <Suspense fallback={<div className="text-center py-12 text-gray-400 text-sm">Loading…</div>}>
            {activePanel === "sensitivity" && <SensitivityPanel />}
            {activePanel === "tabula" && <TabulaPanel />}
            {activePanel === "epc" && <EpcPanel />}
          </Suspense>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */

type Choice = { available: boolean; proxy: string | null; autoSource: string | null };

export default function DataCoverage() {
  const navigate = useNavigate();
  const { project } = useWizardStore();

  const dataInputs = useMemo(
    () => buildDataInputs(project.projectType, project.systemsInScope, project.renovationEnvelopeComponents),
    [project.projectType, project.systemsInScope, project.renovationEnvelopeComponents]
  );

  const [choices, setChoices] = useState<Record<string, Choice>>(() => {
    const init: Record<string, Choice> = {};
    for (const cat of dataInputs) {
      for (const item of cat.items) {
        const hasAuto = !!item.auto_source;
        init[item.key] = { available: hasAuto, proxy: null, autoSource: item.auto_source ?? null };
      }
    }
    return init;
  });

  useEffect(() => {
    setChoices((prev) => {
      const next: Record<string, Choice> = {};
      for (const cat of dataInputs) {
        for (const item of cat.items) {
          if (prev[item.key]) {
            next[item.key] = prev[item.key]!;
          } else {
            const hasAuto = !!item.auto_source;
            next[item.key] = { available: hasAuto, proxy: null, autoSource: item.auto_source ?? null };
          }
        }
      }
      return next;
    });
  }, [dataInputs]);

  const allItems = dataInputs.flatMap((c) => c.items);
  const totalCount = allItems.length;
  const availableCount = allItems.filter((i) => choices[i.key]?.available).length;
  const proxyCount = allItems.filter((i) => !choices[i.key]?.available && choices[i.key]?.proxy).length;
  const missingCount = totalCount - availableCount - proxyCount;
  const coveragePct = totalCount ? Math.round((availableCount / totalCount) * 100) : 0;

  const [expandedCats, setExpandedCats] = useState<Set<string>>(() => new Set(dataInputs.map((c) => c.category)));
  const toggleCat = (cat: string) =>
    setExpandedCats((prev) => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });

  const prevPath = "/step/1";
  const nextPath = "/step/3";

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-800">Data Coverage</h2>
      <p className="text-sm text-gray-500">
        Review which data you have. Items from <strong>EPC</strong> or <strong>TABULA</strong> are pre-checked.
        Toggle items you don't have to <em>No</em> to see alternative suggestions.
      </p>

      {/* Context chips */}
      <div className="flex flex-wrap gap-2">
        {project.projectType && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-navy/10 text-navy text-xs font-semibold">
            📋 {project.projectType}
          </span>
        )}
        {project.systemsInScope.length > 0 && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-lime/10 text-olive text-xs font-semibold">
            ⚙️ {project.systemsInScope.length} system{project.systemsInScope.length !== 1 ? "s" : ""}
          </span>
        )}
        {project.country && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">
            <MapPin className="w-3 h-3" /> {project.country}
          </span>
        )}
      </div>

      {/* Coverage summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="ppg-stat ppg-stat-navy">
          <div className="text-2xl font-bold text-navy">{coveragePct}%</div>
          <div className="text-xs text-gray-500">Coverage</div>
        </div>
        <div className="ppg-stat ppg-stat-teal">
          <div className="text-2xl font-bold text-teal">{availableCount}/{totalCount}</div>
          <div className="text-xs text-gray-500">Available</div>
        </div>
        <div className="ppg-stat ppg-stat-green">
          <div className="text-2xl font-bold text-green">{proxyCount}</div>
          <div className="text-xs text-gray-500">Using Proxy</div>
        </div>
        <div className="ppg-stat" style={{ background: "rgba(239,68,68,0.06)", borderColor: "rgba(239,68,68,0.15)" }}>
          <div className="text-2xl font-bold text-red-500">{missingCount}</div>
          <div className="text-xs text-gray-500">Missing</div>
        </div>
      </div>

      {/* Coverage bar */}
      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${coveragePct}%`,
            background: coveragePct >= 75 ? "#8AB62E" : coveragePct >= 50 ? "#33A9A0" : "#dc2626",
          }}
        />
      </div>

      {/* ── Data input categories ── */}
      <div className="space-y-3">
        {dataInputs.map((cat) => {
          const expanded = expandedCats.has(cat.category);
          const catAvail = cat.items.filter((i) => choices[i.key]?.available).length;
          return (
            <div key={cat.category} className="ppg-card overflow-hidden">
              <button
                onClick={() => toggleCat(cat.category)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-dark">{cat.category}</span>
                  <span className="text-xs text-gray-400">{catAvail}/{cat.items.length} available</span>
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>
              {expanded && (
                <div className="px-5 pb-4 space-y-3">
                  {cat.items.map((item) => {
                    const choice = choices[item.key] ?? { available: false, proxy: null, autoSource: null };
                    const alts = ALTERNATIVES[item.key] ?? [];
                    return (
                      <div
                        key={item.key}
                        className={`rounded-xl border p-3 transition ${
                          choice.available
                            ? "border-green/30 bg-green/[0.03]"
                            : "border-red-200 bg-red-50/30"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {choice.available ? (
                            <CheckCircle2 className="w-5 h-5 text-green flex-shrink-0" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-dark">{item.label}</p>
                              {item.auto_source && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal/10 text-teal">
                                  {item.auto_source}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-400">Source: {item.recommended_source}</p>
                          </div>

                          {/* Yes / No buttons */}
                          <div className="flex gap-1.5 flex-shrink-0">
                            <button
                              onClick={() =>
                                setChoices((prev) => {
                                  const c = prev[item.key]!;
                                  return { ...prev, [item.key]: { ...c, available: true, proxy: null } };
                                })
                              }
                              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                                choice.available
                                  ? "bg-green text-white shadow-sm"
                                  : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                              }`}
                            >
                              Yes
                            </button>
                            <button
                              onClick={() =>
                                setChoices((prev) => {
                                  const c = prev[item.key]!;
                                  return { ...prev, [item.key]: { ...c, available: false } };
                                })
                              }
                              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                                !choice.available
                                  ? "bg-red-500 text-white shadow-sm"
                                  : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                              }`}
                            >
                              No
                            </button>
                          </div>
                        </div>

                        {/* Alternatives panel (shown when No) */}
                        {!choice.available && (
                          <div className="mt-3 ml-8 space-y-2">
                            {item.proxy_options.length > 0 && (
                              <div className="flex items-center gap-2">
                                <Info className="w-3.5 h-3.5 text-teal flex-shrink-0" />
                                <span className="text-xs text-gray-500">Use proxy:</span>
                                <select
                                  value={choice.proxy ?? ""}
                                  onChange={(e) =>
                                    setChoices((prev) => {
                                      const c = prev[item.key]!;
                                      return { ...prev, [item.key]: { ...c, proxy: e.target.value || null } };
                                    })
                                  }
                                  className="ppg-input !w-auto !py-1 !px-2 !text-xs"
                                >
                                  <option value="">Select proxy…</option>
                                  {item.proxy_options.map((p) => (
                                    <option key={p} value={p}>{p}</option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {alts.length > 0 && (
                              <div className="rounded-lg bg-amber-50 border border-amber-200/60 px-3 py-2">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                                  <span className="text-[11px] font-semibold text-amber-700">Alternatives</span>
                                </div>
                                <ul className="space-y-0.5">
                                  {alts.map((alt) => (
                                    <li key={alt} className="text-xs text-amber-800 flex items-start gap-1.5">
                                      <span className="text-amber-400 mt-0.5">›</span>
                                      {alt}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {item.proxy_options.length === 0 && alts.length === 0 && (
                              <p className="text-xs text-red-400 italic">No proxy or alternative available — this data should be collected.</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
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

      {/* ── Data Explorer ── */}
      <DataExplorer />

      {/* Navigation */}
      <div className="flex justify-between pt-4 pb-8">
        <button onClick={() => navigate(prevPath)} className="ppg-btn-secondary">← Back</button>
        <button onClick={() => navigate(nextPath)} className="ppg-btn-primary">Continue →</button>
      </div>
    </div>
  );
}
