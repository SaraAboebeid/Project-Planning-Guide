"""What the tool predicts a retrofit SAVES, checked against measured evaluations.

The baseline is calibrated against metered gas; savings are a different claim.
Standard calculations are known to overstate what fabric measures deliver in
occupied homes - UK evaluations of solid-wall insulation typically measure
roughly half to two thirds of the calculated saving, and cavity fill somewhat
better. This runs each sampled house twice, as-is and with one measure applied,
and reports the predicted saving so it can be compared with those benchmarks.

The point is not to force agreement. The baseline correction for uninsulated
walls (defaults.UK_UNINSULATED_WALL_FACTOR, plus the houses-only prebound drop)
already lowers the heat lost through a solid wall, so the predicted saving
should come out below a naive calculation - this measures by how much.

Usage:
    python tools/uk/validate_rotherham_savings.py [--n 40] [--measure wall|loft|windows]
"""
from __future__ import annotations

import argparse
import json
import random
import statistics
import time

import calibrate_rotherham as C
from tools.idf import defaults as D

# Post-retrofit U-values (W/m2K). Wall and loft are the Building Regulations
# Part L1B standards a retrofit is designed to; the window figure is a modern
# double-glazed unit (frontend/src/config/ukCostCarbon.ts uses the same).
MEASURES = {
    "wall":    {"u_wall_override": 0.30, "label": "wall insulation to U=0.30"},
    "loft":    {"u_roof_override": 0.16, "label": "loft insulation to U=0.16"},
    "windows": {"u_win_override": 1.40, "label": "double glazing to U=1.40"},
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=40)
    ap.add_argument("--measure", choices=sorted(MEASURES), default="wall")
    ap.add_argument("--seed", type=int, default=13)
    args = ap.parse_args()
    measure = MEASURES[args.measure]

    blds = json.loads((C.ROOT / "frontend" / "public" / "uk" / "buildings_rotherham.json").read_text(encoding="utf-8"))
    # Only homes the measure actually applies to: a wall measure needs an
    # uninsulated wall, loft insulation needs a poor roof, glazing a poor window.
    def eligible(b: dict) -> bool:
        if not (b.get("epc_dwellings") == 1 and "house" in (b.get("property_type") or "").lower()
                and b.get("main_fuel") == "mains gas" and b.get("heated_area_m2") and b.get("floor_area_m2")):
            return False
        if args.measure == "wall":
            return (b.get("u_wall_epc") or 0) >= D.UK_UNINSULATED_WALL_U_THRESHOLD
        if args.measure == "loft":
            return (b.get("u_roof_epc") or 0) >= 0.4
        return (b.get("u_win_epc") or 0) >= 2.0

    cands = [b for b in blds if eligible(b)]
    rng = random.Random(args.seed)
    rng.shuffle(cands)
    sample = cands[:args.n]
    print(f"{len(cands):,} eligible homes -> {len(sample)} sampled for {measure['label']}", flush=True)

    t0 = time.time()
    base = C.run_batch(sample)                      # as the home stands today
    after = _run_with_measure(sample, measure)      # same home, one measure applied
    print(f"simulated in {time.time() - t0:.0f}s", flush=True)

    rows = []
    for b, g0, g1 in zip(sample, base, after):
        if not g0 or not g1:
            continue
        share = b["floor_area_m2"] / b["heated_area_m2"]
        rows.append({
            "address": b.get("address"),
            "u_wall_epc": b.get("u_wall_epc"), "u_roof_epc": b.get("u_roof_epc"),
            "year": b.get("year"), "eclass": b.get("eclass"),
            "gas_before_kwh": round(g0 * share), "gas_after_kwh": round(g1 * share),
            "saving_kwh": round((g0 - g1) * share),
            "saving_pct": round(100 * (g0 - g1) / g0, 1),
        })

    pcts = sorted(r["saving_pct"] for r in rows)
    summary = {
        "measure": measure["label"], "n": len(rows),
        "median_saving_pct": round(statistics.median(pcts), 1),
        "p25_p75_saving_pct": [pcts[len(pcts) // 4], pcts[3 * len(pcts) // 4]],
        "median_saving_kwh_per_home": round(statistics.median(r["saving_kwh"] for r in rows)),
        "median_gas_before_kwh": round(statistics.median(r["gas_before_kwh"] for r in rows)),
    }
    print(json.dumps(summary, indent=1))


def _run_with_measure(sample: list[dict], measure: dict) -> list[float | None]:
    """run_batch with the measure's U-value override applied to every IDF."""
    import requests
    from tools.idf.generate_idf import build_shoebox_idf
    kwargs = {k: v for k, v in measure.items() if k.endswith("_override")}
    out: list[float | None] = []
    for start in range(0, len(sample), 60):
        chunk = sample[start:start + 60]
        files = [("idf_files", (f"b_{i}.idf",
                                build_shoebox_idf(b, "gb", "rotherham", str(C.EPW), building_name=f"b{i}",
                                                  heating_system="gas_boiler", **kwargs).encode(), "text/plain"))
                 for i, b in enumerate(chunk)]
        files.append(("weather_file", (C.EPW.name, C.EPW.read_bytes(), "application/octet-stream")))
        r = requests.post(f"{C.EPSM}/api/simulation/run/", files=files,
                          data={"parallel": "true", "max_workers": "8"}, timeout=300)
        r.raise_for_status()
        sid = r.json()["simulation_id"]
        while True:
            try:
                st = requests.get(f"{C.EPSM}/api/simulation/{sid}/status/", timeout=120).json()
            except requests.RequestException:
                time.sleep(15)
                continue
            if st.get("status") in ("completed", "failed"):
                break
            time.sleep(10)
        res = requests.get(f"{C.EPSM}/api/simulation/{sid}/parallel-results/", timeout=900).json()
        items = res if isinstance(res, list) else res.get("results") or []
        part: list[float | None] = [None] * len(chunk)
        for it in items:
            idx = it.get("idf_idx")
            if idx is None or (it.get("status") or "").lower() in ("failed", "error"):
                continue
            series = ((it.get("hourly_timeseries") or {}).get("series") or {})
            gas = [v for k, v in series.items() if k.endswith("_Boiler_NaturalGas_Energy_J")]
            part[int(idx)] = sum(x for vals in gas for x in vals if x) / 3.6e6 if gas else None
        out += part
    return out


if __name__ == "__main__":
    main()
