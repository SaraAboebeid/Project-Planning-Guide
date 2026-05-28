import { useState, useMemo } from "react";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";
import { getDeliverableSections, CROSS_CUTTING } from "../config/deliverables";

interface Props {
  projectType: string | null;
  systemsInScope: string[];
}

export default function DeliverablesSection({ projectType, systemsInScope }: Props) {
  const sections = useMemo(
    () => getDeliverableSections(projectType, systemsInScope),
    [projectType, systemsInScope],
  );

  const totalItems = sections.reduce((s, [, items]) => s + items.length, 0) + CROSS_CUTTING.length;

  const [openSects, setOpenSects] = useState<Set<string>>(
    () => new Set(sections.map(([t]) => t)),
  );
  const toggle = (k: string) =>
    setOpenSects(prev => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  const [crossOpen, setCrossOpen] = useState(true);

  if (sections.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-400 text-sm">
        No deliverables mapped yet — complete Step 1 to see your report scope.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-[#721CB8]" />
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Expected Deliverables
        </span>
        <span className="ml-auto text-xs font-semibold text-[#721CB8] bg-[#721CB8]/8 rounded-full px-2.5 py-0.5">
          {totalItems} items
        </span>
      </div>

      {/* Section accordions */}
      <div className="space-y-2">
        {sections.map(([title, items]) => {
          const open = openSects.has(title);
          return (
            <div key={title} className="rounded-xl border border-slate-200 overflow-hidden">
              <button
                onClick={() => toggle(title)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition text-left"
              >
                <span className="font-semibold text-xs text-slate-700">
                  {title}{" "}
                  <span className="text-slate-400 font-normal">({items.length})</span>
                </span>
                {open
                  ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                  : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
              </button>
              {open && (
                <div className="px-4 pb-3 space-y-1.5">
                  {items.map(([name, desc]) => (
                    <div
                      key={name}
                      className="pl-3 py-1.5 rounded-lg bg-slate-50 border-l-[3px] border-[#995BD5]"
                    >
                      <div className="text-xs font-semibold text-slate-800">{name}</div>
                      <div className="text-[11px] text-slate-500">{desc}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Cross-cutting */}
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <button
            onClick={() => setCrossOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition text-left"
          >
            <span className="font-semibold text-xs text-slate-700">
              Cross-Cutting{" "}
              <span className="text-slate-400 font-normal">({CROSS_CUTTING.length})</span>
            </span>
            {crossOpen
              ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </button>
          {crossOpen && (
            <div className="px-4 pb-3 space-y-1.5">
              {CROSS_CUTTING.map(([name, desc]) => (
                <div
                  key={name}
                  className="pl-3 py-1.5 rounded-lg bg-slate-50 border-l-[3px] border-slate-300"
                >
                  <div className="text-xs font-semibold text-slate-800">{name}</div>
                  <div className="text-[11px] text-slate-500">{desc}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
