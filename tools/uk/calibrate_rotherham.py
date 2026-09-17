"""
Calibrate the UK shoebox model against METERED gas (DESNZ postcode medians).

Model: the gas-boiler plant (build_shoebox_idf heating_system="gas_boiler"),
simulated at the building's HEATED area (EPC total floor areas), with the
certified home's gas = building gas x (its EPC floor area / heated area).

Target: simulated space-heating gas per home = 75% of the postcode's median gas
meter. 75% is the space-heating share of UK domestic gas in 2024 (DESNZ,
Subnational electricity and gas consumption summary report 2024, citing ECUK
2025 end-use Table U2); hot water is not modelled for the UK.

Two uncertain physical inputs are tuned on a grid:
  * heating demand temperature during SAP heating periods (default 18.9 °C)
  * infiltration, air changes per hour (default 0.5)
Boiler efficiency is fixed (--boiler-eff) because it is confounded with both.

Houses (gas-heated, one certified dwelling, DESNZ >= 5 meters, one per postcode)
are split 50/50 at random: the grid is scored on the CALIBRATION half and the
chosen pair is reported on the HELD-OUT half, so the fit is not judged on the
data it was tuned on. IDFs are built locally with build_shoebox_idf and sent
straight to EPSM (:8010), so the app's own defaults are untouched while searching.

Usage:
    python tools/uk/calibrate_rotherham.py [--n 120] [--boiler-eff 0.85] [--out calib.json]
"""
from __future__ import annotations

import argparse
import itertools
import json
import math
import random
import statistics
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.idf import defaults as D  # noqa: E402
from tools.idf.generate_idf import build_shoebox_idf  # noqa: E402

EPSM = "http://localhost:8010"
EPW = ROOT / "data" / "epw" / "GBR_ENG_Doncaster.Sheffield-Hood.AP.034054_TMYx.2011-2025.epw"
SPACE_HEATING_SHARE = 0.75


def set_params(heat_c: float, ach: float) -> None:
    D.UK_SAP_HEATING_C = heat_c
    sb = D.UK_SAP_SETBACK_C
    D.UK_SAP_WEEKDAY_HEATING = [("07:00", sb), ("09:00", heat_c), ("16:00", sb), ("23:00", heat_c), ("24:00", sb)]
    D.UK_SAP_WEEKEND_HEATING = [("07:00", sb), ("23:00", heat_c), ("24:00", sb)]
    D.UK_INFILTRATION_ACH = ach


def run_batch(buildings: list[dict]) -> list[float | None]:
    """Boiler natural-gas kWh per building (gas-boiler plant), in input order."""
    files = [("idf_files", (f"b_{i}.idf", build_shoebox_idf(b, "gb", "rotherham", str(EPW), building_name=f"b{i}",
                                                           heating_system="gas_boiler").encode(), "text/plain"))
             for i, b in enumerate(buildings)]
    files.append(("weather_file", (EPW.name, EPW.read_bytes(), "application/octet-stream")))
    r = requests.post(f"{EPSM}/api/simulation/run/", files=files, data={"parallel": "true", "max_workers": "8"}, timeout=300)
    r.raise_for_status()
    sid = r.json()["simulation_id"]
    while True:
        st = requests.get(f"{EPSM}/api/simulation/{sid}/status/", timeout=60).json()
        if st.get("status") in ("completed", "failed"):
            break
        time.sleep(10)
    res = requests.get(f"{EPSM}/api/simulation/{sid}/parallel-results/", timeout=600).json()
    items = res if isinstance(res, list) else res.get("results") or []
    out: list[float | None] = [None] * len(buildings)
    for it in items:
        idx = it.get("idf_idx")
        if idx is None or (it.get("status") or "").lower() in ("failed", "error"):
            continue
        series = ((it.get("hourly_timeseries") or {}).get("series") or {})
        gas = [v for k, v in series.items() if k.endswith("_Boiler_NaturalGas_Energy_J")]
        out[int(idx)] = sum(x for vals in gas for x in vals if x) / 3.6e6 if gas else None
    return out


def score(ratios: list[float]) -> dict:
    logs = [math.log(r) for r in ratios if r and r > 0]
    return {
        "n": len(logs),
        "median_ratio": round(statistics.median(ratios), 3),
        "iqr": [round(sorted(ratios)[len(ratios) // 4], 2), round(sorted(ratios)[3 * len(ratios) // 4], 2)],
        "within_25pct": round(sum(0.75 <= r <= 1.25 for r in ratios) / len(ratios), 2),
        # Geometric mean absolute log error: symmetric for over/under prediction.
        "mean_abs_log_error": round(statistics.mean(abs(x) for x in logs), 3),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=120)
    ap.add_argument("--boiler-eff", type=float, default=0.85)
    ap.add_argument("--heat", default="18.9,19.5,20.0,20.5,21.0")
    ap.add_argument("--ach", default="0.5,0.75,1.0")
    ap.add_argument("--seed", type=int, default=11)
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()

    blds = json.loads((ROOT / "frontend" / "public" / "uk" / "buildings_rotherham.json").read_text(encoding="utf-8"))
    cands = [b for b in blds
             if b.get("epc_dwellings") == 1 and "house" in (b.get("property_type") or "").lower()
             and b.get("main_fuel") == "mains gas" and (b.get("desnz_gas_meters") or 0) >= 5
             and b.get("desnz_gas_median_kwh") and b.get("u_wall_epc") is not None
             and b.get("floor_area_m2") and b.get("heated_area_m2")]
    rng = random.Random(args.seed)
    rng.shuffle(cands)
    sample, seen = [], set()
    for b in cands:
        if b["desnz_postcode"] not in seen:
            seen.add(b["desnz_postcode"]); sample.append(b)
        if len(sample) >= args.n:
            break
    half = len(sample) // 2
    calib, hold = sample[:half], sample[half:]
    print(f"{len(cands):,} eligible -> {len(calib)} calibration + {len(hold)} held-out houses", flush=True)

    def ratios_for(group: list[dict], heats: list[float | None]) -> list[float]:
        out = []
        for b, h in zip(group, heats):
            if h is None:
                continue
            # The certified home's share of the building's heated area.
            sim_gas = h * b["floor_area_m2"] / b["heated_area_m2"]
            out.append(sim_gas / (SPACE_HEATING_SHARE * b["desnz_gas_median_kwh"]))
        return out

    grid = []
    for heat_c, ach in itertools.product([float(x) for x in args.heat.split(",")], [float(x) for x in args.ach.split(",")]):
        set_params(heat_c, ach)
        t0 = time.time()
        sc = score(ratios_for(calib, run_batch(calib)))
        grid.append({"heat_c": heat_c, "ach": ach, **sc})
        print(f"  heat {heat_c} C, ACH {ach}: {sc} ({time.time() - t0:.0f}s)", flush=True)

    # Temperature and infiltration trade off, so several pairs fit alike: score
    # the three best on the held-out half and keep the one that holds up there.
    top = sorted(grid, key=lambda g: g["mean_abs_log_error"])[:3]
    held_top = []
    for g in top:
        set_params(g["heat_c"], g["ach"])
        held_top.append({"heat_c": g["heat_c"], "ach": g["ach"], **score(ratios_for(hold, run_batch(hold)))})
        print(f"  held-out heat {g['heat_c']} C, ACH {g['ach']}: {held_top[-1]}", flush=True)
    best = min(held_top, key=lambda g: g["mean_abs_log_error"])
    set_params(18.9, 0.5)
    default_held = score(ratios_for(hold, run_batch(hold)))
    result = {"target": "space-heating gas = 0.75 x DESNZ postcode median meter", "boiler_eff": args.boiler_eff,
              "grid_on_calibration_half": grid, "top3_on_held_out": held_top, "best": best,
              "held_out_with_defaults": default_held}
    print(json.dumps({k: result[k] for k in ("best", "top3_on_held_out", "held_out_with_defaults")}, indent=1))
    if args.out:
        args.out.write_text(json.dumps(result, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
