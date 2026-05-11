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

import { useState, useEffect, useRef, useCallback } from "react";
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

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

// ── Small square resize-handle icon ─────────────────────────────────────────

const handleIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:12px;height:12px;
    background:white;
    border:2px solid #721CB8;
    border-radius:3px;
    box-shadow:0 1px 4px rgba(0,0,0,.35);
    cursor:move;
  "></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

// ── Nominatim autocomplete hook ──────────────────────────────────────────────

function useNominatim(query: string, countryCode = "se") {
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.trim().length < 3) { setResults([]); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const url =
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}` +
          `&countrycodes=${countryCode}&format=json&limit=5&addressdetails=1`;
        const res = await fetch(url, { headers: { "Accept-Language": "en" } });
        setResults(await res.json() as NominatimResult[]);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 500);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, countryCode]);

  return { results, loading };
}

// ── MapFitBounds ─────────────────────────────────────────────────────────────

function MapFitBounds({ points, bbox }: { points: GeoPoint[]; bbox: BboxCoords | null }) {
  const map = useMap();
  useEffect(() => {
    if (bbox) {
      map.fitBounds([[bbox.south, bbox.west], [bbox.north, bbox.east]], { padding: [20, 20] });
    } else if (points.length === 1) {
      map.setView([points[0].lat, points[0].lon], 15);
    } else if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon] as LatLngTuple)), { padding: [40, 40] });
    }
  }, [points, bbox, map]);
  return null;
}

// ── BboxDrawer — click-drag to create the initial rectangle ─────────────────
// While active, map panning/zoom are disabled and cursor is a crosshair.

function BboxDrawer({
  active,
  onPreview,
  onCommit,
}: {
  active: boolean;
  onPreview: (b: BboxCoords | null) => void;
  onCommit: (b: BboxCoords | null) => void;
}) {
  const map = useMap();
  const drawing = useRef(false);
  const start = useRef<L.LatLng | null>(null);

  useEffect(() => {
    const container = map.getContainer();
    if (active) {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      container.style.cursor = "crosshair";
    } else {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      container.style.cursor = "";
      drawing.current = false;
      start.current = null;
    }
    return () => {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      container.style.cursor = "";
    };
  }, [active, map]);

  useMapEvents({
    mousedown(e) {
      if (!active) return;
      drawing.current = true;
      start.current = e.latlng;
      onPreview(null);
    },
    mousemove(e) {
      if (!active || !drawing.current || !start.current) return;
      const s = start.current, c = e.latlng;
      onPreview({
        north: Math.max(s.lat, c.lat), south: Math.min(s.lat, c.lat),
        east:  Math.max(s.lng, c.lng), west:  Math.min(s.lng, c.lng),
      });
    },
    mouseup(e) {
      if (!active || !drawing.current || !start.current) return;
      drawing.current = false;
      const s = start.current, c = e.latlng;
      start.current = null;
      const trivial = Math.abs(s.lat - c.lat) < 0.0002 && Math.abs(s.lng - c.lng) < 0.0002;
      onCommit(trivial ? null : {
        north: Math.max(s.lat, c.lat), south: Math.min(s.lat, c.lat),
        east:  Math.max(s.lng, c.lng), west:  Math.min(s.lng, c.lng),
      });
    },
  });
  return null;
}

// ── BboxHandles — 8 draggable handles for resizing a finalized bbox ──────────

function BboxHandles({ bbox, onChange }: { bbox: BboxCoords; onChange: (b: BboxCoords) => void }) {
  const mid = (a: number, b: number) => (a + b) / 2;
  const bboxRef = useRef(bbox);
  useEffect(() => { bboxRef.current = bbox; }, [bbox]);

  const handles: [HandleId, number, number][] = [
    ["nw", bbox.north, bbox.west],
    ["n",  bbox.north, mid(bbox.east, bbox.west)],
    ["ne", bbox.north, bbox.east],
    ["e",  mid(bbox.north, bbox.south), bbox.east],
    ["se", bbox.south, bbox.east],
    ["s",  bbox.south, mid(bbox.east, bbox.west)],
    ["sw", bbox.south, bbox.west],
    ["w",  mid(bbox.north, bbox.south), bbox.west],
  ];

  function applyDrag(id: HandleId, lat: number, lng: number, cur: BboxCoords): BboxCoords {
    switch (id) {
      case "nw": return { ...cur, north: lat, west: lng };
      case "n":  return { ...cur, north: lat };
      case "ne": return { ...cur, north: lat, east: lng };
      case "e":  return { ...cur, east: lng };
      case "se": return { ...cur, south: lat, east: lng };
      case "s":  return { ...cur, south: lat };
      case "sw": return { ...cur, south: lat, west: lng };
      case "w":  return { ...cur, west: lng };
    }
  }

  return (
    <>
      {handles.map(([id, lat, lng]) => (
        <Marker
          key={id}
          position={[lat, lng]}
          icon={handleIcon}
          draggable
          eventHandlers={{
            drag(e) {
              const ll = (e.target as L.Marker).getLatLng();
              const updated = applyDrag(id, ll.lat, ll.lng, bboxRef.current);
              // normalise so bounds never invert
              const norm: BboxCoords = {
                north: Math.max(updated.north, updated.south),
                south: Math.min(updated.north, updated.south),
                east:  Math.max(updated.east,  updated.west),
                west:  Math.min(updated.east,  updated.west),
              };
              onChange(norm);
            },
          }}
        />
      ))}
    </>
  );
}

// ── Address input with dropdown autocomplete ─────────────────────────────────

function AddressInput({
  value, onChange, onGeocode, placeholder, countryCode = "se",
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

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
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
        autoComplete="off"
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        placeholder={placeholder ?? "Type an address in Sweden…"}
        className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:ring-2 focus:ring-teal focus:border-teal"
      />
      {loading && (
        <span className="absolute right-3 top-2.5 text-xs text-gray-400 pointer-events-none">Searching…</span>
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
  onAddressChange: (addressString: string) => void;
}

export default function LocationMap({ scale, onAddressChange }: LocationMapProps) {
  const isBuilding = scale === "Building";

  const [locationMode, setLocationMode] = useState<"addresses" | "bbox">("addresses");
  const [addressInputs, setAddressInputs] = useState<string[]>([""]);
  const [geoPoints, setGeoPoints] = useState<(GeoPoint | null)[]>([null]);

  // Bbox state
  const [drawMode, setDrawMode] = useState(false);
  const [bboxPreview, setBboxPreview] = useState<BboxCoords | null>(null);
  const [bbox, setBbox] = useState<BboxCoords | null>(null);

  // Reset when scale changes
  useEffect(() => {
    setLocationMode("addresses");
    setAddressInputs([""]);
    setGeoPoints([null]);
    setDrawMode(false);
    setBboxPreview(null);
    setBbox(null);
    onAddressChange("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  // Sync bbox to parent
  const syncBbox = useCallback((b: BboxCoords) => {
    onAddressChange(
      `BBOX: N${b.north.toFixed(4)} S${b.south.toFixed(4)} E${b.east.toFixed(4)} W${b.west.toFixed(4)}`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Address handlers ─────────────────────────────────────────────────────

  function updateGeoPoint(index: number, lat: number, lon: number, label: string) {
    setGeoPoints((prev) => {
      const next = [...prev];
      next[index] = { address: addressInputs[index], lat, lon, label };
      return next;
    });
  }

  function removeAddress(index: number) {
    const nextInputs = addressInputs.filter((_, j) => j !== index);
    const nextPoints = geoPoints.filter((_, j) => j !== index);
    setAddressInputs(nextInputs.length ? nextInputs : [""]);
    setGeoPoints(nextPoints.length ? nextPoints : [null]);
    onAddressChange(nextInputs.filter(Boolean).join("; "));
  }

  // ── Bbox handlers ─────────────────────────────────────────────────────────

  const handleCommit = useCallback((committed: BboxCoords | null) => {
    setDrawMode(false);
    setBboxPreview(null);
    if (committed) {
      setBbox(committed);
      syncBbox(committed);
    }
  }, [syncBbox]);

  function handleHandleChange(updated: BboxCoords) {
    setBbox(updated);
    syncBbox(updated);
  }

  function clearBbox() {
    setBbox(null);
    setBboxPreview(null);
    setDrawMode(false);
    onAddressChange("");
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const validPoints = geoPoints.filter((p): p is GeoPoint => p !== null && !!p.lat);
  const displayBbox = drawMode ? bboxPreview : bbox;
  const bboxBounds: [[number, number], [number, number]] | null = displayBbox
    ? [[displayBbox.south, displayBbox.west], [displayBbox.north, displayBbox.east]]
    : null;

  const defaultCenter: LatLngTuple = [62.0, 15.0];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3 mt-2">
      {/* Mode toggle */}
      {!isBuilding && (
        <div className="flex gap-2">
          <button
            onClick={() => { setLocationMode("addresses"); setDrawMode(false); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
              locationMode === "addresses" ? "bg-navy text-white border-navy" : "bg-white border-gray-300 hover:border-gray-400"
            }`}
          >
            Addresses
          </button>
          <button
            onClick={() => setLocationMode("bbox")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
              locationMode === "bbox" ? "bg-navy text-white border-navy" : "bg-white border-gray-300 hover:border-gray-400"
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
                onGeocode={(lat, lon, label) => updateGeoPoint(i, lat, lon, label)}
                placeholder={isBuilding ? "Type an address in Sweden…" : `Address ${i + 1} — type to search`}
              />
              {!isBuilding && addressInputs.length > 1 && (
                <button
                  onClick={() => removeAddress(i)}
                  className="mt-0.5 px-2.5 py-2 rounded-lg border border-gray-300 text-gray-500 hover:text-red-500 hover:border-red-300 text-sm"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {!isBuilding && (
            <button
              onClick={() => { setAddressInputs([...addressInputs, ""]); setGeoPoints([...geoPoints, null]); }}
              className="text-sm text-teal hover:underline"
            >
              + Add another address
            </button>
          )}
        </div>
      )}

      {/* Bbox toolbar */}
      {!isBuilding && locationMode === "bbox" && (
        <div className="flex items-center gap-2 flex-wrap">
          {/* No box yet and not drawing → show Draw button */}
          {!bbox && !drawMode && (
            <button
              onClick={() => setDrawMode(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-navy text-white border border-navy hover:bg-navy-dark transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
              Draw Area
            </button>
          )}

          {/* Drawing mode active */}
          {drawMode && (
            <>
              <span className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5">
                🖱️ Click and drag on the map to draw your area
              </span>
              <button
                onClick={() => { setDrawMode(false); setBboxPreview(null); }}
                className="ml-auto text-xs text-gray-500 hover:text-red-500 hover:underline"
              >
                Cancel
              </button>
            </>
          )}

          {/* Box finalized */}
          {bbox && !drawMode && (
            <>
              <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                ✓ Area selected — drag the handles to resize
              </span>
              <button
                onClick={() => setDrawMode(true)}
                className="ml-auto text-xs text-teal hover:underline whitespace-nowrap"
              >
                Redraw
              </button>
              <button
                onClick={clearBbox}
                className="text-xs text-gray-400 hover:text-red-500 hover:underline whitespace-nowrap"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}

      {/* Bbox coordinates */}
      {!isBuilding && locationMode === "bbox" && bbox && !drawMode && (
        <div className="grid grid-cols-4 gap-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2.5">
          <div><span className="font-medium">N:</span> {bbox.north.toFixed(4)}°</div>
          <div><span className="font-medium">S:</span> {bbox.south.toFixed(4)}°</div>
          <div><span className="font-medium">E:</span> {bbox.east.toFixed(4)}°</div>
          <div><span className="font-medium">W:</span> {bbox.west.toFixed(4)}°</div>
        </div>
      )}

      {/* Leaflet Map */}
      <div
        className="rounded-xl overflow-hidden border border-gray-200"
        style={{ height: locationMode === "bbox" ? "340px" : "260px" }}
      >
        <MapContainer center={defaultCenter} zoom={5} className="h-full w-full" scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapFitBounds points={validPoints} bbox={bbox && !drawMode ? bbox : null} />

          {/* Address markers */}
          {locationMode === "addresses" &&
            validPoints.map((p, i) => (
              <Marker key={i} position={[p.lat, p.lon]}>
                <Popup><span className="text-sm">{p.label || p.address}</span></Popup>
              </Marker>
            ))}

          {/* Draw handler — active only when drawMode is on */}
          {!isBuilding && locationMode === "bbox" && (
            <BboxDrawer active={drawMode} onPreview={setBboxPreview} onCommit={handleCommit} />
          )}

          {/* Rectangle (dashed preview while drawing, solid when done) */}
          {bboxBounds && (
            <Rectangle
              bounds={bboxBounds}
              pathOptions={{
                color: "#721CB8",
                weight: 2,
                dashArray: drawMode ? "6 5" : undefined,
                fillColor: "#995BD5",
                fillOpacity: drawMode ? 0.07 : 0.13,
              }}
            />
          )}

          {/* 8 draggable resize handles — only when box is finalized */}
          {!isBuilding && locationMode === "bbox" && bbox && !drawMode && (
            <BboxHandles bbox={bbox} onChange={handleHandleChange} />
          )}
        </MapContainer>
      </div>
    </div>
  );
}


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
    } else if (points.length === 1) {
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
  onAddressChange: (addressString: string) => void;
}

export default function LocationMap({
  scale,
  onAddressChange,
}: LocationMapProps) {
  const isBuilding = scale === "Building";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  // ── Address handlers ─────────────────────────────────────────────────────

  function updateGeoPoint(index: number, lat: number, lon: number, label: string) {
    setGeoPoints((prev) => {
      const next = [...prev];
      next[index] = { address: addressInputs[index], lat, lon, label };
      return next;
    });
  }

  function removeAddress(index: number) {
    const nextInputs = addressInputs.filter((_, j) => j !== index);
    const nextPoints = geoPoints.filter((_, j) => j !== index);
    setAddressInputs(nextInputs.length ? nextInputs : [""]);
    setGeoPoints(nextPoints.length ? nextPoints : [null]);
    onAddressChange(nextInputs.filter(Boolean).join("; "));
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

  // Default map center: Sweden overview
  const defaultCenter: LatLngTuple = [62.0, 15.0];

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
                placeholder={
                  isBuilding
                    ? "Type an address in Sweden…"
                    : `Address ${i + 1} — type to search`
                }
              />
              {!isBuilding && addressInputs.length > 1 && (
                <button
                  onClick={() => removeAddress(i)}
                  className="mt-0.5 px-2.5 py-2 rounded-lg border border-gray-300 text-gray-500 hover:text-red-500 hover:border-red-300 text-sm"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {!isBuilding && (
            <button
              onClick={() => {
                setAddressInputs([...addressInputs, ""]);
                setGeoPoints([...geoPoints, null]);
              }}
              className="text-sm text-teal hover:underline"
            >
              + Add another address
            </button>
          )}
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
          zoom={5}
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
