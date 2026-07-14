"""
cities.py - the UK focus areas the 3D viewer can fly to.

Each entry defines a district-scale focus area, mirroring how the Swedish viewer
centres on Lindholmen rather than the whole of Gothenburg: a city-wide extrusion
of every building is neither useful for retrofit analysis nor loadable in a
browser (Greater London alone has on the order of 2-3 million buildings - no
browser extrudes that as individual entities). The radius is tuned so each area
lands in the low thousands of buildings.

A city can have MULTIPLE districts - London has four below, each a separate
switchable entry sharing `name: "London"` but with a distinct `id` and
`district`. This is how city-wide visual coverage is approximated without a
tiled/streamed renderer: several real, fully-analysed districts spread across
the city, plus the Cesium OSM Buildings layer for grey context in between.
"""

from __future__ import annotations

CITIES = [
    {
        "id": "london_kings_cross",
        "name": "London",
        "district": "King's Cross / Bloomsbury",
        "region": "London",  # EHS region key, used to pick band priors
        "lat": 51.5290,
        "lon": -0.1235,
        "radius_m": 900,
        "local_authority": "Camden",
        "eubucco_file": "UKI3.parquet",  # Inner London - West (NUTS2)
    },
    {
        "id": "london_westminster",
        "name": "London",
        "district": "Westminster",
        "region": "London",
        "lat": 51.4995,
        "lon": -0.1341,
        "radius_m": 900,
        "local_authority": "Westminster",
        "eubucco_file": "UKI3.parquet",  # Inner London - West (NUTS2)
    },
    {
        "id": "london_canary_wharf",
        "name": "London",
        "district": "Tower Hamlets / Canary Wharf",
        "region": "London",
        "lat": 51.5054,
        "lon": -0.0235,
        "radius_m": 900,
        "local_authority": "Tower Hamlets",
        "eubucco_file": "UKI4.parquet",  # Inner London - East (NUTS2)
    },
    {
        "id": "london_southwark",
        "name": "London",
        "district": "Southwark / London Bridge",
        "region": "London",
        "lat": 51.5055,
        "lon": -0.0904,
        "radius_m": 900,
        "local_authority": "Southwark",
        "eubucco_file": "UKI4.parquet",  # Inner London - East (NUTS2)
    },
    {
        "id": "birmingham",
        "name": "Birmingham",
        "district": "City Centre",
        "region": "West Midlands",
        "lat": 52.4796,
        "lon": -1.8904,
        "radius_m": 1200,
        "local_authority": "Birmingham",
        "eubucco_file": "UKG3.parquet",  # West Midlands metropolitan county (NUTS2)
    },
    {
        "id": "nottingham",
        "name": "Nottingham",
        "district": "City Centre",
        "region": "East Midlands",
        "lat": 52.9540,
        "lon": -1.1500,
        "radius_m": 1200,
        "local_authority": "Nottingham",
        "eubucco_file": "UKF1.parquet",  # Derbyshire and Nottinghamshire (NUTS2)
    },
]

CITIES_BY_ID = {c["id"]: c for c in CITIES}


def get(city_id: str) -> dict:
    if city_id not in CITIES_BY_ID:
        raise SystemExit(f"unknown city '{city_id}'; known: {', '.join(CITIES_BY_ID)}")
    return CITIES_BY_ID[city_id]
