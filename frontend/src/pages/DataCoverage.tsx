import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  MapPin,
} from "lucide-react";

/* ── Inline data input definitions (ported from step2plus_data_inputs.py) ── */

interface DataItem {
  key: string;
  label: string;
  recommended_source: string;
  proxy_options: string[];
}

interface DataCategory {
  category: string;
  items: DataItem[];
}

/** Simplified data input builder per project type + systems */
function buildDataInputs(
  projectType: string | null,
  systems: string[],
  envelopeComps: string[]
): DataCategory[] {
  if (!projectType) return [];
  const sysSet = new Set(systems);

  if (projectType === "Renovation Planning") {
    const cats: DataCategory[] = [
      {
        category: "Building Identity",
        items: [
          { key: "reno_address", label: "Building address", recommended_source: "Project brief", proxy_options: [] },
          { key: "reno_build_year", label: "Construction year", recommended_source: "EPC / land registry", proxy_options: ["TABULA archetype"] },
          { key: "reno_building_type", label: "Building type", recommended_source: "EPC", proxy_options: ["TABULA"] },
        ],
      },
      {
        category: "Energy Performance",
        items: [
          { key: "reno_epc_class", label: "Energy performance class (A-G)", recommended_source: "EPC certificate", proxy_options: ["National average"] },
          { key: "reno_energy_demand", label: "Annual energy demand (kWh/m²)", recommended_source: "EPC / utility bills", proxy_options: ["TABULA reference", "National average"] },
          { key: "reno_heating_demand", label: "Heating energy demand", recommended_source: "EPC", proxy_options: ["TABULA reference"] },
        ],
      },
    ];

    if (sysSet.has("Building Envelope (Windows, Roof, Walls, Floors)")) {
      const envelopeItems: DataItem[] = [
        { key: "reno_u_walls", label: "U-value — Walls", recommended_source: "Building survey", proxy_options: ["TABULA archetype", "National standard"] },
        { key: "reno_u_roof", label: "U-value — Roof", recommended_source: "Building survey", proxy_options: ["TABULA archetype"] },
        { key: "reno_u_windows", label: "U-value — Windows", recommended_source: "Building survey", proxy_options: ["TABULA archetype"] },
        { key: "reno_u_floor", label: "U-value — Floor", recommended_source: "Building survey", proxy_options: ["TABULA archetype"] },
      ];
      cats.push({ category: "Building Envelope", items: envelopeItems });
    }

    cats.push({
      category: "Geometry & Areas",
      items: [
        { key: "reno_atemp", label: "Heated floor area (Atemp)", recommended_source: "EPC / drawings", proxy_options: ["TABULA archetype"] },
        { key: "reno_footprint", label: "Building footprint", recommended_source: "Drawings / GIS", proxy_options: ["OpenStreetMap"] },
        { key: "reno_num_floors", label: "Number of floors", recommended_source: "Drawings", proxy_options: [] },
      ],
    });

    if (sysSet.has("Heating System") || sysSet.has("Cooling System") || sysSet.has("Domestic Hot Water System (DHW)")) {
      cats.push({
        category: "Systems",
        items: [
          ...(sysSet.has("Heating System") ? [{ key: "reno_heating_type", label: "Heating system type", recommended_source: "Building survey", proxy_options: ["National statistics"] }] : []),
          ...(sysSet.has("Cooling System") ? [{ key: "reno_cooling_type", label: "Cooling system type", recommended_source: "Building survey", proxy_options: [] }] : []),
          ...(sysSet.has("Domestic Hot Water System (DHW)") ? [{ key: "reno_dhw_type", label: "DHW system type", recommended_source: "Building survey", proxy_options: [] }] : []),
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
          { key: "ec_footprint", label: "Building footprint dimensions", recommended_source: "Architectural drawing", proxy_options: [] },
          { key: "ec_height", label: "Building height", recommended_source: "Architectural drawing", proxy_options: [] },
          { key: "ec_orientation", label: "Building orientation", recommended_source: "Site plan / GIS", proxy_options: ["Google Earth", "OpenStreetMap"] },
        ],
      },
      {
        category: "Energy Demand",
        items: [
          { key: "ec_elec_demand", label: "Annual electricity consumption", recommended_source: "Utility bills", proxy_options: ["National average"] },
          { key: "ec_heat_demand", label: "Annual heating demand", recommended_source: "Utility bills / EPC", proxy_options: ["TABULA", "National average"] },
        ],
      },
      ...(sysSet.has("Rooftop PV") || sysSet.has("Community PV") || sysSet.has("Facade PV (BIPV)")
        ? [{
            category: "PV System",
            items: [
              { key: "ec_pv_capacity", label: "PV installed capacity (kWp)", recommended_source: "System specs", proxy_options: ["Rule of thumb"] },
              { key: "ec_pv_azimuth", label: "PV azimuth & tilt", recommended_source: "Site plan", proxy_options: ["Google Earth"] },
              { key: "ec_irradiance", label: "Global horizontal irradiance (GHI)", recommended_source: "PVGIS / SMHI", proxy_options: ["PVGIS"] },
            ],
          }]
        : []),
      ...(sysSet.has("Battery System")
        ? [{
            category: "Battery System",
            items: [
              { key: "ec_bat_capacity", label: "Battery capacity (kWh)", recommended_source: "System specs", proxy_options: [] },
              { key: "ec_bat_power", label: "Max charge/discharge (kW)", recommended_source: "System specs", proxy_options: [] },
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
          { key: "re_irradiance", label: "Global horizontal irradiance (GHI)", recommended_source: "PVGIS / SMHI", proxy_options: ["PVGIS"] },
          { key: "re_temperature", label: "Ambient temperature profile", recommended_source: "SMHI / Meteonorm", proxy_options: ["TMY dataset"] },
          { key: "re_shading", label: "Shading analysis", recommended_source: "3D model / site survey", proxy_options: ["Simplified estimate"] },
        ],
      },
      {
        category: "PV System Design",
        items: [
          { key: "re_pv_capacity", label: "Planned PV capacity (kWp)", recommended_source: "System design", proxy_options: ["Rule of thumb"] },
          { key: "re_pv_module", label: "Module specifications", recommended_source: "Manufacturer datasheet", proxy_options: ["Standard module"] },
          { key: "re_pv_tilt", label: "Tilt & azimuth angles", recommended_source: "Site plan", proxy_options: [] },
        ],
      },
      {
        category: "Load & Grid",
        items: [
          { key: "re_load_profile", label: "Hourly load profile", recommended_source: "Smart meter / utility", proxy_options: ["Standard load profile", "National average"] },
          { key: "re_grid_tariff", label: "Grid tariff structure", recommended_source: "Utility contract", proxy_options: ["Published tariff"] },
        ],
      },
    ];
  }

  return [];
}

/* ═══════════════════════════════════════════════════════════════════ */

export default function DataCoverage() {
  const navigate = useNavigate();
  const { project, setProject, steps } = useWizardStore();

  const dataInputs = useMemo(
    () =>
      buildDataInputs(
        project.projectType,
        project.systemsInScope,
        project.renovationEnvelopeComponents
      ),
    [project.projectType, project.systemsInScope, project.renovationEnvelopeComponents]
  );

  /* local state for availability + proxy choices */
  const [choices, setChoices] = useState<
    Record<string, { available: boolean; proxy: string | null }>
  >(
    () => {
      const init: Record<string, { available: boolean; proxy: string | null }> = {};
      for (const cat of dataInputs) {
        for (const item of cat.items) {
          init[item.key] = { available: true, proxy: null };
        }
      }
      return init;
    }
  );

  // Recompute when inputs change
  useEffect(() => {
    setChoices((prev) => {
      const next: typeof prev = {};
      for (const cat of dataInputs) {
        for (const item of cat.items) {
          next[item.key] = prev[item.key] ?? { available: true, proxy: null };
        }
      }
      return next;
    });
  }, [dataInputs]);

  const allItems = dataInputs.flatMap((c) => c.items);
  const totalCount = allItems.length;
  const availableCount = allItems.filter((i) => choices[i.key]?.available).length;
  const proxyCount = allItems.filter(
    (i) => !choices[i.key]?.available && choices[i.key]?.proxy
  ).length;
  const coveragePct = totalCount ? Math.round((availableCount / totalCount) * 100) : 0;

  const [expandedCats, setExpandedCats] = useState<Set<string>>(
    () => new Set(dataInputs.map((c) => c.category))
  );

  const toggleCat = (cat: string) =>
    setExpandedCats((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });

  const isReno = project.projectType === "Renovation Planning";
  const nextPath = isReno ? "/step/3" : "/step/3";
  const prevPath = "/step/1";

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-navy">Data Coverage</h2>

      {/* Context chips */}
      <div className="flex flex-wrap gap-2">
        {project.projectType && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-navy/10 text-navy text-xs font-semibold">
            📋 {project.projectType}
          </span>
        )}
        {project.systemsInScope.length > 0 && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-lime/10 text-olive text-xs font-semibold">
            ⚙️ {project.systemsInScope.length} system
            {project.systemsInScope.length !== 1 ? "s" : ""}
          </span>
        )}
        {project.country && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">
            <MapPin className="w-3 h-3" /> {project.country}
          </span>
        )}
      </div>

      {/* Coverage gauge */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border p-4 text-center bg-navy/10 border-navy/25">
          <div className="text-2xl font-bold text-navy">{coveragePct}%</div>
          <div className="text-xs text-gray-500">Data Coverage</div>
        </div>
        <div className="rounded-2xl border p-4 text-center bg-teal/10 border-teal/25">
          <div className="text-2xl font-bold text-teal">
            {availableCount}/{totalCount}
          </div>
          <div className="text-xs text-gray-500">Available</div>
        </div>
        <div className="rounded-2xl border p-4 text-center bg-green/10 border-green/25">
          <div className="text-2xl font-bold text-green">{proxyCount}</div>
          <div className="text-xs text-gray-500">Using Proxy</div>
        </div>
      </div>

      {/* Coverage bar */}
      <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${coveragePct}%`,
            background:
              coveragePct >= 75
                ? "#8AB62E"
                : coveragePct >= 50
                ? "#33A9A0"
                : "#dc2626",
          }}
        />
      </div>

      {/* Data input categories */}
      <div className="space-y-3">
        {dataInputs.map((cat) => {
          const expanded = expandedCats.has(cat.category);
          const catAvail = cat.items.filter(
            (i) => choices[i.key]?.available
          ).length;
          return (
            <div
              key={cat.category}
              className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
            >
              <button
                onClick={() => toggleCat(cat.category)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-dark">
                    {cat.category}
                  </span>
                  <span className="text-xs text-gray-400">
                    {catAvail}/{cat.items.length} available
                  </span>
                </div>
                {expanded ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </button>
              {expanded && (
                <div className="px-5 pb-4 space-y-2">
                  {cat.items.map((item) => {
                    const choice = choices[item.key] ?? {
                      available: true,
                      proxy: null,
                    };
                    return (
                      <div
                        key={item.key}
                        className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-b-0"
                      >
                        {/* Toggle */}
                        <button
                          onClick={() =>
                            setChoices((prev) => ({
                              ...prev,
                              [item.key]: {
                                ...prev[item.key],
                                available: !choice.available,
                                proxy: !choice.available
                                  ? null
                                  : choice.proxy,
                              },
                            }))
                          }
                          className="flex-shrink-0"
                        >
                          {choice.available ? (
                            <CheckCircle2 className="w-5 h-5 text-green" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-400" />
                          )}
                        </button>

                        {/* Label */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-dark truncate">
                            {item.label}
                          </p>
                          {item.recommended_source && (
                            <p className="text-xs text-gray-400">
                              Source: {item.recommended_source}
                            </p>
                          )}
                        </div>

                        {/* Proxy selector (when not available) */}
                        {!choice.available &&
                          item.proxy_options.length > 0 && (
                            <select
                              value={choice.proxy ?? ""}
                              onChange={(e) =>
                                setChoices((prev) => ({
                                  ...prev,
                                  [item.key]: {
                                    ...prev[item.key],
                                    proxy: e.target.value || null,
                                  },
                                }))
                              }
                              className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
                            >
                              <option value="">Select proxy…</option>
                              {item.proxy_options.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          )}

                        {!choice.available &&
                          item.proxy_options.length === 0 && (
                            <span className="text-xs text-red-400 italic">
                              No proxy available
                            </span>
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

      {/* Navigation */}
      <div className="flex justify-between pt-4 pb-8">
        <button
          onClick={() => navigate(prevPath)}
          className="px-5 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50"
        >
          ← Back
        </button>
        <button
          onClick={() => navigate(nextPath)}
          className="px-6 py-2 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy/90"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
