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

# ── API keys — paste your keys here if not using environment variables ───────
os.environ.setdefault("OPENAI_API_KEY", "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")      # ← paste OpenAI key
# os.environ.setdefault("ANTHROPIC_API_KEY", "sk-ant-...") # ← paste Anthropic key
# ────────────────────────────────────────────────────────────────────────────
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

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
    if u_wall is None or u_win is None:
        derived_u_wall, derived_u_win = _derive_u_values(
            best.get("use_cat"), best.get("tabula_period")
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
        "tabula_period": best.get("tabula_period"),
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
