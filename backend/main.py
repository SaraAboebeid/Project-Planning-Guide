"""
FastAPI backend — wraps existing Python modules (EPC, TABULA, Boverket, sensitivity).
Run:  uvicorn backend.main:app --reload --port 8000
"""
from __future__ import annotations

import gzip
import json
import math
import sys
from pathlib import Path
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

def _get_buildings_list() -> list:
    global _BUILDINGS_LIST
    if _BUILDINGS_LIST is None:
        data_path = PROJECT_ROOT / "frontend" / "public" / "buildings.json"
        _BUILDINGS_LIST = json.loads(data_path.read_bytes())
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
import os
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

    # ── OpenAI GPT-4o ─────────────────────────────────────────────────────────
    if openai_key:
        payload = {
            "model": "gpt-4o",
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
                                "detail": "low",
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
                        "source": "gpt-4o-vision",
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
