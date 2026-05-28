import { useEffect, useState, useMemo, useId } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore, type RenovationPackage } from "../store/wizard";
import { WIKELLS_CHAPTERS, type WikellsItem, type WikellsSubGroup } from "../config/wikellsData";
import { WIKELLS_CARBON_MAP } from "../config/wikellsCarbonMapping";
import DeliverablesSection from "../components/DeliverablesSection";
import {
  Plus, Trash2, Copy, Package, Leaf, DollarSign,
  ChevronDown, ChevronUp, Building2, Info, CheckCircle2,
  Layers, Hammer, Settings2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

/* ─── Constants ───────────────────────────────────────────────────── */
const PACKAGE_COLORS = ["#721CB8", "#995BD5", "#96D74C", "#509724"];
const PACKAGE_NAMES  = ["Package A", "Package B", "Package C", "Package D"];

/* ─── Fixed building elements for vertical extension ─────────────── */
interface ElementDef {
  key:        string;
  label:      string;
  areaType:   "wall" | "roof" | "floor" | "window";
  areaNote:   string;
  description: string;
  chapFilter: (chId: string, sgLabel: string) => boolean;
}

const ELEMENTS: ElementDef[] = [
  {
    key:         "Exterior Wall",
    label:       "Exterior Wall",
    areaType:    "wall",
    areaNote:    "≈ perimeter × floor height × new floors",
    description: "Full wall assembly — structure, insulation & cladding",
    chapFilter:  (ch) => ch === "ch7",
  },
  {
    key:         "Roof",
    label:       "Roof",
    areaType:    "roof",
    areaNote:    "= building footprint",
    description: "Roof assembly at the top of the extension",
    chapFilter:  (ch) => ch === "ch11",
  },
  {
    key:         "New Floor Slab",
    label:       "New Floor Slab",
    areaType:    "floor",
    areaNote:    "= footprint × floors added",
    description: "Intermediate floor slab for each new storey",
    chapFilter:  (ch, sg) => ch === "ch9" && sg === "Intermediate Floors",
  },
];

/* ─── Helpers ─────────────────────────────────────────────────────── */
function getSubGroups(el: ElementDef): WikellsSubGroup[] {
  return WIKELLS_CHAPTERS
    .flatMap(ch => ch.subGroups
      .filter(sg => el.chapFilter(ch.id, sg.label))
      .map(sg => ({ ...sg, chLabel: ch.titleEN }))
    );
}

function allItemsForElement(el: ElementDef): WikellsItem[] {
  return getSubGroups(el)
    .flatMap(sg => sg.items)
    .filter(i => i.unit === "SEK/m²");
}

function itemByCode(code: string): WikellsItem | undefined {
  return WIKELLS_CHAPTERS
    .flatMap(ch => ch.subGroups.flatMap(sg => sg.items))
    .find(i => i.code === code);
}

function computePackageTotals(pkg: RenovationPackage) {
  let totalCostSEK  = 0;
  let totalCarbonKg = 0;
  let hasAllCarbon  = true;
  for (const sel of Object.values(pkg.selections)) {
    const item = itemByCode(sel.wikellsCode);
    if (!item || sel.areaM2 <= 0) continue;
    totalCostSEK += item.costSEK * sel.areaM2;
    const cd = WIKELLS_CARBON_MAP[sel.wikellsCode];
    if (cd) {
      totalCarbonKg += cd.kgCO2ePerM2 * sel.areaM2;
    } else {
      hasAllCarbon = false;
      totalCarbonKg += 30 * sel.areaM2;
    }
  }
  return { totalCostSEK, totalCarbonKg, hasAllCarbon };
}

function fmtSEK(n: number) {
  return n.toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/* ─── Building area calculation ───────────────────────────────────── */
interface BldgRow {
  address:   string;
  footprint: number;
  grossWallArea: number;
  windowArea: number;
  opaqueWallArea: number;
  roofArea:  number;
  floorArea: number;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function inferWwrFromArchetype(useCat: string | null, year: number | null): number {
  let wwr = 28;
  const u = (useCat ?? "").toLowerCase();

  if (u.includes("office") || u.includes("commercial")) wwr = 40;
  else if (u.includes("school") || u.includes("education")) wwr = 35;
  else if (u.includes("retail")) wwr = 45;
  else if (u.includes("residential") || u.includes("multi") || u.includes("apartment")) wwr = 25;

  if (year && year < 1945) wwr -= 4;
  else if (year && year < 1975) wwr -= 2;
  else if (year && year >= 2000) wwr += 4;

  return clamp(Math.round(wwr), 10, 65);
}

function calcBuildingAreas(footprint: number, newFloors: number, floorH: number): {
  grossWallArea: number; windowArea: number; opaqueWallArea: number; roofArea: number; floorArea: number;
}
function calcBuildingAreas(footprint: number, newFloors: number, floorH: number, wwrPct: number): {
  grossWallArea: number; windowArea: number; opaqueWallArea: number; roofArea: number; floorArea: number;
} {
  const perimeter = 4 * Math.sqrt(footprint);   // square approximation
  const grossWallArea = Math.round(perimeter * floorH * newFloors);
  const windowArea = Math.round(grossWallArea * (clamp(wwrPct, 0, 90) / 100));
  const opaqueWallArea = Math.max(0, grossWallArea - windowArea);
  return {
    grossWallArea,
    windowArea,
    opaqueWallArea,
    roofArea:  Math.round(footprint),
    floorArea: Math.round(footprint * newFloors),
  };
}

/* ─── Element row (Wikells picker + area) ─────────────────────────── */
function ElementRow({
  el, pkgId, selection, defaultArea, onChange,
}: {
  el:          ElementDef;
  pkgId:       string;
  selection:   { wikellsCode: string; areaM2: number } | undefined;
  defaultArea: number;
  onChange:    (code: string, area: number) => void;
}) {
  const subGroups  = useMemo(() => getSubGroups(el), [el]);
  const allItems   = useMemo(() => allItemsForElement(el), [el]);

  const code       = selection?.wikellsCode ?? allItems[0]?.code ?? "";
  const area       = selection?.areaM2 ?? defaultArea;
  const item       = code ? itemByCode(code) : undefined;
  const cd         = code ? WIKELLS_CARBON_MAP[code] : undefined;

  const totalCost   = item ? item.costSEK * area   : 0;
  const totalCarbon = cd   ? cd.kgCO2ePerM2 * area : area > 0 ? 30 * area : 0;
  const carbonEst   = !!area && !cd;

  const [open,    setOpen]    = useState(false);
  const [filter,  setFilter]  = useState("");
  const [sgOpen,  setSgOpen]  = useState<Set<string>>(() => new Set([subGroups[0]?.label ?? ""]));

  const toggleSg = (lbl: string) =>
    setSgOpen(prev => { const n = new Set(prev); n.has(lbl) ? n.delete(lbl) : n.add(lbl); return n; });

  const filteredSgs = useMemo(() => {
    if (!filter) return subGroups;
    const q = filter.toLowerCase();
    return subGroups.map(sg => ({
      ...sg,
      items: sg.items.filter(
        i => i.unit === "SEK/m²" && (i.description.toLowerCase().includes(q) || i.code.includes(q))
      ),
    })).filter(sg => sg.items.length > 0);
  }, [subGroups, filter]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-visible">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100 rounded-t-xl">
        <div>
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">{el.label}</span>
          <span className="ml-2 text-[10px] text-slate-400">{el.description}</span>
        </div>
        {area > 0 && item && (
          <div className="flex items-center gap-3 text-xs">
            <span className="tabular-nums font-semibold text-slate-600">{fmtSEK(totalCost)} SEK</span>
            <span className={`tabular-nums font-semibold ${carbonEst ? "text-amber-600" : "text-emerald-600"}`}>
              {totalCarbon.toFixed(0)} kg CO₂e{carbonEst && <sup className="ml-0.5 text-[9px]">~est</sup>}
            </span>
          </div>
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Area input */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 w-16 flex-shrink-0">Area (m²)</label>
            <input
              type="number" min={0} step={1}
              value={area || ""}
              placeholder={defaultArea > 0 ? String(defaultArea) : "0"}
              onChange={e => onChange(code, parseFloat(e.target.value) || 0)}
              className="w-28 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#721CB8]/30"
            />
          </div>
          {defaultArea > 0 && area !== defaultArea && (
            <button onClick={() => onChange(code, defaultArea)} className="text-[10px] text-[#721CB8] hover:underline">
              Reset to {fmtSEK(defaultArea)} m²
            </button>
          )}
          <span className="text-[10px] text-slate-400 italic">{el.areaNote}</span>
        </div>

        {/* Assembly picker */}
        <div>
          <label className="text-xs text-slate-500 block mb-1">Assembly / material</label>
          <button
            onClick={() => setOpen(o => !o)}
            className="w-full text-left flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs bg-white hover:bg-slate-50 transition"
          >
            <span className="truncate text-slate-700 font-medium pr-2">
              {item ? `${item.code} — ${item.description}` : "Select assembly…"}
            </span>
            <div className="flex items-center gap-2 flex-shrink-0">
              {item && <span className="text-slate-400 tabular-nums">{fmtSEK(item.costSEK)} /m²</span>}
              {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
            </div>
          </button>

          {/* Dropdown — grouped by sub-group */}
          {open && (
            <div className="mt-1 rounded-xl border border-slate-200 bg-white shadow-xl z-30 relative">
              <div className="p-2 border-b border-slate-100 sticky top-0 bg-white rounded-t-xl">
                <input
                  autoFocus
                  type="text" placeholder={`Search ${el.label.toLowerCase()} assemblies…`}
                  value={filter} onChange={e => setFilter(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#721CB8]/30"
                />
              </div>
              <div className="overflow-y-auto max-h-72">
                {filteredSgs.map(sg => {
                  const m2Items = sg.items.filter(i => i.unit === "SEK/m²");
                  if (m2Items.length === 0) return null;
                  const expanded = filter || sgOpen.has(sg.label);
                  return (
                    <div key={sg.label}>
                      <button
                        onClick={() => toggleSg(sg.label)}
                        className="w-full flex items-center justify-between px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border-y border-slate-100 text-left"
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{sg.label}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-slate-400">{m2Items.length} options</span>
                          {expanded ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
                        </div>
                      </button>
                      {expanded && m2Items.map(it => {
                        const icd = WIKELLS_CARBON_MAP[it.code];
                        const isSel = it.code === code;
                        return (
                          <button
                            key={it.code}
                            onClick={() => { onChange(it.code, area); setOpen(false); setFilter(""); }}
                            className={`w-full text-left px-3 py-2 text-xs flex items-start justify-between hover:bg-[#f7f5fb] transition ${isSel ? "bg-[#f0f4ff] font-semibold" : ""}`}
                          >
                            <div className="flex-1 min-w-0 pr-3">
                              <span className="block truncate text-slate-700 leading-snug">{it.description}</span>
                              <div className="flex gap-2 mt-0.5">
                                <span className="text-[10px] text-slate-400 font-mono">{it.code}</span>
                                {it.uValue && <span className="text-[10px] text-teal-600">U={it.uValue}</span>}
                                {it.fireClass && <span className="text-[10px] text-orange-600">{it.fireClass}</span>}
                              </div>
                            </div>
                            <div className="flex-shrink-0 text-right space-y-0.5">
                              <span className="block text-slate-600 font-semibold tabular-nums">{fmtSEK(it.costSEK)} /m²</span>
                              {icd
                                ? <span className="block text-emerald-600 text-[10px] tabular-nums">{icd.kgCO2ePerM2.toFixed(1)} CO₂e</span>
                                : <span className="block text-amber-500 text-[10px]">~CO₂e</span>
                              }
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
                {filteredSgs.length === 0 && (
                  <p className="px-3 py-6 text-xs text-slate-400 text-center italic">No matches</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Selected item badges */}
        {item && (
          <div className="flex flex-wrap gap-1.5">
            {item.uValue && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-700 font-semibold">
                U = {item.uValue} W/m²K
              </span>
            )}
            {item.fireClass && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-orange-700 font-semibold">
                {item.fireClass}
              </span>
            )}
            {item.weightKgM2 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 font-semibold">
                {item.weightKgM2} kg/m²
              </span>
            )}
            {cd
              ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold flex items-center gap-1">
                  <Leaf className="w-2.5 h-2.5" />{cd.kgCO2ePerM2.toFixed(1)} kg CO₂e/m²
                </span>
              : <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-600 font-semibold">
                  Carbon: ~30 kg/m² (fallback)
                </span>
            }
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
export default function RenovationPackages() {
  const navigate = useNavigate();
  const { project, setProject } = useWizardStore();
  const uid = useId();

  /* ─── Extension parameters ─── */
  const [newFloors, setNewFloors] = useState(1);
  const [floorH,    setFloorH]    = useState(3.0);

  /* ─── Buildings from step 2 ─── */
  const buildings  = project.lookedUpBuildings ?? [];
  const singleBldg = project.lookedUpBuilding;
  const bboxStats  = project.bboxStats;

  const autoWwrPct = useMemo(() => {
    const fromDb = project.savedWWR?.average_wwr;
    if (typeof fromDb === "number" && Number.isFinite(fromDb) && fromDb > 0) {
      return clamp(fromDb, 1, 90);
    }

    if (buildings.length > 0) {
      const inferred = buildings.map(b => inferWwrFromArchetype(b.use_cat, b.year));
      return Math.round(inferred.reduce((s, x) => s + x, 0) / inferred.length);
    }
    if (singleBldg) {
      return inferWwrFromArchetype(singleBldg.use_cat, singleBldg.year);
    }
    return 28;
  }, [project.savedWWR, buildings, singleBldg]);

  const [wwrPct, setWwrPct] = useState(autoWwrPct);
  const [wwrEdited, setWwrEdited] = useState(false);

  useEffect(() => {
    if (!wwrEdited) setWwrPct(autoWwrPct);
  }, [autoWwrPct, wwrEdited]);

  const wwrSource = project.savedWWR
    ? `WWR database (${autoWwrPct.toFixed(0)}%)`
    : "Archetype heuristic";

  /* Build a per-building area table */
  const bldgRows = useMemo((): BldgRow[] => {
    if (buildings.length > 0) {
      return buildings
        .filter(b => b.footprint_m2 && b.footprint_m2 > 0)
        .map(b => ({
          address:   b.address,
          footprint: b.footprint_m2!,
              ...calcBuildingAreas(b.footprint_m2!, newFloors, floorH, wwrPct),
        }));
    }
    if (singleBldg?.footprint_m2) {
      const fp = singleBldg.footprint_m2;
      return [{
        address:   singleBldg.address,
        footprint: fp,
        ...calcBuildingAreas(fp, newFloors, floorH, wwrPct),
      }];
    }
    if (bboxStats?.avg_footprint && bboxStats?.count) {
      const fp = bboxStats.avg_footprint;
      return [{
        address:   `${bboxStats.count} buildings (avg)`,
        footprint: fp * bboxStats.count,
        ...calcBuildingAreas(fp * bboxStats.count, newFloors, floorH, wwrPct),
      }];
    }
    return [];
  }, [buildings, singleBldg, bboxStats, newFloors, floorH, wwrPct]);

  const totals = useMemo(() => ({
    buildings: bldgRows.length,
    footprint: bldgRows.reduce((s, r) => s + r.footprint, 0),
    grossWallArea:  bldgRows.reduce((s, r) => s + r.grossWallArea,  0),
    windowArea:  bldgRows.reduce((s, r) => s + r.windowArea,  0),
    opaqueWallArea:  bldgRows.reduce((s, r) => s + r.opaqueWallArea,  0),
    roofArea:  bldgRows.reduce((s, r) => s + r.roofArea,  0),
    floorArea: bldgRows.reduce((s, r) => s + r.floorArea, 0),
  }), [bldgRows]);

  /* Default area per element (total across all buildings) */
  const defaultArea = (areaType: ElementDef["areaType"]): number => {
    if (areaType === "wall")  return totals.opaqueWallArea;
    if (areaType === "roof")  return totals.roofArea;
    if (areaType === "floor") return totals.floorArea;
    if (areaType === "window") return totals.windowArea;
    return 0;
  };

  /* ─── Package state ─── */
  const [packages, setPackages] = useState<RenovationPackage[]>(() => {
    if (project.renovationPackages.length > 0) return project.renovationPackages;
    return [{ id: `${uid}-0`, name: PACKAGE_NAMES[0]!, color: PACKAGE_COLORS[0]!, selections: {} }];
  });
  const [activeTab,    setActiveTab]    = useState(0);
  const [bldgExpanded, setBldgExpanded] = useState(true);

  function updatePackages(next: RenovationPackage[]) {
    setPackages(next);
    setProject({ renovationPackages: next });
  }

  function addPackage() {
    if (packages.length >= 4) return;
    const idx = packages.length;
    updatePackages([...packages, {
      id: `${uid}-${idx}`, name: PACKAGE_NAMES[idx]!, color: PACKAGE_COLORS[idx]!, selections: {},
    }]);
    setActiveTab(idx);
  }

  function removePackage(idx: number) {
    const next = packages.filter((_, i) => i !== idx);
    updatePackages(next);
    setActiveTab(Math.max(0, idx - 1));
  }

  function duplicatePackage(idx: number) {
    if (packages.length >= 4) return;
    const src = packages[idx]!;
    const newIdx = packages.length;
    const clone: RenovationPackage = {
      id:         `${uid}-${newIdx}`,
      name:       `${src.name} (copy)`,
      color:      PACKAGE_COLORS[newIdx]!,
      selections: { ...src.selections },
    };
    updatePackages([...packages, clone]);
    setActiveTab(newIdx);
  }

  function updateSelection(pkgIdx: number, elementKey: string, code: string, area: number) {
    updatePackages(packages.map((p, i) =>
      i !== pkgIdx ? p : {
        ...p,
        selections: { ...p.selections, [elementKey]: { wikellsCode: code, areaM2: area } },
      }
    ));
  }

  /* ─── Comparison data ─── */
  const packageTotals = useMemo(
    () => packages.map(p => ({ ...computePackageTotals(p), pkg: p })),
    [packages]
  );
  const chartData = useMemo(() =>
    packages.map((p, i) => ({
      name:   p.name,
      cost:   Math.round(packageTotals[i]!.totalCostSEK / 1000),
      carbon: Math.round(packageTotals[i]!.totalCarbonKg),
      color:  p.color,
    }))
  , [packages, packageTotals]);

  const hasAnyTotals = packageTotals.some(t => t.totalCostSEK > 0);
  const activePkg    = packages[activeTab];

  /* ════════════════════ RENDER ════════════════════ */
  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">Step 4 – Deliverables</h2>
        <p className="text-sm text-slate-500 mt-1">
          Review the expected deliverables for your project, then configure renovation packages with cost and carbon estimates.
        </p>
      </div>

      {/* Deliverables */}
      <DeliverablesSection
        projectType={project.projectType}
        systemsInScope={project.systemsInScope}
      />

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <button onClick={() => navigate("/step/3")} className="ppg-btn-secondary">← Back</button>
        <button onClick={() => navigate("/step/5")} className="ppg-btn-primary">Continue →</button>
      </div>

      {/* ── Extension parameters ── */}
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-[#3A1C36]" />
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Extension Parameters</span>
        </div>
        <div className="flex flex-wrap gap-6">
          <div>
            <label className="block text-xs text-slate-500 mb-1">New floors to add</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setNewFloors(f => Math.max(1, f - 1))}
                className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 text-sm font-bold"
              >−</button>
              <span className="w-8 text-center font-bold text-[#3A1C36] text-lg tabular-nums">{newFloors}</span>
              <button
                onClick={() => setNewFloors(f => Math.min(10, f + 1))}
                className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 text-sm font-bold"
              >+</button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Floor height (m)</label>
            <input
              type="number" min={2.4} max={5} step={0.1} value={floorH}
              onChange={e => setFloorH(parseFloat(e.target.value) || 3.0)}
              className="w-20 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#3A1C36]/30"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Window-to-wall ratio (WWR %)</label>
            <input
              type="number" min={5} max={80} step={1} value={wwrPct}
              onChange={e => {
                setWwrEdited(true);
                setWwrPct(clamp(parseFloat(e.target.value) || 0, 5, 80));
              }}
              className="w-24 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#3A1C36]/30"
            />
            <div className="text-[10px] text-slate-400 mt-1">Source: {wwrSource}</div>
          </div>
          <div className="flex items-end">
            <div className="text-xs text-slate-400 space-y-0.5">
              <div>Gross wall = 4√footprint × {floorH}m × {newFloors} floor{newFloors > 1 ? "s" : ""}</div>
              <div>Window area = gross wall × {(wwrPct / 100).toFixed(2)} · Opaque wall = gross wall − windows</div>
              <div>Roof area = footprint &nbsp;·&nbsp; Floor area = footprint × {newFloors}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Buildings table ── */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <button
          onClick={() => setBldgExpanded(o => !o)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition text-left"
        >
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#3A1C36]" />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Buildings from Step 2
            </span>
            <span className="text-xs text-slate-400 font-normal">
              ({totals.buildings} building{totals.buildings !== 1 ? "s" : ""})
            </span>
          </div>
          <div className="flex items-center gap-4 mr-2">
            <span className="text-xs text-slate-500 hidden sm:block">
              Opaque wall <strong>{fmtSEK(totals.opaqueWallArea)} m²</strong>
              &nbsp;·&nbsp;Windows <strong>{fmtSEK(totals.windowArea)} m²</strong>
              &nbsp;·&nbsp;Roof <strong>{fmtSEK(totals.roofArea)} m²</strong>
              &nbsp;·&nbsp;Floor <strong>{fmtSEK(totals.floorArea)} m²</strong>
            </span>
            {bldgExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        </button>

        {bldgExpanded && (
          <div className="border-t border-slate-100">
            {bldgRows.length === 0 ? (
              <div className="px-5 py-5 flex items-start gap-2 text-xs text-amber-700">
                <Info className="w-4 h-4 flex-shrink-0 text-amber-500 mt-0.5" />
                No buildings with footprint data loaded from Step 2. Areas will need to be entered manually in each package.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      {["Building", "Footprint", "Gross wall", "Window area", "Opaque wall", "Roof area", "Floor slab"].map(h => (
                        <th key={h} className="text-left px-4 py-2 text-slate-500 font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bldgRows.map((r, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition">
                        <td className="px-4 py-2 font-medium text-slate-700 max-w-[160px] truncate">{r.address}</td>
                        <td className="px-4 py-2 tabular-nums text-slate-600">{fmtSEK(r.footprint)} m²</td>
                        <td className="px-4 py-2 tabular-nums text-slate-700 font-semibold">{fmtSEK(r.grossWallArea)} m²</td>
                        <td className="px-4 py-2 tabular-nums text-sky-600 font-semibold">{fmtSEK(r.windowArea)} m²</td>
                        <td className="px-4 py-2 tabular-nums text-[#721CB8] font-semibold">{fmtSEK(r.opaqueWallArea)} m²</td>
                        <td className="px-4 py-2 tabular-nums text-[#995BD5] font-semibold">{fmtSEK(r.roofArea)} m²</td>
                        <td className="px-4 py-2 tabular-nums text-[#509724] font-semibold">{fmtSEK(r.floorArea)} m²</td>
                      </tr>
                    ))}
                    {bldgRows.length > 1 && (
                      <tr className="bg-slate-50 font-bold border-t border-slate-200">
                        <td className="px-4 py-2 text-slate-700">Total ({bldgRows.length} buildings)</td>
                        <td className="px-4 py-2 tabular-nums text-slate-700">{fmtSEK(totals.footprint)} m²</td>
                        <td className="px-4 py-2 tabular-nums text-slate-700">{fmtSEK(totals.grossWallArea)} m²</td>
                        <td className="px-4 py-2 tabular-nums text-sky-700">{fmtSEK(totals.windowArea)} m²</td>
                        <td className="px-4 py-2 tabular-nums text-[#721CB8]">{fmtSEK(totals.opaqueWallArea)} m²</td>
                        <td className="px-4 py-2 tabular-nums text-[#995BD5]">{fmtSEK(totals.roofArea)} m²</td>
                        <td className="px-4 py-2 tabular-nums text-[#509724]">{fmtSEK(totals.floorArea)} m²</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Package tabs ── */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-visible">
        {/* Tab bar */}
        <div className="flex items-center border-b border-slate-200 bg-slate-50 overflow-x-auto rounded-t-2xl">
          {packages.map((pkg, i) => (
            <button
              key={pkg.id}
              onClick={() => setActiveTab(i)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-all ${
                activeTab === i
                  ? "border-[#3A1C36] text-[#3A1C36] bg-white"
                  : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              <Package className="w-3.5 h-3.5" style={{ color: pkg.color }} />
              {pkg.name}
              {packageTotals[i]!.totalCostSEK > 0 && (
                <span className="text-[9px] text-slate-400 tabular-nums ml-0.5">
                  {(packageTotals[i]!.totalCostSEK / 1000).toFixed(0)} kSEK
                </span>
              )}
            </button>
          ))}
          {packages.length < 4 && (
            <button
              onClick={addPackage}
              className="flex items-center gap-1.5 px-4 py-3 text-xs font-semibold text-slate-400 hover:text-[#3A1C36] border-b-2 border-transparent whitespace-nowrap transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Add package
            </button>
          )}
        </div>

        {activePkg && (
          <div className="p-5 space-y-4">
            {/* Package name + actions */}
            <div className="flex items-center gap-3">
              <input
                type="text" value={activePkg.name}
                onChange={e => updatePackages(packages.map((p, i) => i === activeTab ? { ...p, name: e.target.value } : p))}
                className="flex-1 max-w-xs rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3A1C36]/30"
              />
              <button
                onClick={() => duplicatePackage(activeTab)}
                disabled={packages.length >= 4}
                title="Duplicate package"
                className="p-1.5 rounded-lg text-slate-400 hover:text-[#3A1C36] hover:bg-slate-100 disabled:opacity-30 transition"
              >
                <Copy className="w-4 h-4" />
              </button>
              {packages.length > 1 && (
                <button
                  onClick={() => removePackage(activeTab)}
                  title="Delete package"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* 3 element rows */}
            <div className="space-y-3">
              {ELEMENTS.map(el => (
                <ElementRow
                  key={el.key}
                  el={el}
                  pkgId={activePkg.id}
                  selection={activePkg.selections[el.key]}
                  defaultArea={defaultArea(el.areaType)}
                  onChange={(code, area) => updateSelection(activeTab, el.key, code, area)}
                />
              ))}
            </div>

            {/* Package subtotal */}
            {(() => {
              const t = packageTotals[activeTab]!;
              if (t.totalCostSEK === 0) return (
                <p className="text-xs text-slate-400 italic">Select assemblies above to calculate totals.</p>
              );
              return (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex flex-wrap gap-6">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total Material Cost</div>
                    <div className="text-xl font-bold text-[#721CB8] tabular-nums">{fmtSEK(t.totalCostSEK)} SEK</div>
                    <div className="text-[10px] text-slate-400 tabular-nums">
                      ({(t.totalCostSEK / 1000).toFixed(0)} kSEK &nbsp;·&nbsp; {(t.totalCostSEK / 1_000_000).toFixed(2)} MSEK)
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      Embodied Carbon
                      {!t.hasAllCarbon && <span className="text-amber-500 font-normal">(partly est.)</span>}
                    </div>
                    <div className="text-xl font-bold text-[#995BD5] tabular-nums">{t.totalCarbonKg.toFixed(0)} kg CO₂e</div>
                    <div className="text-[10px] text-slate-400 tabular-nums">
                      ({(t.totalCarbonKg / 1000).toFixed(1)} tonne CO₂e)
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* ── Comparison ── */}
      {hasAnyTotals && packages.length > 1 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-bold text-slate-800">Package Comparison</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 pr-4 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Package</th>
                  <th className="text-right py-2 pr-4 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Cost (SEK)</th>
                  <th className="text-right py-2 pr-4 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Cost / m² wall</th>
                  <th className="text-right py-2 pr-4 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">CO₂e (kg)</th>
                  <th className="text-right py-2 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">CO₂e / m² wall</th>
                </tr>
              </thead>
              <tbody>
                {packageTotals.map((t, i) => {
                  const wallArea   = packages[i]!.selections["Exterior Wall"]?.areaM2 ?? totals.opaqueWallArea;
                  const bestCost   = Math.min(...packageTotals.filter(x => x.totalCostSEK > 0).map(x => x.totalCostSEK));
                  const bestCarbon = Math.min(...packageTotals.filter(x => x.totalCarbonKg > 0).map(x => x.totalCarbonKg));
                  const cheapest   = t.totalCostSEK > 0 && t.totalCostSEK === bestCost;
                  const greenest   = t.totalCarbonKg > 0 && t.totalCarbonKg === bestCarbon;
                  return (
                    <tr key={t.pkg.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: t.pkg.color }} />
                          <span className="font-semibold text-slate-800">{t.pkg.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-right font-bold tabular-nums text-slate-700">
                        {t.totalCostSEK > 0 ? fmtSEK(t.totalCostSEK) : "—"}
                        {cheapest && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">lowest</span>}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-slate-500">
                        {wallArea > 0 && t.totalCostSEK > 0 ? `${fmtSEK(Math.round(t.totalCostSEK / wallArea))} /m²` : "—"}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-bold tabular-nums text-slate-700">
                        {t.totalCarbonKg > 0 ? t.totalCarbonKg.toFixed(0) : "—"}
                        {greenest && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 border border-teal-200">lowest</span>}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-slate-500">
                        {wallArea > 0 && t.totalCarbonKg > 0 ? `${(t.totalCarbonKg / wallArea).toFixed(1)} kg/m²` : "—"}
                        {!t.hasAllCarbon && <sup className="ml-0.5 text-amber-500 text-[8px]">~est</sup>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" /> Cost (kSEK)
              </p>
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={chartData} barSize={36}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} unit=" k" />
                  <Tooltip formatter={(v: number) => [`${v} kSEK`, "Cost"]} />
                  <Bar dataKey="cost" radius={[6, 6, 0, 0]}>
                    {chartData.map(d => <Cell key={d.name} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                <Leaf className="w-3.5 h-3.5 text-emerald-500" /> Embodied Carbon (kg CO₂e)
                {packageTotals.some(t => !t.hasAllCarbon) && (
                  <span className="text-[9px] text-amber-500 font-normal">* partly estimated</span>
                )}
              </p>
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={chartData} barSize={36}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [`${v} kg CO₂e`, "Carbon"]} />
                  <Bar dataKey="carbon" radius={[6, 6, 0, 0]}>
                    {chartData.map(d => <Cell key={d.name} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {packageTotals.some(t => !t.hasAllCarbon) && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2 text-xs text-amber-800">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-500" />
              Some assemblies are missing Boverket carbon data — a fallback of{" "}
              <strong>30 kg CO₂e/m²</strong> is used. Use these figures for relative comparison only.
            </div>
          )}
        </div>
      )}

      {hasAnyTotals && packages.length === 1 && (
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 flex items-center gap-2 text-xs text-slate-400">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          Add a second package to enable side-by-side comparison.
        </div>
      )}
    </div>
  );
}



