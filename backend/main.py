"""
FastAPI backend — wraps existing Python modules (EPC, TABULA, Boverket, sensitivity).
Run:  uvicorn backend.main:app --reload --port 8000
"""
from __future__ import annotations

import sys
from pathlib import Path
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

# Allow imports from the project root so existing modules work unchanged
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

app = FastAPI(title="Project Planning Guide API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ──────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok"}


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
