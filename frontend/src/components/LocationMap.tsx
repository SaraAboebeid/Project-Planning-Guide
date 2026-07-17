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
}

export default function LocationMap({
  scale,
  country,
  city,
  onAddressChange,
  onPointsChange,
  onBboxChange,
}: LocationMapProps) {
  const isBuilding = scale === "Building";
  const countryCode = countryCodeFromName(country);
  const mapCenter = mapCenterFor(countryCode, city);

  const [locationMode, setLocationMode] = useState<"addresses" | "bbox">(
    "addresses"
  );
  const [addressInputs, setAddressInputs] = useState<string[]>([""]);
  const [geoPoints, setGeoPoints] = useState<(GeoPoint | null)[]>([null]);

  const [bbox, setBbox] = useState<BboxCoords | null>(null);
  const [bboxPreview, setBboxPreview] = useState<BboxCoords | null>(null);
  const [bboxDone, setBboxDone] = useState(false);

  // Reset when scale changes
  useEffect(() => {
    setLocationMode("addresses");
    setAddressInputs([""]);
    setGeoPoints([null]);
    setBbox(null);
    setBboxPreview(null);
    setBboxDone(false);
    onAddressChange("");
    onBboxChange?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

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
      {/* Mode toggle — only for Neighborhood / Portfolio */}
      {!isBuilding && (
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
            Draw Area on Map
          </button>
        </div>
      )}

      {/* Address inputs */}
      {(isBuilding || locationMode === "addresses") && (
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
      {!isBuilding && locationMode === "bbox" && (
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
      {!isBuilding && locationMode === "bbox" && bboxDone && bbox && (
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
          {!isBuilding && locationMode === "bbox" && (
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
        </MapContainer>
      </div>
    </div>
  );
}