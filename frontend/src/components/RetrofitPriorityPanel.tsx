import { useMemo, useState } from "react";
import { ListOrdered, ChevronDown, ChevronUp, Download, SlidersHorizontal, Scale, Info, ScanSearch } from "lucide-react";
import { useWizardStore } from "../store/wizard";
import {
  computePriorities, normalizeWeights, ahpWeights,
  DEFAULT_WEIGHTS, WEIGHT_PRESETS, CRITERION_LABELS, CRITERION_COLORS,
  type CriterionWeights, type CriterionKey, type PriorityInput, type PriorityResult, type SubScore,
} from "../utils/retrofitPriority";

const CRITS: CriterionKey[] = ["E", "F", "C", "R"];
// The 6 pairwise comparisons for AHP (upper triangle of the 4×4 matrix).
const AHP_PAIRS: [CriterionKey, CriterionKey][] = [["E","F"],["E","C"],["E","R"],["F","C"],["F","R"],["C","R"]];

/** Discrete Saaty position (-8…8) → intensity value (1/9 … 9). 0 = equal. */
const saatyFromPos = (p: number) => (p >= 0 ? p + 1 : 1 / (1 - p));

function pct(x: number) { return `${Math.round(x)}%`; }

function ScoreBar({ k, s }: { k: CriterionKey; s: SubScore }) {
  if (!s.available) {
    return <span className="text-[10px] text-white/25" title={`${CRITERION_LABELS[k]}: ${s.note}`}>—</span>;
  }
  return (
    <div className="flex items-center gap-1.5" title={`${CRITERION_LABELS[k]}: ${Math.round(s.value)} (${s.note})`}>
      <div className="h-1.5 w-10 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${s.value}%`, background: CRITERION_COLORS[k] }} />
      </div>
      <span className="text-[10px] text-white/45 tabular-nums w-5 text-right">{Math.round(s.value)}</span>
    </div>
  );
}

export default function RetrofitPriorityPanel({ items }: { items: PriorityInput[] }) {
  const { project } = useWizardStore();
  const [open, setOpen] = useState(false);
  const [weights, setWeights] = useState<CriterionWeights>(DEFAULT_WEIGHTS);
  const [ahpOpen, setAhpOpen] = useState(false);
  const [ahpPos, setAhpPos] = useState<Record<string, number>>({}); // "E>F" → position
  const [topN, setTopN] = useState<number>(Math.max(1, Math.ceil(items.length * 0.2)));

  const norm = normalizeWeights(weights);

  const ranked: PriorityResult[] = useMemo(
    () => computePriorities(items, project.facadeDefects ?? {}, weights),
    [items, project.facadeDefects, weights],
  );

  // How many buildings have a façade AI inspection feeding the F criterion (live).
  const inspectedCount = useMemo(() => {
    const fd = project.facadeDefects ?? {};
    return items.filter(it => fd[it.key]).length;
  }, [items, project.facadeDefects]);

  // Live AHP derivation from the current pairwise positions.
  const ahp = useMemo(() => {
    const pairs: Record<string, number> = {};
    for (const [a, b] of AHP_PAIRS) pairs[`${a}>${b}`] = saatyFromPos(ahpPos[`${a}>${b}`] ?? 0);
    return ahpWeights(pairs);
  }, [ahpPos]);

  const setW = (k: CriterionKey, v: number) => setWeights(w => ({ ...w, [k]: v }));

  const exportCsv = () => {
    const head = ["rank", "building", "priority", "E_energy", "F_facade", "C_building", "R_potential", "confidence_pct", "drivers"];
    const cell = (s: { value: number; available: boolean }) => s.available ? s.value.toFixed(0) : "";
    const rows = ranked.map((r, i) => [
      i + 1, `"${r.label.replace(/"/g, '""')}"`, r.P.toFixed(1),
      cell(r.scores.E), cell(r.scores.F), cell(r.scores.C), cell(r.scores.R),
      Math.round(r.confidence * 100), `"${r.drivers.join("; ").replace(/"/g, '""')}"`,
    ].join(","));
    const blob = new Blob([[head.join(","), ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "retrofit_priority_ranking.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  if (!items.length) return null;

  const scoreColor = (p: number) => p >= 70 ? "#ef4444" : p >= 50 ? "#f59e0b" : p >= 30 ? "#eab308" : "#22c55e";

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-white/[0.03] transition"
      >
        <span className="p-1.5 rounded-lg bg-amber-500/15 text-amber-300"><ListOrdered className="w-4 h-4" /></span>
        <span className="flex-1">
          <span className="block text-sm font-semibold text-white">Retrofit prioritization</span>
          <span className="block text-[11px] text-white/40">
            Ranks {items.length} building{items.length === 1 ? "" : "s"} by a weighted score of energy, façade condition,
            characteristics &amp; retrofit potential — which to retrofit first.
          </span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-white/8 pt-3 space-y-4">
          {/* Live link to façade detection — F updates automatically as photos are analysed */}
          <div className="flex items-center gap-2 text-[10px] bg-black/20 border border-white/8 rounded-md px-2.5 py-1.5">
            <ScanSearch className="w-3.5 h-3.5 text-violet-300 shrink-0" />
            <span className="text-white/45">
              Façade condition (F) is scored only for inspected buildings —
              {inspectedCount > 0
                ? <b className="text-violet-300"> {inspectedCount} of {items.length} building{items.length === 1 ? "" : "s"} inspected</b>
                : <span className="text-amber-400"> none inspected yet</span>}.
              {inspectedCount < items.length && " For the rest, F shows “—” and its weight is spread across Energy/Characteristics/Potential until you add their photos above."}
            </span>
          </div>

          {/* Weights */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-white/60"><SlidersHorizontal className="w-3.5 h-3.5" /> Criterion weights</span>
              <div className="flex gap-1 flex-wrap ml-auto">
                {Object.entries(WEIGHT_PRESETS).map(([name, w]) => (
                  <button key={name} onClick={() => setWeights(w)}
                    className="px-2 py-0.5 rounded text-[10px] text-white/50 hover:text-white bg-white/5 hover:bg-white/12 transition">
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
              {CRITS.map(k => (
                <div key={k} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CRITERION_COLORS[k] }} />
                  <span className="text-[11px] text-white/55 w-[150px] shrink-0">{CRITERION_LABELS[k]}</span>
                  <input type="range" min={0} max={1} step={0.01} value={weights[k]}
                    onChange={e => setW(k, parseFloat(e.target.value))}
                    className="flex-1 accent-violet-500 h-1" />
                  <span className="text-[11px] font-semibold text-white/70 w-9 text-right tabular-nums">{pct(norm[k] * 100)}</span>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-white/30">
              P = {pct(norm.E * 100)} energy + {pct(norm.F * 100)} façade + {pct(norm.C * 100)} characteristics + {pct(norm.R * 100)} potential
            </div>
          </div>

          {/* AHP */}
          <div className="rounded-lg border border-white/8 bg-black/20">
            <button onClick={() => setAhpOpen(o => !o)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold text-white/60 hover:text-white/80 transition">
              <Scale className="w-3.5 h-3.5" /> Derive weights via AHP (pairwise expert judgement)
              {ahpOpen ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
            </button>
            {ahpOpen && (
              <div className="px-3 pb-3 space-y-2.5">
                <p className="text-[10px] text-white/35 leading-relaxed flex gap-1.5">
                  <Info className="w-3 h-3 mt-0.5 shrink-0" />
                  Slide toward the more important criterion in each pair (Saaty 1–9). AHP turns your judgements into weights and
                  checks their consistency.
                </p>
                {AHP_PAIRS.map(([a, b]) => {
                  const key = `${a}>${b}`;
                  const pos = ahpPos[key] ?? 0;
                  const val = saatyFromPos(pos);
                  const favored = pos === 0 ? "equal" : pos > 0 ? CRITERION_LABELS[a] : CRITERION_LABELS[b];
                  const intensity = pos === 0 ? "" : `${Math.round(pos > 0 ? val : 1 / val)}×`;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-[10px] text-white/50 w-[120px] text-right truncate" style={{ color: CRITERION_COLORS[a] }}>{CRITERION_LABELS[a]}</span>
                      <input type="range" min={-8} max={8} step={1} value={pos}
                        onChange={e => setAhpPos(p => ({ ...p, [key]: parseInt(e.target.value) }))}
                        className="flex-1 accent-amber-500 h-1" />
                      <span className="text-[10px] text-white/50 w-[120px] truncate" style={{ color: CRITERION_COLORS[b] }}>{CRITERION_LABELS[b]}</span>
                      <span className="text-[9px] text-white/35 w-14 text-right">{intensity && `${intensity} ${favored === CRITERION_LABELS[a] ? "◀" : "▶"}`}</span>
                    </div>
                  );
                })}
                <div className="flex items-center gap-3 flex-wrap pt-1">
                  <span className="text-[10px] text-white/40">
                    Derived: {CRITS.map(k => `${k} ${pct(ahp.weights[k] * 100)}`).join(" · ")}
                  </span>
                  <span className={`text-[10px] font-medium ${ahp.consistent ? "text-emerald-400" : "text-amber-400"}`}>
                    CR {ahp.CR.toFixed(2)} {ahp.consistent ? "✓ consistent" : "⚠ inconsistent (>0.10)"}
                  </span>
                  <button onClick={() => setWeights(ahp.weights)}
                    className="ml-auto px-2.5 py-1 rounded-md text-[10px] font-semibold bg-amber-600/80 hover:bg-amber-600 text-white transition">
                    Apply AHP weights
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap text-[11px]">
            <label className="flex items-center gap-1.5 text-white/45">
              Flag top
              <input type="number" min={1} max={items.length} value={topN}
                onChange={e => setTopN(Math.max(1, Math.min(items.length, parseInt(e.target.value) || 1)))}
                className="w-14 bg-[#0d1117] border border-white/12 rounded px-2 py-0.5 text-white/80 text-center" />
              priorities
            </label>
            <button onClick={exportCsv}
              className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md text-white/50 hover:text-white hover:bg-white/8 transition">
              <Download className="w-3.5 h-3.5" /> Export ranking (CSV)
            </button>
          </div>

          {/* Ranked table */}
          <div className="overflow-x-auto rounded-lg border border-white/8">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="bg-white/[0.03] text-white/40 text-left">
                  <th className="px-2 py-2 font-semibold w-8">#</th>
                  <th className="px-2 py-2 font-semibold">Building</th>
                  <th className="px-2 py-2 font-semibold w-28">Priority</th>
                  {CRITS.map(k => <th key={k} className="px-2 py-2 font-semibold" style={{ color: CRITERION_COLORS[k] }}>{k}</th>)}
                  <th className="px-2 py-2 font-semibold w-14">Conf.</th>
                  <th className="px-2 py-2 font-semibold">Why prioritized</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r, i) => {
                  const flagged = i < topN;
                  return (
                    <tr key={r.key}
                      className={`border-t border-white/6 ${flagged ? "bg-amber-500/[0.06]" : ""} hover:bg-white/[0.03] transition`}
                      style={flagged ? { boxShadow: "inset 3px 0 0 #f59e0b" } : undefined}>
                      <td className="px-2 py-2 text-white/40 tabular-nums">{i + 1}</td>
                      <td className="px-2 py-2 text-white/80 font-medium max-w-[180px] truncate" title={r.label}>{r.label}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1.5">
                          <div className="h-2 flex-1 min-w-[40px] rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${r.P}%`, background: scoreColor(r.P) }} />
                          </div>
                          <span className="font-bold tabular-nums w-7 text-right" style={{ color: scoreColor(r.P) }}>{Math.round(r.P)}</span>
                        </div>
                      </td>
                      {CRITS.map(k => <td key={k} className="px-2 py-2"><ScoreBar k={k} s={r.scores[k]} /></td>)}
                      <td className="px-2 py-2">
                        <span className={`tabular-nums ${r.confidence >= 0.7 ? "text-emerald-400" : r.confidence >= 0.4 ? "text-amber-400" : "text-red-400"}`}>
                          {Math.round(r.confidence * 100)}%
                        </span>
                      </td>
                      <td className="px-2 py-2 text-white/45 max-w-[240px]">
                        <span className="line-clamp-2">{r.drivers.join(" · ") || "—"}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-white/30 leading-relaxed">
            Scores are 0–100 (higher = higher priority). <b className="text-white/45">E</b> energy performance ·
            <b className="text-white/45"> F</b> façade condition (from the AI inspection above; shown as “—” and excluded until a building is inspected) ·
            <b className="text-white/45"> C</b> characteristics (vintage + size) · <b className="text-white/45">R</b> retrofit potential.
            <b className="text-white/45"> Conf.</b> reflects how much real data backs each building — low confidence means fill gaps
            in the table or add façade photos. The flagged top {topN} are the buildings to carry into Steps 3–4 first.
          </p>
        </div>
      )}
    </div>
  );
}
