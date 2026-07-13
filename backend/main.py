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
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

# Allow imports from the project root so existing modules work unchanged
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

app = FastAPI(title="Project Planning Guide API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
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


# ── EPC snapshot ─────────────────────────────────────────────────────────────
@app.get("/api/epc/snapshot")
def epc_snapshot(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_m: int = Query(800),
):
    try:
        from utils.location_data import get_epc_data
    except ImportError:
        raise HTTPException(501, "EPC module not available")

    result = get_epc_data(lat, lon, radius_m)
    return result


# ── EPC passport ─────────────────────────────────────────────────────────────
@app.get("/api/epc/passport/{formular_id}")
def epc_passport(formular_id: str):
    try:
        from utils.location_data import get_building_passport
    except ImportError:
        raise HTTPException(501, "EPC module not available")

    passport = get_building_passport(formular_id)
    if passport is None:
        raise HTTPException(404, "Building not found")
    return passport


# ── TABULA match ─────────────────────────────────────────────────────────────
@app.get("/api/tabula/match")
def tabula_match(
    building_type: str = Query(...),
    build_year: int = Query(...),
):
    try:
        from utils.tabula_matching import match_archetype
    except ImportError:
        raise HTTPException(501, "TABULA module not available")

    archetype, confidence = match_archetype(building_type, build_year)
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
        "height":        _clean(best.get("height")),
        "floors":        _clean(best.get("floors")),
        "area_atemp":    _clean(best.get("area")),      # total GFA / Atemp from EPC
        "footprint_m2":  _clean(footprint),
        "use_cat":       best.get("use_cat"),
        "year":          _clean(best.get("year")),
        "energy":        _clean(best.get("energy")),    # kWh/m²/yr
        "eclass":        best.get("eclass"),
        "tabula_period": period,
        "tabula_u_wall": _clean(u_wall),
        "tabula_u_win":  _clean(u_win),
        "has_epc":       bool(best.get("has_epc")),
        "lat":           round(c_lat, 6),
        "lon":           round(c_lon, 6),
        "dist_m":        round(best_dist, 1),
    }


# ── All buildings within a bounding box — aggregate stats ───────────────────
@app.get("/api/buildings/bbox/stats")
def buildings_bbox_stats(
    north: float = Query(...),
    south: float = Query(...),
    east:  float = Query(...),
    west:  float = Query(...),
):
    """Return aggregate EUBUCCO stats for every building whose centroid is inside the bbox."""
    from collections import Counter
    all_buildings = _get_buildings_list()
    matched: list = []
    for b in all_buildings:
        coords = b.get("coordinates") or []
        c_lat, c_lon = _polygon_centroid(coords)
        if c_lat == 0.0 and c_lon == 0.0:
            continue
        if south <= c_lat <= north and west <= c_lon <= east:
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
@app.get("/api/buildings/bbox/list")
def buildings_bbox_list(
    north: float = Query(...),
    south: float = Query(...),
    east:  float = Query(...),
    west:  float = Query(...),
):
    """Return individual building records in bbox, joined with Boplats rental data where available."""
    import re, sqlite3, httpx
    from concurrent.futures import ThreadPoolExecutor, wait as fut_wait

    # ── Match buildings in bbox ──────────────────────────────────────────────
    all_buildings = _get_buildings_list()
    matched: list[tuple] = []
    for b in all_buildings:
        coords = b.get("coordinates") or []
        c_lat, c_lon = _polygon_centroid(coords)
        if c_lat == 0.0 and c_lon == 0.0:
            continue
        if south <= c_lat <= north and west <= c_lon <= east:
            matched.append((b, round(c_lat, 6), round(c_lon, 6)))

    if not matched:
        raise HTTPException(404, "No buildings found in bounding box")

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
            "cadastral_id":         addr if addr and _CADASTRAL_RE.match(addr.strip()) else None,
            "lat":                  lat,
            "lon":                  lon,
            "building_use":         b.get("use_cat"),
            "year_built":           b.get("year"),
            "height_m":             b.get("height"),
            "floors":               b.get("floors"),
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

    needs = [(i, row["lat"], row["lon"]) for i, row in enumerate(result) if _needs_geocode(row["address"])]
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
            "Task: Estimate the Window-to-Wall Ratio (WWR) — the percentage of the "
            "visible facade area that is glazed (windows, glass doors, curtain wall, "
            "etc.).\n\n"
            "Instructions:\n"
            "- Focus only on the dominant building in the frame.\n"
            "- Count window openings relative to total wall area.\n"
            "- If the image is unclear or shows only ground/sky, give your best "
            "estimate based on the building type and era.\n\n"
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
            '"notes": "<one sentence>"}'
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
        "source": "heuristic",
    }


# ── Västtrafik transit API proxy ─────────────────────────────────────────────
#
# Register an application at https://developer.vasttrafik.se/  and paste your
# credentials below (or set the environment variables before starting uvicorn).
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

# Paste your credentials here — read directly (not via os.environ.setdefault,
# which caches an empty string across --reload restarts).
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
        raise HTTPException(503, "Västtrafik credentials not configured. "
                                 "Set _VT_CLIENT_ID and _VT_CLIENT_SECRET in backend/main.py.")

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
    import httpx

    # Round bbox to 3 dp for cache key
    key = (round(south, 3), round(north, 3), round(west, 3), round(east, 3))
    if key in _OSM_ROAD_CACHE:
        return _OSM_ROAD_CACHE[key]

    OVERPASS_URL = "https://overpass-api.de/api/interpreter"
    # Fetch all highway ways + their nodes
    query = f"""
[out:json][timeout:25];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|service|pedestrian|cycleway|footway|path|living_street|unclassified)$"]
    ({south},{west},{north},{east});
);
(._;>;);
out body;
"""

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(OVERPASS_URL, data={"data": query})
    if r.status_code != 200:
        raise HTTPException(502, f"Overpass query failed: {r.status_code}")

    osm = r.json()

    # Build node lookup
    nodes: dict[int, tuple[float, float]] = {}
    for elem in osm.get("elements", []):
        if elem["type"] == "node":
            nodes[elem["id"]] = (elem["lon"], elem["lat"])

    # Road type → display priority / colour hint
    ROAD_CLASS = {
        "motorway": "major", "trunk": "major", "primary": "primary",
        "secondary": "secondary", "tertiary": "secondary",
        "residential": "local", "living_street": "local", "unclassified": "local",
        "service": "service", "pedestrian": "pedestrian",
        "cycleway": "cycling", "footway": "pedestrian", "path": "pedestrian",
    }

    features = []
    for elem in osm.get("elements", []):
        if elem["type"] != "way":
            continue
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
    data = r.json()
    return {
        "lotId":     lot_id,
        "available": data.get("AvailableCapacity") or data.get("available"),
        "total":     data.get("TotalCapacity")     or data.get("total"),
        "updated":   data.get("LastUpdated")       or data.get("updated"),
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


# -- Static frontend (built React SPA + standalone 3D map) ------------------
# Only mounted when the build output exists; harmless during local API-only dev.
_FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
_MAP_FILE      = PROJECT_ROOT / "assets" / "gothenburg_3d.html"

@app.get("/gothenburg_3d.html", include_in_schema=False)
def _serve_map():
    if not _MAP_FILE.exists():
        raise HTTPException(404, "Map file not built into image")
    return FileResponse(_MAP_FILE, media_type="text/html")

# -- Static frontend (built React SPA + standalone 3D map) ------------------
# Only mounted when the build output exists; harmless during local API-only dev.
_FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
_MAP_FILE      = PROJECT_ROOT / "assets" / "gothenburg_3d.html"

@app.get("/gothenburg_3d.html", include_in_schema=False)
def _serve_map():
    if not _MAP_FILE.exists():
        raise HTTPException(404, "Map file not built into image")
    return FileResponse(_MAP_FILE, media_type="text/html")

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
