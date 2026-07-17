"""Tag every Gothenburg building with its primärområde (named neighborhood).

Source: Göteborgs Stad public ArcGIS FeatureServer, 96 official primärområden
polygons (no auth). Fields: PRIMÄROMRÅ (code), PRIMÄRNAMN (name).

For each building in frontend/public/buildings.json we take the polygon
centroid and find which primärområde contains it (shapely STRtree point-in-
polygon). The building record gets a new "primary_area" field (the name, or
None if it falls outside every polygon). This is a one-time enrichment — run
after the Sweden pipeline regenerates buildings.json.

Usage: python tools/se/ingest_districts.py
"""
from __future__ import annotations

import json
from pathlib import Path

from shapely.geometry import shape, Point
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[2]
GEOJSON = ROOT / "data" / "districts" / "gbg_primaromraden.geojson"
BUILDINGS = ROOT / "frontend" / "public" / "buildings.json"


def _centroid(coords) -> Point | None:
    """buildings.json geometry is [ring] where ring is [[lon,lat], ...]."""
    try:
        ring = coords[0] if coords and isinstance(coords[0][0], (list, tuple)) else coords
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        return Point(sum(xs) / len(xs), sum(ys) / len(ys))
    except Exception:
        return None


def main() -> None:
    gj = json.loads(GEOJSON.read_text(encoding="utf-8"))
    polys, names = [], []
    for feat in gj["features"]:
        props = feat.get("properties", {})
        name = props.get("PRIMÄRNAMN") or props.get("PRIMARNAMN") or props.get("NAMN")
        geom = feat.get("geometry")
        if not name or not geom:
            continue
        try:
            polys.append(shape(geom))
            names.append(str(name).strip())
        except Exception:
            continue
    print(f"loaded {len(polys)} primärområden polygons")

    tree = STRtree(polys)

    buildings = json.loads(BUILDINGS.read_text(encoding="utf-8"))
    recs = buildings if isinstance(buildings, list) else buildings.get("buildings", buildings)

    tagged = 0
    for b in recs:
        pt = _centroid(b.get("coordinates"))
        area = None
        if pt is not None:
            # STRtree.query returns candidate indices; confirm with contains()
            for idx in tree.query(pt):
                if polys[idx].contains(pt):
                    area = names[idx]
                    break
        b["primary_area"] = area
        if area:
            tagged += 1

    BUILDINGS.write_text(
        json.dumps(buildings, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    # Summary: building counts per area
    from collections import Counter
    counts = Counter(b.get("primary_area") for b in recs)
    print(f"tagged {tagged}/{len(recs)} buildings ({len(recs)-tagged} outside all areas)")
    top = counts.most_common(8)
    print("top areas:", [(n, c) for n, c in top if n])


if __name__ == "__main__":
    main()
