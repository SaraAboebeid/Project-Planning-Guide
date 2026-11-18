"""
EPSM's Swedish archetypes (epsm_data 0.7.0) as inputs for our energy models.

The table is built by tools/epsm/build_archetypes.py → tools/idf/epsm_archetypes_se.json.
``inputs_for(building)`` picks the archetype from the building's use and
construction year (existing state) and returns what the RC model needs:

  fabric    U wall / roof / window (+ office thermal-bridge ΔU), window SHGC
  ground    the floor's own construction resistance, for an ISO 13370 ground U
  air       infiltration + the era's ventilation template (S / F / FT / FTX)
            with the Sveby flow for the use, time-averaged over operating hours
  wwr       window-to-wall ratio per orientation
  setpoint  multi-family: BETSI measured temperature by era; others Sveby

Buildings without a construction year get no archetype (None): the caller
keeps its own defaults rather than guessing an era.
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Optional

TABLE = Path(__file__).resolve().parents[1] / "tools" / "idf" / "epsm_archetypes_se.json"
ALL_PARTS = frozenset({"fabric", "ground", "air", "wwr", "setpoint"})
SOIL_LAMBDA = 2.0          # W/mK, ISO 13370 default for clay/silt
WALL_THICKNESS_M = 0.3     # ISO 13370 'w'
RSI_FLOOR, RSE_SOIL = 0.17, 0.04


@lru_cache(maxsize=1)
def table() -> dict:
    return json.loads(TABLE.read_text(encoding="utf-8"))


def era_for_year(year) -> Optional[str]:
    try:
        y = int(year)
    except (TypeError, ValueError):
        return None
    for era, (lo, hi) in table()["eras"].items():
        if y >= lo and (hi is None or y <= hi):
            return era
    return None


def archetype_for(building: dict) -> Optional[tuple[str, str, dict]]:
    """(category, era, existing-state record) or None."""
    t = table()
    cat = t["category_by_use"].get(building.get("use_cat") or "")
    era = era_for_year(building.get("year"))
    if not cat or not era:
        return None
    fabric_cat = t["generic_fabric_donor"] if cat == "generic" else cat
    key = f'{ {"single_family": "sf", "multi_family": "mf"}.get(fabric_cat, fabric_cat) }_{era.replace(".", "").lower()}'
    a = t["archetypes"].get(key)
    if not a:
        return None
    return cat, era, (a["states"].get("existing") or a["states"]["default"]) | {"key": key}


def iso13370_floor_u(floor_u_nominal: float, area_m2: float, exposed_perimeter_m: float) -> float:
    """Slab-on-ground U (EN ISO 13370 §9.1) from the floor's own construction."""
    if area_m2 <= 0 or exposed_perimeter_m <= 0:
        return floor_u_nominal
    r_floor = max(0.0, 1.0 / floor_u_nominal - RSI_FLOOR)   # nominal U = Rsi 0.17 + layers, no Rse
    b = area_m2 / (0.5 * exposed_perimeter_m)
    dt = WALL_THICKNESS_M + SOIL_LAMBDA * (RSI_FLOOR + r_floor + RSE_SOIL)
    if dt < b:
        return 2 * SOIL_LAMBDA / (math.pi * b + dt) * math.log(math.pi * b / dt + 1)
    return SOIL_LAMBDA / (0.457 * b + dt)


def inputs_for(building: dict, storey_height_m: float) -> Optional[dict]:
    """Archetype inputs for one building (all parts); None without an archetype."""
    found = archetype_for(building)
    if not found:
        return None
    cat, era, s = found
    t = table()
    h = max(2.2, storey_height_m)

    # Infiltration: per m² Atemp → air changes of the conditioned volume.
    if s.get("infiltration_ach") is not None:
        infil = float(s["infiltration_ach"])
    elif s.get("infiltration_l_s_m2") is not None:
        infil = float(s["infiltration_l_s_m2"]) * 3.6 / h
    else:
        infil = 0.2
    v = t["ventilation"]
    vent_cat = "multi_family" if cat == "generic" else cat
    topology = v["default_by_era"][vent_cat][era]
    tmpl = v["templates"][topology]
    if tmpl["topology"] == "S":
        vent_ach = max(0.05, v["mf_self_draught_total_ach"] - infil) if cat == "multi_family" else float(tmpl["natural_exchange_ach"])
        recovery = 0.0
    else:
        f = v["flow"][cat]
        vent_ach = float(f["l_s_m2"]) * 3.6 / h * (f["hours"] / 24) * (f["days"] / 365)
        recovery = float(tmpl.get("sensible_recovery_effectiveness") or 0.0)

    sp = t["setpoint_c"]
    setpoint = float(sp["multi_family_by_era"][era]) if cat == "multi_family" else float(sp.get(cat, 21.0))
    wwr_cat = "multi_family" if cat == "generic" else cat
    w = t["wwr_by_orientation"][wwr_cat]
    return {
        "key": s["key"], "category": cat, "era": era,
        "u_wall": s["u_wall"], "u_roof": s["u_roof"], "u_win": s["u_win"], "shgc": s["shgc"],
        "u_floor_nominal": s["u_floor"],
        "infiltration_ach": round(infil, 3), "ventilation": topology,
        "ventilation_ach": round(vent_ach, 3), "heat_recovery": recovery,
        "setpoint_c": setpoint,
        "wwr": w["default"], "wwr_by_orientation": {"north": w["N"], "east": w["E"], "south": w["S"], "west": w["W"]},
    }
