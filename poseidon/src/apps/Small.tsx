/* The small apps: 3D map, notepad read-me, reports folder, about box. */
import { useWM, type Win } from "../desktop/wm";
import { PixelIcon } from "../icons/PixelIcon";
import { README, useLang } from "../i18n";

export function Viewer3D() {
  const [, t] = useLang();
  return (
    <div className="window-body flush sunken-panel" style={{ padding: 0 }}>
      <iframe title={t("Gothenburg 3D map")} src="/gothenburg_3d.html" style={{ border: 0, width: "100%", height: "100%", background: "#000" }} />
    </div>
  );
}

export function ReadMe() {
  const [lang] = useLang();
  return <div className="window-body flush sunken-panel"><div className="notepad">{README[lang]}</div></div>;
}

export function Reports() {
  const [, t] = useLang();
  return (
    <>
      <div className="window-body flush sunken-panel">
        <div className="col" style={{ alignItems: "center", padding: 32, textAlign: "center" }}>
          <PixelIcon name="report" size={48} />
          <div>{t("The folder is empty.")}</div>
          <div className="muted">{t("Reports from the Renovation Wizard will appear here.")}</div>
        </div>
      </div>
      <div className="status-bar"><div>0 {t("objects")}</div></div>
    </>
  );
}

export function About({ win }: { win: Win }) {
  const wm = useWM();
  const [, t] = useLang();
  return (
    <div className="window-body" style={{ margin: 10 }}>
      <div className="col" style={{ gap: 4 }}>
        <div className="sunken-panel" style={{ padding: "14px 0", display: "grid", placeItems: "center" }}>
          <img src="/logo-full.png" alt="Poseidon" style={{ height: 110 }} />
        </div>
        <div className="col" style={{ gap: 4, marginTop: 6 }}>
          <div><b>{t("Renovation Planner")}</b></div>
          <div>{t("Version 0.1 (preview)")}</div>
          <div className="hr" />
          <div className="small">{t("Building data: energy certificates (Boverket), EUBUCCO building register, Lantmäteriet.")}</div>
          <div className="small">{t("Calculations: the same engine as Project Planning Guide.")}</div>
        </div>
      </div>
      <div className="msgbox-btns" style={{ justifyContent: "flex-end", marginTop: "auto" }}>
        <button className="btn default" onClick={() => wm.close(win.id)}>{t("OK")}</button>
      </div>
    </div>
  );
}
