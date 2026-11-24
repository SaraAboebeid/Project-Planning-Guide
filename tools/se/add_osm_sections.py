"""
Add building sections that a city's data is missing, from OpenStreetMap outlines.

Why: new blocks are often absent from EUBUCCO (its geometry predates them), and
Lantmäteriet can draw a whole block as ONE outline with one house number while
Boverket certifies each section separately (e.g. Nacka, Telegrafvägen 30-40:
one outline, three certificates). Such sections cannot be selected or
simulated on their own. data/se/osm_sections.json lists, per city, the OSM way
that outlines each section and the certificate (FormularId) that belongs to it.

For each entry this script writes one building into buildings_<city>.json
(assets/ and frontend/public/), with:
  geometry      the OSM outline (cached in data/se/osm_sections/<city>.json, so
                rebuilds work offline and stay reproducible)
  certificate   year, heated area, floors, energy, class, addresses (Boverket)
  height        floors x defaults.FLOOR_HEIGHT_M (OSM has no height here)
A tool building lying mostly inside the new outline is replaced (no doubles).
Re-running is safe: earlier additions are removed and re-added.

Usage: python tools/se/add_osm_sections.py <city_id>     (no-op if not listed)
"""
from __future__ import annotations

import json
import math
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "idf"))
import defaults as D  # noqa: E402

CONFIG = ROOT / "data" / "se" / "osm_sections.json"
CACHE_DIR = ROOT / "data" / "se" / "osm_sections"
EPC_DB = ROOT / "data" / "sensitivity" / "epc_sweden.duckdb"
OVERPASS = "https://overpass-api.de/api/interpreter"
TAG = "osm_section"          # marks records this script added

ECLASS_COLORS = {"A": [22, 163, 74, 210], "B": [74, 222, 128, 210], "C": [190, 242, 60, 210],
                 "D": [250, 204, 21, 210], "E": [251, 146, 60, 220], "F": [239, 68, 68, 220],
                 "G": [153, 27, 27, 220]}
USE_BY_KAT = {"Flerbostadshus": ("bostad_flerfamilj", "Bostad;Flerfamiljshus", [255, 210, 60, 210]),
              "En- och tvåbostadshus": ("bostad_enfamilj", "Bostad;Småhus", [255, 165, 50, 210]),
              "Lokalbyggnader": ("verksamhet", "Verksamhet;", [70, 180, 255, 210])}


def osm_outlines(city: str, way_ids: list[int]) -> dict[int, list[list[float]]]:
    """{way id: closed ring [[lon, lat], ...]}, from the cache or Overpass."""
    cache_file = CACHE_DIR / f"{city}.json"
    cache = json.loads(cache_file.read_text(encoding="utf-8")) if cache_file.exists() else {}
    missing = [w for w in way_ids if str(w) not in cache]
    if missing:
        q = f"[out:json][timeout:60];way(id:{','.join(map(str, missing))});out geom;"
        req = urllib.request.Request(OVERPASS, data=urllib.parse.urlencode({"data": q}).encode(),
                                     headers={"User-Agent": "building-energy-planner/1.0"})
        for el in json.load(urllib.request.urlopen(req, timeout=90))["elements"]:
            ring = [[round(p["lon"], 7), round(p["lat"], 7)] for p in el["geometry"]]
            if ring[0] != ring[-1]:
                ring.append(ring[0])
            cache[str(el["id"])] = ring
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps(cache, indent=1), encoding="utf-8")
    gone = [w for w in way_ids if str(w) not in cache]
    if gone:
        raise SystemExit(f"OSM ways not found: {gone}")
    return {w: cache[str(w)] for w in way_ids}


def certificate(con, formular_id: int) -> dict:
    row = con.execute("""
        SELECT any_value(EgenNybyggAr), max(EgenAtemp), max(EgenAntalPlan), any_value(EgiSpecifikEnergianvandning),
               any_value(EgiEnergiklass), any_value(EgenByggnadsKat),
               string_agg(DISTINCT trim(IdAdr), ' | ' ORDER BY trim(IdAdr))
        FROM epc WHERE FormularId = ? AND IdAdr IS NOT NULL AND trim(IdAdr) NOT IN ('', '-')""", [formular_id]).fetchone()
    if not row or row[0] is None:
        raise SystemExit(f"certificate {formular_id} not in the EPC register")
    year, atemp, floors, energy, eclass, kat, addrs = row
    return {"year": int(year), "atemp": float(atemp) if atemp else None, "floors": float(floors) if floors else None,
            "energy": float(energy) if energy is not None else None, "eclass": (eclass or "").strip().upper() or None,
            "kat": kat, "addresses": addrs.split(" | ") if addrs else []}


def area_m2(ring) -> float:
    lat0 = math.radians(sum(p[1] for p in ring) / len(ring))
    xy = [(p[0] * 111320 * math.cos(lat0), p[1] * 110540) for p in ring]
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(xy, xy[1:] + xy[:1]))) / 2


def tabula_period(year: int) -> str:
    for lo, hi, label in ((0, 1960, "...1960"), (1961, 1975, "1961-1975"), (1976, 1985, "1976-1985"),
                          (1986, 1995, "1986-1995"), (1996, 2005, "1996-2005")):
        if lo <= year <= hi:
            return label
    return "post-2005"


def main() -> int:
    city = sys.argv[1]
    entries = json.loads(CONFIG.read_text(encoding="utf-8")).get(city) or []
    files = [p for p in (ROOT / "assets" / f"buildings_{city}.json", ROOT / "frontend" / "public" / f"buildings_{city}.json") if p.exists()]
    if not entries or not files:
        print(f"[osm-sections] {city}: nothing to add")
        return 0

    import duckdb
    from shapely.geometry import Polygon
    con = duckdb.connect(str(EPC_DB), read_only=True)
    rings = osm_outlines(city, [e["osm_way"] for e in entries])

    new = []
    for e in entries:
        ring, cert = rings[e["osm_way"]], certificate(con, e["formular_id"])
        use_cat, andamal, color = USE_BY_KAT.get(cert["kat"], USE_BY_KAT["Flerbostadshus"])
        floors = cert["floors"] or 1.0
        addrs = cert["addresses"]
        new.append({
            "coordinates": [ring], "height": round(floors * D.FLOOR_HEIGHT_M, 1), "color": color,
            "floors": floors, "year": cert["year"], "area": cert["atemp"], "footprint_m2": round(area_m2(ring), 1),
            "energy": cert["energy"], "eclass": cert["eclass"], "eclass_color": ECLASS_COLORS.get(cert["eclass"]),
            "has_epc": True, "andamal": andamal, "use_cat": use_cat,
            "address": addrs[0] if addrs else None, "all_addresses": " | ".join(addrs) if addrs else None,
            "tabula_period": tabula_period(cert["year"]), "tabula_u_wall": None, "tabula_u_roof": None,
            "tabula_u_win": None, "tabula_heat_z3": None, "tabula_wall": None, "tabula_roof": None, "perf_pct": None,
            TAG: {"osm_way": e["osm_way"], "formular_id": e["formular_id"]},
        })

    for path in files:
        recs = [r for r in json.loads(path.read_text(encoding="utf-8")) if TAG not in r]
        keep, replaced = [], 0
        polys = [Polygon(n["coordinates"][0]) for n in new]
        for r in recs:
            try:
                p = Polygon(r["coordinates"][0])
                inside = max(p.intersection(q).area for q in polys) / p.area if p.area else 0
            except Exception:  # noqa: BLE001 - odd outline: keep it
                inside = 0
            if inside > 0.5:
                replaced += 1
                continue
            keep.append(r)
        keep.extend(new)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(keep, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path)
        print(f"[osm-sections] {path.relative_to(ROOT)}: +{len(new)} sections, replaced {replaced}, {len(keep):,} buildings")
    for n in new:
        print(f"   {n['all_addresses']}: {n['footprint_m2']} m2 x {n['floors']:.0f} floors, heated {n['area']} m2, "
              f"{n['energy']} kWh/m2 class {n['eclass']} ({n['year']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
