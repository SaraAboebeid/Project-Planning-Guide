import { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronUp, TrendingDown, TrendingUp } from "lucide-react";
import { WIKELLS_CHAPTERS, wikellsStats, type WikellsItem } from "../../config/wikellsData";

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
  return (
    <tr className="border-b border-slate-100 hover:bg-[#f7f5fb] transition-colors group">
      <td className="py-2.5 pl-3 pr-2 text-[11px] font-mono text-slate-400 whitespace-nowrap">{item.code}</td>
      <td className="py-2.5 pr-4 text-xs text-slate-700 leading-snug">{item.description}</td>
      <td className={`py-2.5 pr-4 text-xs font-bold tabular-nums whitespace-nowrap ${costBand(item.costSEK, min, max)}`}>
        {item.costSEK.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
  const [sortBy,     setSortBy]     = useState<"cost-asc" | "cost-desc">("cost-asc");
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
    for (const item of chapterItems) {
      if (item.costSEK < minItem.costSEK) minItem = item;
      if (item.costSEK > maxItem.costSEK) maxItem = item;
    }
    return {
      count: chapterItems.length,
      minCost: Math.min(...costs),
      maxCost: Math.max(...costs),
      minItem,
      maxItem,
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
          return b.costSEK - a.costSEK;
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl bg-[#f7f5fb] border border-[#e8e0f5] px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-center">Options Available</p>
            <p className="text-lg font-bold text-[#721CB8] mt-0.5 text-center">{chapterStats.count}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 mb-1">Lowest Cost</p>
            <p className="text-[11px] text-slate-700 leading-tight mb-0.5">{chapterStats.minItem.description}</p>
            <p className="text-sm font-bold text-emerald-700">{chapterStats.minCost.toLocaleString("sv-SE")} SEK/m²</p>
          </div>
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-600 mb-1">Highest Cost</p>
            <p className="text-[11px] text-slate-700 leading-tight mb-0.5">{chapterStats.maxItem.description}</p>
            <p className="text-sm font-bold text-rose-700">{chapterStats.maxCost.toLocaleString("sv-SE")} SEK/m²</p>
          </div>
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
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
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
        <span className="text-[11px] text-slate-400 ml-auto">
          {filtered.reduce((n, g) => n + g.items.length, 0)} assemblies
        </span>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
          Low cost
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500  inline-block" />
          Mid range
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500   inline-block" />
          High cost
        </span>
        <span className="ml-auto italic text-slate-400">
          Prices in SEK/m² · installed section cost · source: Wikells Sektionsfakta
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
        Data extracted from <em>Wikells Sektionsfakta</em> — Swedish construction cost database.
        Costs are installed section costs (SEK/m²) and should be treated as indicative.
        Always verify against current market rates. M-values denote insulation thickness (mm).
        EW = Exterior Wall · IW = Interior Wall · CLT = Cross-Laminated Timber.
      </p>
    </div>
  );
}
