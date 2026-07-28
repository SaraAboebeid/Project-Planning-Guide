#!/usr/bin/env python3
"""Remove trees/shrubs that fall on water bodies (river, harbour, canals).

The LiDAR-derived vegetation occasionally places trees on the water surface
(reflections / boats / noise misclassified as above-ground points). Rather than
re-run the whole point-cloud pipeline, this filters the existing
vegetation_gothenburg.json against OpenStreetMap water polygons and drops any
tree/shrub whose position lands inside water.

    python tools/se/filter_vegetation_water.py

Writes the filtered result back to the master + the two served copies, and keeps
a one-time backup of the original master (…prewater.bak) the first time it runs.
Std deps: requests, shapely (both already in the backend image).
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import requests
import shapely
from shapely import points as shp_points
from shapely.geometry import Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent.parent
MASTER = ROOT / "data" / "dtcc" / "vegetation_gothenburg.json"
OUTPUTS = [
    MASTER,
    ROOT / "assets" / "dtcc_vegetation.json",
    ROOT / "frontend" / "public" / "dtcc_vegetation.json",
]
OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
# The public Overpass instances 406 the default python-requests User-Agent.
HEADERS = {
    "User-Agent": "Project-Planning-Guide/1.0 (Chalmers; vegetation water filter)",
    "Accept": "application/json",
}


def _bbox(items: list[dict]) -> tuple[float, float, float, float]:
    lons = [o["lon"] for o in items]
    lats = [o["lat"] for o in items]
    # small pad so edge water is included
    return (min(lats) - 0.002, min(lons) - 0.002, max(lats) + 0.002, max(lons) + 0.002)


def _query_tile(s: float, w: float, n: float, e: float) -> list:
    """One Overpass call for a small tile. Ways only (relations pull enormous
    harbour/sea geometry and 504 the server). Retries across mirrors."""
    q = f"""
[out:json][timeout:60];
(
  way["natural"="water"]({s},{w},{n},{e});
  way["waterway"~"^(riverbank|canal|dock)$"]({s},{w},{n},{e});
);
out geom;
"""
    last_err = None
    for attempt in range(3):
        for url in OVERPASS_MIRRORS:
            try:
                r = requests.post(url, data={"data": q}, headers=HEADERS, timeout=90)
                r.raise_for_status()
                return r.json().get("elements", [])
            except Exception as ex:  # noqa: BLE001
                last_err = ex
        time.sleep(4 * (attempt + 1))   # back off, then retry
    print(f"[water]   tile failed after retries: {last_err}", flush=True)
    return []


def _fetch_water_polys(s: float, w: float, n: float, e: float) -> list[Polygon]:
    """Tile the bbox into small requests (reliable) and collect water polygons."""
    STEP = 0.03  # ~2 km tiles
    import math
    rows = max(1, math.ceil((n - s) / STEP))
    cols = max(1, math.ceil((e - w) / STEP))
    print(f"[water] querying Overpass in {rows}x{cols} tiles…", flush=True)

    def ring(geom):
        return [(p["lon"], p["lat"]) for p in geom if "lon" in p and "lat" in p]

    polys: list[Polygon] = []
    for i in range(rows):
        for j in range(cols):
            ts = s + i * STEP
            tn = min(n, ts + STEP)
            tw = w + j * STEP
            te = min(e, tw + STEP)
            els = _query_tile(ts, tw, tn, te)
            for el in els:
                if el.get("type") == "way" and el.get("geometry"):
                    coords = ring(el["geometry"])
                    if len(coords) >= 4 and coords[0] == coords[-1]:
                        try:
                            polys.append(Polygon(coords))
                        except Exception:
                            pass
            time.sleep(1)   # be polite between tiles
    polys = [p for p in polys if p.is_valid and not p.is_empty]
    print(f"[water] {len(polys)} water polygons", flush=True)
    return polys


def _filter(items: list[dict], water) -> list[dict]:
    if not items:
        return items
    pts = shp_points([o["lon"] for o in items], [o["lat"] for o in items])
    in_water = shapely.contains(water, pts)   # vectorised
    return [o for o, bad in zip(items, in_water) if not bad]


def main() -> int:
    if not MASTER.exists():
        print(f"ERROR: {MASTER} not found", file=sys.stderr)
        return 1
    data = json.loads(MASTER.read_text(encoding="utf-8"))
    trees = data.get("trees", [])
    shrubs = data.get("shrubs", [])
    print(f"[in] {len(trees)} trees + {len(shrubs)} shrubs", flush=True)

    s, w, n, e = _bbox(trees + shrubs)
    polys = _fetch_water_polys(s, w, n, e)
    if not polys:
        print("[water] no water polygons found — nothing to filter", flush=True)
        return 0
    water = unary_union(polys)
    shapely.prepare(water)

    trees_f = _filter(trees, water)
    shrubs_f = _filter(shrubs, water)
    print(f"[out] {len(trees_f)} trees ({len(trees) - len(trees_f)} removed) + "
          f"{len(shrubs_f)} shrubs ({len(shrubs) - len(shrubs_f)} removed)", flush=True)

    # one-time backup of the original master
    bak = MASTER.with_suffix(".json.prewater.bak")
    if not bak.exists():
        bak.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        print(f"[backup] {bak.name}", flush=True)

    data["trees"] = trees_f
    data["shrubs"] = shrubs_f
    payload = json.dumps(data, ensure_ascii=False)
    for out in OUTPUTS:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(payload, encoding="utf-8")
        print(f"[write] {out}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
