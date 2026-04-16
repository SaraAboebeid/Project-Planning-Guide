import { useNavigate } from "react-router-dom";

export default function Recommendations() {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-800">Recommendations</h2>
      <p className="text-sm text-slate-400">
        Review recommended renovation measures based on your building baseline
        and data coverage analysis.
      </p>
      <div className="ppg-card border-dashed p-12 text-center text-slate-400">
        Component under construction — will include prioritised renovation
        measures, Boverket material comparisons, and scenario builder.
      </div>
      <div className="flex justify-between pt-4 pb-8">
        <button onClick={() => navigate("/step/3")} className="ppg-btn-secondary">← Back</button>
        <button onClick={() => navigate("/step/5")} className="ppg-btn-primary">Continue →</button>
      </div>
    </div>
  );
}
