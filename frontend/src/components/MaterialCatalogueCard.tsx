import { useMemo, useState } from "react";
import { CURRENCY as UK_CURRENCY } from "../config/materialCatalogueUK";
import { CURRENCY as BE_CURRENCY } from "../config/materialCatalogueBE";
import { catalogueMaterials, catalogueExcludedCount } from "../config/materialCatalogue";
import { CollapsibleCard } from "./CollapsibleCard";

/* The renovation-materials catalogue behind every UK / Belgian option in Step 4
   (price, embodied carbon, thickness, λ) with the source and quality of each
   value — so a number in the optimiser can be traced back to its row. */
const white = (o: number) => `rgba(255,255,255,${o})`;

export default function MaterialCatalogueCard({ country }: { country: "UK" | "BE" }) {
  const mats = catalogueMaterials(country === "UK" ? "gb" : "be");
  const excluded = catalogueExcludedCount(country === "UK" ? "gb" : "be");
  const cur = country === "UK" ? UK_CURRENCY : BE_CURRENCY;
  const sym = cur === "GBP" ? "£" : "€";
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const cats = useMemo(() => ["all", ...Array.from(new Set(mats.map((m) => m.category)))], [mats]);
  const rows = mats.filter((m) => (cat === "all" || m.category === cat)
    && (!q || `${m.id} ${m.item} ${m.spec}`.toLowerCase().includes(q.toLowerCase())));

  const th = { padding: "6px 8px", fontWeight: 700, fontSize: 10, textTransform: "uppercase" as const, letterSpacing: 0.8, color: white(0.4), textAlign: "left" as const, whiteSpace: "nowrap" as const };
  const td = { padding: "7px 8px", fontSize: 11.5, color: white(0.75), verticalAlign: "top" as const };

  return (
    <div style={{ marginTop: 10 }}>
      <CollapsibleCard
        title={`Renovation Materials Catalogue — ${country === "UK" ? "United Kingdom" : "Belgium"}`}
        subtitle={`${mats.length} materials with both price and embodied carbon — the options Step 4 builds packages from (${excluded} workbook rows left out)`}
        color="#4ECDC4">
        <p style={{ fontSize: 11.5, color: white(0.5), margin: "0 0 10px", lineHeight: 1.55 }}>
          Prices are <b>material only, incl. VAT, excluding labour</b> (Oct 2026 workbook). Carbon is embodied A1–A3 per unit.
          Insulation is priced and carbon-rated at the listed thickness and scaled linearly to the chosen thickness; its U-value
          comes from λ (EN ISO 6946). Only materials with <b>both a price and an embodied-carbon value</b> are listed and offered
          in Step 4 — {excluded} workbook rows missing either are left out until the workbook is completed.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search material…"
            style={{ flex: 1, minWidth: 180, padding: "6px 10px", borderRadius: 8, border: `1px solid ${white(0.15)}`, background: white(0.05), color: "#fff", fontSize: 12 }} />
          <select value={cat} onChange={(e) => setCat(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${white(0.15)}`, background: white(0.05), color: "#fff", fontSize: 12 }}>
            {cats.map((c) => <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>)}
          </select>
        </div>
        <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>ID</th><th style={th}>Material</th><th style={th}>Spec</th>
                <th style={th}>Price</th><th style={th}>Carbon A1–A3</th><th style={th}>λ W/mK</th><th style={th}>Sources</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} style={{ borderTop: `1px solid ${white(0.06)}` }}>
                  <td style={{ ...td, fontFamily: "ui-monospace, monospace", color: white(0.5) }}>{m.id}</td>
                  <td style={td}>
                    <div style={{ color: "#fff", fontWeight: 600 }}>{m.item}</div>
                    <div style={{ fontSize: 10, color: white(0.4) }}>{m.category}</div>
                  </td>
                  <td style={td}>{m.spec}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    {m.price == null
                      ? <span style={{ color: "#E8880C", fontWeight: 700 }}>no price</span>
                      : <>{sym}{m.price.toFixed(2)} <span style={{ color: white(0.4) }}>/{m.unit}</span></>}
                    {m.priceQuality && <div style={{ fontSize: 9.5, color: white(0.4) }}>{m.priceQuality}</div>}
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    {m.gwp == null ? <span style={{ color: white(0.35) }}>—</span> : <>{m.gwp} kg <span style={{ color: white(0.4) }}>/{m.unit}</span></>}
                    {m.carbonQuality && <div style={{ fontSize: 9.5, color: white(0.4) }}>{m.carbonQuality}</div>}
                  </td>
                  <td style={td}>{m.lambda ?? "—"}</td>
                  <td style={{ ...td, fontSize: 10.5, color: white(0.45), minWidth: 260 }}>
                    {m.priceSource && <div><b style={{ color: white(0.6) }}>Price:</b> {m.priceSource}</div>}
                    {m.carbonSource && <div><b style={{ color: white(0.6) }}>Carbon:</b> {m.carbonSource}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleCard>
    </div>
  );
}
