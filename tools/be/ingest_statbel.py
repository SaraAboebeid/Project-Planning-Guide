"""
ingest_statbel.py - Statbel building stock -> construction-period priors per municipality

No Belgian open dataset gives a per-building construction year (CadGIS keeps the
patrimonial record closed). Statbel's building stock (from the cadastre, CC BY
4.0) gives, per municipality AND building type, the number of buildings in each
construction class - the best open prior there is. The pipeline samples a
period from this when a building has no year (tagged year_source=statbel_prior),
exactly as the UK pipeline samples from EHS priors.

Building types (CD_BUILDING_TYPE):
    R1 closed (terraced)   R2 semi-detached   R3 detached/farms/castles
    R4 apartment buildings R5 commercial houses R6 all other buildings
Stat codes used: T1 buildings, T3.1..T3.7.4 construction classes, T8 dwellings.

    python tools/be/ingest_statbel.py [--download] [--year 2025]
Writes frontend/public/be/statbel_building_stock.json (+ assets/be/).
"""

from __future__ import annotations

import argparse
import json
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "be_raw" / "building_stock_open_data_2025.zip"
URL = "https://statbel.fgov.be/sites/default/files/files/opendata/Buildstock/building_stock_open_data_2025.zip"
OUT_DIRS = [ROOT / "frontend" / "public" / "be", ROOT / "assets" / "be"]

# Statbel construction classes -> [first, last] year. "before 1900" gets 1850
# as a nominal lower bound for sampling; it lands in TABULA period 01 either way.
CLASSES = {
    "T3.1": (1850, 1899),
    "T3.2": (1900, 1918),
    "T3.3": (1919, 1945),
    "T3.4": (1946, 1961),
    "T3.5": (1962, 1970),
    "T3.6": (1971, 1981),
    "T3.7.1": (1982, 1991),
    "T3.7.2": (1992, 2001),
    "T3.7.3": (2002, 2011),
    "T3.7.4": (2012, 2024),
}
TYPES = {"R1": "closed", "R2": "semi_detached", "R3": "detached",
         "R4": "apartment_building", "R5": "commercial", "R6": "other"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--year", default="2025")
    args = ap.parse_args()
    if args.download or not RAW.exists():
        RAW.parent.mkdir(parents=True, exist_ok=True)
        print(f"downloading {URL} ...")
        urllib.request.urlretrieve(URL, RAW)

    z = zipfile.ZipFile(RAW)
    text = z.read("building_stock_open_data.txt").decode("latin-1")
    munis: dict[str, dict] = {}
    for line in text.splitlines()[1:]:
        p = line.split("|")
        # CD_REFNIS_LVL 5 = municipality (1 country, 2 region, 3 province, 4 arrondissement)
        if p[0] != args.year or p[4] != "5" or p[8] not in TYPES:
            continue
        stat, val = p[5], int(p[11] or 0)
        if stat not in CLASSES and stat not in ("T1", "T8"):
            continue
        m = munis.setdefault(p[1], {"nis": p[1], "name_nl": p[2], "name_fr": p[3], "types": {}})
        t = m["types"].setdefault(TYPES[p[8]], {"buildings": 0, "dwellings": 0, "periods": {}})
        if stat == "T1":
            t["buildings"] = val
        elif stat == "T8":
            t["dwellings"] = val
        else:
            t["periods"][f"{CLASSES[stat][0]}-{CLASSES[stat][1]}"] = val

    doc = {
        "dataset": f"Statbel building stock {args.year} (cadastral, 1 January)",
        "publisher": "Statbel (Directorate-general Statistics - Statistics Belgium)",
        "licence": "CC BY 4.0",
        "url": URL,
        "note": ("Counts of buildings per municipality x building type x construction class. "
                 "A prior only - never a per-building year. 'Before 1900' is given a nominal "
                 "1850-1899 range for sampling."),
        "year": int(args.year),
        "municipalities": munis,
    }
    for out_dir in OUT_DIRS:
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "statbel_building_stock.json").write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    bru = [m for n, m in munis.items() if n.startswith("21")]
    print(f"{len(munis)} municipalities ({len(bru)} in Brussels-Capital) -> statbel_building_stock.json")
    for m in bru[:3] + [munis.get("44021")]:
        if m:
            c = m["types"].get("closed", {})
            print(f"  {m['nis']} {m['name_fr']:<28} closed={c.get('buildings')} periods={c.get('periods')}")


if __name__ == "__main__":
    main()
