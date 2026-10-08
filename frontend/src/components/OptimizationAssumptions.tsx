import { useState, useEffect } from "react";
import {
  ASSUMPTIONS, EQUATIONS, METHODS, MODEL_ASSUMPTIONS, OPTION_DATA_SOURCES, OPTIMIZER_ATTRIBUTION,
  type Assumption, type Country,
} from "../config/optimizationAssumptions";
import { api } from "../api/client";
import { CollapsibleCard, EquationRow, SubHead } from "./CollapsibleCard";

/* The optimiser's assumptions + equations + methods + sources, rendered as one
   collapsible card that shares its style with the other method cards on the
   Data Explorer (see MethodEquationsPanel). RenovationSimulator reads the SAME
   values (assumptionValue), so what is listed here is what the tool uses. */
const white = (o: number) => `rgba(255,255,255,${o})`;
const COUNTRY_NAME: Record<Country, string> = { SE: "Sweden", UK: "United Kingdom", BE: "Belgium" };

function AssumptionRow({ a, liveText }: { a: Assumption; liveText?: string | null }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${white(0.08)}`, borderRadius: 10, padding: "10px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: white(0.85) }}>{a.label}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#4ECDC4", whiteSpace: "nowrap" }}>
          {liveText ?? (a.value == null ? a.unit : `${a.value} ${a.unit}`)}
          {a.live && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: "#2FB477" }}>● LIVE{!liveText ? " (fallback shown)" : ""}</span>}
          {a.provisional && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: "#F5A623" }}>ASSUMED / PROVISIONAL</span>}
        </span>
      </div>
      {a.usedIn && (
        <div style={{ marginTop: 4 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, padding: "1px 8px", borderRadius: 99,
            background: "rgba(78,205,196,0.12)", border: "1px solid rgba(78,205,196,0.3)", color: "#4ECDC4" }}>
            Used in: {a.usedIn}
          </span>
        </div>
      )}
      {a.note && <div style={{ fontSize: 11, color: white(0.42), marginTop: 4 }}>{a.note}</div>}
      <a href={a.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10.5, color: "#9B7FD4", textDecoration: "none", marginTop: 4, display: "inline-block" }}>Source: {a.source} ↗</a>
    </div>
  );
}

export default function OptimizationAssumptions({ country = "SE" }: { country?: Country }) {
  // Live values replace the fallback for the rows the tool fetches at run time.
  const [live, setLive] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    setLive({});
    if (country === "BE") return;   // Belgian prices are not fetched live (yet)
    api.energyPrice(country === "SE" ? "se" : "gb", country === "UK" ? "rotherham" : undefined).then((r) => {
      if (!active) return;
      const out: Record<string, string> = {};
      if (country === "SE" && r.live && r.average_price != null)
        out.energy_price = `${r.average_price} ${r.unit} (avg${r.date ? `, ${r.date}` : ""}${r.zone ? `, ${r.zone}` : ""})`;
      if (country === "UK" && r.retail) {
        const g = r.retail.gas?.unit_gbp_per_kwh, e = r.retail.electricity?.unit_gbp_per_kwh;
        if (g != null) out.gas_price = `${g.toFixed(4)} GBP/kWh (live cap)`;
        if (e != null) out.electricity_price = `${e.toFixed(4)} GBP/kWh (live cap)`;
      }
      setLive(out);
    }).catch(() => {});
    return () => { active = false; };
  }, [country]);

  const rows = ASSUMPTIONS[country];
  const countryName = COUNTRY_NAME[country];

  const pill = (
    <span style={{
      padding: "2px 10px", borderRadius: 99, fontSize: 10.5, fontWeight: 700,
      background: "rgba(var(--brand-rgb),0.35)", border: "1px solid rgba(var(--brand-rgb),0.6)", color: "#fff",
    }}>{countryName}</span>
  );

  return (
    <div style={{ marginTop: 10 }}>
      <CollapsibleCard title="Optimization Model" subtitle="Step 4 optimisation & 30-year cost/carbon — every input, where it comes from, where it is used" color="#B98BE8" badge={pill}>
        {/* Country economy/climate data */}
        <SubHead>Energy, climate &amp; economy — {countryName}</SubHead>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((a) => <AssumptionRow key={a.key} a={a} liveText={live[a.key] ?? null} />)}
        </div>

        {/* Where each option's cost/carbon comes from */}
        <SubHead>Cost &amp; carbon of each renovation option — {countryName}</SubHead>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {OPTION_DATA_SOURCES[country].map((s) => (
            <div key={s.label} style={{ display: "flex", gap: 10, fontSize: 11.5, lineHeight: 1.5,
              background: "rgba(255,255,255,0.03)", border: `1px solid ${white(0.08)}`, borderRadius: 10, padding: "8px 14px" }}>
              <span style={{ minWidth: 150, fontWeight: 700, color: white(0.8) }}>{s.label}</span>
              <span style={{ color: white(0.55) }}>{s.text}</span>
            </div>
          ))}
        </div>

        {/* Modelling choices shared by every country */}
        <SubHead>Model assumptions (all countries)</SubHead>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {MODEL_ASSUMPTIONS.map((a) => <AssumptionRow key={a.key} a={a} />)}
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
          {EQUATIONS.map((eq) => (
            <EquationRow key={eq.name} label={eq.name} tex={eq.latexish} explain={eq.explain} />
          ))}
        </div>
        <p style={{ fontSize: 11, color: white(0.35), marginTop: 10 }}>
          The optimiser screens every combination on these fast equations; shortlisted packages are then simulated in
          EnergyPlus, and the Results view shows those verified figures. Values marked ASSUMED / PROVISIONAL still need
          confirming against the cited source or the building's own data.
        </p>

        {/* Methods */}
        <SubHead>Methods</SubHead>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {METHODS.map((m) => (
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
