"""
City-scale energy screening with the fast RC model (backend/rc_engine.py).

Runs every heated building of a Swedish city through the same inputs as the
EnergyPlus shoebox, in parallel, and writes:

  data/rc/city_<id>.json         per-building results + summaries by use,
                                 construction era and district, and the city's
                                 COINCIDENT hourly heat demand (summed hour by hour)
  data/rc/city_<id>.status.json  progress while it runs (read by the backend)

Outbuildings (komplement) and small "övrigt" (< 50 m² footprint) are skipped,
as in Step 3: they are usually unheated, and a heating model says nothing
useful about them.

Usage:  python tools/rc/screen_city.py --city gothenburg [--workers 7] [--limit N]
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
OUT_DIR = ROOT / "data" / "rc"

ERAS = [(0, 1930), (1931, 1945), (1946, 1960), (1961, 1975), (1976, 1985),
        (1986, 1995), (1996, 2005), (2006, 2015), (2016, 2100)]


def _era(year) -> str:
    if not year:
        return "unknown"
    for lo, hi in ERAS:
        if lo <= int(year) <= hi:
            return f"before {hi + 1}" if lo == 0 else f"{lo} or later" if hi >= 2100 else f"{lo}–{hi}"
    return "unknown"


def _centroid(coords) -> tuple[float, float]:
    ring = coords[0]
    return (round(sum(p[1] for p in ring) / len(ring), 6), round(sum(p[0] for p in ring) / len(ring), 6))


def _work(chunk: list[tuple[int, dict]], epw: str) -> tuple[list[dict], np.ndarray, int]:
    from backend import rc_engine
    total = np.zeros(rc_engine.HOURS)
    rows, failed = [], 0
    for i, b in chunk:
        try:
            r = rc_engine.simulate(b, "se", epw, hourly=True)
        except Exception:  # noqa: BLE001 — one odd footprint must not stop a city
            failed += 1
            continue
        h = np.asarray(r.pop("hourly_heating_kwh"))
        r.pop("hourly_electricity_kwh", None)
        r.pop("hourly", None)
        total += h
        lat, lon = _centroid(b["coordinates"])
        rows.append({"i": i, "lat": lat, "lon": lon, "address": b.get("address"), "use": b.get("use_cat"),
                     "year": b.get("year"), "district": b.get("primary_area"), "epc_kwh_m2": b.get("energy"),
                     "area_m2": r["floor_area_m2"], "heat_kwh_m2": r["heating_kwh_m2_yr"], "heat_kwh": r["heating_kwh"],
                     "peak_kw": r["peak_heating_kw"], "peak_w_m2": r["peak_heating_w_m2"]})
    return rows, total, failed


def _summary(rows: list[dict], key) -> list[dict]:
    groups: dict[str, list[dict]] = {}
    for r in rows:
        groups.setdefault(key(r) or "unknown", []).append(r)
    out = []
    for g, rs in groups.items():
        area = sum(r["area_m2"] for r in rs)
        heat = sum(r["heat_kwh"] for r in rs)
        out.append({"group": g, "buildings": len(rs), "floor_area_m2": round(area), "heat_mwh": round(heat / 1000),
                    "heat_kwh_m2": round(heat / area, 1) if area else None,
                    "sum_of_peaks_mw": round(sum(r["peak_kw"] for r in rs) / 1000, 2)})
    return sorted(out, key=lambda x: -x["heat_mwh"])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", default="gothenburg")
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--limit", type=int, default=0, help="only the first N buildings (testing)")
    ap.add_argument("--chunk", type=int, default=150)
    args = ap.parse_args()

    from backend.main import CITY_TO_EPW, EPW_DIR, _se_buildings, _se_cities
    _se_cities()                                # registers built cities' weather files
    epw_name = CITY_TO_EPW.get(args.city)
    if not epw_name:
        sys.exit(f"No weather file for {args.city}")
    epw = str(EPW_DIR / epw_name)
    records = _se_buildings(args.city)
    todo = [(i, b) for i, b in enumerate(records)
            if b.get("coordinates") and b.get("height")
            and b.get("use_cat") != "komplement"
            and not (b.get("use_cat") == "ovrigt" and (b.get("footprint_m2") or 0) < 50)]
    if args.limit:
        todo = todo[:args.limit]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    status_path = OUT_DIR / f"city_{args.city}.status.json"
    started = datetime.now(timezone.utc).isoformat()
    def status(done, state, **extra):
        status_path.write_text(json.dumps({"city": args.city, "state": state, "done": done, "total": len(todo),
                                           "started": started, "pid": os.getpid(), **extra}), encoding="utf-8")

    status(0, "running")
    t0 = time.time()
    chunks = [todo[k:k + args.chunk] for k in range(0, len(todo), args.chunk)]
    rows, total, failed, done = [], np.zeros(8760), 0, 0
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futs = [pool.submit(_work, c, epw) for c in chunks]
        for f in as_completed(futs):
            r, h, nf = f.result()
            rows += r; total += h; failed += nf; done += len(r) + nf
            status(done, "running", elapsed_s=round(time.time() - t0))

    days = [total[d * 24:(d + 1) * 24].mean() for d in range(365)]
    peak_h = int(total.argmax())
    area = sum(r["area_m2"] for r in rows)
    result = {
        "city": args.city,
        "created": datetime.now(timezone.utc).isoformat(),
        "engine": "epsm_rc 0.9.0 ISO 13790 5R1C, inputs as the EnergyPlus shoebox (backend/rc_engine.py)",
        "weather": epw_name,
        "skipped": "outbuildings (komplement) and övrigt < 50 m² footprint",
        "buildings": len(rows), "failed": failed, "runtime_s": round(time.time() - t0),
        "totals": {
            "floor_area_m2": round(area), "heat_mwh": round(total.sum() / 1000),
            "heat_kwh_m2": round(total.sum() / area, 1) if area else None,
            # Coincident: every building's hourly demand added hour by hour.
            "peak_mw": round(float(total.max()) / 1000, 1), "peak_hour": peak_h,
            "peak_daily_avg_mw": round(max(days) / 1000, 1),
            "sum_of_peaks_mw": round(sum(r["peak_kw"] for r in rows) / 1000, 1),
        },
        "by_use": _summary(rows, lambda r: r["use"]),
        "by_era": _summary(rows, lambda r: _era(r["year"])),
        "by_district": _summary(rows, lambda r: r["district"]),
        "monthly_mwh": [round(float(total[s:s + n * 24].sum()) / 1000) for s, n in
                        zip(np.cumsum([0] + [d * 24 for d in (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30)]).tolist(),
                            (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31))],
        "rows": rows,
    }
    (OUT_DIR / f"city_{args.city}.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    status(done, "done", elapsed_s=round(time.time() - t0), failed=failed)
    print(f"{len(rows)} buildings in {time.time() - t0:.0f}s; city heat {result['totals']['heat_mwh']} MWh, "
          f"coincident peak {result['totals']['peak_mw']} MW")


if __name__ == "__main__":
    main()
