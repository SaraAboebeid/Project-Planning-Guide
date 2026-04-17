import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

/* ── constants from Streamlit pages/5_Project_Timeline.py ── */

const EFFORT_BASE: Record<string, number> = {
  "Energy & Carbon Performance": 60,
  "Renewable Energy & Local Production": 50,
  "Climate Resilience": 70,
  "Retrofit & Transformation": 65,
  "Urban Design Support": 55,
  "Infrastructure Planning": 60,
  "Equity & Social Impact": 50,
};

const SCALE_MULT: Record<string, number> = {
  Building: 1.0,
  Neighborhood: 1.8,
  City: 2.5,
};

const PHASE_SPLIT: [string, number][] = [
  ["Scoping", 0.1],
  ["Data Collection", 0.3],
  ["Modeling & Simulation", 0.35],
  ["Validation & QA", 0.15],
  ["Reporting", 0.1],
];

const COLORS = ["#33528A", "#33A9A0", "#8AB62E", "#C4E81D", "#597001"];

interface TimelineRow {
  task: string;
  start: string;
  finish: string;
  hours: number;
  owner: string;
  phase: string;
}

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export default function Timeline() {
  const navigate = useNavigate();
  const { project, steps } = useWizardStore();

  /* effort estimation (mirrors Streamlit logic) */
  const baseHours = EFFORT_BASE["Retrofit & Transformation"] ?? 55;
  const scaleMult = SCALE_MULT[project.scale ?? "Building"] ?? 1.0;
  const dataCovPct = 50; // placeholder until data coverage is wired
  const completenessMult = 1.0 + (1.0 - dataCovPct / 100) * 0.7;
  const totalHours = Math.round(baseHours * scaleMult * completenessMult);

  const [phaseHours, setPhaseHours] = useState<Record<string, number>>(
    () =>
      Object.fromEntries(
        PHASE_SPLIT.map(([p, frac]) => [p, Math.round(totalHours * frac)])
      )
  );

  const [startDate, setStartDate] = useState(fmt(new Date()));
  const [rows, setRows] = useState<TimelineRow[]>([]);

  const userTotalHours = useMemo(
    () => Object.values(phaseHours).reduce((a, b) => a + b, 0),
    [phaseHours]
  );
  const userWeeks = Math.max(1, Math.round(userTotalHours / 30));
  const maxPhaseHrs = Math.max(...Object.values(phaseHours), 1);

  function generateTimeline() {
    let current = new Date(startDate);
    const newRows: TimelineRow[] = [];
    for (const [phase, hrs] of Object.entries(phaseHours)) {
      const weeks = Math.max(1, Math.round(hrs / 30));
      const finish = addDays(current, weeks * 7);
      newRows.push({
        task: phase,
        start: fmt(current),
        finish: fmt(finish),
        hours: hrs,
        owner: "",
        phase,
      });
      current = finish;
    }
    setRows(newRows);
  }

  const isReno = project.projectType === "Renovation Planning";
  const nextPath = isReno ? "/step/7" : "/step/5";
  const prevPath = isReno ? "/step/5" : "/step/3";
  const stepLabel = steps.find((s) => s.path === (isReno ? "/step/6" : "/step/4"))?.label ?? "Timeline";

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-800">{stepLabel}</h2>
      <p className="text-sm text-gray-500">
        Plan your project schedule. Auto-generate phases from effort estimates
        or build your own.
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { value: `${userTotalHours} hrs`, label: "Estimated Effort", cls: "ppg-stat-navy", textCls: "text-[#2b4a7e]" },
          { value: `${userWeeks} wk`, label: "Duration", cls: "ppg-stat-teal", textCls: "text-[#2e9e96]" },
          { value: String(PHASE_SPLIT.length), label: "Phases", cls: "ppg-stat-green", textCls: "text-[#7da828]" },
        ].map((c) => (
          <div key={c.label} className={`ppg-stat ${c.cls}`}>
            <div className={`text-2xl font-bold ${c.textCls}`}>{c.value}</div>
            <div className="text-xs text-slate-500">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Phase breakdown editor */}
      <div className="ppg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-dark">Effort Breakdown</h3>
          <button
            onClick={() =>
              setPhaseHours(
                Object.fromEntries(
                  PHASE_SPLIT.map(([p, f]) => [p, Math.round(totalHours * f)])
                )
              )
            }
            className="text-xs text-teal hover:underline"
          >
            Reset to estimates
          </button>
        </div>
        <div className="space-y-3">
          {PHASE_SPLIT.map(([phase]) => {
            const hrs = phaseHours[phase] ?? 0;
            const pct = (hrs / maxPhaseHrs) * 100;
            return (
              <div key={phase} className="grid grid-cols-[2fr_1fr_4fr] gap-3 items-center">
                <span className="text-sm font-medium">{phase}</span>
                <input
                  type="number"
                  min={0}
                  value={hrs}
                  onChange={(e) =>
                    setPhaseHours((prev) => ({
                      ...prev,
                      [phase]: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm text-center"
                />
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          <strong>Total:</strong> {userTotalHours} hours &nbsp;|&nbsp;{" "}
          <strong>Duration:</strong> ~{userWeeks} weeks (at 30 hrs/week)
        </p>
      </div>

      {/* Date inputs + generate */}
      <div className="flex items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Project Start
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={generateTimeline}
          className="px-5 py-2 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy/90"
        >
          Generate Timeline
        </button>
        <button
          onClick={() => setRows([])}
          className="px-4 py-2 rounded-lg border border-gray-300 text-sm"
        >
          Clear
        </button>
      </div>

      {/* Timeline table */}
      {rows.length > 0 && (
        <div className="ppg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["Task", "Start", "Finish", "Hours", "Owner"].map((h) => (
                  <th key={h} className="px-4 py-2 text-left font-medium text-gray-600">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium">{r.task}</td>
                  <td className="px-4 py-2 text-gray-500">{r.start}</td>
                  <td className="px-4 py-2 text-gray-500">{r.finish}</td>
                  <td className="px-4 py-2">{r.hours}</td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={r.owner}
                      onChange={(e) => {
                        const next = [...rows];
                        next[i] = { ...r, owner: e.target.value };
                        setRows(next);
                      }}
                      placeholder="—"
                      className="w-full bg-transparent text-sm outline-none"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Gantt-like bar chart */}
      {rows.length > 0 && (
        <div className="ppg-card p-5">
          <h3 className="font-semibold text-dark mb-3">Project Gantt</h3>
          <ResponsiveContainer width="100%" height={rows.length * 55 + 60}>
            <BarChart
              data={rows.map((r) => ({ name: r.task, hours: r.hours }))}
              layout="vertical"
              margin={{ left: 120 }}
            >
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={120} />
              <Tooltip />
              <Bar dataKey="hours" radius={[0, 6, 6, 0]}>
                {rows.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4 pb-8">
        <button onClick={() => navigate(prevPath)} className="ppg-btn-secondary">← Back</button>
        <button onClick={() => navigate(nextPath)} className="ppg-btn-primary">Continue →</button>
      </div>
    </div>
  );
}
