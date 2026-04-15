"""
TABULA / EPISCOPE Archetype Matching Engine
=============================================
Maps EPC (Energy Performance Certificate) building data to the closest
TABULA residential archetype for Sweden.

Coverage:
  - 10 archetypes (5 SFH + 5 MFH)
  - 5 construction periods: ...1960, 1961-1975, 1976-1985, 1986-1995, 1996-2005
  - 3 Swedish climate zones

Data sources loaded from:
  data/sensitivity/FW_ Map selection in notebook/tabula_swedish_data.json
  data/sensitivity/FW_ Map selection in notebook/tabula_webtool_scraped.json
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import streamlit as st

# ── Paths ────────────────────────────────────────────────────────────
_DATA_DIR = (
    Path(__file__).resolve().parents[1]
    / "data" / "sensitivity" / "FW_ Map selection in notebook"
)

# ── TABULA period definitions ────────────────────────────────────────
TABULA_PERIODS: list[tuple[str, Optional[int], int]] = [
    ("...1960",    None, 1960),
    ("1961-1975",  1961, 1975),
    ("1976-1985",  1976, 1985),
    ("1986-1995",  1986, 1995),
    ("1996-2005",  1996, 2005),
]

BUILDING_TYPE_LABELS = {
    "SFH": "Single-Family House (Småhus)",
    "MFH": "Multi-Family House (Flerbostadshus)",
}

# ── Swedish climate-zone mapping ─────────────────────────────────────
# Zone 1 = north (Norrbotten, Västerbotten, Jämtland …)
# Zone 2 = central (Dalarna, Gävleborg, Värmland …)
# Zone 3 = south (Västra Götaland, Skåne, Stockholm …)
# Mapping: län (county) → zone number (1–3)
COUNTY_CLIMATE_ZONE: dict[str, int] = {
    # Zone 1 — Northern Sweden
    "norrbotten":    1,  "norrbottens":  1,
    "västerbotten":  1,  "västerbottens": 1,
    "jämtland":      1,  "jämtlands":    1,
    # Zone 2 — Central Sweden
    "västernorrland":  2, "västernorrlands": 2,
    "gävleborg":   2, "gävleborgs": 2,
    "dalarna":     2, "dalarnas":   2,
    "värmland":    2, "värmlands":  2,
    "örebro":      2,
    "västmanland": 2, "västmanlands": 2,
    "uppsala":     2,
    "södermanland": 2, "södermanlands": 2,
    # Zone 3 — Southern Sweden
    "stockholm":       3, "stockholms": 3,
    "östergötland":    3, "östergötlands": 3,
    "jönköping":       3, "jönköpings": 3,
    "kronoberg":       3, "kronobergs": 3,
    "kalmar":          3,
    "gotland":         3, "gotlands": 3,
    "blekinge":        3,
    "skåne":           3,
    "halland":         3, "hallands": 3,
    "västra götaland": 3, "västra götalands": 3,
}

# ── Latitude-based fallback ──────────────────────────────────────────
def climate_zone_from_lat(lat: float) -> int:
    """Rough climate-zone estimate from latitude."""
    if lat >= 63.0:
        return 1
    elif lat >= 60.0:
        return 2
    else:
        return 3


def climate_zone_from_county(county_name: str) -> Optional[int]:
    """Look up climate zone from a Swedish county name (case-insensitive)."""
    if not county_name:
        return None
    key = county_name.strip().lower().replace(" län", "").replace(" county", "")
    return COUNTY_CLIMATE_ZONE.get(key)


# ── Data loading (cached) ───────────────────────────────────────────
@st.cache_data(ttl=None)
def _load_tabula_data() -> tuple[dict, dict]:
    """Load both TABULA JSON files and return (envelope_dict, energy_dict)."""
    with open(_DATA_DIR / "tabula_swedish_data.json", encoding="utf-8") as f:
        envelope = json.load(f)
    with open(_DATA_DIR / "tabula_webtool_scraped.json", encoding="utf-8") as f:
        energy = json.load(f)
    return envelope, energy


def _get_combined_lookup() -> dict[tuple[str, str], dict]:
    """
    Build a lookup: (building_type, period) → combined archetype dict.
    Cached implicitly via _load_tabula_data.
    """
    envelope, energy = _load_tabula_data()
    buildings_energy = energy.get("buildings", {})
    lookup: dict[tuple[str, str], dict] = {}

    for code, env in envelope.items():
        btype = env["building_type"]  # "SFH" or "MFH"
        period = env["period"]
        eng = buildings_energy.get(code, {})
        zones = eng.get("zones", {})

        lookup[(btype, period)] = {
            "code": code,
            "building_type": btype,
            "type_label": BUILDING_TYPE_LABELS.get(btype, btype),
            "period": period,
            "u_values": env["u_values"],
            "areas_m2": env["areas"],
            "construction_types": env.get("construction_types", {}),
            "zones": {
                int(z): zdata for z, zdata in zones.items()
            },
            "heating_demand_net": {
                f"zone_{z}": zones.get(str(z), {}).get("net_energy_demand")
                for z in (1, 2, 3)
            },
            "heating_demand_gross": {
                f"zone_{z}": zones.get(str(z), {}).get("gross_energy_demand_calc")
                for z in (1, 2, 3)
            },
        }
    return lookup


# ── Public matching functions ────────────────────────────────────────

def year_to_tabula_period(year: int) -> Optional[str]:
    """Map a construction year to the TABULA period label."""
    if year is None:
        return None
    year = int(year)
    if year <= 1960:
        return "...1960"
    elif year <= 1975:
        return "1961-1975"
    elif year <= 1985:
        return "1976-1985"
    elif year <= 1995:
        return "1986-1995"
    elif year <= 2005:
        return "1996-2005"
    return None  # Post-2005: no TABULA archetype available


def epc_to_building_type(epc_category: str) -> Optional[str]:
    """
    Map an EPC building category string to SFH or MFH.
    Handles common Swedish EPC labels and typkoder.
    """
    if not epc_category:
        return None
    cat = str(epc_category).strip().lower()

    sfh_keywords = [
        "småhus", "villa", "radhus", "kedjehus", "parhus",
        "friliggande", "single-family", "sfh",
    ]
    mfh_keywords = [
        "flerbostadshus", "lägenhet", "apartment",
        "multi-family", "mfh", "hyreshus", "bostadsrätt",
    ]

    for kw in sfh_keywords:
        if kw in cat:
            return "SFH"
    for kw in mfh_keywords:
        if kw in cat:
            return "MFH"
    return None


def match_archetype(
    building_type: str,
    construction_year: int,
) -> Optional[dict]:
    """
    Return the full TABULA archetype (envelope + energy) for a given
    building type (SFH/MFH or Swedish EPC category) and construction year.

    Returns None if no match is found (post-2005 or unknown type).
    """
    btype = building_type.upper() if building_type else None
    if btype not in ("SFH", "MFH"):
        btype = epc_to_building_type(building_type)
    if not btype:
        return None

    period = year_to_tabula_period(construction_year)
    if not period:
        return None

    lookup = _get_combined_lookup()
    return lookup.get((btype, period))


def match_confidence(
    epc_category: str,
    construction_year: int,
) -> dict:
    """
    Return a confidence assessment for the EPC → TABULA match.

    Returns:
        {"level": "High"|"Medium"|"Low"|"None",
         "score": 0-100,
         "reason": str}
    """
    btype = epc_to_building_type(epc_category)
    period = year_to_tabula_period(construction_year) if construction_year else None

    if not btype and not period:
        return {"level": "None", "score": 0,
                "reason": "Cannot determine building type or period"}
    if not btype:
        return {"level": "Low", "score": 25,
                "reason": f"Unknown building type '{epc_category}'; period={period}"}
    if not period:
        if construction_year and construction_year > 2005:
            return {"level": "Low", "score": 30,
                    "reason": f"Post-2005 building (built {construction_year}); no TABULA archetype"}
        return {"level": "Low", "score": 20,
                "reason": "No construction year available"}

    # Both matched
    return {"level": "High", "score": 85,
            "reason": f"Matched {BUILDING_TYPE_LABELS.get(btype, btype)}, period {period}"}


def get_tabula_energy_for_zone(
    archetype: dict,
    zone: int = 3,
) -> Optional[float]:
    """Return net heating demand (kWh/m²/yr) for the given climate zone (1-3)."""
    if not archetype:
        return None
    return archetype.get("heating_demand_net", {}).get(f"zone_{zone}")


def compute_epc_tabula_delta(
    epc_energy_kwh_m2: float,
    archetype: dict,
    zone: int = 3,
) -> Optional[dict]:
    """
    Compare EPC measured energy with TABULA expected energy.

    Returns:
        {"epc": float, "tabula": float, "delta": float, "delta_pct": float,
         "interpretation": str}
    """
    tabula_val = get_tabula_energy_for_zone(archetype, zone)
    if tabula_val is None or epc_energy_kwh_m2 is None:
        return None

    delta = epc_energy_kwh_m2 - tabula_val
    delta_pct = (delta / tabula_val * 100) if tabula_val > 0 else 0.0

    if delta_pct < -20:
        interpretation = "EPC significantly below TABULA → likely already renovated or very efficient"
    elif delta_pct < -5:
        interpretation = "EPC somewhat below TABULA → building may be better than average for its type"
    elif delta_pct < 5:
        interpretation = "EPC close to TABULA → building matches expected performance"
    elif delta_pct < 20:
        interpretation = "EPC somewhat above TABULA → underperforming, renovation could help"
    else:
        interpretation = "EPC significantly above TABULA → poor performance, strong renovation case"

    return {
        "epc": round(epc_energy_kwh_m2, 1),
        "tabula": round(tabula_val, 1),
        "delta": round(delta, 1),
        "delta_pct": round(delta_pct, 1),
        "interpretation": interpretation,
    }


def get_all_archetypes_summary() -> list[dict]:
    """Return a list of all 10 archetypes with key fields for display."""
    lookup = _get_combined_lookup()
    rows = []
    for (btype, period), arch in sorted(lookup.items()):
        rows.append({
            "Code": arch["code"],
            "Type": btype,
            "Type Label": arch["type_label"],
            "Period": period,
            "U Wall": arch["u_values"].get("wall"),
            "U Roof": arch["u_values"].get("roof"),
            "U Window": arch["u_values"].get("window"),
            "U Floor": arch["u_values"].get("floor"),
            "Net Z1 (kWh/m²)": arch["heating_demand_net"].get("zone_1"),
            "Net Z2 (kWh/m²)": arch["heating_demand_net"].get("zone_2"),
            "Net Z3 (kWh/m²)": arch["heating_demand_net"].get("zone_3"),
        })
    return rows
