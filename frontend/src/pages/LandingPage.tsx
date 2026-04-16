import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import { ArrowRight } from "lucide-react";

const STEPS_PREVIEW = [
  { icon: "📋", label: "Define Project", desc: "Scope, KPIs, location" },
  { icon: "📊", label: "Data Coverage", desc: "EPC, TABULA, baselines" },
  { icon: "📈", label: "Expected Results", desc: "Confidence & outputs" },
  { icon: "📅", label: "Timeline", desc: "Milestones & phases" },
  { icon: "💰", label: "Budget / Cost", desc: "Tasks & estimates" },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const reset = useWizardStore((s) => s.reset);

  const handleStart = () => {
    reset();
    navigate("/step/1");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg px-4">
      {/* Hero */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold text-navy mb-3">
          Project Planning Guide
        </h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto">
          A data-fidelity navigator for building energy &amp; carbon projects.
          Choose your project type and follow a guided pipeline.
        </p>
      </div>

      {/* 5-step diagram */}
      <div className="flex items-center gap-2 mb-12 flex-wrap justify-center">
        {STEPS_PREVIEW.map((s, i) => (
          <div key={s.label} className="flex items-center">
            <div className="flex flex-col items-center w-28 text-center">
              <span className="text-3xl mb-1">{s.icon}</span>
              <span className="text-sm font-semibold text-dark">{s.label}</span>
              <span className="text-xs text-gray-400">{s.desc}</span>
            </div>
            {i < STEPS_PREVIEW.length - 1 && (
              <ArrowRight className="text-teal w-5 h-5 mx-1 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        onClick={handleStart}
        className="px-8 py-3 rounded-xl bg-navy text-white font-semibold text-lg shadow-lg hover:bg-navy/90 transition flex items-center gap-2"
      >
        Start New Project <ArrowRight className="w-5 h-5" />
      </button>

      <p className="mt-6 text-xs text-gray-400">
        Chalmers University of Technology · Chalmers Next Labs
      </p>
    </div>
  );
}
