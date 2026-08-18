/**
 * EubuccoValidationPanel
 * Shows the cross-validation results between EUBUCCO (SE23) building floors
 * and the Swedish EPC register, computed from 90 198 matched buildings in
 * the Gothenburg region.
 */
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, LabelList,
} from "recharts";
import { AlertTriangle, CheckCircle2, Info, TrendingDown, Database } from "lucide-react";

/* ── Hard-coded results from compare_floors.py ─────────────────────────────── */
const SUMMARY = {
  n:          90_198,
  exactPct:   10.2,
  within1Pct: 71.1,
  mae:        1.04,
  rmse:       1.93,
  bias:       -0.71,   // negative = EUBUCCO underestimates
};

// Approximate error distribution (diff = EUBUCCO − EPC floors)
const ERROR_DIST = [
  { diff: "≤ −4", count: 3_100,  pct:  3.4 },
  { diff: "−3",   count: 6_800,  pct:  7.5 },
  { diff: "−2",   count: 14_200, pct: 15.7 },
  { diff: "−1",   count: 40_800, pct: 45.3 },
  { diff: "0",    count:  9_200, pct: 10.2 },
  { diff: "+1",   count: 13_700, pct: 15.2 },
  { diff: "+2",   count:  1_900, pct:  2.1 },
  { diff: "≥ +3", count:   498,  pct:  0.6 },
];

// By building type
const BY_TYPE = [
  { type: "Detached (Friliggande)", n: 83_876, exactPct: 10.8, mae: 1.02, color: "#5A1790" },
  { type: "End-terrace (Gavel)",    n:  5_278, exactPct:  2.7, mae: 1.24, color: "#2FB477" },
  { type: "Mid-terrace (Mellan.)",  n:  1_044, exactPct:  2.2, mae: 1.98, color: "#E8880C" },
];

function MetricCard({
  label, value, sub, color,
}: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className={`rounded-xl border p-3.5 space-y-0.5 ${color}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60">{label}</p>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[11px] opacity-70">{sub}</p>
    </div>
  );
}

export default function EubuccoValidationPanel() {
  return (
    <div className="space-y-5">

      {/* Context banner */}
      <div className="flex items-start gap-3 rounded-xl bg-violet-50 border border-violet-200 px-4 py-3 text-xs text-violet-800">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span>
          <strong>Spatial cross-validation:</strong> EUBUCCO v0.2 building footprints
          (SE23 — Gothenburg region) were spatially joined with EPC-registered footprints.
          The <code className="bg-violet-100 px-1 rounded">floors</code> field was compared
          across <strong>{SUMMARY.n.toLocaleString()} matched buildings</strong>.
        </span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="Exact match"
          value={`${SUMMARY.exactPct}%`}
          sub="EUBUCCO = EPC floors"
          color="border-emerald-200 bg-emerald-50 text-emerald-800"
        />
        <MetricCard
          label="Within ±1 floor"
          value={`${SUMMARY.within1Pct}%`}
          sub="Acceptable tolerance"
          color="border-blue-200 bg-blue-50 text-blue-800"
        />
        <MetricCard
          label="MAE"
          value={`${SUMMARY.mae} fl.`}
          sub="Mean absolute error"
          color="border-amber-200 bg-amber-50 text-amber-800"
        />
        <MetricCard
          label="Systematic bias"
          value={`${SUMMARY.bias} fl.`}
          sub="EUBUCCO underestimates"
          color="border-rose-200 bg-rose-50 text-rose-800"
        />
      </div>

      {/* Bias callout */}
      <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
        <TrendingDown className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span>
          EUBUCCO <strong>systematically underestimates</strong> floors by ~0.7 on average.
          This is likely because Swedish EPCs count attic/loft floors separately, whereas
          EUBUCCO's height model derives floors from total building height ÷ assumed storey
          height (≈ 3 m), missing partial top floors.
        </span>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Error distribution */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-700">
            Error distribution — EUBUCCO minus EPC (floors)
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={ERROR_DIST} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="diff" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v: number, _n: string, item: { payload?: { pct?: number } }) =>
                  [`${v.toLocaleString()} (${item.payload?.pct ?? ""}%)`, "Buildings"]
                }
                contentStyle={{ fontSize: 11, borderRadius: 8 }}
              />
              <ReferenceLine x="0" stroke="#1e293b" strokeWidth={1.5} strokeDasharray="4 2" />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {ERROR_DIST.map(d => (
                  <Cell
                    key={d.diff}
                    fill={d.diff === "0" ? "#2FB477" : Number(d.diff) < 0 || d.diff.startsWith("≤") ? "#f97316" : "#6366f1"}
                  />
                ))}
                <LabelList
                  dataKey="pct"
                  position="top"
                  formatter={(v: number) => `${v}%`}
                  style={{ fontSize: 8, fill: "#64748b" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Exact match</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500 inline-block" /> Under-estimate</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" /> Over-estimate</span>
          </div>
        </div>

        {/* By building type */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-700">
            Accuracy by building type
          </p>
          <div className="space-y-4 pt-1">
            {BY_TYPE.map(row => (
              <div key={row.type} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700">{row.type}</span>
                  <span className="text-[10px] text-slate-400 tabular-nums">
                    n = {row.n.toLocaleString()}
                  </span>
                </div>
                {/* Exact match bar */}
                <div>
                  <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
                    <span>Exact match</span>
                    <span className="font-semibold">{row.exactPct}%</span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${row.exactPct}%`, backgroundColor: row.color }}
                    />
                  </div>
                </div>
                {/* MAE chip */}
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-slate-400">MAE:</span>
                  <span
                    className="px-1.5 py-0.5 rounded font-bold text-white"
                    style={{ backgroundColor: row.mae > 1.5 ? "#E2483B" : row.mae > 1.1 ? "#E8880C" : "#2FB477" }}
                  >
                    {row.mae} floors
                  </span>
                  {row.mae > 1.5 && (
                    <span className="text-rose-600 font-medium">
                      ⚠ Higher uncertainty for terraced buildings
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Insight */}
          <div className="rounded-lg bg-white border border-slate-200 px-3 py-2 text-[11px] text-slate-600 mt-2">
            <strong>Note:</strong> Row houses (Gavel / Mellanliggande) show higher error
            because EUBUCCO assigns a single footprint per building block while the EPC
            counts floors per dwelling unit.
          </div>
        </div>
      </div>

      {/* Implication for model */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Implication for energy model
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {[
            {
              icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
              bg: "bg-emerald-50 border-emerald-200",
              title: "71% usable as-is",
              body: "For 71 k buildings the floor count is within ±1 — sufficient for archetype matching and energy class estimation.",
            },
            {
              icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
              bg: "bg-amber-50 border-amber-200",
              title: "Apply +0.7 correction",
              body: "Adding a systematic +0.7 floor correction to EUBUCCO values reduces bias to near-zero for detached houses.",
            },
            {
              icon: <Database className="w-4 h-4 text-violet-600" />,
              bg: "bg-violet-50 border-violet-200",
              title: "Use EPC for row houses",
              body: "For terraced buildings (MAE ≈ 2 fl.) prefer EPC-registered floor counts when available.",
            },
          ].map(c => (
            <div key={c.title} className={`rounded-xl border p-3.5 ${c.bg} space-y-1.5`}>
              <div className="flex items-center gap-2">
                {c.icon}
                <p className="text-xs font-semibold text-slate-800">{c.title}</p>
              </div>
              <p className="text-[11px] text-slate-600">{c.body}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
