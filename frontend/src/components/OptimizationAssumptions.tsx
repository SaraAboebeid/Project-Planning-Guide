import { useState, useEffect } from "react";
import { ASSUMPTIONS, EQUATIONS, type Country } from "../config/optimizationAssumptions";
import { api } from "../api/client";

/* The five economy/climate parameters + equations + sources for the MILP
   optimizer. Shared by the Sweden and UK Data Explorers (defaultCountry differs). */
export default function OptimizationAssumptions({ defaultCountry = "SE" }: { defaultCountry?: Country }) {
  const [country, setCountry] = useState<Country>(defaultCountry);
  const [livePrice, setLivePrice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLivePrice(null);
    const cc = country === "SE" ? "se" : "uk";
    api.energyPrice(cc).then(r => {
      if (active && r.live && r.average_price != null)
        setLivePrice(`${r.average_price} ${r.unit} (avg${r.date ? `, ${r.date}` : ""}${r.zone ? `, ${r.zone}` : ""})`);
    }).catch(() => {});
    return () => { active = false; };
  }, [country]);

  const rows = ASSUMPTIONS[country];
  const white = (o: number) => `rgba(255,255,255,${o})`;

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: "#fff", margin: 0 }}>Optimization assumptions</h2>
        <div style={{ display: "flex", gap: 6 }}>
          {(["SE", "UK"] as const).map(c => (
            <button key={c} onClick={() => setCountry(c)} style={{
              padding: "3px 12px", borderRadius: 99, fontSize: 11, fontWeight: 700, cursor: "pointer",
              background: country === c ? "rgba(114,28,184,0.35)" : "rgba(255,255,255,0.06)",
              border: `1px solid ${country === c ? "rgba(114,28,184,0.6)" : "rgba(255,255,255,0.10)"}`,
              color: country === c ? "#fff" : white(0.55),
            }}>{c === "SE" ? "Sweden" : "United Kingdom"}</button>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 12, color: white(0.45), margin: "0 0 14px 0" }}>
        The five economy/climate parameters that turn the building physics into cost, carbon and energy —
        each with its source. Used by the multi-objective (MILP) optimizer.
      </p>

      {/* Parameter cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map(a => {
          const isLive = a.key === "energy_price" && livePrice;
          return (
            <div key={a.key} style={{
              background: "rgba(255,255,255,0.03)", border: `1px solid ${white(0.08)}`,
              borderRadius: 10, padding: "10px 14px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: white(0.85) }}>{a.label}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#4ECDC4", whiteSpace: "nowrap" }}>
                  {isLive ? livePrice : `${a.value ?? "—"} ${a.unit}`}
                  {a.live && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: "#96D74C" }}>● LIVE</span>}
                  {a.provisional && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: "#F5A623" }}>PROVISIONAL</span>}
                </span>
              </div>
              {a.note && <div style={{ fontSize: 11, color: white(0.42), marginTop: 3 }}>{a.note}</div>}
              <a href={a.sourceUrl} target="_blank" rel="noreferrer" style={{
                fontSize: 10.5, color: "#9B7FD4", textDecoration: "none", marginTop: 4, display: "inline-block",
              }}>Source: {a.source} ↗</a>
            </div>
          );
        })}
      </div>

      {/* Equations */}
      <h3 style={{ fontSize: 13, fontWeight: 700, color: white(0.8), margin: "18px 0 8px 0" }}>Equations</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {EQUATIONS.map(eq => (
          <div key={eq.name} style={{
            background: "rgba(255,255,255,0.03)", border: `1px solid ${white(0.07)}`, borderRadius: 10, padding: "9px 14px",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: white(0.8) }}>{eq.name}</div>
            <code style={{
              display: "block", fontSize: 11.5, color: "#4ECDC4", margin: "4px 0",
              fontFamily: "ui-monospace, monospace", whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>{eq.latexish}</code>
            <div style={{ fontSize: 11, color: white(0.42) }}>{eq.explain}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: white(0.35), marginTop: 10 }}>
        Q_fixed is derived per building from its EPC (total specific energy minus envelope transmission), not a
        looked-up constant. Values marked PROVISIONAL still need confirming against the cited source.
      </p>
    </div>
  );
}
