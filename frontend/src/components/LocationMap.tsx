/**
 * LocationMap — interactive address picker with Leaflet map.
 *
 * Modes:
 *  - Building scale  : single address input + autocomplete + marker on map
 *  - Neighborhood / Portfolio, "addresses" mode : multiple address inputs + markers
 *  - Neighborhood / Portfolio, "bbox" mode      :
 *      1. Pan/zoom freely to find your area
 *      2. Click "Draw Area" → click-drag on map to create rectangle
 *      3. Drag the 8 corner/edge handles to resize precisely
 *      4. "Redraw" to start over, map returns to normal pan/zoom
 */

import { useState, useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Rectangle,
  Polygon,
  CircleMarker,
  GeoJSON,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import type { LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Search, Square, PenTool, X } from "lucide-react";
import { countryCodeFromName, mapCenterFor } from "../config/countryNav";

// ── Fix Leaflet default icon paths broken by Vite bundling ──────────────────
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// ── Municipality boundary (Gothenburg) — highlight + inside/outside test ─────
type Ring = [number, number][];                       // [lon, lat] pairs
interface BoundaryGeom { type: "Polygon" | "MultiPolygon"; coordinates: Ring[] | Ring[][]; }
interface BoundaryFeature { type: "Feature"; properties?: Record<string, unknown>; geometry: BoundaryGeom; }

function pointInRing(lat: number, lon: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0], yi = ring[i]![1];
    const xj = ring[j]![0], yj = ring[j]![1];
    const hit = (yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}
function pointInPoly(lat: number, lon: number, poly: Ring[]): boolean {
  if (!poly.length || !pointInRing(lat, lon, poly[0]!)) return false;
  for (let k = 1; k < poly.length; k++) if (pointInRing(lat, lon, poly[k]!)) return false; // in a hole
  return true;
}
/** Is (lat, lon) inside the boundary geometry (Polygon or MultiPolygon)? */
function pointInBoundary(lat: number, lon: number, geom: BoundaryGeom): boolean {
  if (geom.type === "Polygon") return pointInPoly(lat, lon, geom.coordinates as Ring[]);
  return (geom.coordinates as Ring[][]).some((poly) => pointInPoly(lat, lon, poly));
}

// ── Location modes (Building scale): the one clear choice a user makes ────────
type LocationMode = "addresses" | "area" | "bbox" | "polygon";
const LOCATION_MODES: {
  key: LocationMode;
  label: string;
  icon: typeof MapPin;
  desc: string;
}[] = [
  { key: "addresses", label: "Address", icon: MapPin,
    desc: "Pin one or more specific buildings by address." },
  { key: "bbox", label: "Draw box", icon: Square,
    desc: "Drag a rectangle on the map to grab everything inside it." },
  { key: "polygon", label: "Draw shape", icon: PenTool,
    desc: "Click points on the map to outline any shape around your area." },
];

// ── Types ────────────────────────────────────────────────────────────────────

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  /** [south, north, west, east] as strings — Nominatim returns this for every
      result. For a street or a suburb it covers the whole feature, which is what
      "select every building on this street / in this area" is built on. */
  boundingbox?: string[];
  type?: string;
  class?: string;
  addresstype?: string;
}

interface GeoPoint {
  address: string;
  lat: number;
  lon: number;
  label: string;
}

interface BboxCoords {
  north: number;
  south: number;
  east: number;
  west: number;
}

const MIN_BBOX_SPAN = 0.0004;

function normalizeBbox(box: BboxCoords): BboxCoords {
  let north = Math.max(box.north, box.south);
  let south = Math.min(box.north, box.south);
  let east = Math.max(box.east, box.west);
  let west = Math.min(box.east, box.west);

  if (north - south < MIN_BBOX_SPAN) {
    const mid = (north + south) / 2;
    north = mid + MIN_BBOX_SPAN / 2;
    south = mid - MIN_BBOX_SPAN / 2;
  }
  if (east - west < MIN_BBOX_SPAN) {
    const mid = (east + west) / 2;
    east = mid + MIN_BBOX_SPAN / 2;
    west = mid - MIN_BBOX_SPAN / 2;
  }

  return { north, south, east, west };
}

const _bboxCornerIcon = L.divIcon({
  className: "",
  html: '<div style="width:12px;height:12px;border-radius:9999px;background:#721CB8;border:2px solid #fff;box-shadow:0 1px 6px rgba(15,23,42,0.35)"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const _bboxEdgeIcon = L.divIcon({
  className: "",
  html: '<div style="width:10px;height:10px;border-radius:9999px;background:#995BD5;border:2px solid #fff;box-shadow:0 1px 6px rgba(15,23,42,0.30)"></div>',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

const _bboxCenterIcon = L.divIcon({
  className: "",
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:#14b8a6;border:2px solid #fff;box-shadow:0 1px 6px rgba(15,23,42,0.35)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// ── Nominatim autocomplete hook ──────────────────────────────────────────────


function useNominatim(query: string, countryCode = "se") {
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  // Distinguish "searched, nothing matched" from "the search call failed"
  // (Nominatim rate-limits at 1 req/s and returns 429/503) so the UI can say
  // which — silently swallowing the error is what made search look "broken".
  const [error, setError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      setError(false);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          query
        )}&countrycodes=${countryCode}&format=json&limit=5&addressdetails=1`;
        const res = await fetch(url, {
          headers: { "Accept-Language": "en" },
        });
        if (!res.ok) throw new Error(`Nominatim ${res.status}`);
        const data = await res.json();
        setResults(data as NominatimResult[]);
      } catch {
        setResults([]);
        setError(true);
      } finally {
        setLoading(false);
      }
    }, 500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, countryCode]);

  return { results, loading, error };
}

// ── Map: auto-fit to markers / bbox ──────────────────────────────────────────

function MapFitBounds({
  points,
  bbox,
}: {
  points: GeoPoint[];
  bbox: BboxCoords | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (bbox) {
      map.fitBounds(
        [
          [bbox.south, bbox.west],
          [bbox.north, bbox.east],
        ],
        { padding: [20, 20] }
      );
    } else if (points.length === 1 && points[0]) {
      map.setView([points[0].lat, points[0].lon], 15);
    } else if (points.length > 1) {
      const bounds = L.latLngBounds(
        points.map((p) => [p.lat, p.lon] as LatLngTuple)
      );
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [points, bbox, map]);
  return null;
}

// Fit the view to the municipality boundary (once it loads, before any address
// is picked) so the highlighted area is visible on first render.
function FitToBoundary({ boundary }: { boundary: BoundaryFeature }) {
  const map = useMap();
  useEffect(() => {
    try {
      const b = L.geoJSON(boundary as never).getBounds();
      if (b.isValid()) map.fitBounds(b, { padding: [16, 16] });
    } catch { /* ignore */ }
  }, [boundary, map]);
  return null;
}

// ── Map: click-and-drag bounding box drawing ────────────────────────────────

function BboxDragHandler({
  onDraw,
}: {
  onDraw: (preview: BboxCoords | null, done: boolean) => void;
}) {
  const map = useMap();
  const drawing = useRef(false);
  const startLatLng = useRef<L.LatLng | null>(null);

  useMapEvents({
    mousedown(e) {
      drawing.current = true;
      startLatLng.current = e.latlng;
      map.dragging.disable();
      map.getContainer().style.cursor = "crosshair";
      onDraw(null, false);
    },
    mousemove(e) {
      if (!drawing.current || !startLatLng.current) return;
      const s = startLatLng.current;
      const c = e.latlng;
      onDraw(
        {
          north: Math.max(s.lat, c.lat),
          south: Math.min(s.lat, c.lat),
          east: Math.max(s.lng, c.lng),
          west: Math.min(s.lng, c.lng),
        },
        false
      );
    },
    mouseup(e) {
      if (!drawing.current || !startLatLng.current) return;
      drawing.current = false;
      map.dragging.enable();
      map.getContainer().style.cursor = "";
      const s = startLatLng.current;
      const c = e.latlng;
      // Ignore trivial drags (just a click with no movement)
      if (Math.abs(s.lat - c.lat) < 0.0001 && Math.abs(s.lng - c.lng) < 0.0001) {
        onDraw(null, true);
        return;
      }
      onDraw(
        {
          north: Math.max(s.lat, c.lat),
          south: Math.min(s.lat, c.lat),
          east: Math.max(s.lng, c.lng),
          west: Math.min(s.lng, c.lng),
        },
        true
      );
      startLatLng.current = null;
    },
  });
  return null;
}

function BboxEditHandles({
  bbox,
  onPreview,
  onCommit,
}: {
  bbox: BboxCoords;
  onPreview: (bbox: BboxCoords) => void;
  onCommit: (bbox: BboxCoords) => void;
}) {
  const centerLat = (bbox.north + bbox.south) / 2;
  const centerLng = (bbox.east + bbox.west) / 2;

  const handles: Array<{
    key: string;
    lat: number;
    lng: number;
    icon: L.DivIcon;
    move: (lat: number, lng: number) => BboxCoords;
  }> = [
    { key: "nw", lat: bbox.north, lng: bbox.west, icon: _bboxCornerIcon, move: (lat, lng) => ({ ...bbox, north: lat, west: lng }) },
    { key: "n", lat: bbox.north, lng: centerLng, icon: _bboxEdgeIcon, move: (lat) => ({ ...bbox, north: lat }) },
    { key: "ne", lat: bbox.north, lng: bbox.east, icon: _bboxCornerIcon, move: (lat, lng) => ({ ...bbox, north: lat, east: lng }) },
    { key: "e", lat: centerLat, lng: bbox.east, icon: _bboxEdgeIcon, move: (_lat, lng) => ({ ...bbox, east: lng }) },
    { key: "se", lat: bbox.south, lng: bbox.east, icon: _bboxCornerIcon, move: (lat, lng) => ({ ...bbox, south: lat, east: lng }) },
    { key: "s", lat: bbox.south, lng: centerLng, icon: _bboxEdgeIcon, move: (lat) => ({ ...bbox, south: lat }) },
    { key: "sw", lat: bbox.south, lng: bbox.west, icon: _bboxCornerIcon, move: (lat, lng) => ({ ...bbox, south: lat, west: lng }) },
    { key: "w", lat: centerLat, lng: bbox.west, icon: _bboxEdgeIcon, move: (_lat, lng) => ({ ...bbox, west: lng }) },
  ];

  const previewHandlers = (move: (lat: number, lng: number) => BboxCoords) => ({
    drag: (e: L.LeafletEvent) => {
      const marker = e.target as L.Marker;
      onPreview(normalizeBbox(move(marker.getLatLng().lat, marker.getLatLng().lng)));
    },
    dragend: (e: L.LeafletEvent) => {
      const marker = e.target as L.Marker;
      onCommit(normalizeBbox(move(marker.getLatLng().lat, marker.getLatLng().lng)));
    },
  });

  return (
    <>
      {handles.map((h) => (
        <Marker
          key={h.key}
          position={[h.lat, h.lng]}
          icon={h.icon}
          draggable
          eventHandlers={previewHandlers(h.move)}
        />
      ))}
      <Marker
        position={[centerLat, centerLng]}
        icon={_bboxCenterIcon}
        draggable
        eventHandlers={{
          drag: (e: L.LeafletEvent) => {
            const marker = e.target as L.Marker;
            const { lat, lng } = marker.getLatLng();
            const halfH = (bbox.north - bbox.south) / 2;
            const halfW = (bbox.east - bbox.west) / 2;
            onPreview({ north: lat + halfH, south: lat - halfH, east: lng + halfW, west: lng - halfW });
          },
          dragend: (e: L.LeafletEvent) => {
            const marker = e.target as L.Marker;
            const { lat, lng } = marker.getLatLng();
            const halfH = (bbox.north - bbox.south) / 2;
            const halfW = (bbox.east - bbox.west) / 2;
            onCommit({ north: lat + halfH, south: lat - halfH, east: lng + halfW, west: lng - halfW });
          },
        }}
      />
    </>
  );
}

// ── Polygon (any-shape) draw handler: click to add each vertex ──────────────
function PolygonClickHandler({
  onAddVertex,
}: {
  onAddVertex: (lat: number, lng: number) => void;
}) {
  const map = useMap();
  useEffect(() => {
    map.getContainer().style.cursor = "crosshair";
    return () => { map.getContainer().style.cursor = ""; };
  }, [map]);
  useMapEvents({
    click(e) { onAddVertex(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

// ── Address input with dropdown autocomplete ─────────────────────────────────

function AddressInput({
  value,
  onChange,
  onGeocode,
  onSelectResult,
  placeholder,
  countryCode = "se",
}: {
  value: string;
  onChange: (v: string) => void;
  onGeocode: (lat: number, lon: number, label: string) => void;
  /** Receives the whole Nominatim hit (incl. boundingbox) — used by area mode. */
  onSelectResult?: (r: NominatimResult) => void;
  placeholder?: string;
  countryCode?: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const { results, loading, error } = useNominatim(query, countryCode);
  const containerRef = useRef<HTMLDivElement>(null);
  const trimmed = query.trim();

  // Sync external value changes (e.g. when parent resets)
  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  function handleSelect(r: NominatimResult) {
    setQuery(r.display_name);
    onChange(r.display_name);
    onGeocode(parseFloat(r.lat), parseFloat(r.lon), r.display_name);
    onSelectResult?.(r);
    setOpen(false);
  }

  // A message row shows under the input for every non-result state, so the
  // search never just silently does nothing (which read as "broken").
  const showPanel = open && trimmed.length >= 3;
  const hasResults = results.length > 0;

  return (
    <div ref={containerRef} className="relative flex-1">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            // Enter picks the top hit — so the search feels like a search box,
            // not only a hover-and-click dropdown.
            if (e.key === "Enter" && hasResults) {
              e.preventDefault();
              handleSelect(results[0]!);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={placeholder ?? "Type an address in Sweden…"}
          autoComplete="off"
          className="w-full rounded-lg border border-white/15 bg-white/5 text-white placeholder:text-white/40 pl-9 pr-9 py-2 text-sm focus:ring-2 focus:ring-teal focus:border-teal"
        />
        {loading ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-gray-300 border-t-teal animate-spin pointer-events-none" />
        ) : query ? (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); setQuery(""); onChange(""); setOpen(false); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            title="Clear"
          >
            <X size={15} />
          </button>
        ) : null}
      </div>

      {showPanel && (hasResults || error || (!loading && trimmed.length >= 3)) && (
        <div
          className="absolute z-[10000] w-full mt-1 rounded-lg text-sm overflow-hidden"
          style={{
            backgroundColor: "#fff",
            border: "1px solid #e5e7eb",
            boxShadow: "0 12px 32px rgba(15,23,42,0.18)",
          }}
        >
          {hasResults ? (
            <ul className="max-h-56 overflow-auto">
              {results.map((r, i) => (
                <li
                  key={r.place_id}
                  onMouseDown={() => handleSelect(r)}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  className="flex items-start gap-2 px-3 py-2 cursor-pointer leading-snug"
                  style={{
                    color: hovered === i ? "#111827" : "#374151",
                    background: hovered === i ? "rgba(114,28,184,0.08)" : "transparent",
                    borderBottom: i < results.length - 1 ? "1px solid #f1f5f9" : "none",
                  }}
                >
                  <MapPin size={14} className="mt-0.5 flex-shrink-0" style={{ color: "#721CB8" }} />
                  <span>{r.display_name}</span>
                </li>
              ))}
            </ul>
          ) : error ? (
            <div className="px-3 py-2.5 text-xs" style={{ color: "#b45309", background: "#fffbeb" }}>
              Search is temporarily unavailable (rate-limited). Wait a moment and try again.
            </div>
          ) : loading ? null : (
            <div className="px-3 py-2.5 text-xs" style={{ color: "#6b7280" }}>
              No matches for “{trimmed}”. Try a street or area name, or add the city.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface LocationMapProps {
  scale: string | null;
  /** Country name as stored in project.country (e.g. "Sweden"/"United Kingdom") - determines
   * which country's addresses Nominatim searches and where the map centers by default. */
  country?: string | null;
  /** City name as stored in project.city (e.g. "Gothenburg"/"London") - narrows the default
   * map center further than country alone; falls back to the country's overview center. */
  city?: string | null;
  onAddressChange: (addressString: string) => void;
  onPointsChange?: (points: { lat: number; lon: number; label: string }[]) => void;
  onBboxChange?: (bbox: { north: number; south: number; east: number; west: number } | null) => void;
  /** Fires when a free-form polygon is drawn/cleared. `polygon` is "lon,lat;…"
   *  and `bbox` is the polygon's bounding box (so downstream stays bbox-driven). */
  onPolygonChange?: (
    polygon: string | null,
    bbox: { north: number; south: number; east: number; west: number } | null,
  ) => void;
  /** Fires when the selected location's validity changes (e.g. an address falls
   *  outside the Gothenburg municipality). `valid=false` should block Continue. */
  onLocationValidityChange?: (valid: boolean, message: string | null) => void;
}

export default function LocationMap({
  scale,
  country,
  city,
  onAddressChange,
  onPointsChange,
  onBboxChange,
  onPolygonChange,
  onLocationValidityChange,
}: LocationMapProps) {
  const isBuilding = scale === "Building";
  const countryCode = countryCodeFromName(country);
  const mapCenter = mapCenterFor(countryCode, city);
  // Boundary highlight + address validation only apply to Gothenburg (SE).
  const isGothenburg = countryCode === "se" && (city ?? "").toLowerCase().includes("gothenburg");
  const [boundary, setBoundary] = useState<BoundaryFeature | null>(null);

  const [locationMode, setLocationMode] = useState<"addresses" | "area" | "bbox" | "polygon">(
    "addresses"
  );
  // Street/area search: the label of the feature whose bounds are selected.
  const [areaLabel, setAreaLabel] = useState<string | null>(null);
  const [addressInputs, setAddressInputs] = useState<string[]>([""]);
  const [geoPoints, setGeoPoints] = useState<(GeoPoint | null)[]>([null]);

  const [bbox, setBbox] = useState<BboxCoords | null>(null);
  const [bboxPreview, setBboxPreview] = useState<BboxCoords | null>(null);
  const [bboxDone, setBboxDone] = useState(false);
  const [bboxRedrawMode, setBboxRedrawMode] = useState(false);

  // Free-form polygon vertices ([lat, lng] for Leaflet); done = closed & applied
  const [polyVerts, setPolyVerts] = useState<LatLngTuple[]>([]);
  const [polyDone, setPolyDone] = useState(false);

  function switchLocationMode(next: LocationMode) {
    if (next === locationMode) return;
    setLocationMode(next);

    // Keep whichever mode the user chose as the only active location source.
    if (next === "bbox") {
      setAreaLabel(null);
      setPolyVerts([]);
      setPolyDone(false);
      onPolygonChange?.(null, null);
      setBbox(null);
      setBboxPreview(null);
      setBboxDone(false);
      setBboxRedrawMode(false);
      onBboxChange?.(null);
      onAddressChange("");
      onPointsChange?.([]);
    }

    if (next === "polygon") {
      setAreaLabel(null);
      setBbox(null);
      setBboxPreview(null);
      setBboxDone(false);
      setBboxRedrawMode(false);
      onBboxChange?.(null);
      onAddressChange("");
      onPointsChange?.([]);
    }
  }

  // Reset when scale changes
  useEffect(() => {
    setLocationMode("addresses");
    setAddressInputs([""]);
    setGeoPoints([null]);
    setBbox(null);
    setBboxPreview(null);
    setBboxDone(false);
    setBboxRedrawMode(false);
    setPolyVerts([]);
    setPolyDone(false);
    setAreaLabel(null);
    onAddressChange("");
    onBboxChange?.(null);
    onPolygonChange?.(null, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  // Fetch the Gothenburg municipality boundary once (for the map highlight +
  // the "inside the area?" check). Other cities: no boundary, no restriction.
  useEffect(() => {
    if (!isGothenburg) { setBoundary(null); return; }
    let alive = true;
    fetch("/api/se/gothenburg-boundary")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (alive && b?.geometry) setBoundary(b as BoundaryFeature); })
      .catch(() => { /* boundary optional — no restriction if it fails */ });
    return () => { alive = false; };
  }, [isGothenburg]);

  // Re-check that the selection is inside the municipality — covering ALL modes:
  // typed addresses, a drawn/searched bbox, and a drawn polygon. Report validity
  // up so Continue can gate. (Addresses are tested per-point; a bbox by its centre;
  // a polygon by its centroid.)
  useEffect(() => {
    if (!isGothenburg || !boundary) { onLocationValidityChange?.(true, null); return; }
    const geom = boundary.geometry;
    const addrPts = geoPoints.filter((p): p is GeoPoint => !!p && typeof p.lat === "number");
    const tests: { lat: number; lon: number; kind: "address" | "area" }[] =
      addrPts.map((p) => ({ lat: p.lat, lon: p.lon, kind: "address" as const }));
    if (bbox) tests.push({ lat: (bbox.north + bbox.south) / 2, lon: (bbox.east + bbox.west) / 2, kind: "area" });
    if (polyDone && polyVerts.length >= 3) {
      tests.push({
        lat: polyVerts.reduce((s, v) => s + v[0], 0) / polyVerts.length,
        lon: polyVerts.reduce((s, v) => s + v[1], 0) / polyVerts.length,
        kind: "area",
      });
    }
    if (tests.length === 0) { onLocationValidityChange?.(true, null); return; }
    const outside = tests.filter((t) => !pointInBoundary(t.lat, t.lon, geom));
    if (outside.length > 0) {
      const anyArea = outside.some((o) => o.kind === "area");
      const msg = anyArea
        ? "The selected area is outside the Gothenburg municipality."
        : addrPts.length > 1
          ? `${outside.length} of ${addrPts.length} addresses are outside the Gothenburg municipality.`
          : "This address is outside the Gothenburg municipality.";
      onLocationValidityChange?.(false, msg);
    } else {
      onLocationValidityChange?.(true, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoPoints, bbox, polyVerts, polyDone, boundary, isGothenburg]);

  /* Street / area search → select every building inside the feature's bounds.
     Nominatim returns a boundingbox for each hit: for "Jättestensgatan" that is
     the whole street, for a suburb the whole suburb. Feeding it through the same
     bbox path the draw tools use means Step 2 loads every building inside it,
     instead of a single pin. */
  function selectAreaFromResult(r: NominatimResult) {
    const bb = r.boundingbox;
    if (!bb || bb.length < 4) return;
    const south = parseFloat(bb[0]!), north = parseFloat(bb[1]!);
    const west  = parseFloat(bb[2]!), east  = parseFloat(bb[3]!);
    if (![south, north, west, east].every(Number.isFinite)) return;

    // A house-number hit collapses to a point; pad it to a small block so the
    // selection is still an area rather than one building.
    const MIN_SPAN = 0.0008; // ~90 m
    const latPad = Math.max(0, (MIN_SPAN - (north - south)) / 2);
    const lonPad = Math.max(0, (MIN_SPAN - (east - west)) / 2);
    const box: BboxCoords = {
      north: north + latPad, south: south - latPad,
      east:  east  + lonPad, west:  west  - lonPad,
    };

    setBbox(box);
    setBboxPreview(null);
    setBboxDone(true);
    setBboxRedrawMode(false);
    setAreaLabel(r.display_name.split(",").slice(0, 2).join(",").trim());
    onBboxChange?.(box);
    onPolygonChange?.(null, null);
  }

  // ── Polygon handlers ───────────────────────────────────────────────────────
  function addPolyVertex(lat: number, lng: number) {
    if (polyDone) return;
    setPolyVerts((prev) => [...prev, [lat, lng] as LatLngTuple]);
  }
  function clearPolygon() {
    setPolyVerts([]);
    setPolyDone(false);
    onPolygonChange?.(null, null);
    onBboxChange?.(null);
    onAddressChange("");
    onPointsChange?.([]);
  }
  function finishPolygon() {
    if (polyVerts.length < 3) return;
    setPolyDone(true);
    const lats = polyVerts.map((v) => v[0]);
    const lngs = polyVerts.map((v) => v[1]);
    const box = {
      north: Math.max(...lats), south: Math.min(...lats),
      east: Math.max(...lngs), west: Math.min(...lngs),
    };
    // Encode as "lon,lat;lon,lat;…" for the backend point-in-polygon filter.
    const encoded = polyVerts.map((v) => `${v[1].toFixed(6)},${v[0].toFixed(6)}`).join(";");
    onAddressChange(`SHAPE: ${polyVerts.length} points`);
    onPointsChange?.([]);
    onPolygonChange?.(encoded, box);
  }

  // ── Address handlers ─────────────────────────────────────────────────────

  function updateGeoPoint(index: number, lat: number, lon: number, label: string) {
    setGeoPoints((prev) => {
      const next = [...prev];
      next[index] = { address: addressInputs[index] ?? "", lat, lon, label };
      const valid = next.filter((p): p is GeoPoint => p !== null && !!p.lat);
      onPointsChange?.(valid.map((p) => ({ lat: p.lat, lon: p.lon, label: p.label })));
      return next;
    });
  }

  function removeAddress(index: number) {
    const nextInputs = addressInputs.filter((_, j) => j !== index);
    const nextPoints = geoPoints.filter((_, j) => j !== index);
    const updatedInputs = nextInputs.length ? nextInputs : [""];
    const updatedPoints = nextPoints.length ? nextPoints : [null];
    setAddressInputs(updatedInputs);
    setGeoPoints(updatedPoints);
    onAddressChange(updatedInputs.filter(Boolean).join("; "));
    const valid = updatedPoints.filter((p): p is GeoPoint => p !== null && !!p.lat);
    onPointsChange?.(valid.map((p) => ({ lat: p.lat, lon: p.lon, label: p.label })));
  }

  // ── Bbox drag handler ────────────────────────────────────────────────────

  function handleBboxDraw(preview: BboxCoords | null, done: boolean) {
    setBboxPreview(preview);
    if (done) {
      setBboxDone(true);
      if (preview) {
        const next = normalizeBbox(preview);
        setBbox(next);
        setBboxRedrawMode(false);
        onAddressChange(
          `BBOX: N${next.north.toFixed(4)} S${next.south.toFixed(4)} E${next.east.toFixed(4)} W${next.west.toFixed(4)}`
        );
        // Notify parent with the raw bbox so it can query ALL buildings inside it;
        // clear any single-building points so the two modes don't conflict.
        onBboxChange?.(next);
        onPointsChange?.([]);
      } else {
        // trivial drag — keep existing box
      }
    } else {
      setBboxDone(false);
    }
  }

  function commitBboxEdit(next: BboxCoords) {
    const box = normalizeBbox(next);
    setBbox(box);
    setBboxPreview(null);
    setBboxDone(true);
    setBboxRedrawMode(false);
    onAddressChange(`BBOX: N${box.north.toFixed(4)} S${box.south.toFixed(4)} E${box.east.toFixed(4)} W${box.west.toFixed(4)}`);
    onBboxChange?.(box);
    onPointsChange?.([]);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const validPoints = geoPoints.filter((p): p is GeoPoint => p !== null && !!p.lat);
  // Show preview while dragging, finalized box after
  const displayBbox = bboxDone ? bbox : bboxPreview;
  const bboxBounds: [[number, number], [number, number]] | null = displayBbox
    ? [
        [displayBbox.south, displayBbox.west],
        [displayBbox.north, displayBbox.east],
      ]
    : null;

  // Default map center: the project's own country/city (falls back to a
  // Sweden overview if neither is set - see mapCenterFor).
  const defaultCenter: LatLngTuple = [mapCenter.lat, mapCenter.lon];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3 mt-2">
      {/* Mode picker — one clear choice: search by address, search a whole
          street/area, or draw a box / any shape. A segmented control (not four
          loose buttons) + a one-line description of the active mode. */}
      {isBuilding && (
        <div>
          <div className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-gray-100 border border-gray-200">
            {LOCATION_MODES.map((m) => {
              const active = locationMode === m.key;
              const Icon = m.icon;
              return (
                <button
                  key={m.key}
                  onClick={() => switchLocationMode(m.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    active
                      ? "bg-white text-navy shadow-sm border border-gray-200"
                      : "text-gray-500 hover:text-gray-800 border border-transparent"
                  }`}
                >
                  <Icon size={15} className={active ? "text-purple-600" : ""} />
                  {m.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            {LOCATION_MODES.find((m) => m.key === locationMode)?.desc}
          </p>
        </div>
      )}

      {/* Street / area search — one search box that selects a whole feature */}
      {isBuilding && locationMode === "area" && (
        <div className="space-y-2">
          <AddressInput
            value=""
            onChange={() => {}}
            onGeocode={() => {}}
            onSelectResult={selectAreaFromResult}
            countryCode={countryCode}
            placeholder="Search a street or area, e.g. Jättestensgatan or Lindholmen…"
          />
          {areaLabel ? (
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 flex items-center gap-3 flex-wrap">
              <span>
                ✓ <strong>{areaLabel}</strong> — every building inside its bounds is selected.
              </span>
              <button
                onClick={() => {
                  setAreaLabel(null); setBbox(null); setBboxDone(false); onBboxChange?.(null);
                }}
                className="ml-auto px-2.5 py-1 rounded-md border border-white/15 text-white/70 text-xs font-medium hover:border-white/30"
              >
                Clear
              </button>
            </div>
          ) : (
            <p className="text-xs text-white/50">
              Picks the whole street or area, not a single building. Fine-tune afterwards by
              unticking buildings in Step 2.
            </p>
          )}
        </div>
      )}

      {/* Address inputs — the default for every scale; at Building(s) they hide
          when the user switches to a draw mode. */}
      {scale !== "Neighborhood" && scale !== "Portfolio" && (!isBuilding || locationMode === "addresses") && (
        <div className="space-y-2">
          {addressInputs.map((addr, i) => (
            <div key={i} className="flex gap-2 items-start">
              <AddressInput
                value={addr}
                onChange={(v) => {
                  const next = [...addressInputs];
                  next[i] = v;
                  setAddressInputs(next);
                  onAddressChange(next.filter(Boolean).join("; "));
                }}
                onGeocode={(lat, lon, label) =>
                  updateGeoPoint(i, lat, lon, label)
                }
                countryCode={countryCode}
                placeholder={
                  isBuilding
                    ? `Address ${i + 1} in ${country ?? "Sweden"} — type to search`
                    : `Address ${i + 1} — type to search`
                }
              />
              {addressInputs.length > 1 && (
                <button
                  onClick={() => removeAddress(i)}
                  className="mt-0.5 px-2.5 py-2 rounded-lg border border-white/15 text-white/50 hover:text-red-400 hover:border-red-400/50 text-sm"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {/* Both Building(s) and area scales can list several buildings. */}
          <button
            onClick={() => {
              setAddressInputs([...addressInputs, ""]);
              setGeoPoints([...geoPoints, null]);
            }}
            className="text-sm text-teal hover:underline"
          >
            + Add another building
          </button>
        </div>
      )}

      {/* Bbox draw instructions */}
      {isBuilding && locationMode === "bbox" && (
        <div className="flex items-center gap-2 text-xs text-white/80 bg-[#721CB8]/15 border border-[#721CB8]/35 rounded-lg px-3 py-2">
          <span>🖱️</span>
          <span>
            {bboxDone
              ? "Area drawn. Drag handles to resize, drag the center to move, or click Redraw to draw a new box."
              : "Click and drag on the map to draw your area."}
          </span>
          {bboxDone && (
            <>
              <button
                onClick={() => {
                  setBbox(null);
                  setBboxPreview(null);
                  setBboxDone(false);
                  setBboxRedrawMode(true);
                  onBboxChange?.(null);
                  onAddressChange("");
                }}
                className="ml-auto text-xs text-teal hover:underline whitespace-nowrap"
              >
                Redraw
              </button>
              <button
                onClick={() => {
                  setBbox(null);
                  setBboxPreview(null);
                  setBboxDone(false);
                  setBboxRedrawMode(false);
                  onBboxChange?.(null);
                  onAddressChange("");
                }}
                className="text-xs text-white/70 hover:underline whitespace-nowrap"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}

      {/* Bbox coordinates summary — only when finalized */}
      {isBuilding && locationMode === "bbox" && bboxDone && bbox && (
        <div className="grid grid-cols-2 gap-2 text-xs text-white/70 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5">
          <div><span className="font-medium">North:</span> {bbox.north.toFixed(5)}°</div>
          <div><span className="font-medium">South:</span> {bbox.south.toFixed(5)}°</div>
          <div><span className="font-medium">East:</span> {bbox.east.toFixed(5)}°</div>
          <div><span className="font-medium">West:</span> {bbox.west.toFixed(5)}°</div>
        </div>
      )}

      {/* Leaflet Map — with the polygon draw controls docked to its bottom edge */}
      <div className="rounded-xl overflow-hidden border border-gray-200">
        <div className="h-64">
        <MapContainer
          center={defaultCenter}
          zoom={mapCenter.zoom}
          className="h-full w-full"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Gothenburg municipality boundary — highlights the working area.
              Two layers: a soft white halo under a bold purple line so the outline
              reads clearly over the map's greens/greys, plus a light fill. */}
          {boundary && (
            <>
              <GeoJSON
                key="gbg-halo"
                data={boundary as never}
                interactive={false}
                style={() => ({ color: "#ffffff", weight: 7, opacity: 0.7, fill: false })}
              />
              <GeoJSON
                key="gbg-boundary"
                data={boundary as never}
                interactive={false}
                style={() => ({ color: "#721CB8", weight: 3.5, opacity: 1, fillColor: "#721CB8", fillOpacity: 0.10 })}
              />
            </>
          )}
          {boundary && validPoints.length === 0 && !bbox && <FitToBoundary boundary={boundary} />}

          {/* Auto-fit bounds when points or bbox changes */}
          <MapFitBounds points={validPoints} bbox={bbox} />

          {/* Address markers */}
          {locationMode === "addresses" &&
            validPoints.map((p, i) => (
              <Marker key={i} position={[p.lat, p.lon]}>
                <Popup>
                  <span className="text-sm">{p.label || p.address}</span>
                </Popup>
              </Marker>
            ))}

          {/* Bbox drag-draw handler */}
          {isBuilding && locationMode === "bbox" && (!bboxDone || bboxRedrawMode) && (
            <BboxDragHandler onDraw={handleBboxDraw} />
          )}

          {/* Bounding box rectangle */}
          {bboxBounds && (
            <>
              <Rectangle
                bounds={bboxBounds}
                pathOptions={{
                  color: "#721CB8",
                  weight: 2,
                  fillColor: "#995BD5",
                  fillOpacity: 0.12,
                }}
              />
              {isBuilding && locationMode === "bbox" && bboxDone && bbox && !bboxRedrawMode && (
                <BboxEditHandles
                  bbox={bbox}
                  onPreview={(next) => setBbox(normalizeBbox(next))}
                  onCommit={commitBboxEdit}
                />
              )}
            </>
          )}

          {/* Free-form polygon: click handler + shape + vertex dots */}
          {isBuilding && locationMode === "polygon" && !polyDone && (
            <PolygonClickHandler onAddVertex={addPolyVertex} />
          )}
          {isBuilding && locationMode === "polygon" && polyVerts.length >= 2 && (
            <Polygon
              positions={polyVerts}
              pathOptions={{ color: "#0d9488", weight: 2, fillColor: "#14b8a6", fillOpacity: 0.14 }}
            />
          )}
          {isBuilding && locationMode === "polygon" &&
            polyVerts.map((v, i) => (
              <CircleMarker key={i} center={v} radius={4}
                pathOptions={{ color: "#0d9488", fillColor: "#fff", fillOpacity: 1, weight: 2 }} />
            ))}
        </MapContainer>
        </div>

        {/* Docked polygon draw controls — sit right where you finish drawing,
            attached under the map and just above the wizard's Continue. */}
        {isBuilding && locationMode === "polygon" && (
          <div className="border-t border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70 flex items-center gap-3 flex-wrap">
            <span>
              {polyDone
                ? `✓ Shape with ${polyVerts.length} points — buildings inside are selected.`
                : polyVerts.length === 0
                ? "Click on the map to drop each corner of your area."
                : `${polyVerts.length} point${polyVerts.length > 1 ? "s" : ""} added${polyVerts.length >= 3 ? " — click “Finish shape” to close it." : " (need at least 3)."}`}
            </span>
            <span className="flex gap-2 ml-auto">
              {!polyDone && polyVerts.length >= 3 && (
                <button onClick={finishPolygon} className="px-2.5 py-1 rounded-md bg-teal text-white text-xs font-semibold hover:brightness-110">
                  Finish shape
                </button>
              )}
              {polyVerts.length > 0 && (
                <button onClick={clearPolygon} className="px-2.5 py-1 rounded-md border border-white/15 text-white/70 text-xs font-medium hover:border-white/30">
                  Clear
                </button>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}