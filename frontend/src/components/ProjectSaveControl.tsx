/* Wizard top-bar control: "Save" the first time (asks for a name), then a quiet
   status line while autosave keeps the saved copy current. Signed out, it
   leads to sign-in and comes back here afterwards. */

import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Save, Check, Loader2, CloudOff } from "lucide-react";
import { useAuth } from "../store/auth";
import { useWizardStore } from "../store/wizard";
import { saveProject, useProjectAutosave } from "../utils/projectSave";
import { RETURN_KEY } from "../pages/Login";
import { useT, useLang } from "../i18n";
import { C } from "../config/colors";

export default function ProjectSaveControl() {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const email = useAuth((s) => s.email);
  const saved = useWizardStore((s) => s.savedProject);
  const projectName = useWizardStore((s) => s.project.projectName);
  const { status, error } = useProjectAutosave();
  const [naming, setNaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const base: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 8, fontSize: 11.5,
    fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer", flexShrink: 0,
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)",
  };

  if (!email) {
    return (
      <button style={base} title={t("Sign in to save this project")}
        onClick={() => { try { sessionStorage.setItem(RETURN_KEY, location.pathname); } catch { /**/ } navigate("/login"); }}>
        <Save size={13} /> {t("Save")}
      </button>
    );
  }

  if (saved) {
    const time = new Date(saved.savedAt).toLocaleTimeString(lang === "sv" ? "sv-SE" : "en-GB", { hour: "2-digit", minute: "2-digit" });
    return (
      // Kept short: the top bar is already full at laptop widths. The name is in
      // the tooltip and on My projects.
      <button style={{ ...base, padding: "5px 6px", background: "transparent", border: "1px solid transparent", fontWeight: 600,
        color: status === "error" ? C.bad : "rgba(255,255,255,0.5)" }}
        title={status === "error" ? `${saved.name}: ${error ?? ""}` : t("“{name}” is saved to your account — open it again from My projects", { name: saved.name })}
        onClick={() => navigate("/projects")}>
        {status === "saving" ? <Loader2 size={13} className="animate-spin" />
          : status === "error" ? <CloudOff size={13} /> : <Check size={13} color={C.good} />}
        {status === "saving" ? t("Saving…") : status === "error" ? t("Not saved") : t("Saved {time}", { time })}
      </button>
    );
  }

  if (naming != null) {
    const submit = async () => {
      setBusy(true); setSaveError(null);
      try { await saveProject(naming); setNaming(null); }
      catch (e) { setSaveError(e instanceof Error ? e.message : String(e)); }
      setBusy(false);
    };
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <input autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} aria-label={t("Project name")}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setNaming(null); }}
          placeholder={t("Project name")}
          style={{ width: 180, padding: "5px 9px", borderRadius: 8, fontSize: 12, color: "#fff", background: "#0d1117", border: "1px solid rgba(255,255,255,0.2)" }} />
        <button style={{ ...base, background: "var(--brand-deep)", border: 0, color: "#fff" }} onClick={submit} disabled={busy}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {t("Save")}
        </button>
        {saveError && <span role="alert" title={saveError} style={{ fontSize: 11, color: C.bad }}>⚠ {t("not saved")}</span>}
      </div>
    );
  }

  return (
    <button style={base} onClick={() => setNaming(projectName || "")} title={t("Save this project to your account")}>
      <Save size={13} /> {t("Save")}
    </button>
  );
}
