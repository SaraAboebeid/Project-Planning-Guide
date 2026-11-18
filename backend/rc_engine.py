"""
Fast hourly energy model: EPSM's ISO 13790 5R1C RC model (epsm_rc) fed with
EXACTLY the inputs our EnergyPlus shoebox uses (tools/idf/generate_idf.py), so
the two engines describe the same building:

  geometry   the building's own outline (tools/idf/geometry), exposed walls only
             (party walls adiabatic), one window per facade at the use's WWR,
             orientation per facade, roof = floor = footprint, volume = footprint × height
  fabric     today's U-values: package override > recorded renovation > EPC > TABULA > default
  EPSM       Swedish non-flats built 2006+ (no TABULA period) take EPSM's archetype
             fabric, ground floor, air change, WWR and setpoint instead of the
             defaults (backend/epsm_archetypes.py; policy in tools/idf/defaults.py)
  air        infiltration 0.5 ach (UK homes 1.25), no mechanical ventilation
  gains      Sveby 2.0 for Swedish homes (35 m²/person × 50 W sensible when home,
             household electricity 21 kWh/m² with its monthly shape, 70 % as heat);
             otherwise the per-use People/Lights/Equipment intensities and day patterns
  setpoint   21 °C continuous
  ground     18 °C all year — EnergyPlus's default for a "Ground" surface, which is
             what the shoebox uses (it sets no ground temperatures)
  solar      g 0.6 glazing with no frame (SimpleGlazingSystem), absorptance 0.7
  thermal mass  very light: the shoebox's layers are massless (Material:NoMass)

It runs in well under a second per building, which is what makes city-scale
screening possible; EnergyPlus stays the reference for shortlisted buildings.
Solar series depend only on the weather file, so they are computed once per
EPW and reused for every building (unit window/opaque gains, scaled linearly).

epsm_rc 0.9.0 is used: the last pure-Python release. 0.11+ moved the solver to
Rust and ships only a Linux / CPython 3.11 wheel.
"""

from __future__ import annotations

import math
from functools import lru_cache
from typing import Any, Optional

import numpy as np

from tools.idf import defaults as D
from tools.idf import geometry as G
from tools.idf.generate_idf import _MONTH_DAYS, _SCHEDULE_DAY_PATTERNS, _floors_of, _project_like_ring

HOURS = 8760
ORIENTS = ("north", "east", "south", "west")
EPLUS_GROUND_DEFAULT_C = 18.0

# Mass node, calibrated against the EnergyPlus shoebox (2026-11-12, 30 fresh
# Gothenburg runs of the current model): its massless layers store almost no
# heat, so ISO's "very light" 80,000 J/m²K let big offices coast through the
# night on daytime gains (RC/E+ 0.36–0.71). At 20,000 the medians are 1.04
# (flats), 1.07 (houses), 0.94 (offices), 1.00 (public). This reproduces OUR
# model, not a real building's thermal mass — raise both together if the
# shoebox ever gets real constructions.
RC_CAPACITANCE_J_M2K = 20_000.0


@lru_cache(maxsize=16)
def _weather(epw_path: str) -> dict[str, Any]:
    """Outdoor temperature and unit solar series for one weather file."""
    from epsm_rc.solar import SolarGainsCalculator
    from pvlib.iotools import read_epw

    # SolarGainsCalculator.from_epw does exactly this, wrapped in a strict
    # loader that needs the full EPSM platform (Core/Data, Python 3.11);
    # the calculation itself only needs pvlib's parsed EPW.
    data, meta = read_epw(epw_path)
    # Actual weather years (smhi2epw) can be leap years: drop 29 February so
    # every series is 8760 h, then put all hours in one non-leap year.
    data = data[~((data.index.month == 2) & (data.index.day == 29))]
    if len(data) > HOURS:
        data = data.iloc[:HOURS]
    data.index = data.index.map(lambda ts: ts.replace(year=2021))
    tz = float(meta.get("TZ", 0) or 0)
    calc = SolarGainsCalculator(latitude=meta["latitude"], longitude=meta["longitude"],
                                altitude=meta.get("altitude", 0.0),
                                timezone="UTC" if tz == 0 else f"Etc/GMT{-int(tz):+d}")
    calc._epw_data = data
    calc._epw_metadata = meta
    t_out = np.asarray(calc._epw_data["temp_air"].values, dtype=float)[:HOURS]
    win = {o: np.asarray(calc.calculate_from_epw(window_areas={o: 1.0}, g_value=1.0, frame_factor=1.0), dtype=float)[:HOURS]
           for o in ORIENTS}
    wall = np.asarray(calc.calculate_opaque_solar_gains(wall_area=1.0, roof_area=0.0, u_walls=1.0, u_roof=0.0,
                                                        wall_absorptivity=1.0, roof_absorptivity=0.0), dtype=float)[:HOURS]
    roof = np.asarray(calc.calculate_opaque_solar_gains(wall_area=0.0, roof_area=1.0, u_walls=0.0, u_roof=1.0,
                                                        wall_absorptivity=0.0, roof_absorptivity=1.0), dtype=float)[:HOURS]
    ghi = np.asarray(data["ghi"].values, dtype=float)[:HOURS]
    return {"t_out": t_out, "win": win, "wall": wall, "roof": roof, "ghi": ghi, "lat": calc.latitude, "lon": calc.longitude}


def _day_pattern_hourly(pattern: list[tuple[str, float]]) -> np.ndarray:
    """A Schedule:Compact 'Until HH:MM, value' day → 24 hourly values, repeated all year."""
    day, start = np.zeros(24), 0
    for until, value in pattern:
        end = int(until.split(":")[0])
        day[start:end] = value
        start = end
    return np.tile(day, 365)


def _monthly_hourly(values: list[float]) -> np.ndarray:
    return np.concatenate([np.full(d * 24, v) for v, d in zip(values, _MONTH_DAYS)])


def model_inputs(building: dict, country: str, overrides: Optional[dict] = None,
                 ghi: Optional[np.ndarray] = None) -> dict:
    """Everything the RC model needs, derived like the EnergyPlus shoebox.
    ``ghi`` (hourly global irradiance, W/m²) drives the daylight dimming of
    non-residential lighting; without it the lights stay at full power."""
    o = overrides or {}
    country = (country or "").lower()
    ring = building["coordinates"][0]
    ring2d = G.ensure_ccw(G.project_ring(ring))
    height = float(building["height"])
    floors = _floors_of(building)
    footprint = float(building.get("footprint_m2") or 50.0)
    use_cat = building.get("use_cat")

    area_scale = 1.0
    heated = building.get("heated_area_m2")
    if use_cat == "bostad_flerfamilj" and country == "gb":
        heated = None
    if heated and footprint > 0:
        area_scale = max(0.1, min(2.0, (float(heated) / floors) / footprint))
    lin = math.sqrt(area_scale)
    ring2d = [(x * lin, y * lin) for x, y in ring2d]
    footprint *= area_scale
    floor_area = footprint * floors

    # EPSM archetypes (backend/epsm_archetypes.py) in place of TABULA, part by
    # part: any of "fabric", "ground", "air", "wwr", "setpoint". Swedish
    # buildings with a construction year only; the rest keep the defaults.
    if "epsm_parts" in o:                         # explicit (tests, comparisons)
        parts = frozenset(o["epsm_parts"] or ())
    else:                                         # default policy (tools/idf/defaults.py)
        try:
            recent = int(building.get("year") or 0) >= D.EPSM_ARCHETYPE_MIN_YEAR
        except (TypeError, ValueError):
            recent = False
        parts = frozenset(D.EPSM_ARCHETYPE_PARTS) if recent and use_cat not in D.EPSM_ARCHETYPE_EXCLUDE_USES else frozenset()
    arch = None
    if parts and country == "se":
        from backend import epsm_archetypes
        arch = epsm_archetypes.inputs_for(building, height / max(1, floors))
    use_arch = (lambda p: arch is not None and p in parts)

    def today(part: str, default: float) -> float:
        archetype = arch[f"u_{part}"] if use_arch("fabric") and part != "floor" else building.get(f"tabula_u_{part}")
        return building.get(f"u_{part}_recorded") or building.get(f"u_{part}_epc") or archetype or default
    u = {
        "wall": o.get("u_wall_override") or today("wall", D.DEFAULT_U_WALL),
        "roof": o.get("u_roof_override") or today("roof", D.DEFAULT_U_ROOF),
        "win": o.get("u_win_override") or today("win", D.DEFAULT_U_WIN),
        "floor": o.get("u_floor_override") or today("floor", D.DEFAULT_U_FLOOR),
    }
    # Vertical extension (backend _with_extension): the added storeys' walls and
    # windows have their own U; one-zone model → area-weighted by height share.
    ext_h = float(o.get("extension_height_m") or 0.0)
    if ext_h > 0 and height > 0:
        share = min(1.0, ext_h / height)
        for part, key in (("wall", "u_ext_wall"), ("win", "u_ext_win")):
            if o.get(key):
                u[part] = u[part] * (1 - share) + float(o[key]) * share
    wwr = o.get("wwr_override") or (arch["wwr"] if use_arch("wwr") else D.DEFAULT_WWR_BY_USE.get(use_cat or "", D.DEFAULT_WWR_FALLBACK))
    wwr_by = o.get("wwr_by_orientation") or (arch["wwr_by_orientation"] if use_arch("wwr") and not o.get("wwr_override") else {})

    party_mids = [(x * lin, y * lin) for x, y in _project_like_ring(building.get("party_wall_midpoints") or [], ring)]
    wall_gross, win_by, glazed_width = 0.0, {k: 0.0 for k in ORIENTS}, 0.0
    n = len(ring2d)
    for i in range(n):
        p0, p1 = ring2d[i], ring2d[(i + 1) % n]
        width = G.edge_length(p0, p1)
        if width < 0.3:
            continue
        mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
        if any(math.hypot(mid[0] - q[0], mid[1] - q[1]) < 1.0 for q in party_mids):
            continue                                  # adiabatic party wall
        wall_gross += width * height
        facing = G.compass_octant(G.wall_azimuth(p0, p1))
        w = wwr_by.get(facing)
        w = max(0.02, min(0.9, float(w))) if w is not None else wwr
        geo = G.window_geometry_for_wwr(width, height, w)
        if geo is not None:
            sill, head, win_width = geo
            win_by[facing] += (head - sill) * win_width
            glazed_width += width
    window_area = sum(win_by.values())
    ground_c = EPLUS_GROUND_DEFAULT_C
    if use_arch("ground") and not o.get("u_floor_override") and not building.get("u_floor_recorded"):
        # ISO 13370 slab on ground from the archetype's floor construction,
        # against the annual-mean outdoor temperature (set in simulate()).
        from backend import epsm_archetypes
        u["floor"] = epsm_archetypes.iso13370_floor_u(arch["u_floor_nominal"], footprint, wall_gross / height if height else 0.0)
        ground_c = None
    # Share of the floor whose lights dim with daylight (the shoebox's
    # Daylighting:Controls: floor within DAYLIGHT_DEPTH_M of a glazed wall).
    daylit_fraction = min(1.0, glazed_width * D.DAYLIGHT_DEPTH_M / footprint) if footprint > 0 else 0.0

    se_home = (D.SE_HOME_LOADS == "sveby2" and country == "se"
               and use_cat in ("bostad_enfamilj", "bostad_flerfamilj"))
    uk_home = country == "gb" and use_cat in ("bostad_enfamilj", "bostad_flerfamilj")
    if se_home:
        presence = _day_pattern_hourly(D.SVEBY_PRESENCE_PATTERN)
        people_w = floor_area / D.SE_HOME_M2_PER_PERSON * D.SVEBY_PERSON_W * D.SVEBY_PERSON_SENSIBLE_FRACTION * presence
        shape = D.SVEBY_HOUSEHOLD_EL_MONTHLY_W_M2
        frac = [w / max(shape) for w in shape]
        full_load_h = sum(f * d * 24 for f, d in zip(frac, _MONTH_DAYS))
        equip_design_w = D.SVEBY_HOUSEHOLD_EL_KWH_M2_YR * floor_area * 1000.0 / full_load_h
        equip_w = equip_design_w * _monthly_hourly(frac)
        gains = people_w + equip_w * D.SVEBY_HOUSEHOLD_EL_HEAT_FRACTION
        dhw_kwh_m2 = float(building.get("dhw_kwh_m2_epc") or D.SVEBY_DHW_KWH_M2_YR)
        elec_w = equip_w
        lights_w = np.zeros(HOURS)        # household electricity covers lighting (as the shoebox)
    else:
        g = D.INTERNAL_GAINS_BY_USE.get(use_cat or "", D.DEFAULT_INTERNAL_GAINS)
        pat = _day_pattern_hourly(_SCHEDULE_DAY_PATTERNS[g["schedule"]])
        # EnergyPlus splits a 120 W person ~60 % sensible at this activity level.
        people_w = floor_area / g["m2_per_person"] * D.ACTIVITY_LEVEL_W_PER_PERSON * 0.6 * pat
        lights_w = g["lighting_w_m2"] * floor_area * pat
        residential = (use_cat or "").startswith("bostad")
        if D.DAYLIGHT_DIMMING and not residential:
            # Continuous dimming down to the minimum power fraction once daylight
            # is ample: approximated from the hour's global irradiance (full
            # dimming from ~200 W/m², which gives ~300 lux well inside a window).
            light_level = np.clip(ghi / 200.0, 0.0, 1.0) if ghi is not None else 0.0
            lights_w = lights_w * (1.0 - daylit_fraction * (1.0 - D.DAYLIGHT_MIN_POWER_FRACTION) * light_level)
        equip_w = g["equipment_w_m2"] * floor_area * pat
        elec_w = lights_w + equip_w
        gains = people_w + elec_w
        dhw_kwh_m2 = 0.0 if country == "gb" and not uk_home else (float(building.get("dhw_kwh_m2_epc") or D.SVEBY_DHW_KWH_M2_YR) if country == "se" else 0.0)

    return {
        "floor_area_m2": floor_area, "footprint_m2": footprint, "height_m": height, "floors": floors,
        "wall_area_m2": max(0.0, wall_gross - window_area), "window_by_orientation": win_by,
        "window_area_m2": window_area, "roof_area_m2": footprint, "u": u,
        "ach_infiltration": arch["infiltration_ach"] if use_arch("air") else (D.UK_INFILTRATION_ACH if uk_home else D.INFILTRATION_ACH),
        "ach_ventilation": arch["ventilation_ach"] if use_arch("air") else 0.0,
        "heat_recovery": arch["heat_recovery"] if use_arch("air") else 0.0,
        "shgc": arch["shgc"] if use_arch("fabric") else D.DEFAULT_SHGC,
        "ground_c": ground_c,
        "gains_w": gains, "electricity_w": elec_w, "dhw_kwh_m2_yr": dhw_kwh_m2,
        "lighting_w": np.broadcast_to(np.asarray(lights_w, dtype=float), (HOURS,)),
        "equipment_w": np.broadcast_to(np.asarray(equip_w, dtype=float), (HOURS,)),
        "setpoint_c": arch["setpoint_c"] if use_arch("setpoint") else D.HEATING_SETPOINT_C,
        "archetype": (arch["key"] if arch is not None else None) if parts else None,
    }


def simulate(building: dict, country: str, epw_path: str, overrides: Optional[dict] = None,
             hourly: bool = False) -> dict:
    """One building, one year. Heating in kWh, kWh/m² and peak kW (+ hourly kWh if asked)."""
    import warnings
    from epsm_rc import Building5R1C

    w = _weather(str(epw_path))
    m = model_inputs(building, country, overrides, ghi=w["ghi"])
    win = m["window_by_orientation"]
    bld = Building5R1C(
        floor_area_m2=m["floor_area_m2"],
        thermal_capacitance_j_m2k=RC_CAPACITANCE_J_M2K,
        u_walls=m["u"]["wall"], u_roof=m["u"]["roof"], u_floor=m["u"]["floor"], u_windows=m["u"]["win"],
        wall_area_m2=m["wall_area_m2"], roof_area_m2=m["roof_area_m2"], floor_area_ground_m2=m["footprint_m2"],
        window_area_m2=m["window_area_m2"],
        window_area_north=win["north"], window_area_east=win["east"], window_area_south=win["south"], window_area_west=win["west"],
        building_height_m=m["height_m"], ceiling_height_m=m["height_m"] / max(1, m["floors"]),
        ach_infiltration=m["ach_infiltration"], ach_ventilation=m["ach_ventilation"],
        heat_recovery_efficiency=m["heat_recovery"],
        g_value=m["shgc"], frame_factor=1.0, t_set_heating=m["setpoint_c"], t_set_cooling=D.COOLING_SETPOINT_C,
        ground_temps_monthly=[m["ground_c"] if m["ground_c"] is not None else float(w["t_out"].mean())] * 12,
        latitude=w["lat"], longitude=w["lon"],
    )
    solar = sum(w["win"][o] * win[o] for o in ORIENTS) * m["shgc"] * bld.non_perpendicular_incidence_factor
    opaque = 0.7 * (w["wall"] * m["wall_area_m2"] * m["u"]["wall"] + w["roof"] * m["roof_area_m2"] * m["u"]["roof"])
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        res = bld.simulate(t_outdoor=w["t_out"], solar_gains=solar, internal_gains=m["gains_w"],
                           solar_gains_opaque=opaque, dt_hours=1.0, max_cooling_power=np.inf)
    # The shoebox's ideal loads also cool at 25 °C: surplus gains (sunny offices)
    # are removed rather than kept to offset later heating. Heating = positive part.
    heat_w = np.maximum(np.asarray(res["heating_demand"], dtype=float), 0.0)
    heat_kwh = heat_w / 1000.0
    area = m["floor_area_m2"] or 1.0
    out = {
        "engine": "epsm_rc 5R1C",
        "floor_area_m2": round(area, 1),
        "heating_kwh": round(float(heat_kwh.sum())),
        "heating_kwh_m2_yr": round(float(heat_kwh.sum()) / area, 1),
        "dhw_kwh_m2_yr": round(m["dhw_kwh_m2_yr"], 1),
        "peak_heating_kw": round(float(heat_kwh.max()), 1),
        "peak_heating_w_m2": round(float(heat_kwh.max()) * 1000 / area, 1),
        "inputs": {"u": {k: round(v, 3) for k, v in m["u"].items()}, "archetype": m["archetype"],
                   "ach": round(m["ach_infiltration"] + m["ach_ventilation"] * (1 - m["heat_recovery"]), 3),
                   "setpoint_c": m["setpoint_c"], "wall_area_m2": round(m["wall_area_m2"]),
                   "window_area_m2": round(m["window_area_m2"]), "roof_area_m2": round(m["roof_area_m2"])},
    }
    cool_kwh = np.maximum(-np.asarray(res["heating_demand"], dtype=float), 0.0) / 1000.0
    light_kwh = np.asarray(m["lighting_w"], dtype=float) / 1000.0
    equip_kwh = np.asarray(m["equipment_w"], dtype=float) / 1000.0
    dhw_total = m["dhw_kwh_m2_yr"] * area
    out.update({
        "cooling_kwh": round(float(cool_kwh.sum())), "lighting_kwh": round(float(light_kwh.sum())),
        "equipment_kwh": round(float(equip_kwh.sum())), "dhw_kwh": round(dhw_total),
    })
    if hourly:
        out["hourly_heating_kwh"] = [round(v, 3) for v in heat_kwh.tolist()]
        out["hourly_electricity_kwh"] = [round(v, 3) for v in (np.asarray(m["electricity_w"]) / 1000.0).tolist()]
        out["hourly"] = {          # every end use, kWh per hour (hot water drawn evenly)
            "heating": heat_kwh, "cooling": cool_kwh, "lighting": light_kwh, "equipment": equip_kwh,
            "dhw": np.full(HOURS, dhw_total / HOURS),
        }
    return out
