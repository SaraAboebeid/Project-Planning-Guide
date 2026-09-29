"""Swedish city registry — single source of truth for adding a city to the
digital twin (Gothenburg, Malmö, Stockholm, …).

Each entry carries everything the pipelines need so a new city is a config change,
not a code change:
  nuts2   — EUBUCCO NUTS-2 region code (the parquet to pull building geometry from)
  bbox4326 — (lon_min, lat_min, lon_max, lat_max) the working extent
  slug    — output filename stem (buildings_<slug>.json, <slug>_vegetation.json, …)

EPC (national epc_sweden.duckdb) and TABULA are national, so they need no per-city
config. bbox3006 is derived on demand (EPSG:3006 is the LiDAR/analysis CRS).
"""
from __future__ import annotations

CITIES = {
    "gothenburg": {
        "name": "Gothenburg",
        "nuts2": "SE23",                              # Västsverige
        "bbox4326": (11.85, 57.62, 12.10, 57.80),
        "slug": "gothenburg",
        "eubucco": "data/eubucco/SE23.gpkg",
        "kommun": "Göteborg",                          # primary municipality (EPC IdKommun)
        # region municipalities — the EPC cadastral filter is scoped to these to
        # avoid cadastral-name collisions across the country.
        "region_kommuns": ["Göteborg", "Mölndal", "Partille", "Härryda", "Kungälv",
                            "Ale", "Lerum", "Öckerö", "Kungsbacka", "Stenungsund",
                            "Tjörn", "Lilla Edet", "Alingsås", "Bollebygd"],
    },
    "malmo": {
        "name": "Malmö",
        "nuts2": "SE22",                              # Sydsverige (Skåne/Blekinge)
        "bbox4326": (12.92, 55.53, 13.12, 55.64),     # central + greater Malmö
        "slug": "malmo",
        "eubucco": "data/eubucco/malmo.gpkg",
        "kommun": "Malmö",
        "region_kommuns": ["Malmö", "Burlöv", "Lomma", "Staffanstorp", "Vellinge",
                            "Svedala", "Lund", "Trelleborg", "Kävlinge"],
    },
    # Stockholm etc. can be added the same way:
    # "stockholm": {"name": "Stockholm", "nuts2": "SE11",
    #               "bbox4326": (17.95, 59.28, 18.15, 59.40), "slug": "stockholm"},
}


# Municipalities built on demand (tools/se/build_any_city.py) are recorded here and
# merged in; the hand-written entries above always win.
DYNAMIC_FILE = __import__("pathlib").Path(__file__).resolve().parents[2] / "data" / "se" / "dynamic_cities.json"


def load_cities() -> dict:
    """Static cities plus every municipality built on demand (re-read on each call)."""
    import json
    out = dict(CITIES)
    if DYNAMIC_FILE.exists():
        try:
            for k, v in json.loads(DYNAMIC_FILE.read_text(encoding="utf-8")).items():
                out.setdefault(k, v)
        except ValueError:
            pass
    return out


def get_city(key: str) -> dict:
    k = key.lower()
    cities = load_cities()
    if k not in cities:
        raise SystemExit(f"unknown city '{key}'. Known: {', '.join(cities)}")
    return cities[k]


def bbox3006(bbox4326):
    """(lon_min,lat_min,lon_max,lat_max) EPSG:4326 → dict xmin/ymin/xmax/ymax in EPSG:3006."""
    from pyproj import Transformer
    t = Transformer.from_crs("EPSG:4326", "EPSG:3006", always_xy=True)
    lo, la, LO, LA = bbox4326
    xs, ys = [], []
    for x, y in [(lo, la), (LO, la), (LO, LA), (lo, LA)]:
        ex, ey = t.transform(x, y)
        xs.append(ex); ys.append(ey)
    return {"xmin": min(xs), "ymin": min(ys), "xmax": max(xs), "ymax": max(ys)}
