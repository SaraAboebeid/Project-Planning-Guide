/**
 * BoplatsRentalMap — Boplats rental listings on a map of Gothenburg, categorised
 * by either the building's energy class or its rent range.
 *
 * Boplats publishes an address but no coordinates, so /api/boplats/map joins each
 * listing to a building footprint by address and returns the building's own EPC
 * class alongside the rent. Listings whose address matches no footprint cannot be
 * placed; the coverage line reports them rather than quietly dropping them.
 *
 * One marker is one BUILDING (not one listing) — radius grows with how many
 * listings that address has, which is why a few markers are much larger.
 */

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";

export interface BoplatsPoint {
  address: string | null;
  lat: number;
  lon: number;
  listings: number;
  avg_rent_sek: number | null;
  min_rent_sek: number | null;
  max_rent_sek: number | null;
  avg_rent_per_m2_sek: number | null;
  avg_size_m2: number | null;
  rooms: number[];
  epc_class: string | null;
  energy_kwh_m2: number | null;
  year_built: number | null;
  primary_area: string | null;
}
interface BoplatsMapData {
  points: BoplatsPoint[];
  buildings_with_listings: number;
  matched_listings: number;
  total_listings: number;
  unmatched_listings: number;
  with_epc_class: number;
}

type Mode = "class" | "rent";

// Energy-class ramp A→G. The letters carry the meaning (legend chips and popups
// both name the class), so the colours order the scale rather than define it —
// green/red pairs are the weakest part of this ramp under colour-vision deficiency.
const CLASS_COLOR: Record<string, string> = {
  A: "#2FB477", B: "#5BBF63", C: "#93C948",
  D: "#E8C20C", E: "#E8880C", F: "#E2603B", G: "#E2483B",
};
const CLASS_ORDER = ["A", "B", "C", "D", "E", "F", "G"];
const NO_DATA = "rgba(255,255,255,0.28)";

/** Rent bins are quantiles of the data itself, so they stay meaningful as rents drift. */
function rentBins(points: BoplatsPoint[]): { max: number; color: string; label: string }[] {
  const vals = points.map(p => p.avg_rent_per_m2_sek).filter((v): v is number => v != null).sort((a, b) => a - b);
  if (!vals.length) return [];
  const q = (f: number) => vals[Math.min(vals.length - 1, Math.floor(vals.length * f))]!;
  const cuts = [q(0.2), q(0.4), q(0.6), q(0.8), vals[vals.length - 1]!];
  const colors = ["#4A90E2", "#4ECDC4", "#93C948", "#E8880C", "#E2483B"];
  let lo = vals[0]!;
  return cuts.map((max, i) => {
    const label = i === cuts.length - 1 ? `${Math.round(lo)}+` : `${Math.round(lo)}–${Math.round(max)}`;
    lo = max;
    return { max, color: colors[i]!, label };
  });
}

function FitToPoints({ points }: { points: BoplatsPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds: LatLngBoundsExpression = points.map(p => [p.lat, p.lon] as [number, number]);
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, points]);
  return null;
}

const chipBase: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 99,
  fontSize: 11, cursor: "pointer", userSelect: "none", transition: "opacity 0.15s",
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
};

export default function BoplatsRentalMap() {
  const [data, setData] = useState<BoplatsMapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("class");
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    fetch("/api/boplats/map")
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => { if (active) setData(d as BoplatsMapData); })
      .catch(() => { if (active) setError("Could not load the rental map — check the backend is running on :8000."); });
    return () => { active = false; };
  }, []);

  const bins = useMemo(() => rentBins(data?.points ?? []), [data]);

  // Category a point belongs to, in the active mode — also the legend chip's key.
  function categoryOf(p: BoplatsPoint): string {
    if (mode === "class") return p.epc_class ?? "no class";
    const v = p.avg_rent_per_m2_sek;
    if (v == null) return "no rent";
    return bins.find(b => v <= b.max)?.label ?? bins[bins.length - 1]?.label ?? "no rent";
  }
  function colorOf(cat: string): string {
    if (mode === "class") return CLASS_COLOR[cat] ?? NO_DATA;
    return bins.find(b => b.label === cat)?.color ?? NO_DATA;
  }

  const categories = useMemo(() => {
    const present = new Set((data?.points ?? []).map(categoryOf));
    const ordered = mode === "class"
      ? [...CLASS_ORDER, "no class"]
      : [...bins.map(b => b.label), "no rent"];
    return ordered.filter(c => present.has(c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, mode, bins]);

  // Switching mode retires the old mode's category names, so clear the filter too.
  useEffect(() => { setHidden(new Set()); }, [mode]);

  const shown = (data?.points ?? []).filter(p => !hidden.has(categoryOf(p)));
  const shownListings = shown.reduce((n, p) => n + p.listings, 0);

  if (error) {
    return <div style={{ padding: 16, fontSize: 12, color: "#E2483B" }}>{error}</div>;
  }
  if (!data) {
    return <div style={{ padding: 16, fontSize: 12, color: "rgba(255,255,255,0.40)" }}>Loading rental map…</div>;
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Mode toggle + coverage */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>Colour by</span>
        {([["class", "Energy class"], ["rent", "Rent (SEK/m²)"]] as [Mode, string][]).map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)} style={{
            padding: "4px 11px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer",
            background: mode === m ? "rgba(78,205,196,0.18)" : "rgba(255,255,255,0.06)",
            border: `1px solid ${mode === m ? "#4ECDC460" : "rgba(255,255,255,0.12)"}`,
            color: mode === m ? "#4ECDC4" : "rgba(255,255,255,0.70)",
          }}>{label}</button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.40)" }}>
          {shown.length.toLocaleString("sv-SE")} buildings · {shownListings.toLocaleString("sv-SE")} listings shown
        </span>
      </div>

      {/* Legend — click a category to hide/show it */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {categories.map(cat => {
          const off = hidden.has(cat);
          return (
            <span key={cat} onClick={() => setHidden(h => {
              const n = new Set(h);
              if (n.has(cat)) n.delete(cat); else n.add(cat);
              return n;
            })} style={{ ...chipBase, opacity: off ? 0.35 : 1 }}>
              <span style={{
                width: 10, height: 10, borderRadius: 3, flexShrink: 0,
                background: colorOf(cat), border: "1px solid rgba(0,0,0,0.35)",
              }} />
              <span style={{ color: "rgba(255,255,255,0.78)" }}>{cat}</span>
            </span>
          );
        })}
      </div>

      <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)" }}>
        <MapContainer
          center={[57.7089, 11.9746]}
          zoom={11}
          style={{ height: 420, width: "100%" }}
          scrollWheelZoom
        >
          {/* Same free OSM tiles as LocationMap — CARTO's basemaps need an API key. */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitToPoints points={data.points} />
          {shown.map((p, i) => {
            const cat = categoryOf(p);
            return (
              <CircleMarker
                key={`${p.lat},${p.lon},${i}`}
                center={[p.lat, p.lon]}
                radius={Math.min(16, 4 + Math.sqrt(p.listings) * 1.7)}
                // White hairline keeps overlapping markers separable on the light basemap.
                pathOptions={{
                  color: "#fff", fillColor: colorOf(cat),
                  fillOpacity: 0.85, weight: 1, opacity: 0.85,
                }}
              >
                <Popup>
                  <div style={{ fontSize: 12, lineHeight: 1.55, minWidth: 190 }}>
                    <strong>{p.address ?? "Address unknown"}</strong>
                    {p.primary_area && <div style={{ color: "#666" }}>{p.primary_area}</div>}
                    <div style={{ marginTop: 6 }}>
                      {p.listings} listing{p.listings === 1 ? "" : "s"}
                      {p.rooms.length > 0 && ` · ${p.rooms.join(", ")} room`}
                    </div>
                    {p.avg_rent_sek != null && (
                      <div>
                        {Math.round(p.avg_rent_sek).toLocaleString("sv-SE")} SEK/month avg
                        {p.min_rent_sek != null && p.max_rent_sek != null && p.min_rent_sek !== p.max_rent_sek &&
                          ` (${p.min_rent_sek.toLocaleString("sv-SE")}–${p.max_rent_sek.toLocaleString("sv-SE")})`}
                      </div>
                    )}
                    {p.avg_rent_per_m2_sek != null && <div>{p.avg_rent_per_m2_sek} SEK/m²·month</div>}
                    {p.avg_size_m2 != null && <div>{p.avg_size_m2} m² avg</div>}
                    <div style={{ marginTop: 6 }}>
                      Energy class <strong>{p.epc_class ?? "—"}</strong>
                      {p.energy_kwh_m2 != null && ` · ${p.energy_kwh_m2} kWh/m²·yr`}
                    </div>
                    {p.year_built != null && <div>Built {p.year_built}</div>}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      <p style={{ fontSize: 10.5, color: "rgba(255,255,255,0.38)", margin: "8px 0 0", lineHeight: 1.6 }}>
        One marker per building, sized by listing count. {data.matched_listings.toLocaleString("sv-SE")} of{" "}
        {data.total_listings.toLocaleString("sv-SE")} listings are placed on{" "}
        {data.buildings_with_listings.toLocaleString("sv-SE")} buildings; the remaining{" "}
        {data.unmatched_listings.toLocaleString("sv-SE")} have an address that matches no building footprint and are
        not shown. Energy class is the building's own certificate, not the individual flat's.
      </p>
    </div>
  );
}
