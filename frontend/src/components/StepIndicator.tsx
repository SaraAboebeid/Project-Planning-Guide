import { useWizardStore } from "../store/wizard";
import { useNavigate, useLocation } from "react-router-dom";
import clsx from "clsx";

export default function StepIndicator() {
  const { steps, currentStep } = useWizardStore();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="flex items-center gap-1 overflow-x-auto px-4 py-3 bg-surface border-b border-gray-200">
      {steps.map((s, i) => {
        const isActive = location.pathname === s.path;
        const isDone = s.number < currentStep;
        return (
          <div key={s.number} className="flex items-center">
            {i > 0 && <div className="w-6 h-px bg-gray-300 mx-1" />}
            <button
              onClick={() => navigate(s.path)}
              className={clsx(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition whitespace-nowrap",
                isActive && "bg-navy text-white shadow",
                isDone && !isActive && "bg-teal/15 text-teal",
                !isActive && !isDone && "text-gray-400 hover:text-gray-600"
              )}
            >
              <span
                className={clsx(
                  "w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold",
                  isActive && "bg-white text-navy",
                  isDone && !isActive && "bg-teal text-white",
                  !isActive && !isDone && "bg-gray-200 text-gray-500"
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
