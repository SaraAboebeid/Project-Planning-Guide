/* "Buildings" (Fastigheter): Explorer-style list of the buildings Poseidon is
   planning for. Add by address (geocode → nearest building in the Gothenburg
   dataset). */
import { useState } from "react";
import { api, inGothenburg } from "../api";
import { portfolio, usePortfolio, EPC_COLORS, type SavedBuilding } from "../portfolio";
import { useWM } from "../desktop/wm";
import { PixelIcon } from "../icons/PixelIcon";
import { locale, buildingUse, useLang } from "../i18n";
import { openProperties, openWizard } from "./launch";

export const fmt = (v: number | null | undefined, digits = 0) =>
  v == null || Number.isNaN(v) ? "–" : new Intl.NumberFormat(locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);

export function EpcChip({ cls }: { cls: string | null | undefined }) {
  if (!cls) return <span className="muted">–</span>;
  return <span className="epc" style={{ background: EPC_COLORS[cls] ?? "#808080" }}>{cls}</span>;
}

export default function Portfolio() {
  const wm = useWM();
  const [, t] = useLang();
  const items = usePortfolio();
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const selected = items.find((i) => i.id === sel) ?? null;

  async function add() {
    const q = address.trim();
    if (!q) return;
    setBusy(true);
    try {
      const g = await api.geocode(q.match(/göteborg|gothenburg/i) ? q : `${q}, Göteborg`);
      if (!inGothenburg(g.lat, g.lon)) {
        await wm.msg({ title: "Outside Gothenburg", icon: "warning",
          text: <>{t("The address was found, but it is outside Gothenburg:")}<br /><i>{g.display_name}</i><br /><br />{t("The planner only has building data for Gothenburg.")}</> });
        return;
      }
      const b = await api.building(g.lat, g.lon);
      if (b.dist_m > 60) {
        const r = await wm.msg({ title: "Nearest building", icon: "warning", buttons: ["Add", "Cancel"],
          text: t("The nearest building in the register is {m} m from the address ({addr}). Add it anyway?",
            { m: Math.round(b.dist_m), addr: b.address ?? t("unknown address") }) });
        if (r !== "Add") return;
      }
      const rec = portfolio.add(b, b.address || q);
      setSel(rec.id);
      setAddress("");
    } catch (e) {
      await wm.msg({ title: "Error", icon: "error", text: <>{t("Could not find the building.")}<br /><span className="small muted">{String((e as Error).message)}</span></> });
    } finally {
      setBusy(false);
    }
  }

  async function remove(b: SavedBuilding) {
    const [before, after] = t("Remove {name} from the list?").split("{name}");
    const r = await wm.msg({ title: "Confirm removal", icon: "warning", buttons: ["Yes", "No"],
      text: <>{before}<b>{b.label}</b>{after}</> });
    if (r === "Yes") { portfolio.remove(b.id); setSel(null); }
  }

  const totalAtemp = items.reduce((s, i) => s + (i.area_atemp ?? 0), 0);

  return (
    <>
      <div className="row" style={{ padding: "4px 4px 2px" }}>
        <button className="btn" disabled={!selected} onClick={() => selected && openProperties(wm, selected)}>{t("Properties…")}</button>
        <button className="btn" disabled={!selected} onClick={() => selected && remove(selected)}>{t("Remove")}</button>
        <button className="btn" disabled={!items.length} onClick={() => openWizard(wm)}>{t("Plan renovation…")}</button>
      </div>
      <div className="row" style={{ padding: "2px 4px 4px" }}>
        <label htmlFor="addr">{t("Address:")}</label>
        <input id="addr" className="field grow" placeholder={t("e.g. Vårväderstorget 2")} value={address}
          disabled={busy} onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn" disabled={busy || !address.trim()} onClick={add}>{busy ? t("Searching…") : t("Add")}</button>
      </div>
      {busy && <div className="progress" style={{ margin: "0 4px 4px" }}><div style={{ width: "60%" }} /></div>}
      <div className="sunken-panel grow" style={{ margin: "0 2px" }} onClick={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
        {items.length === 0 ? (
          <div className="col" style={{ alignItems: "center", padding: 28, textAlign: "center" }}>
            <PixelIcon name="folder" size={48} />
            <div>{t("The folder is empty.")}</div>
            <div className="muted">{t("Type an address above to add Poseidon's first building.")}</div>
          </div>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>{t("Name")}</th><th className="num">{t("Year built")}</th><th className="num">{t("Atemp m²")}</th>
                <th className="num">{t("Floors")}</th><th>{t("Energy class")}</th><th className="num">{t("kWh/m²·yr")}</th><th>{t("Use")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id} className={b.id === sel ? "sel" : ""} onClick={() => setSel(b.id)}
                  onDoubleClick={() => openProperties(wm, b)}>
                  <td><span className="row" style={{ gap: 4 }}><PixelIcon name="building" size={16} />{b.label}</span></td>
                  <td className="num">{b.year ?? "–"}</td>
                  <td className="num">{fmt(b.area_atemp)}</td>
                  <td className="num">{b.floors ?? "–"}</td>
                  <td><EpcChip cls={b.eclass} /></td>
                  <td className="num">{fmt(b.energy)}</td>
                  <td>{buildingUse(b.use_cat)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="status-bar">
        <div className="fixed">{items.length} {t("objects")}</div>
        <div>{t("Total Atemp:")} {fmt(totalAtemp)} m²</div>
      </div>
    </>
  );
}
