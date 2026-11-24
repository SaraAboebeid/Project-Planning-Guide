/* "My projects" — saved projects: open, rename, delete, or start a new one.
   Signed in: the account's projects (backend/accounts.py). Otherwise: the
   projects saved in this browser (utils/projectStore.ts). */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderOpen, Pencil, Trash2, Plus, Loader2, Save } from "lucide-react";
import type { ProjectMeta } from "../api/accounts";
import { useAuth } from "../store/auth";
import { useWizardStore } from "../store/wizard";
import { openProject, saveProject } from "../utils/projectSave";
import { projectsBackend, useProjectsWhere } from "../utils/projectStore";
import { useT, useLang } from "../i18n";
import { C, tint } from "../config/colors";

const btn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 8, cursor: "pointer",
  fontSize: 12, fontWeight: 600, background: "transparent", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.8)",
};

export default function Projects() {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const email = useAuth((s) => s.email);
  const where = useProjectsWhere();
  const current = useWizardStore((s) => s.project);
  const savedProject = useWizardStore((s) => s.savedProject);
  const reset = useWizardStore((s) => s.reset);
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const load = async () => {
    try { setProjects(await projectsBackend().list()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  useEffect(() => { load(); }, [where]);

  const fmtDate = (iso: string) => new Date(iso).toLocaleString(lang === "sv" ? "sv-SE" : "en-GB",
    { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  // Work in this tab that isn't saved anywhere yet.
  const unsavedWork = !savedProject && (!!current.projectName.trim() || current.bboxRows.length > 0 || current.lookedUpBuildings.length > 0);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "8px 0 40px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>{t("My projects")}</h1>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
            {where === "account"
              ? t("Signed in as {email}", { email: email ?? "" })
              : t("Saved in this browser on this computer. Clearing the browser's site data removes them.")}
          </div>
        </div>
        {unsavedWork && (
          <button style={btn} disabled={busyId === "save"}
            onClick={async () => { setBusyId("save"); try { await saveProject(); await load(); } catch (e) { setError(String(e)); } setBusyId(null); }}>
            {busyId === "save" ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {t("Save the project in this tab ({name})", { name: current.projectName.trim() || t("Untitled project") })}
          </button>
        )}
        <button style={{ ...btn, background: "var(--brand-deep)", border: 0, color: "#fff" }}
          onClick={() => { reset(); navigate("/step/1"); }}>
          <Plus size={13} /> {t("New project")}
        </button>
      </div>

      {error && <div role="alert" style={{ fontSize: 12.5, color: C.bad, marginBottom: 12 }}>⚠ {error}</div>}

      {projects == null ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
          <Loader2 size={14} className="animate-spin" /> {t("Loading…")}
        </div>
      ) : projects.length === 0 ? (
        <div style={{ padding: "28px 20px", borderRadius: 14, border: "1px dashed rgba(255,255,255,0.15)", textAlign: "center",
          color: "rgba(255,255,255,0.5)", fontSize: 13, lineHeight: 1.6 }}>
          {where === "browser"
            ? t("No saved projects yet. Start a project: once it has a name and you continue past Step 1, it saves itself as you work.")
            : t("No saved projects yet. Start a project and press Save in the top bar — after that it saves itself as you work.")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {projects.map((p) => {
            const isOpen = savedProject?.id === p.id;
            const s = p.summary ?? {};
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 12,
                background: isOpen ? tint(C.selected, 0.06) : "rgba(255,255,255,0.03)",
                border: `1px solid ${isOpen ? tint(C.selected, 0.35) : "rgba(255,255,255,0.08)"}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {renaming?.id === p.id ? (
                    <input autoFocus value={renaming.name} onChange={(e) => setRenaming({ id: p.id, name: e.target.value })}
                      onKeyDown={async (e) => {
                        if (e.key === "Escape") setRenaming(null);
                        if (e.key === "Enter") {
                          await projectsBackend().rename(p.id, renaming.name.trim());
                          if (isOpen) useWizardStore.getState().setSavedProject({ ...savedProject!, name: renaming.name.trim() });
                          setRenaming(null); load();
                        }
                      }}
                      aria-label={t("Project name")}
                      style={{ fontSize: 14, fontWeight: 600, color: "#fff", background: "#0d1117", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, padding: "3px 8px", width: "100%", maxWidth: 380 }} />
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.name}{isOpen && <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 700, color: C.selected }}>● {t("open in this tab")}</span>}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>
                    {[s.city && s.country ? `${t(s.city)}, ${t(s.country)}` : s.country ? t(s.country) : null,
                      s.buildings ? t(s.buildings === 1 ? "{n} building" : "{n} buildings", { n: s.buildings }) : null,
                      s.step ? t("Step {n}", { n: s.step }) : null,
                      t("saved {date}", { date: fmtDate(p.updated_at) })].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <button style={{ ...btn, borderColor: tint(C.selected, 0.45), color: C.selected }} disabled={busyId === p.id}
                  onClick={async () => {
                    setBusyId(p.id);
                    try { const step = await openProject(p.id); navigate(`/step/${step}`); }
                    catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusyId(null); }
                  }}>
                  {busyId === p.id ? <Loader2 size={13} className="animate-spin" /> : <FolderOpen size={13} />} {t("Open")}
                </button>
                <button style={btn} title={t("Rename")} aria-label={t("Rename")} onClick={() => setRenaming({ id: p.id, name: p.name })}><Pencil size={13} /></button>
                <button style={{ ...btn, color: C.bad, borderColor: tint(C.bad, 0.35) }} title={t("Delete")} aria-label={t("Delete")}
                  onClick={async () => {
                    if (!window.confirm(t("Delete “{name}”? This can't be undone.", { name: p.name }))) return;
                    await projectsBackend().remove(p.id);
                    if (isOpen) useWizardStore.getState().setSavedProject(null);
                    load();
                  }}>
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
