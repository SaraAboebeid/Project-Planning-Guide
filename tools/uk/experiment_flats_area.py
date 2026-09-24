"""Does simulating a block's WHOLE volume close the flats gap?

Flats validate at 0.85x metered gas while houses sit at 0.96. A block is
currently simulated at the sum of its flats' certified areas, but in blocks
where every dwelling is certified that sum is only 0.68 of the building's gross
internal area (houses: 0.77) - the rest is stairs, landings and corridors, which
belong to no flat and so appear in no certificate. The block is therefore
modelled smaller, with less envelope, than it really is.

Three variants, same sample, same weather:

  A  as built today   - simulate the certified area, charge each flat its area share
  B  gross envelope   - simulate footprint x floors, charge each flat its share of
                        the GROSS area (communal heat charged to nobody)
  C  gross envelope   - simulate footprint x floors, charge each flat its share of
                        the CERTIFIED area (communal heat shared between the flats,
                        the way a service charge spreads it)

Usage:  python tools/uk/experiment_flats_area.py [--n 60]
"""
from __future__ import annotations

import argparse
import json
import random
import statistics
import time

import calibrate_rotherham as C


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=60)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    blds = json.loads((C.ROOT / "frontend" / "public" / "uk" / "buildings_rotherham.json").read_text(encoding="utf-8"))
    cands = [b for b in blds
             if (b.get("epc_dwellings") or 0) >= 2
             and any(t in (b.get("property_type") or "").lower() for t in ("flat", "maisonette"))
             and b.get("main_fuel") == "mains gas" and (b.get("desnz_gas_meters") or 0) >= 5
             and b.get("desnz_gas_median_kwh") and b.get("floor_area_m2") and b.get("heated_area_m2")
             and b.get("footprint_m2") and b.get("floors")]
    rng = random.Random(args.seed)
    rng.shuffle(cands)
    sample, seen = [], set()
    for b in cands:
        if b["desnz_postcode"] not in seen:
            seen.add(b["desnz_postcode"]); sample.append(b)
        if len(sample) >= args.n:
            break
    print(f"{len(cands):,} eligible blocks -> {len(sample)} sampled (one per postcode)", flush=True)

    gross = [dict(b, heated_area_m2=b["footprint_m2"] * b["floors"]) for b in sample]

    def score(label: str, group: list[dict], gas: list[float | None], denom: str) -> None:
        out = []
        for b, g in zip(group, gas):
            if g is None:
                continue
            # floor_area_m2 is the SUM of the block's certified flat areas; one
            # flat's own area is that divided by the number of certified flats.
            per_flat = b["floor_area_m2"] / (b["epc_dwellings"] or 1)
            share = per_flat / (b["heated_area_m2"] if denom == "simulated" else b["floor_area_m2"])
            out.append(g * share / (C.SPACE_HEATING_SHARE * b["desnz_gas_median_kwh"]))
        s = C.score(out)
        print(f"  {label:<58} {s}", flush=True)

    t0 = time.time()
    gas_a = C.run_batch(sample)
    score("A  certified area simulated, flat share of certified", sample, gas_a, "simulated")
    gas_b = C.run_batch(gross)
    score("B  gross envelope simulated, flat share of gross", gross, gas_b, "simulated")
    score("C  gross envelope simulated, flat share of certified", gross, gas_b, "certified")
    print(f"({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
