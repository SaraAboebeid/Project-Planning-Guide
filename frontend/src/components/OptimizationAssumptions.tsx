import { useState, useEffect } from "react";
import { ASSUMPTIONS, EQUATIONS, METHODS, OPTIMIZER_ATTRIBUTION, type Country } from "../config/optimizationAssumptions";
import { api } from "../api/client";
import { CollapsibleCard, EquationRow, SubHead } from "./CollapsibleCard";

/* The MILP optimizer's assumptions + equations + methods + sources, rendered as
   one collapsible card that shares its style with the other method cards on the
   Data Explorer (see MethodEquationsPanel). All of the tool's assumptions and
   equations live together here. */
const white = (o: number) => `rgba(255,255,255,${o})`;

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
  const countryName = country === "SE" ? "Sweden" : "United Kingdom";

  const pill = (
    <span style={{
      padding: "2px 10px", borderRadius: 99, fontSize: 10.5, fontWeight: 700,
      background: "rgba(114,28,184,0.35)", border: "1px solid rgba(114,28,184,0.6)", color: "#fff",
    }}>{countryName}</span>
  );

  return (
    <div style={{ marginTop: 10 }}>
      <CollapsibleCard title="Optimization Model" subtitle="Multi-objective (MILP) retrofit optimisation" color="#B98BE8" badge={pill}>
        {/* Assumptions — the numeric parameters */}
        <SubHead>Assumptions — turn building physics into cost, carbon &amp; energy for {countryName}</SubHead>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map(a => {
            const isLive = a.key === "energy_price" && livePrice;
            return (
              <div key={a.key} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${white(0.08)}`, borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: white(0.85) }}>{a.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#4ECDC4", whiteSpace: "nowrap" }}>
                    {isLive ? livePrice : `${a.value ?? "—"} ${a.unit}`}
                    {a.live && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: "#2FB477" }}>● LIVE</span>}
                    {a.provisional && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: "#F5A623" }}>PROVISIONAL</span>}
                  </span>
                </div>
                {a.note && <div style={{ fontSize: 11, color: white(0.42), marginTop: 3 }}>{a.note}</div>}
                <a href={a.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10.5, color: "#9B7FD4", textDecoration: "none", marginTop: 4, display: "inline-block" }}>Source: {a.source} ↗</a>
              </div>
            );
          })}
        </div>

        {/* Equations */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "16px 0 8px 0" }}>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.4, color: white(0.35), textTransform: "uppercase" }}>Equations</span>
          <span style={{ fontSize: 10, color: white(0.35) }}>based on the work of</span>
          {OPTIMIZER_ATTRIBUTION.names.map((n) => (
            <span key={n} style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: "rgba(78,205,196,0.12)", border: "1px solid rgba(78,205,196,0.35)", color: "#4ECDC4" }}>{n}</span>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {EQUATIONS.map(eq => (
            <EquationRow key={eq.name} label={eq.name} tex={eq.latexish} explain={eq.explain} />
          ))}
        </div>
        <p style={{ fontSize: 11, color: white(0.35), marginTop: 10 }}>
          Q_fixed is derived per building from its EPC (total specific energy minus envelope transmission), not a
          looked-up constant. Values marked PROVISIONAL still need confirming against the cited source.
        </p>

        {/* Methods */}
        <SubHead>Methods</SubHead>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {METHODS.map(m => (
            <div key={m.name}>
              <EquationRow label={m.name} tex={m.latexish} explain={m.explain} />
              <a href={m.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10.5, color: "#9B7FD4", textDecoration: "none", marginTop: 3, display: "inline-block" }}>Source: {m.source} ↗</a>
            </div>
          ))}
        </div>
      </CollapsibleCard>
    </div>
  );
}
