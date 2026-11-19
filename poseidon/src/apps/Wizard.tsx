/* "Renovation Wizard": the 5-step renovation flow in installer-wizard form.
   Steps 1–2 work on the building list; 3–5 are placeholders until they are
   wired to the shared backend (EPSM baseline, optimiser, report). */
import { useState } from "react";
import { usePortfolio } from "../portfolio";
import { useWM, type Win } from "../desktop/wm";
import { PixelIcon } from "../icons/PixelIcon";
import { useLang } from "../i18n";
import { EpcChip, fmt } from "./Portfolio";
import { openApp } from "./launch";

const STEPS = [
  { title: "Choose buildings", blurb: "Choose which of Poseidon's buildings are part of the renovation project." },
  { title: "Building data", blurb: "Check the data for the chosen buildings before today's energy use is calculated." },
  { title: "Current state", blurb: "Energy demand today, calculated with the same model as the main planner (EPSM)." },
  { title: "Measures", blurb: "Compare renovation packages: cost, energy savings and climate impact." },
  { title: "Report", blurb: "Put together a decision basis for Poseidon." },
];

export default function Wizard({ win }: { win: Win }) {
  const wm = useWM();
  const [, t] = useLang();
  const items = usePortfolio();
  const [step, setStep] = useState(0);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(items.map((i) => i.id)));
  const picked = items.filter((i) => chosen.has(i.id));

  const toggle = (id: string) => setChosen((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  async function cancel() {
    const r = await wm.msg({ title: "Renovation Wizard", icon: "warning", buttons: ["Yes", "No"],
      text: t("Quit the wizard? Your choices in the wizard are not saved.") });
    if (r === "Yes") wm.close(win.id);
  }

  const canNext = step === 0 ? picked.length > 0 : step < STEPS.length - 1;

  return (
    <div className="window-body flush" style={{ margin: 3 }}>
      <div className="wizard">
        <div className="wizard-side">
          <div style={{ fontFamily: "var(--pixel)", fontSize: 17, marginBottom: 8, lineHeight: 1.1, whiteSpace: "pre-line" }}>{t("Renovation\nWizard")}</div>
          {STEPS.map((s, i) => (
            <div key={s.title} className={`step${i === step ? " on" : ""}${i < step ? " done" : ""}`}>
              <span style={{ width: 12 }}>{i < step ? "✓" : i === step ? "►" : `${i + 1}`}</span>
              <span>{t(s.title)}</span>
            </div>
          ))}
          <div style={{ marginTop: "auto", alignSelf: "center" }}><PixelIcon name="wizard" size={64} /></div>
        </div>

        <div className="wizard-main">
          <h2 className="pixel-heading">{t("Step")} {step + 1}: {t(STEPS[step].title)}</h2>
          <p style={{ marginTop: 0 }}>{t(STEPS[step].blurb)}</p>
          <div className="progress" style={{ marginBottom: 10 }}>
            <div style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>

          {step === 0 && (items.length === 0 ? (
            <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
              <PixelIcon name="info" size={32} />
              <div className="col">
                <div>{t("There are no buildings in the list yet. Add buildings in")} <b>{t("Buildings")}</b> {t("first.")}</div>
                <div><button className="btn" onClick={() => openApp(wm, "portfolio")}>{t("Open Buildings")}</button></div>
              </div>
            </div>
          ) : (
            <div className="sunken-panel" style={{ maxHeight: 230 }}>
              {items.map((b) => (
                <label key={b.id} className="row" style={{ padding: "3px 4px" }}>
                  <input type="checkbox" checked={chosen.has(b.id)} onChange={() => toggle(b.id)} />
                  <PixelIcon name="building" size={16} />
                  <span className="grow">{b.label}</span>
                  <span className="muted">{b.year ?? "–"}</span>
                  <EpcChip cls={b.eclass} />
                </label>
              ))}
            </div>
          ))}

          {step === 1 && (
            <div className="sunken-panel" style={{ maxHeight: 250 }}>
              <table className="list">
                <thead><tr>
                  <th>{t("Building")}</th><th className="num">{t("Year built")}</th><th className="num">{t("Atemp m²")}</th>
                  <th className="num">{t("kWh/m²·yr")}</th><th className="num">{t("U wall")}</th><th className="num">{t("U window")}</th>
                </tr></thead>
                <tbody>
                  {picked.map((b) => (
                    <tr key={b.id}>
                      <td>{b.label}</td><td className="num">{b.year ?? "–"}</td><td className="num">{fmt(b.area_atemp)}</td>
                      <td className="num">{fmt(b.energy)}</td><td className="num">{fmt(b.tabula_u_wall, 2)}</td><td className="num">{fmt(b.tabula_u_win, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {step >= 2 && (
            <>
              <div className="construction" />
              <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
                <PixelIcon name="warning" size={32} />
                <div>{t("This step is under construction. It will use the same calculations as the main planner.")}</div>
              </div>
              <div className="construction" />
            </>
          )}
        </div>
      </div>

      <div className="hr" style={{ margin: "0 0 2px" }} />
      <div className="wizard-foot">
        <button className="btn" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>{t("< Back")}</button>
        <button className="btn default" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>{t("Next >")}</button>
        <span style={{ width: 6 }} />
        <button className="btn" onClick={cancel}>{t("Cancel")}</button>
      </div>
    </div>
  );
}
