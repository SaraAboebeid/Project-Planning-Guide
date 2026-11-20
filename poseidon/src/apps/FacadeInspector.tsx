/* Façade inspection of one building: Street View captures and/or uploaded
   photos per side, run through the ML defect detector + AI vision
   (src/facadeRun.ts). Boxes: ML solid, AI dashed. The saved summary is the F
   criterion of the Renovation Wizard's prioritisation. */
import { useRef } from "react";
import { useWM, type Win } from "../desktop/wm";
import { useLang } from "../i18n";
import { useStore } from "../stockStore";
import {
  ORIENTATIONS, addUpload, captureStreetView, clearFacade, inspectStreetView, useFacadeSession,
  type Orientation, type Shot,
} from "../facadeRun";

const CLASS_COLOR: Record<string, string> = {
  crack: "#d00000", bulge: "#d00000", corrosion: "#b45309", abscission: "#b45309", leakage: "#1d4ed8",
};

function ShotView({ shot }: { shot: Shot }) {
  const [, t] = useLang();
  return (
    <div className="col" style={{ gap: 2 }}>
      <div style={{ position: "relative", lineHeight: 0 }}>
        <img src={shot.url} alt={shot.name} style={{ width: "100%", display: "block" }} />
        {shot.status === "done" && (
          <svg viewBox={`0 0 ${shot.width} ${shot.height}`} preserveAspectRatio="none"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            {shot.dets.map((d, i) => (
              <rect key={i} x={d.box[0]} y={d.box[1]} width={d.box[2] - d.box[0]} height={d.box[3] - d.box[1]}
                fill="none" stroke={CLASS_COLOR[d.label] ?? "#d00000"} strokeWidth={Math.max(2, shot.width / 250)}
                strokeDasharray={d.source === "ai" ? `${shot.width / 80} ${shot.width / 120}` : undefined}>
                <title>{`${t(d.label)} ${Math.round(d.score * 100)}% · ${d.source === "ai" ? "AI vision" : "ML"}${d.note ? ` — ${d.note}` : ""}`}</title>
              </rect>
            ))}
          </svg>
        )}
      </div>
      <div className="small" title={shot.name}>
        {shot.status === "running" ? t("Detecting defects…")
          : shot.status === "error" ? <span style={{ color: "var(--bad)" }}>{shot.error}</span>
          : shot.dets.length
            ? <b style={{ color: "var(--bad)" }}>{Object.entries(shot.dets.reduce<Record<string, number>>((a, d) => ({ ...a, [d.label]: (a[d.label] ?? 0) + 1 }), {}))
                .map(([k, n]) => `${n} ${t(k)}`).join(", ")}</b>
            : t("no defects found")}
        {shot.pass2 && <span className="muted"> · {t("second AI look…")}</span>}
        <div className="muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shot.name}</div>
      </div>
    </div>
  );
}

export default function FacadeInspector({ win }: { win: Win }) {
  const wm = useWM();
  const [, t] = useLang();
  const st = useStore();
  const rowId = String(win.props?.rowId);
  const label = String(win.props?.label ?? rowId);
  const [lat, lon] = rowId.split(",").map(Number);
  const s = useFacadeSession(rowId);
  const saved = st.facade?.[rowId];
  const files = useRef<Partial<Record<Orientation, HTMLInputElement | null>>>({});
  const anyBusy = ORIENTATIONS.some((o) => s.sv[o]?.busy) || s.shots.some((x) => x.status === "running");

  async function clear() {
    const r = await wm.msg({ title: "Façade inspection", icon: "warning", buttons: ["Yes", "No"],
      text: t("Remove all façade results for this building? Its priority score goes back to not inspected.") });
    if (r === "Yes") clearFacade(rowId);
  }

  return (
    <div className="window-body" style={{ margin: 6, gap: 6 }}>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className="btn default" disabled={anyBusy} onClick={() => inspectStreetView(rowId, label, lat, lon)}>
          {t("Inspect all 4 sides (Street View)")}
        </button>
        <button className="btn" disabled={!saved || anyBusy} onClick={clear}>{t("Clear results")}</button>
        <span className="grow" />
        <span className="small">
          {saved
            ? <>{t("Saved for the ranking:")} <b>{saved.defectCount ? `${saved.defectCount} ${t("defects")}` : t("no defects")}</b> {t("in")} {saved.imageCount} {t("photos")}
                {saved.lowDetail ? <span className="u-default"> · {t("street imagery too coarse to judge")}</span>
                  : saved.streetviewOnly ? <span className="muted"> · {t("street imagery only")}</span> : null}</>
            : <span className="muted">{t("Not inspected yet — the ranking leaves the façade criterion out for this building.")}</span>}
        </span>
      </div>
      {s.mlOk === false && (
        <div className="hint small" style={{ borderColor: "var(--warn)" }}>
          <b>{t("ML defect detector not running")}</b> — {t("results come from AI vision only. Start it with tools\\ml\\run_facade_service.ps1.")}
        </div>
      )}
      <div className="small muted">
        {t("Street View captures cost a little per image and are not stored (Google's terms) — only the defect counts are kept. Street imagery shows a wall at a few cm per pixel: good for an overview, not for hairline cracks. Close-up photos you upload are better evidence.")}
      </div>
      <div className="row grow" style={{ alignItems: "stretch", gap: 6, minHeight: 0 }}>
        {ORIENTATIONS.map((o) => {
          const shots = s.shots.filter((x) => x.orientation === o);
          const sv = s.sv[o];
          return (
            <fieldset key={o} className="group col" style={{ marginTop: 0, flex: 1, minWidth: 0, overflow: "auto", gap: 6 }}>
              <legend>{t(o.charAt(0).toUpperCase() + o.slice(1))}</legend>
              <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
                <button className="btn" style={{ minWidth: 0 }} disabled={sv?.busy} onClick={() => captureStreetView(rowId, label, lat, lon, o)}>
                  {sv?.busy ? t("Capturing…") : t("Street View")}
                </button>
                <button className="btn" style={{ minWidth: 0 }} onClick={() => files.current[o]?.click()}>{t("Upload…")}</button>
                <input ref={(el) => { files.current[o] = el; }} type="file" accept="image/*" multiple style={{ display: "none" }}
                  onChange={(e) => { [...(e.target.files ?? [])].forEach((f) => addUpload(rowId, label, o, f)); e.target.value = ""; }} />
              </div>
              {sv?.error && <div className="small muted">{sv.error}</div>}
              {shots.map((shot) => <ShotView key={shot.id} shot={shot} />)}
              {!shots.length && !sv?.busy && <div className="small muted">{t("No photo this session.")}</div>}
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
