"""
DESNZ postcode-level domestic gas and electricity consumption (metered, annual),
cut to one UK city's postcodes.

Source: DESNZ "Postcode level gas statistics: 2024" and "Postcode level
electricity statistics: 2024" (published Dec 2025, Open Government Licence v3.0).
Columns: Outcode, Postcode, Num_meters, Total_cons_kwh, Mean_cons_kwh,
Median_cons_kwh. Per DESNZ's notes: postcodes with < 5 meters, or where the top
2 meters exceed 90% of consumption, are suppressed (folded into an outcode
"All postcodes" row); meters under 100 kWh/yr are excluded. DESNZ recommends
the median as the typical value.

Output: frontend/public/uk/desnz_postcode_<city>.json
    {"year": 2024, "source": ..., "postcodes": {"S60 2QB": {"gas": {...}, "electricity": {...}}},
     "outcodes": {"S60": {...}}}

Usage:
    python tools/uk/ingest_desnz_postcode.py [--city rotherham] [--year 2024]
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import requests

from anchor_epc_uprn import city_postcodes
from cities import CITIES
from ingest_epc import norm_postcode

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "uk_raw" / "desnz"
OUT = ROOT / "frontend" / "public" / "uk"

FILES = {
    2024: {
        "gas": "https://assets.publishing.service.gov.uk/media/6942a4e2501cdd438f4cf502/Postcode_level_gas_2024.csv",
        # "All domestic meters" = standard + Economy 7 combined.
        "electricity": "https://assets.publishing.service.gov.uk/media/694282a1fdbd8404f9e1f1da/Postcode_level_all_meters_electricity_2024.csv",
    },
}
SOURCE_PAGES = {
    "gas": "https://www.gov.uk/government/statistics/postcode-level-gas-statistics-2024",
    "electricity": "https://www.gov.uk/government/statistics/postcode-level-electricity-statistics-2024",
}


def download(url: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 1_000_000:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        tmp = dest.with_suffix(".part")
        with open(tmp, "wb") as fh:
            for chunk in r.iter_content(1 << 20):
                fh.write(chunk)
        tmp.replace(dest)
    return dest


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", default="rotherham")
    ap.add_argument("--year", type=int, default=2024)
    args = ap.parse_args()

    city = next(c for c in CITIES if c["id"] == args.city)
    wanted = city_postcodes(city)
    outcodes = {pc.split()[0] for pc in wanted}
    result = {"year": args.year, "city": city["id"],
              "source": "DESNZ postcode-level domestic gas and electricity statistics (OGL v3.0)",
              "source_pages": SOURCE_PAGES,
              "note": "Metered annual domestic consumption per postcode. Suppressed postcodes (<5 meters or 2 meters >90%) "
                      "appear only in the outcode 'All postcodes' rows. Use the median as the typical meter.",
              "postcodes": {}, "outcodes": {}}

    for fuel, url in FILES[args.year].items():
        path = download(url, RAW / Path(url).name)
        n = 0
        with open(path, newline="", encoding="utf-8-sig") as fh:
            for row in csv.DictReader(fh):
                rec = {"meters": _num(row.get("Num_meters")), "total_kwh": _num(row.get("Total_cons_kwh")),
                       "mean_kwh": _num(row.get("Mean_cons_kwh")), "median_kwh": _num(row.get("Median_cons_kwh"))}
                oc = (row.get("Outcode") or "").strip().upper()
                pc_raw = (row.get("Postcode") or "").strip()
                if pc_raw.lower().startswith("all postcodes"):
                    if oc in outcodes:
                        result["outcodes"].setdefault(oc, {})[fuel] = rec
                    continue
                pc = norm_postcode(pc_raw)
                if pc in wanted:
                    result["postcodes"].setdefault(pc, {})[fuel] = rec
                    n += 1
        print(f"  {fuel}: {n:,} of {len(wanted):,} city postcodes have published (unsuppressed) data")

    out = OUT / f"desnz_postcode_{city['id']}.json"
    out.write_text(json.dumps(result, indent=1), encoding="utf-8")
    print(f"  -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
