"""
ingest_tabula.py - parse the real EPISCOPE/TABULA "Building Typology Brochure:
England" (BRE, September 2014) into the U-value archetype table the UK
buildings pipeline and backend need.

  https://episcope.eu/building-typology/country/gb/
  https://episcope.eu/fileadmin/tabula/public/docs/brochure/GB_TABULA_TypologyBrochure_BRE.pdf

TABULA/EPISCOPE's 13 core partner countries didn't include the UK, but a GB/
England national typology WAS produced as part of EPISCOPE's later expansion,
built directly from English Housing Survey stock data - the same source
ingest_ehs.py already uses, so the two are naturally consistent. 28 archetypes:
4 dwelling types (Single Family House, Terraced House, Multi Family House,
Apartment Building) x 7 construction eras - though the brochure itself notes
"small sample size, no data" for several Apartment-Building/period
combinations, so only the ones actually printed exist (28 pages -> fewer
than 28 archetypes; missing combinations return None, same as Sweden's table
already does for anything outside its own coverage).

Usage:
    python tools/uk/ingest_tabula.py            # parse the already-downloaded PDF
    python tools/uk/ingest_tabula.py --download  # fetch it first

Output:
    frontend/public/uk/tabula_gb.json
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "uk_raw"
OUT_DIR = ROOT / "frontend" / "public" / "uk"
PDF_PATH = RAW_DIR / "GB_TABULA_TypologyBrochure_BRE.pdf"
PDF_URL = "https://episcope.eu/fileadmin/tabula/public/docs/brochure/GB_TABULA_TypologyBrochure_BRE.pdf"

# Brochure building-type labels -> this project's use_cat scheme.
TYPE_TO_USE_CAT = {
    "Single Family House": "bostad_enfamilj",
    "Terraced house": "bostad_enfamilj",
    "Multi Family House": "bostad_flerfamilj",
    "Apartment Building": "bostad_flerfamilj",
}

# Brochure period labels -> the EHS/EUBUCCO dwelling-age bands already used
# elsewhere in this pipeline (see ingest_ehs.py's AGE_ALIASES / AGE_BANDS).
PERIOD_ALIASES = {
    "pre 1919": "pre-1919",
    "1919-1944": "1919-44",
    "1945-1964": "1945-64",
    "1965-80": "1965-80",
    "1965-1980": "1965-80",
    "1981-1990": "1981-90",
    "1991- 2003": "1991-2002",
    "1991-2003": "1991-2002",
    "2004-2009": "2003-2013",
    "2004 - 2009": "2003-2013",
    "2004-2010": "2003-2013",
    "2004 - 2010": "2003-2013",
    "post 2010": "post-2013",
}

TITLE_RE = re.compile(
    r"^(Single Family House|Terraced house|Multi Family House|Apartment Building)\s+(.+)$"
)


def _download() -> None:
    import requests

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    print(f"  downloading {PDF_URL} ...")
    r = requests.get(PDF_URL, timeout=60)
    r.raise_for_status()
    PDF_PATH.write_bytes(r.content)
    print(f"    {PDF_PATH} ({len(r.content) / 1024:.0f} KB)")


def _num(s) -> float | None:
    try:
        return float(str(s).strip())
    except (TypeError, ValueError):
        return None


def _first_number(line: str) -> float | None:
    """
    The u-value column always comes first; a trailing parenthetical like
    "1.5 (0.01m)" is the insulation THICKNESS in metres, not a second u-value -
    strip it before reading numbers, or a naive "last number" grab silently
    returns the thickness instead (0.01 instead of 1.5).
    """
    stripped = re.sub(r"\([^)]*\)", "", line)
    nums = re.findall(r"-?\d+\.?\d*", stripped)
    return _num(nums[0]) if nums else None


def parse_display_sheet(text: str) -> dict | None:
    """
    One archetype per "display sheet" page: as-built U-values + heating demand,
    plus the standard/ambitious refurbishment scenarios TABULA defines for it.
    """
    # PDF extraction sometimes prepends a stray "-" or a "Display Sheets"
    # section header before the actual title line - scan the first few lines
    # rather than assuming the title is always line 0.
    lines = [l.strip().lstrip("-").strip() for l in text.splitlines() if l.strip()]
    if not lines:
        return None

    type_label = period_label = None
    for line in lines[:3]:
        m = TITLE_RE.match(line)
        if m:
            type_label, period_label = m.groups()
            break
    if not type_label:
        return None
    period = PERIOD_ALIASES.get(period_label.strip())
    if not period:
        return None

    def _section(start_marker: str, end_markers: list[str]) -> list[str]:
        try:
            i = next(i for i, l in enumerate(lines) if start_marker in l)
        except StopIteration:
            return []
        j = len(lines)
        for marker in end_markers:
            for k in range(i + 1, len(lines)):
                if marker in lines[k]:
                    j = min(j, k)
        return lines[i:j]

    def _extract(section: list[str], label_needles: dict[str, str]) -> dict:
        out: dict[str, float | None] = {k: None for k in label_needles.values()}
        for line in section:
            low = line.lower()
            for needle, key in label_needles.items():
                if needle in low and out[key] is None:
                    out[key] = _first_number(line)
        return out

    as_built_section = _section(
        "AS BUILT", ["STANDARD REFURBISHMENT", "AMBITIOUS REFURBISHMENT"]
    )
    standard_section = _section(
        "STANDARD REFURBISHMENT", ["AMBITIOUS REFURBISHMENT"]
    )
    ambitious_section = _section("AMBITIOUS REFURBISHMENT", [])

    # Needles are lowercase substrings, checked with `in` rather than a prefix
    # match: real lines read "Masonry (Unfilled) Cavity wall None 1.6" (label
    # comes after a construction-method prefix) and "Double glazing n/a 3.1"
    # (not "double glazed"), neither of which a startswith("cavity wall") or
    # startswith("double glazed") would catch.
    as_built = _extract(
        as_built_section,
        {
            "roof": "u_roof",
            "wall": "u_wall",
            "floor": "u_floor",
            "glaz": "u_window",
            "door": "u_door",
            "energy needed for heating": "kwh_m2_yr",
        },
    )
    standard = _extract(
        standard_section,
        {
            "roof insulation": "u_roof",
            "wall insulation": "u_wall",
            "window change": "u_window",
            "energy needed for heating": "kwh_m2_yr",
        },
    )
    ambitious = _extract(
        ambitious_section,
        {
            "roof insulation": "u_roof",
            "wall insulation": "u_wall",
            "window change": "u_window",
            "door change": "u_door",
            "energy needed for heating": "kwh_m2_yr",
        },
    )

    return {
        "type_label": type_label,
        "use_cat": TYPE_TO_USE_CAT[type_label],
        "period_label": period_label.strip(),
        "period": period,
        "as_built": as_built,
        "standard_refurbishment": standard,
        "ambitious_refurbishment": ambitious,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true")
    args = ap.parse_args()

    if args.download or not PDF_PATH.exists():
        _download()

    archetypes = []
    with pdfplumber.open(PDF_PATH) as pdf:
        for page in pdf.pages:
            parsed = parse_display_sheet(page.extract_text() or "")
            if parsed:
                archetypes.append(parsed)

    print(f"Parsed {len(archetypes)} archetypes from {PDF_PATH.name}")
    by_type = {}
    for a in archetypes:
        by_type.setdefault(a["type_label"], []).append(a["period"])
    for t, periods in by_type.items():
        print(f"  {t}: {', '.join(periods)}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUT_DIR / "tabula_gb.json"
    out_path.write_text(
        json.dumps(
            {
                "dataset": "EPISCOPE/TABULA Building Typology Brochure: England",
                "publisher": "Building Research Establishment (BRE), September 2014",
                "url": "https://episcope.eu/building-typology/country/gb/",
                "source_pdf": "https://episcope.eu/fileadmin/tabula/public/docs/brochure/GB_TABULA_TypologyBrochure_BRE.pdf",
                "note": (
                    "U-values in W/(m2K); heating demand in kWh/(m2.yr). Built from "
                    "English Housing Survey stock data, so periods align with "
                    "ingest_ehs.py's dwelling-age bands. Some type/period combinations "
                    "were noted 'small sample size - no data' in the source and are "
                    "absent here, same as they are in the brochure."
                ),
                "archetypes": archetypes,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\nwrote {out_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
