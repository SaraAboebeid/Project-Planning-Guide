"""
ingest_peb_wallonia.py - Walloon EPB certificate statistics for linking to buildings.

Source: "PEB - certification residentielle - batiment existant", Open Data
Wallonie-Bruxelles (ODWB, CC BY 4.0) - one row per certificate (874k), with
E_spec, label, dwelling type, free facades, construction period, heating device
and heated floor area, but NO address or coordinates: the finest location is
the municipality. So certificates cannot be matched to a building; instead each
building is linked to the certificates of *similar* dwellings in its
municipality (tools/be/be_data_pipeline.py reads this file).

Groups, per municipality NIS code and for Wallonia as a whole ("wallonia"):
    "<destination>|<free_facade>|<period>"  with "*" meaning "any"
    destination  SINGLE_FAMILY_HOUSE / APARTMENT
    free_facade  DETACHED (4 free) / THREE_FREE (end terrace, semi) / TWO_FREE (terraced);
                 apartments have none, so their facade is always "*"
    period       TABULA BE period code 01..06, from build_period_v2 / build_year only -
                 the coarse build_period classes (BEFORE_1971, AFTER_1984) straddle
                 TABULA periods and are counted only under period "*"

E_spec is the certificate's PRIMARY energy per heated m2 per year (kWh/m2.yr), an
asset rating from standardised use, not metered consumption.

    python tools/be/ingest_peb_wallonia.py [--src data/be_raw/peb_wallonia_residential.json]
"""

from __future__ import annotations

import argparse
import json
import statistics as st
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data" / "be_raw" / "peb_wallonia_residential.json"
OUT_DIRS = [ROOT / "frontend" / "public" / "be", ROOT / "assets" / "be"]
MIN_N = 10  # smaller groups are dropped: a median of a handful of certificates is noise

# build_period_v2 -> TABULA BE period (tools/be/be_data_pipeline.py TABULA_PERIODS).
# 2011-2016 straddles periods 05/06; certificates for it are mostly post-2012 EPB-era
# homes, so it goes to 06.
V2_PERIOD = {
    "BEFORE_1919": "01", "BETWEEN_1919_AND_1945": "01",
    "BETWEEN_1946_AND_1960": "02", "BETWEEN_1961_AND_1970": "02",
    "BETWEEN_1971_AND_1980": "03", "BETWEEN_1981_AND_1985": "03", "BETWEEN_1986_AND_1990": "03",
    "BETWEEN_1991_AND_1995": "04", "BETWEEN_1996_AND_2000": "04", "BETWEEN_2001_AND_2005": "04",
    "BETWEEN_2006_AND_2010": "05",
    "BETWEEN_2011_AND_2016": "06", "BETWEEN_2017_AND_2020": "06", "BETWEEN_2021_AND_2025": "06",
}
TABULA_PERIODS = [(1945, "01"), (1970, "02"), (1990, "03"), (2005, "04"), (2011, "05"), (9999, "06")]
LABELS = ["++A", "+A", "A", "B", "C", "D", "E", "F", "G"]


def period_of(r: dict) -> str | None:
    if r.get("build_period_v2") in V2_PERIOD:
        return V2_PERIOD[r["build_period_v2"]]
    y = r.get("build_year")
    if isinstance(y, (int, float)) and 1500 < y < 2100:
        return next(code for last, code in TABULA_PERIODS if y <= last)
    return None


def summarise(rows: list[dict]) -> dict:
    e = sorted(r["e_spec"] for r in rows)
    q = st.quantiles(e, n=4) if len(e) >= 4 else [e[0], st.median(e), e[-1]]
    labels = Counter(r["e_spec_label"] for r in rows)
    devices = Counter(r["device"] for r in rows)
    area = [r["total_heated_floor"] for r in rows if r.get("total_heated_floor")]
    return {
        "n": len(e),
        "e_spec_p25": round(q[0]), "e_spec_median": round(st.median(e)), "e_spec_p75": round(q[2]),
        "labels": {k: round(labels[k] / len(e), 3) for k in LABELS if labels.get(k)},
        "heating_devices": {k: round(v / len(e), 3) for k, v in devices.most_common(4)},
        "heated_floor_median_m2": round(st.median(area), 1) if area else None,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(SRC))
    args = ap.parse_args()
    rows = json.loads(Path(args.src).read_text(encoding="utf-8"))
    print(f"{len(rows):,} certificates")

    groups: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    names: dict[str, str] = {}
    dates = Counter()
    for r in rows:
        dest = r.get("destination")
        if dest not in ("SINGLE_FAMILY_HOUSE", "APARTMENT") or not isinstance(r.get("e_spec"), (int, float)):
            continue
        if not 0 < r["e_spec"] < 3000:  # a handful of 5-8k values are data-entry errors
            continue
        nis = r.get("mun_code")
        if nis:
            names[nis] = r.get("communes")
        facade = r.get("free_facade") if dest == "SINGLE_FAMILY_HOUSE" else None
        period = period_of(r)
        dates["20" + r["certificate_date"][-2:] if r.get("certificate_date") else "?"] += 1
        for f in {facade or "*", "*"}:
            for p in {period or "*", "*"}:
                key = f"{dest}|{f}|{p}"
                for scope in (nis, "wallonia"):
                    if scope:
                        groups[scope][key].append(r)

    out = {}
    for scope, g in groups.items():
        stats = {k: summarise(v) for k, v in g.items() if len(v) >= MIN_N}
        if stats:
            out[scope] = {"name": names.get(scope, "Wallonia"), "groups": stats}
    doc = {
        "source": "PEB - certification residentielle - batiment existant, Open Data Wallonie-Bruxelles "
                  "(ODWB), CC BY 4.0",
        "note": "E_spec = primary energy per heated m2 per year from the certificate (asset rating, not "
                "metered). Certificates carry no address: buildings are linked to similar certified "
                "dwellings in their municipality, never to their own certificate.",
        "certificates": len(rows),
        "certificate_years": dict(sorted(dates.items())),
        "min_group_n": MIN_N,
        "municipalities": out,
    }
    for d in OUT_DIRS:
        d.mkdir(parents=True, exist_ok=True)
        (d / "peb_wallonia_stats.json").write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    lg = out.get("62063", {}).get("groups", {})
    print(f"{len(out) - 1} municipalities -> be/peb_wallonia_stats.json")
    for k in ("SINGLE_FAMILY_HOUSE|TWO_FREE|*", "SINGLE_FAMILY_HOUSE|TWO_FREE|01", "APARTMENT|*|*", "APARTMENT|*|01"):
        if k in lg:
            s = lg[k]
            print(f"  Liege {k:34s} n={s['n']:6,} median={s['e_spec_median']} (IQR {s['e_spec_p25']}-{s['e_spec_p75']})")


if __name__ == "__main__":
    main()
