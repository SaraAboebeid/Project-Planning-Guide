/* The desktop: icons, open windows, taskbar with Start menu and clock. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useWM, WindowFrame, MessageBoxes, winTitle, type Win } from "./wm";
import { BrandMark, PixelIcon } from "../icons/PixelIcon";
import { locale, setLang, useLang } from "../i18n";
import { APPS, openApp } from "../apps/launch";
import StockMap from "../apps/StockMap";
import StockTable from "../apps/StockTable";
import CsvImport from "../apps/CsvImport";
import Wizard from "../apps/Wizard";
import HistoryEditor from "../apps/HistoryEditor";
import FacadeInspector from "../apps/FacadeInspector";
import { About, ReadMe } from "../apps/Small";
import Viewer3D from "../apps/Viewer3D";
import { ReportView, ReportsFolder } from "../apps/ReportsApps";
import { CatalogueWindow } from "../apps/Catalogue";

const DESKTOP_ICONS = ["stockmap", "stocktable", "wizard", "catalogue", "reports", "viewer", "readme"] as const;

function renderApp(win: Win): ReactNode {
  switch (win.app) {
    case "stockmap": return <div className="window-body flush"><StockMap /></div>;
    case "stocktable": return <div className="window-body flush"><StockTable win={win} /></div>;
    case "csvimport": return <CsvImport />;
    case "wizard": return <Wizard />;
    case "history": return <HistoryEditor win={win} />;
    case "facade": return <FacadeInspector win={win} />;
    case "report": return <ReportView win={win} />;
    case "catalogue": return <CatalogueWindow />;
    case "viewer": return <Viewer3D />;
    case "readme": return <ReadMe />;
    case "reports": return <ReportsFolder />;
    case "about": return <About win={win} />;
  }
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(t); }, []);
  useLang();
  return <span title={now.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}>
    {now.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })}
  </span>;
}

/** Tray language indicator: click to switch English ⇄ Swedish. */
function LangSwitch() {
  const [lang, t] = useLang();
  const next = lang === "en" ? "sv" : "en";
  return (
    <button className="lang-btn" onClick={() => setLang(next)}
      title={`${t("Language")}: ${t(lang === "en" ? "English" : "Swedish")}`}
      aria-label={`${t("Language")}: ${t(lang === "en" ? "English" : "Swedish")}`}>
      {lang.toUpperCase()}
    </button>
  );
}

function StartMenu({ onClose }: { onClose: () => void }) {
  const wm = useWM();
  const [lang, t] = useLang();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest(".start-btn")) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", away); window.removeEventListener("keydown", esc); };
  }, [onClose]);

  const item = (app: keyof typeof APPS, label?: string) => (
    <li><button onClick={() => { openApp(wm, app); onClose(); }}>
      <PixelIcon name={APPS[app].icon} size={24} />{t(label ?? APPS[app].title)}
    </button></li>
  );
  return (
    <div className="start-menu" ref={ref} role="menu">
      <div className="banner">
        <span className="banner-mark"><BrandMark size={20} white /></span>
        <b>Poseidon</b> {t("Planner")}
      </div>
      <ul>
        {item("stockmap")}
        {item("stocktable")}
        {item("csvimport")}
        {item("wizard")}
        {item("viewer", "3D Map")}
        {item("catalogue")}
        {item("reports")}
        <li className="sep" />
        {item("readme", "Help (README)")}
        {item("about", "About Poseidon…")}
        <li className="sep" />
        <li><button onClick={() => { setLang(lang === "en" ? "sv" : "en"); onClose(); }}>
          <span className="lang-btn" style={{ width: 24, textAlign: "center" }}>{lang === "en" ? "SV" : "EN"}</span>
          {lang === "en" ? "Svenska" : "English"}
        </button></li>
      </ul>
    </div>
  );
}

export default function Desktop() {
  const wm = useWM();
  const [, t] = useLang();
  const [startOpen, setStartOpen] = useState(false);

  // First visit: greet with the read-me so the desktop isn't a blank teal wall.
  useEffect(() => {
    try {
      if (!localStorage.getItem("poseidon-seen")) { openApp(wm, "readme"); localStorage.setItem("poseidon-seen", "1"); }
    } catch { /* storage blocked */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <main className="desktop" onPointerDown={(e) => { if (e.target === e.currentTarget) (document.activeElement as HTMLElement)?.blur(); }}>
        <nav className="desktop-icons" aria-label={t("Desktop")}>
          {DESKTOP_ICONS.map((app) => (
            <button key={app} className="desk-icon" onDoubleClick={() => openApp(wm, app)}
              onKeyDown={(e) => e.key === "Enter" && openApp(wm, app)}>
              <PixelIcon name={APPS[app].icon} size={32} />
              <span style={{ whiteSpace: "pre-line" }}>{t(APPS[app].label)}</span>
            </button>
          ))}
        </nav>
        <div className="wallpaper-mark">
          <img src="/logo-full.png" alt="Poseidon" />
          <div className="small">{t("Renovation Planner")}</div>
        </div>
        {wm.wins.map((w) => (
          <WindowFrame key={w.id} win={w} active={w.id === wm.activeId}>{renderApp(w)}</WindowFrame>
        ))}
      </main>

      {startOpen && <StartMenu onClose={() => setStartOpen(false)} />}
      <footer className="taskbar">
        <button className={`start-btn${startOpen ? " open" : ""}`} onClick={() => setStartOpen((o) => !o)} aria-expanded={startOpen}>
          <BrandMark size={18} />Start
        </button>
        <div className="task-sep" />
        <div className="task-items">
          {[...wm.wins].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1))).map((w) => (
            <button key={w.id} className={`task-item${w.id === wm.activeId ? " on" : ""}`} title={winTitle(w)} onClick={() => wm.toggleMin(w.id)}>
              <PixelIcon name={w.icon} size={16} /><span>{winTitle(w)}</span>
            </button>
          ))}
        </div>
        <div className="tray"><LangSwitch /><BrandMark size={16} /><Clock /></div>
      </footer>
      <MessageBoxes />
    </>
  );
}
