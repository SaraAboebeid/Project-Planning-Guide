import OptimizationAssumptions from "../components/OptimizationAssumptions";
import MethodEquationsPanel from "../components/MethodEquationsPanel";
import MaterialCatalogueCard from "../components/MaterialCatalogueCard";

/* Belgium's Data Explorer. Until now the Data Explorer tab sent Belgian
   projects to the Swedish page, so nothing here documented where Belgian
   numbers came from. This page lists the datasets the Belgian pipeline uses,
   the Step 4 optimiser's assumptions and the materials catalogue. */
const white = (o: number) => `rgba(255,255,255,${o})`;

const SOURCES: { name: string; role: string; note: string }[] = [
  { name: "UrbIS (Brussels Region)", role: "Building footprints & heights — Brussels", note: "Regional large-scale reference map; heights give floors and the EnergyPlus shoebox." },
  { name: "PICC / LoD1 3D buildings (Wallonia)", role: "Building footprints & heights — Liège", note: "Walloon reference geometry; LoD1 blocks give heights." },
  { name: "BeST address register", role: "Addresses", note: "Belgian streets and addresses register, joined to footprints." },
  { name: "Walloon EPB (PEB) certificates", role: "Energy performance — Liège (area level)", note: "No per-building certificates are matched yet, so baselines come from TABULA archetypes; calibration against PEB is the next step." },
  { name: "TABULA / EPISCOPE Belgium", role: "As-built U-values & refurbishment tiers", note: "Archetype U-values by building type and age band; the one-click refurbishment tiers in Step 4 (no cost data)." },
  { name: "TMYx weather files (climate.onebuilding.org)", role: "Simulation weather & heating degree-days", note: "Uccle (Brussels, Ghent) and Liège Airport; the optimiser's HDD is computed from the same files." },
  { name: "Belgium Renovation Materials Catalogue (Oct 2026)", role: "Cost & embodied carbon of every Step 4 option", note: "Material prices incl. VAT (excl. labour) and A1–A3 carbon — listed in full below." },
];

export default function BEDataExplorer() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1100 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fff", margin: "0 0 4px" }}>Belgium — data &amp; assumptions</h1>
        <p style={{ fontSize: 13, color: white(0.5), margin: 0, lineHeight: 1.6 }}>
          Where every Belgian number in the planner comes from: building data, weather, the Step 4 optimiser's prices,
          carbon factors and modelling choices, and the materials catalogue the renovation options are priced from.
        </p>
      </div>

      <div style={{ borderRadius: 14, background: "rgba(255,255,255,0.03)", border: `1px solid ${white(0.08)}`, padding: "14px 18px" }}>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.4, color: white(0.35), textTransform: "uppercase", marginBottom: 8 }}>Datasets</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {SOURCES.map((s) => (
            <div key={s.name} style={{ display: "grid", gridTemplateColumns: "minmax(200px, 1fr) minmax(200px, 1fr) 2fr", gap: 12, fontSize: 12, padding: "6px 0", borderTop: `1px solid ${white(0.06)}` }}>
              <span style={{ fontWeight: 700, color: "#fff" }}>{s.name}</span>
              <span style={{ color: "#4ECDC4" }}>{s.role}</span>
              <span style={{ color: white(0.5) }}>{s.note}</span>
            </div>
          ))}
        </div>
      </div>

      <MethodEquationsPanel />
      <OptimizationAssumptions country="BE" />
      <MaterialCatalogueCard country="BE" />
    </div>
  );
}
