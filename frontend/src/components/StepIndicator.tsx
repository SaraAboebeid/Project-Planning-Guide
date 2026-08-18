import { useWizardStore } from "../store/wizard";
import { useNavigate, useLocation } from "react-router-dom";
import clsx from "clsx";

export default function StepIndicator() {
  const { steps, currentStep } = useWizardStore();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="flex items-center justify-center gap-0.5 overflow-x-auto px-6 py-2.5 bg-[#f7f5fb] border-b border-[#e4d9f0]">
      {steps.map((s, i) => {
        const isActive = location.pathname === s.path;
        const isDone = s.number < currentStep;
        return (
          <div key={s.number} className="flex items-center">
            {i > 0 && <div className="w-8 h-px bg-slate-200 mx-0.5" />}
            <button
              onClick={() => navigate(s.path)}
              className={clsx(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all whitespace-nowrap",
                isActive && "bg-gradient-to-r from-[var(--brand-dark)] to-[var(--brand-deep)] text-white shadow-sm",
                isDone && !isActive && "text-[var(--brand-deep)] hover:bg-[var(--brand-deep)]/5",
                !isActive && !isDone && "text-slate-400 hover:text-slate-600"
              )}
            >
              <span
                className={clsx(
                  "w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold",
                  isActive && "bg-white/20 text-white",
                  isDone && !isActive && "bg-[var(--brand-deep)]/10 text-[var(--brand-deep)]",
                  !isActive && !isDone && "bg-slate-100 text-slate-400"
                )}
              >
                {isDone ? "✓" : s.number}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}


