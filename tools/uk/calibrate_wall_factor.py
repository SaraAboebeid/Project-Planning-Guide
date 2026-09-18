"""
Joint calibration of the uninsulated-wall U-value factor and infiltration,
against DESNZ metered postcode gas.

Why: with one infiltration value for all houses, the calibrated model lands at
1.01x metered for insulated-wall houses but 1.49x (unfilled cavity) and 2.19x
(uninsulated solid) for the rest - the certificates' generic defaults for
uninsulated walls (2.0 / 1.5 W/m²K) are too pessimistic, and some walls have
been insulated since the certificate. A single infiltration value then splits
the difference and hides the error.

The sample is STRATIFIED - half uninsulated-wall houses (EPC U >= 1.0), half
insulated - so the two parameters are separable; each half is split again into
calibration and held-out houses. Everything else follows
calibrate_rotherham.py (gas-boiler model, heated area, per-home EPC share,
target = 0.75 x the postcode's median gas meter).

Usage:
    python tools/uk/calibrate_wall_factor.py [--n 60] [--factors 1.0,0.85,0.7,0.6,0.5] [--ach 0.75,1.0,1.25]
"""
from __future__ import annotations

import argparse
import itertools
import json
import math
import random
import statistics
import time
from pathlib import Path

import calibrate_rotherham as C
from tools.idf import defaults as D


HEAT_C = 18.9  # SAP area-weighted demand temperature, fixed (already calibrated)


def set_params(factor: float, ach: float, prebound_k: float = 0.0) -> None:
    C.set_params(HEAT_C, ach)  # also rebuilds the SAP heating schedules
    D.UK_UNINSULATED_WALL_FACTOR = factor
    D.UK_PREBOUND_SETPOINT_DROP_K = prebound_k


def ratio(b: dict, gas: float | None) -> float | None:
    """Simulated space-heating gas for the certified home / 0.75 x metered median."""
    if gas is None:
        return None
    return gas * b["floor_area_m2"] / b["heated_area_m2"] / (C.SPACE_HEATING_SHARE * b["desnz_gas_median_kwh"])


def uninsulated(b: dict) -> bool:
    return b["u_wall_epc"] >= D.UK_UNINSULATED_WALL_U_THRESHOLD


def score_group(group: list[dict], gas: list[float | None]) -> dict:
    pairs = [(b, r) for b, r in ((b, ratio(b, g)) for b, g in zip(group, gas)) if r]
    un = [r for b, r in pairs if uninsulated(b)]
    ins = [r for b, r in pairs if not uninsulated(b)]
    return {
        **C.score([r for _, r in pairs]),
        "median_uninsulated": round(statistics.median(un), 2) if un else None,
        "n_uninsulated": len(un),
        "median_insulated": round(statistics.median(ins), 2) if ins else None,
        "n_insulated": len(ins),
        # What we are really trying to remove: the gap between the two groups.
        "group_gap": round(abs(math.log(statistics.median(un) / statistics.median(ins))), 3) if un and ins else None,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=60, help="houses per wall stratum (half calibration, half held-out)")
    ap.add_argument("--factors", default="1.0,0.85,0.7,0.6,0.5")
    ap.add_argument("--ach", default="0.75,1.0,1.25")
    ap.add_argument("--prebound", default="0.0",
                    help="demand-temperature drop (K) for uninsulated-wall homes; grid over these too")
    ap.add_argument("--seed", type=int, default=29)
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()

    blds = json.loads((C.ROOT / "frontend" / "public" / "uk" / "buildings_rotherham.json").read_text(encoding="utf-8"))
    eligible = [b for b in blds
                if b.get("epc_dwellings") == 1 and "house" in (b.get("property_type") or "").lower()
                and b.get("main_fuel") == "mains gas" and (b.get("desnz_gas_meters") or 0) >= 5
                and b.get("desnz_gas_median_kwh") and b.get("u_wall_epc") is not None
                and b.get("floor_area_m2") and b.get("heated_area_m2")]
    rng = random.Random(args.seed)
    strata: dict[str, list[dict]] = {"uninsulated": [], "insulated": []}
    seen: set[str] = set()
    for b in sorted(eligible, key=lambda x: rng.random()):
        if b["desnz_postcode"] in seen:
            continue
        k = "uninsulated" if uninsulated(b) else "insulated"
        if len(strata[k]) >= args.n:
            continue
        seen.add(b["desnz_postcode"]); strata[k].append(b)
    half = args.n // 2
    calib = strata["uninsulated"][:half] + strata["insulated"][:half]
    hold = strata["uninsulated"][half:] + strata["insulated"][half:]
    print(f"{len(eligible):,} eligible; strata {[(k, len(v)) for k, v in strata.items()]}; "
          f"{len(calib)} calibration + {len(hold)} held-out", flush=True)

    axes = ([float(x) for x in args.factors.split(",")],
            [float(x) for x in args.ach.split(",")],
            [float(x) for x in args.prebound.split(",")])
    grid = []
    for factor, ach, pre in itertools.product(*axes):
        set_params(factor, ach, pre)
        t0 = time.time()
        sc = score_group(calib, C.run_batch(calib))
        grid.append({"wall_factor": factor, "ach": ach, "prebound_k": pre, **sc})
        print(f"  wall x{factor}, ACH {ach}, prebound -{pre} K: {sc} ({time.time() - t0:.0f}s)", flush=True)

    keys = ("wall_factor", "ach", "prebound_k")
    top = sorted(grid, key=lambda g: g["mean_abs_log_error"])[:3]
    held = []
    for g in top:
        set_params(*(g[k] for k in keys))
        held.append({**{k: g[k] for k in keys}, **score_group(hold, C.run_batch(hold))})
        print(f"  held-out {[g[k] for k in keys]}: {held[-1]}", flush=True)
    set_params(1.0, 1.25, 0.0)
    current = score_group(hold, C.run_batch(hold))
    print(f"  held-out UNCORRECTED (wall x1.0, ACH 1.25, no prebound): {current}", flush=True)

    best = min(held, key=lambda g: g["mean_abs_log_error"])
    result = {"grid": grid, "held_out_top3": held, "held_out_current": current, "best": best}
    print(json.dumps({"best": best, "held_out_current": current}, indent=1))
    if args.out:
        args.out.write_text(json.dumps(result, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
