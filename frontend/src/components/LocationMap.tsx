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
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import type { LatLngTuple } from "leaflet";
import "leaflet/dist/leaflet.css";
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

// ── Types ────────────────────────────────────────────────────────────────────

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
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

// ── Nominatim autocomplete hook ──────────────────────────────────────────────


function useNominatim(query: string, countryCode = "se") {
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          query
        )}&countrycodes=${countryCode}&format=json&limit=5&addressdetails=1`;
        const res = await fetch(url, {
          headers: { "Accept-Language": "en" },
        });
        const data = await res.json();
        setResults(data as NominatimResult[]);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, countryCode]);

  return { results, loading };
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
  placeholder,
  countryCode = "se",
}: {
  value: string;
  onChange: (v: string) => void;
  onGeocode: (lat: number, lon: number, label: string) => void;
  placeholder?: string;
  countryCode?: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const { results, loading } = useNominatim(query, countryCode);
  const containerRef = useRef<HTMLDivElement>(null);

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
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        placeholder={placeholder ?? "Type an address in Sweden…"}
        autoComplete="off"
        className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:ring-2 focus:ring-teal focus:border-teal"
      />
      {loading && (
        <span className="absolute right-3 top-2.5 text-xs text-gray-400 pointer-events-none">
          Searching…
        </span>
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-[10000] w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg text-sm max-h-56 overflow-auto">
          {results.map((r) => (
            <li
              key={r.place_id}
              onMouseDown={() => handleSelect(r)}
              className="px-4 py-2 hover:bg-purple-50 cursor-pointer text-gray-700 border-b last:border-0 border-gray-100 leading-snug"
            >
              {r.display_name}
            </li>
          ))}
        </ul>
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
}

export default function LocationMap({
  scale,
  country,
  city,
  onAddressChange,
  onPointsChange,
  onBboxChange,
  onPolygonChange,
}: LocationMapProps) {
  const isBuilding = scale === "Building";
  const countryCode = countryCodeFromName(country);
  const mapCenter = mapCenterFor(countryCode, city);

  const [locationMode, setLocationMode] = useState<"addresses" | "bbox" | "polygon">(
    "addresses"
  );
  const [addressInputs, setAddressInputs] = useState<string[]>([""]);
  const [geoPoints, setGeoPoints] = useState<(GeoPoint | null)[]>([null]);

  const [bbox, setBbox] = useState<BboxCoords | null>(null);
  const [bboxPreview, setBboxPreview] = useState<BboxCoords | null>(null);
  const [bboxDone, setBboxDone] = useState(false);

  // Free-form polygon vertices ([lat, lng] for Leaflet); done = closed & applied
  const [polyVerts, setPolyVerts] = useState<LatLngTuple[]>([]);
  const [polyDone, setPolyDone] = useState(false);

  // Reset when scale changes
  useEffect(() => {
    setLocationMode("addresses");
    setAddressInputs([""]);
    setGeoPoints([null]);
    setBbox(null);
    setBboxPreview(null);
    setBboxDone(false);
    setPolyVerts([]);
    setPolyDone(false);
    onAddressChange("");
    onBboxChange?.(null);
    onPolygonChange?.(null, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

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
        setBbox(preview);
        onAddressChange(
          `BBOX: N${preview.north.toFixed(4)} S${preview.south.toFixed(4)} E${preview.east.toFixed(4)} W${preview.west.toFixed(4)}`
        );
        // Notify parent with the raw bbox so it can query ALL buildings inside it;
        // clear any single-building points so the two modes don't conflict.
        onBboxChange?.(preview);
        onPointsChange?.([]);
      } else {
        // trivial drag — keep existing box
      }
    } else {
      setBboxDone(false);
    }
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
      {/* Mode toggle — Building(s): pick by address, or draw a rectangle / any
          shape to grab a group of buildings. (Neighborhood uses the district
          list; City = the whole city — so no area drawing there.) */}
      {isBuilding && (
        <div className="flex gap-2">
          <button
            onClick={() => setLocationMode("addresses")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
              locationMode === "addresses"
                ? "bg-navy text-white border-navy"
                : "bg-white border-gray-300 hover:border-gray-400"
            }`}
          >
            Addresses
          </button>
          <button
            onClick={() => setLocationMode("bbox")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
              locationMode === "bbox"
                ? "bg-navy text-white border-navy"
                : "bg-white border-gray-300 hover:border-gray-400"
            }`}
          >
            Draw Rectangle
          </button>
          <button
            onClick={() => setLocationMode("polygon")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
              locationMode === "polygon"
                ? "bg-navy text-white border-navy"
                : "bg-white border-gray-300 hover:border-gray-400"
            }`}
          >
            Draw Any Shape
          </button>
        </div>
      )}

      {/* Polygon draw controls */}
      {isBuilding && locationMode === "polygon" && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 flex items-center gap-3 flex-wrap">
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
              <button onClick={clearPolygon} className="px-2.5 py-1 rounded-md border border-gray-300 text-xs font-medium hover:border-gray-400">
                Clear
              </button>
            )}
          </span>
        </div>
      )}

      {/* Address inputs — the default for every scale; at Building(s) they hide
          when the user switches to a draw mode. */}
      {(!isBuilding || locationMode === "addresses") && (
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
                  className="mt-0.5 px-2.5 py-2 rounded-lg border border-gray-300 text-gray-500 hover:text-red-500 hover:border-red-300 text-sm"
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
        <div className="flex items-center gap-2 text-xs text-gray-600 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
          <span>🖱️</span>
          <span>
            {bboxDone
              ? "Area drawn. Click and drag on the map to redraw."
              : "Click and drag on the map to draw your area."}
          </span>
          {bboxDone && (
            <button
              onClick={() => {
                setBbox(null);
                setBboxPreview(null);
                setBboxDone(false);
                onAddressChange("");
              }}
              className="ml-auto text-xs text-teal hover:underline whitespace-nowrap"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Bbox coordinates summary — only when finalized */}
      {isBuilding && locationMode === "bbox" && bboxDone && bbox && (
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2.5">
          <div><span className="font-medium">North:</span> {bbox.north.toFixed(5)}°</div>
          <div><span className="font-medium">South:</span> {bbox.south.toFixed(5)}°</div>
          <div><span className="font-medium">East:</span> {bbox.east.toFixed(5)}°</div>
          <div><span className="font-medium">West:</span> {bbox.west.toFixed(5)}°</div>
        </div>
      )}

      {/* Leaflet Map */}
      <div className="h-64 rounded-xl overflow-hidden border border-gray-200">
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
          {isBuilding && locationMode === "bbox" && (
            <BboxDragHandler onDraw={handleBboxDraw} />
          )}

          {/* Bounding box rectangle */}
          {bboxBounds && (
            <Rectangle
              bounds={bboxBounds}
              pathOptions={{
                color: "#721CB8",
                weight: 2,
                fillColor: "#995BD5",
                fillOpacity: 0.12,
              }}
            />
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
    </div>
  );
}