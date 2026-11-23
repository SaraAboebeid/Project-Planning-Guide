"""frontend/src/data/wikells_sektionsdata.json → data/wikells_catalogue.json

The backend's address-based optimiser (/api/recommend-retrofit, chat tool)
prices envelope options from data/wikells_catalogue.json:
  {"Walls"|"Roof"|"Windows"|"Floor": [{code, description, cost_sek_m2, u_value, co2_kg_m2}]}
Same scope as before (chapters 7 / 11 / 16 / 9 from 9.048 on, items with a
U-value), now with Sektionsdata's current prices and kg CO2e per m² (A1–A3;
null where Wikells gives none). U-values: Wikells' own, else the EN ISO 6946
value the previous file carried for the same code. Windows are priced per
piece; the Swedish module size in the description ("9x13" = 1.17 m²) converts
price and carbon to per m².

Run after tools/catalog/build_wikells_sektionsdata.py:
    python tools/catalog/build_backend_wikells.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "frontend" / "src" / "data" / "wikells_sektionsdata.json"
OUT = ROOT / "data" / "wikells_catalogue.json"


def main():
    sd = json.loads(SRC.read_text(encoding="utf-8"))
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    old_u = {it["code"]: it.get("u_value") for items in old.values() for it in items}
    items = {i["id"]: (c["no"], g["name"], i) for c in sd["chapters"] for g in c["groups"] for i in g["items"]}

    def pick(chapter: int, keep=lambda code, group: True):
        out = []
        for code, (no, group, it) in items.items():
            if no != chapter or not keep(code, group) or not it.get("cost"):
                continue
            u = it.get("u") if it.get("u") is not None else old_u.get(code)
            if u is None or u <= 0:
                continue
            cost, co2 = it["cost"], it.get("co2")
            if it["unit"] == "SEK/pcs":
                m = re.search(r"(\d+)\s*x\s*(\d+)", it["desc"])
                if not m:
                    continue
                m2 = int(m.group(1)) * int(m.group(2)) / 100
                cost, co2 = cost / m2, (co2 / m2 if co2 else None)
            elif it["unit"] != "SEK/m²":
                continue
            out.append({"code": code, "description": it["desc"], "cost_sek_m2": round(cost, 2), "u_value": round(u, 3),
                        "co2_kg_m2": round(co2, 2) if co2 else None})
        return sorted(out, key=lambda x: [int(p) for p in x["code"].split(".")])

    cat = {
        "Walls": pick(7, lambda code, g: g != "External walls for plant rooms"),
        "Floor": pick(9, lambda code, g: float(code) >= 9.048),
        "Roof": pick(11),
        "Windows": pick(16, lambda code, g: g == "Windows"),
    }
    OUT.write_text(json.dumps(cat, ensure_ascii=False, indent=1), encoding="utf-8")
    for k, v in cat.items():
        print(f"{k}: {len(v)} options, {sum(1 for x in v if x['co2_kg_m2'])} with kg CO2e")


if __name__ == "__main__":
    main()
