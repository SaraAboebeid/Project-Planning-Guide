"""
Turn EPSM's Swedish LoD2 archetype catalogue (epsm_data 0.7.0, MIT,
SB-Chalmers/epsm) into the flat inputs our energy models take.

EPSM describes 28 archetypes (single-family, multi-family, office, school ×
eras SE.01–SE.07), each in up to three states (existing / standard /
advanced), as real layered constructions with sourced material data. Our RC
model and EnergyPlus shoebox need one U-value per envelope part, so this script
computes them with EN ISO 6946:

  * surface resistances: walls Rsi 0.13 / Rse 0.04, roofs and attic floors
    (heat flowing up) 0.10 / 0.04, ground floors 0.17 / 0 (soil side)
  * inhomogeneous layers (studs + insulation): the mean of the upper bound
    (parallel heat-flow paths) and the lower bound (layer-by-layer averaged
    conductivity), as ISO 6946 §6.7.2 prescribes
  * ground floors and basement walls are EPSM's NOMINAL layer U, not an
    ISO 13370 ground U — the same meaning as the TABULA floor values
  * offices: EPSM's thermal-bridge surcharge ΔU is added to every opaque part
  * windows: EPSM's whole-window U and SHGC

It also copies the operating data the archetypes come with: infiltration,
the ventilation template by era, measured multi-family setpoints (BETSI),
window-to-wall ratios by orientation, and the Sveby airflows.

The source wheel is kept as data in vendor/data/ (it is never pip-installed).
Re-run after updating it:

    python tools/epsm/build_archetypes.py
"""

from __future__ import annotations

import json
import sys
import zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WHEEL = ROOT / "vendor" / "data" / "epsm_data-0.7.0-py3-none-any.whl"
OUT = ROOT / "tools" / "idf" / "epsm_archetypes_se.json"

ERAS = {"SE.01": (1, 1960), "SE.02": (1961, 1975), "SE.03": (1976, 1985), "SE.04": (1986, 1995),
        "SE.05": (1996, 2005), "SE.06": (2006, 2021), "SE.07": (2022, None)}
SURFACE_R = {  # (Rsi, Rse) m²K/W
    "EXT_WALL": (0.13, 0.04), "TOP_FLOOR": (0.10, 0.04), "ROOF": (0.10, 0.04),
    "GROUND_FLOOR": (0.17, 0.0), "BASEMENT_FLOOR": (0.17, 0.0), "BASEMENT_WALL": (0.13, 0.0),
}


def _read(z: zipfile.ZipFile, name: str):
    return json.loads(z.read(f"epsm_data/datasets/{name}"))


def _element_layers(cat: dict, element_id: str) -> list[list[tuple[float, float, float]]]:
    """Element → ordered layers, each a list of (area fraction, thickness m, conductivity W/mK)."""
    e = cat["elements"][element_id]
    out = []
    for cid in e.get("components", []):
        for ref in sorted(cat["components"][cid]["layers"], key=lambda r: r["position"]):
            layer = cat["layers"][ref["layer_id"]]
            mats = []
            for m in layer["materials"]:
                thermal = THERMAL[cat["materials"][m["material_id"]]["thermal_ref"]["identifier"]]
                mats.append((float(m["area_fraction"]), float(m["thickness"]), float(thermal["conductivity"])))
            out.append(mats)
    return out


def iso6946_u(layers: list[list[tuple[float, float, float]]], rsi: float, rse: float) -> float:
    """U of a (possibly inhomogeneous) layered element, ISO 6946 combined method."""
    # Lower bound: each layer's conductivity averaged over its area fractions.
    r_lower = rsi + rse + sum(sum(f * t for f, t, _ in L) / sum(f * k for f, _, k in L) for L in layers)
    # Upper bound: parallel paths. Composite layers are aligned by material
    # order (EPSM lists the stud/joist first and the infill second in every
    # framed layer); the path weights come from the first composite layer.
    composite = [L for L in layers if len(L) > 1]
    if not composite:
        return 1.0 / r_lower
    weights = [f for f, _, _ in composite[0]]
    inv_upper = 0.0
    for p, w in enumerate(weights):
        r = rsi + rse
        for L in layers:
            f, t, k = L[min(p, len(L) - 1)] if len(L) > 1 else L[0]
            r += t / k
        inv_upper += w / r
    r_upper = 1.0 / inv_upper
    return 1.0 / ((r_upper + r_lower) / 2.0)


def main() -> None:
    global THERMAL
    z = zipfile.ZipFile(WHEEL)
    cat = _read(z, "lod2/catalogue.json")
    THERMAL = _read(z, "sources/custom_thermal.json")
    facade = _read(z, "profiles/facade_assumptions.json")
    measured = _read(z, "profiles/measured_use_v1.json")
    vent = _read(z, "profiles/ventilation_templates.json")
    res = _read(z, "profiles/sveby_residential_v2.json")
    office = _read(z, "profiles/sveby_office_v1.json")
    school = _read(z, "profiles/sveby_school_v1.json")
    generic = _read(z, "profiles/generic_other.json")
    tabula = _read(z, "sanity/tabula_u_values.json")

    archetypes: dict[str, dict] = {}
    for key, a in cat["archetypes"].items():
        states = {}
        for state, s in a["states"].items():
            cs = cat["construction_sets"][s["construction_set_id"]]["elements"]
            env = s["envelope_performance"]
            tb = float(env.get("thermal_bridge_delta_u_w_m2k") or 0.0)
            u = {}
            for role in ("EXT_WALL", "TOP_FLOOR", "ROOF", "GROUND_FLOOR"):
                if role in cs:
                    rsi, rse = SURFACE_R[role]
                    u[role] = iso6946_u(_element_layers(cat, cs[role]), rsi, rse)
            roof_role = "TOP_FLOOR" if "TOP_FLOOR" in u else "ROOF"
            win = THERMAL[cat["materials"][cat["elements"][cs["WINDOW"]]["window_material_id"]]["thermal_ref"]["identifier"]]
            states[state] = {
                "construction_year": s["construction_year"],
                "roof_topology": s["roof_topology"],
                "u_wall": round(u["EXT_WALL"] + tb, 3),
                "u_roof": round(u[roof_role] + tb, 3),
                "u_floor": round(u["GROUND_FLOOR"] + tb, 3),
                "u_win": round(float(win["u_factor"]), 3),
                "shgc": round(float(win["shgc"]), 3),
                "thermal_bridge_delta_u": tb,
                "infiltration_ach": env.get("infiltration_ach"),
                "infiltration_l_s_m2": env.get("infiltration_l_s_m2"),
                "infiltration_basis": env.get("infiltration_reference_basis"),
                "wall": cat["elements"][cs["EXT_WALL"]]["name"],
                "roof": cat["elements"][cs[roof_role]]["name"],
                "window": cat["elements"][cs["WINDOW"]]["name"],
            }
        archetypes[key] = {"category": a["category"], "era": a["era"], "name": a["name"], "states": states}

    # TABULA reference U-values EPSM checks itself against (existing state,
    # climate zone 3 = southern Sweden), so the computed U can be compared.
    tab_ref = {}
    for row in tabula["u_values"]:
        if row["state"] != "existing":
            continue
        k = f'{"mf" if row["category"] == "multi_family" else "sf"}_{row["era"].replace(".", "").lower()}'
        tab_ref[k] = {el: round(v["values_w_m2k"]["SE.Zone3"], 3) for el, v in row["elements"].items()
                      if "SE.Zone3" in v.get("values_w_m2k", {})}

    out = {
        "source": "epsm_data 0.7.0 (SB-Chalmers/epsm, MIT) — datasets/lod2/catalogue.json + profiles/",
        "built": date.today().isoformat(),
        "method": "U by EN ISO 6946 (combined method for framed layers); ground parts are nominal layer U",
        "eras": ERAS,
        "category_by_use": {"bostad_enfamilj": "single_family", "bostad_flerfamilj": "multi_family",
                            "verksamhet": "office", "samhalle": "school",
                            "industri": "generic", "ovrigt": "generic"},
        "generic_fabric_donor": "multi_family",
        "archetypes": archetypes,
        "tabula_reference_existing_zone3": tab_ref,
        "wwr_by_orientation": {c: {"default": t["default_wwr"], **t["wwr_by_orientation"]} for c, t in facade["types"].items()},
        "setpoint_c": {
            "single_family": res["use"]["heating_setpoint_c"],
            "multi_family_by_era": measured["types"]["multi_family"]["use"]["heating_setpoint_c_by_era"],
            "office": office["use"]["heating_setpoint_c"],
            "school": school["use"]["heating_setpoint_c"],
            "generic": generic["heating_setpoint_c"],
        },
        "ventilation": {
            "default_by_era": vent["default_by_era"],
            "templates": {k.replace("epsm.ventilation.", ""): v["airflow"] for k, v in vent["templates"].items()},
            "mf_self_draught_total_ach": measured["types"]["multi_family"]["ventilation"]["S"]["total_air_change_ach"],
            # Mechanical flow while running (l/s per m² Atemp), with run time as
            # (hours per day, active days per year) for the time-averaged flow.
            "flow": {
                "single_family": {"l_s_m2": res["airflow"]["minimum_outdoor_air_l_s_m2"], "hours": 24, "days": 365},
                "multi_family": {"l_s_m2": res["airflow"]["minimum_outdoor_air_l_s_m2"], "hours": 24, "days": 365},
                "office": {"l_s_m2": office["use"]["mechanical_vent_l_s_m2"],
                           "hours": office["operation_inputs"]["ventilation_hours"], "days": office["reference_active_days"]},
                "school": {"l_s_m2": school["operation_inputs"]["mechanical_vent_l_s_m2"],
                           "hours": school["completion_inputs"]["operating_hours"], "days": school["reference_active_days"]},
                "generic": {"l_s_m2": generic["mechanical_vent_l_s_m2"],
                            "hours": generic["weekday_end_hour"] - generic["weekday_start_hour"], "days": 250},
            },
        },
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    sys.stdout.reconfigure(encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(archetypes)} archetypes")
    print(f"{'archetype':12} {'wall':>6} {'TAB':>6} {'roof':>6} {'TAB':>6} {'floor':>6} {'win':>5} {'shgc':>5}  infiltration")
    for k, a in archetypes.items():
        s = a["states"].get("existing") or a["states"]["default"]
        t = tab_ref.get(k, {})
        inf = f'{s["infiltration_ach"]} ach' if s["infiltration_ach"] is not None else f'{s["infiltration_l_s_m2"]} l/s·m²'
        print(f"{k:12} {s['u_wall']:6.3f} {t.get('EXT_WALL', float('nan')):6.3f} {s['u_roof']:6.3f} "
              f"{t.get('THERMAL_TOP', float('nan')):6.3f} {s['u_floor']:6.3f} {s['u_win']:5.2f} {s['shgc']:5.2f}  {inf}")


THERMAL: dict = {}

if __name__ == "__main__":
    main()
