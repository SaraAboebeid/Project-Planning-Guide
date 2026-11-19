/* Building "Properties" dialog: General / Energy / Renovation tabs. */
import { useState, type ReactNode } from "react";
import { portfolio, usePortfolio } from "../portfolio";
import { useWM, type Win } from "../desktop/wm";
import { PixelIcon } from "../icons/PixelIcon";
import { locale, buildingUse, useLang } from "../i18n";
import { EpcChip, fmt } from "./Portfolio";
import { openWizard } from "./launch";

const TABS = ["General", "Energy", "Renovation"] as const;

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <table style={{ borderSpacing: "0 5px", width: "100%" }}>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}><td style={{ width: 140, verticalAlign: "top" }}>{k}</td><td>{v}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Properties({ win }: { win: Win }) {
  const wm = useWM();
  const [, t] = useLang();
  usePortfolio();
  const b = portfolio.get(String(win.props?.id));
  const [tab, setTab] = useState<(typeof TABS)[number]>("General");

  if (!b) return <div className="window-body">{t("The building is no longer in the list.")}</div>;

  return (
    <div className="window-body" style={{ margin: "8px 6px 6px" }}>
      <div className="tabs" role="tablist">
        {TABS.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{t(k)}</button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel">
        {tab === "General" && (
          <>
            <div className="row" style={{ gap: 12, marginBottom: 6 }}>
              <PixelIcon name="building" size={32} />
              <b style={{ wordBreak: "break-word" }}>{b.label}</b>
            </div>
            <div className="hr" />
            <Rows rows={[
              [t("Use:"), buildingUse(b.use_cat)],
              [t("Year built:"), b.year ?? "–"],
              [t("Floors:"), b.floors ?? "–"],
              [t("Height:"), b.height != null ? `${fmt(b.height, 1)} m` : "–"],
              [t("Atemp:"), b.area_atemp != null ? `${fmt(b.area_atemp)} m²` : "–"],
              [t("Footprint:"), b.footprint_m2 != null ? `${fmt(b.footprint_m2)} m²` : "–"],
              [t("Facade area:"), b.wall_area_m2 != null ? `${fmt(b.wall_area_m2)} m²` : "–"],
            ]} />
            {b.all_addresses && <><div className="hr" /><div className="small">{t("Entrances:")} {b.all_addresses}</div></>}
            <div className="hr" />
            <div className="small muted">{t("Added:")} {new Date(b.addedAt).toLocaleString(locale())}</div>
          </>
        )}
        {tab === "Energy" && (
          <>
            <Rows rows={[
              [t("Energy class:"), <EpcChip cls={b.eclass} />],
              [t("Energy performance:"), b.energy != null ? `${fmt(b.energy)} ${t("kWh/m²·yr")}` : "–"],
              [t("Energy certificate:"), b.has_epc ? t("On file") : t("Missing")],
              [t("Construction period:"), b.tabula_period ?? "–"],
            ]} />
            <fieldset className="group">
              <legend>{t("Typical U-values for the period (W/m²K)")}</legend>
              <Rows rows={[
                [t("External wall:"), fmt(b.tabula_u_wall, 2)],
                [t("Roof:"), fmt(b.tabula_u_roof, 2)],
                [t("Windows:"), fmt(b.tabula_u_win, 2)],
              ]} />
            </fieldset>
            {!b.has_epc && (
              <div className="hint" style={{ marginTop: 8 }}>{t("No energy certificate was found. Energy use will be estimated when the current state is calculated.")}</div>
            )}
          </>
        )}
        {tab === "Renovation" && (
          <div className="col">
            <div>{t("No renovation plans have been saved for this building yet.")}</div>
            <div><button className="btn" onClick={() => openWizard(wm)}>{t("Open the Renovation Wizard…")}</button></div>
          </div>
        )}
      </div>
      <div className="msgbox-btns" style={{ justifyContent: "flex-end", paddingBottom: 0 }}>
        <button className="btn default" onClick={() => wm.close(win.id)}>{t("OK")}</button>
      </div>
    </div>
  );
}
