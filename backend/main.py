"""
FastAPI backend — wraps existing Python modules (EPC, TABULA, Boverket, sensitivity).
Run:  uvicorn backend.main:app --reload --port 8000
"""
from __future__ import annotations

import gzip
import json
import math
import os
import sys
from pathlib import Path

# ── API keys — supplied via environment variables (see .env.example) ─────────
# Optional: load a local .env file when running outside Docker.
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass
# ────────────────────────────────────────────────────────────────────────────
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

# Allow imports from the project root so existing modules work unchanged
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from tools.idf.generate_idf import build_shoebox_idf
from backend import simdb

app = FastAPI(title="Project Planning Guide API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _json_errors_with_cors(request, call_next):
    """Turn an unhandled exception into a CORS-visible JSON 500.

    Starlette's default 500 is produced above the CORS middleware, so it carries
    no Access-Control-Allow-Origin header. The browser then refuses to expose the
    response and `fetch` rejects with a bare network error — which is how a crash
    inside one endpoint showed up in the viewer as "backend not reachable on
    :8000" while the server was in fact running and healthy. Returning the error
    ourselves, with the header attached, means the UI reports what actually
    happened. The traceback still goes to the server log.
    """
    try:
        return await call_next(request)
    except Exception:
        import traceback as _tb
        _tb.print_exc()
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error — see the backend log for the traceback."},
            headers={"Access-Control-Allow-Origin": "*"},
        )

# Pre-load and gzip the buildings data once at startup

# ── Reverse geocode cache (lat/lon → street address, persists for server lifetime) ─
import re as _re
_REVERSE_GEOCODE_CACHE: dict[tuple[float, float], str | None] = {}
# Detect Swedish cadastral IDs like "JÄRNBORTT 134:3" or "PIXBO 1:162"
_CADASTRAL_RE = _re.compile(r'^\S.*\s\d+:\d+\s*$')
_BUILDINGS_GZ: bytes | None = None
_BUILDINGS_LIST: list | None = None

def _sanitize(obj):
    """Recursively replace NaN/Inf floats with None so JSON serialization never fails."""
    if isinstance(obj, float) and (obj != obj or obj == float("inf") or obj == float("-inf")):
        return None
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj

def _get_buildings_list() -> list:
    global _BUILDINGS_LIST
    if _BUILDINGS_LIST is None:
        data_path = PROJECT_ROOT / "frontend" / "public" / "buildings.json"
        raw = json.loads(data_path.read_text(encoding="utf-8-sig"))
        _BUILDINGS_LIST = _sanitize(raw)
    return _BUILDINGS_LIST

def _load_buildings() -> bytes:
    global _BUILDINGS_GZ
    if _BUILDINGS_GZ is None:
        raw = json.dumps(_get_buildings_list()).encode()
        _BUILDINGS_GZ = gzip.compress(raw, compresslevel=6)
    return _BUILDINGS_GZ

def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return distance in metres between two lat/lon points."""
    R = 6_371_000
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── Health ──────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok"}


# ── UK data (English Housing Survey 2024-25 + OSM/EPC city buildings) ───────
_UK_DIR = PROJECT_ROOT / "frontend" / "public" / "uk"


def _read_uk_json(name: str):
    path = _UK_DIR / name
    if not path.exists():
        raise HTTPException(
            404,
            f"{name} not built yet - run: python tools/uk/ingest_ehs.py "
            "&& python tools/uk/uk_data_pipeline.py",
        )
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/api/uk/cities")
def uk_cities():
    """Registry of built UK focus cities (London, Birmingham, Nottingham, ...)."""
    return _read_uk_json("cities.json")


@app.get("/api/uk/ehs")
def uk_ehs():
    """English Housing Survey 2024-25 headline KPIs + annex tables."""
    return _read_uk_json("ehs_2024_25.json")


@app.get("/api/uk/epc-band-priors")
def uk_epc_band_priors():
    """P(EPC band | dwelling age/type/tenure/region), derived from EHS 2024-25."""
    return _read_uk_json("epc_band_priors.json")


@app.get("/api/uk/retrofit-cost")
def uk_retrofit_cost():
    """Mean/median cost to reach EPC band C, by dwelling age/type/tenure/region."""
    return _read_uk_json("retrofit_cost_band_c.json")


@app.get("/api/uk/tabula")
def uk_tabula():
    """
    EPISCOPE/TABULA England envelope archetypes (BRE, Sept 2014): as-built
    U-values (roof/wall/floor/window/door) and heating demand by dwelling type
    and construction era, plus standard/ambitious refurbishment scenarios.
    Mirrors _TABULA_U in this file, which is the Swedish equivalent.
    """
    return _read_uk_json("tabula_gb.json")


@app.get("/api/uk/buildings/{city_id}")
def uk_buildings(city_id: str):
    """Extruded building payload for one UK focus city, same schema as /api/buildings."""
    registry = _read_uk_json("cities.json")
    city = next((c for c in registry["cities"] if c["id"] == city_id), None)
    if city is None:
        known = ", ".join(c["id"] for c in registry["cities"]) or "none built yet"
        raise HTTPException(404, f"Unknown city '{city_id}'. Built cities: {known}")
    return _read_uk_json(Path(city["data_file"]).name)


# Cached per city_id - mirrors _get_buildings_list()'s single-file cache, just
# keyed by which UK district's JSON to load.
_UK_BUILDINGS_CACHE: dict[str, list] = {}

def _get_uk_buildings_list(city_id: str) -> list:
    if city_id not in _UK_BUILDINGS_CACHE:
        registry = _read_uk_json("cities.json")
        city = next((c for c in registry["cities"] if c["id"] == city_id), None)
        if city is None:
            known = ", ".join(c["id"] for c in registry["cities"]) or "none built yet"
            raise HTTPException(404, f"Unknown city '{city_id}'. Built cities: {known}")
        raw = _read_uk_json(Path(city["data_file"]).name)
        _UK_BUILDINGS_CACHE[city_id] = _sanitize(raw)
    return _UK_BUILDINGS_CACHE[city_id]


def _resolve_uk_city_id(lat: float, lon: float) -> str:
    """Nearest built UK district to a point, so callers don't need their own
    copy of the district registry - mirrors how Sweden's /api/building never
    asks the caller which "area" a point is in either."""
    registry = _read_uk_json("cities.json")
    cities = registry["cities"]
    if not cities:
        raise HTTPException(404, "No UK cities built yet")
    nearest = min(cities, key=lambda c: _haversine_m(lat, lon, c["lat"], c["lon"]))
    if _haversine_m(lat, lon, nearest["lat"], nearest["lon"]) > nearest.get("radius_m", 1200) * 2:
        raise HTTPException(404, "No built UK district near this point")
    return nearest["id"]


@app.get("/api/uk/building")
def get_uk_building(lat: float = Query(...), lon: float = Query(...), city_id: str | None = Query(None)):
    """UK equivalent of /api/building - nearest real building within 150m of a
    point, enriched with the same true-perimeter geometry fields (this session's
    Phase 1 work), reusing the exact same helpers get_building() uses. Unlike
    Sweden, UK's own per-building tabula_u_wall/roof/win/period are already
    computed by tools/uk/uk_data_pipeline.py, so there's no TABULA/BBR
    derivation fallback needed here - just read them straight off the record.
    city_id is optional - when omitted, the nearest built UK district is
    resolved automatically (see _resolve_uk_city_id).
    """
    if not city_id:
        city_id = _resolve_uk_city_id(lat, lon)
    buildings = _get_uk_buildings_list(city_id)

    candidates: list[tuple[float, dict]] = []
    for b in buildings:
        coords = b.get("coordinates") or []
        c_lat, c_lon = _polygon_centroid(coords)
        if c_lat == 0.0 and c_lon == 0.0:
            continue
        d = _haversine_m(lat, lon, c_lat, c_lon)
        if d <= 150:
            candidates.append((d, b))

    if not candidates:
        raise HTTPException(404, f"No building found within 150 m of the given point in '{city_id}'")

    best_dist, best = min(candidates, key=lambda item: item[0])

    footprint: float | None = None
    if best.get("footprint_m2") and best["footprint_m2"] > 0:
        footprint = round(float(best["footprint_m2"]), 1)
    else:
        fp = _shoelace_m2(best.get("coordinates") or [])
        if fp and fp > 0:
            footprint = round(fp, 1)

    c_lat, c_lon = _polygon_centroid(best.get("coordinates") or [])

    perimeter_m = _ring_perimeter_m(best.get("coordinates") or [])
    height_val = best.get("height")
    wall_area_m2 = (
        round(perimeter_m * float(height_val), 1)
        if perimeter_m and height_val
        else None
    )

    return {
        "address":       best.get("address"),
        "height":        _clean(height_val),
        "floors":        _clean(best.get("floors")),
        "area_atemp":    _clean(best.get("floor_area_m2")),  # UK's own EPC-sourced total floor area
        "footprint_m2":  _clean(footprint),
        "wall_perimeter_m": _clean(round(perimeter_m, 1)) if perimeter_m else None,
        "wall_area_m2":  _clean(wall_area_m2),
        "roof_area_m2":  _clean(footprint),
        "floor_area_m2": _clean(footprint),
        "use_cat":       best.get("use_cat"),
        "year":          _clean(best.get("year")),
        "energy":        _clean(best.get("tabula_kwh_m2_yr")),  # UK has no measured "energy" field; TABULA estimate is the closest equivalent
        "eclass":        best.get("eclass"),
        "tabula_period": best.get("tabula_period"),
        # Always populated when a TABULA match exists (real year OR an
        # EHS-sampled era) - unlike tabula_period above, which stays null for
        # a sampled era. This is what a caller should use to re-match the
        # SAME archetype tabula_u_wall/roof/win below actually came from
        # (e.g. to show refurbishment-tier options), not tabula_period.
        "tabula_period_used": best.get("tabula_period_used"),
        # "known_year" | "ehs_sampled_period" | None - lets a caller label
        # the match as a known construction year vs. an EHS-sampled estimate.
        "tabula_u_source": best.get("tabula_u_source"),
        "tabula_u_wall": _clean(best.get("tabula_u_wall")),
        "tabula_u_roof": _clean(best.get("tabula_u_roof")),
        "tabula_u_win":  _clean(best.get("tabula_u_win")),
        "has_epc":       bool(best.get("has_epc")),
        "lat":           round(c_lat, 6),
        "lon":           round(c_lon, 6),
        "dist_m":        round(best_dist, 1),
    }


# ── Country profile (summary KPIs for the 3D viewer sidebar) ────────────────
@app.get("/api/country-profile")
def country_profile(country: str = Query(...)):
    country = country.lower()

    if country == "se":
        records = _get_buildings_list()
        eclass = [r.get("eclass") for r in records if r.get("eclass")]
        total = len(eclass) or 1
        share = {
            "A_B": round(sum(1 for e in eclass if e in ("A", "B")) / total * 100),
            "C_D": round(sum(1 for e in eclass if e in ("C", "D")) / total * 100),
            "E_G": round(sum(1 for e in eclass if e in ("E", "F", "G")) / total * 100),
        }
        return {
            "country": "se",
            "name": "Sweden",
            "viewer": {
                "summary": "Current active country profile for Gothenburg digital twin baseline.",
                "kpis": [
                    {"key": "buildings", "label": "3D Buildings", "value": len(records), "unit": "count"},
                    {"key": "epc_match", "label": "EPC Matched", "value": sum(1 for r in records if r.get("has_epc")), "unit": "count"},
                    {"key": "tabula_match", "label": "TABULA Matched", "value": sum(1 for r in records if r.get("tabula_period")), "unit": "count"},
                ],
                "energy_class_share": share,
            },
        }

    if country == "gb":
        try:
            registry = _read_uk_json("cities.json")
            ehs = _read_uk_json("ehs_2024_25.json")
        except HTTPException:
            return {
                "country": "gb",
                "name": "United Kingdom",
                "viewer": {"summary": "UK data not built yet.", "kpis": [], "energy_class_share": {}},
            }

        cities = registry["cities"]
        total = sum(c["buildings"] for c in cities)
        with_epc = sum(c["with_epc"] for c in cities)
        estimated = sum(c["estimated_from_ehs"] for c in cities)
        bands = {"A": 0, "B": 0, "C": 0, "D": 0, "E": 0, "F": 0, "G": 0}
        for c in cities:
            for b, n in c.get("band_distribution", {}).items():
                bands[b] = bands.get(b, 0) + n
        band_total = sum(bands.values()) or 1

        sap_kpi = next((k for k in ehs.get("kpis", []) if k["label"] == "Mean SAP rating"), None)

        return {
            "country": "gb",
            "name": "United Kingdom",
            "viewer": {
                "summary": f"{len(cities)} focus city(ies): {', '.join(c['name'] for c in cities)}. "
                           "Bands from the EPC register where matched, otherwise estimated from "
                           "English Housing Survey 2024-25.",
                "kpis": [
                    {"key": "buildings", "label": "3D Buildings", "value": total, "unit": "count"},
                    {"key": "epc_match", "label": "EPC Matched", "value": with_epc, "unit": "count"},
                    {"key": "ehs_estimated", "label": "EHS Estimated", "value": estimated, "unit": "count"},
                    *([{"key": "sap_england", "label": "Mean SAP (England)", "value": sap_kpi["value"], "unit": "count"}] if sap_kpi else []),
                ],
                "energy_class_share": {
                    "A_B": round((bands["A"] + bands["B"]) / band_total * 100),
                    "C_D": round((bands["C"] + bands["D"]) / band_total * 100),
                    "E_G": round((bands["E"] + bands["F"] + bands["G"]) / band_total * 100),
                },
            },
        }

    return {
        "country": country,
        "name": {"be": "Belgium", "ie": "Ireland"}.get(country, country.upper()),
        "viewer": {
            "summary": f"Profile scaffold ready. Connect {country.upper()} source metrics to activate KPIs.",
            "kpis": [],
            "energy_class_share": {},
        },
    }


# ── Buildings (gzip-compressed for fast transfer) ────────────────────────────
@app.get("/api/buildings")
def buildings():
    gz = _load_buildings()
    return Response(
        content=gz,
        media_type="application/json",
        headers={"Content-Encoding": "gzip", "Cache-Control": "public, max-age=86400"},
    )


# ── Buildings nearby — filter by proximity to geocoded points ────────────────
@app.get("/api/buildings/nearby")
def buildings_nearby(
    points: str = Query(..., description="Pipe-separated lat,lon pairs e.g. 57.706,11.967|57.707,11.968"),
    radius: int = Query(80, description="Search radius in metres"),
):
    """Return only buildings whose polygon centroid is within `radius` metres of any input point."""
    parsed: list[tuple[float, float]] = []
    for part in points.split("|"):
        try:
            lat_s, lon_s = part.strip().split(",")
            parsed.append((float(lat_s), float(lon_s)))
        except ValueError:
            raise HTTPException(400, f"Invalid point format: {part!r}. Expected 'lat,lon'.")

    all_buildings = _get_buildings_list()
    matched: list = []

    for b in all_buildings:
        # Compute polygon centroid from first ring of coordinates
        coords = b.get("coordinates", [[]])[0]
        if not coords:
            continue
        c_lon = sum(c[0] for c in coords) / len(coords)
        c_lat = sum(c[1] for c in coords) / len(coords)

        for q_lat, q_lon in parsed:
            if _haversine_m(q_lat, q_lon, c_lat, c_lon) <= radius:
                matched.append(b)
                break  # no need to check other query points

    payload = json.dumps(matched).encode()
    gz = gzip.compress(payload, compresslevel=6)
    return Response(
        content=gz,
        media_type="application/json",
        headers={"Content-Encoding": "gzip", "Cache-Control": "no-store"},
    )


# ── Geocode (proxy to Nominatim) ────────────────────────────────────────────
@app.get("/api/geocode")
async def geocode(address: str = Query(...)):
    import httpx

    async with httpx.AsyncClient() as client:
        r = await client.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": address, "format": "json", "limit": 1},
            headers={"User-Agent": "ProjectPlanningGuide/0.1"},
        )
        data = r.json()
    if not data:
        raise HTTPException(404, "Address not found")
    hit = data[0]
    return {"lat": float(hit["lat"]), "lon": float(hit["lon"]), "display_name": hit["display_name"]}


def _df_records(df) -> list[dict]:
    """DataFrame -> JSON-safe list of dicts (NaN -> None, same as _clean())."""
    import pandas as pd

    return [
        {k: _clean(v) for k, v in row.items()}
        for row in df.where(pd.notnull(df), None).to_dict(orient="records")
    ]


# ── EPC snapshot ─────────────────────────────────────────────────────────────
@app.get("/api/epc/snapshot")
def epc_snapshot(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_m: int = Query(800),
):
    try:
        from utils.location_data import get_nearby_epc_snapshot, has_location_database
    except ImportError:
        raise HTTPException(501, "EPC module not available")

    if not has_location_database():
        raise HTTPException(501, "EPC database not available on this server")

    result = get_nearby_epc_snapshot(lat, lon, radius_m)
    return {
        "summary": result["summary"],
        "points": _df_records(result["points"]),
        "classes": _df_records(result["classes"]),
        "sample": _df_records(result["sample"]),
    }


# ── EPC passport ─────────────────────────────────────────────────────────────
@app.get("/api/epc/passport/{formular_id}")
def epc_passport(formular_id: str):
    try:
        from utils.location_data import get_epc_building_passport
    except ImportError:
        raise HTTPException(501, "EPC module not available")

    passport = get_epc_building_passport(formular_id)
    if passport is None:
        raise HTTPException(404, "Building not found")
    return {k: _clean(v) for k, v in passport.items()}


# ── TABULA match ─────────────────────────────────────────────────────────────
@app.get("/api/tabula/match")
def tabula_match(
    building_type: str = Query(...),
    build_year: int = Query(...),
):
    try:
        from utils.tabula_matching import match_archetype, match_confidence
    except ImportError:
        raise HTTPException(501, "TABULA module not available")

    # match_archetype() returns a single Optional[dict] (the archetype, or
    # None for post-2005/unknown type); match_confidence() is a separate
    # function returning the {level, score, reason} assessment - the two are
    # NOT a tuple from one call (the old handler unpacked them as if they were,
    # which would have raised even once the streamlit import was fixed).
    archetype = match_archetype(building_type, build_year)
    confidence = match_confidence(building_type, build_year)
    return {"archetype": archetype, "confidence": confidence}


# ── Single building lookup by lat/lon ────────────────────────────────────────

# U-values derived from TABULA (Sweden) + Swedish BBR for post-2005.
# Structure: {use_type: {period: (u_wall, u_win)}}
# use_type: 'SFH' (enfamilj) or 'MFH' (flerfamilj)
# Periods: as stored in buildings.json tabula_period field
_TABULA_U: dict[str, dict[str, tuple[float, float]]] = {
    "SFH": {
        "...1960":    (0.60, 2.34),
        "1961-1975":  (0.41, 2.22),
        "1976-1985":  (0.27, 2.04),
        "1986-1995":  (0.19, 1.80),
        "1996-2005":  (0.17, 1.60),
        "post-2005":  (0.13, 1.10),   # BBR 2006+ / NNE requirements
    },
    "MFH": {
        "...1960":    (0.58, 2.22),
        "1961-1975":  (0.41, 2.22),
        "1976-1985":  (0.33, 2.04),
        "1986-1995":  (0.22, 1.80),
        "1996-2005":  (0.20, 1.97),
        "post-2005":  (0.15, 1.20),   # BBR 2006+ / NNE requirements
    },
}

# Map buildings.json use_cat → TABULA building type key
_USE_TO_TABULA_TYPE: dict[str, str] = {
    "bostad_enfamilj":   "SFH",
    "bostad_flerfamilj": "MFH",
}

def _derive_u_values(use_cat: str | None, period: str | None) -> tuple[float | None, float | None]:
    """Return (u_wall, u_win) from TABULA/BBR table, or (None, None) if not applicable."""
    if not period:
        return (None, None)
    btype = _USE_TO_TABULA_TYPE.get(use_cat or "")
    if not btype:
        return (None, None)
    pair = _TABULA_U.get(btype, {}).get(period)
    if pair is None:
        return (None, None)
    return pair


def _period_from_year(year) -> str | None:
    """Map a construction year to a TABULA period bucket."""
    try:
        y = int(year)
    except (TypeError, ValueError):
        return None
    if y <= 1960:    return "...1960"
    if y <= 1975:    return "1961-1975"
    if y <= 1985:    return "1976-1985"
    if y <= 1995:    return "1986-1995"
    if y <= 2005:    return "1996-2005"
    return "post-2005"


def _polygon_centroid(coords: list) -> tuple[float, float]:
    ring = coords[0] if coords else []
    if not ring:
        return (0.0, 0.0)
    c_lon = sum(c[0] for c in ring) / len(ring)
    c_lat = sum(c[1] for c in ring) / len(ring)
    return (c_lat, c_lon)

def _clean(v):
    """Convert NaN/Inf floats to None so FastAPI can JSON-serialize them."""
    if isinstance(v, float) and (v != v or v == float("inf") or v == float("-inf")):
        return None
    return v

def _shoelace_m2(coords: list) -> float | None:
    ring = coords[0] if coords else []
    if len(ring) < 3:
        return None
    total = 0.0
    for i in range(len(ring)):
        x0, y0 = ring[i - 1]
        x1, y1 = ring[i]
        total += (x0 + x1) * (y1 - y0)
    deg2 = abs(total) / 2.0
    lat_rad = math.radians(ring[0][1])
    m2_per_deg2 = (111_320 ** 2) * math.cos(lat_rad)
    return deg2 * m2_per_deg2


def _ring_perimeter_m(coords: list) -> float | None:
    """True footprint perimeter (sum of real edge lengths, not a square
    approximation). Reuses the exact same projection/winding/edge-length
    primitives tools/idf/generate_idf.py uses to build a building's wall
    surfaces, so this number matches what the IDF actually models."""
    ring = coords[0] if coords else []
    if len(ring) < 3:
        return None
    from tools.idf.geometry import project_ring, ensure_ccw, edge_length
    ring2d = ensure_ccw(project_ring(ring))
    n = len(ring2d)
    return sum(edge_length(ring2d[i], ring2d[(i + 1) % n]) for i in range(n))


# Building types considered "secondary" — only chosen if no primary building is nearby
_SECONDARY_USE = {"komplement", "industri"}

@app.get("/api/building")
def get_building(lat: float = Query(...), lon: float = Query(...)):
    """Return the nearest meaningful EUBUCCO building within 150 m, enriched with derived fields.

    Prefers primary use types (residential, civic, etc.) over secondary ones (komplement, industri)
    so that a residential tower 60 m away beats a garage/annex 10 m away.
    """
    buildings = _get_buildings_list()

    # Collect all candidates within 150 m with their distances
    candidates: list[tuple[float, dict]] = []
    for b in buildings:
        coords = b.get("coordinates") or []
        c_lat, c_lon = _polygon_centroid(coords)
        if c_lat == 0.0 and c_lon == 0.0:
            continue
        d = _haversine_m(lat, lon, c_lat, c_lon)
        if d <= 150:
            candidates.append((d, b))

    if not candidates:
        raise HTTPException(404, "No building found within 150 m of the given point")

    # Sort: primary use types first, then by distance
    def _rank(item: tuple[float, dict]) -> tuple[int, float]:
        d, b = item
        is_secondary = int((b.get("use_cat") or "") in _SECONDARY_USE)
        return (is_secondary, d)

    candidates.sort(key=_rank)
    best_dist, best = candidates[0]

    # If the nearest building has no EPC but a sibling at the same street address
    # (e.g. main residential vs. komplement/annex) does, prefer the EPC-bearing one.
    # EUBUCCO often splits a single property into several geometries; only one of
    # them carries the EPC record.
    if not best.get("has_epc") and best.get("address"):
        import re as _re
        _cad = _re.compile(r"^[A-ZÅÄÖa-zåäö ]+\s+\d+:\d+$")
        anchor_addr = (best.get("address") or "").strip()
        anchor_is_cad = bool(_cad.match(anchor_addr))
        for d, b in candidates:
            if not b.get("has_epc"):
                continue
            a = (b.get("address") or "").strip()
            if not a:
                continue
            # Match by exact address (street name + number) OR, if anchor is a
            # cadastral id, accept the closest EPC building within 50 m.
            if a == anchor_addr or (anchor_is_cad and d <= 50):
                best_dist, best = d, b
                break

    # Compute footprint — EUBUCCO polygon area only (Atemp is unreliable: one EPC may
    # cover multiple buildings and sums their areas, so Atemp/floors is not a valid proxy)
    footprint: float | None = None
    if best.get("footprint_m2") and best["footprint_m2"] > 0:
        footprint = round(float(best["footprint_m2"]), 1)
    else:
        fp = _shoelace_m2(best.get("coordinates") or [])
        if fp and fp > 0:
            footprint = round(fp, 1)

    # Centroid
    c_lat, c_lon = _polygon_centroid(best.get("coordinates") or [])

    # Real wall area (true polygon perimeter x height) for the renovation
    # calculator - NOT a square approximation. roof_area_m2/floor_area_m2
    # are just named aliases of footprint_m2, added so the frontend contract
    # is unambiguous about which figure to use for which component.
    perimeter_m = _ring_perimeter_m(best.get("coordinates") or [])
    height_val = best.get("height")
    wall_area_m2 = (
        round(perimeter_m * float(height_val), 1)
        if perimeter_m and height_val
        else None
    )

    # U-values: use stored value if available, otherwise derive from TABULA/BBR table
    u_wall = best.get("tabula_u_wall")
    u_win  = best.get("tabula_u_win")
    period = best.get("tabula_period") or _period_from_year(best.get("year"))
    if u_wall is None or u_win is None:
        derived_u_wall, derived_u_win = _derive_u_values(
            best.get("use_cat"), period
        )
        if u_wall is None:
            u_wall = derived_u_wall
        if u_win is None:
            u_win = derived_u_win

    return {
        "address":       best.get("address"),
        "all_addresses": best.get("all_addresses"),     # every entrance on this EPC (e.g. "16A | 16B | 16C")
        "height":        _clean(best.get("height")),
        "floors":        _clean(best.get("floors")),
        "area_atemp":    _clean(best.get("area")),      # total GFA / Atemp from EPC
        "footprint_m2":  _clean(footprint),
        "wall_perimeter_m": _clean(round(perimeter_m, 1)) if perimeter_m else None,
        "wall_area_m2":  _clean(wall_area_m2),
        "roof_area_m2":  _clean(footprint),
        "floor_area_m2": _clean(footprint),
        "use_cat":       best.get("use_cat"),
        "year":          _clean(best.get("year")),
        "energy":        _clean(best.get("energy")),    # kWh/m²/yr
        "eclass":        best.get("eclass"),
        "tabula_period": period,
        "tabula_u_wall": _clean(u_wall),
        "tabula_u_roof": _clean(best.get("tabula_u_roof")),
        "tabula_u_win":  _clean(u_win),
        "has_epc":       bool(best.get("has_epc")),
        "lat":           round(c_lat, 6),
        "lon":           round(c_lon, 6),
        "dist_m":        round(best_dist, 1),
    }


# ── All buildings within a bounding box — aggregate stats ───────────────────
def _parse_polygon(s: str | None) -> list[tuple[float, float]] | None:
    """Parse a "lon,lat;lon,lat;..." string into a list of (lon, lat) vertices."""
    if not s:
        return None
    pts: list[tuple[float, float]] = []
    for pair in s.split(";"):
        pair = pair.strip()
        if not pair:
            continue
        try:
            lon_s, lat_s = pair.split(",")
            pts.append((float(lon_s), float(lat_s)))
        except Exception:  # noqa: BLE001
            continue
    return pts if len(pts) >= 3 else None


def _point_in_poly(lon: float, lat: float, poly: list[tuple[float, float]]) -> bool:
    """Ray-casting point-in-polygon test. poly is a list of (lon, lat)."""
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-15) + xi):
            inside = not inside
        j = i
    return inside


@app.get("/api/buildings/bbox/stats")
def buildings_bbox_stats(
    north: float = Query(...),
    south: float = Query(...),
    east:  float = Query(...),
    west:  float = Query(...),
    polygon: str | None = Query(None),
):
    """Return aggregate EUBUCCO stats for every building whose centroid is inside
    the bbox. If a ``polygon`` (lon,lat;… vertices) is given, the bbox is used as
    a fast prefilter and buildings are then refined to those inside the polygon,
    so an arbitrary drawn shape selects exactly its buildings."""
    from collections import Counter
    poly = _parse_polygon(polygon)
    all_buildings = _get_buildings_list()
    matched: list = []
    for b in all_buildings:
        coords = b.get("coordinates") or []
        c_lat, c_lon = _polygon_centroid(coords)
        if c_lat == 0.0 and c_lon == 0.0:
            continue
        if south <= c_lat <= north and west <= c_lon <= east:
            if poly and not _point_in_poly(c_lon, c_lat, poly):
                continue
            matched.append(b)

    count = len(matched)
    if count == 0:
        raise HTTPException(404, "No buildings found in bounding box")

    def cnt(key: str) -> int:
        return sum(1 for b in matched if b.get(key) is not None)

    def avg_field(key: str) -> float | None:
        vals = [b[key] for b in matched if b.get(key) is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    def common_val(key: str) -> str | None:
        vals = [b[key] for b in matched if b.get(key)]
        if not vals:
            return None
        return Counter(vals).most_common(1)[0][0]

    footprints = [
        float(b["footprint_m2"]) if b.get("footprint_m2") and b["footprint_m2"] > 0
        else (b["area"] / b["floors"] if b.get("area") and b.get("floors") and b["floors"] > 0 else None)
        for b in matched
    ]
    footprints = [f for f in footprints if f is not None]
    yr_count = cnt("year")

    return {
        "count":          count,
        "with_height":    cnt("height"),
        "with_floors":    cnt("floors"),
        "with_year":      yr_count,
        "with_energy":    cnt("energy"),
        "with_epc":       sum(1 for b in matched if b.get("has_epc")),
        "with_use":       cnt("use_cat"),
        "with_footprint": len(footprints),
        "avg_height":     avg_field("height"),
        "avg_floors":     avg_field("floors"),
        "avg_year":       (round(sum(b["year"] for b in matched if b.get("year")) / yr_count)
                           if yr_count > 0 else None),
        "avg_energy":     avg_field("energy"),
        "avg_footprint":  round(sum(footprints) / len(footprints), 1) if footprints else None,
        "common_use":     common_val("use_cat"),
    }
_DISTRICTS_CACHE: dict | None = None


@app.get("/api/districts")
def list_districts(country: str = Query("se")):
    """List named neighborhoods (Gothenburg primärområden) with building counts.

    Powers the neighborhood-scale picker: the frontend matches the user's typed
    name against this list, then fetches that district's buildings via
    /api/buildings/bbox/list?district=<name>.
    """
    global _DISTRICTS_CACHE
    if country.lower() != "se":
        return {"country": country, "districts": []}
    if _DISTRICTS_CACHE is None:
        agg: dict[str, dict] = {}
        for b in _get_buildings_list():
            name = (b.get("primary_area") or "").strip()
            if not name:
                continue
            coords = b.get("coordinates") or []
            c_lat, c_lon = _polygon_centroid(coords)
            if c_lat == 0.0 and c_lon == 0.0:
                continue
            d = agg.setdefault(name, {"name": name, "count": 0, "lat_sum": 0.0, "lon_sum": 0.0})
            d["count"] += 1
            d["lat_sum"] += c_lat
            d["lon_sum"] += c_lon
        districts = [
            {
                "name": d["name"],
                "count": d["count"],
                "lat": round(d["lat_sum"] / d["count"], 6),
                "lon": round(d["lon_sum"] / d["count"], 6),
            }
            for d in agg.values()
        ]
        districts.sort(key=lambda x: x["name"])
        _DISTRICTS_CACHE = {"country": "se", "districts": districts}
    return _DISTRICTS_CACHE


@app.get("/api/buildings/bbox/list")
def buildings_bbox_list(
    north: float | None = Query(None),
    south: float | None = Query(None),
    east:  float | None = Query(None),
    west:  float | None = Query(None),
    district: str | None = Query(None),
    polygon: str | None = Query(None),
):
    """Return individual building records, joined with Boplats rental data where available.

    Selection is by ``district`` name (Gothenburg primärområde), a bounding box
    (north/south/east/west), or — for an arbitrary drawn shape — a bbox plus a
    ``polygon`` (lon,lat;… vertices) which refines the bbox matches to those
    whose centroid falls inside the polygon.
    """
    import re, sqlite3, httpx
    from concurrent.futures import ThreadPoolExecutor, wait as fut_wait

    # ── Match buildings by district name or bbox (optionally polygon-refined) ─
    all_buildings = _get_buildings_list()
    matched: list[tuple] = []
    have_bbox = None not in (north, south, east, west)
    poly = _parse_polygon(polygon)
    if district:
        want = district.strip().casefold()
        for b in all_buildings:
            if (b.get("primary_area") or "").strip().casefold() != want:
                continue
            coords = b.get("coordinates") or []
            c_lat, c_lon = _polygon_centroid(coords)
            if c_lat == 0.0 and c_lon == 0.0:
                continue
            matched.append((b, round(c_lat, 6), round(c_lon, 6)))
        if not matched:
            raise HTTPException(404, f"No buildings found in district '{district}'")
    elif have_bbox:
        for b in all_buildings:
            coords = b.get("coordinates") or []
            c_lat, c_lon = _polygon_centroid(coords)
            if c_lat == 0.0 and c_lon == 0.0:
                continue
            if south <= c_lat <= north and west <= c_lon <= east:
                if poly and not _point_in_poly(c_lon, c_lat, poly):
                    continue
                matched.append((b, round(c_lat, 6), round(c_lon, 6)))
        if not matched:
            raise HTTPException(404, "No buildings found in the drawn area" if poly else "No buildings found in bounding box")
    else:
        raise HTTPException(422, "Provide either a bounding box or a district name")

    # ── Load Boplats rental data (keyed by normalised address) ───────────────
    def _norm(s: str) -> str:
        s = s.strip().lower()
        s = re.sub(r"\s+", " ", s)
        s = re.sub(r"\s+\d{4}$", "", s)
        return s

    boplats_lookup: dict[str, list] = {}
    boplats_path = PROJECT_ROOT / "boplats_apartments.db"
    if boplats_path.exists():
        try:
            conn = sqlite3.connect(str(boplats_path))
            rows = conn.execute(
                "SELECT address, rooms, size_m2, rent_sek, floor_current FROM apartments WHERE address IS NOT NULL"
            ).fetchall()
            conn.close()
            for addr, rooms, size_m2, rent_sek, floor_cur in rows:
                key = _norm(addr)
                boplats_lookup.setdefault(key, []).append({
                    "rooms": rooms,
                    "size_m2": size_m2,
                    "rent_sek": rent_sek,
                    "floor": floor_cur,
                    "rent_per_m2": round(rent_sek / size_m2, 1) if rent_sek and size_m2 else None,
                })
        except Exception:
            pass

    # ── Build result rows ────────────────────────────────────────────────────
    result = []
    for b, lat, lon in matched:
        addr = b.get("address") or ""
        bp = boplats_lookup.get(_norm(addr), [])

        def _avg(vals: list) -> float | None:
            clean = [v for v in vals if v is not None]
            return round(sum(clean) / len(clean), 1) if clean else None

        # Derive TABULA period from year when missing, then derive U-values
        period = b.get("tabula_period") or _period_from_year(b.get("year"))
        u_wall = b.get("tabula_u_wall")
        u_win  = b.get("tabula_u_win")
        if u_wall is None or u_win is None:
            d_w, d_v = _derive_u_values(b.get("use_cat"), period)
            if u_wall is None:
                u_wall = d_w
            if u_win is None:
                u_win = d_v

        result.append({
            "address":              addr,
            "all_addresses":        b.get("all_addresses"),   # all entrances (one EPC can list several)
            "cadastral_id":         addr if addr and _CADASTRAL_RE.match(addr.strip()) else None,
            "lat":                  lat,
            "lon":                  lon,
            "building_use":         b.get("use_cat"),
            # Named neighbourhood (Gothenburg primärområde) this building sits in —
            # lets a drawn rectangle/polygon report WHERE it is, not just its centre.
            "primary_area":         b.get("primary_area"),
            "year_built":           b.get("year"),
            "height_m":             b.get("height"),
            "floors":               b.get("floors"),
            "atemp":                b.get("area"),   # EPC heated floor area (ATEMP)
            "footprint_m2":         b.get("footprint_m2"),
            "energy_kwh_m2":        b.get("energy"),
            "epc_class":            b.get("eclass"),
            "has_epc":              b.get("has_epc"),
            "tabula_period":        period,
            "u_wall":               u_wall,
            "u_roof":               b.get("tabula_u_roof"),
            "u_window":             u_win,
            "boplats_listings":     len(bp) if bp else None,
            "boplats_avg_rent_sek": _avg([r["rent_sek"] for r in bp]),
            "boplats_avg_rent_per_m2_sek": _avg([r["rent_per_m2"] for r in bp]),
        })

    # ── Reverse geocode cadastral / missing addresses via Nominatim ──────────
    def _needs_geocode(addr: str) -> bool:
        if not addr:
            return True
        return bool(_CADASTRAL_RE.match(addr.strip()))

    # Skip reverse-geocoding for district/bulk fetches — a neighborhood can hold
    # hundreds of cadastral-only parcels and 120 Nominatim lookups would add ~25s.
    # EPC-matched rows already carry street addresses; the rest keep their id.
    needs = [] if district else [
        (i, row["lat"], row["lon"]) for i, row in enumerate(result) if _needs_geocode(row["address"])
    ]
    needs = needs[:120]  # cap to keep response time bounded

    if needs:
        def _geocode_one(lat: float, lon: float) -> str | None:
            key = (round(lat, 4), round(lon, 4))
            if key in _REVERSE_GEOCODE_CACHE:
                return _REVERSE_GEOCODE_CACHE[key]
            try:
                r = httpx.get(
                    "https://nominatim.openstreetmap.org/reverse",
                    params={"lat": lat, "lon": lon, "format": "json"},
                    headers={"User-Agent": "ProjectPlanningGuide/0.1"},
                    timeout=4.0,
                )
                if r.status_code == 200:
                    a = r.json().get("address", {})
                    road  = (a.get("road") or a.get("pedestrian") or a.get("footway")
                             or a.get("path") or a.get("cycleway")
                             or a.get("neighbourhood") or a.get("suburb")
                             or a.get("quarter") or a.get("hamlet"))
                    house = a.get("house_number")
                    if road:
                        resolved = f"{road} {house}".strip() if house else road
                        _REVERSE_GEOCODE_CACHE[key] = resolved
                        return resolved
            except Exception:
                pass
            _REVERSE_GEOCODE_CACHE[key] = None
            return None

        with ThreadPoolExecutor(max_workers=5) as ex:
            futures = {ex.submit(_geocode_one, lat, lon): i for i, lat, lon in needs}
            done, _ = fut_wait(list(futures.keys()), timeout=15)
        for f in done:
            idx = futures[f]
            try:
                geo_addr = f.result()
                if geo_addr:
                    result[idx]["address"] = geo_addr
            except Exception:
                pass

    # ── Deduplicate by street address ─────────────────────────────────────────
    # EUBUCCO can include multiple geometries per address (main + komplement/annex).
    # Collapse them into a single row per address so EPC/year/energy aren't hidden
    # on a "secondary" annex row. Cadastral-only rows are kept as-is (each parcel
    # is distinct). For each address group we keep the richest row (EPC > most
    # populated fields > largest footprint) and sum the footprint across siblings.
    def _addr_key(row: dict) -> str | None:
        a = (row.get("address") or "").strip()
        if not a or _CADASTRAL_RE.match(a):
            return None
        return re.sub(r"\s+", " ", a.lower())

    def _score(row: dict) -> tuple:
        rich = sum(1 for k in (
            "year_built", "energy_kwh_m2", "epc_class", "tabula_period",
            "u_wall", "u_roof", "u_window",
        ) if row.get(k) is not None)
        return (1 if row.get("has_epc") else 0, rich, row.get("footprint_m2") or 0)

    groups: dict[str, list[dict]] = {}
    deduped: list[dict] = []
    for row in result:
        key = _addr_key(row)
        if key is None:
            deduped.append(row)
        else:
            groups.setdefault(key, []).append(row)
    for key, rows in groups.items():
        rows.sort(key=_score, reverse=True)
        primary = rows[0]
        if len(rows) > 1:
            total_fp = sum((r.get("footprint_m2") or 0) for r in rows)
            if total_fp:
                primary["footprint_m2"] = round(total_fp, 1)
            # Inherit any missing data field from siblings — EPC is often only
            # attached to one geometry of a multi-part property; if any sibling
            # has it, surface it on the kept row.
            for field in (
                "year_built", "energy_kwh_m2", "epc_class", "has_epc",
                "tabula_period", "u_wall", "u_roof", "u_window",
                "building_use",
                "boplats_listings", "boplats_avg_rent_sek",
                "boplats_avg_rent_per_m2_sek",
            ):
                if primary.get(field) in (None, False):
                    for sib in rows[1:]:
                        v = sib.get(field)
                        if v not in (None, False):
                            primary[field] = v
                            break
        # Re-derive period + U-values on the merged row in case the primary's
        # raw EUBUCCO record had use_cat=komplement (which yields None U-values)
        # but a sibling provides the real residential use.
        if not primary.get("tabula_period"):
            primary["tabula_period"] = _period_from_year(primary.get("year_built"))
        if primary.get("u_wall") is None or primary.get("u_window") is None:
            d_w, d_v = _derive_u_values(primary.get("building_use"), primary.get("tabula_period"))
            if primary.get("u_wall") is None:
                primary["u_wall"] = d_w
            if primary.get("u_window") is None:
                primary["u_window"] = d_v
        deduped.append(primary)

    # ── Spatial sibling pass ────────────────────────────────────────────────
    # Some EUBUCCO geometries have no address and no per-geometry year/EPC even
    # though a building <40 m away (same property complex) is fully populated.
    # For each row missing data, find the nearest fully-populated residential
    # neighbor and inherit address (if blank), year, period, U-values and EPC.
    _RESIDENTIAL = {"bostad_enfamilj", "bostad_flerfamilj"}
    rich_neighbors = [
        r for r in deduped
        if r.get("year_built") is not None
        and r.get("building_use") in _RESIDENTIAL
        and r.get("address")
        and not _CADASTRAL_RE.match((r.get("address") or "").strip())
    ]
    def _street_key(addr: str | None) -> str | None:
        if not addr: return None
        s = addr.strip().lower()
        if _CADASTRAL_RE.match(s): return None
        # strip trailing house number (e.g. "Mandolingatan 80" -> "mandolingatan")
        m = re.match(r"^([^0-9,]+)", s)
        return m.group(1).strip() if m else None

    for row in deduped:
        # skip if already complete
        if row.get("year_built") is not None and row.get("address") and not _CADASTRAL_RE.match(row["address"].strip()):
            continue
        my_street = _street_key(row.get("address"))
        nearest = None
        nearest_d = 9e9
        for n in rich_neighbors:
            if n is row:
                continue
            d = _haversine_m(row["lat"], row["lon"], n["lat"], n["lon"])
            # accept up to 40 m for any neighbor, or up to 120 m if same street
            n_street = _street_key(n.get("address"))
            limit = 120 if (my_street and n_street and my_street == n_street) else 40
            if d <= limit and d < nearest_d:
                nearest_d, nearest = d, n
        if nearest is None:
            continue
        # Always inherit address if ours is empty/cadastral
        if not row.get("address") or _CADASTRAL_RE.match((row.get("address") or "").strip()):
            row["address"] = nearest["address"]
            row["cadastral_id"] = None
        # Only inherit data fields when the row itself is residential — we don't
        # want to claim a komplement/samhalle has the neighbor's EPC.
        if row.get("building_use") in _RESIDENTIAL:
            # Year, TABULA period and derived U-values: safe to inherit from a
            # nearby/same-street neighbor (same construction era). EPC and
            # energy are property-specific and are NOT inherited spatially.
            for field in ("year_built", "tabula_period", "u_wall", "u_roof", "u_window"):
                if row.get(field) in (None, False) and nearest.get(field) not in (None, False):
                    row[field] = nearest[field]
            # Re-derive period + U-values if still missing
            if not row.get("tabula_period"):
                row["tabula_period"] = _period_from_year(row.get("year_built"))
            if row.get("u_wall") is None or row.get("u_window") is None:
                d_w, d_v = _derive_u_values(row.get("building_use"), row.get("tabula_period"))
                if row.get("u_wall") is None:
                    row["u_wall"] = d_w
                if row.get("u_window") is None:
                    row["u_window"] = d_v

    return deduped


# ── Boverket materials ───────────────────────────────────────────────────────
@app.get("/api/boverket/materials")
def boverket_materials(component: str = Query(...)):
    try:
        from utils.boverket_api import fetch_materials
    except ImportError:
        raise HTTPException(501, "Boverket module not available")

    return fetch_materials(component)


# ── WWR estimation via vision LLM ────────────────────────────────────────────
from pydantic import BaseModel
from typing import Any, Optional
import base64


class WWRRequest(BaseModel):
    image_base64: str
    direction: str = "N"
    building_info: Optional[dict[str, Any]] = None


@app.post("/api/estimate-wwr")
async def estimate_wwr(req: WWRRequest):
    """
    Estimate Window-to-Wall Ratio from a base64-encoded facade image.
    Priority: Claude (ANTHROPIC_API_KEY) → OpenAI GPT-4o (OPENAI_API_KEY) → heuristic.
    """
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()

    # ── Shared prompt ─────────────────────────────────────────────────────────
    def build_prompt() -> str:
        p = (
            "You are an architectural analyst. I am showing you a photograph of a "
            "building facade captured from a 3D city model viewer.\n\n"
            "Task 1: Estimate the Window-to-Wall Ratio (WWR) — the percentage of the "
            "visible facade area that is glazed (windows, glass doors, curtain wall, "
            "etc.).\n"
            "Task 2: Count visible balconies attached to the dominant building in "
            "this single facade image, and estimate their combined area in m² if "
            "you can judge scale (null if you can't).\n\n"
            "Instructions:\n"
            "- Focus only on the dominant building in the frame.\n"
            "- Count window openings relative to total wall area.\n"
            "- If the image is unclear or shows only ground/sky, give your best "
            "estimate based on the building type and era, and 0 balconies.\n\n"
            "Building info: "
        )
        if req.building_info:
            info = req.building_info
            p += (
                f"Address: {info.get('address', 'N/A')}, "
                f"Year: {info.get('year', 'N/A')}, "
                f"Use: {info.get('use', 'N/A')}, "
                f"Energy class: {info.get('eclass', 'N/A')}. "
            )
        p += (
            f"Facade direction: {req.direction}.\n\n"
            "Respond with ONLY a JSON object, no other text:\n"
            '{"wwr": <integer 0-100>, "confidence": "low"|"medium"|"high", '
            '"notes": "<one sentence>", "balcony_count": <integer >=0>, '
            '"balcony_area_m2": <number or null>}'
        )
        return p

    import httpx, re as _re

    # ── Claude (Anthropic) ────────────────────────────────────────────────────
    if anthropic_key:
        try:
            payload = {
                "model": "claude-sonnet-4-5",
                "max_tokens": 256,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": req.image_base64,
                                },
                            },
                            {"type": "text", "text": build_prompt()},
                        ],
                    }
                ],
            }
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": anthropic_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json=payload,
                )
                r.raise_for_status()
                content = r.json()["content"][0]["text"].strip()
                match = _re.search(r'\{.*\}', content, _re.DOTALL)
                if match:
                    parsed = json.loads(match.group())
                    return {
                        "wwr": int(parsed.get("wwr", 25)),
                        "confidence": parsed.get("confidence", "medium"),
                        "notes": parsed.get("notes", ""),
                        "balcony_count": int(parsed.get("balcony_count", 0) or 0),
                        "balcony_area_m2": parsed.get("balcony_area_m2"),
                        "source": "claude-sonnet-4-5-vision",
                    }
        except Exception as exc:
            print(f"[estimate-wwr] Anthropic call failed: {exc}")

    # ── OpenAI GPT-4.1 ──────────────────────────────────────────────────────
    if openai_key:
        payload = {
            "model": "gpt-4.1",
            "max_tokens": 150,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": build_prompt()},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{req.image_base64}",
                                "detail": "high",
                            },
                        },
                    ],
                }
            ],
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {openai_key}"},
                    json=payload,
                )
                r.raise_for_status()
                content = r.json()["choices"][0]["message"]["content"].strip()
                match = _re.search(r'\{.*\}', content, _re.DOTALL)
                if match:
                    parsed = json.loads(match.group())
                    return {
                        "wwr": int(parsed.get("wwr", 25)),
                        "confidence": parsed.get("confidence", "medium"),
                        "notes": parsed.get("notes", ""),
                        "balcony_count": int(parsed.get("balcony_count", 0) or 0),
                        "balcony_area_m2": parsed.get("balcony_area_m2"),
                        "source": "gpt-4.1-vision",
                    }
        except Exception as exc:
            # Fall through to heuristic on any error
            print(f"[estimate-wwr] OpenAI call failed: {exc}")

    # ── Heuristic fallback (no API key or LLM error) ──────────────────────────
    info = req.building_info or {}
    use = info.get("use", "ovrigt")
    year = info.get("year") or 1980
    eclass = info.get("eclass", "D")

    # Base WWR by use type
    use_base = {
        "bostad_enfamilj": 18, "bostad_flerfamilj": 28,
        "verksamhet": 45, "industri": 10, "samhalle": 38,
        "komplement": 5, "ovrigt": 22,
    }.get(use, 22)

    # Era adjustment
    if year < 1960:
        era_adj = -3
    elif year < 1976:
        era_adj = 0
    elif year < 1996:
        era_adj = +2
    else:
        era_adj = +5

    eclass_adj = {"A": +5, "B": +3, "C": +1, "D": 0, "E": -1, "F": -2, "G": -3}.get(
        eclass or "D", 0
    )

    wwr = max(5, min(75, use_base + era_adj + eclass_adj))
    return {
        "wwr": wwr,
        "confidence": "low",
        "notes": "Heuristic estimate (no OPENAI_API_KEY configured).",
        # No reliable heuristic exists for balcony count/area from building
        # metadata alone - explicit null/zero rather than a guess.
        "balcony_count": 0,
        "balcony_area_m2": None,
        "source": "heuristic",
    }


# ── Västtrafik transit API proxy ─────────────────────────────────────────────
#
# Register an application at https://developer.vasttrafik.se/ and put the
# credentials in the project's .env file (loaded at startup):
#
#   VASTTRAFIK_CLIENT_ID=...
#   VASTTRAFIK_CLIENT_SECRET=...
#
# .env is gitignored — never paste live credentials into this file.
#
#   Uses two APIs:
#     • Geografi v3        (open, no auth required for stop area geography)
#     • Planera Resa v4    (requires OAuth2 client-credentials token)
#
# OAuth2 token endpoint:
#   POST https://ext-api.vasttrafik.se/auth/connect/token
#   Content-Type: application/x-www-form-urlencoded
#   Body: grant_type=client_credentials&client_id=…&client_secret=…
# ---------------------------------------------------------------------------

# Read directly (not via os.environ.setdefault, which caches an empty string
# across --reload restarts).
_VT_CLIENT_ID     = os.environ.get("VASTTRAFIK_CLIENT_ID", "")
_VT_CLIENT_SECRET = os.environ.get("VASTTRAFIK_CLIENT_SECRET", "")

_VT_AUTH_URL  = "https://ext-api.vasttrafik.se/token"
_VT_GEO_URL   = "https://ext-api.vasttrafik.se/geo/v3"
_VT_PR_URL    = "https://ext-api.vasttrafik.se/pr/v4"

# In-memory token cache  { "access_token": str, "expires_at": float }
_vt_token_cache: dict = {}

import time as _time

async def _vt_get_token() -> str:
    """Return a valid Bearer token, fetching a new one if expired."""
    client_id     = _VT_CLIENT_ID.strip()
    client_secret = _VT_CLIENT_SECRET.strip()
    if not client_id or not client_secret:
        raise HTTPException(503, "Västtrafik credentials not configured. Register an app at "
                                 "developer.vasttrafik.se, then add VASTTRAFIK_CLIENT_ID and "
                                 "VASTTRAFIK_CLIENT_SECRET to the project's .env file and restart "
                                 "the backend.")

    now = _time.time()
    cached = _vt_token_cache
    if cached.get("access_token") and cached.get("expires_at", 0) > now + 30:
        return cached["access_token"]

    import httpx, base64 as _b64
    _creds_b64 = _b64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(
            _VT_AUTH_URL,
            data={"grant_type": "client_credentials"},
            headers={
                "Content-Type":  "application/x-www-form-urlencoded",
                "Authorization": f"Basic {_creds_b64}",
            },
        )
    if r.status_code != 200:
        raise HTTPException(502, f"Västtrafik auth failed: {r.status_code} {r.text[:200]}")

    body = r.json()
    _vt_token_cache["access_token"] = body["access_token"]
    _vt_token_cache["expires_at"]   = now + int(body.get("expires_in", 3600))
    return _vt_token_cache["access_token"]


# Gothenburg central bounding box (used as default filter)
_GBG_BBOX = dict(south=57.60, north=57.80, west=11.85, east=12.10)


@app.get("/api/vasttrafik/stops")
async def vt_stops(
    south: float = Query(_GBG_BBOX["south"]),
    north: float = Query(_GBG_BBOX["north"]),
    west:  float = Query(_GBG_BBOX["west"]),
    east:  float = Query(_GBG_BBOX["east"]),
):
    """
    Return Västtrafik stop areas within the given bbox.
    Uses Planera Resa v4 GET /stop-areas  (flat array: gid, name, lat, long).
    """
    import httpx
    token = await _vt_get_token()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(
            f"{_VT_PR_URL}/stop-areas",
            headers={"Authorization": f"Bearer {token}"},
        )
    if r.status_code != 200:
        raise HTTPException(502, f"Västtrafik /stop-areas failed: {r.status_code}")

    all_stops = r.json()   # flat list: [{gid, name, lat, long}, ...]
    filtered = []
    for s in all_stops:
        lat = s.get("lat") or s.get("latitude")
        lon = s.get("long") or s.get("lon") or s.get("longitude")
        if lat is None or lon is None:
            continue
        lat, lon = float(lat), float(lon)
        if south <= lat <= north and west <= lon <= east:
            filtered.append({
                "gid":  s.get("gid"),
                "name": s.get("name"),
                "lat":  round(lat, 6),
                "lon":  round(lon, 6),
            })

    return {"stops": filtered, "count": len(filtered)}


@app.get("/api/vasttrafik/positions")
async def vt_positions(
    south: float = Query(_GBG_BBOX["south"]),
    north: float = Query(_GBG_BBOX["north"]),
    west:  float = Query(_GBG_BBOX["west"]),
    east:  float = Query(_GBG_BBOX["east"]),
):
    """
    Return real-time vehicle positions within the given bbox.

    Uses Planera Resa v4 GET /positions with bounding-box query parameters.
    Call this every ~15 s for live updates.
    """
    import httpx
    token = await _vt_get_token()
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{_VT_PR_URL}/positions",
            headers={"Authorization": f"Bearer {token}"},
            params={
                "lowerLeftLat":  south,
                "lowerLeftLong": west,
                "upperRightLat": north,
                "upperRightLong": east,
            },
        )
    if r.status_code != 200:
        raise HTTPException(502, f"Västtrafik /positions failed: {r.status_code}")

    data = r.json()
    # Response: { "serviceJourneys": [ { "line": { "shortName": "16", "transportMode": "tram" },
    #                                     "lat": 57.7, "long": 11.97, "bearing": 90, ... } ] }
    # /positions returns a flat list directly
    vehicles = data if isinstance(data, list) else data.get("serviceJourneys", data.get("results", []))

    result = []
    for v in vehicles:
        lat = v.get("lat") or v.get("latitude")
        lon = v.get("long") or v.get("lon") or v.get("longitude")
        if lat is None or lon is None:
            continue
        line_info = v.get("line") or {}
        bg = line_info.get("backgroundColor") or line_info.get("bgColor")
        fg = line_info.get("foregroundColor") or line_info.get("fgColor")
        result.append({
            "lat":              round(float(lat), 6),
            "lon":              round(float(lon), 6),
            "bearing":          v.get("bearing"),
            "line":             line_info.get("shortName") or line_info.get("name", ""),
            "transportMode":    line_info.get("transportMode", "bus"),
            "bgColor":          ("#" + bg.lstrip("#")) if bg else None,
            "fgColor":          ("#" + fg.lstrip("#")) if fg else None,
            "direction":        v.get("directionName") or v.get("direction") or "",
            "detailsReference": v.get("detailsReference") or v.get("journeyRef") or "",
        })

    return {"vehicles": result, "count": len(result)}


@app.get("/api/vasttrafik/journey/{details_reference:path}")
async def vt_journey_calls(details_reference: str):
    """
    Return the remaining stops (calls) for a live journey, using its detailsReference.
    Used to show "next stop in X min" on vehicle hover.
    """
    import httpx
    from datetime import datetime, timezone
    token = await _vt_get_token()
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{_VT_PR_URL}/service-journeys/{details_reference}/calls",
            headers={"Authorization": f"Bearer {token}"},
        )
    if r.status_code == 404:
        return {"calls": []}
    if r.status_code != 200:
        raise HTTPException(502, f"Västtrafik /calls failed: {r.status_code}")

    data = r.json()
    raw_calls = data.get("calls", data) if isinstance(data, dict) else data
    now = datetime.now(timezone.utc)

    calls_out = []
    for c in raw_calls:
        stop = c.get("stopPoint") or c.get("stop") or {}
        stop_name = stop.get("name") or c.get("name") or ""
        # Try estimated arrival, fall back to planned
        arr_time = c.get("estimatedArrivalTime") or c.get("plannedArrivalTime") or \
                   c.get("estimatedDepartureTime") or c.get("plannedDepartureTime") or ""
        minutes_away = None
        if arr_time:
            try:
                t = datetime.fromisoformat(arr_time.replace("Z", "+00:00"))
                minutes_away = round((t - now).total_seconds() / 60)
            except Exception:
                pass
        calls_out.append({
            "stopName":    stop_name,
            "minutesAway": minutes_away,
            "time":        arr_time,
            "passed":      c.get("isCancelled", False) or (minutes_away is not None and minutes_away < -2),
        })

    # Only return upcoming stops (not yet passed)
    upcoming = [c for c in calls_out if not c["passed"] and (c["minutesAway"] is None or c["minutesAway"] >= -1)]
    return {"calls": upcoming[:10]}


@app.get("/api/vasttrafik/departures/{gid}")
async def vt_departures(
    gid: str,
    limit: int = Query(8, ge=1, le=20),
):
    """
    Return next departures from a stop area.

    Uses Planera Resa v4 GET /stop-areas/{gid}/departures.
    """
    import httpx
    token = await _vt_get_token()
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{_VT_PR_URL}/stop-areas/{gid}/departures",
            headers={"Authorization": f"Bearer {token}"},
            params={"limit": limit, "includeOccupancy": False},
        )
    if r.status_code != 200:
        raise HTTPException(502, f"Västtrafik /departures failed: {r.status_code}")

    data = r.json()
    # Response: { "departures": [ { "serviceJourney": { "line": { "shortName": "16",
    #             "backgroundColor": "#...", "foregroundColor": "#..." } },
    #             "stopPoint": { "name": "..." },
    #             "plannedTime": "2026-05-25T14:30:00",
    #             "estimatedTime": "2026-05-25T14:31:00",
    #             "isCancelled": false } ] }
    raw = data.get("departures", data.get("results", []))

    departures = []
    for d in raw:
        sj   = d.get("serviceJourney") or {}
        line = sj.get("line") or {}
        dep  = {
            "line":          line.get("shortName") or line.get("name", ""),
            "destination":   (sj.get("directionDetails") or {}).get("shortDescription")
                             or d.get("direction", ""),
            "plannedTime":   d.get("plannedTime", ""),
            "estimatedTime": d.get("estimatedTime") or d.get("plannedTime", ""),
            "isCancelled":   d.get("isCancelled", False),
            "transportMode": line.get("transportMode", "bus"),
            "bgColor":       line.get("backgroundColor", "#1d4ed8"),
            "fgColor":       line.get("foregroundColor", "#ffffff"),
        }
        departures.append(dep)

    return {"gid": gid, "departures": departures}


@app.get("/api/vasttrafik/disruptions")
async def vt_disruptions():
    """
    Return current traffic disruptions from Störning v1.
    Uses GET /ts/v1/traffic-situations.
    """
    import httpx
    token = await _vt_get_token()
    _VT_TS_URL = "https://ext-api.vasttrafik.se/ts/v1"
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{_VT_TS_URL}/traffic-situations",
            headers={"Authorization": f"Bearer {token}"},
        )
    if r.status_code != 200:
        raise HTTPException(502, f"Västtrafik /traffic-situations failed: {r.status_code}")

    raw = r.json()   # list of TrafficSituationApiModel
    result = []
    for d in raw:
        affected_lines = []
        for ln in (d.get("affectedLines") or []):
            affected_lines.append({
                "designation": ln.get("designation", ""),
                "transportMode": ln.get("defaultTransportModeCode", "bus"),
                "bgColor": ln.get("backgroundColor", "1d4ed8"),
                "fgColor": ln.get("textColor", "ffffff"),
            })
        # gather unique stop-area gids that may be affected
        stop_gids = list({sp.get("stopAreaGid") for sp in (d.get("affectedStopPoints") or []) if sp.get("stopAreaGid")})
        result.append({
            "id":          d.get("situationNumber", ""),
            "severity":    d.get("severity", "slight"),
            "title":       d.get("title", ""),
            "description": d.get("description", ""),
            "startTime":   d.get("startTime", ""),
            "endTime":     d.get("endTime", ""),
            "lines":       affected_lines,
            "stopGids":    stop_gids,
        })
    return {"disruptions": result, "count": len(result)}


@app.get("/api/vasttrafik/parking")
async def vt_parking():
    """
    Return all park-and-ride lots from SPP v3.
    Each ParkingArea may contain multiple ParkingLots (each with lat/lon).
    """
    import httpx
    token = await _vt_get_token()
    _VT_SPP_URL = "https://ext-api.vasttrafik.se/spp/v3"
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(
            f"{_VT_SPP_URL}/parkings",
            headers={"Authorization": f"Bearer {token}"},
        )
    if r.status_code != 200:
        raise HTTPException(502, f"Västtrafik /parkings failed: {r.status_code}")

    raw = r.json()   # list of ParkingArea {Id, Name, StopAreas, ParkingLots}
    lots = []
    for area in raw:
        area_id   = area.get("Id")
        area_name = area.get("Name", "")
        for lot in (area.get("ParkingLots") or []):
            lat = lot.get("Lat")
            lon = lot.get("Lon")
            if lat is None or lon is None:
                continue
            lots.append({
                "areaId":    area_id,
                "areaName":  area_name,
                "lotId":     lot.get("Id"),
                "name":      lot.get("Name", area_name),
                "lat":       round(float(lat), 6),
                "lon":       round(float(lon), 6),
                "capacity":  lot.get("TotalCapacity", 0),
                "hasBarrier": lot.get("IsRestrictedByBarrier", False),
                "type":      (lot.get("ParkingType") or {}).get("Name", "CARPARK"),
            })
    return {"lots": lots, "count": len(lots)}


# ── OSM road network ─────────────────────────────────────────────────────────

_OSM_ROAD_CACHE: dict = {}   # key: rounded bbox tuple → GeoJSON FeatureCollection

@app.get("/api/osm/roads")
async def osm_roads(
    south: float = Query(57.68, description="Bounding box south lat"),
    north: float = Query(57.73, description="Bounding box north lat"),
    west:  float = Query(11.93, description="Bounding box west lon"),
    east:  float = Query(12.00, description="Bounding box east lon"),
):
    """
    Return OSM road network as GeoJSON LineString features for the given bbox.
    Queries the public Overpass API (highway=*) and returns a minimal GeoJSON
    FeatureCollection suitable for Cesium polyline rendering.
    Results are cached in memory per bbox (rounded to 3 dp).
    """
    # Round bbox to 3 dp for cache key
    key = (round(south, 3), round(north, 3), round(west, 3), round(east, 3))
    if key in _OSM_ROAD_CACHE:
        return _OSM_ROAD_CACHE[key]

    # Reuse the resilient highway fetcher (mirror fallback + User-Agent + shared
    # bbox cache) so this endpoint isn't 406-rate-limited on the main instance.
    nodes, ways = await _fetch_osm_highways(south, north, west, east)

    # Road type → display priority / colour hint
    ROAD_CLASS = {
        "motorway": "major", "trunk": "major", "primary": "primary",
        "secondary": "secondary", "tertiary": "secondary",
        "residential": "local", "living_street": "local", "unclassified": "local",
        "service": "service", "pedestrian": "pedestrian",
        "cycleway": "cycling", "footway": "pedestrian", "path": "pedestrian",
    }

    features = []
    for elem in ways:
        coords = [nodes[n] for n in elem.get("nodes", []) if n in nodes]
        if len(coords) < 2:
            continue
        tags = elem.get("tags", {})
        hw = tags.get("highway", "unclassified")
        road_class = ROAD_CLASS.get(hw, "local")
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": {
                "highway":    hw,
                "road_class": road_class,
                "name":       tags.get("name", ""),
                "oneway":     tags.get("oneway", "no") == "yes",
                "maxspeed":   tags.get("maxspeed", ""),
            },
        })

    result = {"type": "FeatureCollection", "features": features, "count": len(features)}
    _OSM_ROAD_CACHE[key] = result
    return result


# ── OSM green spaces (city-agnostic) ──────────────────────────────────────────
# Same shape as the pre-baked gothenburg_greenspaces.json ({lon,lat,type,area,
# name}) but fetched live from Overpass for any bbox, so the Urban Analysis
# green-index / green-accessibility layers work for UK cities too (real OSM data,
# not Gothenburg's). Cached per rounded bbox.
_OSM_GREEN_CACHE: dict = {}


@app.get("/api/urban/green-areas")
async def osm_green_areas(
    south: float = Query(..., description="Bounding box south lat"),
    north: float = Query(..., description="Bounding box north lat"),
    west:  float = Query(..., description="Bounding box west lon"),
    east:  float = Query(..., description="Bounding box east lon"),
):
    import httpx

    key = (round(south, 3), round(north, 3), round(west, 3), round(east, 3))
    if key in _OSM_GREEN_CACHE:
        return _OSM_GREEN_CACHE[key]

    query = f"""
[out:json][timeout:30];
(
  way["leisure"~"^(park|garden|nature_reserve|recreation_ground)$"]({south},{west},{north},{east});
  way["landuse"~"^(recreation_ground|grass|forest|meadow|village_green|greenfield)$"]({south},{west},{north},{east});
  way["natural"~"^(wood|scrub|grassland|heath)$"]({south},{west},{north},{east});
);
out geom;
"""
    mirrors = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    ]
    headers = {"User-Agent": "PPG-UrbanAnalysis/1.0 (green-index; saraabo@chalmers.se)"}
    osm = None
    last = None
    async with httpx.AsyncClient(timeout=45, headers=headers) as client:
        for url in mirrors:
            try:
                r = await client.post(url, data={"data": query})
            except Exception as exc:
                last = str(exc); continue
            if r.status_code == 200:
                osm = r.json(); break
            last = f"{url.split('/')[2]} → {r.status_code}"
    if osm is None:
        raise HTTPException(502, f"Overpass unavailable (last: {last})")

    out = []
    for elem in osm.get("elements", []):
        geom = elem.get("geometry")
        if not geom or len(geom) < 3:
            continue
        ring = [[g["lon"], g["lat"]] for g in geom]
        area = _shoelace_m2([ring])
        if not area or area < 100:
            continue
        c_lat, c_lon = _polygon_centroid([ring])
        tags = elem.get("tags", {})
        # First matching green tag → "key=value" type string (matches MIN_AREA keys)
        tag_type = ""
        for k in ("leisure", "landuse", "natural"):
            if k in tags:
                tag_type = f"{k}={tags[k]}"; break
        out.append({
            "lon": round(c_lon, 6), "lat": round(c_lat, 6),
            "type": tag_type, "area": round(area), "name": tags.get("name", ""),
        })

    _OSM_GREEN_CACHE[key] = out
    return out


# ── Urban analysis · space syntax (spatial-network centrality) ────────────────
# Method A: pure-Python (networkx) space-syntax measures on the OSM street
# network. The compute lives in backend/space_syntax.py; this endpoint just
# fetches the bbox's highways and hands them over. The response is a GeoJSON
# FeatureCollection with a per-segment `value`/`value_norm` for the viewer to
# colour. Method B (SMoG's Pstalgo) can later replace the compute behind this
# same endpoint without changing the viewer.
_OSM_HW_CACHE: dict = {}   # rounded-bbox tuple → (nodes dict, way elements)


async def _fetch_osm_highways(south: float, north: float, west: float, east: float):
    """Fetch OSM highway ways + their nodes for a bbox; returns (nodes, ways) with
    the raw topology (shared node ids = intersections) the graph analysis needs."""
    import httpx
    key = (round(south, 3), round(north, 3), round(west, 3), round(east, 3))
    if key in _OSM_HW_CACHE:
        return _OSM_HW_CACHE[key]
    query = f"""
[out:json][timeout:25];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|service|pedestrian|cycleway|footway|path|living_street|unclassified)$"]
    ({south},{west},{north},{east});
);
(._;>;);
out body;
"""
    # The main overpass-api.de instance rate-limits hard (often 406/429); try it,
    # then fall back to public mirrors. A descriptive User-Agent is requested by
    # the Overpass usage policy and some instances reject requests without one.
    mirrors = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    ]
    headers = {"User-Agent": "PPG-UrbanAnalysis/1.0 (space-syntax; saraabo@chalmers.se)"}
    osm = None
    last = None
    async with httpx.AsyncClient(timeout=40, headers=headers) as client:
        for url in mirrors:
            try:
                r = await client.post(url, data={"data": query})
            except Exception as exc:
                last = str(exc); continue
            if r.status_code == 200:
                osm = r.json(); break
            last = f"{url.split('/')[2]} → {r.status_code}"
    if osm is None:
        raise HTTPException(502, f"Overpass unavailable (last: {last})")
    nodes = {e["id"]: (e["lon"], e["lat"]) for e in osm.get("elements", []) if e.get("type") == "node"}
    ways = [e for e in osm.get("elements", []) if e.get("type") == "way"]
    _OSM_HW_CACHE[key] = (nodes, ways)
    return nodes, ways


@app.get("/api/urban/space-syntax")
async def urban_space_syntax(
    south: float = Query(...), north: float = Query(...),
    west: float = Query(...), east: float = Query(...),
    metric: str = Query("betweenness", description="betweenness | integration | reach"),
    radius: float = Query(1000.0, description="reach radius in metres (reach metric only)"),
):
    """Street-network centrality of the OSM highways in a bbox (method A: networkx).
    Colours the viewer's 'Urban analysis' layer. See backend/space_syntax.py."""
    import anyio
    from backend import space_syntax
    nodes, ways = await _fetch_osm_highways(south, north, west, east)
    if len(ways) > 9000:
        raise HTTPException(413, "Street network too large for this view — zoom in to run the analysis.")
    # networkx is CPU-bound; run it off the event loop so it can't block other requests.
    return await anyio.to_thread.run_sync(space_syntax.compute, nodes, ways, metric, radius)


@app.get("/api/vasttrafik/parking/{lot_id}/availability")
async def vt_parking_availability(lot_id: int):
    """
    Return live available spots for a parking lot from SPP v3.
    Uses GET /spp/v3/availableCapacity/{lotId}.
    """
    import httpx
    token = await _vt_get_token()
    _VT_SPP_URL = "https://ext-api.vasttrafik.se/spp/v3"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{_VT_SPP_URL}/availableCapacity/{lot_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
    if r.status_code == 404:
        return {"available": None, "total": None, "lotId": lot_id}
    if r.status_code != 200:
        raise HTTPException(502, f"Västtrafik /availableCapacity failed: {r.status_code}")

    # SPP v3 answers this endpoint with a BARE NUMBER (e.g. `54`), not an object.
    # Calling .get() on that raised AttributeError -> unhandled 500, which the
    # browser then reported as "backend not reachable" because an unhandled error
    # response carries no CORS headers. Accept either shape.
    try:
        data = r.json()
    except ValueError:
        data = r.text.strip()

    if isinstance(data, dict):
        return {
            "lotId":     lot_id,
            "available": data.get("AvailableCapacity") or data.get("available"),
            "total":     data.get("TotalCapacity")     or data.get("total"),
            "updated":   data.get("LastUpdated")       or data.get("updated"),
        }

    try:
        available = int(data)
    except (TypeError, ValueError):
        available = None
    # No total/updated is available in the scalar form — say so rather than
    # inventing one; the caller already knows the lot's capacity.
    return {"lotId": lot_id, "available": available, "total": None, "updated": None}


# ── Trafikverket live traffic proxy ──────────────────────────────────────────
#
# Register for a key at https://data.trafikverket.se/oauth2/Account/register and
# put it in the project's .env file (loaded at startup):
#
#   TRAFIKVERKET_API_KEY=...
#
# .env is gitignored — never paste live credentials into this file.
#
# The viewer used to read a static assets/trafikverket_data.json produced by
# trafikverket_scraper.py, so "live traffic" was only ever as fresh as the last
# manual scrape. This proxy serves the same shape straight from the API, with a
# short cache so panning the map doesn't hammer Trafikverket.
# ---------------------------------------------------------------------------

_TV_API_KEY = os.environ.get("TRAFIKVERKET_API_KEY", "")
_TV_API_URL = "https://api.trafikinfo.trafikverket.se/v2/data.json"
# Greater Gothenburg in SWEREF99TM: "min_e min_n, max_e max_n"
_TV_BOX = "270000 6380000, 360000 6445000"
_TV_CACHE: dict = {}          # { "data": {...}, "fetched_at": float }
_TV_CACHE_TTL = 60.0          # seconds — flow/camera data updates every few minutes


def _tv_lonlat(obj: dict):
    """First (lon, lat) from a WGS84 WKT POINT/LINESTRING, or (None, None)."""
    wkt = (obj.get("Geometry") or {}).get("WGS84")
    if not wkt:
        return None, None
    m = _re.search(r"(-?\d+\.\d+)\s+(-?\d+\.\d+)", wkt)
    return (float(m.group(1)), float(m.group(2))) if m else (None, None)


async def _tv_query(client, objecttype: str, schema: str, limit: int, includes: list[str]) -> list:
    inc = "".join(f"<INCLUDE>{i}</INCLUDE>" for i in includes)
    xml = (
        f'<REQUEST><LOGIN authenticationkey="{_TV_API_KEY}"/>'
        f'<QUERY objecttype="{objecttype}" schemaversion="{schema}" limit="{limit}">'
        f'<FILTER><WITHIN name="Geometry.SWEREF99TM" shape="box" value="{_TV_BOX}"/></FILTER>'
        f"{inc}</QUERY></REQUEST>"
    )
    r = await client.post(_TV_API_URL, content=xml.encode("utf-8"),
                          headers={"Content-Type": "text/xml"})
    if r.status_code != 200:
        # Never echo the request body back — it contains the API key.
        raise HTTPException(502, f"Trafikverket {objecttype} query failed: HTTP {r.status_code}")
    return (r.json().get("RESPONSE", {}).get("RESULT") or [{}])[0].get(objecttype, [])


@app.get("/api/trafikverket/data")
async def trafikverket_data(refresh: bool = False):
    """Live cameras / traffic flow / road conditions / parking for Gothenburg.

    Same JSON shape as the legacy assets/trafikverket_data.json so the viewer
    layer can read either source.
    """
    if not _TV_API_KEY.strip():
        raise HTTPException(503, "Trafikverket API key not configured. Register at "
                                 "data.trafikverket.se, then add TRAFIKVERKET_API_KEY to the "
                                 "project's .env file and restart the backend.")

    now = _time.time()
    if not refresh and _TV_CACHE.get("data") and now - _TV_CACHE.get("fetched_at", 0) < _TV_CACHE_TTL:
        cached = dict(_TV_CACHE["data"])
        cached["cached"] = True
        return cached

    import httpx
    async with httpx.AsyncClient(timeout=30) as client:
        cameras = await _tv_query(client, "Camera", "1", 1000, [
            "Id", "Name", "Type", "Description", "PhotoUrl", "PhotoTime", "Active",
            "Geometry.SWEREF99TM", "Geometry.WGS84"])
        flow = await _tv_query(client, "TrafficFlow", "1.4", 2000, [])
        conditions = await _tv_query(client, "RoadCondition", "1", 500, [
            "Id", "ConditionCode", "ConditionText", "LocationText", "RoadNumber",
            "Geometry.SWEREF99TM", "Geometry.WGS84"])
        parking = await _tv_query(client, "Parking", "1.4", 500, [
            "Id", "Name", "OpenStatus", "OperationStatus", "Description",
            "UsageSenario", "Geometry.SWEREF99TM", "Geometry.WGS84"])

    out = {"cameras": [], "traffic_flow": [], "road_conditions": [], "parking": []}

    for c in cameras:
        lon, lat = _tv_lonlat(c)
        if lon is None:
            continue
        out["cameras"].append({
            "id": c.get("Id"), "name": c.get("Name"), "type": c.get("Type"),
            "description": c.get("Description"), "photo_url": c.get("PhotoUrl"),
            "photo_time": c.get("PhotoTime"), "active": c.get("Active"),
            "lon": lon, "lat": lat,
        })

    for f in flow:
        lon, lat = _tv_lonlat(f)
        if lon is None:
            continue
        out["traffic_flow"].append({
            "id": f.get("Id"), "site_id": f.get("SiteId"),
            "vehicle_type": f.get("VehicleType"), "lane": f.get("SpecificLane"),
            "flow_rate": f.get("VehicleFlowRate"), "avg_speed": f.get("AverageVehicleSpeed"),
            "time": f.get("MeasurementTime"), "lon": lon, "lat": lat,
        })

    for c in conditions:
        lon, lat = _tv_lonlat(c)
        if lon is None:
            continue
        out["road_conditions"].append({
            "id": c.get("Id"), "condition_code": c.get("ConditionCode"),
            "condition_text": c.get("ConditionText"), "location": c.get("LocationText"),
            "road_number": c.get("RoadNumber"), "lon": lon, "lat": lat,
        })

    for p in parking:
        lon, lat = _tv_lonlat(p)
        if lon is None:
            continue
        out["parking"].append({
            "id": p.get("Id"), "name": p.get("Name"),
            "open_status": p.get("OpenStatus"), "operation_status": p.get("OperationStatus"),
            "description": p.get("Description"), "usage": p.get("UsageSenario"),
            "total_capacity": p.get("TotalCapacity"), "lon": lon, "lat": lat,
        })

    # Local import: this module binds `datetime` as the module (not the class)
    # further down, so import the class explicitly rather than depending on
    # which name happens to be bound at call time.
    from datetime import datetime as _dt
    out["fetched_at"] = _dt.now().isoformat(timespec="seconds")
    out["cached"] = False
    _TV_CACHE["data"] = out
    _TV_CACHE["fetched_at"] = now
    return out


# ── Facade defect detection (MBDD2025 Faster R-CNN) — CONNECTED ─────────────
# Proxies to the on-host torch service (tools/ml/facade_detect_service.py) via
# FACADE_MODEL_URL. In prod that is set to http://host.docker.internal:8020 in
# docker-compose.prod.yml (same host-gateway pattern as EPSM). If FACADE_MODEL_URL
# is unset OR the service is down, it falls back to a clearly-labelled placeholder
# ("model_connected": false) so the UI degrades gracefully.
#
# Service I/O contract (tools/ml/facade_detect_service.py):
#   POST /detect?threshold=  body: raw image bytes
#   -> {detections: [{box:[x1,y1,x2,y2], label, score}], width, height}
#   5 defect classes:
FACADE_DEFECT_CLASSES = ["crack", "leakage", "abscission", "corrosion", "bulge"]
FACADE_DEFECT_CLASS_COLORS = {
    "crack": "#e6194B", "leakage": "#4363d8", "abscission": "#f58231",
    "corrosion": "#3cb44b", "bulge": "#911eb4",
}
# Base URL of the on-host model service (see tools/ml/facade_detect_service.py).
# Set via docker-compose.prod.yml → http://host.docker.internal:8020. Empty = the
# service isn't wired (returns the placeholder).
FACADE_MODEL_URL = os.environ.get("FACADE_MODEL_URL", "").strip()


class FacadeDefectRequest(BaseModel):
    image_base64: str
    direction: str = "N"
    building_info: Optional[dict[str, Any]] = None
    # Minimum confidence to return (the demo app defaults to 0.3).
    threshold: float = 0.3


@app.post("/api/facade-defects")
async def facade_defects(req: FacadeDefectRequest):
    """Detect facade defects (crack/leakage/abscission/corrosion/bulge) in a
    base64 facade image. PLACEHOLDER until the ML model is connected via
    FACADE_MODEL_URL - returns model_connected=false + an empty defect list,
    with the full class list so the UI can render its legend now.

    When FACADE_MODEL_URL is set, proxies the image to that model service and
    normalizes its boxes/labels/scores into the response shape below."""
    base = {
        "defect_classes": FACADE_DEFECT_CLASSES,
        "class_colors": FACADE_DEFECT_CLASS_COLORS,
        "direction": req.direction,
    }

    if not FACADE_MODEL_URL:
        return {
            **base,
            "model_connected": False,
            "source": "placeholder",
            "defects": [],
            "message": (
                "Facade-defect ML model not connected yet. Set FACADE_MODEL_URL to a "
                "running model service (POST /predict) to enable real detection."
            ),
        }

    import base64, binascii, httpx
    # The frontend sends raw base64 (no data: prefix) of a JPEG; the on-host model
    # service (tools/ml/facade_detect_service.py) takes raw image BYTES at
    # POST /detect?threshold= and returns {detections:[{box,label,score}], width, height}.
    try:
        img_bytes = base64.b64decode(req.image_base64)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(400, f"image_base64 is not valid base64: {exc}")

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                f"{FACADE_MODEL_URL}/detect",
                params={"threshold": req.threshold},
                content=img_bytes,
                headers={"Content-Type": "application/octet-stream"},
            )
        r.raise_for_status()
        raw = r.json()
    except httpx.RequestError as exc:
        raise HTTPException(502, f"Could not reach facade model at {FACADE_MODEL_URL}: {exc}")
    except Exception as exc:
        raise HTTPException(502, f"Facade model returned an unusable response: {exc}")

    defects = []
    for d in (raw.get("detections") or []):
        score = d.get("score")
        if score is None or float(score) < req.threshold:
            continue
        defects.append({
            "class": d.get("label") or "unknown",
            "confidence": round(float(score), 3),
            "box": [float(v) for v in (d.get("box") or [])],
        })
    defects.sort(key=lambda x: x["confidence"], reverse=True)
    return {
        **base,
        "model_connected": True,
        "source": "mbdd2025",
        "defects": defects,
        "image_size": {"width": raw.get("width"), "height": raw.get("height")},
    }


# ── WWR database (JSON file, grows over time) ────────────────────────────────
import datetime

WWR_DB_PATH = PROJECT_ROOT / "data" / "wwr_database.json"

def _load_wwr_db() -> list:
    if WWR_DB_PATH.exists():
        try:
            return json.loads(WWR_DB_PATH.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []

def _save_wwr_db(records: list) -> None:
    WWR_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    WWR_DB_PATH.write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")


class WWRSaveRequest(BaseModel):
    lat: float
    lon: float
    address: Optional[str] = None
    average_wwr: int
    per_facade: list[int]
    directions: list[str]
    source: str = "ai"
    building_info: Optional[dict[str, Any]] = None
    # Balconies on different facades add up (unlike WWR, which averages) -
    # the client sums per-facade counts/areas before calling this endpoint;
    # this handler just persists whatever total it's given.
    balcony_count_total: int = 0
    balcony_area_m2_total: Optional[float] = None
    per_facade_balcony_count: Optional[list[int]] = None


@app.post("/api/wwr-save")
async def save_wwr(req: WWRSaveRequest):
    """Persist an AI-detected WWR record to the local database."""
    records = _load_wwr_db()
    # Replace existing record for same building (within 20 m)
    records = [
        r for r in records
        if _haversine_m(r["lat"], r["lon"], req.lat, req.lon) > 20
    ]
    records.append({
        "lat": req.lat,
        "lon": req.lon,
        "address": req.address,
        "average_wwr": req.average_wwr,
        "per_facade": req.per_facade,
        "directions": req.directions,
        "source": req.source,
        "building_info": req.building_info or {},
        "balcony_count_total": req.balcony_count_total,
        "balcony_area_m2_total": req.balcony_area_m2_total,
        "per_facade_balcony_count": req.per_facade_balcony_count,
        "saved_at": datetime.datetime.utcnow().isoformat() + "Z",
    })
    _save_wwr_db(records)
    return {"ok": True, "total_records": len(records)}


@app.get("/api/wwr-lookup")
async def lookup_wwr(lat: float = Query(...), lon: float = Query(...), radius_m: float = Query(25)):
    """Return the nearest saved WWR record within radius_m metres, or null."""
    records = _load_wwr_db()
    best = None
    best_dist = radius_m
    for r in records:
        d = _haversine_m(r["lat"], r["lon"], lat, lon)
        if d <= best_dist:
            best_dist = d
            best = r
    if best is None:
        return {"found": False, "record": None}
    return {"found": True, "record": best, "dist_m": round(best_dist, 1)}


@app.get("/api/wwr-database")
async def get_wwr_database():
    """Return all saved WWR records."""
    return {"records": _load_wwr_db()}


# ── PVGIS database (JSON file, grows over time) ──────────────────────────────

PVGIS_DB_PATH = PROJECT_ROOT / "data" / "pvgis_database.json"

def _load_pvgis_db() -> list:
    if PVGIS_DB_PATH.exists():
        try:
            return json.loads(PVGIS_DB_PATH.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []

def _save_pvgis_db(records: list) -> None:
    PVGIS_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    PVGIS_DB_PATH.write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")


class PVGISSaveRequest(BaseModel):
    lat: float
    lon: float
    address: Optional[str] = None
    kWp: float
    annual_kwh: float
    specific_kwh_kwp: float
    roof_area_m2: float
    building_info: Optional[dict[str, Any]] = None


@app.post("/api/pvgis-save")
async def save_pvgis(req: PVGISSaveRequest):
    """Persist a PVGIS PV potential record to the local database."""
    records = _load_pvgis_db()
    records = [r for r in records if _haversine_m(r["lat"], r["lon"], req.lat, req.lon) > 20]
    records.append({
        "lat": req.lat,
        "lon": req.lon,
        "address": req.address,
        "kWp": req.kWp,
        "annual_kwh": req.annual_kwh,
        "specific_kwh_kwp": req.specific_kwh_kwp,
        "roof_area_m2": req.roof_area_m2,
        "building_info": req.building_info or {},
        "saved_at": datetime.datetime.utcnow().isoformat() + "Z",
    })
    _save_pvgis_db(records)
    return {"ok": True, "total_records": len(records)}


@app.get("/api/pvgis-lookup")
async def lookup_pvgis(lat: float = Query(...), lon: float = Query(...), radius_m: float = Query(25)):
    """Return the nearest saved PVGIS record within radius_m metres, or null."""
    records = _load_pvgis_db()
    best = None
    best_dist = radius_m
    for r in records:
        d = _haversine_m(r["lat"], r["lon"], lat, lon)
        if d <= best_dist:
            best_dist = d
            best = r
    if best is None:
        return {"found": False, "record": None}
    return {"found": True, "record": best, "dist_m": round(best_dist, 1)}


@app.get("/api/pvgis-database")
async def get_pvgis_database():
    """Return all saved PVGIS records."""
    return {"records": _load_pvgis_db()}


# ── PVGIS proxy (avoids browser CORS restriction) ───────────────────────────
@app.get("/api/pvgis")
async def pvgis_proxy(
    lat: float = Query(...),
    lon: float = Query(...),
    peakpower: float = Query(...),
    loss: float = Query(14),
    angle: float = Query(35),
    aspect: float = Query(0),
    pvtechchoice: str = Query("crystSi"),
):
    """Server-side proxy to the PVGIS API (re.jrc.ec.europa.eu).
    Required because browsers are blocked by CORS from calling the API directly.
    """
    import httpx

    pvgis_url = "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc"
    params = {
        "lat": lat,
        "lon": lon,
        "peakpower": peakpower,
        "loss": loss,
        "angle": angle,
        "aspect": aspect,
        "outputformat": "json",
        "pvtechchoice": pvtechchoice,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(pvgis_url, params=params)
        if not r.is_success:
            raise HTTPException(r.status_code, f"PVGIS returned {r.status_code}")
        return r.json()


# ── Energy simulation (EPSM) ─────────────────────────────────────────────────
# Self-hosted EnergyPlus runner (see docker-compose.epsm.yml, tools/idf/) -
# EPSM_BASE_URL defaults to the port docker-compose.epsm.yml maps its Django
# backend to (8010, since our own FastAPI backend keeps 8000).
EPSM_BASE_URL = os.environ.get("EPSM_BASE_URL", "http://localhost:8010").strip()
EPW_DIR = PROJECT_ROOT / "data" / "epw"

# city_id (tools/uk/cities.py, or "gothenburg" for Sweden) -> EPW filename in
# data/epw/. All 4 London districts share one weather station (Heathrow).
CITY_TO_EPW = {
    "gothenburg": "SWE_VG_Gothenburg-Landvetter.AP.025260_TMYx.2011-2025.epw",
    "london_kings_cross": "GBR_ENG_London.City.AP.037683_TMYx.2011-2025.epw",
    "london_westminster": "GBR_ENG_London.City.AP.037683_TMYx.2011-2025.epw",
    "london_canary_wharf": "GBR_ENG_London.City.AP.037683_TMYx.2011-2025.epw",
    "london_southwark": "GBR_ENG_London.City.AP.037683_TMYx.2011-2025.epw",
    "rotherham": "GBR_ENG_Doncaster.Sheffield-Hood.AP.034054_TMYx.2011-2025.epw",
}


def _floors_of(building_info: dict) -> int:
    floors = building_info.get("floors")
    try:
        if floors:
            return max(1, round(float(floors)))
    except (TypeError, ValueError):
        pass
    height = building_info.get("height")
    if height:
        return max(1, round(float(height) / 3.2))
    return 1


async def _fetch_and_normalize_results(simulation_id: str, building_info: dict) -> dict:
    """Fetch EPSM's raw results and recompute per-m2 figures using our own
    total floor area (floors x footprint_m2), not EPSM's own per-m2 fields.

    EPSM normalizes by the zone's physical Floor surface area alone (i.e.
    the building's footprint) - fine for a single-storey building, but for
    a 20-storey tower modelled as one full-height shoebox zone (see
    tools/idf/generate_idf.py) that understates the real total floor area
    by a factor of ~20, so EPSM's own "heatingDemand"/"totalEnergyUse"
    fields come out roughly floors-times too high per m2. Confirmed by hand
    during Phase 1 testing: a 20-storey Westminster building's EPSM-reported
    heatingDemand was ~948 kWh/m2/yr, correcting to ~47 kWh/m2/yr once
    divided by total floor area instead of footprint alone - a plausible
    result next to that building's real tabula_kwh_m2_yr of 205.5.
    """
    import httpx

    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(f"{EPSM_BASE_URL}/api/simulation/{simulation_id}/results/")
        r.raise_for_status()
        raw = r.json()
    row = raw[0] if isinstance(raw, list) and raw else (raw if isinstance(raw, dict) else {})
    result = _normalize_energy(row.get("energy_use") or {}, row.get("totalArea"), building_info)
    result["raw"] = row
    return result


def _energy_use_dict_from_list(items: Optional[list]) -> dict:
    """EPSM's /parallel-results/ endpoint reports per-category energy as a
    LIST of {end_use, electricity, district_heating, total} rows, unlike the
    single-simulation /results/ endpoint's {"Heating": {...}, "Cooling": {...}}
    dict shape - this adapts the list shape to the same dict shape so both
    paths can share _normalize_energy()."""
    return {item["end_use"]: item for item in (items or []) if item.get("end_use")}


def _normalize_energy(energy_use: dict, footprint_from_epsm: Optional[float], building_info: dict) -> dict:
    """Recompute per-m2 figures using our own total floor area (floors x
    footprint_m2), not EPSM's own per-m2 fields - see _fetch_and_normalize_results'
    docstring for why (EPSM normalizes by the single shoebox zone's floor
    surface alone, understating total floor area for multi-storey buildings)."""
    floors = _floors_of(building_info)
    footprint = building_info.get("footprint_m2") or footprint_from_epsm or 1.0
    total_floor_area = building_info.get("floor_area_m2") or (float(footprint) * floors)

    def _kwh(category: str) -> float:
        return float((energy_use.get(category) or {}).get("total") or 0.0)

    heating_kwh = _kwh("Heating")
    cooling_kwh = _kwh("Cooling")
    lighting_kwh = _kwh("Interior Lighting") + _kwh("Exterior Lighting")
    equipment_kwh = _kwh("Interior Equipment") + _kwh("Exterior Equipment")
    total_kwh = heating_kwh + cooling_kwh + lighting_kwh + equipment_kwh

    def _per_m2(kwh: float) -> Optional[float]:
        return round(kwh / total_floor_area, 1) if total_floor_area else None

    return {
        "floors": floors,
        "footprint_m2": round(float(footprint), 1),
        "total_floor_area_m2": round(total_floor_area, 1),
        "heating_kwh": round(heating_kwh, 1),
        "cooling_kwh": round(cooling_kwh, 1),
        "lighting_kwh": round(lighting_kwh, 1),
        "equipment_kwh": round(equipment_kwh, 1),
        "total_kwh": round(total_kwh, 1),
        "heating_kwh_m2_yr": _per_m2(heating_kwh),
        "cooling_kwh_m2_yr": _per_m2(cooling_kwh),
        "lighting_kwh_m2_yr": _per_m2(lighting_kwh),
        "equipment_kwh_m2_yr": _per_m2(equipment_kwh),
        "total_kwh_m2_yr": _per_m2(total_kwh),
    }


class SimulationSubmitRequest(BaseModel):
    lat: float
    lon: float
    address: Optional[str] = None
    country: str  # "se" | "gb"
    # Optional for "gb" - auto-resolved from lat/lon (nearest built UK
    # district) when omitted, same as /api/uk/building. Sweden has only one
    # city_id ("gothenburg") so callers always send it explicitly.
    city_id: Optional[str] = None
    # Optional: the classic 3D viewer (viewer/js/energy_sim.js) already has
    # the full building dict (incl. real polygon coordinates) in memory and
    # sends it directly. The React wizard's /api/building response never
    # includes the raw polygon (kept server-side, see _ring_perimeter_m), so
    # its callers omit this and rely on server-side resolution below instead.
    building: Optional[dict[str, Any]] = None
    wwr_override: Optional[float] = None
    u_wall_override: Optional[float] = None
    u_roof_override: Optional[float] = None
    u_win_override: Optional[float] = None
    u_floor_override: Optional[float] = None
    # Distinguishes multiple simulations at the SAME building location (the
    # renovation-package calculator runs baseline + N packages per building).
    # Defaults to "baseline" so existing callers (viewer/js/energy_sim.js,
    # which never sends this) keep today's exact 1-simulation-per-location
    # behavior unchanged.
    package_id: str = "baseline"
    package_label: Optional[str] = None


class BatchBuildingSpec(BaseModel):
    lat: float
    lon: float
    address: Optional[str] = None
    building: Optional[dict[str, Any]] = None


class SimulationBatchSubmitRequest(BaseModel):
    country: str  # "se" | "gb"
    city_id: Optional[str] = None  # gb: auto-resolved from the first building if omitted
    buildings: list[BatchBuildingSpec]
    wwr_override: Optional[float] = None
    u_wall_override: Optional[float] = None
    u_roof_override: Optional[float] = None
    u_win_override: Optional[float] = None
    u_floor_override: Optional[float] = None
    package_id: str = "baseline"
    package_label: Optional[str] = None


@app.post("/api/simulation-submit")
async def submit_simulation(req: SimulationSubmitRequest):
    """Generate a shoebox IDF for this building and hand it to EPSM to run.
    Returns immediately with EPSM's simulation_id/task_id - poll
    /api/simulation-status/{id} for progress."""
    import httpx

    city_id = req.city_id
    if req.country == "gb" and not city_id:
        city_id = _resolve_uk_city_id(req.lat, req.lon)
    elif req.country == "se" and not city_id:
        city_id = "gothenburg"  # only Swedish city currently mapped — safe default

    epw_name = CITY_TO_EPW.get(city_id or "")
    if not epw_name:
        raise HTTPException(400, f"No weather file mapped for city_id '{city_id}'")
    epw_path = EPW_DIR / epw_name
    if not epw_path.exists():
        raise HTTPException(500, f"Weather file missing on server: {epw_path.name}")

    building = req.building
    if not building or not building.get("coordinates"):
        # Caller sent no polygon (the wizard's /api/building and /api/uk/building
        # never return one) - re-resolve the real building server-side, same
        # nearest-match logic those endpoints use, so we're not trusting a
        # client-reconstructed building dict for something as physical as geometry.
        def _dist(b: dict) -> float:
            c_lat, c_lon = _polygon_centroid(b.get("coordinates") or [])
            return _haversine_m(req.lat, req.lon, c_lat, c_lon)

        source = _get_uk_buildings_list(city_id) if req.country == "gb" else _get_buildings_list()
        candidates = [b for b in source if _dist(b) <= 150]
        if not candidates:
            raise HTTPException(404, "No building with real geometry found near this location")
        building = min(candidates, key=_dist)

    try:
        idf_text = build_shoebox_idf(
            building, req.country, city_id, str(epw_path),
            wwr_override=req.wwr_override, building_name=req.address,
            u_wall_override=req.u_wall_override, u_roof_override=req.u_roof_override,
            u_win_override=req.u_win_override, u_floor_override=req.u_floor_override,
        )
    except Exception as exc:
        raise HTTPException(400, f"IDF generation failed: {exc}")

    async with httpx.AsyncClient(timeout=30) as client:
        files = {
            "idf_files": ("model.idf", idf_text.encode("utf-8"), "text/plain"),
            "weather_file": (epw_name, epw_path.read_bytes(), "application/octet-stream"),
        }
        try:
            r = await client.post(f"{EPSM_BASE_URL}/api/simulation/run/", files=files)
        except httpx.RequestError as exc:
            raise HTTPException(502, f"Could not reach EPSM at {EPSM_BASE_URL}: {exc}")
        if not r.is_success:
            raise HTTPException(r.status_code, f"EPSM rejected the simulation: {r.text[:500]}")
        payload = r.json()

    simulation_id = payload.get("simulation_id")
    # Only evict a previously-queued record for the SAME package at this
    # location - not every simulation there. Pre-existing records (and
    # viewer/js/energy_sim.js, which never sends package_id) default to
    # "baseline" via package_id's own Pydantic default, so this stays
    # backward-compatible with the original 1-simulation-per-location
    # behavior for that caller.
    simdb.evict_queued(req.lat, req.lon, req.package_id)
    simdb.insert({
        "lat": req.lat,
        "lon": req.lon,
        "address": req.address,
        "country": req.country,
        "city_id": city_id,
        "building_info": building,
        "package_id": req.package_id,
        "package_label": req.package_label,
        "epsm_simulation_id": simulation_id,
        "epsm_task_id": payload.get("task_id"),
        "status": "queued",
        "submitted_at": datetime.datetime.utcnow().isoformat() + "Z",
        "completed_at": None,
        "results": None,
        "error": None,
    })
    return {"simulation_id": simulation_id, "task_id": payload.get("task_id"), "status": "queued"}


@app.get("/api/simulation-status/{simulation_id}")
async def simulation_status(simulation_id: str):
    """Proxy EPSM's own status endpoint. On first observing 'completed', also
    fetches + normalizes results and folds them into the cached record."""
    import httpx

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            r = await client.get(f"{EPSM_BASE_URL}/api/simulation/{simulation_id}/status/")
        except httpx.RequestError as exc:
            raise HTTPException(502, f"Could not reach EPSM at {EPSM_BASE_URL}: {exc}")
        if not r.is_success:
            raise HTTPException(r.status_code, f"EPSM status lookup failed: {r.text[:300]}")
        status_payload = r.json()

    records = simdb.get_by_epsm_id(simulation_id)
    record = records[0] if records else None
    status = status_payload.get("status")
    if record is not None and status == "completed" and record.get("status") != "completed":
        results = await _fetch_and_normalize_results(simulation_id, record.get("building_info") or {})
        simdb.update_by_epsm_id(
            simulation_id,
            status="completed",
            completed_at=datetime.datetime.utcnow().isoformat() + "Z",
            results=results,
        )
    elif record is not None and status == "failed" and record.get("status") != "failed":
        simdb.update_by_epsm_id(
            simulation_id,
            status="failed",
            error=status_payload.get("error_message") or status_payload.get("error"),
        )
    return status_payload


@app.get("/api/simulation-results/{simulation_id}")
async def simulation_results(simulation_id: str):
    """Return the cached, normalized results for a completed simulation."""
    records = simdb.get_by_epsm_id(simulation_id)
    record = records[0] if records else None
    if record is None:
        raise HTTPException(404, "Unknown simulation_id")
    if record.get("status") != "completed":
        raise HTTPException(409, f"Simulation not completed yet (status={record.get('status')})")
    return record["results"]


@app.post("/api/simulation-batch-submit")
async def submit_simulation_batch(req: SimulationBatchSubmitRequest):
    """Generate one shoebox IDF per building and submit them ALL to EPSM in a
    single call. EPSM natively accepts a LIST of idf_files in one request and
    dispatches each as its own parallel Celery task under one shared
    simulation_id (a proper Celery chord - the batch only reports "completed"
    once every building's run finishes), with a /parallel-results/ endpoint
    that tags each result with the idf_idx matching its position in the
    upload list. That means no client-side concurrency management is needed
    here - EPSM's own workers already parallelize the batch; we just need to
    remember which idf_idx belongs to which building (see simdb's batch_id/
    idf_idx columns) so results can be matched back afterward."""
    import httpx

    if not req.buildings:
        raise HTTPException(400, "No buildings given")

    city_id = req.city_id
    if req.country == "gb" and not city_id:
        # A batch is always scoped to one district/city - resolve from the first building.
        first = req.buildings[0]
        city_id = _resolve_uk_city_id(first.lat, first.lon)
    elif req.country == "se" and not city_id:
        city_id = "gothenburg"  # only Swedish city currently mapped — safe default

    epw_name = CITY_TO_EPW.get(city_id or "")
    if not epw_name:
        raise HTTPException(400, f"No weather file mapped for city_id '{city_id}'")
    epw_path = EPW_DIR / epw_name
    if not epw_path.exists():
        raise HTTPException(500, f"Weather file missing on server: {epw_path.name}")

    source = _get_uk_buildings_list(city_id) if req.country == "gb" else _get_buildings_list()

    resolved: list[dict] = []
    for i, b in enumerate(req.buildings):
        building = b.building
        if not building or not building.get("coordinates"):
            def _dist(cand: dict, _lat=b.lat, _lon=b.lon) -> float:
                c_lat, c_lon = _polygon_centroid(cand.get("coordinates") or [])
                return _haversine_m(_lat, _lon, c_lat, c_lon)

            candidates = [c for c in source if _dist(c) <= 150]
            if not candidates:
                raise HTTPException(404, f"No building with real geometry found near building {i} ({b.lat}, {b.lon})")
            building = min(candidates, key=_dist)
        resolved.append({"lat": b.lat, "lon": b.lon, "address": b.address, "building": building})

    idf_payload: list[tuple[str, bytes, str]] = []
    for i, rb in enumerate(resolved):
        try:
            idf_text = build_shoebox_idf(
                rb["building"], req.country, city_id, str(epw_path),
                wwr_override=req.wwr_override, building_name=rb["address"] or f"Building {i}",
                u_wall_override=req.u_wall_override, u_roof_override=req.u_roof_override,
                u_win_override=req.u_win_override, u_floor_override=req.u_floor_override,
            )
        except Exception as exc:
            raise HTTPException(400, f"IDF generation failed for building {i} ({rb['address']}): {exc}")
        idf_payload.append((f"building_{i}.idf", idf_text.encode("utf-8"), "text/plain"))

    async with httpx.AsyncClient(timeout=120) as client:
        files = [("idf_files", f) for f in idf_payload]
        files.append(("weather_file", (epw_name, epw_path.read_bytes(), "application/octet-stream")))
        data = {"parallel": "true", "max_workers": str(min(len(idf_payload), 8))}
        try:
            r = await client.post(f"{EPSM_BASE_URL}/api/simulation/run/", files=files, data=data)
        except httpx.RequestError as exc:
            raise HTTPException(502, f"Could not reach EPSM at {EPSM_BASE_URL}: {exc}")
        if not r.is_success:
            raise HTTPException(r.status_code, f"EPSM rejected the batch: {r.text[:500]}")
        payload = r.json()

    batch_id = payload.get("simulation_id")
    now = datetime.datetime.utcnow().isoformat() + "Z"
    # Evict stale queued records from a PREVIOUS run before inserting any of
    # THIS batch's rows - doing it in the same loop as insert() is a real bug
    # when two of this batch's own buildings are close together (a very
    # normal case for a real portfolio/district): evicting building i+1 would
    # delete building i's just-inserted "queued" row if they're within the
    # eviction radius of each other, since it can't tell "stale" from
    # "sibling submitted moments ago" by radius alone.
    for rb in resolved:
        simdb.evict_queued(rb["lat"], rb["lon"], req.package_id)
    for i, rb in enumerate(resolved):
        simdb.insert({
            "lat": rb["lat"], "lon": rb["lon"], "address": rb["address"], "country": req.country,
            "city_id": city_id, "building_info": rb["building"], "package_id": req.package_id,
            "package_label": req.package_label, "batch_id": batch_id, "idf_idx": i,
            "epsm_simulation_id": batch_id, "epsm_task_id": payload.get("task_id"),
            "status": "queued", "submitted_at": now, "completed_at": None, "results": None, "error": None,
        })

    return {"batch_id": batch_id, "task_id": payload.get("task_id"), "total": len(resolved), "status": "queued"}


@app.get("/api/simulation-batch-status/{batch_id}")
async def simulation_batch_status(batch_id: str):
    """Aggregate status for every building in a batch. Once EPSM's own status
    for the shared simulation_id is 'completed', fetches /parallel-results/
    ONCE and matches each result back to its building via idf_idx."""
    import httpx

    rows = simdb.get_by_epsm_id(batch_id)
    if not rows:
        raise HTTPException(404, "Unknown batch_id")

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            r = await client.get(f"{EPSM_BASE_URL}/api/simulation/{batch_id}/status/")
        except httpx.RequestError as exc:
            raise HTTPException(502, f"Could not reach EPSM at {EPSM_BASE_URL}: {exc}")
        if not r.is_success:
            raise HTTPException(r.status_code, f"EPSM status lookup failed: {r.text[:300]}")
        overall_status = (r.json() or {}).get("status")

    still_pending = any(row["status"] not in ("completed", "failed") for row in rows)

    if overall_status == "completed" and still_pending:
        async with httpx.AsyncClient(timeout=30) as client:
            pr = await client.get(f"{EPSM_BASE_URL}/api/simulation/{batch_id}/parallel-results/")
        if pr.is_success:
            payload = pr.json()
            results_list = payload if isinstance(payload, list) else (payload.get("results") or [])
            by_idx = {int(item["idf_idx"]): item for item in results_list if item.get("idf_idx") is not None}
            now = datetime.datetime.utcnow().isoformat() + "Z"
            for row in rows:
                item = by_idx.get(row["idf_idx"])
                if item is None:
                    continue
                item_status = "failed" if (item.get("status") or "").lower() in ("failed", "error") else "completed"
                if item_status == "completed":
                    normalized = _normalize_energy(
                        _energy_use_dict_from_list(item.get("energy_uses")),
                        item.get("total_area"),
                        row.get("building_info") or {},
                    )
                    normalized["raw"] = item
                    simdb.update_by_epsm_id(
                        batch_id, idf_idx=row["idf_idx"],
                        status="completed", completed_at=now, results=normalized,
                    )
                else:
                    simdb.update_by_epsm_id(
                        batch_id, idf_idx=row["idf_idx"],
                        status="failed", completed_at=now,
                        error=f"EnergyPlus run failed for this building (idf_idx={row['idf_idx']})",
                    )
            rows = simdb.get_by_epsm_id(batch_id)
    elif overall_status == "failed" and still_pending:
        now = datetime.datetime.utcnow().isoformat() + "Z"
        for row in rows:
            if row["status"] not in ("completed", "failed"):
                simdb.update_by_epsm_id(
                    batch_id, idf_idx=row["idf_idx"],
                    status="failed", completed_at=now, error="EPSM batch failed",
                )
        rows = simdb.get_by_epsm_id(batch_id)

    counts: dict[str, int] = {}
    for row in rows:
        counts[row["status"]] = counts.get(row["status"], 0) + 1

    return {
        "batch_id": batch_id,
        "total": len(rows),
        "counts": counts,
        "overall_status": overall_status,
        "buildings": [
            {
                "idf_idx": row["idf_idx"], "lat": row["lat"], "lon": row["lon"], "address": row["address"],
                "package_id": row["package_id"], "package_label": row["package_label"],
                "status": row["status"], "results": row["results"], "error": row["error"],
            }
            for row in rows
        ],
    }


@app.get("/api/simulation-lookup")
async def lookup_simulation(
    lat: float = Query(...), lon: float = Query(...), radius_m: float = Query(25),
    package_id: Optional[str] = Query(None),
):
    """Return the nearest saved/running simulation record within radius_m
    metres, or null. When package_id is given, only records for that package
    are considered (omit it for the pre-existing single-building behavior)."""
    hit = simdb.find_nearest(lat, lon, radius_m, package_id)
    if hit is None:
        return {"found": False, "record": None}
    return {"found": True, "record": hit["record"], "dist_m": hit["dist_m"]}


@app.get("/api/simulation-lookup-all")
async def lookup_simulation_all(lat: float = Query(...), lon: float = Query(...), radius_m: float = Query(25)):
    """Every saved/running simulation record within radius_m of this location -
    one row per package_id (baseline + N renovation packages) - nearest first.
    Lets the renovation calculator rehydrate every package's status in one call."""
    return {"records": simdb.find_all_near(lat, lon, radius_m)}


@app.get("/api/simulation-database")
async def get_simulation_database():
    """Return all saved simulation records."""
    return {"records": simdb.all_records()}


# ── Multi-objective renovation optimizer ────────────────────────────────────
#
# The "search all combinations" half of the hybrid optimizer: enumerate every
# material combination, score each on the fast degree-day physics (cheap,
# analytic — no EnergyPlus), and return the Pareto-optimal front over the three
# competing objectives (cost, carbon, energy). The frontend then validates just
# those Pareto winners in EPSM. The MILP formulation and the cost/carbon/energy
# objective functions are based on the work of Jenny Enerbäck & Ann-Brith
# Strömberg (see optimizationAssumptions.ts for the documented equations).

class OptimizeOption(BaseModel):
    code: str
    label: Optional[str] = None
    u_value: float                    # W/(m²·K) this option imposes on its component
    cost: float = 0.0                 # total initial cost over the component area (SEK/GBP)
    carbon: float = 0.0               # total embodied carbon over the component area (kg CO₂e)


class OptimizeComponent(BaseModel):
    key: str                          # "Walls" | "Roof" | "Windows" | "Floor" (+ VertExt variants)
    area_m2: float
    baseline_u: float                 # as-built U the baseline EPSM run used for this component
    options: list[OptimizeOption]


class OptimizeParams(BaseModel):
    f_dh: float                       # 24·HDD/1000  [kWh per (W/K) per yr]
    energy_price: float               # per kWh (SEK or GBP), spot
    carbon_factor_heat: float         # kg CO₂e / kWh, operational heat
    discount_rate: float = 0.03
    study_period_yr: int = 30
    floor_area_m2: float
    baseline_total_kwh_m2_yr: float   # measured baseline from the EPSM run — anchors Q_fixed


class OptimizeRequest(BaseModel):
    components: list[OptimizeComponent]
    params: OptimizeParams
    max_results: int = 24             # cap on returned Pareto points (kept spread + extremes)
    max_combos: int = 100000          # enumeration cap (guards against combinatorial blow-up)
    cloud_cap: int = 3000             # cap on the returned scatter cloud (evenly sampled); 0 = none


@app.post("/api/optimize")
async def optimize_renovation(req: OptimizeRequest):
    """Enumerate material combinations, Pareto-filter on (cost, carbon, energy)
    using the degree-day physics, return the non-dominated front. Fast/analytic
    — the caller validates the returned winners in EPSM."""
    import itertools

    p = req.params
    N = max(1, int(p.study_period_yr))
    r = p.discount_rate
    # Present-value annuity factor Σ_{y=1..N} 1/(1+r)^y for discounted operating cost.
    annuity = sum(1.0 / (1.0 + r) ** y for y in range(1, N + 1)) if r > 0 else float(N)

    floor_area = p.floor_area_m2 if p.floor_area_m2 else 1.0

    # Anchor Q_fixed (the non-envelope load a retrofit can't change) to the real
    # baseline EPSM result, so the physics curve passes through the known baseline
    # point when every component is left at its as-built U-value.
    baseline_htr = sum(c.area_m2 * c.baseline_u for c in req.components)
    baseline_total_kwh = p.baseline_total_kwh_m2_yr * floor_area
    q_fixed = max(0.0, baseline_total_kwh - baseline_htr * p.f_dh)

    # Each component contributes exactly one option. A synthetic "keep as-built"
    # option (U = baseline, no cost/carbon) lets the optimizer decide a component
    # isn't worth touching — essential for the cost/carbon trade-off.
    # A retrofit option must actually IMPROVE the component. The Wikells
    # catalogue mixes complete insulated assemblies (roof + 340 mm insulation,
    # U=0.11) with bare coverings and uninsulated build-ups (TRP roof on
    # masonite beams, U=3.37; "M0" studs with no insulation, U=1.75). Those are
    # single layers, not whole-component retrofits — offering them as such made
    # the optimizer propose packages that INCREASE heating demand several-fold
    # and produced nonsense energy figures. Anything worse than as-built is
    # dropped and reported, never silently.
    choice_lists: list[list[tuple[OptimizeComponent, OptimizeOption]]] = []
    excluded: list[dict] = []
    for c in req.components:
        keep = OptimizeOption(code="__keep__", label="Keep as-built", u_value=c.baseline_u)
        improving = []
        for o in c.options:
            if o.u_value <= c.baseline_u:
                improving.append(o)
            else:
                excluded.append({
                    "component": c.key, "code": o.code, "label": o.label,
                    "u_value": o.u_value, "baseline_u": c.baseline_u,
                })
        choice_lists.append([(c, keep)] + [(c, o) for o in improving])

    total_combos = 1
    for cl in choice_lists:
        total_combos *= len(cl)
    truncated = total_combos > req.max_combos

    def score(combo: list[tuple[OptimizeComponent, OptimizeOption]]) -> dict:
        htr = sum(comp.area_m2 * opt.u_value for comp, opt in combo)
        q_total = q_fixed + htr * p.f_dh
        energy_m2 = q_total / floor_area
        init_cost = sum(opt.cost for _, opt in combo)
        init_carbon = sum(opt.carbon for _, opt in combo)
        op_cost = q_total * p.energy_price * annuity
        op_carbon = q_total * p.carbon_factor_heat * N
        return {
            "energy_kwh_m2_yr": round(energy_m2, 1),
            "total_cost": round(init_cost + op_cost),
            "total_carbon": round(init_carbon + op_carbon),
            "initial_cost": round(init_cost),
            "initial_carbon": round(init_carbon),
            "htr_w_per_k": round(htr, 1),
            "selections": {comp.key: opt.code for comp, opt in combo},
            "selection_labels": {comp.key: (opt.label or opt.code) for comp, opt in combo},
        }

    # Enumerate (capped) and de-duplicate identical objective triples — many
    # different material picks collapse to the same U/cost/carbon.
    seen: dict[tuple, dict] = {}
    evaluated = 0
    for combo in itertools.product(*choice_lists):
        if evaluated >= req.max_combos:
            break
        pt = score(list(combo))
        sig = (pt["total_cost"], pt["total_carbon"], pt["energy_kwh_m2_yr"])
        if sig not in seen:
            seen[sig] = pt
        evaluated += 1
    points = list(seen.values())

    # Pareto skyline. Sorting by cost ascending means every already-kept point
    # has cost ≤ the current one, so the current point is dominated iff a kept
    # point is also ≤ in carbon AND energy (with at least one strictly less).
    points.sort(key=lambda z: (z["total_cost"], z["total_carbon"], z["energy_kwh_m2_yr"]))
    pareto: list[dict] = []
    for x in points:
        dominated = False
        for y in pareto:
            if (y["total_carbon"] <= x["total_carbon"] and y["energy_kwh_m2_yr"] <= x["energy_kwh_m2_yr"]
                    and (y["total_cost"] < x["total_cost"] or y["total_carbon"] < x["total_carbon"]
                         or y["energy_kwh_m2_yr"] < x["energy_kwh_m2_yr"])):
                dominated = True
                break
        if not dominated:
            pareto.append(x)

    # Tag the three extreme picks so the UI can highlight them.
    for metric_key, label in (("total_cost", "cheapest"), ("total_carbon", "lowest-carbon"),
                              ("energy_kwh_m2_yr", "lowest-energy")):
        if pareto:
            best = min(pareto, key=lambda z: z[metric_key])
            best.setdefault("tags", []).append(label)

    # Cap the returned front to max_results, always keeping tagged extremes plus
    # an even spread across the rest (sorted by energy for a readable curve).
    pareto.sort(key=lambda z: z["energy_kwh_m2_yr"])
    if len(pareto) > req.max_results:
        tagged = [x for x in pareto if x.get("tags")]
        others = [x for x in pareto if not x.get("tags")]
        slots = max(0, req.max_results - len(tagged))
        step = (len(others) / slots) if slots else 0
        picked_ids = {id(x) for x in tagged}
        for i in range(slots):
            picked_ids.add(id(others[min(len(others) - 1, int(i * step))]))
        pareto = [x for x in pareto if id(x) in picked_ids]

    baseline_point = {
        "energy_kwh_m2_yr": round(p.baseline_total_kwh_m2_yr, 1),
        "total_cost": round(baseline_total_kwh * p.energy_price * annuity),
        "total_carbon": round(baseline_total_kwh * p.carbon_factor_heat * N),
        "initial_cost": 0, "initial_carbon": 0,
        "htr_w_per_k": round(baseline_htr, 1),
    }

    # The scatter cloud of every evaluated (de-duplicated) combination — just the
    # three objective values, so the frontend can animate the point cloud filling
    # in and the running frontier tightening. Evenly sampled if it exceeds the cap
    # (keeps payload bounded while preserving the shape of the cloud).
    cloud_src = points  # de-duplicated, sorted by cost
    if req.cloud_cap and len(cloud_src) > req.cloud_cap:
        step = len(cloud_src) / req.cloud_cap
        cloud_src = [cloud_src[min(len(cloud_src) - 1, int(i * step))] for i in range(req.cloud_cap)]
    cloud = [
        {"energy_kwh_m2_yr": c["energy_kwh_m2_yr"], "total_cost": c["total_cost"], "total_carbon": c["total_carbon"]}
        for c in cloud_src
    ] if req.cloud_cap else []

    return {
        "baseline": baseline_point,
        "pareto": pareto,
        "cloud": cloud,
        "evaluated": evaluated,
        "unique_points": len(points),
        "combinations_total": total_combos,
        "pareto_count": len(pareto),
        "truncated": truncated,
        # Catalogue rows dropped because their U-value is worse than as-built
        # (bare coverings / uninsulated build-ups — single layers, not retrofits).
        "excluded_options": excluded,
        # The anchor only holds if the measured baseline exceeds the transmission
        # implied by the as-built U-values. When it doesn't, q_fixed clamps to 0
        # and every absolute energy figure is inflated — surface it rather than
        # quietly reporting impossible numbers.
        "anchor_ok": baseline_total_kwh >= baseline_htr * p.f_dh,
        "params_used": {
            "annuity_factor": round(annuity, 3),
            "q_fixed_kwh_yr": round(q_fixed),
            "study_period_yr": N,
        },
    }


# ── Agentic retrofit recommender ─────────────────────────────────────────────
# One question in ("best retrofit for <address>"), one answer out: resolve the
# building, assemble the SAME optimizer inputs the wizard builds (component areas,
# TABULA baseline U, EPC baseline energy, Wikells cost catalogue), run the
# degree-day optimizer, return three picks (cheapest / lowest-energy / best
# cost-energy balance), and validate the top pick in EnergyPlus (EPSM).
_WIKELLS_CAT_CACHE: Optional[dict] = None


def _wikells_catalogue() -> dict:
    global _WIKELLS_CAT_CACHE
    if _WIKELLS_CAT_CACHE is None:
        p = PROJECT_ROOT / "data" / "wikells_catalogue.json"
        try:
            _WIKELLS_CAT_CACHE = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            _WIKELLS_CAT_CACHE = {}
    return _WIKELLS_CAT_CACHE


def _resolve_building_by_address(query: str) -> Optional[dict]:
    q = (query or "").strip().lower()
    if not q:
        return None
    best, best_score = None, -1
    for b in _get_buildings_list():
        addrs = (b.get("all_addresses") or b.get("address") or "")
        if q in addrs.lower():
            score = (2 if b.get("energy") else 0) + (1 if b.get("coordinates") else 0)
            if score > best_score:
                best, best_score = b, score
    return best


async def _epsm_validate_once(lat: float, lon: float, address: str, u_over: dict) -> Optional[float]:
    """Run ONE building through EPSM with the given per-component U-overrides;
    return its total kWh/m²·yr, or None if EPSM is unavailable/failed."""
    import anyio
    try:
        req = SimulationBatchSubmitRequest(
            country="se",
            buildings=[BatchBuildingSpec(lat=lat, lon=lon, address=address)],
            package_id="recommend",
            u_wall_override=u_over.get("Walls"),
            u_roof_override=u_over.get("Roof"),
            u_win_override=u_over.get("Windows"),
            u_floor_override=u_over.get("Floor"),
        )
        r = await submit_simulation_batch(req)
        bid = r.get("batch_id")
        if not bid:
            return None
        for _ in range(45):
            s = await simulation_batch_status(bid)
            if s.get("overall_status") in ("completed", "failed"):
                for bb in s.get("buildings", []):
                    res = bb.get("results") or {}
                    if res.get("total_kwh_m2_yr") is not None:
                        return float(res["total_kwh_m2_yr"])
                return None
            await anyio.sleep(2)
    except Exception:
        return None
    return None


async def _recommend_retrofit_impl(address: str, validate_epsm: bool = True) -> dict:
    from tools.idf import defaults as _D
    b = _resolve_building_by_address(address)
    if not b:
        return {"error": f"No Gothenburg building found matching address '{address}'."}
    coords = b.get("coordinates") or []
    if not coords:
        return {"error": f"Building '{address}' has no geometry to analyse."}
    c_lat, c_lon = _polygon_centroid(coords)
    footprint = b.get("footprint_m2") or _shoelace_m2(coords) or 0.0
    perimeter = _ring_perimeter_m(coords) or 0.0
    floors = b.get("floors") or 0
    height = b.get("height") or (floors * 3 if floors else 9)
    if not floors:
        floors = max(1, round(height / 3))
    wall_gross = (perimeter * height) if (perimeter and height) else footprint * 0.6
    WWR = 0.20
    areas = {
        "Walls":   max(1.0, wall_gross * (1 - WWR)),
        "Windows": max(1.0, wall_gross * WWR),
        "Roof":    max(1.0, footprint),
        "Floor":   max(1.0, footprint),
    }
    heated_floor = b.get("area") or (footprint * floors) or footprint or 1.0
    period = b.get("tabula_period") or _period_from_year(b.get("year"))
    d_wall, d_win = _derive_u_values(b.get("use_cat"), period)
    base_u = {
        "Walls":   b.get("tabula_u_wall") or d_wall or _D.DEFAULT_U_WALL,
        "Windows": b.get("tabula_u_win") or d_win or _D.DEFAULT_U_WIN,
        "Roof":    b.get("tabula_u_roof") or _D.DEFAULT_U_ROOF,
        "Floor":   _D.DEFAULT_U_FLOOR,
    }
    baseline_energy = b.get("energy")
    baseline_source = "EPC (energideklaration)"
    if not baseline_energy or baseline_energy <= 0:
        baseline_energy = await _epsm_validate_once(c_lat, c_lon, b.get("address") or address, {})
        baseline_source = "EPSM baseline run"
    if not baseline_energy or baseline_energy <= 0:
        return {"error": f"Could not establish a baseline energy for '{address}'."}
    baseline_energy = float(baseline_energy)

    cat = _wikells_catalogue()
    components = []
    for comp in ("Walls", "Roof", "Windows", "Floor"):
        opts = []
        for it in cat.get(comp, []):
            if it["u_value"] > base_u[comp]:
                continue  # only options that actually IMPROVE the component
            opts.append(OptimizeOption(code=f"{comp}:{it['code']}", label=it["description"][:60],
                                       u_value=it["u_value"], cost=round(it["cost_sek_m2"] * areas[comp]), carbon=0.0))
        if opts:
            components.append(OptimizeComponent(key=comp, area_m2=round(areas[comp]),
                                                baseline_u=float(base_u[comp]), options=opts))
    if not components:
        return {"error": f"'{address}' already meets or beats the catalogue U-values on every component."}

    params = OptimizeParams(f_dh=24 * 3300 / 1000, energy_price=0.8, carbon_factor_heat=0.022,
                            discount_rate=0.03, study_period_yr=30,
                            floor_area_m2=round(heated_floor, 1), baseline_total_kwh_m2_yr=round(baseline_energy, 1))
    opt = await optimize_renovation(OptimizeRequest(components=components, params=params, max_results=40))
    front = opt.get("pareto") or []
    if not front:
        return {"error": "Optimizer returned no packages for this building."}

    def describe(pt: dict) -> dict:
        measures = []
        for comp, val in pt.get("selections", {}).items():
            if not val or val.endswith("__keep__"):
                continue
            code = val.split(":", 1)[-1]
            it = next((x for x in cat.get(comp, []) if x["code"] == code), None)
            if it:
                measures.append({"component": comp, "material": it["description"], "u_value": it["u_value"]})
        red = round((baseline_energy - pt["energy_kwh_m2_yr"]) / baseline_energy * 100)
        return {"measures": measures, "energy_kwh_m2_yr": pt["energy_kwh_m2_yr"],
                "energy_reduction_pct": red, "life_cycle_cost_sek": pt["total_cost"],
                "upfront_cost_sek": pt["initial_cost"]}

    improving = [z for z in front if z["energy_kwh_m2_yr"] < baseline_energy - 0.5]
    pool = improving or front
    eff = lambda z: (baseline_energy - z["energy_kwh_m2_yr"]) / max(1, z["initial_cost"])
    cheapest = min(pool, key=lambda z: z["total_cost"])
    lowest_energy = min(front, key=lambda z: z["energy_kwh_m2_yr"])
    balanced = max(pool, key=eff)

    result = {
        "address": b.get("address"), "all_addresses": b.get("all_addresses"),
        "baseline_energy_kwh_m2_yr": round(baseline_energy, 1), "baseline_source": baseline_source,
        "building": {"year": b.get("year"), "use": b.get("use_cat"), "floors": floors,
                     "heated_area_m2": round(heated_floor), "wall_area_m2": round(areas["Walls"]),
                     "roof_area_m2": round(areas["Roof"])},
        "objective": "cost + energy",
        "options": {"cheapest": describe(cheapest), "lowest_energy": describe(lowest_energy),
                    "best_balance": describe(balanced)},
        "note": "Energy/cost are degree-day optimizer estimates; the best-balance pick is validated in EnergyPlus (EPSM).",
    }

    if validate_epsm:
        u_over = {}
        for comp, val in balanced.get("selections", {}).items():
            if not val or val.endswith("__keep__"):
                continue
            it = next((x for x in cat.get(comp, []) if x["code"] == val.split(":", 1)[-1]), None)
            if it:
                u_over[comp] = it["u_value"]
        epsm_energy = await _epsm_validate_once(c_lat, c_lon, b.get("address") or address, u_over)
        if epsm_energy is not None:
            result["options"]["best_balance"]["epsm_validated_kwh_m2_yr"] = round(epsm_energy, 1)
            result["options"]["best_balance"]["epsm_reduction_pct"] = round((baseline_energy - epsm_energy) / baseline_energy * 100)
    return result


@app.get("/api/recommend-retrofit")
async def recommend_retrofit_endpoint(address: str = Query(...), validate: bool = Query(True)):
    """Agentic 'best retrofit package for <address>' — resolves the building,
    runs the optimizer over the Wikells catalogue, returns 3 options, validates
    the balanced pick in EPSM. Sweden/Gothenburg only (cost data is Wikells)."""
    return await _recommend_retrofit_impl(address, validate)


# ── Home-page chatbot (bilingual EN/SV, grounded in the real building data) ──
#
# Claude answers questions about the Gothenburg building/EPC dataset using the
# tools below, which read the live buildings.json. It detects the user's
# language and replies in the same one. No key configured → a clear message.

def _chat_agg(sel: list) -> dict:
    from collections import Counter
    n = len(sel)
    energies = [b["energy"] for b in sel if b.get("energy")]
    classes  = [b.get("eclass") for b in sel if b.get("eclass")]
    years    = [b["year"] for b in sel if b.get("year")]
    atemp    = [b["area"] for b in sel if b.get("area")]
    return {
        "buildings":            n,
        "epc_rated":            len(classes),
        "epc_coverage_pct":     round(len(classes) / n * 100, 1) if n else 0,
        "avg_energy_kwh_m2_yr": round(sum(energies) / len(energies), 1) if energies else None,
        "energy_class_counts":  dict(Counter(classes).most_common()) if classes else {},
        "avg_year_built":       round(sum(years) / len(years)) if years else None,
        "avg_heated_area_m2":   round(sum(atemp) / len(atemp)) if atemp else None,
    }


def _chat_tool_city_overview(_args: dict) -> dict:
    d = _chat_agg(_get_buildings_list())
    d["scope"] = "All mapped buildings in central Gothenburg"
    return d


def _chat_tool_district_stats(args: dict) -> dict:
    import difflib
    from collections import Counter
    district = (args.get("district") or "").strip()
    recs = _get_buildings_list()
    want = district.casefold()
    sel = [b for b in recs if (b.get("primary_area") or "").strip().casefold() == want]
    if not sel:
        names = sorted({(b.get("primary_area") or "").strip() for b in recs if b.get("primary_area")})
        near = difflib.get_close_matches(district, names, n=5, cutoff=0.3)
        return {"error": f"No neighborhood named '{district}'.", "did_you_mean": near}
    d = _chat_agg(sel)
    d["district"] = district
    return d


def _chat_tool_list_districts(_args: dict) -> dict:
    from collections import Counter
    c = Counter((b.get("primary_area") or "").strip() for b in _get_buildings_list() if b.get("primary_area"))
    return {"districts": [{"name": k, "buildings": v} for k, v in sorted(c.items())]}


def _chat_tool_find_address(args: dict) -> dict:
    query = (args.get("query") or "").strip().casefold()
    if not query:
        return {"matches": [], "count": 0}
    out = []
    for b in _get_buildings_list():
        hay = ((b.get("address") or "") + " " + (b.get("all_addresses") or "")).casefold()
        if query in hay:
            out.append({k: b.get(k) for k in
                        ("address", "all_addresses", "eclass", "energy", "year", "use_cat", "primary_area", "area")})
            if len(out) >= 8:
                break
    return {"matches": out, "count": len(out)}


# ── Raw EPC (energideklaration) dataset introspection ────────────────────────
# The tools above answer questions about the merged buildings.json. These two let
# the assistant answer questions about the underlying Boverket EPC dataset itself
# — which FIELDS it contains and how well-populated they are (e.g. "do EPCs have
# an owner-name field?", "how many list a ventilation type?"). Backed by the
# read-only DuckDB (national EPC table, ~1.88M rows, 262 columns).
_EPC_DB_PATH = PROJECT_ROOT / "data" / "sensitivity" / "epc_sweden.duckdb"

# Human concept → real column-name substrings, so the model can ask in plain
# language. A concept that maps to NO column simply isn't in the dataset.
_EPC_FIELD_SYNONYMS = {
    "energy": ["EgiSpecifik", "Egi"], "energy class": ["EgiEnergiklass"],
    "area": ["Atemp"], "atemp": ["Atemp"], "year": ["Nybygg", "Ar"],
    "address": ["IdAdr", "IdPostnr", "IdPostort"], "cadastral": ["IdFastBet"],
    "municipality": ["IdKommun"], "ventilation": ["Vent"], "heating": ["Uppv", "Varme"],
    "cooling": ["Kyla", "Fjarrkyla"], "radon": ["Rad"], "measures": ["Atg"],
    "owner": ["agare", "ägare", "owner", "namn"], "name": ["namn", "name"],
}
_EPC_COLS_CACHE: list[str] | None = None
_EPC_ROWS_CACHE: int | None = None


def _epc_con():
    import duckdb
    # The national EPC register (~461 MB) is an optional asset — the core tool
    # runs without it (EPC facts per building live in buildings.json). Only the
    # AI-chat "ask about the national dataset" tools need it; give a clear
    # message when it isn't present in this deployment (caught by _run_tool).
    if not _EPC_DB_PATH.exists():
        raise FileNotFoundError(
            "The national EPC register (data/sensitivity/epc_sweden.duckdb) is not "
            "available in this deployment, so dataset-wide EPC questions can't be "
            "answered here. Per-building EPC data is still available."
        )
    return duckdb.connect(str(_EPC_DB_PATH), read_only=True)


def _epc_cols_rows():
    global _EPC_COLS_CACHE, _EPC_ROWS_CACHE
    if _EPC_COLS_CACHE is None:
        con = _epc_con()
        try:
            _EPC_COLS_CACHE = [c[1] for c in con.execute("PRAGMA table_info('epc')").fetchall()]
            _EPC_ROWS_CACHE = con.execute("SELECT COUNT(*) FROM epc").fetchone()[0]
        finally:
            con.close()
    return _EPC_COLS_CACHE, _EPC_ROWS_CACHE


def _chat_tool_epc_dataset_info(_args: dict) -> dict:
    cols, rows = _epc_cols_rows()
    con = _epc_con()
    try:
        declarations = con.execute("SELECT COUNT(DISTINCT FormularId) FROM epc").fetchone()[0]
    finally:
        con.close()
    return {
        "source": "Boverket energideklaration (EPC) register — national Sweden dataset",
        "total_epc_records": rows,
        "distinct_declarations": declarations,
        "total_columns": len(cols),
        "available_fields": {
            "specific energy use (kWh/m²/yr)": "EgiSpecifikEnergianvandning",
            "energy class A–G": "EgiEnergiklass",
            "heated floor area ATEMP (m²)": "EgenAtemp",
            "build year": "EgenNybyggAr",
            "street address": "IdAdr", "postcode": "IdPostnr", "municipality": "IdKommun",
            "cadastral (fastighetsbeteckning)": "IdFastBet", "house number": "IdHusnr",
            "ventilation type": "VentTyp*", "improvement proposals": "AtgForslag*",
        },
        "not_included": [
            "owner name (ägarens namn) — no owner/person-name field exists (Boverket omits personal data)",
            "any personal / contact data",
        ],
        "note": "Use search_epc_fields to check whether a specific field exists and how many records populate it.",
    }


def _chat_tool_search_epc_fields(args: dict) -> dict:
    cols, rows = _epc_cols_rows()
    kw = (args.get("keyword") or "").strip()
    if not kw:
        return {"error": "keyword required"}
    needles = [kw.lower()] + [s.lower() for s in _EPC_FIELD_SYNONYMS.get(kw.lower(), [])]
    matched = sorted({c for c in cols for n in needles if n in c.lower()})
    if not matched:
        return {
            "keyword": kw, "matched_columns": [], "total_epc_records": rows,
            "answer": f"No EPC field matches '{kw}'. This dataset does not include that information "
                      f"(it has {len(cols)} fields, none related to '{kw}').",
        }
    con = _epc_con()
    out = []
    try:
        for c in matched[:12]:
            nn = con.execute(f'SELECT COUNT("{c}") FROM epc').fetchone()[0]
            out.append({"column": c, "records_with_value": nn, "coverage_pct": round(nn / rows * 100, 1)})
    finally:
        con.close()
    return {"keyword": kw, "total_epc_records": rows, "matched_columns": out}


def _chat_median(xs):
    xs = sorted(x for x in xs if x is not None)
    if not xs:
        return None
    n = len(xs); m = n // 2
    return xs[m] if n % 2 else round((xs[m - 1] + xs[m]) / 2)


def _addr_building(a: str) -> str:
    """Collapse an address to its street + house number (drop the entrance letter),
    so 'Stockholmsgatan 40R' and 'Stockholmsgatan 40B' count as one building."""
    import re
    a = (a or "").strip().lower()
    mt = re.match(r"^(.*?\d+)", a)
    return mt.group(1).strip() if mt else a


def _chat_tool_booli_sales(args: dict) -> dict:
    """Booli housing SALES market (for-sale / sold / upcoming) for Gothenburg."""
    import sqlite3
    path = PROJECT_ROOT / "booli_listings.db"
    if not path.exists():
        return {"error": "Booli sales data is not available in this deployment."}
    area = (args.get("area") or "").strip().lower()
    con = sqlite3.connect(str(path)); con.row_factory = sqlite3.Row
    try:
        rows = con.execute("SELECT * FROM listings").fetchall()
    finally:
        con.close()
    if area:
        rows = [r for r in rows if area in ((r["area_name"] or "").lower())]
    if not rows:
        return {"source": "Booli housing sales (Gothenburg)", "area_filter": area or None,
                "total_listings": 0,
                "note": (f"No Booli listings match area '{area}'." if area else "No Booli listings.")}
    col = lambda k: [r[k] for r in rows if r[k] is not None]
    status = {}
    for r in rows:
        status[r["status"]] = status.get(r["status"], 0) + 1
    areas: dict = {}
    for r in rows:
        areas[r["area_name"] or "?"] = areas.get(r["area_name"] or "?", 0) + 1
    sold_prices = col("sold_price"); list_prices = col("list_price"); sqm = col("sqm_price")
    dates = [r["sold_date"] for r in rows if r["sold_date"]]
    avg = lambda xs: round(sum(xs) / len(xs)) if xs else None
    return {
        "source": "Booli — housing FOR-SALE / SOLD / UPCOMING listings in Gothenburg (weekly scrape)",
        "area_filter": area or None,
        "total_listings": len(rows),
        "distinct_buildings": len({_addr_building(r["address"]) for r in rows}),
        "distinct_addresses": len({(r["address"] or "").strip().lower() for r in rows}),
        "status_breakdown": status,
        "sold_count": len(sold_prices),
        "avg_sold_price_sek": avg(sold_prices), "median_sold_price_sek": _chat_median(sold_prices),
        "avg_list_price_sek": avg(list_prices),
        "avg_price_per_m2_sek": avg(sqm),
        "avg_living_area_m2": round(sum(col("living_area_m2")) / len(col("living_area_m2")), 1) if col("living_area_m2") else None,
        "sold_date_range": [min(dates), max(dates)] if dates else None,
        "top_areas": sorted(areas.items(), key=lambda x: -x[1])[:8],
        "note": "Each listing is one apartment/property; distinct_buildings = unique street+number addresses.",
    }


def _chat_tool_boplats_rentals(args: dict) -> dict:
    """Boplats first-hand RENTAL market (Gothenburg municipal queue)."""
    import sqlite3
    path = PROJECT_ROOT / "boplats_apartments.db"
    if not path.exists():
        return {"error": "Boplats rental data is not available in this deployment."}
    area = (args.get("area") or "").strip().lower()
    con = sqlite3.connect(str(path)); con.row_factory = sqlite3.Row
    try:
        rows = con.execute("SELECT * FROM apartments").fetchall()
    finally:
        con.close()
    if area:
        rows = [r for r in rows if area in ((r["area_name"] or "").lower()) or area in ((r["address"] or "").lower())]
    if not rows:
        return {"source": "Boplats rentals (Gothenburg)", "area_filter": area or None, "total_listings": 0,
                "note": (f"No Boplats listings match '{area}'." if area else "No Boplats listings.")}
    col = lambda k: [r[k] for r in rows if r[k] is not None]
    rents = col("rent_sek"); sizes = col("size_m2")
    rpm = [r["rent_sek"] / r["size_m2"] for r in rows if r["rent_sek"] and r["size_m2"]]
    rooms: dict = {}
    for r in rows:
        rooms[r["rooms"]] = rooms.get(r["rooms"], 0) + 1
    avg = lambda xs: round(sum(xs) / len(xs)) if xs else None
    return {
        "source": "Boplats — first-hand RENTAL listings in Gothenburg (daily scrape)",
        "area_filter": area or None,
        "total_listings": len(rows),
        "distinct_addresses": len({(r["address"] or "").strip().lower() for r in rows}),
        "avg_rent_sek_month": avg(rents), "median_rent_sek_month": _chat_median(rents),
        "avg_size_m2": round(sum(sizes) / len(sizes), 1) if sizes else None,
        "avg_rent_per_m2_month": avg(rpm),
        "rooms_distribution": {str(k): v for k, v in sorted(rooms.items(), key=lambda x: (x[0] is None, x[0]))},
        "note": "Boplats is the municipal first-hand rental queue for Gothenburg.",
    }


def _chat_tool_list_datasets(_args: dict) -> dict:
    return {
        "datasets": [
            {"name": "Buildings & EPC", "desc": "~92,973 mapped Gothenburg buildings; ~17,300 with Boverket EPC (energy class, kWh/m²/yr, area, year).",
             "tools": ["get_city_overview", "get_district_stats", "list_districts", "find_buildings_by_address", "get_epc_dataset_info", "search_epc_fields"]},
            {"name": "Booli — housing sales", "desc": "For-sale / sold / upcoming apartment & house listings from Booli (prices, price/m², area, rooms, sold date).",
             "tools": ["get_booli_sales"]},
            {"name": "Boplats — rentals", "desc": "First-hand rental listings from Gothenburg's municipal queue (rent, size, rooms, area).",
             "tools": ["get_boplats_rentals"]},
            {"name": "Neighborhoods (primärområden)", "desc": "Official Gothenburg neighborhoods with building counts.",
             "tools": ["list_districts", "get_district_stats"]},
            {"name": "SCB — Statistics Sweden", "desc": "Statistical map layers: population grid (by age/sex), DeSO/RegSO zones, urban/small settlements, green areas, workplace/business/retail zones, holiday cottages, 1 km reference grid.",
             "tools": ["get_scb_datasets"]},
        ],
        "note": "Traffic and urban analysis / space syntax are explored on the 3D map, not via this chat yet.",
    }


def _chat_tool_scb_datasets(_args: dict) -> dict:
    """Describe the Statistics Sweden (SCB) statistical map layers. Per-cell/zone
    VALUES are served live from the SCB WFS and viewed on the 3D map; this lists
    what datasets exist and their coverage."""
    return {
        "source": "Statistics Sweden (SCB) · CC0 1.0 · geodata.scb.se (live WFS)",
        "how_to_view": "3D viewer → Statistics section → toggle a layer; hover a cell/zone for its values.",
        "note": "Individual per-cell VALUES (e.g. one grid cell's population) are fetched live from SCB and shown on the map. This chat lists the datasets and their coverage; it does not compute individual cell values yet.",
        "layers": [
            {"name": "Population Grid (Befolkning)", "unit": "1×1 km grid", "contains": "Population totals by sex and five-year age bands (0–4 … 100+), all Sweden.", "years": "2015–2025"},
            {"name": "DeSO Zones", "unit": "~5,900 areas", "contains": "Demographic Statistical Areas — Sweden's primary socioeconomic unit.", "years": "2018, 2025"},
            {"name": "RegSO Zones", "contains": "Regional Statistical Areas (aggregated DeSO) for regional comparison.", "years": "2020, 2025"},
            {"name": "Urban Areas (Tätorter)", "contains": "Built-up areas ≥200 inhabitants; population + area.", "years": "1980–2023"},
            {"name": "Small Settlements (Småorter)", "contains": "Built-up areas 50–199 inhabitants.", "years": "1990–2023"},
            {"name": "Green Areas", "contains": "Urban parks/forests/recreation within tätort; size in hectares.", "years": "2010–2020"},
            {"name": "Workplace Zones", "contains": "Zones around workplace concentrations (commuting / labour market).", "years": "2000–2010"},
            {"name": "Business Zones (Verksamhetsområden)", "contains": "Industrial / commercial activity areas.", "years": "2015–2020"},
            {"name": "Retail Zones (Handelsområden)", "contains": "Concentrated retail areas / shopping centres.", "years": "2015–2020"},
            {"name": "Holiday Cottages (Fritidshusområden)", "contains": "Seasonal / holiday dwelling concentrations.", "years": "2000–2020"},
            {"name": "Statistical Grid (1 km)", "contains": "SWEREF99TM 1×1 km reference grid — framework for all SCB grid statistics.", "years": "current"},
        ],
    }


async def _chat_tool_recommend_retrofit(args: dict) -> dict:
    address = (args.get("address") or "").strip()
    if not address:
        return {"error": "address required"}
    return await _recommend_retrofit_impl(address, validate_epsm=True)


_CHAT_TOOLS = [
    {"name": "get_city_overview",
     "description": "Overall statistics for all mapped buildings in central Gothenburg: total count, EPC-rated count and coverage, average specific energy use, energy-class distribution, average build year and heated area.",
     "input_schema": {"type": "object", "properties": {}, "required": []}},
    {"name": "get_district_stats",
     "description": "Statistics for one Gothenburg neighborhood (primärområde) such as Majorna, Lindholmen, Gamlestaden, Askim. Returns building count, EPC-rated count/coverage, average specific energy use (kWh/m²/yr), energy-class distribution, average build year and heated floor area.",
     "input_schema": {"type": "object", "properties": {"district": {"type": "string", "description": "Neighborhood name"}}, "required": ["district"]}},
    {"name": "list_districts",
     "description": "List every Gothenburg neighborhood (primärområde) with its building count.",
     "input_schema": {"type": "object", "properties": {}, "required": []}},
    {"name": "find_buildings_by_address",
     "description": "Find buildings whose street address (any entrance) matches a query. Returns EPC class, specific energy use, build year, use type, neighborhood and heated area for each match.",
     "input_schema": {"type": "object", "properties": {"query": {"type": "string", "description": "Street/address text to search for"}}, "required": ["query"]}},
    {"name": "get_epc_dataset_info",
     "description": "Describe the raw Boverket EPC (energideklaration) dataset itself: total records, distinct declarations, which FIELDS it contains and which are NOT included (e.g. owner name is not present). Use this for questions about what data an EPC holds or what fields the dataset has.",
     "input_schema": {"type": "object", "properties": {}, "required": []}},
    {"name": "search_epc_fields",
     "description": "Check whether the EPC dataset contains a given kind of field and how many records populate it. Give a keyword/concept (e.g. 'owner name', 'ventilation', 'radon', 'cooling', 'energy class'); returns the matching EPC columns with their record counts and coverage %, or states clearly that no such field exists. Use this to answer 'how many EPCs have X' or 'do EPCs include X' questions.",
     "input_schema": {"type": "object", "properties": {"keyword": {"type": "string", "description": "Field concept to look for, e.g. 'owner name', 'ventilation', 'radon'"}}, "required": ["keyword"]}},
    {"name": "get_booli_sales",
     "description": "Housing SALES market from Booli for Gothenburg: for-sale / sold / upcoming apartment & house listings — counts, sold vs list prices, price per m², living area, and top neighborhoods. Optional 'area' filters to one neighborhood (e.g. Majorna, Johanneberg, Kviberg). Use for ANY question about property prices, sales, what's for sale, or the housing market.",
     "input_schema": {"type": "object", "properties": {"area": {"type": "string", "description": "Optional neighborhood/area name to filter by"}}, "required": []}},
    {"name": "get_boplats_rentals",
     "description": "Rental market from Boplats (Gothenburg's municipal first-hand rental queue): listing count, average/median monthly rent, rent per m², apartment size, room distribution, by area. Optional 'area' filter. Use for ANY question about rents, rentals, or the rental market.",
     "input_schema": {"type": "object", "properties": {"area": {"type": "string", "description": "Optional neighborhood/area name to filter by"}}, "required": []}},
    {"name": "get_scb_datasets",
     "description": "List the Statistics Sweden (SCB) statistical map layers available: population grid (by sex/age), DeSO/RegSO zones, urban & small settlements, green areas, workplace/business/retail zones, holiday cottages, and the 1 km reference grid — with what each contains, coverage years and source. Use for questions about SCB statistics, demographics, population, settlements, land use, or what statistical layers exist. NOTE: individual per-cell VALUES are viewed live on the 3D map, not computed here.",
     "input_schema": {"type": "object", "properties": {}, "required": []}},
    {"name": "recommend_retrofit",
     "description": "Recommend the BEST renovation / retrofit package for a building by street address in Gothenburg, optimizing cost and energy. Resolves the building, searches the Wikells material catalogue with the degree-day optimizer, and returns THREE options — cheapest, lowest-energy (deepest), and best cost-energy balance — each with its measures, U-values, energy-reduction % and cost; the balanced pick is validated in EnergyPlus (EPSM). Use for ANY 'what is the best retrofit / renovation package for <address>' question. Takes ~15–30 s (runs a real simulation). Sweden/Gothenburg only.",
     "input_schema": {"type": "object", "properties": {"address": {"type": "string", "description": "Street address, e.g. 'Mandolingatan 22' or just 'Mandolingatan'"}}, "required": ["address"]}},
    {"name": "list_datasets",
     "description": "List every dataset this assistant can query (buildings/EPC, Booli housing sales, Boplats rentals, neighborhoods, SCB statistics) and which tool answers each. Use when the user asks what data is available or what you can answer.",
     "input_schema": {"type": "object", "properties": {}, "required": []}},
]

_CHAT_TOOL_IMPL = {
    "get_city_overview":         _chat_tool_city_overview,
    "get_district_stats":        _chat_tool_district_stats,
    "list_districts":            _chat_tool_list_districts,
    "find_buildings_by_address": _chat_tool_find_address,
    "get_epc_dataset_info":      _chat_tool_epc_dataset_info,
    "search_epc_fields":         _chat_tool_search_epc_fields,
    "get_booli_sales":           _chat_tool_booli_sales,
    "get_boplats_rentals":       _chat_tool_boplats_rentals,
    "get_scb_datasets":          _chat_tool_scb_datasets,
    "recommend_retrofit":        _chat_tool_recommend_retrofit,
    "list_datasets":             _chat_tool_list_datasets,
}

_CHAT_SYSTEM = (
    "You are the assistant for the Project Planning Guide — a building-energy and "
    "retrofit planning dashboard for Gothenburg, Sweden. You help users understand "
    "the building stock and its energy data.\n\n"
    "Data context:\n"
    "- ~92,973 mapped buildings in central Gothenburg (geometry from EUBUCCO/OSM).\n"
    "- Energy Performance Certificates (EPC = energideklaration, from Boverket) cover "
    "~17,300 buildings: specific energy use (kWh/m²/yr), energy class A–G, heated floor "
    "area (ATEMP), and build year.\n"
    "- Buildings are grouped into official neighborhoods (primärområden) such as Majorna, "
    "Lindholmen, Gamlestaden, Askim.\n"
    "- Construction U-values come from TABULA archetypes.\n"
    "- The underlying national Boverket EPC register (~1.88M records) can be inspected for "
    "which FIELDS it contains and their coverage (get_epc_dataset_info, search_epc_fields). "
    "It has energy, class, area, year, address, cadastral and technical fields, but NO "
    "owner-name or personal-data fields.\n"
    "- Booli housing SALES: apartment & house listings scraped from Booli (for-sale / sold / "
    "upcoming) with prices, price per m², area, rooms and sold date — query with get_booli_sales.\n"
    "- Boplats RENTALS: first-hand rental listings from Gothenburg's municipal queue (monthly "
    "rent, size, rooms, area) — query with get_boplats_rentals.\n"
    "- SCB (Statistics Sweden) statistical layers: population grid (by sex/age), DeSO/RegSO "
    "zones, urban & small settlements, green areas, workplace/business/retail zones, holiday "
    "cottages, the 1 km reference grid — describe them with get_scb_datasets (individual "
    "per-cell values are viewed live on the 3D map, not computed in chat).\n"
    "- Retrofit recommendation: for 'best renovation / retrofit package for <address>' questions, "
    "use recommend_retrofit — it resolves the building, runs the optimizer over the Wikells "
    "material catalogue and returns THREE options (cheapest / lowest-energy / best cost-energy "
    "balance), with the balanced pick validated in EnergyPlus. Present ALL THREE with each one's "
    "energy reduction % and cost, and note which is EPSM-validated.\n"
    "- Call list_datasets if you're unsure which datasets exist.\n\n"
    "Rules:\n"
    "- ALWAYS use the tools to get real numbers. NEVER invent or guess statistics.\n"
    "- For questions about what an EPC/energideklaration contains, which fields exist, or "
    "'how many EPCs have <field>', use get_epc_dataset_info and search_epc_fields rather "
    "than declining — even if the field turns out not to exist, confirm that via the tool.\n"
    "- Detect the user's language (English or Swedish) and reply in THAT SAME language: "
    "a Swedish question gets a Swedish answer, an English question gets an English answer.\n"
    "- Be concise and friendly; give numbers with brief context.\n"
    "- If a neighborhood is not found, offer the closest matches the tool suggests.\n"
    "- You answer about this Gothenburg dataset — the building/energy stock, the Booli housing-"
    "sales market, the Boplats rental market, and its neighborhoods — plus how to use the "
    "dashboard. If you're unsure whether something is covered, call list_datasets rather than "
    "declining. For questions truly outside this data, politely say so in the user's language."
)


class ChatTurn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatTurn]


async def _run_tool(name: str, args: dict) -> dict:
    import inspect
    impl = _CHAT_TOOL_IMPL.get(name)
    if not impl:
        return {"error": "unknown tool"}
    try:
        res = impl(args)
        if inspect.isawaitable(res):   # async tools (e.g. recommend_retrofit) are awaited
            res = await res
        return res
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)}


async def _chat_openai(turns: list, key: str) -> dict:
    """ChatGPT (OpenAI) function-calling loop over the building-data tools."""
    import httpx
    headers = {"Authorization": f"Bearer {key}", "content-type": "application/json"}
    tools = [{"type": "function",
              "function": {"name": t["name"], "description": t["description"],
                           "parameters": t["input_schema"]}} for t in _CHAT_TOOLS]
    msgs: list = [{"role": "system", "content": _CHAT_SYSTEM}] + turns
    async with httpx.AsyncClient(timeout=60) as client:
        for _ in range(6):
            payload = {"model": "gpt-4o", "messages": msgs, "tools": tools, "temperature": 0.2}
            r = await client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
            data = r.json()
            if "error" in data:
                return {"configured": True, "reply": f"Sorry, the assistant hit an error: {data['error'].get('message', '')}"}
            msg = data["choices"][0]["message"]
            msgs.append(msg)
            calls = msg.get("tool_calls")
            if calls:
                for tc in calls:
                    fn = tc["function"]["name"]
                    try:
                        a = json.loads(tc["function"].get("arguments") or "{}")
                    except Exception:  # noqa: BLE001
                        a = {}
                    msgs.append({"role": "tool", "tool_call_id": tc["id"],
                                 "content": json.dumps(await _run_tool(fn, a), ensure_ascii=False)})
                continue
            return {"configured": True, "reply": (msg.get("content") or "…").strip()}
    return {"configured": True, "reply": "Sorry, I couldn't complete that — please try rephrasing."}


async def _chat_anthropic(turns: list, key: str) -> dict:
    """Claude tool-use loop (fallback when only ANTHROPIC_API_KEY is set)."""
    import httpx
    headers = {"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
    conv: list = list(turns)
    async with httpx.AsyncClient(timeout=60) as client:
        for _ in range(6):
            payload = {"model": "claude-sonnet-4-5", "max_tokens": 1024,
                       "system": _CHAT_SYSTEM, "tools": _CHAT_TOOLS, "messages": conv}
            r = await client.post("https://api.anthropic.com/v1/messages", headers=headers, json=payload)
            data = r.json()
            if data.get("type") == "error" or "content" not in data:
                return {"configured": True, "reply": f"Sorry, the assistant hit an error: {data.get('error', {}).get('message', 'unknown error')}"}
            content = data["content"]
            conv.append({"role": "assistant", "content": content})
            if data.get("stop_reason") == "tool_use":
                results = [{"type": "tool_result", "tool_use_id": b.get("id"),
                            "content": json.dumps(await _run_tool(b.get("name"), b.get("input", {})), ensure_ascii=False)}
                           for b in content if b.get("type") == "tool_use"]
                conv.append({"role": "user", "content": results})
                continue
            text = "".join(b.get("text", "") for b in content if b.get("type") == "text")
            return {"configured": True, "reply": text.strip() or "…"}
    return {"configured": True, "reply": "Sorry, I couldn't complete that — please try rephrasing."}


@app.post("/api/chat")
async def chat(req: ChatRequest):
    """Bilingual, data-grounded chatbot. Prefers ChatGPT (OPENAI_API_KEY),
    falls back to Claude (ANTHROPIC_API_KEY). Returns {reply, configured}."""
    openai_key = os.environ.get("OPENAI_API_KEY", "").strip()
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    turns = [{"role": m.role, "content": m.content}
             for m in req.messages if m.role in ("user", "assistant") and m.content]
    if not turns or turns[-1]["role"] != "user":
        raise HTTPException(400, "The last message must be from the user.")
    if not openai_key and not anthropic_key:
        return {"configured": False,
                "reply": "The assistant isn't configured yet — add OPENAI_API_KEY (or ANTHROPIC_API_KEY) "
                         "to the backend .env to enable it. / Assistenten är inte konfigurerad ännu — lägg "
                         "till OPENAI_API_KEY (eller ANTHROPIC_API_KEY) i backend-.env för att aktivera den."}
    try:
        if openai_key:
            return await _chat_openai(turns, openai_key)
        return await _chat_anthropic(turns, anthropic_key)
    except Exception as e:  # noqa: BLE001
        return {"configured": True, "reply": f"Sorry, the assistant is unavailable right now ({e})."}


# ── Live electricity spot price (day-ahead) ─────────────────────────────────
#
# Sweden: elprisetjustnu.se — a free, no-auth JSON feed of Nord Pool day-ahead
# spot prices per bidding zone (Gothenburg = SE3). Fields per hour:
#   { "SEK_per_kWh": .., "EUR_per_kWh": .., "EXR": .., "time_start", "time_end" }
# Prices are the raw spot (excl. VAT, grid fee, tax) — the marginal energy price
# the optimizer needs for operating-cost discounting.

_ENERGY_PRICE_CACHE: dict = {}   # (country, date) -> payload


@app.get("/api/energy-price")
async def energy_price(country: str = Query("se"), zone: str = Query("SE3")):
    """Day-ahead electricity spot price. country=se uses Nord Pool via
    elprisetjustnu.se (zone SE1–SE4, Gothenburg=SE3). Returns the daily average
    plus hourly series and the source. country=uk is pending a live UK source."""
    import httpx
    from datetime import date, timedelta

    c = country.lower()
    if c == "uk":
        # Octopus Agile — a free, no-auth half-hourly UK tariff that tracks the
        # wholesale (day-ahead) price; region "C" = London. value_exc_vat (p/kWh)
        # is the wholesale-tracking rate, comparable to the SE spot (excl. VAT).
        url = ("https://api.octopus.energy/v1/products/AGILE-24-04-03/"
               "electricity-tariffs/E-1R-AGILE-24-04-03-C/standard-unit-rates/?page_size=48")
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(url)
            data = r.json() if r.status_code == 200 else {}
            results = data.get("results") or []
        except Exception:  # noqa: BLE001
            results = []
        pkwh = [row.get("value_exc_vat") for row in results
                if isinstance(row.get("value_exc_vat"), (int, float))]
        if not pkwh:
            return {"country": "uk", "live": False,
                    "note": "UK price temporarily unavailable from the source.",
                    "source": "https://octopus.energy/agile/"}
        gbp = [round(p / 100.0, 4) for p in pkwh]  # p/kWh -> GBP/kWh
        return {
            "country": "uk",
            "zone": "GB (region C, London)",
            "live": True,
            "unit": "GBP/kWh",
            "average_price": round(sum(gbp) / len(gbp), 4),
            "min_price": min(gbp),
            "max_price": max(gbp),
            "hourly": [{"start": row.get("valid_from"), "gbp_per_kwh": round(row["value_exc_vat"] / 100.0, 4)}
                       for row in results if isinstance(row.get("value_exc_vat"), (int, float))],
            "note": "Octopus Agile half-hourly rate (tracks GB wholesale/day-ahead), excl. VAT.",
            "source": "https://octopus.energy/agile/ (tracks GB wholesale)",
        }

    z = zone.upper()
    if not z.startswith("SE") or z not in {"SE1", "SE2", "SE3", "SE4"}:
        z = "SE3"

    async def _fetch(d: date):
        url = f"https://www.elprisetjustnu.se/api/v1/prices/{d.year}/{d.month:02d}-{d.day:02d}_{z}.json"
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(url)
        if r.status_code != 200:
            return None
        try:
            rows = r.json()
        except Exception:  # noqa: BLE001
            return None
        return rows if isinstance(rows, list) and rows else None

    # Try today, then yesterday (day-ahead for "today" may not be posted yet).
    today = date.today()
    rows = None
    used = None
    for d in (today, today - timedelta(days=1)):
        key = (z, d.isoformat())
        if key in _ENERGY_PRICE_CACHE:
            rows, used = _ENERGY_PRICE_CACHE[key], d
            break
        try:
            rows = await _fetch(d)
        except Exception:  # noqa: BLE001
            rows = None
        if rows:
            _ENERGY_PRICE_CACHE[key] = rows
            used = d
            break

    if not rows:
        return {"country": "se", "zone": z, "live": False,
                "note": "Spot price temporarily unavailable from the source.",
                "source": "https://www.elprisetjustnu.se"}

    sek = [row.get("SEK_per_kWh") for row in rows if isinstance(row.get("SEK_per_kWh"), (int, float))]
    avg = round(sum(sek) / len(sek), 4) if sek else None
    return {
        "country": "se",
        "zone": z,
        "live": True,
        "date": used.isoformat() if used else None,
        "unit": "SEK/kWh",
        "average_price": avg,
        "min_price": round(min(sek), 4) if sek else None,
        "max_price": round(max(sek), 4) if sek else None,
        "hourly": [{"start": row.get("time_start"), "sek_per_kwh": row.get("SEK_per_kWh")} for row in rows],
        "note": "Nord Pool day-ahead spot, excl. VAT/grid/energy tax.",
        "source": "https://www.elprisetjustnu.se (Nord Pool day-ahead)",
    }


# ── Environmental analysis: shared helpers ────────────────────────────────────
def _analysis_buildings(country: str, city_id: str) -> list:
    """Building set to shade an analysis: UK city buildings for 'gb', else the
    Swedish (Gothenburg) set. Keeps every site analysis correct per country."""
    if (country or "").lower() == "gb":
        return _get_uk_buildings_list(city_id or "")
    return _get_buildings_list()


def _analysis_epw_path(city_id: str) -> "Path":
    """EPW weather file for a city_id (SE or UK), via CITY_TO_EPW."""
    epw_name = CITY_TO_EPW.get(city_id or "gothenburg") or CITY_TO_EPW["gothenburg"]
    epw_path = EPW_DIR / epw_name
    if not epw_path.exists():
        raise HTTPException(500, f"Weather file missing on server: {epw_path.name}")
    return epw_path


# ── Environmental analysis: direct sun-hours (MIT-clean; backend/sun_hours.py) ─
class SunHoursRequest(BaseModel):
    lat: float
    lon: float
    radius_m: float = 150
    grid_m: float = 5
    date: str = "2026-06-21"
    base_tz: float = 1.0   # standard UTC offset for clock labels (SE=1, UK=0); DST added server-side
    country: str = "se"    # "se" | "gb" — selects which city's buildings shade the disc
    city_id: str = "gothenburg"


@app.post("/api/analysis/sun-hours")
def api_sun_hours(req: SunHoursRequest):
    """Direct sun-hours over a ground disc of radius_m around (lat, lon) for one
    day, shaded by the surrounding buildings. Returns the cumulative sun-hours
    grid plus per-timestep lit/shaded `frames` for the hour-of-day slider."""
    from backend.sun_hours import compute_sun_hours
    return compute_sun_hours(req.lat, req.lon, req.radius_m, req.grid_m,
                             _analysis_buildings(req.country, req.city_id), req.date,
                             base_tz=req.base_tz)


# ── Environmental analysis: incident radiation (MIT clean-room; EPW-driven) ────
class IncidentRadiationRequest(BaseModel):
    lat: float
    lon: float
    radius_m: float = 150
    grid_m: float = 5
    country: str = "se"           # "se" | "gb"
    city_id: str = "gothenburg"   # selects the EPW weather file via CITY_TO_EPW


@app.post("/api/analysis/incident-radiation")
def api_incident_radiation(req: IncidentRadiationRequest):
    """Cumulative incident solar radiation (kWh/m²) over a ground disc around
    (lat, lon), from an EPW cumulative sky matrix, shaded by the surrounding
    buildings. Returns per-season grids (year/summer/equinox/winter)."""
    epw_path = _analysis_epw_path(req.city_id)
    from backend.incident_radiation import compute_incident
    return compute_incident(req.lat, req.lon, req.radius_m, req.grid_m,
                            _analysis_buildings(req.country, req.city_id), str(epw_path))


class IncidentSurfacesRequest(BaseModel):
    lat: float
    lon: float
    radius_m: float = 90
    grid_m: float = 5
    country: str = "se"
    city_id: str = "gothenburg"


@app.post("/api/analysis/incident-surfaces")
def api_incident_surfaces(req: IncidentSurfacesRequest):
    """Incident solar radiation (kWh/m²) on building ROOFS and FACADES within the
    radius, shaded by surrounding buildings (opaque) + tree crowns (semi-transparent,
    SE only). Returns per-surface-cell quads with per-season values."""
    epw_path = _analysis_epw_path(req.city_id)
    buildings = _analysis_buildings(req.country, req.city_id)
    veg = (PROJECT_ROOT / "frontend" / "public" / "dtcc_vegetation.json") if (req.country or "se") != "gb" else None
    from backend.incident_radiation import compute_incident_surfaces
    return compute_incident_surfaces(req.lat, req.lon, req.radius_m, req.grid_m, buildings,
                                     str(epw_path), str(veg) if veg and veg.exists() else "")


# ── Facade defect detection (proxy to the on-host ML inference service) ────────
FACADE_ML_URL = os.environ.get("FACADE_ML_URL", "http://host.docker.internal:8020")


@app.post("/api/facade-detect")
async def facade_detect(request: Request, threshold: float = 0.5):
    """Forward a captured facade image to the on-host ML service and return the
    detected defects (crack/leakage/abscission/corrosion/bulge) as boxes."""
    import httpx
    body = await request.body()
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(f"{FACADE_ML_URL}/detect", params={"threshold": threshold},
                                  content=body, headers={"content-type": "application/octet-stream"})
        return JSONResponse(r.json(), status_code=r.status_code)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503, f"Facade ML service unreachable at {FACADE_ML_URL}. Start it with "
                                 f"`python tools/ml/facade_detect_service.py`. ({type(e).__name__})")


# ── Environmental analysis: outdoor thermal comfort (UTCI + solar MRT) ─────────
# MIT clean-room + the MIT-licensed pythermalcomfort library (no Ladybug code).
class ThermalComfortRequest(BaseModel):
    lat: float
    lon: float
    radius_m: float = 150
    grid_m: float = 5
    date: str = "2026-06-21"
    mode: str = "hourly"          # "hourly" (a day's frames) | "seasonal" (comfort %)
    country: str = "se"           # "se" | "gb"
    city_id: str = "gothenburg"


@app.post("/api/analysis/thermal-comfort")
def api_thermal_comfort(req: ThermalComfortRequest):
    """Outdoor UTCI over a ground disc. mode='hourly' → per-hour frames for the
    given day (UTCI + stress category per cell). mode='seasonal' → per-cell share
    of daytime hours in the comfortable band, for each season. EPW climate +
    SolarCal solar MRT, shaded by the surrounding buildings."""
    epw_path = _analysis_epw_path(req.city_id)
    buildings = _analysis_buildings(req.country, req.city_id)
    if req.mode == "seasonal":
        from backend.thermal_comfort import compute_comfort_seasons
        return compute_comfort_seasons(req.lat, req.lon, req.radius_m, req.grid_m,
                                       buildings, str(epw_path))
    from backend.thermal_comfort import compute_comfort
    return compute_comfort(req.lat, req.lon, req.radius_m, req.grid_m,
                           buildings, str(epw_path), req.date)


# -- Static frontend (built React SPA + standalone 3D maps) -----------------
# Only mounted when the build output exists; harmless during local API-only dev.
_FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
_MAP_FILE      = PROJECT_ROOT / "assets" / "gothenburg_3d.html"
_UK_MAP_FILE   = PROJECT_ROOT / "assets" / "uk_3d.html"

@app.get("/gothenburg_3d.html", include_in_schema=False)
def _serve_map():
    if not _MAP_FILE.exists():
        raise HTTPException(404, "Map file not built into image")
    return FileResponse(_MAP_FILE, media_type="text/html")

@app.get("/uk_3d.html", include_in_schema=False)
def _serve_uk_map():
    if not _UK_MAP_FILE.exists():
        raise HTTPException(404, "UK map not built - run tools/uk/uk_data_pipeline.py then build.py")
    return FileResponse(_UK_MAP_FILE, media_type="text/html")

if _FRONTEND_DIST.exists():
    from starlette.exceptions import HTTPException as StarletteHTTPException

    class _SPAStaticFiles(StaticFiles):
        """Serve real static files, fall back to index.html for client-side routes."""
        async def get_response(self, path, scope):
            try:
                return await super().get_response(path, scope)
            except StarletteHTTPException as exc:
                if exc.status_code == 404:
                    return await super().get_response("index.html", scope)
                raise

    app.mount("/", _SPAStaticFiles(directory=str(_FRONTEND_DIST), html=True), name="spa")
