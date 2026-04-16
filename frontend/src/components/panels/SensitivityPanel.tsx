import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, Cell,
} from "recharts";
import { Activity, TrendingUp } from "lucide-react";
import {
  OAT_PARAMETERS, BASELINE_HEATING_KWH, getImportanceRanking, type OatParam,
} from "../../config/sensitivityData";

const COLORS = ["#2b4a7e", "#2e9e96", "#7da828", "#C4E81D", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#64748b", "#1a2f5a", "#597001", "#d946ef"];

function fmt(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n.toFixed(0);
}

export default function SensitivityPanel() {
  const ranking = getImportanceRanking();
  const [selectedParam, setSelectedParam] = useState<string | null>(null);
  const [view, setView] = useState<"importance" | "detail">("importance");

  const importanceData = ranking.map((r, i) => ({
    name: r.label,
    pct: +r.pct.toFixed(1),
    range: Math.round(r.range_kwh),
    fill: COLORS[i % COLORS.length],
    key: r.key,
  }));

  const param: OatParam | null = selectedParam ? (OAT_PARAMETERS[selectedParam] ?? null) : null;
  const detailData = param
    ? param.values.map((v, i) => ({
        value: String(v),
        heating: Math.round(param.outputs_kwh[i] ?? 0),
      }))
    : [];

  return (
    <div className="space-y-4">
      {/* Tab toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setView("importance")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
            view === "importance"
              ? "bg-navy text-white shadow-sm"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Activity className="w-4 h-4" /> Parameter Importance
        </button>
        <button
          onClick={() => {
            setView("detail");
            if (!selectedParam && ranking.length > 0) setSelectedParam(ranking[0]!.key);
          }}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
            view === "detail"
              ? "bg-navy text-white shadow-sm"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <TrendingUp className="w-4 h-4" /> Parameter Detail
        </button>
      </div>

      {view === "importance" && (
        <>
          <p className="text-xs text-gray-500">
            Impact of each parameter on annual heating demand (One-At-a-Time analysis). Click a bar to see its detail curve.
          </p>
          <div className="h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={importanceData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 130, bottom: 5 }}
                onClick={(e) => {
                  if (e?.activePayload?.[0]) {
                    setSelectedParam(e.activePayload[0].payload.key);
                    setView("detail");
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tickFormatter={(v) => `${v}%`} fontSize={11} />
                <YAxis type="category" dataKey="name" fontSize={11} width={120} />
                <Tooltip
                  formatter={(v: number) => [
                    `${v}%`,
                    "Impact",
                  ]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="pct" radius={[0, 4, 4, 0]} cursor="pointer">
                  {importanceData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="ppg-stat ppg-stat-navy">
              <div className="text-lg font-bold text-navy">{ranking.length}</div>
              <div className="text-[11px] text-gray-500">Parameters Tested</div>
            </div>
            <div className="ppg-stat ppg-stat-teal">
              <div className="text-lg font-bold text-teal">{fmt(BASELINE_HEATING_KWH)} kWh</div>
              <div className="text-[11px] text-gray-500">Baseline Heating</div>
            </div>
            <div className="ppg-stat ppg-stat-green">
              <div className="text-lg font-bold text-green">
                {ranking[0]?.label ?? "—"}
              </div>
              <div className="text-[11px] text-gray-500">Most Influential</div>
            </div>
          </div>
        </>
      )}

      {view === "detail" && param && (
        <>
          {/* Parameter selector pills */}
          <div className="flex flex-wrap gap-1.5">
            {ranking.map((r) => (
              <button
                key={r.key}
                onClick={() => setSelectedParam(r.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  selectedParam === r.key
                    ? "bg-teal text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="ppg-card">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-800">{param.label}</h4>
                <p className="text-xs text-gray-400">
                  Unit: {param.unit} · Baseline: {String(param.baseline_value)} · Range: ±{fmt(param.range_kwh)} kWh
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-navy/10 text-navy text-xs font-semibold">
                {((param.range_kwh / BASELINE_HEATING_KWH) * 100).toFixed(0)}% of baseline
              </span>
            </div>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={detailData} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="value" fontSize={11} />
                  <YAxis
                    fontSize={11}
                    tickFormatter={(v) => fmt(v)}
                    domain={["auto", "auto"]}
                    label={{ value: "kWh/yr", angle: -90, position: "insideLeft", fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(v: number) => [`${v.toLocaleString()} kWh`, "Annual Heating"]}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <ReferenceLine
                    y={BASELINE_HEATING_KWH}
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                    label={{ value: "Baseline", position: "right", fontSize: 10, fill: "#94a3b8" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="heating"
                    stroke="#2e9e96"
                    strokeWidth={2.5}
                    dot={{ fill: "#2e9e96", r: 4 }}
                    activeDot={{ r: 6, fill: "#2b4a7e" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
