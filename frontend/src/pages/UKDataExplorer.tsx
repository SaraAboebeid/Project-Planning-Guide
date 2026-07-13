import { useEffect, useState } from "react";

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d={d} />
    </svg>
  );
}

const IC = {
  building: "M12 3L2 12h3v8h6v-5h2v5h6v-8h3L12 3z",
  epc: "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z",
  tabula: "M3 3h18v4H3zm0 6h18v4H3zm0 6h18v4H3z",
  survey: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8 14H7v-2h4v2zm6-4H7v-2h10v2zm0-4H7V7h10v2z",
};

type Source = {
  id: string;
  name: string;
  description: string;
  accent: string;
  iconD: string;
  fields: string[];
  file: string;
};

const UK_SOURCES: Source[] = [
  {
    id: "eubucco_uk",
    name: "3D Buildings (EUBUCCO UK)",
    description: "Building geometry and stock fields for UK footprint-level analysis.",
    accent: "#4A90E2",
    iconD: IC.building,
    fields: ["building_id", "lat", "lon", "height_m", "floors", "use_cat", "build_year"],
    file: "/uk/eubucco_uk_sample.json",
  },
  {
    id: "epc_uk",
    name: "EPC (United Kingdom)",
    description: "Energy certification records prepared for join-by-address/U PRN workflows.",
    accent: "#96D74C",
    iconD: IC.epc,
    fields: ["uprn", "address", "epc_band", "energy_use_kwh_m2", "inspection_date", "property_type"],
    file: "/uk/epc_uk_sample.json",
  },
  {
    id: "tabula_uk",
    name: "TABULA UK Archetypes",
    description: "Fallback archetypes for envelope and thermal defaults when EPC is incomplete.",
    accent: "#4ECDC4",
    iconD: IC.tabula,
    fields: ["archetype_id", "dwelling_type", "construction_period", "u_wall", "u_roof", "u_window"],
    file: "/uk/tabula_uk_sample.json",
  },
  {
    id: "ehs_2024_2025",
    name: "English Housing Survey 2024-2025",
    description: "National/regional survey indicators for calibration and scenario assumptions.",
    accent: "#F59E0B",
    iconD: IC.survey,
    fields: ["region", "tenure", "mean_floor_area_m2", "median_sap", "fuel_poverty_share", "survey_year"],
    file: "/uk/english_housing_survey_2024_2025_sample.json",
  },
];

function SourceCard({ source }: { source: Source }) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  async function togglePreview() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (rows) return;
    setLoading(true);
    try {
      const res = await fetch(source.file);
      const data = await res.json() as Record<string, unknown>[];
      setRows(data);
    } catch {
      setRows([{ error: "Failed to load sample file." }]);
    } finally {
      setLoading(false);
    }
  }

  const cols = rows && rows.length > 0 ? Object.keys(rows[0]!).slice(0, 8) : [];

  return (
    <div style={{
      borderRadius: 14,
      border: `1px solid ${expanded ? `${source.accent}60` : "rgba(255,255,255,0.10)"}`,
      background: expanded ? `${source.accent}0f` : "rgba(13,17,23,0.8)",
      overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px" }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `${source.accent}20`,
          border: `1px solid ${source.accent}40`,
          color: source.accent,
        }}>
          <Icon d={source.iconD} size={18} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{source.name}</div>
          <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>{source.description}</p>
        </div>

        <button
          onClick={togglePreview}
          style={{
            borderRadius: 8,
            border: `1px solid ${expanded ? `${source.accent}70` : "rgba(255,255,255,0.16)"}`,
            background: expanded ? `${source.accent}2a` : "rgba(255,255,255,0.06)",
            color: expanded ? source.accent : "rgba(255,255,255,0.75)",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            padding: "7px 12px",
          }}
        >
          {loading ? "Loading..." : expanded ? "Hide" : "Preview"}
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "0 18px 14px" }}>
        {source.fields.map((field) => (
          <span key={field} style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.56)",
            padding: "2px 8px",
            borderRadius: 99,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.05)",
            fontFamily: "monospace",
          }}>
            {field}
          </span>
        ))}
      </div>

      {expanded && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: "14px 18px" }}>
          {loading && <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Loading sample...</div>}
          {!loading && rows && rows.length > 0 && (
            <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid rgba(255,255,255,0.10)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                    {cols.map((col) => (
                      <th key={col} style={{
                        padding: "8px 10px",
                        textAlign: "left",
                        color: "rgba(255,255,255,0.45)",
                        fontSize: 10,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                      }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 6).map((row, rowIndex) => (
                    <tr key={rowIndex} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      {cols.map((col) => (
                        <td key={col} style={{ padding: "8px 10px", color: "rgba(255,255,255,0.82)" }}>
                          {row[col] == null ? "-" : String(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function UKDataExplorer() {
  const [healthOk, setHealthOk] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => setHealthOk(r.ok))
      .catch(() => setHealthOk(false));
  }, []);

  return (
    <div style={{ padding: "0 0 40px 0", maxWidth: 920, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: 0 }}>Data Explorer</h1>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "3px 9px",
            borderRadius: 99,
            background: "rgba(95,165,255,0.15)",
            border: "1px solid rgba(95,165,255,0.35)",
            color: "#93c5fd",
          }}>
            United Kingdom
          </span>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "3px 9px",
            borderRadius: 99,
            background: healthOk ? "rgba(150,215,76,0.15)" : "rgba(255,255,255,0.08)",
            border: `1px solid ${healthOk ? "#96D74C50" : "rgba(255,255,255,0.12)"}`,
            color: healthOk ? "#96D74C" : "rgba(255,255,255,0.40)",
          }}>
            {healthOk === null ? "Checking..." : healthOk ? "● Backend online" : "○ Backend offline"}
          </span>
        </div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: 0 }}>
          UK dataset workspace with the same explorer structure: EUBUCCO UK, EPC UK, TABULA UK, and English Housing Survey 2024-2025.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {UK_SOURCES.map((source) => (
          <SourceCard key={source.id} source={source} />
        ))}
      </div>
    </div>
  );
}
