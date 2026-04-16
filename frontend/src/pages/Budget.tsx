import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const CONSULTANT_RATES: Record<string, number> = {
  USD: 150,
  EUR: 140,
  GBP: 130,
  SEK: 1400,
  NOK: 1500,
  DKK: 1050,
};

const COLORS = ["#33528A", "#33A9A0", "#8AB62E", "#C4E81D", "#597001"];

export default function Budget() {
  const navigate = useNavigate();
  const { project, steps } = useWizardStore();

  /* effort estimation (simplified – mirrors Streamlit) */
  const totalHours = 100; // placeholder
  const effectiveHours = totalHours;

  const [currency, setCurrency] = useState("SEK");
  const [rate, setRate] = useState(CONSULTANT_RATES.SEK);
  const overheadMult = 1.1;
  const serviceCost = Math.round(effectiveHours * rate * overheadMult);

  /* CAPEX */
  const [capex, setCapex] = useState({
    construction: 0,
    design: 0,
    permits: 0,
    equipment: 0,
  });
  const [contingencyPct, setContingencyPct] = useState(10);
  const capexBase = Object.values(capex).reduce((a, b) => a + b, 0);
  const capexTotal = Math.round(capexBase * (1 + contingencyPct / 100));

  /* OPEX */
  const [opex, setOpex] = useState({
    energy: 0,
    maintenance: 0,
    staffing: 0,
    other: 0,
  });
  const opexTotal = Object.values(opex).reduce((a, b) => a + b, 0);

  /* Pie data */
  const pieData = useMemo(() => {
    const contingencyAmt = capexTotal - capexBase;
    return [
      { name: "Construction", value: capex.construction },
      { name: "Design", value: capex.design },
      { name: "Permits", value: capex.permits },
      { name: "Equipment", value: capex.equipment },
      { name: "Contingency", value: contingencyAmt },
    ].filter((d) => d.value > 0);
  }, [capex, capexTotal, capexBase]);

  const isReno = project.projectType === "Renovation Planning";
  const prevPath = isReno ? "/step/6" : "/step/4";

  function fmtNum(n: number) {
    return n.toLocaleString();
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-navy">Budget / Cost</h2>
      <p className="text-sm text-gray-500">
        Estimate consultant costs and set your project budget.
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border p-4 text-center bg-navy/10 border-navy/25">
          <div className="text-2xl font-bold text-navy">
            {fmtNum(serviceCost)} {currency}
          </div>
          <div className="text-xs text-gray-500">Service Cost</div>
        </div>
        <div className="rounded-2xl border p-4 text-center bg-teal/10 border-teal/25">
          <div className="text-2xl font-bold text-teal">
            {fmtNum(capexTotal)} {currency}
          </div>
          <div className="text-xs text-gray-500">CAPEX</div>
        </div>
        <div className="rounded-2xl border p-4 text-center bg-green/10 border-green/25">
          <div className="text-2xl font-bold text-green">
            {fmtNum(opexTotal)} {currency}
          </div>
          <div className="text-xs text-gray-500">Annual OPEX</div>
        </div>
      </div>

      {/* Currency & rate */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Currency
          </label>
          <select
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value);
              setRate(CONSULTANT_RATES[e.target.value] ?? 150);
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {Object.keys(CONSULTANT_RATES).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Consultant Hourly Rate
          </label>
          <input
            type="number"
            min={0}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="col-span-2 rounded-xl bg-teal/5 border-l-4 border-teal p-4">
          <p className="text-xs text-gray-500">
            Estimated Service Cost ({effectiveHours} hrs × {fmtNum(rate)}{" "}
            {currency}/hr × 1.10 overhead)
          </p>
          <p className="text-xl font-bold text-navy">
            {fmtNum(serviceCost)} {currency}
          </p>
        </div>
      </div>

      {/* CAPEX */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-dark mb-3">
          CAPEX (Capital Expenditure)
        </h3>
        <div className="grid grid-cols-2 gap-4">
          {(
            [
              ["construction", "Construction"],
              ["design", "Design & Engineering"],
              ["permits", "Permits & Approvals"],
              ["equipment", "Equipment & Materials"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="block text-sm text-gray-700 mb-1">{label}</label>
              <input
                type="number"
                min={0}
                value={capex[key]}
                onChange={(e) =>
                  setCapex((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
        <div className="mt-4">
          <label className="block text-sm text-gray-700 mb-1">
            Contingency: {contingencyPct}%
          </label>
          <input
            type="range"
            min={0}
            max={30}
            value={contingencyPct}
            onChange={(e) => setContingencyPct(Number(e.target.value))}
            className="w-full accent-teal"
          />
        </div>
      </div>

      {/* OPEX */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-dark mb-3">
          OPEX (Annual Operating Expenditure)
        </h3>
        <div className="grid grid-cols-2 gap-4">
          {(
            [
              ["energy", "Energy & Utilities"],
              ["maintenance", "Maintenance"],
              ["staffing", "Staffing"],
              ["other", "Other OPEX"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="block text-sm text-gray-700 mb-1">{label}</label>
              <input
                type="number"
                min={0}
                value={opex[key]}
                onChange={(e) =>
                  setOpex((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Pie chart */}
      {pieData.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold text-dark mb-3">CAPEX Breakdown</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => `${fmtNum(v)} ${currency}`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-4 pb-8">
        <button
          onClick={() => navigate(prevPath)}
          className="px-5 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50"
        >
          ← Back
        </button>
        <button
          onClick={() => navigate("/")}
          className="px-6 py-2 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy/90"
        >
          Finish & Return Home
        </button>
      </div>
    </div>
  );
}
