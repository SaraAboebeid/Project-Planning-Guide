/* The Reports folder (saved renovation reports) and one report's view with
   Print. The catalogue window lives in Catalogue.tsx. */
import { useEffect, useMemo, useState } from "react";
import { useWM, type Win } from "../desktop/wm";
import { useLang, locale } from "../i18n";
import { PixelIcon } from "../icons/PixelIcon";
import { deleteReport, getReport, listReports, printReport, reportHtml, type SavedReport } from "../report";

type WMApi = ReturnType<typeof useWM>;

export function openReport(wm: WMApi, id: string, title: string) {
  wm.open("report", { key: `report:${id}`, title: "Report –", titleArg: title, icon: "report", w: 1100, h: 720, props: { id } });
}

/* Saved reports refresh whenever one is saved or deleted. */
const listeners = new Set<() => void>();
export const reportsChanged = () => listeners.forEach((l) => l());

export function ReportsFolder() {
  const wm = useWM();
  const [, t] = useLang();
  const [items, setItems] = useState<Awaited<ReturnType<typeof listReports>> | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const load = () => listReports().then(setItems, () => setItems([]));
  useEffect(() => { load(); listeners.add(load); return () => { listeners.delete(load); }; }, []);

  return (
    <>
      <div className="window-body flush sunken-panel" style={{ padding: 0 }}>
        {!items ? <div className="muted" style={{ padding: 16 }}>{t("Loading…")}</div>
          : !items.length ? (
            <div className="col" style={{ alignItems: "center", padding: 32, textAlign: "center" }}>
              <PixelIcon name="report" size={48} />
              <div>{t("The folder is empty.")}</div>
              <div className="muted">{t("Reports from the Renovation Wizard will appear here.")}</div>
            </div>
          ) : (
            <table className="list">
              <thead><tr><th>{t("Name")}</th><th>{t("Saved")}</th><th className="num">{t("Buildings")}</th><th className="num">{t("Measures")}</th></tr></thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className={sel === r.id ? "sel" : ""} onClick={() => setSel(r.id)} onDoubleClick={() => openReport(wm, r.id, r.title)}>
                    <td><span className="row" style={{ gap: 4 }}><PixelIcon name="report" size={16} />{r.title}</span></td>
                    <td>{new Date(r.created_at).toLocaleString(locale())}</td>
                    <td className="num">{r.buildings}</td><td className="num">{r.measures}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
      <div className="status-bar"><div>{items?.length ?? 0} {t("objects")}</div><div className="small">{t("Double-click a report to open it.")}</div></div>
    </>
  );
}

export function ReportView({ win }: { win: Win }) {
  const wm = useWM();
  const [, t] = useLang();
  const id = String(win.props?.id);
  const [rep, setRep] = useState<SavedReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { getReport(id).then(setRep, (e) => setErr(String(e.message || e))); }, [id]);
  const html = useMemo(() => (rep ? reportHtml(rep.title, rep.content) : ""), [rep]);

  async function remove() {
    if (!rep) return;
    const r = await wm.msg({ title: "Delete report", icon: "warning", buttons: ["Yes", "No"], text: t("Delete the report \"{name}\"?", { name: rep.title }) });
    if (r !== "Yes") return;
    await deleteReport(rep.id);
    reportsChanged();
    wm.close(win.id);
  }

  return (
    <>
      <div className="row" style={{ padding: "4px 4px 2px" }}>
        <button className="btn default" disabled={!rep} onClick={() => rep && !printReport(rep.title, rep.content)
          && wm.msg({ title: "Print", icon: "warning", text: t("The browser blocked the print window. Allow pop-ups for this site and try again.") })}>{t("Print…")}</button>
        <button className="btn" disabled={!rep} onClick={remove}>{t("Delete")}</button>
      </div>
      <div className="window-body flush sunken-panel" style={{ padding: 0 }}>
        {err ? <div style={{ padding: 16 }}>{err}</div>
          : <iframe title={rep?.title ?? "report"} srcDoc={html} style={{ border: 0, width: "100%", height: "100%", background: "#fff" }} />}
      </div>
    </>
  );
}
