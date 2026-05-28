import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";

const STEPS_PREVIEW = [
  { label: "Define Project", desc: "Project type, scope, KPIs & location" },
  { label: "Building & Site Data", desc: "Review EPC, TABULA and input coverage" },
  { label: "Data Overview", desc: "Review model confidence, sensitivity and references" },
  { label: "Scenarios", desc: "Build and compare scenario packages" },
  { label: "Results & Budget", desc: "Deliverables, timeline and cost" },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const reset = useWizardStore((s) => s.reset);

  const handleStart = () => {
    reset();
    navigate("/step/1");
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* ── Hero banner ── */}
      <div className="bg-gradient-to-r from-[#421869] via-[#721CB8] to-[#5a1490] shadow-lg">
        <div className="max-w-[1100px] mx-auto px-8 py-10 flex items-center justify-between gap-10">
          <div className="text-white max-w-xl">
            <p className="text-[10px] tracking-[0.16em] uppercase font-semibold text-white/55 mb-2">
              Chalmers University of Technology × Chalmers Next Labs
            </p>
            <h1 className="text-[2.4rem] font-extrabold leading-[1.15] tracking-tight">
              Project Planning Guide
            </h1>
            <p className="mt-2.5 text-white/75 text-[15px] leading-relaxed">
              Data Fidelity Navigator - Early Stage Decision Insights
            </p>
          </div>

          <div className="flex items-center gap-5 shrink-0">
            <img
              src="/CNL_new_logo_white.png"
              alt="Chalmers Next Labs"
              className="h-18 opacity-85"
            />
            <span className="w-px h-9 bg-white/20" />
            <img
              src="/CTH_new_logo_white.png"
              alt="Chalmers University of Technology"
              className="h-18 opacity-85"
            />
          </div>
        </div>
        <div className="ppg-accent-line" />
      </div>

      {/* ── Step cards ── */}
      <div className="max-w-[1100px] mx-auto px-8 -mt-5">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {STEPS_PREVIEW.map((step, i) => (
            <div
              key={step.label}
              className="ppg-card text-center py-5 relative"
            >
              <div className="mx-auto w-7 h-7 rounded-md bg-gradient-to-br from-[#721CB8] to-[#421869] text-white text-xs font-bold flex items-center justify-center mb-2.5 shadow-sm">
                {i + 1}
              </div>
              <h3 className="text-[13px] font-semibold text-slate-800">{step.label}</h3>
              <p className="text-[11px] text-slate-400 mt-1 leading-snug">{step.desc}</p>
              {i < STEPS_PREVIEW.length - 1 && (
                <span className="hidden md:block absolute right-[-10px] top-1/2 -translate-y-1/2 text-slate-300 text-sm">›</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA ── */}
      <section className="mt-10 text-center max-w-md mx-auto px-4 pb-12">
        <p className="ppg-section-title">Get Started</p>
        <h2 className="text-lg font-bold text-slate-800">
          Project-Type Driven Workflow
        </h2>
        <p className="mt-2 text-sm text-slate-400 leading-relaxed">
          Tailored guidance based on your project type, scope &amp; goals.
        </p>

        <button onClick={handleStart} className="ppg-btn-primary mt-6 px-10 py-3 text-[15px]">
          ▶ Start
        </button>

        <p className="mt-6 text-[11px] text-slate-400">
          Sara Abouebeid · Elena Malakhatka · Liane Thuvander · Holger Wallbaum
        </p>
      </section>
    </div>
  );
}
