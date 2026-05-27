import { useNavigate } from "react-router-dom";
import { useWizardStore } from "../store/wizard";
import RenovationPackages from "./RenovationPackages";
import { Layers, Zap, Wind } from "lucide-react";

/* ── Placeholder card for tracks not yet built ── */
function ComingSoon({
  icon,
  title,
  description,
  bullets,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  bullets: string[];
}) {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Step 4 – Scenarios</h2>
        <p className="text-sm text-slate-500 mt-1">{description}</p>
      </div>

      <div className="rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
          {icon}
        </div>
        <div>
          <p className="font-semibold text-slate-700 text-base">{title}</p>
          <p className="text-sm text-slate-400 mt-1">Coming in a future release</p>
        </div>
        <div className="text-left inline-block">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Planned for this step
          </p>
          <ul className="space-y-1.5">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-xs text-slate-600">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0 mt-1.5" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex justify-between pt-2 pb-8">
        <button onClick={() => navigate("/step/3")} className="ppg-btn-secondary">← Back</button>
        <button onClick={() => navigate("/step/5")} className="ppg-btn-primary">Continue →</button>
      </div>
    </div>
  );
}

/* ── Main ── */
export default function Scenarios() {
  const { project } = useWizardStore();

  if (project.projectType === "Renovation Planning") {
    return <RenovationPackages />;
  }

  if (project.projectType === "Energy Community Planning") {
    return (
      <ComingSoon
        icon={<Zap className="w-6 h-6 text-sky-500" />}
        title="Community Energy Scenarios"
        description="Model and compare shared energy community configurations."
        bullets={[
          "PV + battery system sizing for the community",
          "Self-consumption ratio and grid export profiles",
          "Load-sharing scenarios between buildings",
          "Economic comparison: individual vs shared assets",
          "Grid injection limits and peak demand reduction",
        ]}
      />
    );
  }

  if (project.projectType === "Renewable Energy Study") {
    return (
      <ComingSoon
        icon={<Wind className="w-6 h-6 text-emerald-500" />}
        title="Generation Scenarios"
        description="Size and compare renewable generation configurations."
        bullets={[
          "System sizing options (kWp / kW)",
          "Annual energy yield per scenario",
          "LCOE and simple payback per scenario",
          "Embodied carbon of each system option",
          "Sensitivity to irradiance / wind variability",
        ]}
      />
    );
  }

  /* No project type selected yet */
  return (
    <ComingSoon
      icon={<Layers className="w-6 h-6 text-slate-400" />}
      title="No project type selected"
      description="Return to Step 1 and select a project type to unlock this step."
      bullets={[
        "Renovation Planning → Renovation Packages calculator",
        "Energy Community Planning → Community energy scenarios",
        "Renewable Energy Study → Generation scenario comparison",
      ]}
    />
  );
}
