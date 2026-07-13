"""
ingest_ehs.py - parse the English Housing Survey 2024-25 headline annex tables
(OpenDocument .ods, published by MHCLG) into JSON the dashboard can consume.

Source (Chapter 2, Energy Efficiency):
  https://www.gov.uk/government/statistics/annex-tables-for-english-housing-survey-2024-to-2025-headline-findings-on-housing-quality-and-energy-efficiency

Usage:
    python tools/uk/ingest_ehs.py            # parse whatever is in data/uk_raw/
    python tools/uk/ingest_ehs.py --download # fetch the .ods files first

Outputs:
    frontend/public/uk/ehs_2024_25.json          full parsed tables
    frontend/public/uk/epc_band_priors.json      band distribution by dwelling age/type
    frontend/public/uk/retrofit_cost_band_c.json cost to reach EER band C

The band priors are what let the 3D viewer colour a building whose address has no
EPC match: instead of leaving it grey we fall back to the national distribution for
its age band. Buildings coloured this way are tagged epc_source="ehs_prior" so the
UI can distinguish a measured certificate from a statistical estimate.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "uk_raw"
OUT_DIR = ROOT / "frontend" / "public" / "uk"

# MHCLG asset URLs for the 2024-25 headline report annex tables.
SOURCES = {
    "ehs_2024_25_ch2_energy_efficiency.ods": "https://assets.publishing.service.gov.uk/media/6978ed0f5da1fd4ddea98c5b/2024-25_EHS_Headline_Report_Chapter_2_Energy_Efficiency_Annex_Tables.ods",
    "ehs_2024_25_ch1_housing_quality.ods": "https://assets.publishing.service.gov.uk/media/6978ebde1c24881f40a4d6cc/2024-25_EHS_Headline_Report_Chapter_1_Housing_Quality_Annex_Tables.ods",
}

# EHS suppression markers: "u" = estimate too unreliable to publish,
# ":" = data not available for that year.
SUPPRESSED = {"u", ":", "-", ""}

# Each sheet stacks two panels of the same table: counts (thousands of dwellings)
# then the same figures as percentages. There is no repeated column header between
# them, so we split on the first repeat of a section label.
UNIT_COUNTS = "thousands of dwellings"
UNIT_PERCENT = "percentages"

# Tables with no section breaks (AT2_5, AT2_13) collect their rows here.
FLAT_SECTION = "all"

# The workbooks carry ~1600 legacy named-range artifacts alongside the real
# sheets. Only "AT<chapter>_<n>" is an annex table.
SHEET_RE = re.compile(r"^AT\d+_\d+$")

# The two panels label dwelling-age rows differently ("pre-1919" vs "pre 1919",
# "1919-44" vs "1919 to 1944"). Normalise so the panels can be joined by key.
AGE_ALIASES = {
    "pre 1919": "pre-1919",
    "1919 to 1944": "1919-44",
    "1945 to 1964": "1945-64",
    "1965 to 1980": "1965-80",
    "1981 to 1990": "1981-90",
    "1991 to 2002": "1991-2002",
    "2003 to 2013": "2003-2013",
}


def _download() -> None:
    import requests

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for name, url in SOURCES.items():
        dest = RAW_DIR / name
        print(f"  downloading {name} ...")
        r = requests.get(url, timeout=120)
        r.raise_for_status()
        dest.write_bytes(r.content)
        print(f"    {dest} ({len(r.content) / 1024:.0f} KB)")


def _clean(v):
    """Normalise a cell: numbers stay numbers, suppression markers become None."""
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    if isinstance(v, (int, float)):
        return round(float(v), 4)
    s = str(v).strip()
    if s.lower() in SUPPRESSED:
        return None
    # Some cells arrive as text-formatted numbers with thousands separators.
    try:
        return round(float(s.replace(",", "").replace("£", "")), 4)
    except ValueError:
        return s


def _is_blank_row(row) -> bool:
    return all(_clean(v) is None for v in row)


def _label(v) -> str | None:
    """
    Read the label column (always column 1) as text.

    It must not be numeric-coerced: several tables use years as row labels
    (AT2_2 nests 2014/2024 under each tenure), and coercing those to floats
    would strip the label and make the row look like a column header.
    """
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    s = str(v).strip()
    return s or None


def parse_sheet(df: pd.DataFrame) -> dict:
    """
    Parse one annex-table sheet.

    Layout, inferred structurally rather than from a list of known labels:
        title row     starts with "Annex Table"
        header row    label column empty, >=2 populated value cells
        unit row      label column empty, exactly one string value cell
        section row   label present, every value cell empty  ("tenure", "region", ...)
        data row      label present, >=1 value cell populated
        total row     label "all dwellings" - kept out of sections, exposed as `total`
        notes/sources trailing prose

    Sheets stack two panels of the same table (counts, then percentages) with no
    repeated header. We start a new panel when a section label repeats.

    Returns {title, columns, panels: {unit: {sections, total}}, notes, sources}
    """
    # Column 0 is always empty padding, column 1 is the row label, columns 2+ are
    # values. Parse the label column as text and the value range as numbers.
    rows_raw = list(df.itertuples(index=False))
    grid = [(_label(r[1] if len(r) > 1 else None), [_clean(v) for v in r[2:]]) for r in rows_raw]

    title = ""
    for lbl, _ in grid[:6]:
        if lbl and lbl.startswith("Annex Table"):
            title = lbl
            break

    columns: list[str] = []
    panels: list[dict] = []
    panel = None
    current = None
    notes, sources = [], []

    def _new_panel(unit=None):
        p = {"unit": unit, "sections": {}, "total": None}
        panels.append(p)
        return p

    def _has_rows(p) -> bool:
        return any(rows for rows in p["sections"].values()) or p["total"] is not None

    for label, values in grid:
        strings = [v for v in values if isinstance(v, str)]
        populated = [v for v in values if v is not None]
        if label is None and not populated:
            continue
        low = label.strip().lower().rstrip(":") if label else ""

        # Trailing prose. Check before section detection: a note row also has an
        # empty value range and would otherwise look like a section header.
        if low.startswith("note") or low.startswith("source"):
            (sources if low.startswith("source") else notes).append(label)
            continue
        if notes or sources:
            if label and not populated:
                (sources if sources else notes).append(label)
                continue

        if label is None:
            # >=2 populated cells is the column header; it opens a panel.
            if len(populated) >= 2:
                # Year headers arrive as floats; render them "2024", not "2024.0",
                # so callers can look a column up by the year they see in the report.
                columns = [_label(v) for v in populated]
                panel = _new_panel()
                current = None
            # A lone string is a spanning caption above the header ("Energy
            # Efficiency Rating Band") or a unit below it ("thousands of
            # dwellings"). Position tells them apart: only the latter follows a
            # header row, so only then do we have columns.
            elif len(strings) == 1 and columns and panel is not None:
                if _has_rows(panel):
                    # A unit row after data means the next stacked panel begins.
                    # Flat tables (AT2_5) split this way rather than by repeating
                    # a section label.
                    panel = _new_panel(strings[0])
                    current = None
                else:
                    panel["unit"] = strings[0]
            continue

        # Everything above the header row is preamble ("all dwellings", the title).
        if not columns or panel is None:
            continue
        if title and label == title:
            continue

        # Section header: a label with an entirely empty value range. Guard against
        # stray prose by requiring a short label.
        if not populated:
            if len(label) <= 60:
                if label.lower() in panel["sections"]:
                    # Section repeats -> this is the next stacked panel.
                    panel = _new_panel(UNIT_PERCENT)
                current = label.lower()
                panel["sections"].setdefault(current, [])
            continue

        vals = (list(values) + [None] * len(columns))[: len(columns)]
        record = {
            "label": AGE_ALIASES.get(label.lower(), label),
            "values": dict(zip(columns, vals)),
        }

        if low in ("all dwellings", "all households", "total"):
            panel["total"] = record
            continue
        if current is None:
            # Flat table (AT2_5, AT2_13): rows follow the header with no section
            # break. Collect them under a single implicit section.
            current = FLAT_SECTION
            panel["sections"].setdefault(current, [])
        panel["sections"][current].append(record)

    panels = [p for p in panels if any(rows for rows in p["sections"].values())]
    if not panels or not columns:
        return {}

    # Panel 1 is counts; a following panel whose rows sum to 100 is percentages.
    if panels and panels[0]["unit"] is None:
        panels[0]["unit"] = UNIT_COUNTS
    for p in panels[1:]:
        if p["unit"] is None:
            p["unit"] = UNIT_PERCENT

    return {
        "title": title,
        "columns": columns,
        "panels": {p["unit"]: {"sections": p["sections"], "total": p["total"]} for p in panels},
        "notes": notes,
        "sources": sources,
    }


def _panel(table: dict, prefer: str = UNIT_COUNTS) -> dict:
    """Pick a panel from a parsed table: the preferred unit, else the first one."""
    panels = table.get("panels") or {}
    if prefer in panels:
        return panels[prefer]
    return next(iter(panels.values()), {"sections": {}, "total": None})


def parse_workbook(path: Path) -> dict:
    sheets = pd.read_excel(path, sheet_name=None, engine="odf", header=None)
    tables = {n: df for n, df in sheets.items() if SHEET_RE.match(n)}

    out, dropped = {}, []
    for name, df in tables.items():
        parsed = parse_sheet(df)
        if parsed and parsed.get("panels"):
            out[name] = parsed
        else:
            dropped.append(name)

    # A silently-skipped annex table would look identical to one that does not
    # exist, so say so rather than quietly under-reporting coverage.
    if dropped:
        print(f"  WARNING: could not parse {len(dropped)} table(s): {', '.join(sorted(dropped))}")
    return out


# ---------------------------------------------------------------------------
# Derived products
# ---------------------------------------------------------------------------

# EHS publishes 5 collapsed bands. EPC certificates use 7 (A-G). To colour a
# building from a prior we need the 7-band form, so we split the collapsed ends
# using the shape of the national EPC register: within A/B, A is rare (~3% of the
# pair); within F/G, G is the smaller share (~30%).
AB_SPLIT = {"A": 0.03, "B": 0.97}
FG_SPLIT = {"F": 0.70, "G": 0.30}


def build_band_priors(ch2: dict) -> dict:
    """From AT2_4 -> P(EPC band | dwelling age) and P(EPC band | dwelling type)."""
    t = ch2.get("AT2_4")
    if not t:
        raise SystemExit("AT2_4 (energy efficiency bands by dwelling characteristics) not found")

    counts = _panel(t, UNIT_COUNTS)
    bands = ["A/B", "C", "D", "E", "F/G"]
    priors: dict[str, dict] = {}

    for section in ("dwelling age", "dwelling type", "tenure", "region"):
        rows = counts["sections"].get(section, [])
        block = {}
        for row in rows:
            vals = {b: row["values"].get(b) for b in bands}
            total = sum(v for v in vals.values() if isinstance(v, (int, float)))
            if not total:
                continue
            expanded: dict[str, float] = {}
            for b in bands:
                v = vals.get(b) or 0.0
                share = v / total
                if b == "A/B":
                    for k, w in AB_SPLIT.items():
                        expanded[k] = round(share * w, 5)
                elif b == "F/G":
                    for k, w in FG_SPLIT.items():
                        expanded[k] = round(share * w, 5)
                else:
                    expanded[b] = round(share, 5)
            block[row["label"]] = {
                "bands": expanded,
                "dwellings_thousands": round(total, 1),
                "sample_size": row["values"].get("sample size"),
            }
        priors[section] = block

    return {
        "source": t["title"],
        "dataset": "English Housing Survey 2024-25, Chapter 2 (Energy Efficiency)",
        "publisher": "Ministry of Housing, Communities & Local Government",
        "licence": "Open Government Licence v3.0",
        "note": (
            "EHS publishes bands collapsed to A/B, C, D, E, F/G. A/B and F/G are split "
            f"into 7-band form using AB_SPLIT={AB_SPLIT} and FG_SPLIT={FG_SPLIT}, "
            "derived from the shape of the national EPC register."
        ),
        "priors": priors,
    }


def build_retrofit_costs(ch2: dict) -> dict:
    """From AT2_14 -> mean/median cost to lift a dwelling to EER band C."""
    t = ch2.get("AT2_14")
    if not t:
        raise SystemExit("AT2_14 (cost to improve to band C) not found")

    mean_key = next((c for c in t["columns"] if c.startswith("mean")), None)
    median_key = next((c for c in t["columns"] if c.startswith("median")), None)

    out = {}
    for section, rows in _panel(t)["sections"].items():
        out[section] = {
            r["label"]: {
                "mean_gbp": r["values"].get(mean_key),
                "median_gbp": r["values"].get(median_key),
                "sample_size": r["values"].get("sample size"),
            }
            for r in rows
        }

    return {
        "source": t["title"],
        "dataset": "English Housing Survey 2024-25, Chapter 2 (Energy Efficiency)",
        "publisher": "Ministry of Housing, Communities & Local Government",
        "licence": "Open Government Licence v3.0",
        "currency": "GBP",
        "costs": out,
    }


def build_headline_kpis(ch2: dict) -> list:
    """A few scalar KPIs for the country-profile panel in the 3D viewer."""
    kpis = []

    sap = ch2.get("AT2_1")
    if sap:
        rows = _panel(sap)["sections"].get("tenure", [])
        all_ten = next((r for r in rows if r["label"] == "all tenures"), None)
        if all_ten:
            latest = [c for c in sap["columns"] if str(c).startswith("2024")]
            if latest:
                v = all_ten["values"].get(latest[0])
                if isinstance(v, (int, float)):
                    kpis.append(
                        {"label": "Mean SAP rating", "value": round(v, 1), "unit": "SAP", "year": 2024}
                    )

    # AT2_4's "all dwellings" total row, in thousands of dwellings.
    t4 = ch2.get("AT2_4")
    total_row = _panel(t4, UNIT_COUNTS)["total"] if t4 else None
    if total_row:
        v = total_row["values"]
        ac, dg, all_dw = v.get("A to C"), v.get("D to G"), v.get("all dwellings")
        if isinstance(ac, (int, float)) and isinstance(all_dw, (int, float)) and all_dw:
            kpis.append(
                {
                    "label": "Dwellings at EPC band C or better",
                    "value": round(ac / all_dw * 100, 1),
                    "unit": "%",
                    "year": 2024,
                }
            )
        if isinstance(dg, (int, float)):
            kpis.append(
                {
                    "label": "Dwellings below band C",
                    "value": round(dg / 1000, 1),
                    "unit": "million",
                    "year": 2024,
                }
            )
        if isinstance(all_dw, (int, float)):
            kpis.append(
                {
                    "label": "Dwelling stock",
                    "value": round(all_dw / 1000, 1),
                    "unit": "million",
                    "year": 2024,
                }
            )

    t14 = ch2.get("AT2_14")
    if t14:
        rows = _panel(t14)["sections"].get("tenure", [])
        mean_key = next((c for c in t14["columns"] if c.startswith("mean")), None)
        vals = [r["values"].get(mean_key) for r in rows]
        vals = [v for v in vals if isinstance(v, (int, float))]
        if vals:
            kpis.append(
                {
                    "label": "Mean cost to reach band C",
                    "value": round(sum(vals) / len(vals)),
                    "unit": "GBP",
                    "year": 2024,
                }
            )

    return kpis


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true", help="fetch the .ods files first")
    args = ap.parse_args()

    if args.download:
        _download()

    ch2_path = RAW_DIR / "ehs_2024_25_ch2_energy_efficiency.ods"
    ch1_path = RAW_DIR / "ehs_2024_25_ch1_housing_quality.ods"
    if not ch2_path.exists():
        raise SystemExit(f"{ch2_path} not found - run with --download first")

    print("Parsing EHS 2024-25 annex tables ...")
    ch2 = parse_workbook(ch2_path)
    ch1 = parse_workbook(ch1_path) if ch1_path.exists() else {}
    print(f"  chapter 2 (energy efficiency): {len(ch2)} tables")
    print(f"  chapter 1 (housing quality):   {len(ch1)} tables")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    bundle = {
        "dataset": "English Housing Survey 2024-25 Headline Report",
        "publisher": "Ministry of Housing, Communities & Local Government",
        "licence": "Open Government Licence v3.0",
        "url": "https://www.gov.uk/government/collections/english-housing-survey-2024-to-2025-headline-findings-on-housing-quality-and-energy-efficiency",
        "coverage": "England",
        "kpis": build_headline_kpis(ch2),
        "energy_efficiency": ch2,
        "housing_quality": ch1,
    }
    _write(OUT_DIR / "ehs_2024_25.json", bundle)
    _write(OUT_DIR / "epc_band_priors.json", build_band_priors(ch2))
    _write(OUT_DIR / "retrofit_cost_band_c.json", build_retrofit_costs(ch2))

    print("\nHeadline KPIs:")
    for k in bundle["kpis"]:
        print(f"  {k['label']}: {k['value']} {k['unit']}")


def _write(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  wrote {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
