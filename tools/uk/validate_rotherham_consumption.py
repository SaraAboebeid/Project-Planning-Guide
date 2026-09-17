"""
Check the EnergyPlus (EPSM) baseline against METERED consumption: DESNZ
postcode-level domestic gas, median kWh per meter.

Sample: gas-heated houses with exactly one certified dwelling (so one building
~ one gas meter), in postcodes DESNZ publishes (>= 5 meters), at most one house
per postcode. Each is simulated as-built through the running backend
(/api/simulation-batch-submit, needs EPSM on :8010), then

    simulated space-heating gas per home = boiler gas use / homes in footprint
      (gas-boiler model; ideal-loads runs use heating / --boiler-eff)

is compared with 75% of the postcode's median meter - the space-heating share of
UK domestic gas in 2024 (DESNZ subnational consumption report 2024 / ECUK 2025
Table U2). Hot water is not modelled for the UK. Caveats: the median meter is a
neighbourhood figure, not the house's own meter; DESNZ gas is weather-corrected
to a normal year while the simulation uses TMYx weather; "homes in footprint"
counts OS Open UPRN addresses, which can include non-dwellings.

Results, 60 houses (2026-09-17):
  TABULA as-built U-values, continuous 21 °C, whole footprint vs one meter: 6.1x metered
  + per home, EPC fabric U-values, SAP heating schedule, adiabatic party walls: 0.83x
    (interquartile 0.66-1.10, 48% within +/-25%)

Usage:
    python tools/uk/validate_rotherham_consumption.py [--n 60] [--boiler-eff 0.85] [--out results.json]
"""
from __future__ import annotations

import argparse
import json
import random
import statistics
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
API = "http://localhost:8000/api"
SPACE_HEATING_SHARE = 0.75


def _post(path: str, body: dict) -> dict:
    req = urllib.request.Request(f"{API}{path}", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())


def _get(path: str) -> dict:
    with urllib.request.urlopen(f"{API}{path}", timeout=300) as r:
        return json.loads(r.read())


def centroid(b: dict) -> tuple[float, float]:
    ring = b["coordinates"][0]
    return sum(p[1] for p in ring) / len(ring), sum(p[0] for p in ring) / len(ring)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", default="rotherham")
    ap.add_argument("--n", type=int, default=60)
    ap.add_argument("--boiler-eff", type=float, default=0.85,
                    help="seasonal efficiency of the existing gas boiler (typical in-use value)")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()

    blds = json.loads((ROOT / "frontend" / "public" / "uk" / f"buildings_{args.city}.json").read_text(encoding="utf-8"))
    cands = [b for b in blds
             if b.get("epc_dwellings") == 1 and "house" in (b.get("property_type") or "").lower()
             and b.get("main_fuel") == "mains gas" and (b.get("desnz_gas_meters") or 0) >= 5
             and b.get("desnz_gas_median_kwh") and b.get("floor_area_m2") and b.get("heated_area_m2")]
    random.Random(args.seed).shuffle(cands)
    sample, seen = [], set()
    for b in cands:
        if b["desnz_postcode"] in seen:
            continue
        seen.add(b["desnz_postcode"]); sample.append(b)
        if len(sample) >= args.n:
            break
    print(f"{len(cands):,} eligible houses -> {len(sample)} sampled (one per postcode)")

    specs = []
    for i, b in enumerate(sample):
        la, lo = centroid(b)
        specs.append({"lat": la, "lon": lo, "address": f"validation-{i}"})
    sub = _post("/simulation-batch-submit", {"country": "gb", "buildings": specs,
                                             "package_id": f"desnz-validation-{int(time.time())}",
                                             "package_label": "DESNZ validation (as-built)"})
    bid = sub["batch_id"]
    t0 = time.time()
    while True:
        st = _get(f"/simulation-batch-status/{bid}")
        rows = st.get("buildings") or []
        if rows and all(r.get("status") in ("completed", "failed") for r in rows):
            break
        if time.time() - t0 > 3000:
            raise SystemExit("timed out waiting for EPSM")
        time.sleep(15)
    print(f"simulated in {time.time() - t0:.0f}s")

    out = []
    by_addr = {r["address"]: r for r in rows}
    for i, b in enumerate(sample):
        r = by_addr.get(f"validation-{i}") or {}
        res = r.get("results") or {}
        if r.get("status") != "completed" or res.get("heating_kwh") is None:
            continue
        homes = res.get("dwellings") or b.get("dwellings_est") or 1
        # The certified home's share of the building's heated area (EPC floor areas);
        # gas-boiler runs report the boiler's own gas, ideal loads fall back to heat / efficiency.
        share = (b["floor_area_m2"] / b["heated_area_m2"]) if b.get("floor_area_m2") and b.get("heated_area_m2") else 1 / homes
        building_gas = res["gas_kwh"] if res.get("gas_kwh") is not None else res["heating_kwh"] / args.boiler_eff
        sim_gas = building_gas * share
        metered_heating = SPACE_HEATING_SHARE * b["desnz_gas_median_kwh"]
        out.append({
            "postcode": b["desnz_postcode"], "property_type": b.get("property_type"), "year": b.get("year"),
            "eclass": b.get("eclass"), "sap": b.get("sap"), "floors": b.get("floors"),
            "homes_in_footprint": homes, "party_walls": len(b.get("party_wall_midpoints") or []),
            "fabric": {k: b.get(k) for k in ("u_wall_epc", "u_roof_epc", "u_win_epc", "u_floor_epc")},
            "heating_system": res.get("heating_system"), "pumps_kwh": res.get("pumps_kwh"),
            "modelled_area_m2": res.get("total_floor_area_m2"), "epc_area_m2": b.get("floor_area_m2"),
            "heated_area_m2": b.get("heated_area_m2"), "heated_area_source": b.get("heated_area_source"),
            "sim_gas_kwh": round(sim_gas), "desnz_median_gas_kwh": b["desnz_gas_median_kwh"],
            "metered_space_heating_kwh": round(metered_heating),
            "ratio": round(sim_gas / metered_heating, 2),
            # EPC-area scaling: what the model predicts for the certified floor area instead of footprint x floors.
            "ratio_epc_area": round(sim_gas * homes * (b["floor_area_m2"] / res["total_floor_area_m2"]) / metered_heating, 2)
                if b.get("floor_area_m2") and res.get("total_floor_area_m2") else None,
        })

    ratios = [o["ratio"] for o in out]
    ratios_epc = [o["ratio_epc_area"] for o in out if o["ratio_epc_area"]]
    summary = {
        "n": len(out),
        "median_ratio_sim_over_metered": round(statistics.median(ratios), 2) if ratios else None,
        "p25_p75": [round(sorted(ratios)[len(ratios) // 4], 2), round(sorted(ratios)[3 * len(ratios) // 4], 2)] if ratios else None,
        "within_25pct": round(sum(0.75 <= x <= 1.25 for x in ratios) / len(ratios), 2) if ratios else None,
        "median_ratio_epc_area": round(statistics.median(ratios_epc), 2) if ratios_epc else None,
        "median_sim_gas_kwh": round(statistics.median(o["sim_gas_kwh"] for o in out)) if out else None,
        "median_metered_space_heating_kwh": round(statistics.median(o["metered_space_heating_kwh"] for o in out)) if out else None,
        "boiler_eff": args.boiler_eff,
    }
    by_type: dict[str, list] = {}
    for o in out:
        by_type.setdefault(o["property_type"], []).append(o["ratio"])
    summary["median_ratio_by_type"] = {k: (len(v), round(statistics.median(v), 2)) for k, v in by_type.items()}
    print(json.dumps(summary, indent=1))
    if args.out:
        args.out.write_text(json.dumps({"summary": summary, "buildings": out}, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
