/* Renovation history of one building: what was renovated, when, and (for the
   envelope) the U-value achieved. Same record as the planner's Step 2
   "Past renovations". A record restarts that part's age in the
   recommendations; a U-value becomes today's value in EPSM RC, so the
   building is re-simulated and its priority updates. */
import { useState } from "react";
import { useWM, type Win } from "../desktop/wm";
import { useLang } from "../i18n";
import { saveHistory, useStore } from "../stockStore";
import { ASSESSED_COMPONENTS } from "../planner/renovationRecommendations";
import type { RenovationRecord } from "../planner/types";

const ENVELOPE = new Set(["Walls", "Windows", "Roof", "Floor"]);

export default function HistoryEditor({ win }: { win: Win }) {
  const wm = useWM();
  const [, t] = useLang();
  const st = useStore();
  const rowId = String(win.props?.rowId);
  const label = String(win.props?.label ?? rowId);
  const h = st.history?.[rowId] ?? { label, renovations: [] };
  const recs = [...h.renovations].sort((a, b) => b.year - a.year);

  const nowYear = new Date().getFullYear();
  const [component, setComponent] = useState<string>("Windows");
  const [year, setYear] = useState(String(nowYear - 10));
  const [u, setU] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(next: RenovationRecord[]) {
    setBusy(true);
    try { await saveHistory(rowId, { ...h, label, renovations: next }); }
    catch (e) {
      await wm.msg({ title: "Error", icon: "error",
        text: <>{t("Could not save the change.")}<br /><span className="small muted">{String((e as Error).message)}</span></> });
    } finally { setBusy(false); }
  }

  async function add() {
    const y = Number(year);
    if (!Number.isInteger(y) || y < 1850 || y > nowYear) {
      await wm.msg({ title: "Error", icon: "error", text: t("Enter the year the renovation was done (1850–{now}).", { now: nowYear }) });
      return;
    }
    let uValue: number | undefined;
    if (u.trim()) {
      uValue = Number(u.replace(",", "."));
      if (!(uValue > 0 && uValue < 10)) {
        await wm.msg({ title: "Error", icon: "error", text: t("A U-value is between 0 and 10 W/m²K, e.g. 0.18 for a well-insulated wall.") });
        return;
      }
    }
    const rec: RenovationRecord = {
      id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      component, year: y, ...(uValue != null && ENVELOPE.has(component) ? { uValue } : {}), ...(note.trim() ? { note: note.trim() } : {}),
    };
    await save([...h.renovations, rec]);
    setU(""); setNote("");
  }

  return (
    <div className="window-body" style={{ margin: 8, gap: 8 }}>
      <div className="small">
        {t("Record renovations done since construction. A renovation restarts that part's age in the recommendations; a U-value you enter replaces the typical value in EPSM RC, so the building is simulated again and its priority updates.")}
      </div>
      <div className="sunken-panel" style={{ padding: 0, minHeight: 120, maxHeight: 200 }}>
        {!recs.length ? (
          <div className="muted small" style={{ padding: 10 }}>{t("No renovations recorded yet.")}</div>
        ) : (
          <table className="list">
            <thead><tr><th>{t("Component")}</th><th className="num">{t("Year")}</th><th className="num">{t("U-value (W/m²K)")}</th><th>{t("Note")}</th><th /></tr></thead>
            <tbody>
              {recs.map((r) => (
                <tr key={r.id}>
                  <td>{t(r.component)}</td>
                  <td className="num">{r.year}</td>
                  <td className="num">{r.uValue ?? "–"}</td>
                  <td>{r.note ?? ""}</td>
                  <td><button className="btn" style={{ minWidth: 0 }} disabled={busy}
                    onClick={() => save(h.renovations.filter((x) => x.id !== r.id))}>{t("Remove")}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <fieldset className="group" style={{ marginTop: 0 }}>
        <legend>{t("Add a renovation")}</legend>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <label>{t("Component")}</label>
          <select className="field" value={component} onChange={(e) => setComponent(e.target.value)}>
            {ASSESSED_COMPONENTS.map((c) => <option key={c} value={c}>{t(c)}</option>)}
          </select>
          <label>{t("Year")}</label>
          <input className="field" style={{ width: 70 }} type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          <label>{t("U-value (W/m²K)")}</label>
          <input className="field" style={{ width: 70 }} value={u} disabled={!ENVELOPE.has(component)}
            placeholder={ENVELOPE.has(component) ? t("optional") : "–"} onChange={(e) => setU(e.target.value)} />
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <label>{t("Note")}</label>
          <input className="field grow" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("e.g. triple glazing, 200 mm mineral wool")} />
          <button className="btn default" disabled={busy} onClick={add}>{t("Add")}</button>
        </div>
      </fieldset>
      <div className="msgbox-btns" style={{ justifyContent: "flex-end", paddingBottom: 0, marginTop: "auto" }}>
        <button className="btn" onClick={() => wm.close(win.id)}>{t("Close")}</button>
      </div>
    </div>
  );
}
