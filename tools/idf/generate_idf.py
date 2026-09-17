"""
generate_idf.py - build a single-zone "shoebox" EnergyPlus IDF from one of our
own building records (frontend/public/buildings.json or
frontend/public/uk/buildings_*.json), ready to POST to a running EPSM
instance (see docker-compose.epsm.yml, backend/main.py's /api/simulation-*).

Public entry point: build_shoebox_idf(building, country, city_id, ...).

Scope (per the approved plan): one thermal zone per building spanning its
full real height, envelope from tabula_u_wall/roof/win where the building
record has them (else tools/idf/defaults.py), windows on every exterior
wall sized from a saved WWR-tool estimate when passed in, else a
use_cat-based default ratio. No HVAC plant - EnergyPlus's own
ZoneHVAC:IdealLoadsAirSystem stands in for "some heating/cooling system
that exactly meets the load", the standard approach for a screening model.
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Any, Optional

import jinja2

from . import defaults as D
from . import geometry as G

HERE = Path(__file__).resolve().parent
_TEMPLATE_ENV = jinja2.Environment(
    loader=jinja2.FileSystemLoader(str(HERE / "templates")),
    trim_blocks=True,
    lstrip_blocks=True,
)


# ── small formatting helpers ─────────────────────────────────────────────

def _safe_name(s: str) -> str:
    """EnergyPlus object names can't contain ',', ';', or '!'; keep plain
    ASCII too, since some upstream addresses carry mis-decoded characters
    (e.g. Swedish å/ä/ö mangled by an earlier pipeline's encoding bug)."""
    s = s.encode("ascii", "ignore").decode("ascii")
    for ch in (",", ";", "!"):
        s = s.replace(ch, " ")
    return " ".join(s.split()) or "Unnamed"


def _fmt(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float):
        return f"{v:.6g}"
    return str(v)


def obj(type_name: str, fields: list[tuple[Any, str]]) -> str:
    """Render one EnergyPlus object. `fields` is a list of (value, comment)."""
    lines = [f"{type_name},"]
    n = len(fields)
    for i, (value, comment) in enumerate(fields):
        term = ";" if i == n - 1 else ","
        line = f"    {_fmt(value)}{term}"
        if comment:
            pad = max(1, 30 - len(line))
            line = line + " " * pad + f"!- {comment}"
        lines.append(line)
    return "\n".join(lines)


def _vertex_fields(vertices: list[G.Point3D]) -> list[tuple[Any, str]]:
    fields: list[tuple[Any, str]] = [(None, "Number of Vertices")]
    for i, (x, y, z) in enumerate(vertices, start=1):
        fields.append((round(x, 4), f"Vertex {i} X-coordinate {{m}}"))
        fields.append((round(y, 4), f"Vertex {i} Y-coordinate {{m}}"))
        fields.append((round(z, 4), f"Vertex {i} Z-coordinate {{m}}"))
    return fields


# ── EPW header (Site:Location) ───────────────────────────────────────────

def read_epw_location(epw_path: str | Path) -> dict:
    """Parse the LOCATION line of an EPW file's header."""
    with open(epw_path, "r", encoding="utf-8", errors="replace") as f:
        first_line = f.readline()
    parts = [p.strip() for p in first_line.split(",")]
    if len(parts) < 10 or parts[0].upper() != "LOCATION":
        raise ValueError(f"{epw_path}: not a valid EPW file (missing LOCATION header)")
    return {
        "name": parts[1],
        "latitude": float(parts[6]),
        "longitude": float(parts[7]),
        "time_zone": float(parts[8]),
        "elevation": float(parts[9]),
    }


# ── building field extraction ────────────────────────────────────────────

def _floors_of(building: dict) -> int:
    floors = building.get("floors")
    if floors:
        return max(1, round(float(floors)))
    height = building.get("height")
    if height:
        return max(1, round(float(height) / D.FLOOR_HEIGHT_M))
    return 1


def _total_floor_area_m2(building: dict, floors: int) -> float:
    # Always the modelled geometry (footprint x floors), never a record's own
    # floor_area_m2: the shoebox's envelope, gains and hot water must describe
    # the same building. UK records carry the EPC certificate area there, which
    # covers only the certified dwellings (median 0.65x the footprint area in
    # Rotherham) and inflated per-m2 heating ~1.5-4x when mixed with the geometry.
    footprint = building.get("footprint_m2") or 50.0
    return float(footprint) * floors


def _gains_profile(use_cat: Optional[str]) -> dict:
    return D.INTERNAL_GAINS_BY_USE.get(use_cat or "", D.DEFAULT_INTERNAL_GAINS)


# ── schedule day patterns (Schedule:Day:Interval-free, plain Compact) ────
# Deliberately simple (a handful of Until: blocks) - a shoebox screening
# model doesn't need hourly-granular occupancy diversity profiles.
_SCHEDULE_DAY_PATTERNS = {
    "residential": [("06:00", 0.2), ("08:00", 0.6), ("16:00", 0.3), ("22:00", 0.8), ("24:00", 0.3)],
    "commercial": [("07:00", 0.05), ("08:00", 0.4), ("18:00", 0.9), ("19:00", 0.3), ("24:00", 0.05)],
    "other": [("07:00", 0.1), ("18:00", 0.4), ("24:00", 0.1)],
}


def _schedule_compact(name: str, type_limits: str, day_pattern: list[tuple[str, float]]) -> str:
    fields: list[tuple[Any, str]] = [(name, "Name"), (type_limits, "Schedule Type Limits Name")]
    fields.append(("Through: 12/31", "Field"))
    fields.append(("For: AllDays", "Field"))
    for until, value in day_pattern:
        fields.append((f"Until: {until}", "Field"))
        fields.append((value, "Field"))
    return obj("Schedule:Compact", fields)


def _schedule_compact_week(name: str, type_limits: str, weekday: list[tuple[str, float]],
                           weekend: list[tuple[str, float]]) -> str:
    fields: list[tuple[Any, str]] = [(name, "Name"), (type_limits, "Schedule Type Limits Name"), ("Through: 12/31", "Field")]
    for days, pattern in (("For: Weekdays", weekday), ("For: Weekends Holidays AllOtherDays", weekend)):
        fields.append((days, "Field"))
        for until, value in pattern:
            fields.append((f"Until: {until}", "Field"))
            fields.append((value, "Field"))
    return obj("Schedule:Compact", fields)


def _project_like_ring(points_lonlat: list, ring_lonlat: list) -> list[tuple[float, float]]:
    """Project extra [lon, lat] points into the same local frame G.project_ring uses for this ring."""
    if not points_lonlat:
        return []
    pts = ring_lonlat[:-1] if ring_lonlat[0] == ring_lonlat[-1] else ring_lonlat
    lon0 = sum(p[0] for p in pts) / len(pts)
    lat0 = sum(p[1] for p in pts) / len(pts)
    mx = 111_320.0 * math.cos(math.radians(lat0))
    my = 110_540.0
    return [((p[0] - lon0) * mx, (p[1] - lat0) * my) for p in points_lonlat]


def _day_pattern_mean(pattern: list[tuple[str, float]]) -> float:
    """Hour-weighted mean of a Schedule:Compact day pattern, used to convert a
    target ANNUAL energy into the peak flow rate the schedule modulates."""
    mean = 0.0
    prev_h = 0.0
    for until, value in pattern:
        hh, mm = until.split(":")
        h = int(hh) + int(mm) / 60.0
        mean += (h - prev_h) * value
        prev_h = h
    return mean / prev_h if prev_h else 0.0


def _dhw_peak_flow_m3_s(annual_kwh: float, pattern: list[tuple[str, float]]) -> float:
    """Peak draw (m3/s) that makes the scheduled profile deliver `annual_kwh`.

    Inverts Q = rho * c * V * dT over the year: the schedule's own mean
    fraction sets how much of the peak is actually drawn, so the annual total
    stays on target no matter how the profile's shape is edited.
    """
    # Mean tank temperature, not setpoint - see D.DHW_DEADBAND_K.
    delta_t = (D.DHW_SUPPLY_TEMP_C - D.DHW_DEADBAND_K / 2.0) - D.DHW_COLD_TEMP_C
    kwh_per_m3 = D.WATER_DENSITY_KG_M3 * D.WATER_SPECIFIC_HEAT_J_KGK * delta_t / 3_600_000.0
    if kwh_per_m3 <= 0:
        return 0.0
    annual_m3 = annual_kwh / kwh_per_m3
    mean_fraction = _day_pattern_mean(pattern)
    seconds_per_year = 8760 * 3600
    if mean_fraction <= 0:
        return 0.0
    return annual_m3 / (seconds_per_year * mean_fraction)


def _constant_schedule(name: str, type_limits: str, value: float) -> str:
    return obj("Schedule:Compact", [
        (name, "Name"),
        (type_limits, "Schedule Type Limits Name"),
        ("Through: 12/31", "Field"),
        ("For: AllDays", "Field"),
        ("Until: 24:00", "Field"),
        (value, "Field"),
    ])


# ── main entry point ─────────────────────────────────────────────────────

def build_shoebox_idf(
    building: dict,
    country: str,
    city_id: str,
    epw_path: str | Path,
    wwr_override: Optional[float] = None,
    building_name: Optional[str] = None,
    u_wall_override: Optional[float] = None,
    u_roof_override: Optional[float] = None,
    u_win_override: Optional[float] = None,
    u_floor_override: Optional[float] = None,
    heating_system: str = "ideal",
    boiler_efficiency: Optional[float] = None,
) -> str:
    """Return a complete EnergyPlus 23.2 IDF (as text) for one building.

    The u_*_override params exist for the renovation-package calculator: a
    package swaps one or more envelope U-values (e.g. a new wall material)
    without needing a copy of the building dict - each override takes
    priority over the building's own tabula_u_* field, same pattern as the
    existing wwr_override.
    """
    ring = building["coordinates"][0]
    ring2d = G.ensure_ccw(G.project_ring(ring))
    height = float(building["height"])
    if height <= 0:
        raise ValueError("building.height must be positive")

    floors = _floors_of(building)
    footprint_m2 = float(building.get("footprint_m2") or 50.0)
    # Heated area (UK: EPC total floor areas, tools/uk/anchor_epc_uprn.py
    # assign_heated_area) is what gets simulated. The footprint keeps its shape
    # and orientation but is scaled evenly about its centre until footprint x
    # floors equals the heated area, so walls, roof, glazing, gains and air
    # volume all describe the same heated building. Records without one
    # (Sweden) are simulated at footprint x floors as before.
    area_scale = 1.0
    heated = building.get("heated_area_m2")
    if heated and footprint_m2 > 0:
        area_scale = max(0.1, min(2.0, (float(heated) / floors) / footprint_m2))
        lin = math.sqrt(area_scale)
        ring2d = [(x * lin, y * lin) for x, y in ring2d]
        footprint_m2 *= area_scale
    total_floor_area = footprint_m2 * floors
    use_cat = building.get("use_cat")
    gains = _gains_profile(use_cat)

    # u_*_epc (UK only) come from the certificates' own fabric descriptions
    # (tools/uk/epc_fabric.py) and describe the building as it is today;
    # tabula_u_* are uninsulated as-built archetype values.
    u_wall = u_wall_override if u_wall_override is not None else (building.get("u_wall_epc") or building.get("tabula_u_wall") or D.DEFAULT_U_WALL)
    u_roof = u_roof_override if u_roof_override is not None else (building.get("u_roof_epc") or building.get("tabula_u_roof") or D.DEFAULT_U_ROOF)
    u_win = u_win_override if u_win_override is not None else (building.get("u_win_epc") or building.get("tabula_u_win") or D.DEFAULT_U_WIN)
    # Only the UK payload carries tabula_u_floor (TABULA GB publishes it); Sweden keeps the default.
    u_floor = u_floor_override if u_floor_override is not None else (building.get("u_floor_epc") or building.get("tabula_u_floor") or D.DEFAULT_U_FLOOR)
    uk_home = (country or "").lower() == "gb" and use_cat in ("bostad_enfamilj", "bostad_flerfamilj")
    wwr = wwr_override if wwr_override is not None else D.DEFAULT_WWR_BY_USE.get(use_cat or "", D.DEFAULT_WWR_FALLBACK)

    name_base = _safe_name(building_name or building.get("address") or f"{city_id} building")
    zone_name = f"{name_base} Zone"

    loc = read_epw_location(epw_path)

    objects: list[str] = []

    # ── simulation header ────────────────────────────────────────────
    objects.append(obj("Version", [("23.2", "Version Identifier")]))
    objects.append(obj("Building", [
        (name_base, "Name"), (0, "North Axis {deg}"), ("City", "Terrain"),
        (None, "Loads Convergence Tolerance Value {W}"),
        (None, "Temperature Convergence Tolerance Value {deltaC}"),
        ("FullExterior", "Solar Distribution"),
        (None, "Maximum Number of Warmup Days"), (None, "Minimum Number of Warmup Days"),
    ]))
    # A real plant (gas boiler) autosizes its capacity and water flows from
    # weather-file extreme periods; ideal loads need no sizing at all.
    gas_boiler = heating_system == "gas_boiler"
    sizing = "Yes" if gas_boiler else "No"
    objects.append(obj("SimulationControl", [
        (sizing, "Do Zone Sizing Calculation"), (sizing, "Do System Sizing Calculation"),
        (sizing, "Do Plant Sizing Calculation"), ("No", "Run Simulation for Sizing Periods"),
        ("Yes", "Run Simulation for Weather File Run Periods"),
        ("No", "Do HVAC Sizing Simulation for Sizing Periods"),
        (1, "Maximum Number of HVAC Sizing Simulation Passes"),
    ]))
    objects.append(obj("Timestep", [(4, "Number of Timesteps per Hour")]))
    objects.append(obj("Site:Location", [
        (loc["name"], "Name"), (loc["latitude"], "Latitude {deg}"), (loc["longitude"], "Longitude {deg}"),
        (loc["time_zone"], "Time Zone {hr}"), (loc["elevation"], "Elevation {m}"),
    ]))
    objects.append(obj("RunPeriod", [
        ("Run Period 1", "Name"), (1, "Begin Month"), (1, "Begin Day of Month"), (None, "Begin Year"),
        (12, "End Month"), (31, "End Day of Month"), (None, "End Year"),
        ("Sunday", "Day of Week for Start Day"),
        ("Yes", "Use Weather File Holidays and Special Days"),
        ("Yes", "Use Weather File Daylight Saving Period"),
        ("No", "Apply Weekend Holiday Rule"),
        ("Yes", "Use Weather File Rain Indicators"), ("Yes", "Use Weather File Snow Indicators"),
    ]))
    objects.append(obj("GlobalGeometryRules", [
        ("UpperLeftCorner", "Starting Vertex Position"), ("Counterclockwise", "Vertex Entry Direction"),
        ("Relative", "Coordinate System"), ("Relative", "Daylighting Reference Point Coordinate System"),
        ("Relative", "Rectangular Surface Coordinate System"),
    ]))
    objects.append(obj("ShadowCalculation", [
        ("PolygonClipping", "Shading Calculation Method"), ("Periodic", "Shading Calculation Update Frequency Method"),
        (30, "Shading Calculation Update Frequency"), (15000, "Maximum Figures in Shadow Overlap Calculations"),
        ("SutherlandHodgman", "Polygon Clipping Algorithm"), (512, "Pixel Counting Resolution"),
        ("SimpleSkyDiffuseModeling", "Sky Diffuse Modeling Algorithm"),
        ("No", "Output External Shading Calculation Results"),
        ("No", "Disable Self-Shading Within Shading Zone Groups"),
        ("No", "Disable Self-Shading From Shading Zone Groups to Other Zones"),
    ]))
    objects.append(obj("HeatBalanceAlgorithm", [("ConductionTransferFunction", "Algorithm"), (200, "Surface Temperature Upper Limit {C}")]))
    objects.append(obj("OutputControl:ReportingTolerances", [(1.11, "Tolerance for Time Heating Setpoint Not Met {deltaC}"), (1.11, "Tolerance for Time Cooling Setpoint Not Met {deltaC}")]))

    # ── envelope materials/constructions ─────────────────────────────
    r_wall = max(D.MIN_LAYER_R, 1.0 / u_wall - D.R_SI - D.R_SE)
    r_roof = max(D.MIN_LAYER_R, 1.0 / u_roof - D.R_SI - D.R_SE)
    r_floor = max(D.MIN_LAYER_R, 1.0 / u_floor - D.R_SI)  # "Ground" boundary: no exterior film

    def nomass_material(name: str, r_value: float) -> str:
        return obj("Material:NoMass", [
            (name, "Name"), ("MediumRough", "Roughness"), (round(r_value, 4), "Thermal Resistance {m2-K/W}"),
            (0.9, "Thermal Absorptance"), (0.7, "Solar Absorptance"), (0.7, "Visible Absorptance"),
        ])

    objects.append(nomass_material("Wall Material", r_wall))
    objects.append(obj("Construction", [("Wall Construction", "Name"), ("Wall Material", "Outside Layer")]))
    objects.append(nomass_material("Roof Material", r_roof))
    objects.append(obj("Construction", [("Roof Construction", "Name"), ("Roof Material", "Outside Layer")]))
    objects.append(nomass_material("Floor Material", r_floor))
    objects.append(obj("Construction", [("Floor Construction", "Name"), ("Floor Material", "Outside Layer")]))
    objects.append(obj("WindowMaterial:SimpleGlazingSystem", [
        ("Window Material", "Name"), (round(u_win, 3), "U-Factor {W/m2-K}"), (D.DEFAULT_SHGC, "Solar Heat Gain Coefficient"),
    ]))
    objects.append(obj("Construction", [("Window Construction", "Name"), ("Window Material", "Outside Layer")]))

    # ── zone + geometry ───────────────────────────────────────────────
    volume = footprint_m2 * height
    objects.append(obj("Zone", [
        (zone_name, "Name"), (0, "Direction of Relative North {deg}"), (0, "X Origin {m}"), (0, "Y Origin {m}"),
        (0, "Z Origin {m}"), (None, "Type"), (1, "Multiplier"), (round(height, 3), "Ceiling Height {m}"),
        (round(volume, 2), "Volume {m3}"), (None, "Floor Area {m2}"), (None, "Zone Inside Convection Algorithm"),
        (None, "Zone Outside Convection Algorithm"), ("Yes", "Part of Total Floor Area"),
    ]))

    objects.append(obj("BuildingSurface:Detailed", [
        (f"{name_base}..Roof", "Name"), ("Roof", "Surface Type"), ("Roof Construction", "Construction Name"),
        (zone_name, "Zone Name"), (None, "Space Name"), ("Outdoors", "Outside Boundary Condition"),
        (None, "Outside Boundary Condition Object"), ("SunExposed", "Sun Exposure"), ("WindExposed", "Wind Exposure"),
        (None, "View Factor to Ground"),
    ] + _vertex_fields(G.roof_vertices(ring2d, height))))

    objects.append(obj("BuildingSurface:Detailed", [
        (f"{name_base}..Floor", "Name"), ("Floor", "Surface Type"), ("Floor Construction", "Construction Name"),
        (zone_name, "Zone Name"), (None, "Space Name"), ("Ground", "Outside Boundary Condition"),
        (None, "Outside Boundary Condition Object"), ("NoSun", "Sun Exposure"), ("NoWind", "Wind Exposure"),
        (None, "View Factor to Ground"),
    ] + _vertex_fields(G.floor_vertices(ring2d, 0.0))))

    # Walls shared with a neighbouring footprint (semis, terraces) lose no heat:
    # the data pipeline stores those edges' midpoints in lon/lat, projected here
    # exactly like the ring itself (G.project_ring's centroid origin).
    party_mids = [(x * math.sqrt(area_scale), y * math.sqrt(area_scale))
                  for x, y in _project_like_ring(building.get("party_wall_midpoints") or [], ring)]
    n_edges = len(ring2d)
    window_count = 0
    party_walls = 0
    for i in range(n_edges):
        p0, p1 = ring2d[i], ring2d[(i + 1) % n_edges]
        width = G.edge_length(p0, p1)
        if width < 0.3:
            continue  # degenerate/near-duplicate footprint vertex
        wall_name = f"{name_base}..Wall{i}"
        mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
        is_party = any(math.hypot(mid[0] - q[0], mid[1] - q[1]) < 1.0 for q in party_mids)
        if is_party:
            party_walls += 1
            objects.append(obj("BuildingSurface:Detailed", [
                (wall_name, "Name"), ("Wall", "Surface Type"), ("Wall Construction", "Construction Name"),
                (zone_name, "Zone Name"), (None, "Space Name"), ("Adiabatic", "Outside Boundary Condition"),
                (None, "Outside Boundary Condition Object"), ("NoSun", "Sun Exposure"), ("NoWind", "Wind Exposure"),
                (None, "View Factor to Ground"),
            ] + _vertex_fields(G.wall_vertices(p0, p1, 0.0, height))))
            continue  # no windows in a party wall
        objects.append(obj("BuildingSurface:Detailed", [
            (wall_name, "Name"), ("Wall", "Surface Type"), ("Wall Construction", "Construction Name"),
            (zone_name, "Zone Name"), (None, "Space Name"), ("Outdoors", "Outside Boundary Condition"),
            (None, "Outside Boundary Condition Object"), ("SunExposed", "Sun Exposure"), ("WindExposed", "Wind Exposure"),
            (None, "View Factor to Ground"),
        ] + _vertex_fields(G.wall_vertices(p0, p1, 0.0, height))))

        win = G.window_geometry_for_wwr(width, height, wwr)
        if win is not None:
            sill, head, win_width = win
            window_count += 1
            objects.append(obj("FenestrationSurface:Detailed", [
                (f"{wall_name}_Glz", "Name"), ("Window", "Surface Type"), ("Window Construction", "Construction Name"),
                (wall_name, "Building Surface Name"), (None, "Outside Boundary Condition Object"),
                (None, "View Factor to Ground"), (None, "Frame and Divider Name"), (None, "Multiplier"),
            ] + _vertex_fields(G.window_vertices(p0, p1, sill, head, win_width))))

    # ── schedules ─────────────────────────────────────────────────────
    objects.append(obj("ScheduleTypeLimits", [("Fractional", "Name"), (0, "Lower Limit Value"), (1, "Upper Limit Value"), ("Continuous", "Numeric Type"), ("dimensionless", "Unit Type")]))
    objects.append(obj("ScheduleTypeLimits", [("Temperature", "Name"), (-273.15, "Lower Limit Value"), (None, "Upper Limit Value"), ("Continuous", "Numeric Type"), ("temperature", "Unit Type")]))
    objects.append(obj("ScheduleTypeLimits", [("Activity Level", "Name"), (0, "Lower Limit Value"), (None, "Upper Limit Value"), ("Continuous", "Numeric Type"), ("activitylevel", "Unit Type")]))
    objects.append(obj("ScheduleTypeLimits", [(f"{zone_name} Thermostat Schedule Type Limits", "Name"), (0, "Lower Limit Value"), (4, "Upper Limit Value"), ("DISCRETE", "Numeric Type")]))

    profile_name = gains["schedule"]
    pattern = _SCHEDULE_DAY_PATTERNS[profile_name]
    occ_sched = f"{profile_name.title()} Occupancy Schedule"
    light_sched = f"{profile_name.title()} Lighting Schedule"
    equip_sched = f"{profile_name.title()} Equipment Schedule"
    objects.append(_schedule_compact(occ_sched, "Fractional", pattern))
    objects.append(_schedule_compact(light_sched, "Fractional", pattern))
    objects.append(_schedule_compact(equip_sched, "Fractional", pattern))
    objects.append(_constant_schedule("Activity Level Schedule", "Activity Level", D.ACTIVITY_LEVEL_W_PER_PERSON))
    objects.append(_constant_schedule("Always On Schedule", "Fractional", 1))
    if uk_home:
        objects.append(_schedule_compact_week(f"{zone_name} Heating Setpoint Schedule", "Temperature",
                                              D.UK_SAP_WEEKDAY_HEATING, D.UK_SAP_WEEKEND_HEATING))
    else:
        objects.append(_constant_schedule(f"{zone_name} Heating Setpoint Schedule", "Temperature", D.HEATING_SETPOINT_C))
    objects.append(_constant_schedule(f"{zone_name} Cooling Setpoint Schedule", "Temperature", D.COOLING_SETPOINT_C))
    objects.append(_constant_schedule(f"{zone_name} Thermostat Schedule", f"{zone_name} Thermostat Schedule Type Limits", 4))

    # ── internal gains (scaled to total floor area, all storeys) ─────
    objects.append(obj("People", [
        (f"{zone_name} People", "Name"), (zone_name, "Zone or ZoneList or Space or SpaceList Name"),
        (occ_sched, "Number of People Schedule Name"), ("People", "Number of People Calculation Method"),
        (round(total_floor_area / gains["m2_per_person"], 2), "Number of People"),
        (None, "People per Floor Area {person/m2}"), (None, "Floor Area per Person {m2/person}"),
        (0.3, "Fraction Radiant"), (None, "Sensible Heat Fraction"), ("Activity Level Schedule", "Activity Level Schedule Name"),
    ]))
    objects.append(obj("Lights", [
        (f"{zone_name} Lights", "Name"), (zone_name, "Zone or ZoneList or Space or SpaceList Name"),
        (light_sched, "Schedule Name"), ("LightingLevel", "Design Level Calculation Method"),
        (round(gains["lighting_w_m2"] * total_floor_area, 1), "Lighting Level {W}"),
        (None, "Watts per Zone Floor Area {W/m2}"), (None, "Watts per Person {W/person}"),
        (0, "Return Air Fraction"), (0.42, "Fraction Radiant"), (0.18, "Fraction Visible"), (1, "Fraction Replaceable"),
        ("General", "End-Use Subcategory"),
    ]))
    objects.append(obj("ElectricEquipment", [
        (f"{zone_name} Equipment", "Name"), (zone_name, "Zone or ZoneList or Space or SpaceList Name"),
        (equip_sched, "Schedule Name"), ("EquipmentLevel", "Design Level Calculation Method"),
        (round(gains["equipment_w_m2"] * total_floor_area, 1), "Design Level {W}"),
        (None, "Watts per Zone Floor Area {W/m2}"), (None, "Watts per Person {W/person}"),
        (0, "Fraction Latent"), (0.2, "Fraction Radiant"), (0, "Fraction Lost"), ("Electric Equipment", "End-Use Subcategory"),
    ]))
    objects.append(obj("ZoneInfiltration:DesignFlowRate", [
        (f"{zone_name} Infiltration", "Name"), (zone_name, "Zone or ZoneList or Space or SpaceList Name"),
        ("Always On Schedule", "Schedule Name"), ("AirChanges/Hour", "Design Flow Rate Calculation Method"),
        (None, "Design Flow Rate {m3/s}"), (None, "Flow per Zone Floor Area {m3/s-m2}"),
        (None, "Flow per Exterior Surface Area {m3/s-m2}"), (D.UK_INFILTRATION_ACH if uk_home else D.INFILTRATION_ACH, "Air Changes per Hour"),
        (1, "Constant Term Coefficient"), (0, "Temperature Term Coefficient"),
        (0, "Velocity Term Coefficient"), (0, "Velocity Squared Term Coefficient"),
    ]))

    # ── domestic hot water ──────────────────────────────────────────
    # A stand-alone WaterHeater:Mixed (use-side node names left blank) is the
    # documented way to model DHW without building a plant loop, and its fuel
    # lands on the "Water Systems" end use - the one EPSM reports but that was
    # always 0.0 here, because nothing in the shoebox drew hot water.
    # Efficiency 1.0 and zero standby loss are deliberate: the Sveby intensity
    # is already a DELIVERED figure including circulation losses, so adding
    # tank losses or a boiler efficiency on top would double-count.
    # UK: hot water is left out for now (Sveby intensities are Swedish); totals
    # and the metered-gas check compare space heating only.
    dhw_kwh_m2 = 0.0 if (country or "").lower() == "gb" else D.DHW_KWH_M2_YR_BY_USE.get(use_cat or "", D.DEFAULT_DHW_KWH_M2_YR)
    dhw_annual_kwh = dhw_kwh_m2 * total_floor_area
    if dhw_annual_kwh > 0:
        dhw_peak_flow = _dhw_peak_flow_m3_s(dhw_annual_kwh, D.DHW_DAY_PATTERN)
        # Capacity to meet the peak draw instantaneously, doubled so a cold
        # tank at the start of a peak still recovers rather than clipping the
        # draw (a capacity-limited heater would silently under-deliver).
        delta_t = D.DHW_SUPPLY_TEMP_C - D.DHW_COLD_TEMP_C
        dhw_peak_w = dhw_peak_flow * D.WATER_DENSITY_KG_M3 * D.WATER_SPECIFIC_HEAT_J_KGK * delta_t
        objects.append(_schedule_compact("DHW Draw Schedule", "Fractional", D.DHW_DAY_PATTERN))
        objects.append(_constant_schedule("DHW Setpoint Schedule", "Temperature", D.DHW_SUPPLY_TEMP_C))
        objects.append(_constant_schedule("DHW Cold Water Schedule", "Temperature", D.DHW_COLD_TEMP_C))
        objects.append(_constant_schedule("DHW Ambient Schedule", "Temperature", 20.0))
        objects.append(obj("WaterHeater:Mixed", [
            (f"{zone_name} DHW", "Name"), (0.3, "Tank Volume {m3}"),
            ("DHW Setpoint Schedule", "Setpoint Temperature Schedule Name"),
            (D.DHW_DEADBAND_K, "Deadband Temperature Difference {deltaC}"),
            (82.2, "Maximum Temperature Limit {C}"), ("Cycle", "Heater Control Type"),
            (round(max(dhw_peak_w * 2.0, 1000.0), 1), "Heater Maximum Capacity {W}"),
            (0, "Heater Minimum Capacity {W}"), (None, "Heater Ignition Minimum Flow Rate {m3/s}"),
            (None, "Heater Ignition Delay {s}"),
            ("DistrictHeatingWater", "Heater Fuel Type"), (1.0, "Heater Thermal Efficiency"),
            (None, "Part Load Factor Curve Name"),
            (0, "Off Cycle Parasitic Fuel Consumption Rate {W}"), (None, "Off Cycle Parasitic Fuel Type"),
            (0, "Off Cycle Parasitic Heat Fraction to Tank"),
            (0, "On Cycle Parasitic Fuel Consumption Rate {W}"), (None, "On Cycle Parasitic Fuel Type"),
            (0, "On Cycle Parasitic Heat Fraction to Tank"),
            ("Schedule", "Ambient Temperature Indicator"),
            ("DHW Ambient Schedule", "Ambient Temperature Schedule Name"),
            (None, "Ambient Temperature Zone Name"), (None, "Ambient Temperature Outdoor Air Node Name"),
            (0, "Off Cycle Loss Coefficient to Ambient Temperature {W/K}"),
            (None, "Off Cycle Loss Fraction to Zone"),
            (0, "On Cycle Loss Coefficient to Ambient Temperature {W/K}"),
            (None, "On Cycle Loss Fraction to Zone"),
            (round(dhw_peak_flow, 10), "Peak Use Flow Rate {m3/s}"),
            ("DHW Draw Schedule", "Use Flow Rate Fraction Schedule Name"),
            ("DHW Cold Water Schedule", "Cold Water Supply Temperature Schedule Name"),
            (None, "Use Side Inlet Node Name"), (None, "Use Side Outlet Node Name"),
            (1.0, "Use Side Effectiveness"),
            (None, "Source Side Inlet Node Name"), (None, "Source Side Outlet Node Name"),
            (1.0, "Source Side Effectiveness"),
            (None, "Use Side Design Flow Rate {m3/s}"), (None, "Source Side Design Flow Rate {m3/s}"),
            (None, "Indirect Water Heating Recovery Time {hr}"),
            (None, "Source Side Flow Control Mode"),
            (None, "Indirect Alternate Setpoint Temperature Schedule Name"),
            ("Domestic Hot Water", "End-Use Subcategory"),
        ]))

    if gas_boiler:
        # Explicit argument > the certificates' heating rating (tools/uk/anchor_epc_uprn.py) > default.
        objects.extend(_gas_boiler_objects(zone_name, boiler_efficiency or building.get("boiler_efficiency_epc")
                                           or D.UK_BOILER_EFFICIENCY))
    else:
        objects.extend(_ideal_loads_objects(zone_name))

    # ── output (verbatim block, see defaults.OUTPUT_VARIABLE_NAMES) ──
    for var_name in D.OUTPUT_VARIABLE_NAMES + (D.GAS_BOILER_OUTPUT_VARIABLES if gas_boiler else []):
        objects.append(obj("Output:Variable", [(None, "Key Value"), (var_name, "Variable Name"), ("Hourly", "Reporting Frequency")]))
    objects.append(obj("Output:VariableDictionary", [("IDF", "Key Field"), ("Unsorted", "Sort Option")]))
    objects.append(obj("OutputControl:Table:Style", [("HTML", "Column Separator"), ("JtoKWH", "Unit Conversion")]))
    objects.append(obj("Output:Table:SummaryReports", [("AllSummary", "Report 1 Name")]))
    objects.append(obj("Output:SQLite", [("SimpleAndTabular", "Option Type"), ("JtoKWH", "Unit Conversion for Tabular Data")]))

    template = _TEMPLATE_ENV.get_template("shoebox.idf.j2")
    meta = {
        "building_name": name_base, "country": country, "city_id": city_id,
        "floors": floors, "footprint_m2": round(footprint_m2, 1), "total_floor_area_m2": round(total_floor_area, 1),
        "height_m": height, "use_cat": use_cat, "wwr": round(wwr, 3), "window_count": window_count,
        "u_wall": round(u_wall, 3), "u_roof": round(u_roof, 3), "u_win": round(u_win, 3),
        "dhw_kwh_m2_yr": dhw_kwh_m2,
        "party_walls": party_walls,
        "heating_schedule": "SAP 10.2 intermittent" if uk_home else f"continuous {D.HEATING_SETPOINT_C} C",
        "fabric_source": "epc_description" if building.get("u_wall_epc") else "tabula_or_default",
        "heating_system": heating_system,
        "heated_area_m2": round(total_floor_area, 1),
        "footprint_area_scale": round(area_scale, 3),
    }
    return template.render(meta=meta, objects=objects)


def _ideal_loads_objects(zone_name: str) -> list[str]:
    """Ideal loads: meets the zone load exactly at 100% efficiency (reported
    under EnergyPlus's DistrictHeatingWater meter)."""
    objects: list[str] = []
    # ── ideal-loads HVAC ────────────────────────────────────────────
    supply_node = f"{zone_name} Supply Node"
    exhaust_node = f"{zone_name} Exhaust Node"
    air_node = f"{zone_name} Air Node"
    equip_list = f"{zone_name} Equipment List"
    ideal_loads = f"{zone_name} Ideal Loads Air System"
    inlet_list = f"{zone_name} Inlet Node List"
    exhaust_list = f"{zone_name} Exhaust Node List"

    objects.append(obj("ZoneControl:Thermostat", [
        (f"{zone_name} Thermostat", "Name"), (zone_name, "Zone or ZoneList Name"),
        (f"{zone_name} Thermostat Schedule", "Control Type Schedule Name"),
        ("ThermostatSetpoint:DualSetpoint", "Control 1 Object Type"), (f"{zone_name} Setpoints", "Control 1 Name"),
        (None, "Control 2 Object Type"), (None, "Control 2 Name"), (None, "Control 3 Object Type"),
        (None, "Control 3 Name"), (None, "Control 4 Object Type"), (None, "Control 4 Name"),
        (0, "Temperature Difference Between Cutout And Setpoint {deltaC}"),
    ]))
    objects.append(obj("ThermostatSetpoint:DualSetpoint", [
        (f"{zone_name} Setpoints", "Name"),
        (f"{zone_name} Heating Setpoint Schedule", "Heating Setpoint Temperature Schedule Name"),
        (f"{zone_name} Cooling Setpoint Schedule", "Cooling Setpoint Temperature Schedule Name"),
    ]))
    objects.append(obj("ZoneHVAC:IdealLoadsAirSystem", [
        (ideal_loads, "Name"), (None, "Availability Schedule Name"), (supply_node, "Zone Supply Air Node Name"),
        (exhaust_node, "Zone Exhaust Air Node Name"), (None, "System Inlet Air Node Name"),
        (50, "Maximum Heating Supply Air Temperature {C}"), (13, "Minimum Cooling Supply Air Temperature {C}"),
        (None, "Maximum Heating Supply Air Humidity Ratio {kgWater/kgDryAir}"),
        (None, "Minimum Cooling Supply Air Humidity Ratio {kgWater/kgDryAir}"),
        ("NoLimit", "Heating Limit"), (None, "Maximum Heating Air Flow Rate {m3/s}"), (None, "Maximum Sensible Heating Capacity {W}"),
        ("NoLimit", "Cooling Limit"), (None, "Maximum Cooling Air Flow Rate {m3/s}"), (None, "Maximum Total Cooling Capacity {W}"),
        (None, "Heating Availability Schedule Name"), (None, "Cooling Availability Schedule Name"),
        ("None", "Dehumidification Control Type"), (None, "Cooling Sensible Heat Ratio {dimensionless}"),
        ("None", "Humidification Control Type"), (None, "Design Specification Outdoor Air Object Name"),
        (None, "Outdoor Air Inlet Node Name"), ("None", "Demand Controlled Ventilation Type"),
        ("NoEconomizer", "Outdoor Air Economizer Type"), (None, "Heat Recovery Type"),
        (0, "Sensible Heat Recovery Effectiveness {dimensionless}"), (0, "Latent Heat Recovery Effectiveness {dimensionless}"),
    ]))
    objects.append(obj("ZoneHVAC:EquipmentList", [
        (equip_list, "Name"), ("SequentialLoad", "Load Distribution Scheme"),
        ("ZoneHVAC:IdealLoadsAirSystem", "Zone Equipment 1 Object Type"), (ideal_loads, "Zone Equipment 1 Name"),
        (1, "Zone Equipment 1 Cooling Sequence"), (1, "Zone Equipment 1 Heating or No-Load Sequence"),
        (None, "Zone Equipment 1 Sequential Cooling Fraction Schedule Name"),
        (None, "Zone Equipment 1 Sequential Heating Fraction Schedule Name"),
    ]))
    objects.append(obj("ZoneHVAC:EquipmentConnections", [
        (zone_name, "Zone Name"), (equip_list, "Zone Conditioning Equipment List Name"),
        (inlet_list, "Zone Air Inlet Node or NodeList Name"), (exhaust_list, "Zone Air Exhaust Node or NodeList Name"),
        (air_node, "Zone Air Node Name"),
    ]))
    objects.append(obj("NodeList", [(inlet_list, "Name"), (supply_node, "Node 1 Name")]))
    objects.append(obj("NodeList", [(exhaust_list, "Name"), (exhaust_node, "Node 1 Name")]))
    return objects


def _gas_boiler_objects(zone_name: str, efficiency: float) -> list[str]:
    """Wet central heating: a natural-gas hot-water boiler feeding radiators
    (hot-water baseboards) on a pumped loop, via HVACTemplate objects that
    EnergyPlus's ExpandObjects turns into the full plant (EPSM runs with
    --expandobjects). Capacities and flows autosize on the weather file's
    winter/summer extreme weeks. Gas and delivered heat are reported hourly
    (D.GAS_BOILER_OUTPUT_VARIABLES) because EPSM's end-use table parser keeps
    only electricity and district heating."""
    thermostat = f"{zone_name} Template Thermostat"
    return [
        obj("SizingPeriod:WeatherFileConditionType", [
            ("Winter Extreme", "Name"), ("WinterExtreme", "Period Selection"), ("Monday", "Day of Week for Start Day"),
            ("Yes", "Use Weather File Daylight Saving Period"), ("Yes", "Use Weather File Rain and Snow Indicators"),
        ]),
        obj("SizingPeriod:WeatherFileConditionType", [
            ("Summer Extreme", "Name"), ("SummerExtreme", "Period Selection"), ("Monday", "Day of Week for Start Day"),
            ("Yes", "Use Weather File Daylight Saving Period"), ("Yes", "Use Weather File Rain and Snow Indicators"),
        ]),
        obj("HVACTemplate:Thermostat", [
            (thermostat, "Name"), (f"{zone_name} Heating Setpoint Schedule", "Heating Setpoint Schedule Name"),
            (None, "Constant Heating Setpoint {C}"), (f"{zone_name} Cooling Setpoint Schedule", "Cooling Setpoint Schedule Name"),
            (None, "Constant Cooling Setpoint {C}"),
        ]),
        obj("HVACTemplate:Zone:BaseboardHeat", [
            (zone_name, "Zone Name"), (thermostat, "Template Thermostat Name"), (1.25, "Zone Heating Sizing Factor"),
            ("HotWater", "Baseboard Heating Type"), (None, "Baseboard Heating Availability Schedule Name"),
            ("autosize", "Baseboard Heating Capacity {W}"), (None, "Dedicated Outdoor Air System Name"),
            # Fresh air already enters as infiltration; no separate ventilation.
            ("Flow/Zone", "Outdoor Air Method"), (0, "Outdoor Air Flow Rate per Person {m3/s}"),
            (0, "Outdoor Air Flow Rate per Zone Floor Area {m3/s-m2}"), (0, "Outdoor Air Flow Rate per Zone {m3/s}"),
        ]),
        obj("HVACTemplate:Plant:HotWaterLoop", [
            (f"{zone_name} Hot Water Loop", "Name"), (None, "Pump Schedule Name"), ("Intermittent", "Pump Control Type"),
            ("Default", "Hot Water Plant Operation Scheme Type"), (None, "Hot Water Plant Equipment Operation Schemes Name"),
            (None, "Hot Water Setpoint Schedule Name"), (70, "Hot Water Design Setpoint {C}"),
            ("ConstantFlow", "Hot Water Pump Configuration"),
        ]),
        obj("HVACTemplate:Plant:Boiler", [
            (f"{zone_name} Gas Boiler", "Name"), ("HotWaterBoiler", "Boiler Type"), ("autosize", "Capacity {W}"),
            (round(efficiency, 3), "Efficiency"), ("NaturalGas", "Fuel Type"), (None, "Priority"),
            (1.2, "Sizing Factor"), (None, "Minimum Part Load Ratio"), (None, "Maximum Part Load Ratio"),
            (None, "Optimum Part Load Ratio"), (None, "Water Outlet Upper Temperature Limit {C}"),
            ("HotWater", "Template Plant Loop Type"),
        ]),
    ]
