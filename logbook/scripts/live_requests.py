"""Requests the Analysis Inventory's live examples send to the tool's backend.

Pure Python (no Streamlit), so the same presets can be used to store the
offline examples and to run them live.
"""
from __future__ import annotations

import json
import math
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
API = os.environ.get("PPG_API", "http://127.0.0.1:8080").rstrip("/")

# Points the examples can run at. Each carries the country/city the backend
# needs to pick the right buildings and weather file.
PLACES = {
    "Gothenburg — Vasastaden (dense blocks)": {"lat": 57.6985, "lon": 11.9690, "country": "se", "city_id": "gothenburg", "tz": 1.0},
    "Gothenburg — Chalmers, Johanneberg": {"lat": 57.6897, "lon": 11.9767, "country": "se", "city_id": "gothenburg", "tz": 1.0},
    "Gothenburg — Lindholmen (new waterfront)": {"lat": 57.7065, "lon": 11.9380, "country": "se", "city_id": "gothenburg", "tz": 1.0},
    "London — Westminster": {"lat": 51.4973, "lon": -0.1339, "country": "gb", "city_id": "london_westminster", "tz": 0.0},
    "Rotherham — town centre": {"lat": 53.4289, "lon": -1.3624, "country": "gb", "city_id": "rotherham", "tz": 0.0},
}


class ApiError(RuntimeError):
    pass


def _open(req, timeout):
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read()).get("detail")
        except Exception:  # noqa: BLE001
            detail = None
        raise ApiError(f"the backend answered {e.code}" + (f": {detail}" if detail else "")) from None
    except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
        raise ApiError(f"could not reach the backend at {API} ({type(e).__name__})") from None


def post(path: str, body: dict, timeout: float = 300) -> dict:
    req = urllib.request.Request(API + path, data=json.dumps(body).encode(),
                                 headers={"content-type": "application/json"})
    return _open(req, timeout)


def get(path: str, params: dict, timeout: float = 300) -> dict:
    return _open(API + path + "?" + urllib.parse.urlencode(params), timeout)


def backend_up() -> bool:
    try:
        _open(API + "/api/health", 2)
        return True
    except ApiError:
        return False


# ── optimiser preset ─────────────────────────────────────────────────────────
# A typical 1961–75 multi-family block in the Gothenburg model: the medians of
# the 1,604 such buildings (footprint 748 m², 4 floors, 11.1 m, certificate
# energy 123 kWh/m²·yr, TABULA U-values wall 0.41 / roof 0.20 / window 2.22).
# Floor U 0.30 and WWR 20% are assumptions of this example.
BLOCK = {"footprint_m2": 748.0, "floors": 4, "height_m": 11.1, "wwr": 0.20,
         "baseline_kwh_m2_yr": 123.0,
         "u": {"Walls": 0.41, "Roof": 0.20, "Windows": 2.22, "Floor": 0.30}}


def block_areas(b: dict = BLOCK) -> dict:
    side = math.sqrt(b["footprint_m2"])
    gross_wall = 4 * side * b["height_m"]
    return {"Walls": round(gross_wall * (1 - b["wwr"]), 1), "Windows": round(gross_wall * b["wwr"], 1),
            "Roof": b["footprint_m2"], "Floor": b["footprint_m2"],
            "floor_area": b["footprint_m2"] * b["floors"]}


def optimiser_request(energy_price: float = 0.8, discount_rate: float = 0.03,
                      degree_days: float = 3300.0, b: dict = BLOCK) -> dict:
    """Same request shape the Step 4 builder sends (RenovationSimulator.tsx):
    every Wikells element of each component is an option, cost = SEK/m² × area.
    Embodied carbon is left at 0 here; the wizard adds it from Boverket."""
    cat = json.loads((REPO_ROOT / "data" / "wikells_catalogue.json").read_text(encoding="utf-8"))
    areas = block_areas(b)
    comps = []
    for key in ("Walls", "Roof", "Windows", "Floor"):
        opts = [{"code": o["code"], "label": o["description"], "u_value": o["u_value"],
                 "cost": round(o["cost_sek_m2"] * areas[key]), "carbon": 0.0}
                for o in cat.get(key, [])]
        comps.append({"key": key, "area_m2": areas[key], "baseline_u": b["u"][key], "options": opts})
    return {"components": comps,
            "params": {"f_dh": 24 * degree_days / 1000, "energy_price": energy_price,
                       "carbon_factor_heat": 0.022, "discount_rate": discount_rate,
                       "study_period_yr": 30, "floor_area_m2": areas["floor_area"],
                       "baseline_total_kwh_m2_yr": b["baseline_kwh_m2_yr"]},
            "max_results": 24, "max_combos": 100000, "cloud_cap": 3000}
