import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
} from "recharts";
import { Layers, BarChart3 } from "lucide-react";
import { TABULA_SAMPLE, TABULA_ENERGY } from "../../config/sensitivityData";

export default function TabulaPanel() {
  const [view, setView] = useState<"uvalues" | "energy">("uvalues");

  /* Radar data: normalise U-values so they fit 0–100 scale */
  const maxU = Math.max(...TABULA_SAMPLE.map((r) => r.original));
  const radarData = TABULA_SAMPLE.map((r) => ({
    component: r.component,
    Original: +((r.original / maxU) * 100).toFixed(0),
    "Typical Retrofit": +((r.typical / maxU) * 100).toFixed(0),
    "Advanced Retrofit": +((r.advanced / maxU) * 100).toFixed(0),
    origVal: r.original,
    typVal: r.typical,
    advVal: r.advanced,
    unit: r.unit,
  }));

  const energyData = TABULA_ENERGY.map((r) => ({
    name: r.label,
    Original: r.original,
    "Typical Retrofit": r.typical,
    "Advanced Retrofit": r.advanced,
  }));

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setView("uvalues")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
            view === "uvalues" ? "bg-navy text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Layers className="w-4 h-4" /> U-Values Comparison
        </button>
        <button
          onClick={() => setView("energy")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
            view === "energy" ? "bg-navy text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <BarChart3 className="w-4 h-4" /> Energy Demand
        </button>
      </div>

      {view === "uvalues" && (
        <>
          <p className="text-xs text-gray-500">
            TABULA archetype U-values for a Swedish multi-family building (1961–1975 era). Radar shows relative thermal performance — smaller area = better insulation.
          </p>
          <div className="h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="72%" data={radarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="component" fontSize={11} />
                <PolarRadiusAxis fontSize={10} tick={false} />
                <Radar name="Original" dataKey="Original" stroke="#ef4444" fill="#ef4444" fillOpacity={0.15} strokeWidth={2} />
                <Radar name="Typical Retrofit" dataKey="Typical Retrofit" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.12} strokeWidth={2} />
                <Radar name="Advanced Retrofit" dataKey="Advanced Retrofit" stroke="#2e9e96" fill="#2e9e96" fillOpacity={0.15} strokeWidth={2} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          {/* U-value table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 text-gray-500 font-semibold">Component</th>
                  <th className="text-center py-2 px-3 text-red-500 font-semibold">Original</th>
                  <th className="text-center py-2 px-3 text-amber-500 font-semibold">Typical</th>
                  <th className="text-center py-2 px-3 text-teal font-semibold">Advanced</th>
                  <th className="text-center py-2 px-3 text-gray-500 font-semibold">Improvement</th>
                </tr>
              </thead>
              <tbody>
                {TABULA_SAMPLE.map((r) => (
                  <tr key={r.component} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 font-medium text-slate-700">{r.component}</td>
                    <td className="py-2 px-3 text-center text-red-600">{r.original}</td>
                    <td className="py-2 px-3 text-center text-amber-600">{r.typical}</td>
                    <td className="py-2 px-3 text-center text-teal font-semibold">{r.advanced}</td>
                    <td className="py-2 px-3 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-green/10 text-green text-[10px] font-bold">
                        −{((1 - r.advanced / r.original) * 100).toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === "energy" && (
        <>
          <p className="text-xs text-gray-500">
            Expected energy demand breakdown (kWh/m²·yr) across retrofit scenarios from the TABULA archetype database.
          </p>
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={energyData} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis
                  fontSize={11}
                  label={{ value: "kWh/m²·yr", angle: -90, position: "insideLeft", fontSize: 11 }}
                />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Original" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Typical Retrofit" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Advanced Retrofit" fill="#2e9e96" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Savings summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="ppg-stat ppg-stat-navy">
              <div className="text-lg font-bold text-navy">260</div>
              <div className="text-[11px] text-gray-500">Original kWh/m²</div>
            </div>
            <div className="ppg-stat ppg-stat-teal">
              <div className="text-lg font-bold text-teal">140</div>
              <div className="text-[11px] text-gray-500">Typical Retrofit</div>
            </div>
            <div className="ppg-stat ppg-stat-green">
              <div className="text-lg font-bold text-green">75</div>
              <div className="text-[11px] text-gray-500">Advanced Retrofit</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
