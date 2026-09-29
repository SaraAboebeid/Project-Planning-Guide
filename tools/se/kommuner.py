"""
kommuner.py - the list of Swedish municipalities a city can be built for.

Reads Lantmäteriet's open STAC catalogue (no login needed for the listing): one
`byggnader` item per municipality, with its code, name, county and extent. Adds
how many energy declarations each municipality has in the national Boverket
table, so the picker can show what a build will yield.

    python tools/se/kommuner.py
Writes data/se/kommuner.json.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

import duckdb
import requests

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "se" / "kommuner.json"
STAC = "https://api.lantmateriet.se/stac-vektor/v1/collections/byggnader/items?limit=300"
EPC_DB = ROOT / "data" / "sensitivity" / "epc_sweden.duckdb"

# County (län) code -> EUBUCCO NUTS-2 region.
LAN_TO_NUTS2 = {
    "01": "SE11",
    "03": "SE12", "04": "SE12", "05": "SE12", "18": "SE12", "19": "SE12",
    "06": "SE21", "07": "SE21", "08": "SE21", "09": "SE21",
    "10": "SE22", "12": "SE22",
    "13": "SE23", "14": "SE23",
    "17": "SE31", "20": "SE31", "21": "SE31",
    "22": "SE32", "23": "SE32",
    "24": "SE33", "25": "SE33",
}


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")


def main() -> None:
    items, url = [], STAC
    while url:
        r = requests.get(url, timeout=60, headers={"User-Agent": "ppg-research/1.0 (Chalmers)"})
        r.raise_for_status()
        d = r.json()
        items += d["features"]
        url = next((l["href"] for l in d.get("links", []) if l.get("rel") == "next"), None)

    con = duckdb.connect(str(EPC_DB), read_only=True)
    epc = dict(con.execute("""
        SELECT _kommunkod_4digit, count(*) FILTER (WHERE EgiSpecifikEnergianvandning IS NOT NULL)
        FROM epc GROUP BY 1""").fetchall())
    names = dict(con.execute("SELECT _kommunkod_4digit, min(IdKommun) FROM epc GROUP BY 1").fetchall())
    con.close()

    out = []
    for it in items:
        code = it["id"]
        p = it["properties"]
        title = re.sub(r"^Byggnader för\s+", "", p.get("title", "")).strip()
        # The EPC table's IdKommun is the name the EPC filters match on.
        name = names.get(code) or re.sub(r"s?\s+kommun$", "", title)
        lan = p.get("lanskod") or code[:2]
        out.append({
            "code": code,
            "name": name,
            "title": title,
            "slug": slugify(name),
            "lan": lan,
            "nuts2": LAN_TO_NUTS2.get(lan),
            "bbox4326": [round(v, 5) for v in it["bbox"]],
            "bbox3006": p.get("proj:bbox"),
            "buildings_file_mb": round((it["assets"]["data"].get("file:size") or 0) / 1e6, 1),
            "epc_with_energy": int(epc.get(code, 0)),
        })
    out.sort(key=lambda k: k["name"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(out)} municipalities -> {OUT.relative_to(ROOT)}")
    missing = [k["name"] for k in out if not k["nuts2"]]
    print("no NUTS-2 mapping:", missing or "none")
    for k in out[:3] + [k for k in out if k["name"] in ("Ystad", "Malmö", "Kiruna")]:
        print(" ", k["code"], k["name"], k["nuts2"], k["epc_with_energy"], k["buildings_file_mb"], "MB")


if __name__ == "__main__":
    main()
