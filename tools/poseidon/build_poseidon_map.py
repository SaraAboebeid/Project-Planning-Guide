"""Link the Poseidon Boplats listings to building outlines for the Poseidon map.

Input
  data/poseidon/boplats_listings_scored.json  (find_poseidon_listings.py)
  assets/buildings.json                        (Gothenburg buildings, EPC-linked)

Listings have no coordinates, so they are matched on address: a building
belongs to Poseidon when one of its entrance addresses (address/all_addresses)
equals a Poseidon listing's address. That is the same rule the 3D viewer uses
to attach Boplats rents to buildings (assets/viewer/js/market.js).

Output: poseidon/public/data/poseidon_map.json
  buildings  every apartment block in Gothenburg (+ any non-residential
             building matched to a Poseidon listing), with a simplified
             outline; `poseidon: true` on the matched ones
  unmatched  Poseidon listing addresses with no building outline

Many entrances (new builds especially) are missing from the address lists,
so an address with no exact match is geocoded through the planner backend's
/api/geocode (Nominatim, ~1 request/s, cached in data/poseidon/geocode_cache.json)
and given the building whose outline contains that point, or the nearest one
within 40 m.

    .venv/Scripts/python tools/poseidon/build_poseidon_map.py [--api http://127.0.0.1:8010]
"""
from __future__ import annotations

import argparse
import json
import math
import re
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
LISTINGS = REPO / "data" / "poseidon" / "boplats_listings_scored.json"
BUILDINGS = REPO / "assets" / "buildings.json"
GEOCODE_CACHE = REPO / "data" / "poseidon" / "geocode_cache.json"
OUT = REPO / "poseidon" / "public" / "data" / "poseidon_map.json"
NEAREST_M = 40.0


def norm(a: str | None) -> str:
    """'Kaprisgatan  56 B.' -> 'kaprisgatan 56b'"""
    s = (a or "").strip().lower().strip(". ")
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"(\d+)\s+([a-z])$", r"\1\2", s)   # "8 c" -> "8c"
    return s


def strip_letter(a: str) -> str:
    return re.sub(r"(\d+)[a-z]$", r"\1", a)


def ring(coords):
    """Outer ring of a polygon, rounded to ~1 m, as [[lon, lat], ...]."""
    r = coords[0] if coords and isinstance(coords[0][0], list) else coords
    out = []
    for lon, lat, *_ in r:
        p = [round(lon, 5), round(lat, 5)]
        if not out or out[-1] != p:
            out.append(p)
    return out


def geocode(addr: str, api: str, cache: dict):
    if addr in cache:
        return cache[addr]
    q = urllib.parse.urlencode({"address": f"{addr}, Göteborg", "country": "se"})
    try:
        with urllib.request.urlopen(f"{api}/api/geocode?{q}", timeout=30) as r:
            g = json.load(r)
        res = [g["lat"], g["lon"]] if "lat" in g else None
    except Exception:
        res = None
    cache[addr] = res
    time.sleep(1.1)  # Nominatim's 1 request/second policy
    return res


def inside(lon: float, lat: float, poly) -> bool:
    c = False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            c = not c
    return c


def dist_m(lat1, lon1, lat2, lon2) -> float:
    k = math.cos(math.radians(lat1))
    return math.hypot((lat2 - lat1) * 111_320, (lon2 - lon1) * 111_320 * k)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://127.0.0.1:8010", help="planner backend for /api/geocode")
    args = ap.parse_args()
    listings = json.loads(LISTINGS.read_text(encoding="utf-8"))
    pos = [l for l in listings if l.get("poseidon")]
    by_addr: dict[str, list] = defaultdict(list)
    for l in pos:
        if l.get("address") and "site currently closed" not in l["address"].lower():
            by_addr[norm(l["address"])].append(l)

    buildings = json.loads(BUILDINGS.read_text(encoding="utf-8"))
    index: dict[str, list[int]] = defaultdict(list)
    for i, b in enumerate(buildings):
        keys = {norm(b.get("address"))}
        keys.update(norm(a) for a in str(b.get("all_addresses") or "").split("|"))
        for k in keys - {""}:
            index[k].append(i)

    hit: dict[int, list] = defaultdict(list)
    how: dict[int, str] = {}
    pending = []
    for a, ls in by_addr.items():
        idx = index.get(a) or index.get(strip_letter(a))
        if not idx:
            pending.append((a, ls))
            continue
        for i in idx:
            hit[i].extend(ls)
            how[i] = "address"

    # Fallback: geocode → containing / nearest outline. Grid of centroids for speed.
    rings = [ring(b["coordinates"]) for b in buildings]
    cents = [(sum(p[1] for p in r) / len(r), sum(p[0] for p in r) / len(r)) if r else (0, 0) for r in rings]
    grid: dict[tuple, list[int]] = defaultdict(list)
    for i, (la, lo) in enumerate(cents):
        grid[(round(la * 500), round(lo * 250))].append(i)   # ~220 m x ~240 m cells
    cache = json.loads(GEOCODE_CACHE.read_text(encoding="utf-8")) if GEOCODE_CACHE.exists() else {}
    unmatched = []
    for n, (a, ls) in enumerate(pending):
        g = geocode(ls[0]["address"].strip(), args.api, cache)
        best = None
        if g:
            la, lo = g
            gy, gx = round(la * 500), round(lo * 250)
            cand = [i for dy in (-1, 0, 1) for dx in (-1, 0, 1) for i in grid.get((gy + dy, gx + dx), [])]
            cand = [i for i in cand if buildings[i].get("use_cat") not in ("komplement",)]
            within = [i for i in cand if len(rings[i]) >= 3 and inside(lo, la, rings[i])]
            if within:
                best = within[0]
            elif cand:
                i = min(cand, key=lambda i: dist_m(la, lo, *cents[i]))
                if dist_m(la, lo, *cents[i]) <= NEAREST_M:
                    best = i
        if best is None:
            unmatched.append({"address": ls[0]["address"], "listings": len(ls)})
        else:
            hit[best].extend(ls)
            how.setdefault(best, "geocoded")
        if n % 20 == 0:
            GEOCODE_CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    GEOCODE_CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    # Boplats rents per address (every listing, any landlord) for the table.
    import sqlite3
    rents: dict[str, list] = defaultdict(list)
    con = sqlite3.connect(f"file:{REPO / 'boplats_apartments.db'}?mode=ro", uri=True)
    for a, rent, size in con.execute("SELECT address, rent_sek, size_m2 FROM apartments WHERE address IS NOT NULL"):
        rents[norm(a)].append((rent, size))
    con.close()

    def rent_for(addr, addrs):
        keys = {norm(addr)} | {norm(x) for x in str(addrs or "").split("|")}
        ls = [r for k in keys - {""} for r in rents.get(k, [])]
        if not ls:
            return None
        r_sek = [r for r, _ in ls if r]
        r_m2 = [r / s for r, s in ls if r and s]
        return {
            "bp_listings": len(ls),
            "bp_rent": round(sum(r_sek) / len(r_sek)) if r_sek else None,
            "bp_rent_m2": round(sum(r_m2) / len(r_m2), 1) if r_m2 else None,
        }

    out = []
    for i, b in enumerate(buildings):
        is_pos = i in hit
        if not is_pos and b.get("use_cat") != "bostad_flerfamilj":
            continue
        poly = rings[i]
        if len(poly) < 3:
            continue
        lat = sum(p[1] for p in poly) / len(poly)
        lon = sum(p[0] for p in poly) / len(poly)
        rec = {
            "id": f"{lat:.5f},{lon:.5f}",
            "addr": b.get("address"),
            "addrs": b.get("all_addresses"),
            "year": b.get("year"), "floors": b.get("floors"), "atemp": b.get("area"),
            "energy": b.get("energy"), "eclass": b.get("eclass"), "use": b.get("use_cat"),
            # extra columns for the building table (same fields as Step 2's table)
            "height": b.get("height"), "footprint": b.get("footprint_m2"), "has_epc": b.get("has_epc"),
            "period": b.get("tabula_period"),
            "u_wall": b.get("tabula_u_wall"), "u_roof": b.get("tabula_u_roof"), "u_win": b.get("tabula_u_win"),
            "poly": poly,
        }
        rent = rent_for(rec["addr"], rec["addrs"])
        if rent:
            rec.update(rent)
        if is_pos:
            ls = hit[i]
            rec["poseidon"] = True
            rec["listings"] = len({l["id"] for l in ls})
            rec["layouts"] = sorted({l["matched_layout"] for l in ls})
            rec["seen"] = max(l["last_seen"] for l in ls)[:10]
            rec["match"] = how[i]
            rec["listing_addrs"] = sorted({l["address"].strip() for l in ls})[:12]
        out.append(rec)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "generated": date.today().isoformat(),
        "source": "Boplats floor plans (Poseidon drawing layouts) matched to assets/buildings.json by address",
        "poseidon_listings": len(pos),
        "poseidon_addresses": len(by_addr),
        "buildings": out,
        "unmatched": sorted(unmatched, key=lambda u: -u["listings"]),
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n_pos = sum(1 for r in out if r.get("poseidon"))
    print(f"Poseidon listings {len(pos)} at {len(by_addr)} addresses -> {n_pos} buildings; "
          f"{len(unmatched)} addresses without an outline; {len(out)} buildings in file, "
          f"{OUT.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
