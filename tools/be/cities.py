"""
cities.py - the Belgian focus areas the 3D viewer can fly to.

Same idea as tools/uk/cities.py: district-scale areas in the low thousands of
buildings, several per city for coverage. `source` picks the footprint
provider - Brussels-Capital Region publishes UrbIS (CC0), Flanders the GRB,
Wallonia the PICC (CC BY 4.0) - because the three regions keep separate registers. `nis` is the Statbel
municipality code(s) the construction-period prior is drawn from.
"""

from __future__ import annotations

CITIES = [
    {
        "id": "brussels_saint_gilles",
        "name": "Brussels",
        "district": "Saint-Gilles / Ixelles",
        "region": "Brussels-Capital",
        "lat": 50.8290,
        "lon": 4.3480,
        "radius_m": 700,
        "source": "urbis",
    },
    {
        "id": "brussels_schaerbeek",
        "name": "Brussels",
        "district": "Schaerbeek",
        "region": "Brussels-Capital",
        "lat": 50.8668,
        "lon": 4.3736,
        "radius_m": 700,
        "source": "urbis",
    },
    {
        "id": "gent_centrum",
        "name": "Gent",
        "district": "Gent centrum",
        "region": "Flanders",
        "lat": 51.0543,
        "lon": 3.7250,
        "radius_m": 700,
        "source": "grb",
        "nis": "44021",
    },
    # Liège: Wallonia is the only region with open per-certificate EPB data
    # (commune-level), so these districts are where the model gets calibrated.
    {
        "id": "liege_centre",
        "name": "Liège",
        "district": "Centre / Outremeuse",
        "region": "Wallonia",
        "lat": 50.6410,
        "lon": 5.5780,
        "radius_m": 700,
        "source": "picc",
        "nis": "62063",
    },
    {
        "id": "liege_saint_leonard",
        "name": "Liège",
        "district": "Saint-Léonard",
        "region": "Wallonia",
        "lat": 50.6530,
        "lon": 5.5905,
        "radius_m": 700,
        "source": "picc",
        "nis": "62063",
    },
]

CITIES_BY_ID = {c["id"]: c for c in CITIES}


def get(city_id: str) -> dict:
    if city_id not in CITIES_BY_ID:
        raise SystemExit(f"unknown city '{city_id}'; known: {', '.join(CITIES_BY_ID)}")
    return CITIES_BY_ID[city_id]
