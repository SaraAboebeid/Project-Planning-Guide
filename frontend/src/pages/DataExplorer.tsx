import { useState, useEffect } from "react";
import { WIKELLS_CHAPTERS, wikellsStats } from "../config/wikellsData";

// ── Icon helper ──────────────────────────────────────────────────────────────
function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d={d} />
    </svg>
  );
}
const IC = {
  building:  "M12 3L2 12h3v8h6v-5h2v5h6v-8h3L12 3z",
  epc:       "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z",
  tabula:    "M3 3h18v4H3zm0 6h18v4H3zm0 6h18v4H3z",
  boplats:   "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  traffic:   "M17.8 6.4L16 4H8L6.2 6.4C5.5 7.2 5 8.1 5 9v11c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V9c0-.9-.5-1.8-1.2-2.6zM12 18c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm4-9H8V7h8v2z",
  wwr:       "M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14H3V5h9v12zm9 0h-7V5h7v12z",
  transit:   "M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20v1h12v-1l-1.5-1c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zm0 2c3.51 0 5.5.49 6.27 1H5.73C6.5 4.49 8.49 4 12 4zm-6.5 8h4v2h-4v-2zm9 4.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm-5 0c-.83 0-1.5-.67-1.5-1.5S8.67 15 9.5 15s1.5.67 1.5 1.5S10.33 16.5 9.5 16.5zm7-4h-4v-2h4v2z",
  download:  "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
  search:    "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
  copy:      "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z",
  chevron:   "M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
  close:     "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  refresh:   "M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z",
  filter:    "M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z",
  camera:    "M12 15.2c-1.77 0-3.2-1.43-3.2-3.2s1.43-3.2 3.2-3.2 3.2 1.43 3.2 3.2-1.43 3.2-3.2 3.2zM20 4h-3.17L15 2H9L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z",
  hammer:    "M13.78 6.22 11.22 3.66c-.39-.39-1.02-.39-1.41 0l-7.07 7.07c-.39.39-.39 1.02 0 1.41l2.56 2.56 2.12-2.12 1.41 1.41-9.19 9.19 1.41 1.41 9.19-9.19 1.41 1.41-2.12 2.12 2.56 2.56c.39.39 1.02.39 1.41 0l7.07-7.07c.39-.39.39-1.02 0-1.41l-2.56-2.56-2.12 2.12-1.41-1.41 2.12-2.12-1.41-1.41-2.12 2.12-1.41-1.41 2.12-2.12z",
};

// ── Types ───────────────────────────────────────────────────────────────────
interface DataSource {
  id: string;
  name: string;
  description: string;
  iconD: string;
  accent: string;
  count: string;
  countLabel: string;
  status: "live" | "cached" | "static";
  fields: string[];
  sampleFn: () => Promise<Record<string, unknown>[]>;
  renderPreview?: () => React.ReactNode;
}

// ── Data sources definition ──────────────────────────────────────────────────
const SOURCES: DataSource[] = [
  {
    id: "buildings",
    name: "3D Buildings (EUBUCCO)",
    description: "Gothenburg building footprints enriched with height, EPC energy class, construction year, use category and TABULA archetypes. 13,832 buildings have complete data across all fields.",
    iconD: IC.building,
    accent: "#4A90E2",
    count: "92,973",
    countLabel: "buildings total",
    status: "cached",
    fields: ["height", "floors", "year", "use_cat", "address", "eclass", "energy", "tabula_period", "footprint_m2", "has_epc"],
    sampleFn: async () => {
      // Fetch nearby and return only buildings with complete data
      const r = await fetch("/api/buildings/nearby?points=57.704348,11.955460&radius=600");
      const data = await r.json() as Record<string, unknown>[];
      const complete = data.filter(
        (b) => b.height != null && b.floors != null && b.year != null && b.has_epc
      );
      return complete.slice(0, 8).map((b) => ({
        address:       b.address,
        height:        b.height,
        floors:        b.floors,
        year:          b.year,
        use_cat:       b.use_cat,
        eclass:        b.eclass,
        energy:        b.energy,
        tabula_period: b.tabula_period,
        footprint_m2:  b.footprint_m2,
      }));
    },
  },
  {
    id: "eubucco",
    name: "Data Coverage Statistics",
    description: "Field-by-field coverage across all 92,973 Gothenburg buildings — showing what percentage of buildings have each attribute populated.",
    iconD: IC.tabula,
    accent: "#96D74C",
    count: "13,832",
    countLabel: "fully complete",
    status: "static",
    fields: ["field", "count", "coverage_%", "source"],
    sampleFn: async () => [
      { field: "height",        count: "92,973", "coverage_%": "100%", source: "EUBUCCO" },
      { field: "has_epc",       count: "84,349", "coverage_%": "91%",  source: "EPC Sweden" },
      { field: "address",       count: "68,361", "coverage_%": "74%",  source: "Lantmäteriet" },
      { field: "energy (kWh)",  count: "17,351", "coverage_%": "19%",  source: "EPC Sweden" },
      { field: "eclass (A–G)",  count: "17,352", "coverage_%": "19%",  source: "EPC Sweden" },
      { field: "year",          count: "17,346", "coverage_%": "19%",  source: "EPC Sweden" },
      { field: "tabula_period", count: "17,346", "coverage_%": "19%",  source: "TABULA" },
      { field: "floors",        count: "13,835", "coverage_%": "15%",  source: "EPC Sweden" },
      { field: "fully complete",count: "13,832", "coverage_%": "15%",  source: "all sources" },
    ],
  },
  {
    id: "epc",
    name: "EPC Register",
    description: "Swedish Energy Performance Certificates — baseline energy class, specific demand, construction era.",
    iconD: IC.epc,
    accent: "#96D74C",
    count: "84,349",
    countLabel: "matched",
    status: "static",
    fields: ["formular_id", "address", "energy_class", "specific_demand", "build_year", "building_type"],
    sampleFn: async () => {
      try {
        const r = await fetch("/api/epc/snapshot?lat=57.704348&lon=11.955460&radius_m=500");
        if (!r.ok) throw new Error();
        const data = await r.json();
        return (data as Record<string, unknown>[]).slice(0, 5);
      } catch {
        return [{ note: "EPC module requires local DuckDB — run backend to access" }];
      }
    },
  },
  {
    id: "tabula",
    name: "TABULA Archetypes",
    description: "Swedish residential building archetypes matched by type and construction era. Used as fallback for missing EPC data.",
    iconD: IC.tabula,
    accent: "#4ECDC4",
    count: "17,346",
    countLabel: "matched",
    status: "static",
    fields: ["archetype_id", "building_type", "year_range", "u_wall", "u_roof", "u_window", "heating_demand"],
    sampleFn: async () => {
      const r = await fetch("/api/tabula/match?building_type=MFH&build_year=1970");
      const data = await r.json();
      return [data as Record<string, unknown>];
    },
  },
  {
    id: "boplats",
    name: "Boplats Listings",
    description: "Live rental housing listings from Boplats Göteborg. Updated daily — addresses, rents, areas, and images.",
    iconD: IC.boplats,
    accent: "#721CB8",
    count: "297",
    countLabel: "active listings",
    status: "live",
    fields: ["address", "rent_sek", "area_m2", "rooms", "floor", "image_url", "last_seen"],
    sampleFn: async () => {
      const r = await fetch("/boplats_data.json");
      const data = await r.json() as Record<string, unknown[]>;
      const entries: Record<string, unknown>[] = [];
      for (const [addr, listings] of Object.entries(data)) {
        for (const l of listings as Record<string, unknown>[]) {
          entries.push({ address: addr, ...l });
          if (entries.length >= 5) break;
        }
        if (entries.length >= 5) break;
      }
      return entries;
    },
  },
  {
    id: "trafikverket",
    name: "Trafikverket Cameras",
    description: "Road condition and traffic flow cameras around Gothenburg from the Swedish Transport Administration API.",
    iconD: IC.camera,
    accent: "#F59E0B",
    count: "Live",
    countLabel: "camera feed",
    status: "live",
    fields: ["id", "name", "type", "description", "photo_url", "photo_time", "lat", "lon"],
    sampleFn: async () => {
      const r = await fetch("/trafikverket_data.json");
      const data = await r.json() as { cameras: Record<string, unknown>[] };
      return (data.cameras ?? []).slice(0, 5);
    },
  },
  {
    id: "vasttrafik",
    name: "Västtrafik",
    description: "Real-time bus, tram, ferry and commuter rail positions plus stop areas across Gothenburg. Live feed via Västtrafik Planera Resa v4 API.",
    iconD: IC.transit,
    accent: "#00B5E2",
    count: "Live",
    countLabel: "vehicle positions",
    status: "live",
    fields: ["gid", "name", "line", "transportMode", "lat", "lon", "bearing", "direction"],
    sampleFn: async () => {
      // Try live vehicle positions first
      try {
        const r = await fetch("/api/vasttrafik/positions");
        if (!r.ok) throw new Error();
        const data = await r.json() as { vehicles?: Record<string, unknown>[] };
        const vehicles = Array.isArray(data) ? data : (data.vehicles ?? []);
        if (vehicles.length > 0) return vehicles.slice(0, 5);
      } catch { /* fall through to stops */ }
      // Fall back to stop areas sample
      try {
        const r = await fetch("/api/vasttrafik/stops");
        if (!r.ok) throw new Error();
        const data = await r.json() as { stops: Record<string, unknown>[] };
        return (data.stops ?? []).slice(0, 5);
      } catch {
        return [{ note: "Västtrafik API requires credentials in backend — check VASTTRAFIK_CLIENT_ID / SECRET in .env" }];
      }
    },
  },
  {
    id: "wikells",
    name: "Wikells Sektionsfakta",
    description: "Swedish renovation material cost database — installed section costs in SEK/m² with fire class, U-values and sound ratings. Used directly in the Renovation Packages calculator.",
    iconD: IC.hammer,
    accent: "#F59E0B",
    count: String(wikellsStats().totalItems),
    countLabel: "line items",
    status: "live",
    fields: ["code", "description", "costSEK", "unit", "uValue", "fireClass", "soundRw", "weightKgM2"],
    sampleFn: async () => [], // not used — renderPreview takes over
    renderPreview: () => <WikellsPreview />,
  },
];


// ── Wikells category browser ─────────────────────────────────────────────────
function WikellsPreview() {
  const [openCh, setOpenCh] = useState<string | null>(null);
  const accent = "#F59E0B";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {WIKELLS_CHAPTERS.map((ch) => {
        const allItems = ch.subGroups.flatMap(sg => sg.items);
        const isOpen   = openCh === ch.id;
        const costs    = allItems.map(i => i.costSEK);
        const minC     = Math.min(...costs);
        const maxC     = Math.max(...costs);
        return (
          <div key={ch.id} style={{
            borderRadius: 10,
            border: `1px solid ${isOpen ? accent + "55" : "rgba(255,255,255,0.08)"}`,
            background: isOpen ? `${accent}08` : "rgba(255,255,255,0.02)",
            overflow: "hidden", transition: "all 0.18s",
          }}>
            {/* Chapter header */}
            <button
              onClick={() => setOpenCh(isOpen ? null : ch.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center",
                gap: 12, padding: "12px 14px", background: "transparent",
                border: 0, cursor: "pointer", textAlign: "left",
              }}
            >
              {/* Chapter badge */}
              <div style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: isOpen ? `${accent}22` : "rgba(255,255,255,0.06)",
                border: `1px solid ${isOpen ? accent + "50" : "rgba(255,255,255,0.10)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 800,
                color: isOpen ? accent : "rgba(255,255,255,0.40)",
              }}>{ch.chapter}</div>

              {/* Title */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: isOpen ? "#fff" : "rgba(255,255,255,0.75)" }}>
                  {ch.titleEN}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", marginTop: 2 }}>
                  {ch.subGroups.length} subgroup{ch.subGroups.length !== 1 ? "s" : ""} · {allItems.length} items
                </div>
              </div>

              {/* Cost range */}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: accent }}>
                  {minC.toLocaleString("sv-SE")}–{maxC.toLocaleString("sv-SE")}
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)" }}>SEK/m²</div>
              </div>

              {/* Chevron */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,0.35)"
                style={{ flexShrink: 0, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.18s" }}>
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
              </svg>
            </button>

            {/* Expanded detail: one sample card per subgroup */}
            {isOpen && (
              <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                {ch.subGroups.map((sg) => {
                  const s = sg.items[0];
                  if (!s) return null;
                  return (
                    <div key={sg.label} style={{
                      borderRadius: 8, overflow: "hidden",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}>
                      {/* Subgroup label bar */}
                      <div style={{
                        padding: "6px 12px",
                        background: `${accent}12`,
                        borderBottom: "1px solid rgba(255,255,255,0.07)",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: accent }}>{sg.label}</span>
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.30)" }}>{sg.items.length} items</span>
                      </div>
                      {/* Sample item fields */}
                      <div style={{
                        padding: "8px 12px",
                        background: "rgba(255,255,255,0.02)",
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                        gap: "6px 16px",
                      }}>
                        {([
                          { k: "Code",        v: s.code,          c: accent },
                          { k: "Description", v: s.description,   c: "rgba(255,255,255,0.80)" },
                          { k: "Cost",        v: `${s.costSEK.toLocaleString("sv-SE")} SEK/m²`, c: accent },
                          ...(s.uValue     != null ? [{ k: "U-value",   v: `${s.uValue} W/(m²·K)`, c: "#4A90E2" }] : []),
                          ...(s.fireClass         ? [{ k: "Fire class", v: s.fireClass,             c: "#96D74C" }] : []),
                          ...(s.soundRw    != null ? [{ k: "Sound Rw",  v: `${s.soundRw} dB`,       c: "#4ECDC4" }] : []),
                          ...(s.weightKgM2 != null ? [{ k: "Weight",    v: `${s.weightKgM2} kg/m²`, c: "rgba(255,255,255,0.50)" }] : []),
                        ] as { k: string; v: string; c: string }[]).map(({ k, v, c }) => (
                          <div key={k}>
                            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", marginBottom: 1 }}>{k}</div>
                            <div style={{ fontSize: 11, fontWeight: 600, color: c,
                                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: DataSource["status"] }) {
  const cfg = {
    live:   { label: "Live",   color: "#96D74C", bg: "rgba(150,215,76,0.12)"  },
    cached: { label: "Cached", color: "#4A90E2", bg: "rgba(74,144,226,0.12)" },
    static: { label: "Static", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  }[status];
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
      padding: "2px 7px", borderRadius: 99, color: cfg.color,
      background: cfg.bg, border: `1px solid ${cfg.color}40`,
    }}>
      {cfg.label}
    </span>
  );
}

// ── Address search row ────────────────────────────────────────────────────────
function AddressFilter({ onFilter }: { onFilter: (addr: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
      <div style={{ flex: 1, position: "relative" }}>
        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.35)", pointerEvents: "none" }}>
          <Icon d={IC.search} size={15} />
        </span>
        <input
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onFilter(val)}
          placeholder="Filter by address (e.g. Nymilsgatan 15)…"
          style={{
            width: "100%", padding: "9px 12px 9px 34px", borderRadius: 10,
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
            color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box",
          }}
        />
      </div>
      <button onClick={() => onFilter(val)} style={{
        padding: "9px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
        background: "rgba(114,28,184,0.35)", border: "1px solid rgba(114,28,184,0.5)",
        color: "#fff", cursor: "pointer",
      }}>
        Search
      </button>
      {val && (
        <button onClick={() => { setVal(""); onFilter(""); }} style={{
          padding: "9px 12px", borderRadius: 10, fontSize: 13,
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
          color: "rgba(255,255,255,0.6)", cursor: "pointer",
        }}>
          <Icon d={IC.close} size={14} />
        </button>
      )}
    </div>
  );
}

// ── Data source card ─────────────────────────────────────────────────────────
function SourceCard({
  source, addressFilter,
}: { source: DataSource; addressFilter: string }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [rows, setRows]         = useState<Record<string, unknown>[] | null>(null);
  const [copied, setCopied]     = useState(false);
  const [imgModal, setImgModal] = useState<string | null>(null);
  const [liveCount, setLiveCount] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadBoplatsCount() {
      if (source.id !== "boplats") return;
      try {
        const res = await fetch(`/boplats_data.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json() as Record<string, unknown[]>;
        const total = Object.values(data).reduce((sum, listings) => {
          return sum + (Array.isArray(listings) ? listings.length : 0);
        }, 0);

        if (active) setLiveCount(total.toLocaleString("en-US"));
      } catch {
        if (active) setLiveCount(null);
      }
    }

    loadBoplatsCount();
    return () => { active = false; };
  }, [source.id]);

  async function loadSample() {
    if (source.renderPreview) { setExpanded(e => !e); return; }
    if (rows) { setExpanded(e => !e); return; }
    setLoading(true);
    setExpanded(true);
    try {
      const data = await source.sampleFn();
      setRows(data);
    } catch {
      setRows([{ error: "Could not load sample — check backend is running on :8000" }]);
    } finally {
      setLoading(false);
    }
  }

  async function downloadSample() {
    if (source.id === "boplats") {
      try {
        const res = await fetch(`/boplats_data.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "boplats_data.json"; a.click();
        URL.revokeObjectURL(url);
        return;
      } catch {
        // Fall through to sample export if full dataset fetch fails.
      }
    }

    if (!rows) return;
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${source.id}_sample.json`; a.click();
    URL.revokeObjectURL(url);
  }

  function copyJSON() {
    if (!rows) return;
    navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  // For Boplats — filter rows by address string
  const displayRows = rows && addressFilter && source.id === "boplats"
    ? rows.filter(r => String(r.address ?? "").toLowerCase().includes(addressFilter.toLowerCase()))
    : rows;

  return (
    <>
      {/* Image modal */}
      {imgModal && (
        <div
          onClick={() => setImgModal(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <img src={imgModal} alt="preview" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: 12 }} />
        </div>
      )}

      <div style={{
        borderRadius: 14, overflow: "hidden",
        border: `1px solid ${expanded ? source.accent + "50" : "rgba(255,255,255,0.09)"}`,
        background: expanded ? `${source.accent}0a` : "rgba(13,17,40,0.80)",
        transition: "all 0.2s",
        boxShadow: expanded ? `0 4px 20px ${source.accent}20` : "none",
      }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px" }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10, flexShrink: 0,
            background: `${source.accent}20`, border: `1px solid ${source.accent}40`,
            display: "flex", alignItems: "center", justifyContent: "center", color: source.accent,
          }}>
            <Icon d={source.iconD} size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{source.name}</span>
              <StatusBadge status={source.status} />
            </div>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.50)", lineHeight: 1.5, margin: 0 }}>
              {source.description}
            </p>
          </div>
          {/* Count badge */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: source.accent, lineHeight: 1 }}>
              {liveCount ?? source.count}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.40)", marginTop: 2 }}>
              {source.countLabel}
            </div>
          </div>
          {/* Expand button */}
          <button onClick={loadSample} style={{
            flexShrink: 0, padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: expanded ? `${source.accent}25` : "rgba(255,255,255,0.07)",
            border: `1px solid ${expanded ? source.accent + "60" : "rgba(255,255,255,0.12)"}`,
            color: expanded ? source.accent : "rgba(255,255,255,0.75)", cursor: "pointer", transition: "all 0.15s",
          }}>
            {loading ? "Loading…" : expanded ? "Hide" : "Preview"}
          </button>
        </div>

        {/* Fields strip */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "0 18px 14px" }}>
          {source.fields.map(f => (
            <span key={f} style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 99,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.55)", fontFamily: "monospace",
            }}>
              {f}
            </span>
          ))}
        </div>

        {/* Sample data panel */}
        {expanded && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", padding: "14px 18px" }}>
            {/* Custom renderer (e.g. Wikells) */}
            {source.renderPreview ? (
              source.renderPreview()
            ) : (
              <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", flex: 1 }}>
                {loading ? "Fetching sample…" : `Showing ${(displayRows ?? []).length} record(s)`}
              </span>
              <button onClick={copyJSON} disabled={!rows} style={{
                display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
                borderRadius: 7, fontSize: 11, fontWeight: 500, cursor: "pointer",
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                color: copied ? "#96D74C" : "rgba(255,255,255,0.70)",
              }}>
                <Icon d={IC.copy} size={12} /> {copied ? "Copied!" : "Copy JSON"}
              </button>
              <button onClick={downloadSample} disabled={!rows} style={{
                display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
                borderRadius: 7, fontSize: 11, fontWeight: 500, cursor: "pointer",
                background: `${source.accent}20`, border: `1px solid ${source.accent}50`,
                color: source.accent,
              }}>
                <Icon d={IC.download} size={12} /> Download .json
              </button>
            </div>

            {/* Table */}
            {loading && (
              <div style={{ textAlign: "center", padding: "24px 0", color: "rgba(255,255,255,0.35)", fontSize: 13 }}>
                Loading…
              </div>
            )}
            {!loading && displayRows && displayRows.length === 0 && (
              <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
                No records match this filter.
              </div>
            )}
            {!loading && displayRows && displayRows.length > 0 && (() => {
              const cols = Object.keys(displayRows[0]!).slice(0, 8);
              return (
                <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                        {cols.map(c => (
                          <th key={c} style={{
                            padding: "8px 12px", textAlign: "left", fontWeight: 600,
                            color: "rgba(255,255,255,0.45)", whiteSpace: "nowrap",
                            borderBottom: "1px solid rgba(255,255,255,0.08)",
                            fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em",
                          }}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((row, ri) => (
                        <tr key={ri} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          {cols.map(c => {
                            const val = row[c];
                            const isImg = typeof val === "string" && (val.startsWith("http") && (val.includes(".jpg") || val.includes(".png") || val.includes("Images")));
                            return (
                              <td key={c} style={{ padding: "8px 12px", color: "rgba(255,255,255,0.82)", maxWidth: 200 }}>
                                {isImg ? (
                                  <div
                                    onClick={() => setImgModal(val)}
                                    style={{
                                      width: 48, height: 36, borderRadius: 6, overflow: "hidden",
                                      cursor: "pointer", border: `1px solid ${source.accent}40`,
                                    }}
                                  >
                                    <img src={val} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                  </div>
                                ) : (
                                  <span style={{
                                    display: "block", overflow: "hidden", textOverflow: "ellipsis",
                                    whiteSpace: "nowrap", maxWidth: 190,
                                    color: typeof val === "number" ? source.accent : "rgba(255,255,255,0.82)",
                                  }}>
                                    {val === null || val === undefined ? (
                                      <span style={{ color: "rgba(255,255,255,0.22)" }}>—</span>
                                    ) : typeof val === "object" ? (
                                      <span style={{ color: "rgba(255,255,255,0.40)", fontFamily: "monospace" }}>[…]</span>
                                    ) : String(val)}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
            </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DataExplorer() {
  const [addressFilter, setAddressFilter] = useState("");
  const [statusFilter, setStatusFilter]   = useState<"all" | "live" | "cached" | "static">("all");
  const [healthOk, setHealthOk]           = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then(r => r.ok ? setHealthOk(true) : setHealthOk(false))
      .catch(() => setHealthOk(false));
  }, []);

  const filtered = SOURCES.filter(s => statusFilter === "all" || s.status === statusFilter);

  return (
    <div style={{ padding: "0 0 40px 0", maxWidth: 920, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: 0 }}>Data Explorer</h1>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 99,
            background: healthOk ? "rgba(150,215,76,0.15)" : "rgba(255,255,255,0.08)",
            border: `1px solid ${healthOk ? "#96D74C50" : "rgba(255,255,255,0.12)"}`,
            color: healthOk ? "#96D74C" : "rgba(255,255,255,0.40)",
          }}>
            {healthOk === null ? "Checking…" : healthOk ? "● Backend online" : "○ Backend offline"}
          </span>
        </div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: 0 }}>
          Browse, preview and download samples from all Gothenburg datasets powering the Digital Twin.
        </p>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["all","live","cached","static"] as const).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)} style={{
            padding: "5px 14px", borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: "pointer",
            textTransform: "capitalize",
            background: statusFilter === f ? "rgba(114,28,184,0.35)" : "rgba(255,255,255,0.06)",
            border: `1px solid ${statusFilter === f ? "rgba(114,28,184,0.6)" : "rgba(255,255,255,0.10)"}`,
            color: statusFilter === f ? "#fff" : "rgba(255,255,255,0.55)",
          }}>{f === "all" ? `All (${SOURCES.length})` : f}</button>
        ))}
      </div>

      {/* Address search (only relevant for address-based sources) */}
      <AddressFilter onFilter={setAddressFilter} />

      {/* Source cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.map(s => (
          <SourceCard key={s.id} source={s} addressFilter={addressFilter} />
        ))}
      </div>
    </div>
  );
}
