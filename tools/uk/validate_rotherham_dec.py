"""
Check the energy model against public buildings' METERED energy: Display Energy
Certificates (DECs) carry each building's gas and electricity meter readings
over a 12-month assessment period.

Each DEC building placed on a footprint (tools/uk/anchor_epc_uprn.py) is
simulated through the running backend (/api/simulation-batch-submit; needs
EPSM) at its heated area - the DEC's own floor area - with the default plant
for non-domestic buildings (ideal loads). Compared:
  * heat:        simulated heating / boiler efficiency   vs  metered gas (+ oil / LPG / biomass)
  * electricity: simulated lighting + equipment          vs  metered electricity
Metered gas also covers hot water and catering, and the shoebox uses generic
non-domestic occupancy and gains, so read this as a screening check on scale,
not a calibration target.

Usage:
    python tools/uk/validate_rotherham_dec.py [--boiler-eff 0.85] [--out results.json]
"""
from __future__ import annotations

import argparse
import json
import statistics
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
API = "http://localhost:8000/api"
HEAT_FUELS = ("gas", "oil", "lpg", "biomass", "coal", "district_heating", "other")


def _post(path: str, body: dict) -> dict:
    req = urllib.request.Request(f"{API}{path}", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())


def _get(path: str) -> dict:
    with urllib.request.urlopen(f"{API}{path}", timeout=300) as r:
        return json.loads(r.read())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", default="rotherham")
    ap.add_argument("--boiler-eff", type=float, default=0.85)
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()

    blds = json.loads((ROOT / "frontend" / "public" / "uk" / f"buildings_{args.city}.json").read_text(encoding="utf-8"))
    sample = [b for b in blds if (b.get("dec_metered_kwh") or {}) and b.get("heated_area_m2")
              and any((b["dec_metered_kwh"].get(f) or 0) > 0 for f in ("gas", "electricity"))]
    print(f"{len(sample)} DEC buildings with metered energy")
    specs = []
    for i, b in enumerate(sample):
        ring = b["coordinates"][0]
        specs.append({"lat": sum(p[1] for p in ring) / len(ring), "lon": sum(p[0] for p in ring) / len(ring), "address": f"dec-{i}"})
    sub = _post("/simulation-batch-submit", {"country": "gb", "buildings": specs,
                                             "package_id": f"dec-validation-{int(time.time())}", "package_label": "DEC validation"})
    t0 = time.time()
    while True:
        st = _get(f"/simulation-batch-status/{sub['batch_id']}")
        rows = st.get("buildings") or []
        if rows and all(r.get("status") in ("completed", "failed") for r in rows):
            break
        if time.time() - t0 > 3000:
            raise SystemExit("timed out waiting for EPSM")
        time.sleep(15)
    by_addr = {r["address"]: r for r in rows}

    out = []
    for i, b in enumerate(sample):
        res = (by_addr.get(f"dec-{i}") or {}).get("results") or {}
        if not res:
            continue
        m = b["dec_metered_kwh"]
        heat_metered = sum((m.get(f) or 0) for f in HEAT_FUELS)
        elec_metered = m.get("electricity") or 0
        sim_heat_fuel = (res.get("heating_kwh") or 0) / args.boiler_eff
        sim_elec = (res.get("lighting_kwh") or 0) + (res.get("equipment_kwh") or 0)
        out.append({
            "name": b.get("dec_name"), "type": b.get("dec_property_type"), "band": b.get("dec_band"),
            "heated_area_m2": b.get("heated_area_m2"), "use_cat": b.get("use_cat"),
            "metered_heat_fuel_kwh": round(heat_metered), "sim_heat_fuel_kwh": round(sim_heat_fuel),
            "heat_ratio": round(sim_heat_fuel / heat_metered, 2) if heat_metered else None,
            "metered_electricity_kwh": round(elec_metered), "sim_electricity_kwh": round(sim_elec),
            "electricity_ratio": round(sim_elec / elec_metered, 2) if elec_metered else None,
        })

    def summ(key: str) -> dict:
        v = sorted(o[key] for o in out if o[key])
        if not v:
            return {"n": 0}
        return {"n": len(v), "median": v[len(v) // 2], "iqr": [v[len(v) // 4], v[3 * len(v) // 4]],
                "within_25pct": round(sum(0.75 <= x <= 1.25 for x in v) / len(v), 2)}

    types: dict[str, list] = {}
    for o in out:
        if o["heat_ratio"]:
            types.setdefault(o["type"] or "unknown", []).append(o["heat_ratio"])
    summary = {"heat": summ("heat_ratio"), "electricity": summ("electricity_ratio"),
               "heat_by_type": {k: (len(v), round(statistics.median(v), 2)) for k, v in types.items()}}
    print(json.dumps(summary, indent=1))
    if args.out:
        args.out.write_text(json.dumps({"summary": summary, "buildings": out}, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
