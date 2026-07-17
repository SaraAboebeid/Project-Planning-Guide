import { useEffect, useState } from "react";
import OptimizationAssumptions from "../components/OptimizationAssumptions";

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

type Status = "live" | "cached" | "estimated" | "placeholder";

type Source = {
  id: string;
  name: string;
  description: string;
  accent: string;
  iconD: string;
  status: Status;
  fields: string[];
  sampleFn: () => Promise<Record<string, unknown>[]>;
};

const STATUS_LABEL: Record<Status, string> = {
  live: "Live",
  cached: "Cached",
  estimated: "Estimated",
  placeholder: "Placeholder",
};
const STATUS_COLOR: Record<Status, string> = {
  live: "#96D74C",
  cached: "#4A90E2",
  estimated: "#F59E0B",
  placeholder: "#EF4444",
};

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

// Flatten the annex-table shape { sections: { age: [{label, values}] } } into
// preview rows, since it isn't a flat array.
function flattenPriorSection(section: Record<string, { bands: Record<string, number> }>) {
  return Object.entries(section).map(([label, v]) => ({
    dwelling_age: label,
    ...Object.fromEntries(
      Object.entries(v.bands).map(([band, share]) => [`band_${band}`, `${(share * 100).toFixed(1)}%`])
    ),
  }));
}

const UK_SOURCES: Source[] = [
  {
    id: "uk_buildings",
    name: "3D Buildings (OpenStreetMap + EPC)",
    description:
      "Building footprints extruded for the 3D viewer. EPC band comes from a matched certificate where one exists; " +
      "otherwise it is estimated from English Housing Survey 2024-25 distributions and marked as an estimate.",
    accent: "#4A90E2",
    iconD: IC.building,
    status: "live",
    fields: ["osm_id", "address", "postcode", "use_cat", "eclass", "epc_source", "height", "footprint_m2", "tabula_period"],
    sampleFn: async () => {
      const registry = await fetchJson<{ cities: { id: string; buildings: number }[] }>("/api/uk/cities");
      const first = registry.cities[0];
      if (!first) return [];
      const rows = await fetchJson<Record<string, unknown>[]>(`/api/uk/buildings/${first.id}`);
      // Buildings carry a polygon in `coordinates`, which would otherwise swamp
      // the preview table — show the fields declared above instead.
      return rows
        .filter((r) => r.address)
        .slice(0, 8)
        .map((r) => ({
          osm_id: r.osm_id,
          address: r.address,
          postcode: r.postcode,
          use_cat: r.use_cat,
          eclass: r.eclass,
          epc_source: r.epc_source,
          height: r.height,
          footprint_m2: r.footprint_m2,
          tabula_period: r.tabula_period,
        }));
    },
  },
  {
    id: "epc_band_priors",
    name: "EPC Band Priors (English Housing Survey)",
    description:
      "P(EPC band | dwelling age) derived from the EHS 2024-25 national distribution. Used to estimate a building's " +
      "band when no certificate is matched to it.",
    accent: "#96D74C",
    iconD: IC.epc,
    status: "cached",
    fields: ["dwelling_age", "band_A", "band_B", "band_C", "band_D", "band_E", "band_F", "band_G"],
    sampleFn: async () => {
      const data = await fetchJson<{ priors: { "dwelling age": Record<string, { bands: Record<string, number> }> } }>(
        "/api/uk/epc-band-priors"
      );
      return flattenPriorSection(data.priors["dwelling age"]);
    },
  },
  {
    id: "tabula_uk",
    name: "Construction Eras (dwelling age bands)",
    description:
      "The construction-era buckets the viewer colours buildings by in ‘Year era’ mode — the same bands " +
      "the English Housing Survey reports EPC distributions against.",
    accent: "#4ECDC4",
    iconD: IC.tabula,
    status: "cached",
    fields: ["dwelling_age", "dwellings_thousands", "sample_size"],
    sampleFn: async () => {
      const data = await fetchJson<{ priors: { "dwelling age": Record<string, { dwellings_thousands: number; sample_size: number }> } }>(
        "/api/uk/epc-band-priors"
      );
      return Object.entries(data.priors["dwelling age"]).map(([label, v]) => ({
        dwelling_age: label,
        dwellings_thousands: v.dwellings_thousands,
        sample_size: v.sample_size,
      }));
    },
  },
  {
    id: "ehs_2024_2025",
    name: "English Housing Survey 2024-2025",
    description:
      "Headline national indicators — mean SAP rating, EPC band shares, and the cost to lift a dwelling to band C — " +
      "from MHCLG's 2024-25 headline report annex tables.",
    accent: "#F59E0B",
    iconD: IC.survey,
    status: "live",
    fields: ["label", "value", "unit", "year"],
    sampleFn: async () => {
      const data = await fetchJson<{ kpis: Record<string, unknown>[] }>("/api/uk/ehs");
      return data.kpis;
    },
  },
  {
    id: "retrofit_cost",
    name: "Retrofit Cost to Band C",
    description:
      "Mean and median cost to improve a dwelling to EPC band C, by dwelling age — feeds the Budget / Cost Estimate tool.",
    accent: "#EF6461",
    iconD: IC.tabula,
    status: "cached",
    fields: ["dwelling_age", "mean_gbp", "median_gbp", "sample_size"],
    sampleFn: async () => {
      const data = await fetchJson<{ costs: { "dwelling age": Record<string, Record<string, unknown>> } }>(
        "/api/uk/retrofit-cost"
      );
      return Object.entries(data.costs["dwelling age"]).map(([label, v]) => ({ dwelling_age: label, ...v }));
    },
  },
  {
    id: "uk_cost_carbon",
    name: "Renovation Cost & Embodied Carbon",
    description:
      "Two real candidate sources were reviewed and NOT wired in: the ICE Database Educational V5.0 " +
      "(Circular Ecology / University of Bath) — real embodied-carbon-per-material data, but its license explicitly " +
      "prohibits use “in software or tools (unless 100% a teaching aid only) or ... any carbon calculations” " +
      "outside teaching/learning the subject, which this tool's real carbon math would violate; and the DBT/ONS " +
      "“Construction Building Materials” bulletin — real, open (Crown copyright/OGL) data, but it publishes " +
      "price indices and production volumes, not per-assembly £/m² unit costs, so it's the wrong shape of " +
      "data for per-package costing. Until a properly-licensed UK cost/carbon source is wired in, the renovation " +
      "calculator shows flat SYNTHETIC placeholder £/m² and kg CO₂e/m² rates per refurbishment " +
      "tier — round, made-up numbers used only to test the pipeline end-to-end, not for real decisions.",
    accent: "#EF4444",
    iconD: IC.tabula,
    status: "placeholder",
    fields: ["tier", "cost_gbp_per_m2", "carbon_kgco2e_per_m2", "note"],
    sampleFn: async () => {
      const { UK_PLACEHOLDER_SAMPLE } = await import("../config/ukPlaceholderCostCarbon");
      return UK_PLACEHOLDER_SAMPLE;
    },
  },
];

function SourceCard({ source }: { source: Source }) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function togglePreview() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (rows || error) return;
    setLoading(true);
    try {
      const data = await source.sampleFn();
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{source.name}</span>
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              padding: "2px 7px",
              borderRadius: 99,
              background: `${STATUS_COLOR[source.status]}20`,
              border: `1px solid ${STATUS_COLOR[source.status]}50`,
              color: STATUS_COLOR[source.status],
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}>
              {STATUS_LABEL[source.status]}
            </span>
          </div>
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
          {loading && <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Loading...</div>}
          {!loading && error && (
            <div style={{ color: "#f87171", fontSize: 12 }}>
              {error} — is the backend running? (<code>uvicorn backend.main:app --port 8000</code>)
            </div>
          )}
          {!loading && !error && rows && rows.length === 0 && (
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>No rows returned.</div>
          )}
          {!loading && !error && rows && rows.length > 0 && (
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
                  {rows.slice(0, 8).map((row, rowIndex) => (
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

type CityInfo = { id: string; name: string; district: string; buildings: number; with_epc: number; estimated_from_ehs: number };

export default function UKDataExplorer() {
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [cities, setCities] = useState<CityInfo[] | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => setHealthOk(r.ok))
      .catch(() => setHealthOk(false));

    fetch("/api/uk/cities")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { cities: CityInfo[] }) => setCities(d.cities))
      .catch(() => setCities([]));
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
          Building footprints (OpenStreetMap) joined to Energy Performance Certificates, backstopped by English
          Housing Survey 2024-25 national distributions where no certificate matches.
        </p>
      </div>

      {cities && cities.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {cities.map((c) => (
            <div key={c.id} style={{
              flex: "1 1 180px",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(13,17,23,0.8)",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{c.name}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 8 }}>{c.district}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#4A90E2" }}>{c.buildings.toLocaleString()}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>buildings</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
                {c.with_epc.toLocaleString()} matched · {c.estimated_from_ehs.toLocaleString()} estimated
              </div>
            </div>
          ))}
        </div>
      )}

      {cities && cities.length === 0 && (
        <div style={{
          padding: "12px 16px", marginBottom: 20, borderRadius: 10,
          border: "1px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.08)",
          fontSize: 12, color: "#fbbf24",
        }}>
          No UK cities built yet. Run <code>python tools/uk/ingest_ehs.py</code> then{" "}
          <code>python tools/uk/uk_data_pipeline.py --city london</code>.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {UK_SOURCES.map((source) => (
          <SourceCard key={source.id} source={source} />
        ))}
      </div>

      {/* Optimization assumptions + equations + sources (defaults to UK) */}
      <OptimizationAssumptions defaultCountry="UK" />

      <div style={{ marginTop: 24, fontSize: 10, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
        Sources: OpenStreetMap (ODbL) · Energy Performance of Buildings Register, MHCLG (Open Government Licence v3.0) ·
        English Housing Survey 2024-25, MHCLG (Open Government Licence v3.0). EPC certificate lookups require a
        bearer token from{" "}
        <a
          href="https://get-energy-performance-data.communities.gov.uk"
          target="_blank"
          rel="noreferrer"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          get-energy-performance-data.communities.gov.uk
        </a>{" "}
        — until one is configured, bands are estimated from EHS distributions.
      </div>
    </div>
  );
}
