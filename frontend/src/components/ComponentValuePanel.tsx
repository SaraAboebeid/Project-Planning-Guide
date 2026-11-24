import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ListOrdered } from "lucide-react";
import type { OptimizeComponentInput, OptimizeParams } from "../api/client";
import { useT } from "../i18n";

/* "Best value per component": with a limited budget it matters not only WHICH
 * building to renovate but WHICH part of it. Each saved build-up is scored on
 * its own (everything else kept as-built) with the optimiser's own calibrated
 * degree-day model, so the numbers are consistent with the trade-off curve:
 *   saving = k · A · (U_as-built − U_new) · F_dh      [kWh/yr]
 * where k is the same calibration to the EnergyPlus baseline the backend uses.
 * Estimates only; the single-component savings do not add up exactly to a
 * package's saving, since each measure reduces what the others can save. */

interface Row {
  component: string; label: string; area: number;
  savedKwh: number; savedPerM2: number; pct: number;
  cost: number; carbon: number;
  paybackYr: number | null; carbonPaybackYr: number | null;
}

export default function ComponentValuePanel({ input, currency, scopeLabel }: {
  input: { components: OptimizeComponentInput[]; params: OptimizeParams } | null;
  currency: "SEK" | "GBP" | "EUR";
  scopeLabel?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(true);
  const white = (o: number) => `rgba(255,255,255,${o})`;
  const money = (n: number) =>
    currency === "SEK" ? `${Math.round(n).toLocaleString("sv-SE")} SEK`
      : currency === "EUR" ? `€${Math.round(n).toLocaleString("nl-BE")}`
      : `£${Math.round(n).toLocaleString("en-GB")}`;

  const { rows, noGain } = useMemo(() => {
    if (!input) return { rows: [] as Row[], noGain: [] as [string, string][] };
    const p = input.params;
    const area = p.floor_area_m2 || 1;
    // Same calibration as backend optimize(): scale the degree-day loss so the
    // as-built building reproduces the EnergyPlus baseline heating.
    const trans0 = input.components.reduce((s, c) => s + c.area_m2 * c.baseline_u, 0) * p.f_dh;
    const heat0 = (p.baseline_heating_kwh_m2_yr ?? NaN) * area;
    const k = Number.isFinite(heat0) && trans0 > 0 && trans0 >= heat0 ? (heat0 > 0 ? heat0 / trans0 : 0) : 1;
    const baseTotal = p.baseline_total_kwh_m2_yr * area;
    const out: Row[] = []; const none: [string, string][] = [];
    for (const c of input.components) {
      if (c.key.startsWith("VertExt::")) continue;   // a new storey has no as-built U to improve on
      for (const o of c.options) {
        const saved = k * c.area_m2 * (c.baseline_u - o.u_value) * p.f_dh;
        if (!(saved > 0)) { none.push([c.key, o.label ?? o.code]); continue; }
        const perYrMoney = saved * p.energy_price;
        const perYrCarbon = saved * p.carbon_factor_heat;
        out.push({
          component: c.key, label: o.label ?? o.code, area: c.area_m2,
          savedKwh: saved, savedPerM2: saved / area, pct: baseTotal > 0 ? (saved / baseTotal) * 100 : 0,
          cost: o.cost, carbon: o.carbon,
          paybackYr: perYrMoney > 0 ? o.cost / perYrMoney : null,
          carbonPaybackYr: perYrCarbon > 0 ? o.carbon / perYrCarbon : null,
        });
      }
    }
    out.sort((a, b) => (a.paybackYr ?? Infinity) - (b.paybackYr ?? Infinity));
    return { rows: out, noGain: none };
  }, [input]);

  if (!input || rows.length === 0) return null;
  const best = rows[0]!;
  const th: React.CSSProperties = { textAlign: "right", padding: "6px 8px", fontWeight: 600, color: white(0.5), fontSize: 11.5, whiteSpace: "nowrap" };
  const td: React.CSSProperties = { textAlign: "right", padding: "6px 8px", color: white(0.8), whiteSpace: "nowrap" };
  const yrs = (v: number | null) => v == null ? "—" : v > 100 ? t("> 100 yr") : t("{n} yr", { n: v.toFixed(v < 10 ? 1 : 0) });

  return (
    <div style={{ marginTop: 14, borderRadius: 14, background: white(0.03), border: `1px solid ${white(0.08)}`, overflow: "hidden" }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 18px",
          background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
        <ListOrdered size={16} color="#8B6EAD" />
        <span style={{ fontSize: 14, fontWeight: 700, color: "#fff", flex: 1 }}>{t("Best value per component · if the budget is limited")}</span>
        {open ? <ChevronDown size={16} color={white(0.4)} /> : <ChevronRight size={16} color={white(0.4)} />}
      </button>
      {open && (
        <div style={{ padding: "0 18px 16px" }}>
          <p style={{ fontSize: 12, color: white(0.55), margin: "0 0 10px", lineHeight: 1.6 }}>
            {t("Each build-up you saved, done")} <b>{t("on its own")}</b> {t("(everything else left as it is), ranked by how quickly the energy it saves pays back its cost. Best value right now:")}{" "}
            <b style={{ color: "#8B6EAD" }}>{t(best.component)} — {best.label}</b>,{" "}
            {t("saving about")} <b>{best.savedPerM2.toFixed(1)} kWh/m²·yr</b> {t("and paying back in")} <b>{yrs(best.paybackYr)}</b>.
            {scopeLabel && <> {t("Figures for {scope}.", { scope: scopeLabel })}</>}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${white(0.1)}` }}>
                  <th style={{ ...th, textAlign: "left" }}>#</th>
                  <th style={{ ...th, textAlign: "left" }}>{t("Component · build-up")}</th>
                  <th style={th} title={t("Energy saved per m² of floor area per year, this measure alone")}>{t("Saves (kWh/m²·yr)")}</th>
                  <th style={th} title={t("Share of the building's current total energy use")}>{t("Saves (%)")}</th>
                  <th style={th} title={t("Material cost of this measure over the component's area")}>{t("Cost")}</th>
                  <th style={th} title={t("Cost ÷ yearly energy-bill saving at today's price, not discounted")}>{t("Pays back in")}</th>
                  <th style={th} title={t("Embodied carbon (production, transport, installation) ÷ yearly operational carbon saved")}>{t("Carbon pays back in")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.component}|${r.label}|${i}`} style={{ borderBottom: `1px solid ${white(0.05)}`,
                    background: i === 0 ? "rgba(139,110,173,0.08)" : "transparent" }}>
                    <td style={{ ...td, textAlign: "left", color: white(0.45) }}>{i + 1}</td>
                    <td style={{ ...td, textAlign: "left", whiteSpace: "normal" }}>
                      <b style={{ color: "#fff" }}>{t(r.component)}</b> <span style={{ color: white(0.6) }}>— {r.label}</span>
                    </td>
                    <td style={td}>{r.savedPerM2.toFixed(1)}</td>
                    <td style={td}>{r.pct.toFixed(0)}%</td>
                    <td style={td}>{money(r.cost)}</td>
                    <td style={{ ...td, fontWeight: 600, color: i === 0 ? "#8B6EAD" : white(0.85) }}>{yrs(r.paybackYr)}</td>
                    <td style={td}>{yrs(r.carbonPaybackYr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11.5, color: white(0.4), margin: "8px 0 0", lineHeight: 1.55 }}>
            {t("Quick estimate from the same calibrated model as the trade-off curve; simulate a package in EnergyPlus for final numbers. Savings of single measures don't add up exactly to a package's saving — each measure reduces what the others can save. Payback is simple (today's energy price, not discounted).")}
            {noGain.length > 0 && <> {t("No energy saving (not better than what is there now):")} {noGain.map(([k, l]) => `${t(k)}: ${l}`).join(" · ")}.</>}
          </p>

          <details style={{ marginTop: 10, fontSize: 12, color: white(0.6), lineHeight: 1.6 }}>
            <summary style={{ cursor: "pointer", color: "#8B6EAD", fontWeight: 600 }}>{t("How this is calculated")}</summary>
            <div style={{ padding: "8px 0 0 14px" }}>
              <p style={{ margin: "0 0 8px" }}>
                <b>{t("In short:")}</b> {t("for each build-up, how much heat the building stops losing if only that part is renovated, turned into money and carbon saved per year, then ranked by how fast it pays for itself.")}
              </p>
              <ol style={{ margin: "0 0 8px", paddingLeft: 18 }}>
                <li style={{ marginBottom: 4 }}>
                  <b>{t("Heat lost through the part today")}</b> = {t("area × U-value (W per degree of indoor–outdoor difference). U-value is how easily heat passes through; lower is better.")}
                </li>
                <li style={{ marginBottom: 4 }}>
                  <b>{t("Reduction after renovation")}</b> = {t("area × (U as-built − U new).")}
                </li>
                <li style={{ marginBottom: 4 }}>
                  <b>{t("kWh per year")}</b> = {t("that reduction × degree-days × 24 / 1000 — degree-days measure how cold the year is ({n} here).", { n: Math.round((input.params.f_dh * 1000) / 24).toLocaleString() })}
                </li>
                <li style={{ marginBottom: 4 }}>
                  <b>{t("Calibrated to EnergyPlus.")}</b> {t("The simple formula ignores free heat from sun, people and appliances, so it is scaled until the building as it is today gives exactly the heating simulated in Step 3. The same factor applies to every option, so the ranking is fair.")}
                </li>
                <li style={{ marginBottom: 4 }}>
                  <b>{t("Columns.")}</b> {t("Saves (kWh/m²·yr) = kWh saved ÷ floor area. Saves (%) = kWh saved ÷ today’s total energy use. Cost = price per m² × the part’s area. Pays back in = cost ÷ (kWh saved per year × {price} {currency}/kWh). Carbon pays back in = embodied carbon (production, transport, installation) ÷ (kWh saved per year × {factor} kg CO₂e/kWh).", { price: input.params.energy_price, currency, factor: input.params.carbon_factor_heat })}
                </li>
              </ol>
              <p style={{ margin: 0, color: white(0.5) }}>
                <b>{t("Keep in mind:")}</b> {t("each measure is assessed on its own — doing two saves a bit less than the sum, since insulated walls leave less heat for the windows to save (the package results show the combined effect). Payback is simple — today’s price, no discounting or price rises — good for ranking, not an investment calculation (the 30-year cost in Results is the discounted version). Where heat is very low-carbon, as with Gothenburg district heating, carbon payback can take decades; that is a real finding, not an error.")}
              </p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
