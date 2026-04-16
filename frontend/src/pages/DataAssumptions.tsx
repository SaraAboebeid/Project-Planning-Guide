import { useNavigate } from "react-router-dom";

export default function DataAssumptions() {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-800">Data & Assumptions</h2>
      <p className="text-sm text-slate-400">
        Review and fill data gaps for your renovation scenario. Identify missing
        inputs and select proxy assumptions.
      </p>
      <div className="ppg-card border-dashed p-12 text-center text-slate-400">
        Component under construction — will include data gap analysis,
        proxy selectors, and confidence adjustments.
      </div>
      <div className="flex justify-between pt-4 pb-8">
        <button onClick={() => navigate("/step/2")} className="ppg-btn-secondary">← Back</button>
        <button onClick={() => navigate("/step/4")} className="ppg-btn-primary">Continue →</button>
      </div>
    </div>
  );
}
