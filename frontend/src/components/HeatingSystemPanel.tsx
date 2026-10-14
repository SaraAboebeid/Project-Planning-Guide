import { useEffect, useMemo, useRef, useState } from "react";
import { Flame, ChevronDown, ChevronUp, Info, Check } from "lucide-react";
import { computeHvac, type HvacResult } from "../utils/hvacAnalysis";
import { SE_HVAC_CATALOGUE, type HvacCatalogue } from "../config/hvacSystems";
import { useWizardStore, type HvacOverrides } from "../store/wizard";
import { applyHvacOverrides, hasHvacOverrides } from "../utils/hvacOverrides";

/** Number box that commits on blur/Enter; an emptied box (or the default
 *  value) clears the override. Edited values are highlighted. */
function NumField({ value, def, step, width = 64, onCommit }: {
  value: number; def: number; step?: number; width?: number; onCommit: (v: number | undefined) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const edited = Math.abs(value - def) > 1e-9;
  const commit = () => {
    const v = parseFloat(text.replace(",", "."));
    if (!Number.isFinite(v) || v < 0) { setText(String(value)); return; }
    onCommit(Math.abs(v - def) < 1e-9 ? undefined : v);
  };
  return (
    <input type="number" step={step ?? "any"} value={text} title={edited ? `Default ${def}` : "Default value"}
      onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      style={{ width, padding: "3px 6px", borderRadius: 6, fontSize: 11, textAlign: "right",
        border: `1px solid ${edited ? "#E8880C" : "rgba(255,255,255,0.15)"}`,
        background: edited ? "rgba(232,136,12,0.10)" : "rgba(255,255,255,0.05)", color: "#fff" }} />
  );
}

const white = (o: number) => `rgba(255,255,255,${o})`;

/** Compact number: M for millions, k for thousands. */
function compact(v: number, locale: string): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)} M`;
  if (a >= 1e4) return `${Math.round(v / 1e3)} k`;
  return `${Math.round(v).toLocaleString(locale)}`;
}

const PICKS: Record<string, { fg: string; label: string }> = {
  lowestLcc: { fg: "#2FB477", label: "Lowest 30-yr cost" },
  lowestCarbon: { fg: "#4ECDC4", label: "Lowest carbon" },
  lowestEnergy: { fg: "#4A90E2", label: "Lowest energy" },
  lowestOpCost: { fg: "#B98BE8", label: "Cheapest to run" },
};

export default function HeatingSystemPanel({
  heatingDemandKwhM2Yr, floorAreaM2, studyPeriodYr = 30, discountRate = 0.03, catalogue: baseCatalogue = SE_HVAC_CATALOGUE,
}: {
  heatingDemandKwhM2Yr: number;
  floorAreaM2: number;
  studyPeriodYr?: number;
  discountRate?: number;
  catalogue?: HvacCatalogue;
}) {
  // The user's own values (Assumptions & sources) over the catalogue defaults,
  // kept per catalogue currency so Swedish and UK edits never mix.
  const overrides = useWizardStore((s) => s.project.hvacOverrides?.[baseCatalogue.currency]);
  const catalogue = useMemo(() => applyHvacOverrides(baseCatalogue, overrides), [baseCatalogue, overrides]);
  const edited = hasHvacOverrides(overrides);
  const setOverrides = (fn: (o: HvacOverrides) => HvacOverrides) => {
    const all = useWizardStore.getState().project.hvacOverrides ?? {};
    useWizardStore.getState().setProject({ hvacOverrides: { ...all, [baseCatalogue.currency]: fn(all[baseCatalogue.currency] ?? {}) } });
  };
  const setCarrier = (key: string, field: "tariffSek" | "carbonKgPerKwh", v: number | undefined) =>
    setOverrides((o) => ({ ...o, carriers: { ...o.carriers, [key]: { ...o.carriers?.[key], [field]: v } } }));
  const setSystem = (id: string, field: "spfBase" | "capexFixedSek" | "capexPerKwSek" | "lifetimeYr", v: number | undefined) =>
    setOverrides((o) => ({ ...o, systems: { ...o.systems, [id]: { ...o.systems?.[id], [field]: v } } }));
  const cur = catalogue.currency;
  const sek = (v: number) => compact(v, catalogue.locale);
  const [open, setOpen] = useState(true);   // open by default, like the other Step-4 panels
  const [showSources, setShowSources] = useState(false);
  const selectedId = useWizardStore((s) => s.project.heatingSystemId);
  const setProject = useWizardStore((s) => s.setProject);

  const outcome = useMemo(
    () => computeHvac({ heatingDemandKwhM2Yr, floorAreaM2, studyPeriodYr, discountRate, catalogue }),
    [heatingDemandKwhM2Yr, floorAreaM2, studyPeriodYr, discountRate, catalogue],
  );
  const { results, picks } = outcome;
  const selected = results.find((r) => r.id === selectedId) ?? results.find((r) => r.id === catalogue.defaultSystemId) ?? results.find((r) => r.isBaseline) ?? results[0] ?? null;
  const selectSystem = (id: string) => setProject({ heatingSystemId: id });

  // Persist for the Step-5 report (only when the content changes).
  const sigRef = useRef("");
  useEffect(() => {
    const payload = { ...outcome, selectedId: selected?.id ?? selectedId, heatingDemandKwhM2Yr, currency: cur };
    const sig = JSON.stringify(payload);
    if (sig === sigRef.current) return;
    sigRef.current = sig;
    setProject({ heatingAnalysis: payload });
  }, [outcome, selected?.id, selectedId, heatingDemandKwhM2Yr, cur, setProject]);

  const picksFor = (id: string) =>
    (Object.entries(picks) as [keyof typeof picks, string][]).filter(([, v]) => v === id).map(([k]) => k);

  const th: React.CSSProperties = { padding: "6px 8px", fontWeight: 600, color: white(0.45), textAlign: "right", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "7px 8px", textAlign: "right", whiteSpace: "nowrap", color: white(0.82) };

  const deltaTag = (pct: number) => (
    <span style={{ fontSize: 9.5, marginLeft: 4, color: pct < 0 ? "#2FB477" : pct > 0 ? "#E2483B" : white(0.3) }}>
      {pct > 0 ? "+" : ""}{pct}%
    </span>
  );

  return (
    <div style={{ borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "transparent", border: 0, cursor: "pointer", textAlign: "left" }}>
        <span style={{ padding: 6, borderRadius: 9, background: "rgba(232,136,12,0.16)", color: "#E8880C", display: "flex" }}><Flame size={16} /></span>
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: "#fff" }}>Heating system (HVAC)</span>
          <span style={{ display: "block", fontSize: 11, color: white(0.4) }}>
            Compare &amp; choose the heating source — {selected ? <b style={{ color: "#E8880C" }}>selected: {selected.shortName}</b> : "energy, cost & carbon on the same heat demand"}.
          </span>
        </span>
        {open ? <ChevronUp size={16} color={white(0.4)} /> : <ChevronDown size={16} color={white(0.4)} />}
      </button>

      {open && (
        <div style={{ padding: "0 18px 16px" }}>
          <p style={{ fontSize: 11.5, color: white(0.45), margin: "0 0 12px", lineHeight: 1.6, maxWidth: 760 }}>
            The building's <b style={{ color: white(0.65) }}>{Math.round(heatingDemandKwhM2Yr)} kWh/m²·yr</b> of heat demand is fixed — each system
            just converts it to delivered energy at its own efficiency (SPF). Values are {studyPeriodYr}-yr life-cycle at a {Math.round(discountRate * 100)}% discount rate.
            The heat demand still comes from real EnergyPlus (EPSM); the system economics are a supply-side layer on top.
          </p>

          {selected && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12, padding: "9px 12px",
              borderRadius: 10, background: "rgba(78,205,196,0.08)", border: "1px solid rgba(78,205,196,0.3)" }}>
              <span style={{ fontSize: 11.5, color: white(0.6) }}>Selected heating system:</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, color: "#fff" }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: selected.color }} /> {selected.shortName}
              </span>
              <span style={{ fontSize: 11.5, color: white(0.55) }}>
                {selected.deliveredKwhM2Yr} kWh/m²·yr · {sek(selected.operatingCostYrSek)} {cur}/yr · {sek(selected.carbonYrKg)} kg CO₂e/yr · {sek(selected.lccSek)} {cur} life-cycle
              </span>
              {!selected.isBaseline && selected.vsBaseline && (
                <span style={{ fontSize: 10.5, color: selected.vsBaseline.opCostPct < 0 ? "#2FB477" : "#E2483B" }}>
                  ({selected.vsBaseline.opCostPct > 0 ? "+" : ""}{selected.vsBaseline.opCostPct}% cost, {selected.vsBaseline.carbonPct > 0 ? "+" : ""}{selected.vsBaseline.carbonPct}% carbon vs {catalogue.baselineLabel})
                </span>
              )}
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 26 }}></th>
                  <th style={{ ...th, textAlign: "left" }}>Heating system</th>
                  <th style={th} title="Seasonal Performance Factor (heat pumps) or efficiency">SPF / eff.</th>
                  <th style={th}>Delivered<br /><span style={{ fontWeight: 400, color: white(0.3) }}>kWh/m²·yr</span></th>
                  <th style={th}>Op. cost<br /><span style={{ fontWeight: 400, color: white(0.3) }}>{cur}/yr</span></th>
                  <th style={th}>Carbon<br /><span style={{ fontWeight: 400, color: white(0.3) }}>kg CO₂e/yr</span></th>
                  <th style={th}>Install<br /><span style={{ fontWeight: 400, color: white(0.3) }}>capex {cur}</span></th>
                  <th style={th}>{studyPeriodYr}-yr LCC<br /><span style={{ fontWeight: 400, color: white(0.3) }}>{cur}</span></th>
                </tr>
              </thead>
              <tbody>
                {results.map((s: HvacResult) => {
                  const tags = picksFor(s.id);
                  const isSel = s.id === selected?.id;
                  return (
                    <tr key={s.id} onClick={() => selectSystem(s.id)} title="Click to select this heating system"
                      style={{ borderTop: `1px solid ${white(0.07)}`, cursor: "pointer",
                        boxShadow: isSel ? "inset 3px 0 0 #4ECDC4" : undefined,
                        background: isSel ? "rgba(78,205,196,0.10)" : s.isBaseline ? "rgba(232,136,12,0.05)" : tags.length ? "rgba(255,255,255,0.02)" : undefined }}>
                      <td style={{ padding: "7px 8px", textAlign: "center" }}>
                        <span style={{ display: "inline-flex", width: 15, height: 15, borderRadius: "50%", alignItems: "center", justifyContent: "center",
                          border: `1.5px solid ${isSel ? "#4ECDC4" : white(0.25)}`, background: isSel ? "#4ECDC4" : "transparent" }}>
                          {isSel && <Check size={10} color="#0d1117" strokeWidth={3} />}
                        </span>
                      </td>
                      <td style={{ padding: "7px 8px", color: "#fff" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                          <span style={{ fontStyle: s.isBaseline ? "italic" : undefined, color: s.isBaseline ? white(0.7) : "#fff" }}>{s.shortName}</span>
                          {s.isBaseline && <span style={{ fontSize: 8.5, color: "#E8880C" }}>baseline</span>}
                          {tags.map((t) => {
                            const p = PICKS[t];
                            if (!p) return null;
                            return (
                              <span key={t} style={{ fontSize: 8.5, fontWeight: 800, padding: "1px 6px", borderRadius: 99, color: p.fg, background: `${p.fg}22` }}>★ {p.label}</span>
                            );
                          })}
                        </div>
                      </td>
                      <td style={td}>{s.spf.toFixed(s.spf >= 1.5 ? 1 : 2)}</td>
                      <td style={td}>{s.deliveredKwhM2Yr}{s.vsBaseline && !s.isBaseline ? deltaTag(s.vsBaseline.deliveredPct) : null}</td>
                      <td style={{ ...td, color: s.id === picks.lowestOpCost ? "#2FB477" : white(0.82) }}>{sek(s.operatingCostYrSek)}{s.vsBaseline && !s.isBaseline ? deltaTag(s.vsBaseline.opCostPct) : null}</td>
                      <td style={{ ...td, color: s.id === picks.lowestCarbon ? "#4ECDC4" : white(0.82) }}>{sek(s.carbonYrKg)}{s.vsBaseline && !s.isBaseline ? deltaTag(s.vsBaseline.carbonPct) : null}</td>
                      <td style={td}>{sek(s.capexSek)}</td>
                      <td style={{ ...td, fontWeight: s.id === picks.lowestLcc ? 800 : 400, color: s.id === picks.lowestLcc ? "#2FB477" : "#fff" }}>{sek(s.lccSek)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Assumptions & sources */}
          <button onClick={() => setShowSources((v) => !v)}
            style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: 0, color: white(0.5), cursor: "pointer", fontSize: 11 }}>
            <Info size={13} /> Assumptions &amp; sources — edit values {showSources ? "▲" : "▼"}
          </button>
          {edited && (
            <span style={{ marginLeft: 10, fontSize: 10.5, color: "#E8880C" }}>
              Using your own values (orange boxes).{" "}
              <button onClick={() => setOverrides(() => ({}))}
                style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", color: "#4ECDC4", fontSize: 10.5, textDecoration: "underline" }}>
                Reset to defaults
              </button>
            </span>
          )}
          {showSources && (() => {
            const ths: React.CSSProperties = { padding: "4px 6px", fontWeight: 600, color: white(0.45), textAlign: "right", whiteSpace: "nowrap", fontSize: 10.5 };
            const tds: React.CSSProperties = { padding: "4px 6px", textAlign: "right", whiteSpace: "nowrap" };
            return (
            <div style={{ marginTop: 8, fontSize: 10.5, color: white(0.45), lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ color: white(0.5) }}>
                Change any value and press Enter (or click away) — the table above recalculates. Empty a box to go back to its default.
              </div>
              <div>
                <b style={{ color: white(0.6) }}>Energy carriers</b>
                <table style={{ borderCollapse: "collapse", marginTop: 4 }}>
                  <thead><tr>
                    <th style={{ ...ths, textAlign: "left" }}></th>
                    <th style={ths}>Price ({cur}/kWh)</th>
                    <th style={ths}>Carbon (g CO₂e/kWh)</th>
                    <th style={{ ...ths, textAlign: "left" }}>Source of the default</th>
                  </tr></thead>
                  <tbody>
                    {Object.entries(baseCatalogue.carriers).filter(([, c]) => !!c).map(([key, def]) => {
                      const c = catalogue.carriers[key]!;
                      return (
                        <tr key={key} style={{ borderTop: `1px solid ${white(0.06)}` }}>
                          <td style={{ ...tds, textAlign: "left", color: white(0.7), fontWeight: 700 }}>{def!.label}</td>
                          <td style={tds}><NumField value={c.tariffSek} def={def!.tariffSek} step={0.01} onCommit={(v) => setCarrier(key, "tariffSek", v)} /></td>
                          <td style={tds}><NumField value={Math.round(c.carbonKgPerKwh * 10000) / 10} def={Math.round(def!.carbonKgPerKwh * 10000) / 10} step={1}
                            onCommit={(v) => setCarrier(key, "carbonKgPerKwh", v == null ? undefined : v / 1000)} /></td>
                          <td style={{ ...tds, textAlign: "left", whiteSpace: "normal", color: white(0.35), maxWidth: 520 }}>{def!.source}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div>
                <b style={{ color: white(0.6) }}>Systems</b>
                <table style={{ borderCollapse: "collapse", marginTop: 4 }}>
                  <thead><tr>
                    <th style={{ ...ths, textAlign: "left" }}></th>
                    <th style={ths} title="Seasonal performance factor (heat pumps) or efficiency. The low/high band used for robustness moves with it.">SPF / eff.</th>
                    <th style={ths}>Install, fixed ({cur})</th>
                    <th style={ths}>Install per kW ({cur}/kW)</th>
                    <th style={ths}>Life (yr)</th>
                    <th style={{ ...ths, textAlign: "left" }}>Source of the default</th>
                  </tr></thead>
                  <tbody>
                    {baseCatalogue.systems.map((def) => {
                      const s = catalogue.systems.find((x) => x.id === def.id)!;
                      return (
                        <tr key={def.id} style={{ borderTop: `1px solid ${white(0.06)}` }}>
                          <td style={{ ...tds, textAlign: "left", color: white(0.7), fontWeight: 700 }}>
                            {def.shortName}{def.provisional ? <span style={{ fontWeight: 400, color: white(0.35) }}> (cost provisional)</span> : null}
                          </td>
                          <td style={tds}><NumField value={s.spf.base} def={def.spf.base} step={0.1} width={56} onCommit={(v) => setSystem(def.id, "spfBase", v)} /></td>
                          <td style={tds}><NumField value={s.capexFixedSek} def={def.capexFixedSek} step={1000} width={84} onCommit={(v) => setSystem(def.id, "capexFixedSek", v)} /></td>
                          <td style={tds}><NumField value={s.capexPerKwSek} def={def.capexPerKwSek} step={100} width={72} onCommit={(v) => setSystem(def.id, "capexPerKwSek", v)} /></td>
                          <td style={tds}><NumField value={s.lifetimeYr} def={def.lifetimeYr} step={1} width={48} onCommit={(v) => setSystem(def.id, "lifetimeYr", v)} /></td>
                          <td style={{ ...tds, textAlign: "left", whiteSpace: "normal", color: white(0.35), maxWidth: 420 }}>{def.source}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ color: white(0.4) }}>
                Design-kW for capex uses {catalogue.eflhNote}. The low/high SPF band feeds the robustness analysis and moves
                with the value you enter. Values marked "provisional" are ballpark figures — replace with real quotes as you validate.
              </div>
            </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
