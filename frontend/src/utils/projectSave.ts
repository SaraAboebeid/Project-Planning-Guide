/* Saving the wizard as a project - to the signed-in user's account, or to this
   browser when nobody is signed in (utils/projectStore.ts).

   Account: saved explicitly the first time (Save asks for a name), then
   autosaved. Browser: the project saves itself as soon as it has a name and
   the user has moved past Step 1, then autosaves - so a project can always be
   reopened from "My projects" without having to remember to save it.
   Façade photos are not part of a project - they live only in the page's
   memory (see FacadeDefectPanel) - but their detection summaries are. */

import { useEffect, useRef, useState } from "react";
import type { ProjectSummary, SavedProjectData } from "../api/accounts";
import { useWizardStore } from "../store/wizard";
import { projectsBackend, useProjectsWhere } from "./projectStore";

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
  const backend = projectsBackend();
  const { data, summary } = snapshot();
  const finalName = (name ?? savedProject?.name ?? project.projectName ?? "").trim() || "Untitled project";
  // A project opened from one place (account / browser) and saved while the
  // other is active becomes a new project there, rather than a failed update.
  const sameStore = savedProject && (savedProject.where ?? "account") === backend.where;
  const res = sameStore
    ? await backend.update(savedProject.id, finalName, data, summary)
    : await backend.create(finalName, data, summary);
  setSavedProject({ id: res.id, name: res.name, savedAt: res.updated_at, where: backend.where });
}

export async function openProject(id: string): Promise<number> {
  const backend = projectsBackend();
  const p = await backend.get(id);
  const step = p.data?.currentStep ?? 1;
  useWizardStore.getState().loadProject(p.data?.project ?? {}, step,
    { id: p.id, name: p.name, savedAt: p.updated_at, where: backend.where });
  return step;
}

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 4000;

/** Keeps a saved project current while the user works (and, in the browser,
 *  creates it once it has a name and Step 1 is done). Saves are debounced and
 *  never overlap. */
export function useProjectAutosave(): { status: AutosaveStatus; error: string | null } {
  const where = useProjectsWhere();
  const savedId = useWizardStore((s) => s.savedProject?.id ?? null);
  const projectName = useWizardStore((s) => s.project.projectName);
  const project = useWizardStore((s) => s.project);
  const step = useWizardStore((s) => s.currentStep);
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  // What the saved copy holds, so opening or first-saving a project - which
  // also changes the state - is not mistaken for an edit.
  const lastSaved = useRef("");
  const lastId = useRef<string | null>(null);
  const busy = useRef(false);

  // Browser: create the project automatically once it is a real project.
  useEffect(() => {
    if (where !== "browser" || savedId || !projectName.trim() || step < 2 || busy.current) return;
    busy.current = true;
    setStatus("saving");
    saveProject()
      .then(() => { setStatus("saved"); setError(null); })
      .catch((e) => { setStatus("error"); setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { busy.current = false; });
  }, [where, savedId, projectName, step]);

  useEffect(() => {
    if (!savedId) return;
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
        // Edits made while that save was out still need saving. (Not after a
        // failure: that would retry every few seconds while it keeps failing.)
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
  }, [project, step, savedId, retry]);

  return { status, error };
}
