"""
Does the air leakage the metered gas implies depend on construction age?

For each house in the calibration sample (same selection and seed as
calibrate_rotherham.py), simulate the gas-boiler model twice at one heating
temperature - low and high infiltration - and interpolate the infiltration rate
at which its simulated space-heating gas equals 0.75 x its postcode's DESNZ
median meter. Heating gas is close to linear in infiltration over this range.

The "implied ACH" absorbs every remaining model error for that house, not only
real airtightness, so a trend with age is evidence, not proof. Results are
grouped by construction age band, built form, wall construction (cavity/solid
by U-value) and certificate age.

Usage:
    python tools/uk/implied_leakage_rotherham.py [--heat 20.0] [--low 0.5] [--high 1.25] [--n 120] [--out file.json]
"""
from __future__ import annotations

import argparse
import json
import random
import statistics
from pathlib import Path

import calibrate_rotherham as C


def band(year) -> str:
    if not year:
        return "unknown"
    for limit, name in ((1918, "pre-1919"), (1944, "1919-44"), (1964, "1945-64"), (1980, "1965-80"), (2002, "1981-2002")):
        if year <= limit:
            return name
    return "2003+"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--heat", type=float, default=20.0)
    ap.add_argument("--low", type=float, default=0.5)
    ap.add_argument("--high", type=float, default=1.25)
    ap.add_argument("--n", type=int, default=120)
    ap.add_argument("--seed", type=int, default=11)
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()

    blds = json.loads((C.ROOT / "frontend" / "public" / "uk" / "buildings_rotherham.json").read_text(encoding="utf-8"))
    cands = [b for b in blds
             if b.get("epc_dwellings") == 1 and "house" in (b.get("property_type") or "").lower()
             and b.get("main_fuel") == "mains gas" and (b.get("desnz_gas_meters") or 0) >= 5
             and b.get("desnz_gas_median_kwh") and b.get("u_wall_epc") is not None
             and b.get("floor_area_m2") and b.get("heated_area_m2")]
    random.Random(args.seed).shuffle(cands)
    sample, seen = [], set()
    for b in cands:
        if b["desnz_postcode"] not in seen:
            seen.add(b["desnz_postcode"]); sample.append(b)
        if len(sample) >= args.n:
            break
    print(f"{len(sample)} houses; heating {args.heat} C; infiltration {args.low} and {args.high} ACH", flush=True)

    C.set_params(args.heat, args.low)
    gas_low = C.run_batch(sample)
    C.set_params(args.heat, args.high)
    gas_high = C.run_batch(sample)

    rows = []
    for b, lo, hi in zip(sample, gas_low, gas_high):
        if lo is None or hi is None or hi <= lo:
            continue
        share = b["floor_area_m2"] / b["heated_area_m2"]
        g_lo, g_hi = lo * share, hi * share
        target = C.SPACE_HEATING_SHARE * b["desnz_gas_median_kwh"]
        implied = args.low + (target - g_lo) * (args.high - args.low) / (g_hi - g_lo)
        rows.append({
            "osm_id": b["osm_id"], "year": b.get("year"), "age_band": band(b.get("year")),
            "property_type": b.get("property_type"), "u_wall_epc": b.get("u_wall_epc"),
            "wall": "solid/uninsulated (U>=1.7)" if (b.get("u_wall_epc") or 0) >= 1.7 else
                    "cavity unfilled (1.0-1.7)" if (b.get("u_wall_epc") or 0) >= 1.0 else "insulated (<1.0)",
            "epc_stale": b.get("epc_stale"), "sap": b.get("sap"),
            "implied_ach": round(implied, 2),
            "gas_per_ach_kwh": round((g_hi - g_lo) / (args.high - args.low)),
        })

    def group(key: str) -> dict:
        g: dict[str, list[float]] = {}
        for r in rows:
            g.setdefault(str(r[key]), []).append(r["implied_ach"])
        return {k: {"n": len(v), "median_implied_ach": round(statistics.median(v), 2),
                    "iqr": [round(sorted(v)[len(v) // 4], 2), round(sorted(v)[3 * len(v) // 4], 2)]}
                for k, v in sorted(g.items())}

    years = [(r["year"], r["implied_ach"]) for r in rows if r["year"]]
    corr = None
    if len(years) > 5:
        xs, ys = zip(*years)
        mx, my = statistics.mean(xs), statistics.mean(ys)
        cov = sum((x - mx) * (y - my) for x, y in years)
        corr = round(cov / ((sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys)) ** 0.5), 2)
    # Spearman is safer here: implied ACH has long tails.
    def ranks(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        for pos, i in enumerate(order):
            r[i] = pos
        return r
    spearman = None
    if len(years) > 5:
        rx, ry = ranks([x for x, _ in years]), ranks([y for _, y in years])
        n = len(rx)
        spearman = round(1 - 6 * sum((a - b) ** 2 for a, b in zip(rx, ry)) / (n * (n * n - 1)), 2)

    summary = {
        "n": len(rows), "heat_c": args.heat,
        "median_implied_ach": round(statistics.median(r["implied_ach"] for r in rows), 2),
        "by_age_band": group("age_band"), "by_wall": group("wall"),
        "by_property_type": group("property_type"), "by_certificate_age": group("epc_stale"),
        "pearson_year_vs_implied_ach": corr, "spearman_year_vs_implied_ach": spearman,
    }
    print(json.dumps(summary, indent=1))
    if args.out:
        args.out.write_text(json.dumps({"summary": summary, "houses": rows}, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
