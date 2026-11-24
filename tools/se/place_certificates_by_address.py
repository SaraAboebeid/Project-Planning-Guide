"""
Attach energy certificates that the property link missed, by their street addresses.

The build links a certificate to a building through (property designation,
house number) in Lantmäteriet's register (tools/se/lm_link_city.py). That fails
when the designation on the certificate no longer exists (land re-registered,
e.g. Fisksätra: Karpgatan's certificates name Erstavik 26:426/428, the register
now has 26:6xx) or when one Lantmäteriet outline carries several certificates.

This step places each still-unattached certificate by its addresses instead:
Lantmäteriet's address points (belägenhetsadresser, entrance level) → the
tool building at / next to each entrance (≤ MAX_DIST_M). Then:

  free      the building(s) have no certificate      → attach it
  sections  the building is split into pieces that carry ANOTHER certificate of
            the block (e.g. Karpgatan 2-14 + 16): the pieces this certificate's
            entrances land on - and the other certificate's entrances do not -
            are given to this certificate; the others keep theirs
  review    cannot be decided safely (no address point, no building nearby, or
            both certificates' entrances land on the same piece) → listed only

Each certificate keeps its own heated floor area (Atemp) - nothing is merged.
Skipped: certificates already attached, the other declaration of a building
that already has one (same addresses), and those placed by add_osm_sections.
For two unattached declarations of the same building, the newest is used.

Writes buildings_<city>.json (assets/ and frontend/public/) and
data/analysis/<city>_certificates_by_address.csv. Re-running is a no-op for
certificates it has already placed (records are tagged `cert_by_address`).

Usage: python tools/se/place_certificates_by_address.py <city_id>
"""
from __future__ import annotations

import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import duckdb
import geopandas as gpd
import requests
from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "se"))
import lm_link_city as L  # noqa: E402  (Geotorget login + cached STAC download)
from se_cities import get_city  # noqa: E402

EPC_DB = ROOT / "data" / "sensitivity" / "epc_sweden.duckdb"
OSM_SECTIONS = ROOT / "data" / "se" / "osm_sections.json"
MAX_DIST_M = 8.0        # an entrance point sits on or just outside the wall
TAG = "cert_by_address"
ECLASS_COLORS = {"A": [22, 163, 74, 210], "B": [74, 222, 128, 210], "C": [190, 242, 60, 210],
                 "D": [250, 204, 21, 210], "E": [251, 146, 60, 220], "F": [239, 68, 68, 220],
                 "G": [153, 27, 27, 220]}


def norm(a: str) -> str:
    return re.sub(r"\s+", " ", (a or "").strip().casefold())


def expand(addr: str) -> list[str]:
    """'Karpgatan 2' → [..]; ranges as certificates write them: '12A-B', '97 A-F',
    '10A-10E', '2-4', '8-24' (same parity → every other number)."""
    a = re.sub(r"\s+", " ", (addr or "").strip())
    m = re.match(r"^(.*?\D)\s*(\d+)\s*([A-Za-z]?)\s*-\s*(\d*)\s*([A-Za-z]?)$", a)
    if not m:
        return [a] if re.search(r"\d", a) else []
    street, n1, l1, n2, l2 = m.group(1).strip(), int(m.group(2)), m.group(3).upper(), m.group(4), m.group(5).upper()
    n2 = int(n2) if n2 else n1
    if l1 and l2 and n1 == n2:
        return [f"{street} {n1}{chr(c)}" for c in range(ord(l1), ord(l2) + 1)][:30]
    step = 2 if (n2 - n1) % 2 == 0 else 1
    return [f"{street} {n}" for n in range(n1, n2 + 1, step)][:30] if n2 >= n1 else [a]


def tabula_period(year) -> str | None:
    if not year:
        return None
    for lo, hi, label in ((0, 1960, "...1960"), (1961, 1975, "1961-1975"), (1976, 1985, "1976-1985"),
                          (1986, 1995, "1986-1995"), (1996, 2005, "1996-2005")):
        if lo <= year <= hi:
            return label
    return "post-2005"


def natural_key(addr: str):
    """'Tre Kronors väg 9' < 'Tre Kronors väg 31' < 'Tre Kronors väg 41A'."""
    m = re.match(r"^(.*?)\s*(\d+)\s*([A-Za-z]?)\s*$", addr or "")
    return (m.group(1).casefold(), int(m.group(2)), m.group(3).upper()) if m else ((addr or "").casefold(), 0, "")


def address_points(codes: list[str]) -> dict[str, list]:
    """normalised 'street 12a' → [(Point (EPSG:3006), 'Street 12A')] from Lantmäteriet belägenhetsadresser."""
    s = requests.Session()
    s.auth = L._auth()
    s.headers["User-Agent"] = "building-energy-planner/1.0"
    out: dict[str, list] = defaultdict(list)
    for code in codes:
        g = gpd.read_file(L._download(s, "belagenhetsadresser", code), layer="belagenhetsadress").to_crs(3006)
        for street, num, letter, geom in zip(g["adressomrade_faststalltnamn"], g["adressplatsnummer"],
                                             g["bokstavstillagg"], g.geometry):
            if street and num and geom is not None:
                label = f"{street} {num}{letter or ''}"
                out[norm(label)].append((geom, label))
    return out


def main() -> int:
    city_id = sys.argv[1]
    city = get_city(city_id)
    files = [p for p in (ROOT / "assets" / f"buildings_{city_id}.json", ROOT / "frontend" / "public" / f"buildings_{city_id}.json") if p.exists()]
    fp_file = ROOT / "data" / "lm" / f"footprints_{city['slug']}.parquet"
    if not files or not fp_file.exists():
        print(f"[cert-by-address] {city_id}: no building data / footprints - skipped")
        return 0
    codes = list((city.get("kommun_codes") or L._kommun_codes(city["region_kommuns"])).values())
    kommuner = list(city.get("kommun_codes") or city["region_kommuns"])

    recs = json.loads(files[-1].read_text(encoding="utf-8"))
    con = duckdb.connect(str(EPC_DB), read_only=True)
    certs = con.execute(f"""
        SELECT FormularId, any_value(trim(IdFastBet)) fast, max(EgenAtemp) atemp, max(EgenAntalPlan) floors,
               any_value(EgenNybyggAr) built, any_value(EgiSpecifikEnergianvandning) energy,
               any_value(EgiEnergiklass) cls, CAST(max(Godkand) AS VARCHAR) issued,
               list(DISTINCT trim(IdAdr)) FILTER (WHERE trim(IdAdr) NOT IN ('', '-')) addrs
        FROM epc WHERE IdKommun IN ({','.join('?' * len(kommuner))}) AND EgiSpecifikEnergianvandning IS NOT NULL
        GROUP BY 1""", kommuner).fetchdf()
    certs["addrs"] = certs["addrs"].map(lambda v: [str(x) for x in v] if v is not None else [])

    # ── which certificates still need a building ────────────────────────────────
    linked = set(duckdb.sql(f"SELECT DISTINCT FormularId FROM read_parquet('{fp_file.as_posix()}') WHERE FormularId IS NOT NULL").df()["FormularId"].astype("int64"))
    linked |= {e["formular_id"] for e in json.loads(OSM_SECTIONS.read_text(encoding="utf-8")).get(city_id, [])} if OSM_SECTIONS.exists() else set()
    linked |= {r[TAG] for r in recs if TAG in r}
    addr_of = {r.FormularId: {norm(x) for a in (r.addrs or []) for x in expand(a)} for r in certs.itertuples()}
    taken = {a for f in linked for a in addr_of.get(f, ())}
    todo = certs[~certs.FormularId.isin(linked)].copy()
    todo["dup"] = todo.FormularId.map(lambda f: bool(addr_of[f] & taken))
    todo = todo[~todo.dup].sort_values("issued", ascending=False)
    todo = todo.astype(object).where(todo.notna(), None)   # pandas NA → None
    seen, keep = set(), []
    for r in todo.itertuples():                       # newest declaration per address set
        k = frozenset(addr_of[r.FormularId])
        if k and k not in seen:
            seen.add(k); keep.append(r)

    # ── geometry: tool buildings + address points in metres ────────────────────
    gdf = gpd.GeoDataFrame({"i": range(len(recs))}, geometry=[Polygon(r["coordinates"][0]) for r in recs], crs=4326).to_crs(3006)
    gdf = gdf[gdf.is_valid & ~gdf.is_empty]
    tree, geoms, idx = gdf.sindex, list(gdf.geometry), list(gdf["i"])
    pts = address_points(codes)

    def building_at(pt) -> int | None:
        best = None
        for j in tree.query(pt.buffer(MAX_DIST_M)):
            i = idx[j]
            if recs[i].get("use_cat") == "komplement":
                continue
            d = geoms[j].distance(pt)
            if d <= MAX_DIST_M and (best is None or d < best[0]):
                best = (d, i)
        return best[1] if best else None

    def entrance_counts(addresses) -> tuple[dict[int, int], int]:
        """{building piece: number of these entrances on it}, and how many entrances were located."""
        found: dict[int, int] = defaultdict(int)
        located = 0
        for a in addresses:
            for p, _label in pts.get(a, []):
                located += 1
                i = building_at(p)
                if i is not None:
                    found[i] += 1
        return found, located

    def hits(addresses) -> tuple[set[int], int]:
        found, located = entrance_counts(addresses)
        return set(found), located

    # a record's current certificate = its certificate's address set (all records of one
    # certificate share it; `cert_addresses` keeps it once the labels below are per piece)
    def group_key(r) -> str | None:
        return (r.get("cert_addresses") or r.get("all_addresses") or r.get("address")) if r.get("energy") is not None else None

    report, changed = [], 0
    for c in keep:
        addrs = sorted(addr_of[c.FormularId])
        my_count, located = entrance_counts(addrs)
        mine = set(my_count)
        row = {"certificate": c.FormularId, "addresses": " | ".join(c.addrs or []), "property": c.fast,
               "heated_area_m2": c.atemp, "floors": c.floors, "built": c.built, "energy_kwh_m2": c.energy,
               "class": c.cls, "issued": (c.issued or "")[:10]}
        if not located:
            report.append({**row, "result": "review", "detail": "no Lantmäteriet address point for these addresses"}); continue
        if not mine:
            report.append({**row, "result": "review", "detail": f"no building within {MAX_DIST_M:.0f} m of the entrances"}); continue
        give, notes = set(), []
        free = {i for i in mine if recs[i].get("energy") is None}
        give |= free
        for key in {group_key(recs[i]) for i in mine - free}:
            group = {i for i, r in enumerate(recs) if group_key(r) == key}
            their_count, _ = entrance_counts({norm(x) for a in re.split(r"\s*\|\s*", key) for x in expand(a)})
            # A piece goes to the certificate with MORE entrances on it (an entrance
            # on the shared edge of a block must not decide it); the other
            # certificate has to keep at least one piece of its own.
            mine_only = {i for i in mine & group if my_count[i] > their_count.get(i, 0)}
            if mine_only and (group - mine_only):
                give |= mine_only
                notes.append(f"split from '{key}' ({len(mine_only)} of {len(group)} pieces)")
            else:
                notes.append(f"shares its pieces with '{key}' - needs a section outline")
        if not give:
            report.append({**row, "result": "review", "detail": "; ".join(notes)}); continue
        addr_list = [a for a in (c.addrs or []) if re.search(r"\d", a)]
        # The certificate's storey count only replaces the building's when it fits
        # the outline: heated area / (floors x footprint) between 0.5 and 1.6
        # (Atemp excludes walls; it can include a heated basement).
        fp_total = sum(float(recs[i].get("footprint_m2") or 0) for i in give)
        floors_ok = bool(c.floors and c.atemp and fp_total and 0.5 <= float(c.atemp) / (float(c.floors) * fp_total) <= 1.6)
        if c.floors and not floors_ok:
            notes.append(f"certificate's {c.floors} floors do not fit the outline - building's own floors kept")
        for i in give:
            r = recs[i]
            r.update({"energy": float(c.energy), "eclass": (c.cls or "").strip().upper() or None,
                      "eclass_color": ECLASS_COLORS.get((c.cls or "").strip().upper()), "year": int(c.built) if c.built else r.get("year"),
                      "area": float(c.atemp) if c.atemp else None, "floors": float(c.floors) if floors_ok else r.get("floors"),
                      "address": addr_list[0] if addr_list else r.get("address"), "all_addresses": " | ".join(sorted(addr_list)) or r.get("all_addresses"),
                      "has_epc": True, "tabula_period": tabula_period(int(c.built)) if c.built else r.get("tabula_period"),
                      "tabula_u_wall": None, "tabula_u_roof": None, "tabula_u_win": None, "perf_pct": None, TAG: int(c.FormularId)})
        changed += len(give)
        report.append({**row, "result": "sections" if any(n.startswith("split") for n in notes) else "free",
                       "detail": "; ".join([f"attached to {len(give)} building piece(s)"] + notes)})

    # ── Label every piece with the entrances that are ON it ────────────────────
    # A certificate lists every entrance of the building it covers, so all its
    # pieces showed the same (first) address - e.g. 'Tre Kronors Väg 41A' on both
    # the main block and the Kvarnholmsvägen 96 corner - and pieces without a
    # certificate showed only their property designation ('SICKLAÖN 38:30').
    # Each entrance point goes to its nearest building (≤ MAX_DIST_M); a piece
    # with entrances shows them, lowest number first. The certificate's own list
    # is kept in `cert_addresses` (search + certificate grouping use it).
    # Pieces whose certificate lists an address: an entrance on the boundary between
    # two pieces belongs to the one whose own certificate names it.
    cert_list = {i: [a.strip() for a in re.split(r"\s*\|\s*", r.get("cert_addresses") or r.get("all_addresses") or "") if a.strip()]
                 for i, r in enumerate(recs) if r.get("energy") is not None}
    certified_by: dict[str, set[int]] = defaultdict(set)
    for i, names in cert_list.items():
        for a in names:
            certified_by[norm(a)].add(i)

    def piece_for(p, label: str) -> int | None:
        cands = []
        for j in tree.query(p.buffer(MAX_DIST_M)):
            i = idx[j]
            if recs[i].get("use_cat") == "komplement":
                continue
            d = geoms[j].distance(p)
            if d <= MAX_DIST_M:
                cands.append((d, i))
        if not cands:
            return None
        named = [c for c in cands if c[1] in certified_by.get(norm(label), ())]
        return min(named or cands)[1]

    own: dict[int, list[str]] = defaultdict(list)
    for plist in pts.values():
        for p, label in plist:
            i = piece_for(p, label)
            if i is not None:
                own[i].append(label)
    relabelled = 0
    for i, labels in own.items():
        r = recs[i]
        if r.get("all_addresses") and "cert_addresses" not in r:
            r["cert_addresses"] = r["all_addresses"]
        spelled = {norm(a): a for a in cert_list.get(i, [])}
        # the piece's own certificate addresses first (lowest number first), then the rest
        names = sorted({spelled.get(norm(x), x) for x in labels},
                       key=lambda a: (norm(a) not in spelled, natural_key(a)))
        new_all = " | ".join(names)
        if (r.get("address"), r.get("all_addresses")) != (names[0], new_all):
            relabelled += 1
        r["address"], r["all_addresses"] = names[0], new_all
    print(f"[cert-by-address] {city_id}: {len(own):,} buildings labelled with their own entrances ({relabelled:,} changed)")

    # Certificates placed by an earlier run stay in the report.
    done_now = {r["certificate"] for r in report}
    earlier = defaultdict(list)
    for r in recs:
        if TAG in r and r[TAG] not in done_now:
            earlier[r[TAG]].append(r)
    for fid, rs in earlier.items():
        r0 = rs[0]
        report.append({"certificate": fid, "addresses": r0.get("all_addresses"), "property": None, "heated_area_m2": r0.get("area"),
                       "floors": r0.get("floors"), "built": r0.get("year"), "energy_kwh_m2": r0.get("energy"), "class": r0.get("eclass"),
                       "issued": None, "result": "placed earlier", "detail": f"on {len(rs)} building piece(s)"})

    for path in files:
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(recs, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path)
    out = ROOT / "data" / "analysis" / f"{city_id}_certificates_by_address.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    if report:
        with open(out, "w", newline="", encoding="utf-8-sig") as fh:
            w = csv.DictWriter(fh, fieldnames=list(report[0]), delimiter=";")
            w.writeheader(); w.writerows(report)
    tally = defaultdict(int)
    for r in report:
        tally[r["result"]] += 1
    print(f"[cert-by-address] {city_id}: {len(keep)} unattached certificates -> {dict(tally)}; "
          f"{changed} building pieces updated; report {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
