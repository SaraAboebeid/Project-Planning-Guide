import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { X, Plug, Database, RotateCcw, Check, Loader2, Trash2 } from "lucide-react";
import { useWizardStore } from "../store/wizard";

interface StatusResp {
  ai: { configured: boolean; provider: string | null };
  epsm: { reachable: boolean; url: string };
  facade_ml: { reachable: boolean; url: string };
}

const white = (o: number) => `rgba(255,255,255,${o})`;

function Dot({ ok }: { ok: boolean }) {
  return <span style={{ width: 9, height: 9, borderRadius: "50%", background: ok ? "#96D74C" : "#EF4444", boxShadow: `0 0 8px ${ok ? "#96D74C" : "#EF4444"}66`, flexShrink: 0 }} />;
}

function Row({ label, sub, ok, okText, offText }: { label: string; sub?: string; ok: boolean; okText: string; offText: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid ${white(0.06)}` }}>
      <Dot ok={ok} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 10.5, color: white(0.35), fontFamily: "ui-monospace, monospace" }}>{sub}</div>}
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: ok ? "#96D74C" : "#EF4444" }}>{ok ? okText : offText}</span>
    </div>
  );
}

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const setProject = useWizardStore((s) => s.setProject);
  const reset = useWizardStore((s) => s.reset);

  const [status, setStatus] = useState<StatusResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [cesiumOk, setCesiumOk] = useState<boolean | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onClose]);

  const loadStatus = () => {
    setLoading(true);
    fetch("/api/status").then((r) => r.json()).then((d) => setStatus(d)).catch(() => setStatus(null)).finally(() => setLoading(false));
    // The 3D viewer needs the Cesium CDN — probe its reachability (opaque no-cors).
    setCesiumOk(null);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    fetch("https://cdn.jsdelivr.net/npm/cesium@1.143.0/Build/Cesium/Widgets/widgets.css", { mode: "no-cors", signal: ctrl.signal })
      .then(() => setCesiumOk(true)).catch(() => setCesiumOk(false)).finally(() => clearTimeout(t));
  };
  useEffect(loadStatus, []);

  const flash = (msg: string) => { setDone(msg); setTimeout(() => setDone(null), 2200); };

  const clearFacade = () => { setProject({ facadeDefects: {} }); flash("Façade inspections cleared."); };
  const clearSims = () => {
    setProject({ renovationCalcPackages: [], renovationSimResults: [], renovationBaselineResults: [], baselineStatus: "idle", regretAnalysis: null });
    flash("Simulation results cleared.");
  };
  const resetAll = () => {
    if (!window.confirm("Reset the entire project? This clears every step's data (selection, edits, results, façade inspections) and returns you to Step 1. This cannot be undone.")) return;
    reset();
    onClose();
    navigate("/step/1");
  };

  const btn = (danger?: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 9, fontSize: 12, fontWeight: 700,
    cursor: "pointer", border: `1px solid ${danger ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.15)"}`,
    background: danger ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.05)", color: danger ? "#fca5a5" : white(0.8),
  });

  const sectionTitle = (icon: React.ReactNode, title: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 8px" }}>
      {icon}<span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{title}</span>
    </div>
  );

  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "min(560px, 96vw)", maxHeight: "90vh", overflow: "auto", background: "#0d1117",
        border: `1px solid ${white(0.14)}`, borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: `1px solid ${white(0.08)}`, position: "sticky", top: 0, background: "#0d1117" }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", flex: 1 }}>Settings</span>
          <button onClick={onClose} style={{ background: "transparent", border: 0, color: white(0.6), cursor: "pointer", padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 22 }}>
          {/* Connections & status */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {sectionTitle(<Plug size={15} color="#4ECDC4" />, "Connections & status")}
              <button onClick={loadStatus} style={{ marginLeft: "auto", background: "transparent", border: 0, color: white(0.4), cursor: "pointer", fontSize: 11 }}>
                {loading ? <Loader2 size={13} className="animate-spin" /> : "Refresh"}
              </button>
            </div>
            <p style={{ fontSize: 11, color: white(0.4), margin: "0 0 6px", lineHeight: 1.5 }}>
              Optional services — each feature degrades gracefully when its service is offline.
            </p>
            {status ? (
              <div>
                <Row label="AI assistant & vision" sub={status.ai.provider ? `provider: ${status.ai.provider}` : "no API key set"} ok={status.ai.configured} okText="Configured" offText="Not set" />
                <Row label="EPSM — energy simulation" sub={status.epsm.url} ok={status.epsm.reachable} okText="Online" offText="Offline" />
                <Row label="Façade-ML defect model" sub={status.facade_ml.url} ok={status.facade_ml.reachable} okText="Online" offText="Offline" />
                <Row label="3D viewer (Cesium)" sub="Google Photorealistic 3D tiles" ok={cesiumOk === true} okText={cesiumOk === null ? "…" : "Online"} offText={cesiumOk === null ? "…" : "Offline"} />
              </div>
            ) : (
              <div style={{ fontSize: 12, color: white(0.4), padding: "8px 0" }}>{loading ? "Checking…" : "Status unavailable."}</div>
            )}
          </div>

          {/* Data & session */}
          <div>
            {sectionTitle(<Database size={15} color="#F59E0B" />, "Data & session")}
            <p style={{ fontSize: 11, color: white(0.4), margin: "0 0 10px", lineHeight: 1.5 }}>
              All project data lives in this browser session. Clear parts of it, or reset everything.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={clearFacade} style={btn()}><Trash2 size={13} /> Clear façade inspections</button>
              <button onClick={clearSims} style={btn()}><Trash2 size={13} /> Clear simulation results</button>
              <button onClick={resetAll} style={btn(true)}><RotateCcw size={13} /> Reset entire project</button>
            </div>
            {done && <div style={{ marginTop: 10, fontSize: 12, color: "#96D74C", display: "flex", alignItems: "center", gap: 6 }}><Check size={14} /> {done}</div>}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
