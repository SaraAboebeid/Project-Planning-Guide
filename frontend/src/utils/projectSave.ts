/* Saving the wizard to the signed-in user's account (backend/accounts.py).
   A project is saved explicitly the first time (it needs a name); after that
   useProjectAutosave keeps the server copy current. Façade photos are not part
   of it — they live only in the page's memory (see FacadeDefectPanel) — but
   their detection summaries are. */

import { useEffect, useRef, useState } from "react";
import { accounts, type ProjectSummary, type SavedProjectData } from "../api/accounts";
import { useWizardStore } from "../store/wizard";
import { useAuth } from "../store/auth";

function snapshot(): { data: SavedProjectData; summary: ProjectSummary } {
  const { project, currentStep } = useWizardStore.getState();
  const buildings = project.bboxRows.length || project.lookedUpBuildings.length || (project.lookedUpBuilding ? 1 : 0);
  return {
    data: { version: 1, project: project as unknown as Record<string, unknown>, currentStep },
    summary: { country: project.country, city: project.city, buildings, step: currentStep },
  };
}

/** Save as a new project, or update the one this tab has open. */
export async function saveProject(name?: string): Promise<void> {
  const { savedProject, setSavedProject, project } = useWizardStore.getState();
  const { data, summary } = snapshot();
  const finalName = (name ?? savedProject?.name ?? project.projectName ?? "").trim() || "Untitled project";
  const res = savedProject
    ? await accounts.updateProject(savedProject.id, finalName, data, summary)
    : await accounts.createProject(finalName, data, summary);
  setSavedProject({ id: res.id, name: res.name, savedAt: res.updated_at });
}

export async function openProject(id: string): Promise<number> {
  const p = await accounts.getProject(id);
  const step = p.data?.currentStep ?? 1;
  useWizardStore.getState().loadProject(p.data?.project ?? {}, step, { id: p.id, name: p.name, savedAt: p.updated_at });
  return step;
}

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 4000;

/** Keeps an already-saved project current while the user works. Saves are
 *  debounced (every edit would otherwise be a request) and never overlap. */
export function useProjectAutosave(): { status: AutosaveStatus; error: string | null } {
  const email = useAuth((s) => s.email);
  const savedId = useWizardStore((s) => s.savedProject?.id ?? null);
  const project = useWizardStore((s) => s.project);
  const step = useWizardStore((s) => s.currentStep);
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  // What the server copy holds, so opening or first-saving a project — which
  // also changes the state — is not mistaken for an edit.
  const lastSaved = useRef("");
  const lastId = useRef<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!email || !savedId) return;
    const current = JSON.stringify([project, step]);
    if (lastId.current !== savedId) { lastId.current = savedId; lastSaved.current = current; return; }
    if (current === lastSaved.current) return;
    const timer = setTimeout(async () => {
      if (busy.current) return;
      busy.current = true;
      setStatus("saving");
      try {
        const s = useWizardStore.getState();
        const sent = JSON.stringify([s.project, s.currentStep]);
        await saveProject();
        lastSaved.current = sent;
        setStatus("saved");
        setError(null);
        // Edits made while that request was out still need saving. (Not after a
        // failure: that would retry every few seconds while the server is down.)
        const after = useWizardStore.getState();
        if (JSON.stringify([after.project, after.currentStep]) !== sent) setRetry((n) => n + 1);
      } catch (e) {
        setStatus("error");
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        busy.current = false;
      }
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [project, step, email, savedId, retry]);

  return { status, error };
}
