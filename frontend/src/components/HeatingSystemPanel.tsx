import { useEffect, useMemo, useRef, useState } from "react";
import { Flame, ChevronDown, ChevronUp, Info, Check } from "lucide-react";
import { computeHvac, type HvacResult } from "../utils/hvacAnalysis";
import { CARRIERS, HVAC_SYSTEMS, GOTHENBURG_EFLH } from "../config/hvacSystems";
import { useWizardStore } from "../store/wizard";

const white = (o: number) => `rgba(255,255,255,${o})`;

/** SEK formatter: M for millions, k for thousands. */
function sek(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)} M`;
  if (a >= 1e4) return `${Math.round(v / 1e3)} k`;
  return `${Math.round(v).toLocaleString("sv-SE")}`;
}

const PICKS: Record<string, { fg: string; label: string }> = {
  lowestLcc: { fg: "#2FB477", label: "Lowest 30-yr cost" },
  lowestCarbon: { fg: "#4ECDC4", label: "Lowest carbon" },
  lowestEnergy: { fg: "#4A90E2", label: "Lowest energy" },
  lowestOpCost: { fg: "#B98BE8", label: "Cheapest to run" },
};

export default function HeatingSystemPanel({
  heatingDemandKwhM2Yr, floorAreaM2, studyPeriodYr = 30, discountRate = 0.03,
}: {
  heatingDemandKwhM2Yr: number;
  floorAreaM2: number;
  studyPeriodYr?: number;
  discountRate?: number;
}) {
  const [open, setOpen] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const selectedId = useWizardStore((s) => s.project.heatingSystemId);
  const setProject = useWizardStore((s) => s.setProject);

  const outcome = useMemo(
    () => computeHvac({ heatingDemandKwhM2Yr, floorAreaM2, studyPeriodYr, discountRate }),
    [heatingDemandKwhM2Yr, floorAreaM2, studyPeriodYr, discountRate],
  );
  const { results, picks } = outcome;
  const selected = results.find((r) => r.id === selectedId) ?? results.find((r) => r.isBaseline) ?? results[0] ?? null;
  const selectSystem = (id: string) => setProject({ heatingSystemId: id });

  // Persist for the Step-5 report (only when the content changes).
  const sigRef = useRef("");
  useEffect(() => {
    const payload = { ...outcome, selectedId, heatingDemandKwhM2Yr };
    const sig = JSON.stringify(payload);
    if (sig === sigRef.current) return;
    sigRef.current = sig;
    setProject({ heatingAnalysis: payload });
  }, [outcome, selectedId, heatingDemandKwhM2Yr, setProject]);

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
                {selected.deliveredKwhM2Yr} kWh/m²·yr · {sek(selected.operatingCostYrSek)} SEK/yr · {sek(selected.carbonYrKg)} kg CO₂e/yr · {sek(selected.lccSek)} SEK life-cycle
              </span>
              {!selected.isBaseline && selected.vsBaseline && (
                <span style={{ fontSize: 10.5, color: selected.vsBaseline.opCostPct < 0 ? "#2FB477" : "#E2483B" }}>
                  ({selected.vsBaseline.opCostPct > 0 ? "+" : ""}{selected.vsBaseline.opCostPct}% cost, {selected.vsBaseline.carbonPct > 0 ? "+" : ""}{selected.vsBaseline.carbonPct}% carbon vs district heating)
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
                  <th style={th}>Op. cost<br /><span style={{ fontWeight: 400, color: white(0.3) }}>SEK/yr</span></th>
                  <th style={th}>Carbon<br /><span style={{ fontWeight: 400, color: white(0.3) }}>kg CO₂e/yr</span></th>
                  <th style={th}>Install<br /><span style={{ fontWeight: 400, color: white(0.3) }}>capex SEK</span></th>
                  <th style={th}>{studyPeriodYr}-yr LCC<br /><span style={{ fontWeight: 400, color: white(0.3) }}>SEK</span></th>
                </tr>
              </thead>
              <tbody>
                {results.map((s: HvacResult) => {
                  const tags = picksFor(s.id);
                  const isSel = s.id === selectedId;
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
            <Info size={13} /> Assumptions &amp; sources {showSources ? "▲" : "▼"}
          </button>
          {showSources && (
            <div style={{ marginTop: 8, fontSize: 10.5, color: white(0.45), lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <b style={{ color: white(0.6) }}>Energy carriers</b> (editable defaults):
                {(Object.values(CARRIERS)).map((c) => (
                  <div key={c.key} style={{ marginLeft: 8 }}>· <b style={{ color: white(0.6) }}>{c.label}</b>: {c.tariffSek} SEK/kWh · {(c.carbonKgPerKwh * 1000).toFixed(0)} g CO₂e/kWh — <span style={{ color: white(0.35) }}>{c.source}</span></div>
                ))}
              </div>
              <div>
                <b style={{ color: white(0.6) }}>Systems</b> — SPF (low/base/high) &amp; sources:
                {HVAC_SYSTEMS.map((s) => (
                  <div key={s.id} style={{ marginLeft: 8 }}>· <b style={{ color: white(0.6) }}>{s.shortName}</b>: SPF {s.spf.low}/{s.spf.base}/{s.spf.high}, life {s.lifetimeYr} yr{s.provisional ? " (cost provisional)" : ""} — <span style={{ color: white(0.35) }}>{s.source}</span></div>
                ))}
              </div>
              <div style={{ color: white(0.4) }}>
                Design-kW for capex uses {GOTHENBURG_EFLH} equivalent full-load hours (Gothenburg climate). SPF is shown at its base value; the low/high band feeds the
                robustness analysis. Costs marked "provisional" are Swedish ballpark figures — replace with real quotes as you validate.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
