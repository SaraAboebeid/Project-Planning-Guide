import { useState, useEffect } from "react";
import { ASSUMPTIONS, EQUATIONS, METHODS, OPTIMIZER_ATTRIBUTION, type Country } from "../config/optimizationAssumptions";
import { api } from "../api/client";

/* The five economy/climate parameters + equations + methods + sources for the
   MILP optimizer. Locked to a single country per page — the Sweden and UK Data
   Explorers each render their own instance (no cross-country toggle). */
export default function OptimizationAssumptions({ country = "SE" }: { country?: Country }) {
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
  const countryName = country === "SE" ? "Sweden" : "United Kingdom";

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: "#fff", margin: 0 }}>Optimization assumptions</h2>
        <span style={{
          padding: "3px 12px", borderRadius: 99, fontSize: 11, fontWeight: 700,
          background: "rgba(114,28,184,0.35)", border: "1px solid rgba(114,28,184,0.6)", color: "#fff",
        }}>{countryName}</span>
      </div>
      <p style={{ fontSize: 12, color: white(0.45), margin: "0 0 14px 0" }}>
        The five economy/climate parameters that turn the building physics into cost, carbon and energy for
        {" "}{countryName} — each with its source. Used by the multi-objective (MILP) optimizer.
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
                  {a.live && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: "#2FB477" }}>● LIVE</span>}
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

      {/* Equations — credited at the title, where the formulation is, rather
          than in a footnote at the bottom of the section. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "18px 0 8px 0" }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: white(0.8), margin: 0 }}>Equations</h3>
        <span style={{ fontSize: 10, color: white(0.35) }}>based on the work of</span>
        {OPTIMIZER_ATTRIBUTION.names.map((n) => (
          <span key={n} style={{
            fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 99,
            background: "rgba(78,205,196,0.12)", border: "1px solid rgba(78,205,196,0.35)", color: "#4ECDC4",
          }}>{n}</span>
        ))}
      </div>
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

      {/* Methods */}
      <h3 style={{ fontSize: 13, fontWeight: 700, color: white(0.8), margin: "18px 0 8px 0" }}>Methods</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {METHODS.map(m => (
          <div key={m.name} style={{
            background: "rgba(255,255,255,0.03)", border: `1px solid ${white(0.07)}`, borderRadius: 10, padding: "9px 14px",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: white(0.8) }}>{m.name}</div>
            <code style={{
              display: "block", fontSize: 11.5, color: "#4ECDC4", margin: "4px 0",
              fontFamily: "ui-monospace, monospace", whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>{m.latexish}</code>
            <div style={{ fontSize: 11, color: white(0.42) }}>{m.explain}</div>
            <a href={m.sourceUrl} target="_blank" rel="noreferrer" style={{
              fontSize: 10.5, color: "#9B7FD4", textDecoration: "none", marginTop: 4, display: "inline-block",
            }}>Source: {m.source} ↗</a>
          </div>
        ))}
      </div>

    </div>
  );
}
