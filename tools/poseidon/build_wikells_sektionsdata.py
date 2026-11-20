"""Wikells Sektionsdata workbook -> poseidon/src/data/wikells_sektionsdata.json

Input: the English, structured export of Sektionsdata webb
(Wikells_Sektionsdata_EN_struktur.xlsx, sheet "Overview" = the component tree:
chapter -> sub-chapter -> component with section cost, unit, technical values,
cost breakdown, weight and kg CO2e).

Output, for the Poseidon catalogue window:
  chapters[]   the whole tree, for the "New buildings" section
  renovation[] the parts of it that apply when renovating EXISTING multi-family
               homes, grouped by building part, for the "Renovation planning"
               section. Sektionsdata is a new-build database: it has no add-on
               layers (e.g. "add 100 mm to an existing wall"), so a renovation
               group lists complete replacement parts, and each group says so.

Usage:  python tools/poseidon/build_wikells_sektionsdata.py "<path to xlsx>"
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "poseidon" / "src" / "data" / "wikells_sektionsdata.json"   # bundled: the Wizard derives its measures from it

# Whole chapters shown under Renovation planning (building parts: basement walls,
# external/internal walls, floors, stairs, roofs, ceilings, sheet metal, painting,
# finishes) instead of under New buildings — the user's choice, 2026-11-20.
RENOVATION_CHAPTERS = list(range(6, 16))

# Renovation planning, cross-chapter collections: building part -> (sub-chapters "<chapter no>|<sub-chapter name>",
# explicit component ids, note shown above the list). Sub-chapter names are the
# workbook's own headings, so a renamed heading fails loudly below instead of
# silently dropping items.
RENOVATION = [
    ("Windows and doors", ["16|Windows", "16|Doors", "16|Screens/glazed units", "16|Additional ironmongery, completion"], [],
     "Replacement windows and doors, priced per piece incl. fitting, architraves and sealing. Removal of the old unit is not included."),
    ("Basement and ground", ["6|Below ground", "3|Frost insulation around building"], [],
     "Basement wall insulation/drainage below ground and frost insulation. Excavation is priced separately (chapter 1)."),
    ("Balconies, entrances and railings", ["9|Balconies", "16|Glazing systems", "10|Entrance steps and landings",
                                           "10|Completions for stairs", "11|Canopies, solar shading"], [],
     "New balconies, balcony glazing, entrance steps, railings and canopies."),
    ("Kitchens and bathrooms", ["17|Kitchen", "17|WC/shower, laundry, cleaning", "17|Quick entry, fittings", "18|Housing",
                                "15|Floors", "15|Wall"], [],
     "Fittings, white goods, complete rooms and wet-room finishes for apartment refurbishment."),
    ("Common areas", ["17|Common areas", "18|Common areas"], [],
     "Stairwell entrances, common WCs and waste/recycling rooms."),
    ("Site and demolition", ["19|", "2|Roads, yards", "2|Topsoil areas"], [],
     "Removal of demolition waste and yard/garden works around the building."),
]


def num(v):
    try:
        return None if v is None or v == "" else float(v)
    except (TypeError, ValueError):
        return None


def u_value(tech: str | None):
    """First U-value in the technical values ("U-value above ground 0.42",
    "U-value, sand, gravel, till 0.12", "U-value 1.0")."""
    if not tech:
        return None
    m = re.search(r"U-val\w*[^0-9\n]*?(\d+[.,]\d+|\d+)", tech)
    return float(m.group(1).replace(",", ".")) if m else None


def main(xlsx: str):
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    readme = [r[0] for r in wb["Read me"].iter_rows(values_only=True) if r and r[0]]
    settings = {r[0]: r[1] for r in wb["Settings"].iter_rows(min_row=4, values_only=True) if r and r[0] and r[1] is not None}
    rows = list(wb["Overview"].iter_rows(values_only=True))
    source = rows[1][0] if len(rows) > 1 else ""
    hdr = rows[3]
    assert hdr[0] == "Component" and hdr[2] == "Section cost" and hdr[11] == "kg CO2e", hdr

    chapters, ch, sub = [], None, None
    for r in rows[4:]:
        c0, c1 = r[0], r[1]
        if c0 and not re.match(r"^\d+\.\d+$", str(c0).strip()):          # "7 - EXTERNAL WALLS"
            m = re.match(r"^(\d+)\s*-\s*(.+)$", str(c0).strip())
            if not m:
                continue
            ch = {"no": int(m.group(1)), "name": m.group(2).strip().capitalize(), "groups": []}
            chapters.append(ch)
            sub = None
            continue
        if ch is None:
            continue
        if c0 is None and c1:                                              # sub-chapter heading
            sub = {"name": str(c1).strip(), "items": []}
            ch["groups"].append(sub)
            continue
        if not c0:
            continue
        if sub is None:                                                    # chapters without sub-chapters (19–21)
            sub = {"name": "", "items": []}
            ch["groups"].append(sub)
        desc = str(c1 or "").strip()
        if desc.lower().startswith("spare component"):
            continue
        tech = str(r[4]).strip() if r[4] else None
        weight, co2 = num(r[10]), num(r[11])
        sub["items"].append({
            "id": str(c0).strip(), "desc": desc, "cost": num(r[2]), "unit": r[3] or "",
            "tech": tech.replace("\n", " | ") if tech else None, "u": u_value(tech),
            "material": num(r[5]), "hours": num(r[6]), "ue": num(r[7]), "other": num(r[8]), "overhead": num(r[9]),
            # A component priced only as a subcontract (UE) carries no material weight in
            # Sektionsdata, so 0 kg CO2e there means "not given", not "zero carbon".
            "weight": weight, "co2": co2 if (co2 or 0) > 0 else None,
        })

    by_key = {}
    by_id = {}
    for c in chapters:
        for g in c["groups"]:
            by_key[f'{c["no"]}|{g["name"]}'] = g
            for it in g["items"]:
                by_id[it["id"]] = it
    renovation = []
    for part, keys, extra, note in RENOVATION:
        ids = []
        for k in keys:
            if k.endswith("|"):                                            # a whole chapter
                no = int(k[:-1])
                grp = [g for c in chapters if c["no"] == no for g in c["groups"]]
                if not grp:
                    sys.exit(f"renovation group {part!r}: chapter {no} not found")
                ids += [it["id"] for g in grp for it in g["items"]]
                continue
            if k not in by_key:
                sys.exit(f"renovation group {part!r}: sub-chapter {k!r} not in the workbook")
            ids += [it["id"] for it in by_key[k]["items"]]
        for i in extra:
            if i not in by_id:
                sys.exit(f"renovation group {part!r}: component {i} not in the workbook")
            ids.append(i)
        renovation.append({"part": part, "note": note, "ids": list(dict.fromkeys(ids))})

    n = sum(len(g["items"]) for c in chapters for g in c["groups"])
    out = {
        "source": source, "readme": readme, "settings": settings,
        "chapters": [c for c in chapters if any(g["items"] for g in c["groups"])],
        "renovation": renovation,
        "renovation_chapters": RENOVATION_CHAPTERS,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{n} components in {len(out['chapters'])} chapters -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")
    for g in renovation:
        print(f"  renovation · {g['part']}: {len(g['ids'])}")
    print(f"  with U-value: {sum(1 for i in by_id.values() if i['u'] is not None)}, with kg CO2e: {sum(1 for i in by_id.values() if i['co2'])}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(ROOT.parent / "Wikells_Sektionsdata_EN_struktur.xlsx"))
