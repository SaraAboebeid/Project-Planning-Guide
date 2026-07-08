import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import { WIKELLS_CHAPTERS, type WikellsItem } from "../config/wikellsData";
import { Search, ChevronDown, ChevronUp, FlaskConical, LayoutGrid, Eye, Play, Building2, Users, CheckSquare, Loader2, BarChart2, Leaf, Download, TrendingDown } from "lucide-react";

/* ─── Component → Wikells chapter mapping ─────────────────────────────────── */
// Keys match the exact labels used in Step 1 (ENVELOPE_COMPONENTS in projectConfig.ts)
const COMPONENT_CHAPTERS: Record<string, string[]> = {
  "Walls":                            ["ch7"],
  "Windows":                          ["ch16"],
  "Doors":                            ["ch16"],
  "Floor":                            ["ch9", "ch15"],
  "Roof":                             ["ch11"],
  "Balcony":                          ["ch9"],
  "Structure (Columns & Beams)":      ["ch7", "ch8"],
  "Vertical Extension (New Floor)":   ["ch9", "ch11"],
};

// Default components for renovation if none specified
const DEFAULT_COMPONENTS = ["Walls", "Roof", "Windows"];

// Map component label → friendly display name
const COMPONENT_LABEL: Record<string, string> = {
  "Walls":                            "Walls",
  "Windows":                          "Windows",
  "Doors":                            "Doors",
  "Floor":                            "Floor",
  "Roof":                             "Roof",
  "Balcony":                          "Balcony",
  "Structure (Columns & Beams)":      "Structure",
  "Vertical Extension (New Floor)":   "Vertical Extension",
};

const COMPONENT_COLORS: Record<string, string> = {
  "Walls":                            "#721CB8",
  "Windows":                          "#F59E0B",
  "Doors":                            "#4ECDC4",
  "Floor":                            "#4A90E2",
  "Roof":                             "#4ECDC4",
  "Balcony":                          "#96D74C",
  "Structure (Columns & Beams)":      "#EF4444",
  "Vertical Extension (New Floor)":   "#F97316",
};

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function uLabel(u?: number) {
  if (!u) return null;
  if (u <= 0.13) return { label: "Excellent", color: "#96D74C" };
  if (u <= 0.20) return { label: "Good",      color: "#4ECDC4" };
  if (u <= 0.30) return { label: "Standard",  color: "#F59E0B" };
  return              { label: "Basic",       color: "#EF4444" };
}

/** Rough embodied-carbon estimate. Uses weightKgM2 × 0.5 kg CO₂e/kg (generic construction average). */
function carbonKgM2(item: WikellsItem): number | null {
  if (!item.weightKgM2) return null;
  return Math.round(item.weightKgM2 * 0.5);
}

/* ─── Material picker for one component ───────────────────────────────────── */
function MaterialPicker({
  component,
  selected,
  onChange,
}: {
  component: string;
  selected: string[];
  onChange: (codes: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const chapterIds = COMPONENT_CHAPTERS[component] ?? ["ch7"];
  const chapters = WIKELLS_CHAPTERS.filter(c => chapterIds.includes(c.id));
  const allItems: WikellsItem[] = chapters.flatMap(c => c.subGroups.flatMap(g => g.items));

  const filtered = useMemo(() => {
    if (!query) return allItems;
    const q = query.toLowerCase();
    return allItems.filter(i =>
      i.description.toLowerCase().includes(q) || i.code.includes(q)
    );
  }, [allItems, query]);

  const toggle = (code: string) => {
    onChange(selected.includes(code)
      ? selected.filter(c => c !== code)
      : [...selected, code]
    );
  };

  const color = COMPONENT_COLORS[component] ?? "#721CB8";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Search */}
      <div style={{ position: "relative" }}>
        <Search size={12} color="rgba(255,255,255,0.3)" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search materials…"
          style={{
            width: "100%", paddingLeft: 30, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
            borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 12,
            boxSizing: "border-box",
          }}
        />
        {selected.length > 0 && (
          <span style={{
            position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
            fontSize: 10, fontWeight: 700, color: color,
            background: `${color}22`, borderRadius: 10, padding: "1px 6px",
          }}>{selected.length} selected</span>
        )}
      </div>

      {/* Items */}
      <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
        {query
          ? filtered.map(item => <MaterialRow key={item.code} item={item} checked={selected.includes(item.code)} onToggle={() => toggle(item.code)} color={color} />)
          : chapters.flatMap(ch =>
              ch.subGroups.map(sg => {
                const groupItems = sg.items;
                const key = `${ch.id}-${sg.label}`;
                const isOpen = openGroups.has(key);
                const groupSelected = groupItems.filter(i => selected.includes(i.code)).length;
                return (
                  <div key={key}>
                    <button
                      onClick={() => setOpenGroups(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; })}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "6px 10px", borderRadius: 8, border: 0, cursor: "pointer",
                        background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.65)", fontSize: 11, fontWeight: 600,
                      }}
                    >
                      <span>{sg.label}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {groupSelected > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, color, background: `${color}22`, borderRadius: 10, padding: "1px 6px" }}>{groupSelected}</span>
                        )}
                        {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </div>
                    </button>
                    {isOpen && groupItems.map(item => (
                      <MaterialRow key={item.code} item={item} checked={selected.includes(item.code)} onToggle={() => toggle(item.code)} color={color} />
                    ))}
                  </div>
                );
              })
            )
        }
        {filtered.length === 0 && (
          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", padding: "12px 10px" }}>No results for "{query}"</p>
        )}
      </div>
    </div>
  );
}

function MaterialRow({ item, checked, onToggle, color }: {
  item: WikellsItem; checked: boolean; onToggle: () => void; color: string;
}) {
  const ul = uLabel(item.uValue);
  return (
    <button
      onClick={onToggle}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "7px 10px", borderRadius: 8, border: `1px solid ${checked ? `${color}55` : "transparent"}`,
        background: checked ? `${color}18` : "rgba(255,255,255,0.02)",
        cursor: "pointer", textAlign: "left", transition: "all .12s",
      }}
    >
      {/* Checkbox */}
      <div style={{
        width: 15, height: 15, borderRadius: 4, flexShrink: 0,
        border: `2px solid ${checked ? color : "rgba(255,255,255,0.2)"}`,
        background: checked ? color : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {checked && <svg width="8" height="8" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
      </div>
      {/* Code */}
      <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>{item.code}</span>
      {/* Description */}
      <span style={{ flex: 1, fontSize: 11, color: checked ? "#fff" : "rgba(255,255,255,0.65)", lineHeight: 1.3 }}>{item.description}</span>
      {/* Cost */}
      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>
        {item.costSEK.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} SEK/m²
      </span>
      {/* U-value badge */}
      {ul && (
        <span style={{ fontSize: 9, fontWeight: 700, color: ul.color, background: `${ul.color}22`, borderRadius: 8, padding: "1px 5px", flexShrink: 0 }}>
          U={item.uValue}
        </span>
      )}
      {/* Carbon badge */}
      {carbonKgM2(item) !== null && (
        <span style={{ fontSize: 9, fontWeight: 700, color: "#60a5fa", background: "rgba(96,165,250,0.12)", borderRadius: 8, padding: "1px 5px", flexShrink: 0 }}>
          ~{carbonKgM2(item)} kg CO₂e/m²
        </span>
      )}
    </button>
  );
}

/* ─── Simulation preview ───────────────────────────────────────────────────── */
type SortKey = "default" | "cost_asc" | "cost_desc" | "carbon_asc" | "carbon_desc";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "default",     label: "Default" },
  { key: "cost_asc",    label: "Cost ↑ cheapest first" },
  { key: "cost_desc",   label: "Cost ↓ most expensive" },
  { key: "carbon_asc",  label: "CO₂e ↑ lowest first" },
  { key: "carbon_desc", label: "CO₂e ↓ highest first" },
];

function comboMetrics(combo: Record<string, WikellsItem>) {
  const totalCost = Object.values(combo).reduce((a, b) => a + b.costSEK, 0);
  const carbonVals = Object.values(combo).map(b => carbonKgM2(b)).filter((v): v is number => v !== null);
  const totalCarbon = carbonVals.length > 0 ? carbonVals.reduce((a, b) => a + b, 0) : null;
  return { totalCost, totalCarbon };
}

function SimulationPreview({ combinations }: { combinations: Record<string, WikellsItem>[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(() => {
    if (sortKey === "default") return combinations;
    return [...combinations].sort((a, b) => {
      const ma = comboMetrics(a);
      const mb = comboMetrics(b);
      if (sortKey === "cost_asc")    return ma.totalCost - mb.totalCost;
      if (sortKey === "cost_desc")   return mb.totalCost - ma.totalCost;
      if (sortKey === "carbon_asc")  return (ma.totalCarbon ?? Infinity) - (mb.totalCarbon ?? Infinity);
      if (sortKey === "carbon_desc") return (mb.totalCarbon ?? -Infinity) - (ma.totalCarbon ?? -Infinity);
      return 0;
    });
  }, [combinations, sortKey]);

  const PAGE = 8;
  const visible = showAll ? sorted : sorted.slice(0, PAGE);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Sort controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>Sort by:</span>
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => setSortKey(opt.key)}
            style={{
              padding: "4px 11px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${sortKey === opt.key ? "rgba(78,205,196,0.5)" : "rgba(255,255,255,0.1)"}`,
              background: sortKey === opt.key ? "rgba(78,205,196,0.12)" : "rgba(255,255,255,0.04)",
              color: sortKey === opt.key ? "#4ECDC4" : "rgba(255,255,255,0.45)",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Header row */}
      <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 150px 150px", gap: 12, padding: "4px 14px", marginBottom: 2 }}>
        <span />
        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1 }}>Components</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: sortKey.startsWith("cost") ? "#4ECDC4" : "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1, textAlign: "right" }}>Cost / m²</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: sortKey.startsWith("carbon") ? "#60a5fa" : "rgba(96,165,250,0.5)", textTransform: "uppercase", letterSpacing: 1, textAlign: "right" }}>Est. CO₂e / m²</span>
      </div>

      {visible.map((combo, i) => {
        const { totalCost, totalCarbon } = comboMetrics(combo);
        const rank = i + 1;
        return (
          <div key={i} style={{
            borderRadius: 10, padding: "10px 14px",
            background: rank === 1 && sortKey !== "default" ? "rgba(78,205,196,0.06)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${rank === 1 && sortKey !== "default" ? "rgba(78,205,196,0.25)" : "rgba(255,255,255,0.07)"}`,
            display: "grid", gridTemplateColumns: "36px 1fr 150px 150px", gap: 12, alignItems: "center",
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: rank === 1 && sortKey !== "default" ? "#4ECDC4" : "rgba(255,255,255,0.25)" }}>
              {rank === 1 && sortKey !== "default" ? "★" : `#${rank}`}
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {Object.entries(combo).map(([comp, item]) => (
                <span key={comp} style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 6,
                  background: `${COMPONENT_COLORS[comp] ?? "#721CB8"}22`,
                  color: COMPONENT_COLORS[comp] ?? "#721CB8",
                  border: `1px solid ${COMPONENT_COLORS[comp] ?? "#721CB8"}44`,
                }}>
                  {COMPONENT_LABEL[comp] ?? comp}: {item.code}
                </span>
              ))}
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: sortKey.startsWith("cost") ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.55)", textAlign: "right" }}>
              {totalCost.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} SEK/m²
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: totalCarbon ? (sortKey.startsWith("carbon") ? "#93c5fd" : "#60a5fa") : "rgba(255,255,255,0.2)", textAlign: "right" }}>
              {totalCarbon ? `~${totalCarbon} kg` : "—"}
            </span>
          </div>
        );
      })}

      {!showAll && sorted.length > PAGE && (
        <button
          onClick={() => setShowAll(true)}
          style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "7px 0", cursor: "pointer" }}
        >
          Show all {sorted.length} combinations
        </button>
      )}
      {showAll && sorted.length > PAGE && (
        <button
          onClick={() => setShowAll(false)}
          style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "7px 0", cursor: "pointer" }}
        >
          Show fewer
        </button>
      )}

      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", margin: "2px 0 0", fontStyle: "italic" }}>
        * CO₂e is a rough estimate (0.5 kg CO₂e/kg material). Precise values require EPD data.
      </p>
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────────────────────── */
export default function RenovationSimulator() {
  const navigate  = useNavigate();
  const { project, setProject } = useWizardStore();

  // Derive relevant components (from Step 1 selections, or defaults)
  const components = useMemo(() => {
    const comps = project.renovationEnvelopeComponents.length > 0
      ? project.renovationEnvelopeComponents
      : DEFAULT_COMPONENTS;
    return comps.filter(c => !!COMPONENT_CHAPTERS[c]);
  }, [project.renovationEnvelopeComponents]);

  // Derive available buildings from Step 2 — mirrors BaselineSetup logic exactly
  const buildings = useMemo(() => {
    const result: { id: string; label: string }[] = [];
    if (project.lookedUpBuildings.length > 0) {
      project.lookedUpBuildings.forEach((b, i) => {
        result.push({ id: `b_${i}`, label: b.address ?? `Building ${i + 1}` });
      });
    } else if (project.lookedUpBuilding) {
      result.push({ id: "b_0", label: project.lookedUpBuilding.address ?? "Building" });
    }
    return result;
  }, [project.lookedUpBuildings, project.lookedUpBuilding]);

  // "all" = apply same combinations to all buildings; otherwise array of selected building IDs
  const [buildingScope, setBuildingScope] = useState<"all" | string[]>("all");

  const selectedBuildings = buildingScope === "all" ? buildings : buildings.filter(b => (buildingScope as string[]).includes(b.id));

  const [materials, setMaterials] = useState<Record<string, string[]>>(
    project.simulationMaterials ?? {}
  );
  const [activeComponent, setActiveComponent] = useState(components[0] ?? "Walls");
  const [showPreview, setShowPreview] = useState(false);

  // Get item lookup for selected codes
  const allItems = useMemo(() =>
    WIKELLS_CHAPTERS.flatMap(c => c.subGroups.flatMap(g => g.items)),
    []
  );
  const itemByCode = useMemo(() =>
    Object.fromEntries(allItems.map(i => [i.code, i])),
    [allItems]
  );

  // Compute combinations (cartesian product across components)
  const combinations = useMemo(() => {
    const activeComps = components.filter(c => (materials[c]?.length ?? 0) > 0);
    if (activeComps.length === 0) return [];
    const lists = activeComps.map(c => materials[c]!.map(code => ({ comp: c, code })));
    // Cartesian product
    let result: Record<string, WikellsItem>[] = [{}];
    for (const list of lists) {
      result = result.flatMap(combo =>
        list.map(({ comp, code }) => ({
          ...combo,
          [comp]: itemByCode[code]!,
        }))
      );
    }
    return result;
  }, [components, materials, itemByCode]);

  const totalSelected = Object.values(materials).reduce((a, b) => a + b.length, 0);

  const [simRunning, setSimRunning] = useState(false);
  const [simProgress, setSimProgress] = useState(0);
  const [simResults, setSimResults] = useState<null | {
    packageIndex: number;
    components: Record<string, WikellsItem>;
    energyUse: number;
    saving: number;
    carbonSaving: number;
    cost: number;
  }[]>(null);

  // Baseline energy use from Step 3 dummy results (average across buildings, or fallback)
  const baselineEnergyUse = useMemo(() => {
    const b = project.lookedUpBuilding ?? project.lookedUpBuildings[0];
    if (b?.energy) return b.energy;
    const year = b?.year ?? 1970;
    return Math.round(90 + (year % 80) + (b?.tabula_u_wall ?? 0.5) * 60);
  }, [project.lookedUpBuilding, project.lookedUpBuildings]);

  function runSimulation() {
    setProject({ simulationMaterials: materials });
    setSimRunning(true);
    setSimProgress(0);
    setSimResults(null);
    let p = 0;
    const iv = setInterval(() => {
      p += Math.round(5 + Math.random() * 12);
      if (p >= 100) {
        clearInterval(iv);
        setSimProgress(100);
        setSimRunning(false);
        // Generate dummy results per combination
        const results = combinations.slice(0, Math.min(combinations.length, 20)).map((combo, idx) => {
          const items = Object.values(combo);
          const totalCost = items.reduce((a, b) => a + b.costSEK, 0);
          // U-value weighted reduction: lower avg U = more saving
          const avgU = items.filter(i => i.uValue).reduce((a, b) => a + (b.uValue ?? 0.4), 0) / Math.max(items.filter(i => i.uValue).length, 1);
          const savingPct = Math.min(Math.round((0.6 - avgU) / 0.6 * 45 + (idx % 5) * 2 + Math.random() * 6), 55);
          const saving = Math.round(baselineEnergyUse * Math.max(savingPct, 5) / 100);
          const carbonSaving = Math.round(saving * 0.2); // ~0.2 kg CO2e per kWh
          return {
            packageIndex: idx + 1,
            components: combo,
            energyUse: Math.round(baselineEnergyUse - saving),
            saving,
            carbonSaving,
            cost: totalCost,
          };
        });
        // Sort best saving first
        results.sort((a, b) => b.saving - a.saving);
        setSimResults(results);
      } else {
        setSimProgress(p);
      }
    }, 220);
  }

  function downloadSimResults() {
    if (!simResults) return;
    const payload = {
      generated: new Date().toISOString(),
      simulation: "EPSM Renovation Packages",
      baselineEnergyUse_kWh_m2_yr: baselineEnergyUse,
      packages: simResults.map(r => ({
        rank: r.packageIndex,
        energyUse_kWh_m2_yr: r.energyUse,
        energySaving_kWh_m2_yr: r.saving,
        carbonSaving_kgCO2e_m2_yr: r.carbonSaving,
        cost_SEK_m2: Math.round(r.cost),
        components: Object.fromEntries(
          Object.entries(r.components).map(([comp, item]) => [comp, { code: item.code, description: item.description, costSEK: item.costSEK, uValue: item.uValue ?? null }])
        ),
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "epsm_package_results.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const handleSaveAndContinue = () => {
    setProject({ simulationMaterials: materials });
    navigate("/step/5");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1100 }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.6, color: "rgba(255,255,255,0.3)", marginBottom: 6, textTransform: "uppercase" }}>
          Renovation Planning · Step 4
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>
          Material Simulation Setup
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: 0, lineHeight: 1.6 }}>
          Select which Wikells materials to test for each building component.
          The tool will generate all combinations and send them to simulation.
        </p>
      </div>

      {/* Building scope selector */}
      {buildings.length > 0 && (
        <div style={{
          borderRadius: 14, padding: "16px 18px",
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Building2 size={14} color="#4ECDC4" />
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.75)" }}>Apply combinations to</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {/* All buildings toggle */}
            <button
              onClick={() => setBuildingScope("all")}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 8, border: `1px solid ${buildingScope === "all" ? "rgba(78,205,196,0.5)" : "rgba(255,255,255,0.1)"}`,
                background: buildingScope === "all" ? "rgba(78,205,196,0.12)" : "rgba(255,255,255,0.04)",
                color: buildingScope === "all" ? "#4ECDC4" : "rgba(255,255,255,0.5)",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              <Users size={12} />
              All buildings ({buildings.length})
            </button>
            {/* Per-building toggles */}
            {buildings.map(b => {
              const isSelected = Array.isArray(buildingScope) && buildingScope.includes(b.id);
              return (
                <button
                  key={b.id}
                  onClick={() => {
                    if (buildingScope === "all") {
                      setBuildingScope([b.id]);
                    } else {
                      const cur = buildingScope as string[];
                      setBuildingScope(cur.includes(b.id)
                        ? cur.filter(id => id !== b.id)
                        : [...cur, b.id]
                      );
                    }
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 8,
                    border: `1px solid ${isSelected ? "rgba(114,28,184,0.5)" : "rgba(255,255,255,0.1)"}`,
                    background: isSelected ? "rgba(114,28,184,0.15)" : "rgba(255,255,255,0.04)",
                    color: isSelected ? "#c084fc" : "rgba(255,255,255,0.5)",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                  title={b.label}
                >
                  {isSelected ? <CheckSquare size={12} /> : <Building2 size={12} />}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{b.label}</span>
                </button>
              );
            })}
          </div>
          {Array.isArray(buildingScope) && buildingScope.length === 0 && (
            <p style={{ fontSize: 11, color: "#F59E0B", marginTop: 8, marginBottom: 0 }}>⚠ Select at least one building, or switch back to "All buildings".</p>
          )}
        </div>
      )}

      {/* Stats bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Buildings", value: buildingScope === "all" ? (buildings.length || "All") : (buildingScope as string[]).length, color: "#4ECDC4" },
          { label: "Materials selected", value: totalSelected, color: "#4ECDC4" },
          { label: "Packages to simulate", value: combinations.length, color: combinations.length > 50 ? "#F59E0B" : "#96D74C" },
          { label: "Est. runtime", value: combinations.length === 0 ? "—" : `~${Math.ceil(combinations.length * 0.5)} min`, color: "rgba(255,255,255,0.5)" },
        ].map(s => (
          <div key={s.label} style={{
            borderRadius: 12, padding: "14px 16px",
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
          }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 700 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Main layout: component tabs + material picker */}
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16 }}>

        {/* Component list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: 1.2, marginBottom: 4, textTransform: "uppercase" }}>
            Building Components
          </div>
          {components.map(comp => {
            const count = materials[comp]?.length ?? 0;
            const color = COMPONENT_COLORS[comp] ?? "#721CB8";
            const isActive = activeComponent === comp;
            return (
              <button
                key={comp}
                onClick={() => setActiveComponent(comp)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 12px", borderRadius: 10, border: `1px solid ${isActive ? `${color}55` : "rgba(255,255,255,0.07)"}`,
                  background: isActive ? `${color}18` : "rgba(255,255,255,0.03)",
                  cursor: "pointer", transition: "all .12s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: count > 0 ? color : "rgba(255,255,255,0.15)", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? "#fff" : "rgba(255,255,255,0.6)" }}>
                    {COMPONENT_LABEL[comp] ?? comp}
                  </span>
                </div>
                {count > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, color, background: `${color}22`, borderRadius: 10, padding: "1px 7px" }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          {components.length === 0 && (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>
              No components defined. Go back to Step 1 to select renovation scope.
            </p>
          )}
        </div>

        {/* Material picker */}
        <div style={{
          borderRadius: 14, padding: "18px 20px",
          background: "rgba(255,255,255,0.03)", border: `1px solid ${COMPONENT_COLORS[activeComponent] ?? "#721CB8"}33`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: COMPONENT_COLORS[activeComponent] ?? "#721CB8" }} />
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: 0 }}>
              {COMPONENT_LABEL[activeComponent] ?? activeComponent}
            </h3>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
              — select materials to test
            </span>
            {(materials[activeComponent]?.length ?? 0) > 0 && (
              <button
                onClick={() => setMaterials(m => ({ ...m, [activeComponent]: [] }))}
                style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.3)", background: "transparent", border: 0, cursor: "pointer" }}
              >
                Clear all
              </button>
            )}
          </div>
          <MaterialPicker
            component={activeComponent}
            selected={materials[activeComponent] ?? []}
            onChange={codes => setMaterials(m => ({ ...m, [activeComponent]: codes }))}
          />
        </div>
      </div>

      {/* Combination preview */}
      {combinations.length > 0 && (
        <div style={{ borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <button
            onClick={() => setShowPreview(v => !v)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 18px", border: 0, background: "transparent", color: "#fff", cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Eye size={16} color="#4ECDC4" />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Preview Combinations</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                {combinations.length} packages will be simulated
              </span>
            </div>
            {showPreview ? <ChevronUp size={16} color="rgba(255,255,255,0.4)" /> : <ChevronDown size={16} color="rgba(255,255,255,0.4)" />}
          </button>
          {showPreview && (
            <div style={{ padding: "0 18px 18px" }}>
              <SimulationPreview combinations={combinations} />
            </div>
          )}
        </div>
      )}

      {/* Warning for large batch */}
      {combinations.length > 50 && (
        <div style={{ borderRadius: 10, padding: "12px 16px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ fontSize: 14 }}>⚠️</span>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#F59E0B", margin: "0 0 2px" }}>Large simulation batch</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", margin: 0 }}>
              {combinations.length} combinations detected. Consider reducing the number of materials per component to keep simulation time manageable.
            </p>
          </div>
        </div>
      )}

      {/* Simulation progress + results */}
      {(simRunning || simResults) && (
        <div style={{
          borderRadius: 14, padding: "20px 22px",
          background: simResults ? "rgba(150,215,76,0.04)" : "rgba(255,255,255,0.03)",
          border: `1px solid ${simResults ? "rgba(150,215,76,0.22)" : "rgba(255,255,255,0.08)"}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            {simRunning
              ? <Loader2 size={15} color="#96D74C" style={{ animation: "spin 1s linear infinite" }} />
              : <BarChart2 size={15} color="#96D74C" />}
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>
              {simRunning ? "Running EPSM simulation…" : "Simulation Results"}
            </span>
            {simResults && (
              <>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{simResults.length} packages ranked by energy saving</span>
                <button
                  onClick={downloadSimResults}
                  style={{
                    marginLeft: "auto", display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 13px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                    border: "1px solid rgba(78,205,196,0.35)", background: "rgba(78,205,196,0.08)", color: "#4ECDC4",
                  }}
                >
                  <Download size={12} /> Download JSON
                </button>
              </>
            )}
          </div>

          {/* Progress bar */}
          {simRunning && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Testing {combinations.length} package{combinations.length !== 1 ? "s" : ""}…</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#96D74C" }}>{simProgress}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 4, background: "rgba(255,255,255,0.08)" }}>
                <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#721CB8,#96D74C)", width: `${simProgress}%`, transition: "width 0.2s" }} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {["Loading baseline", "Applying material properties", "Running energy model", "Computing carbon impact", "Ranking packages"].map((s, i) => (
                  <span key={s} style={{
                    fontSize: 10, padding: "2px 8px", borderRadius: 6, fontWeight: 600,
                    background: simProgress > i * 20 ? "rgba(150,215,76,0.12)" : "rgba(255,255,255,0.04)",
                    color: simProgress > i * 20 ? "#96D74C" : "rgba(255,255,255,0.25)",
                    border: `1px solid ${simProgress > i * 20 ? "rgba(150,215,76,0.25)" : "rgba(255,255,255,0.07)"}`,
                  }}>{simProgress > i * 20 ? "✓" : "○"} {s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Results table */}
          {simResults && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {/* Baseline row */}
              <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 120px 120px 120px 120px", gap: 10, padding: "4px 12px", marginBottom: 2 }}>
                <span />
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1 }}>Package</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1, textAlign: "right" }}>Energy use</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#96D74C", textTransform: "uppercase", letterSpacing: 1, textAlign: "right" }}>Saving</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 1, textAlign: "right" }}>CO₂e saved</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1, textAlign: "right" }}>Cost</span>
              </div>
              {/* Baseline reference */}
              <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 120px 120px 120px 120px", gap: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>—</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.35)" }}>Baseline (as-built)</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)", textAlign: "right" }}>{baselineEnergyUse} kWh/m²</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", textAlign: "right" }}>—</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", textAlign: "right" }}>—</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", textAlign: "right" }}>—</span>
              </div>
              {simResults.map((r, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "28px 1fr 120px 120px 120px 120px", gap: 10,
                  padding: "10px 12px", borderRadius: 10, alignItems: "center",
                  background: i === 0 ? "rgba(150,215,76,0.06)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${i === 0 ? "rgba(150,215,76,0.22)" : "rgba(255,255,255,0.06)"}`,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? "#96D74C" : "rgba(255,255,255,0.25)" }}>{i === 0 ? "★" : `#${i + 1}`}</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {Object.entries(r.components).map(([comp, item]) => (
                      <span key={comp} style={{
                        fontSize: 9, padding: "1px 6px", borderRadius: 5,
                        background: `${COMPONENT_COLORS[comp] ?? "#721CB8"}22`,
                        color: COMPONENT_COLORS[comp] ?? "#721CB8",
                        border: `1px solid ${COMPONENT_COLORS[comp] ?? "#721CB8"}44`,
                      }}>{COMPONENT_LABEL[comp] ?? comp}: {item.code}</span>
                    ))}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.65)", textAlign: "right" }}>{r.energyUse} kWh/m²</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#96D74C", textAlign: "right" }}>−{r.saving} kWh/m²</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa", textAlign: "right" }}>−{r.carbonSaving} kg</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", textAlign: "right" }}>{r.cost.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} SEK/m²</span>
                </div>
              ))}
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontStyle: "italic", margin: "2px 0 0" }}>
                * Illustrative EPSM outputs. Energy saving relative to as-built baseline ({baselineEnergyUse} kWh/m²·yr).
              </p>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button
          onClick={() => navigate("/step/3")}
          style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.65)", fontSize: 13, cursor: "pointer" }}
        >
          ← Back
        </button>
        {combinations.length > 0 && (
          <button
            disabled={simRunning}
            onClick={runSimulation}
            style={{
              marginLeft: "auto",
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 20px", borderRadius: 10,
              border: `1px solid ${simRunning ? "rgba(255,255,255,0.08)" : "rgba(150,215,76,0.4)"}`,
              background: simRunning ? "rgba(255,255,255,0.04)" : "rgba(150,215,76,0.12)",
              color: simRunning ? "rgba(255,255,255,0.25)" : "#96D74C",
              fontSize: 13, fontWeight: 700, cursor: simRunning ? "not-allowed" : "pointer",
            }}
          >
            {simRunning ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Play size={14} />}
            {simRunning ? "Simulating…" : simResults ? "Re-run Simulation" : "Send to Simulation"}
          </button>
        )}
      </div>

    </div>
  );
}
