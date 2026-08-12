import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, PieChart, Pie, Legend,
} from "recharts";
import { PieChart as PieIcon, TrendingDown, Building2 } from "lucide-react";
import {
  EPC_DISTRIBUTION, EPC_PERFORMANCE_TREND, EPC_BUILDING_TYPES,
} from "../../config/sensitivityData";

export default function EpcPanel() {
  const [view, setView] = useState<"distribution" | "trend" | "types">("distribution");

  const totalBuildings = EPC_DISTRIBUTION.reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setView("distribution")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
            view === "distribution" ? "bg-navy text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <PieIcon className="w-4 h-4" /> Class Distribution
        </button>
        <button
          onClick={() => setView("trend")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
            view === "trend" ? "bg-navy text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <TrendingDown className="w-4 h-4" /> Performance Trend
        </button>
        <button
          onClick={() => setView("types")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
            view === "types" ? "bg-navy text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Building2 className="w-4 h-4" /> Building Types
        </button>
      </div>

      {view === "distribution" && (
        <>
          <p className="text-xs text-gray-500">
            Energy Performance Certificate class distribution across {totalBuildings} buildings in the study area.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            {/* Pie chart */}
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={EPC_DISTRIBUTION.map((d) => ({ name: `Class ${d.class}`, value: d.count, fill: d.color }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }: { name: string; percent: number }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={{ strokeWidth: 1 }}
                    fontSize={10}
                  >
                    {EPC_DISTRIBUTION.map((d) => (
                      <Cell key={d.class} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Class cards */}
            <div className="space-y-1.5">
              {EPC_DISTRIBUTION.map((d) => (
                <div key={d.class} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50">
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                    style={{ background: d.color }}
                  >
                    {d.class}
                  </span>
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(d.count / totalBuildings) * 100}%`, background: d.color }}
                      />
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-gray-600 w-16 text-right">
                    {d.count} ({((d.count / totalBuildings) * 100).toFixed(0)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {view === "trend" && (
        <>
          <p className="text-xs text-gray-500">
            Average energy performance (kWh/m²·yr) trend over time from EPC records in the study area.
          </p>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={EPC_PERFORMANCE_TREND} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" fontSize={11} />
                <YAxis
                  fontSize={11}
                  label={{ value: "kWh/m²·yr", angle: -90, position: "insideLeft", fontSize: 11 }}
                />
                <Tooltip
                  formatter={(v: number) => [`${v} kWh/m²·yr`, "Avg. Performance"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Line
                  type="monotone"
                  dataKey="avg_kwh"
                  stroke="#721CB8"
                  strokeWidth={2.5}
                  dot={{ fill: "#721CB8", r: 5 }}
                  activeDot={{ r: 7, fill: "#2FB477" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="ppg-stat ppg-stat-navy">
              <div className="text-lg font-bold text-navy">165 → 90</div>
              <div className="text-[11px] text-gray-500">kWh/m² Reduction</div>
            </div>
            <div className="ppg-stat ppg-stat-teal">
              <div className="text-lg font-bold text-teal">−45%</div>
              <div className="text-[11px] text-gray-500">Overall Improvement</div>
            </div>
            <div className="ppg-stat ppg-stat-green">
              <div className="text-lg font-bold text-green">~5.4</div>
              <div className="text-[11px] text-gray-500">kWh/m²·yr drop/year</div>
            </div>
          </div>
        </>
      )}

      {view === "types" && (
        <>
          <p className="text-xs text-gray-500">
            Average energy performance by building type from EPC records.
          </p>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={EPC_BUILDING_TYPES} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="type" fontSize={11} />
                <YAxis
                  fontSize={11}
                  label={{ value: "kWh/m²·yr", angle: -90, position: "insideLeft", fontSize: 11 }}
                />
                <Tooltip
                  formatter={(v: number, name: string) => [
                    name === "avgPerf" ? `${v} kWh/m²·yr` : `${v} buildings`,
                    name === "avgPerf" ? "Avg. Performance" : "Count",
                  ]}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar name="Avg Performance (kWh/m²)" dataKey="avgPerf" fill="#721CB8" radius={[4, 4, 0, 0]} />
                <Bar name="Building Count" dataKey="count" fill="#2FB477" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
