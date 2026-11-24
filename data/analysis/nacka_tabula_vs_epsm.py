"""Nacka: 20 random buildings on EPSM RC, TABULA inputs vs EPSM archetype inputs.

Same building preparation as Step 3 (_resolve_sim_building -> EPC hot water ->
height fix). Run A: epsm_parts=() (TABULA U-values + our defaults). Run B: all
five EPSM parts (fabric, ground, air, wwr, setpoint). Compared with the
building's energy certificate (kWh/m2). Heat-pump buildings are skipped: their
certificate counts bought electricity, not heat.
"""
import json, random, sys, statistics as st
from pathlib import Path

ROOT = Path(sys.argv[1])
sys.path.insert(0, str(ROOT))
import backend.main as M
from backend import rc_engine, epsm_archetypes

CITY, N, SEED = "nacka", int(sys.argv[2]) if len(sys.argv) > 2 else 20, 7
HEATED = {"bostad_enfamilj", "bostad_flerfamilj", "samhalle", "verksamhet", "industri"}
epw = str(M.EPW_DIR / (M.CITY_TO_EPW.get(CITY) or M._se_cities()[CITY]["epw"]))  # dynamic cities register at startup

pool = [b for b in M._se_buildings(CITY)
        if b.get("energy") and b.get("year") and b.get("use_cat") in HEATED and b.get("address")]
random.Random(SEED).shuffle(pool)

_con = M._epc_con()
_cols = {r[0] for r in _con.execute("describe epc").fetchall()}
# Old (pre-2019) carrier columns AND their 2019+ heating-only twins (*UPPV):
# the app's /api/epc/heating reads only the old ones, so 2019+ certificates
# come back with no system.
_GROUPS = {g: [c for base in cs for c in (base, base + "UPPV") if c in _cols] for g, cs in M._HEATING_GROUPS.items()}

def heating_of(addrs):
    out = {}
    for a in addrs:
        sel = ", ".join(f'COALESCE(TRY_CAST(REPLACE(CAST("{c}" AS VARCHAR), \',\', \'.\') AS DOUBLE), 0)' for g in _GROUPS for c in _GROUPS[g])
        row = _con.execute(f"SELECT {sel} FROM epc WHERE IdKommun = 'Nacka' AND lower(regexp_replace(IdAdr, '\\s+', '', 'g')) = ? "
                           "ORDER BY CAST(Godkand AS VARCHAR) DESC LIMIT 1", [a.lower().replace(" ", "")]).fetchone()
        if not row:
            continue
        tot, i = {}, 0
        for g, cs in _GROUPS.items():
            tot[g] = sum(row[i:i + len(cs)]); i += len(cs)
        best = max(tot, key=tot.get)
        out[a] = {"system": best if tot[best] > 0 else None}
    return out

rows, skipped_hp = [], 0
for i in range(0, len(pool), 40):
    chunk = pool[i:i + 40]
    heat = heating_of([b["address"] for b in chunk])
    for b in chunk:
        sysinfo = heat.get(b["address"]) or {}
        system = (sysinfo.get("system") if isinstance(sysinfo, dict) else None) or "unknown"
        if "pump" in system.lower() or "värmepump" in system.lower():
            skipped_hp += 1
            continue
        try:
            bb = M._with_user_edits_then_fix(b, None, "se", CITY)
            a = rc_engine.simulate(bb, "se", epw, {"epsm_parts": ()})
            e = rc_engine.simulate(bb, "se", epw, {"epsm_parts": tuple(epsm_archetypes.ALL_PARTS)})
        except Exception as exc:  # noqa: BLE001
            print("skip", b["address"], exc, file=sys.stderr)
            continue
        arch = epsm_archetypes.archetype_for(bb)
        rows.append({
            "address": b["address"], "use": b["use_cat"], "year": b["year"], "heating": system,
            "tabula_period": b.get("tabula_period"), "epsm_archetype": arch[2]["key"] if arch else None,
            "epc": float(b["energy"]),
            "tabula": round(a["heating_kwh_m2_yr"] + a["dhw_kwh_m2_yr"], 1),
            "epsm": round(e["heating_kwh_m2_yr"] + e["dhw_kwh_m2_yr"], 1),
            "area_tabula": a["floor_area_m2"],
            "in_tabula": a["inputs"], "in_epsm": e["inputs"],
        })
        if len(rows) >= N:
            break
    if len(rows) >= N:
        break

out = Path(sys.argv[3]) if len(sys.argv) > 3 else Path("nacka_compare.json")
out.write_text(json.dumps({"rows": rows, "skipped_heat_pump": skipped_hp}, ensure_ascii=False, indent=1, default=str), encoding="utf-8")

def summ(key):
    r = [x[key] / x["epc"] for x in rows]
    return st.median(r), st.median([abs(v - 1) for v in r]), sum(abs(v - 1) <= 0.2 for v in r)

print(f"{len(rows)} buildings (skipped {skipped_hp} heat-pump)")
print(f"{'address':32} {'use':18} {'year':>4} {'EPC':>5} {'TAB':>6} {'EPSM':>6}  heating")
for x in rows:
    print(f"{x['address'][:32]:32} {x['use']:18} {x['year']:>4} {x['epc']:>5.0f} {x['tabula']:>6.0f} {x['epsm']:>6.0f}  {x['heating']}")
for k in ("tabula", "epsm"):
    med, mae, within = summ(k)
    print(f"{k:6}: median model/EPC {med:.2f}  median |error| {mae*100:.0f}%  within ±20%: {within}/{len(rows)}")
