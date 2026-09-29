"""
ingest_tabula.py - Belgian TABULA archetypes (VITO) -> frontend/public/be/tabula_be.json

Belgium has ONE national typology (VITO, 2011-2013); the TABULA report says
separate regional typologies were not feasible, so the same set serves Brussels
and Flanders. Source is the EPISCOPE calculator workbook, sheet
Calc.Set.Building, rows BE.N.<type>.<period>.<size>.ReEx.001.<variant>:

    type     SFH (detached) | TH (terraced; .Semi = semi-detached)
             MFH (small multi-family; .Small = 3-6 flats) | AB (apartment block)
    period   01 <=1945 | 02 1946-70 | 03 1971-90 | 04 1991-2005 | 05 2006-11 | 06 2012+
    variant  001 existing state | 002 standard refurbishment | 003 advanced

Output mirrors tools/uk/ingest_tabula.py (type_label/use_cat/period/as_built/
standard_refurbishment/ambitious_refurbishment) so the frontend tier picker can
read it unchanged, plus BE-only fields (code, attached neighbours, infiltration,
reference area) the pipeline uses to pick an archetype from geometry.

Where an element has two parts (e.g. Roof_1 pitched + Roof_2 over an unheated
attic), the U-value is the area-weighted mean of U_Actual_* - the same figure
TABULA's own heat-loss calc uses.

Quirk: the source's variant descriptions read "EPBD regulations for new build
in 2010", "...2011", ... "2032" - an Excel fill-down artefact, not real target
years. We label tiers by level only.

    python tools/be/ingest_tabula.py [--download]
"""

from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "be_raw" / "tabula-calculator.xlsx"
URL = "https://episcope.eu/fileadmin/tabula/public/calc/tabula-calculator.xlsx"
OUT_DIRS = [ROOT / "frontend" / "public" / "be", ROOT / "assets" / "be"]

PERIODS = {
    "01": ("<=1945", "pre-1946", None, 1945),
    "02": ("1946-1970", "1946-1970", 1946, 1970),
    "03": ("1971-1990", "1971-1990", 1971, 1990),
    "04": ("1991-2005", "1991-2005", 1991, 2005),
    "05": ("2006-2011", "2006-2011", 2006, 2011),
    "06": ("2012+", "2012-", 2012, None),
}
TYPES = {
    ("SFH", "Gen"): ("Detached house", "bostad_enfamilj"),
    ("TH", "Gen"): ("Terraced house", "bostad_enfamilj"),
    ("TH", "Semi"): ("Semi-detached house", "bostad_enfamilj"),
    ("MFH", "Gen"): ("Multi-family house", "bostad_flerfamilj"),
    ("MFH", "Small"): ("Small multi-family house", "bostad_flerfamilj"),
    ("AB", "Gen"): ("Apartment block", "bostad_flerfamilj"),
}
VARIANTS = {"001": "as_built", "002": "standard_refurbishment", "003": "ambitious_refurbishment"}


def _wmean(d: dict, elem: str, parts: int) -> float | None:
    num = den = 0.0
    for i in range(1, parts + 1):
        u, a = d.get(f"U_Actual_{elem}_{i}"), d.get(f"A_Calc_{elem}_{i}")
        if u and a:
            num += u * a
            den += a
    return round(num / den, 3) if den else None


def _values(d: dict) -> dict:
    return {
        "u_roof": _wmean(d, "Roof", 2),
        "u_wall": _wmean(d, "Wall", 3),
        "u_floor": _wmean(d, "Floor", 2),
        "u_window": _wmean(d, "Window", 2),
        "u_door": _wmean(d, "Door", 1),
        "g_window": round(d["g_gl_n_Window_1"], 2) if d.get("g_gl_n_Window_1") else None,
        "delta_u_thermal_bridge": d.get("delta_U_ThermalBridging"),
        "kwh_m2_yr": round(d["q_h_nd"], 1) if d.get("q_h_nd") else None,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true")
    args = ap.parse_args()
    if args.download or not RAW.exists():
        RAW.parent.mkdir(parents=True, exist_ok=True)
        print(f"downloading {URL} ...")
        urllib.request.urlretrieve(URL, RAW)

    import openpyxl  # heavy; only needed here

    ws = openpyxl.load_workbook(RAW, read_only=True, data_only=True)["Calc.Set.Building"]
    hdr = None
    groups: dict[str, dict] = {}
    for r in ws.iter_rows(values_only=True):
        if hdr is None:
            if r and "Code_BuildingVariant" in r:
                hdr = list(r)
            continue
        d = dict(zip(hdr, r))
        code = d.get("Code_BuildingVariant")
        if not (isinstance(code, str) and code.startswith("BE.N.")):
            continue
        # BE.N.TH.01.Semi.ReEx.001.002
        _, _, btype, per, size, _, _, var = code.split(".")
        if (btype, size) not in TYPES or var not in VARIANTS:
            continue
        key = f"BE.N.{btype}.{per}.{size}"
        type_label, use_cat = TYPES[(btype, size)]
        plabel, pkey, y1, y2 = PERIODS[per]
        g = groups.setdefault(key, {
            "code": key,
            "type": btype,
            "size_variant": size,
            "type_label": type_label,
            "use_cat": use_cat,
            "period_label": plabel,
            "period": pkey,
            "year_from": y1,
            "year_to": y2,
            "attached_neighbours": {"B_Alone": 0, "B_N1": 1, "B_N2": 2}.get(d["Code_AttachedNeighbours"]),
            "n_apartments": d.get("n_Apartment"),
            "a_ref_m2": round(d["A_C_Ref"], 1) if d.get("A_C_Ref") else None,
            "n_air_infiltration": d.get("n_air_infiltration"),
        })
        g[VARIANTS[var]] = _values(d)

    archetypes = sorted(groups.values(), key=lambda a: (a["type"], a["size_variant"], a["year_from"] or 0))
    doc = {
        "dataset": "EPISCOPE/TABULA Building Typology: Belgium (national)",
        "publisher": "VITO, TABULA/EPISCOPE (IEE), 2011-2013",
        "url": "https://episcope.eu/building-typology/country/be/",
        "source_xlsx": URL,
        "source_pdf": "https://episcope.eu/fileadmin/tabula/public/docs/brochure/BE_TABULA_TypologyBrochure_VITO.pdf",
        "note": (
            "U-values W/(m2K), area-weighted over each element's parts (U_Actual_*); kwh_m2_yr is "
            "TABULA's standard-calculation heating need q_h_nd per m2 reference area (EU.SUH boundary "
            "conditions, 20 C, national climate) - an archetype figure, not metered. One national "
            "typology covers Brussels and Flanders. No apartment block before 1946 in the source: "
            "use MFH.01. Tier descriptions' target years in the source are a fill-down artefact."
        ),
        "archetypes": archetypes,
    }
    for out_dir in OUT_DIRS:
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "tabula_be.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(archetypes)} archetypes -> {', '.join(str(o.relative_to(ROOT)) for o in OUT_DIRS)}")
    for a in archetypes:
        ab = a["as_built"]
        print(f"  {a['code']:<22} {a['type_label']:<26} {a['period_label']:<10} "
              f"wall {ab['u_wall']} roof {ab['u_roof']} win {ab['u_window']} q_h {ab['kwh_m2_yr']}")


if __name__ == "__main__":
    main()
