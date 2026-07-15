import { useEffect, useRef } from "react";
import { useWizardStore } from "../store/wizard";
import { api } from "../api/client";

/**
 * Multi-package generalization of viewer/js/energy_sim.js's submit/poll
 * pattern (that file is vanilla JS in the classic-script 3D viewer, a
 * different codebase, so it can't be reused directly - only the pattern
 * carries over: submit -> poll /api/simulation-status every 4s -> fetch
 * results on completion -> stop). The one real change from that pattern:
 * poll intervals are tracked per package_id in a ref, not a single
 * module-level variable, so N packages poll independently without
 * cancelling each other.
 */
export function useSimulationPoller() {
  const handles = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const stop = (packageId: string) => {
    const h = handles.current[packageId];
    if (h) {
      clearInterval(h);
      delete handles.current[packageId];
    }
  };

  const patchPackage = (packageId: string, patch: Partial<import("../store/wizard").RenovationCalcPackage["simulation"]>) => {
    const { project, setProject } = useWizardStore.getState();
    setProject({
      renovationCalcPackages: project.renovationCalcPackages.map((p) =>
        p.id === packageId ? { ...p, simulation: { ...p.simulation, ...patch } } : p
      ),
    });
  };

  const poll = (packageId: string, simulationId: string) => {
    stop(packageId);
    const tick = async () => {
      try {
        const status = await api.simulationStatus(simulationId);
        if (status.status === "completed") {
          stop(packageId);
          const r = await api.simulationResults(simulationId);
          patchPackage(packageId, {
            status: "completed",
            heatingKwhM2Yr: r.heating_kwh_m2_yr,
            coolingKwhM2Yr: r.cooling_kwh_m2_yr,
            totalKwhM2Yr: r.total_kwh_m2_yr,
          });
        } else if (status.status === "failed") {
          stop(packageId);
          patchPackage(packageId, {
            status: "failed",
            error: status.error_message ?? status.error ?? "Simulation failed",
          });
        } else {
          patchPackage(packageId, { status: "running" });
        }
      } catch {
        // Transient network hiccup - keep polling, same as energy_sim.js.
      }
    };
    tick();
    handles.current[packageId] = setInterval(tick, 4000);
  };

  const submitAndPoll = async (
    packageId: string,
    submitBody: Parameters<typeof api.simulationSubmit>[0]
  ) => {
    patchPackage(packageId, { status: "queued", error: null });
    try {
      const res = await api.simulationSubmit({ ...submitBody, package_id: packageId });
      patchPackage(packageId, { simulationId: res.simulation_id });
      poll(packageId, res.simulation_id);
    } catch (e) {
      patchPackage(packageId, { status: "failed", error: (e as Error).message });
    }
  };

  useEffect(() => {
    const current = handles.current;
    return () => {
      Object.values(current).forEach(clearInterval);
    };
  }, []);

  return { submitAndPoll, resumePoll: poll, stopPoll: stop };
}
