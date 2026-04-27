import { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronUp, TrendingDown, TrendingUp, Leaf } from "lucide-react";
import { WIKELLS_CHAPTERS, wikellsStats, type WikellsItem } from "../../config/wikellsData";
import { WIKELLS_CARBON_MAP, getCarbonCategory } from "../../config/wikellsCarbonMapping";

/* ── helpers ── */
function uBand(u?: number) {
  if (!u) return null;
  if (u <= 0.13) return { label: "Excellent", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (u <= 0.20) return { label: "Good",      cls: "bg-teal-100   text-teal-700   border-teal-200"    };
  if (u <= 0.30) return { label: "Standard",  cls: "bg-amber-100  text-amber-700  border-amber-200"   };
  return              { label: "Basic",       cls: "bg-slate-100  text-slate-600  border-slate-200"   };
}

function costBand(cost: number, min: number, max: number) {
  const pct = (cost - min) / (max - min);
  if (pct < 0.25) return "text-emerald-600";
  if (pct < 0.60) return "text-amber-600";
  return "text-rose-600";
}

/* ── Row ── */
function ItemRow({ item, min, max }: { item: WikellsItem; min: number; max: number }) {
  const ub = uBand(item.uValue);
  const carbonData = WIKELLS_CARBON_MAP[item.code];
  const carbonCat = carbonData ? getCarbonCategory(carbonData.kgCO2ePerM2) : null;
  
  // Map carbon category to Tailwind classes (avoid dynamic class names)
  const getCarbonBadgeClasses = (color: string) => {
    const colorMap: Record<string, string> = {
      emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
      teal: "bg-teal-100 text-teal-700 border-teal-200",
      amber: "bg-amber-100 text-amber-700 border-amber-200",
      orange: "bg-orange-100 text-orange-700 border-orange-200",
      rose: "bg-rose-100 text-rose-700 border-rose-200",
    };
    return colorMap[color] || "bg-slate-100 text-slate-700 border-slate-200";
  };
  
  return (
    <tr className="border-b border-slate-100 hover:bg-[#f7f5fb] transition-colors group">
      <td className="py-2.5 pl-3 pr-2 text-[11px] font-mono text-slate-400 whitespace-nowrap">{item.code}</td>
      <td className="py-2.5 pr-4 text-xs text-slate-700 leading-snug">{item.description}</td>
      <td className={`py-2.5 pr-4 text-xs font-bold tabular-nums whitespace-nowrap ${costBand(item.costSEK, min, max)}`}>
        {item.costSEK.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
      <td className="py-2.5 pr-4 whitespace-nowrap">
        {carbonData ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold text-slate-700 tabular-nums">
              {carbonData.kgCO2ePerM2.toFixed(1)}
            </span>
            <span className="text-[9px] text-slate-400">kg CO₂e</span>
          </div>
        ) : (
          <span className="text-[11px] text-slate-400">—</span>
        )}
      </td>
      <td className="py-2.5 pr-4 whitespace-nowrap">
        {carbonCat ? (
          <span className={`inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${getCarbonBadgeClasses(carbonCat.color)}`}>
            {carbonCat.label}
          </span>
        ) : "—"}
      </td>
      <td className="py-2.5 pr-4 text-[10px] text-slate-500 whitespace-nowrap">{item.unit}</td>
      <td className="py-2.5 pr-4 text-[11px] text-slate-500 whitespace-nowrap">
        {item.weightKgM2 != null ? `${item.weightKgM2} kg/m²` : "—"}
      </td>
      <td className="py-2.5 pr-3 whitespace-nowrap">
        {ub ? (
          <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${ub.cls}`}>
            U={item.uValue} ({ub.label})
          </span>
        ) : item.soundRw != null ? (
          <span className="text-[11px] text-slate-600">R'w = {item.soundRw} dB</span>
        ) : "—"}
      </td>
    </tr>
  );
}

/* ── Main panel ── */
export default function WikellsPanel() {
  const [query,      setQuery]      = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(["ch7-Timber Stud Frame"]));
  const [sortBy,     setSortBy]     = useState<"cost-asc" | "cost-desc" | "carbon-asc" | "carbon-desc">("cost-asc");
  const [activeChap, setActiveChap] = useState("ch7");

  const stats = wikellsStats();

  const chapter = WIKELLS_CHAPTERS.find(c => c.id === activeChap)!;

  // Chapter-specific stats
  const chapterItems = useMemo(() => chapter.subGroups.flatMap(sg => sg.items), [chapter]);
  const chapterStats = useMemo(() => {
    if (chapterItems.length === 0) return null;
    const costs = chapterItems.map(i => i.costSEK);
    let minItem = chapterItems[0]!;
    let maxItem = chapterItems[0]!;
    let minCarbonItem: WikellsItem | null = null;
    let maxCarbonItem: WikellsItem | null = null;
    let minCarbon = Infinity;
    let maxCarbon = -Infinity;
    
    for (const item of chapterItems) {
      if (item.costSEK < minItem.costSEK) minItem = item;
      if (item.costSEK > maxItem.costSEK) maxItem = item;
      
      const carbonData = WIKELLS_CARBON_MAP[item.code];
      if (carbonData) {
        if (carbonData.kgCO2ePerM2 < minCarbon) {
          minCarbon = carbonData.kgCO2ePerM2;
          minCarbonItem = item;
        }
        if (carbonData.kgCO2ePerM2 > maxCarbon) {
          maxCarbon = carbonData.kgCO2ePerM2;
          maxCarbonItem = item;
        }
      }
    }
    
    return {
      count: chapterItems.length,
      minCost: Math.min(...costs),
      maxCost: Math.max(...costs),
      minItem,
      maxItem,
      minCarbonItem,
      maxCarbonItem,
      minCarbon: minCarbon === Infinity ? null : minCarbon,
      maxCarbon: maxCarbon === -Infinity ? null : maxCarbon,
    };
  }, [chapterItems]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return chapter.subGroups.map(sg => ({
      ...sg,
      items: sg.items
        .filter(i =>
          !q ||
          i.description.toLowerCase().includes(q) ||
          i.code.includes(q)
        )
        .sort((a, b) => {
          if (sortBy === "cost-asc")  return a.costSEK - b.costSEK;
          if (sortBy === "cost-desc") return b.costSEK - a.costSEK;
          if (sortBy === "carbon-asc") {
            const aCarbon = WIKELLS_CARBON_MAP[a.code]?.kgCO2ePerM2 ?? Infinity;
            const bCarbon = WIKELLS_CARBON_MAP[b.code]?.kgCO2ePerM2 ?? Infinity;
            return aCarbon - bCarbon;
          }
          // carbon-desc
          const aCarbon = WIKELLS_CARBON_MAP[a.code]?.kgCO2ePerM2 ?? -Infinity;
          const bCarbon = WIKELLS_CARBON_MAP[b.code]?.kgCO2ePerM2 ?? -Infinity;
          return bCarbon - aCarbon;
        }),
    })).filter(sg => sg.items.length > 0);
  }, [chapter, query, sortBy]);

  const toggleGroup = (key: string) =>
    setOpenGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <div className="space-y-4">

      {/* ── Stats bar ── */}
      {chapterStats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl bg-[#f7f5fb] border border-[#e8e0f5] px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-center">Options Available</p>
            <p className="text-lg font-bold text-[#721CB8] mt-0.5 text-center">{chapterStats.count}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 mb-1 flex items-center gap-1">
              💰 Lowest Cost
            </p>
            <p className="text-[11px] text-slate-700 leading-tight mb-0.5 line-clamp-2">{chapterStats.minItem.description}</p>
            <p className="text-sm font-bold text-emerald-700">{chapterStats.minCost.toLocaleString("sv-SE")} SEK/m²</p>
            {WIKELLS_CARBON_MAP[chapterStats.minItem.code] && (
              <p className="text-[10px] text-emerald-600 mt-0.5">
                {WIKELLS_CARBON_MAP[chapterStats.minItem.code]!.kgCO2ePerM2.toFixed(1)} kg CO₂e
              </p>
            )}
          </div>
          {chapterStats.minCarbonItem && chapterStats.minCarbon && (
            <div className="rounded-xl bg-teal-50 border border-teal-200 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-600 mb-1 flex items-center gap-1">
                <Leaf className="w-3 h-3" /> Lowest Carbon
              </p>
              <p className="text-[11px] text-slate-700 leading-tight mb-0.5 line-clamp-2">{chapterStats.minCarbonItem.description}</p>
              <p className="text-sm font-bold text-teal-700">{chapterStats.minCarbon.toFixed(1)} kg CO₂e/m²</p>
              <p className="text-[10px] text-teal-600 mt-0.5">
                {chapterStats.minCarbonItem.costSEK.toLocaleString("sv-SE")} SEK/m²
              </p>
            </div>
          )}
          {chapterStats.maxCarbonItem && chapterStats.maxCarbon && (
            <div className="rounded-xl bg-orange-50 border border-orange-200 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-600 mb-1">Highest Carbon</p>
              <p className="text-[11px] text-slate-700 leading-tight mb-0.5 line-clamp-2">{chapterStats.maxCarbonItem.description}</p>
              <p className="text-sm font-bold text-orange-700">{chapterStats.maxCarbon.toFixed(1)} kg CO₂e/m²</p>
              <p className="text-[10px] text-orange-600 mt-0.5">
                {chapterStats.maxCarbonItem.costSEK.toLocaleString("sv-SE")} SEK/m²
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Chapter tabs ── */}
      <div className="flex gap-2 border-b border-slate-200 pb-0">
        {WIKELLS_CHAPTERS.map(c => (
          <button
            key={c.id}
            onClick={() => { setActiveChap(c.id); setQuery(""); }}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg border border-b-0 transition-colors ${
              activeChap === c.id
                ? "bg-white border-slate-200 text-[#721CB8] -mb-px z-10"
                : "bg-slate-50 border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {c.titleEN}
          </button>
        ))}
      </div>

      {/* ── Controls ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            className="ppg-input pl-8 text-xs h-8"
            placeholder="Search assemblies…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="font-medium">Sort by price:</span>
            {(["cost-asc", "cost-desc"] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                  sortBy === s
                    ? "bg-[#721CB8]/10 border-[#721CB8]/30 text-[#721CB8]"
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                {s === "cost-asc"
                  ? <><TrendingDown className="w-3 h-3" /> Low to High</>
                  : <><TrendingUp   className="w-3 h-3" /> High to Low</>}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-medium">Or by carbon:</span>
            {(["carbon-asc", "carbon-desc"] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                  sortBy === s
                    ? "bg-teal-600/10 border-teal-600/30 text-teal-700"
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                <Leaf className="w-3 h-3" />
                {s === "carbon-asc" ? "Low to High" : "High to Low"}
              </button>
            ))}
          </div>
        </div>
        <span className="text-[11px] text-slate-400 ml-auto">
          {filtered.reduce((n, g) => n + g.items.length, 0)} assemblies
        </span>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-4 text-[11px] text-slate-500">
        <div className="flex items-center gap-3">
          <span className="font-medium text-slate-600">Cost:</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            Low
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500  inline-block" />
            Mid
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500   inline-block" />
            High
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-medium text-slate-600">Carbon:</span>
          <span className="flex items-center gap-1.5">
            <Leaf className="w-3 h-3 text-emerald-600" />
            Very Low
          </span>
          <span className="flex items-center gap-1.5">
            <Leaf className="w-3 h-3 text-teal-600" />
            Low
          </span>
          <span className="flex items-center gap-1.5">
            <Leaf className="w-3 h-3 text-amber-600" />
            Moderate
          </span>
          <span className="flex items-center gap-1.5">
            <Leaf className="w-3 h-3 text-orange-600" />
            High
          </span>
        </div>
        <span className="ml-auto italic text-slate-400">
          Cost from Wikells · Carbon from Boverket
        </span>
      </div>

      {/* ── Sub-group tables ── */}
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-slate-400 italic">No assemblies match your search.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(sg => {
            const key = `${activeChap}-${sg.label}`;
            const isOpen = openGroups.has(key);
            return (
              <div key={key} className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleGroup(key)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition text-left"
                >
                  <span className="text-xs font-semibold text-slate-700">{sg.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">{sg.items.length} items</span>
                    {isOpen
                      ? <ChevronUp   className="w-4 h-4 text-slate-400" />
                      : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>
                {isOpen && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[700px]">
                      <thead>
                        <tr className="bg-[#f7f5fb] border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          <th className="py-2 pl-3 pr-2 whitespace-nowrap">Code</th>
                          <th className="py-2 pr-4">Assembly description</th>
                          <th className="py-2 pr-4 whitespace-nowrap">Cost</th>
                          <th className="py-2 pr-4 whitespace-nowrap">Carbon</th>
                          <th className="py-2 pr-4 whitespace-nowrap">Impact</th>
                          <th className="py-2 pr-4 whitespace-nowrap">Unit</th>
                          <th className="py-2 pr-4 whitespace-nowrap">Weight</th>
                          <th className="py-2 pr-3 whitespace-nowrap">Thermal / Sound</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sg.items.map(item => (
                          <ItemRow
                            key={item.code}
                            item={item}
                            min={stats.minCost}
                            max={stats.maxCost}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-slate-400 border-t border-slate-100 pt-3">
        <strong>Cost data</strong> from <em>Wikells Sektionsfakta</em> (Swedish construction cost database).
        <strong>Carbon footprint</strong> from <em>Boverket Klimatdatabas</em> (GWP A1-A3, kg CO₂e/m²).
        Values are approximations based on typical material quantities. Carbon confidence levels: High = direct material mapping, Medium/Low = estimated from similar materials.
        Always verify against current data. M-values denote insulation thickness (mm).
        EW = Exterior Wall · IW = Interior Wall · CLT = Cross-Laminated Timber.
      </p>
    </div>
  );
}
