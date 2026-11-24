"""
Where the 3D viewer (and the home page background) should look for a city.

`center` in data/se/dynamic_cities.json used to be the middle of the
municipality's bounding box. For Nacka that is open water and forest at
Baggensfjärden (59.3056 N, 18.2486 E): the photorealistic 3D tiles there are a
green/blue smear and no buildings are in view, which looked like a broken
viewer. This picks the densest built-up spot instead: the ~500 m grid cell with
the most heated floor area (footprint x floors; outbuildings excluded), and the
centre of the buildings in it.

Usage: python tools/se/city_view_center.py [city_id ...] [--write]
       (no ids = every built on-demand city). build_any_city.py calls center_for().
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DYN = ROOT / "data" / "se" / "dynamic_cities.json"
CELL_DEG = 0.0045          # ~500 m north-south


def center_for(city_id: str) -> list[float] | None:
    p = ROOT / "frontend" / "public" / f"buildings_{city_id}.json"
    if not p.exists():
        return None
    weight: dict[tuple[int, int], float] = defaultdict(float)
    members: dict[tuple[int, int], list[tuple[float, float, float]]] = defaultdict(list)
    for b in json.loads(p.read_text(encoding="utf-8")):
        if b.get("use_cat") == "komplement":
            continue
        ring = (b.get("coordinates") or [[]])[0]
        if not ring:
            continue
        lon = sum(c[0] for c in ring) / len(ring)
        lat = sum(c[1] for c in ring) / len(ring)
        w = float(b.get("footprint_m2") or 0) * float(b.get("floors") or max(1.0, float(b.get("height") or 3.2) / 3.2))
        key = (int(lat / CELL_DEG), int(lon / (CELL_DEG * 1.9)))   # ~square cells at 59 N
        weight[key] += w
        members[key].append((lat, lon, w))
    if not weight:
        return None
    best = max(weight, key=weight.get)
    pts = members[best]
    tw = sum(w for *_, w in pts) or 1.0
    return [round(sum(la * w for la, _, w in pts) / tw, 5), round(sum(lo * w for _, lo, w in pts) / tw, 5)]


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dyn = json.loads(DYN.read_text(encoding="utf-8"))
    ids = args or [k for k, v in dyn.items() if v.get("built")]
    for cid in ids:
        new = center_for(cid)
        old = dyn.get(cid, {}).get("center")
        print(f"{cid:12} {old} -> {new}")
        if new and "--write" in sys.argv:
            dyn[cid]["center"] = new
    if "--write" in sys.argv:
        DYN.write_text(json.dumps(dyn, ensure_ascii=False, indent=1), encoding="utf-8")
        print("written", DYN.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
