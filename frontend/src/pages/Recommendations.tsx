import { useNavigate } from "react-router-dom";

export default function Recommendations() {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-navy">Recommendations</h2>
      <p className="text-sm text-gray-500">
        Review recommended renovation measures based on your building baseline
        and data coverage analysis.
      </p>
      <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center text-gray-400">
        🚧 Component under construction — will include prioritised renovation
        measures, Boverket material comparisons, and scenario builder.
      </div>
      <div className="flex justify-between pt-4 pb-8">
        <button onClick={() => navigate("/step/3")} className="px-5 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50">← Back</button>
        <button onClick={() => navigate("/step/5")} className="px-6 py-2 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy/90">Continue →</button>
      </div>
    </div>
  );
}
