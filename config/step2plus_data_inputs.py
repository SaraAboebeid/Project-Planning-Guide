"""
Step 2+ Data Inputs Configuration

Project-type-driven data inputs for the Step 1+ pipeline.
Each system has its own set of required data inputs, and items are
filtered based on the user's selections in Step 1+.

For Energy Community Planning the data inputs depend on:
  - Which systems are in scope
  - Whether PV / battery are already installed (existing vs planned)
  - The energy focus (Electricity / Heating / Cooling / All)

For Renewable Energy Planning the data inputs depend on:
  - Which PV types are selected (Rooftop, Community, Facade)
  - Whether battery storage is included
"""

# ============================================================================
# ENERGY COMMUNITY PLANNING  — data inputs by system
# ============================================================================

EC_BUILDING_INPUTS = {
    # ── Core geometry (shared across all focuses) ────────────────────
    "geometry": {
        "category": "Building — Geometry",
        "focus": ["Electricity", "Heating", "Cooling"],
        "items": [
            {
                "key": "ec_footprint",
                "label": "Building footprint dimensions",
                "recommended_source": "Architectural drawing",
                "proxy_options": [],
            },
            {
                "key": "ec_height",
                "label": "Building height",
                "recommended_source": "Architectural drawing",
                "proxy_options": [],
            },
            {
                "key": "ec_orientation",
                "label": "Building orientation",
                "recommended_source": "Site plan / GIS",
                "proxy_options": ["Google Earth", "OpenStreetMap"],
                "focus_filter": ["Heating", "Cooling"],
            },
            {
                "key": "ec_num_floors",
                "label": "Number of floors",
                "recommended_source": "Architectural drawing",
                "proxy_options": [],
                "focus_filter": ["Heating", "Cooling"],
            },
            {
                "key": "ec_building_use",
                "label": "Building use",
                "recommended_source": "Project brief",
                "proxy_options": [],
                "focus_filter": ["Electricity"],
            },
        ],
    },
    # ── Envelope (heating / cooling only) ────────────────────────────
    "envelope": {
        "category": "Building — Envelope",
        "focus": ["Heating", "Cooling"],
        "items": [
            {
                "key": "ec_u_values",
                "label": "U-values (walls, roof, floor, windows)",
                "recommended_source": "Building survey / EPC",
                "proxy_options": ["Energy Performance Certificate"],
            },
            {
                "key": "ec_wwr",
                "label": "Window-to-wall ratio",
                "recommended_source": "Architectural drawing",
                "proxy_options": ["Google Street View"],
            },
        ],
    },
    # ── Energy systems (heating / cooling only) ──────────────────────
    "energy_systems": {
        "category": "Building — Energy Systems",
        "focus": ["Heating", "Cooling"],
        "items": [
            {
                "key": "ec_hvac_type",
                "label": "HVAC type",
                "recommended_source": "Building survey",
                "proxy_options": [],
            },
        ],
    },
    # ── Occupancy (electricity, non-residential only) ────────────────
    "occupancy": {
        "category": "Building — Occupancy",
        "focus": ["Electricity"],
        "non_residential_only": True,
        "items": [
            {
                "key": "ec_occupancy_schedule",
                "label": "Occupancy schedules",
                "recommended_source": "Building manager",
                "proxy_options": [],
            },
        ],
    },
    # ── Demand profiles ──────────────────────────────────────────────
    "demand": {
        "category": "Building — Demand",
        "focus": ["Electricity", "Heating", "Cooling"],
        "items": [
            {
                "key": "ec_electricity_demand",
                "label": "Electricity demand",
                "recommended_source": "Smart meter / BMS",
                "proxy_options": [],
                "focus_filter": ["Electricity"],
                "temporal_resolution": True,
            },
            {
                "key": "ec_heating_demand",
                "label": "Heating demand",
                "recommended_source": "BMS / simulation",
                "proxy_options": [],
                "focus_filter": ["Heating"],
                "temporal_resolution": True,
            },
            {
                "key": "ec_cooling_demand",
                "label": "Cooling demand",
                "recommended_source": "BMS / simulation",
                "proxy_options": [],
                "focus_filter": ["Cooling"],
                "temporal_resolution": True,
            },
        ],
    },
}

EC_ROOFTOP_PV_INPUTS = {
    "geometry": {
        "category": "Rooftop PV — Geometry",
        "items": [
            {
                "key": "ec_rpv_roof_area",
                "label": "Available roof area",
                "recommended_source": "Architectural drawing / LiDAR",
                "proxy_options": ["Lantmäteriet database", "Google Earth"],
            },
            {
                "key": "ec_rpv_tilt",
                "label": "Roof tilt angle",
                "recommended_source": "Architectural drawing",
                "proxy_options": ["Laser data from Lantmäteriet", "Google Street View"],
            },
            {
                "key": "ec_rpv_azimuth",
                "label": "Roof azimuth / orientation",
                "recommended_source": "Site plan",
                "proxy_options": ["Google Earth", "OpenStreetMap"],
            },
        ],
    },
    "measured": {
        "category": "Rooftop PV — Measured Production",
        "existing_only": True,
        "items": [
            {
                "key": "ec_rpv_annual_prod",
                "label": "Annual PV production (kWh)",
                "recommended_source": "Inverter monitoring / meter",
                "proxy_options": [],
            },
            {
                "key": "ec_rpv_hourly_prod",
                "label": "Hourly production profile",
                "recommended_source": "Inverter monitoring system",
                "proxy_options": [],
            },
        ],
    },
}

EC_FACADE_PV_INPUTS = {
    "geometry": {
        "category": "Facade PV (BIPV) — Geometry",
        "items": [
            {
                "key": "ec_fpv_facade_area",
                "label": "Façade area",
                "recommended_source": "Architectural drawing",
                "proxy_options": ["Google Street View"],
            },
            {
                "key": "ec_fpv_wwr",
                "label": "Window-to-wall ratio",
                "recommended_source": "Architectural drawing",
                "proxy_options": ["Google Street View"],
            },
            {
                "key": "ec_fpv_orientation",
                "label": "Façade orientation",
                "recommended_source": "Site plan / GIS",
                "proxy_options": ["Google Earth", "OpenStreetMap"],
            },
        ],
    },
    "measured": {
        "category": "Facade PV (BIPV) — Measured Production",
        "existing_only": True,
        "items": [
            {
                "key": "ec_fpv_annual_prod",
                "label": "Annual PV production (kWh)",
                "recommended_source": "Inverter monitoring / meter",
                "proxy_options": [],
            },
        ],
    },
}

EC_COMMUNITY_PV_INPUTS = {
    "site": {
        "category": "Community PV — Site",
        "items": [
            {
                "key": "ec_cpv_land_area",
                "label": "Available land area",
                "recommended_source": "Site plan / cadastral data",
                "proxy_options": ["Lantmäteriet database", "Google Earth"],
            },
            {
                "key": "ec_cpv_slope",
                "label": "Ground slope",
                "recommended_source": "Topographic survey",
                "proxy_options": ["Laser data from Lantmäteriet"],
            },
            {
                "key": "ec_cpv_orientation",
                "label": "Site orientation",
                "recommended_source": "Site plan",
                "proxy_options": ["Google Earth", "OpenStreetMap"],
            },
        ],
    },
    "technology": {
        "category": "Community PV — Technology",
        "items": [
            {
                "key": "ec_cpv_module_eff",
                "label": "Module efficiency",
                "recommended_source": "Module datasheet",
                "proxy_options": [],
            },
            {
                "key": "ec_cpv_inverter_size",
                "label": "Inverter size / capacity",
                "recommended_source": "System design",
                "proxy_options": [],
            },
        ],
    },
    "grid_connection": {
        "category": "Community PV — Grid Connection",
        "items": [
            {
                "key": "ec_cpv_export_limit",
                "label": "Export limit",
                "recommended_source": "Grid connection agreement",
                "proxy_options": [],
            },
        ],
    },
    "measured": {
        "category": "Community PV — Measured Production",
        "existing_only": True,
        "items": [
            {
                "key": "ec_cpv_annual_prod",
                "label": "Annual PV production (kWh)",
                "recommended_source": "Monitoring system",
                "proxy_options": [],
            },
        ],
    },
}

EC_BATTERY_INPUTS = {
    "planning": {
        "category": "Battery Storage — Planning",
        "items": [
            {
                "key": "ec_bat_location",
                "label": "Do you have the available area?",
                "type": "yes_no",
                "recommended_source": "Site plan",
                "proxy_options": [],
            },
            {
                "key": "ec_bat_priority",
                "label": "Priority",
                "type": "select",
                "options": ["Self-consumption", "Peak shaving"],
                "recommended_source": "Project brief",
                "proxy_options": [],
            },
        ],
    },
    "measured": {
        "category": "Battery Storage — Measured Performance",
        "existing_only": True,
        "items": [
            {
                "key": "ec_bat_measured_cycles",
                "label": "Measured cycle count / throughput",
                "recommended_source": "BMS monitoring",
                "proxy_options": [],
            },
            {
                "key": "ec_bat_measured_soh",
                "label": "State of Health (%)",
                "recommended_source": "BMS monitoring",
                "proxy_options": [],
            },
        ],
    },
}

EC_EV_CHARGING_INPUTS = {
    "infrastructure": {
        "category": "EV Charging — Infrastructure",
        "items": [
            {
                "key": "ec_ev_parking_spaces",
                "label": "Number of parking spaces",
                "recommended_source": "Site plan",
                "proxy_options": [],
            },
            {
                "key": "ec_ev_num_chargers",
                "label": "Number of charging points",
                "recommended_source": "Site plan / procurement",
                "proxy_options": [],
            },
            {
                "key": "ec_ev_charger_type",
                "label": "Charger type",
                "recommended_source": "Charger specifications",
                "proxy_options": [],
            },
            {
                "key": "ec_ev_location",
                "label": "Location",
                "recommended_source": "Site plan",
                "proxy_options": [],
            },
            {
                "key": "ec_ev_capacity",
                "label": "Capacity (kW)",
                "recommended_source": "Charger specifications",
                "proxy_options": [],
            },
        ],
    },
}

EC_V2G_INPUTS = {
    "fleet": {
        "category": "V2G — Fleet",
        "items": [
            {
                "key": "ec_v2g_num_ev",
                "label": "Number of EVs",
                "recommended_source": "Fleet manager",
                "proxy_options": [],
            },
            {
                "key": "ec_v2g_export_allowed",
                "label": "Is V2G export allowed?",
                "type": "yes_no",
                "recommended_source": "Grid operator / contract",
                "proxy_options": [],
            },
        ],
    },
}

EC_GRID_INPUTS = {
    "pricing": {
        "category": "Energy Prices",
        "items": [
            {
                "key": "ec_pricing_structure",
                "label": "Electricity pricing structure",
                "type": "select",
                "options": ["Variable pricing", "Fixed pricing"],
                "recommended_source": "Utility contract",
                "proxy_options": [],
            },
        ],
    },
}


# ============================================================================
# RENEWABLE ENERGY PLANNING  — data inputs by system
# ============================================================================

RE_ROOFTOP_PV_INPUTS = {
    "demand": {
        "category": "Rooftop PV — Electricity Demand",
        "items": [
            {
                "key": "re_rpv_annual_demand",
                "label": "Annual electricity consumption (kWh/year)",
                "recommended_source": "Electricity bills / utility records",
                "proxy_options": ["SCB / Energimyndigheten benchmarks"],
            },
            {
                "key": "re_rpv_demand_target",
                "label": "Target share of demand to cover with PV (%)",
                "recommended_source": "Stakeholder goal / feasibility study",
                "proxy_options": [],
            },
            {
                "key": "re_rpv_tariff",
                "label": "Current electricity price (SEK/kWh or €/kWh)",
                "recommended_source": "Electricity bill / utility contract",
                "proxy_options": ["Elpriskollen", "Nordpool spot price"],
            },
        ],
    },
    "site": {
        "category": "Rooftop PV — Roof & Site",
        "items": [
            {
                "key": "re_rpv_location",
                "label": "Building address / location",
                "recommended_source": "Property records",
                "proxy_options": ["Google Maps"],
            },
            {
                "key": "re_rpv_roof_area",
                "label": "Available roof area (m²)",
                "recommended_source": "Architectural drawing / LiDAR",
                "proxy_options": ["Lantmäteriet database", "Google Earth"],
            },
            {
                "key": "re_rpv_tilt",
                "label": "Roof tilt angle",
                "recommended_source": "Architectural drawing",
                "proxy_options": ["Laser data from Lantmäteriet", "Google Street View"],
            },
            {
                "key": "re_rpv_azimuth",
                "label": "Roof orientation (azimuth)",
                "recommended_source": "Site plan",
                "proxy_options": ["Google Earth", "OpenStreetMap"],
            },
            {
                "key": "re_rpv_shading",
                "label": "Shading context (nearby trees, buildings, chimneys)",
                "recommended_source": "Site visit / photos",
                "proxy_options": ["Google Street View"],
            },
            {
                "key": "re_rpv_roof_condition",
                "label": "Roof material and condition",
                "recommended_source": "Building inspection report",
                "proxy_options": ["Owner knowledge / photos"],
            },
        ],
    },
    "grid": {
        "category": "Rooftop PV — Grid Connection",
        "items": [
            {
                "key": "re_rpv_grid_export",
                "label": "Is grid export (selling surplus) allowed?",
                "type": "yes_no",
                "recommended_source": "Grid operator / utility contract",
                "proxy_options": [],
            },
            {
                "key": "re_rpv_feed_in_tariff",
                "label": "Feed-in tariff or compensation for exported electricity",
                "recommended_source": "Utility contract / grid operator",
                "proxy_options": ["Energimarknadsinspektionen"],
            },
        ],
    },
}

RE_FACADE_PV_INPUTS = {
    "demand": {
        "category": "Facade PV (BIPV) — Energy Demand",
        "items": [
            {
                "key": "re_fpv_annual_demand",
                "label": "Annual electricity consumption (kWh/year)",
                "recommended_source": "Electricity bills / utility records",
                "proxy_options": ["SCB / Energimyndigheten benchmarks"],
            },
            {
                "key": "re_fpv_demand_target",
                "label": "Target share of demand to cover with façade PV (%)",
                "recommended_source": "Stakeholder goal / feasibility study",
                "proxy_options": [],
            },
            {
                "key": "re_fpv_tariff",
                "label": "Current electricity price (SEK/kWh or €/kWh)",
                "recommended_source": "Electricity bill / utility contract",
                "proxy_options": ["Elpriskollen", "Nordpool spot price"],
            },
        ],
    },
    "facade": {
        "category": "Facade PV (BIPV) — Façade & Site",
        "items": [
            {
                "key": "re_fpv_location",
                "label": "Building address / location",
                "recommended_source": "Property records",
                "proxy_options": ["Google Maps"],
            },
            {
                "key": "re_fpv_facade_area",
                "label": "Available façade area (m²)",
                "recommended_source": "Architectural drawing",
                "proxy_options": ["Google Street View"],
            },
            {
                "key": "re_fpv_wwr",
                "label": "Window-to-wall ratio",
                "recommended_source": "Architectural drawing",
                "proxy_options": ["Google Street View"],
            },
            {
                "key": "re_fpv_orientation",
                "label": "Façade orientation(s) (N/S/E/W)",
                "recommended_source": "Site plan / architectural drawing",
                "proxy_options": ["Google Earth", "OpenStreetMap"],
            },
            {
                "key": "re_fpv_shading",
                "label": "Shading context (nearby buildings, vegetation)",
                "recommended_source": "Site visit / photos",
                "proxy_options": ["Google Street View"],
            },
            {
                "key": "re_fpv_facade_condition",
                "label": "Façade material and condition",
                "recommended_source": "Building inspection report",
                "proxy_options": ["Owner knowledge / photos"],
            },
        ],
    },
    "grid": {
        "category": "Facade PV (BIPV) — Grid Connection",
        "items": [
            {
                "key": "re_fpv_grid_export",
                "label": "Is grid export (selling surplus) allowed?",
                "type": "yes_no",
                "recommended_source": "Grid operator / utility contract",
                "proxy_options": [],
            },
            {
                "key": "re_fpv_feed_in_tariff",
                "label": "Feed-in tariff or compensation for exported electricity",
                "recommended_source": "Utility contract / grid operator",
                "proxy_options": ["Energimarknadsinspektionen"],
            },
        ],
    },
}

RE_COMMUNITY_PV_INPUTS = {
    "site": {
        "category": "Community PV — Site Information",
        "items": [
            {
                "key": "re_cpv_location",
                "label": "Site address / location",
                "recommended_source": "Property records / cadastral data",
                "proxy_options": ["Google Maps", "Lantmäteriet database"],
            },
            {
                "key": "re_cpv_land_area",
                "label": "Available site area (m²)",
                "recommended_source": "Site plan / cadastral data",
                "proxy_options": ["Lantmäteriet database", "Google Earth"],
            },
            {
                "key": "re_cpv_slope",
                "label": "Ground slope / terrain type",
                "recommended_source": "Topographic survey",
                "proxy_options": ["Laser data from Lantmäteriet"],
            },
            {
                "key": "re_cpv_orientation",
                "label": "Site orientation (compass direction of main slope)",
                "recommended_source": "Site plan",
                "proxy_options": ["Google Earth", "OpenStreetMap"],
            },
            {
                "key": "re_cpv_land_ownership",
                "label": "Land ownership type (owned / leased / municipal)",
                "recommended_source": "Land registry / property records",
                "proxy_options": ["Lantmäteriet database"],
            },
        ],
    },
    "infrastructure": {
        "category": "Community PV — Existing Infrastructure",
        "items": [
            {
                "key": "re_cpv_existing_infra",
                "label": "Existing infrastructure on site (roads, utilities, structures)",
                "recommended_source": "Site survey / developer records",
                "proxy_options": ["Google Earth", "Google Street View"],
            },
            {
                "key": "re_cpv_grid_connection",
                "label": "Is a grid connection available at or near the site?",
                "type": "yes_no",
                "recommended_source": "Grid operator / utility",
                "proxy_options": [],
            },
            {
                "key": "re_cpv_grid_distance",
                "label": "Distance to nearest grid connection point",
                "recommended_source": "Grid operator",
                "proxy_options": [],
            },
            {
                "key": "re_cpv_grid_capacity",
                "label": "Available grid capacity for feed-in",
                "recommended_source": "Grid operator",
                "proxy_options": [],
            },
        ],
    },
    "demand": {
        "category": "Community PV — Demand & Offtake",
        "items": [
            {
                "key": "re_cpv_num_participants",
                "label": "Number of participating households / buildings",
                "recommended_source": "Community agreement / feasibility study",
                "proxy_options": [],
            },
            {
                "key": "re_cpv_total_demand",
                "label": "Total annual electricity demand of participants (kWh/year)",
                "recommended_source": "Electricity bills / utility records",
                "proxy_options": ["SCB / Energimyndigheten benchmarks"],
            },
        ],
    },
}

RE_BATTERY_INPUTS = {
    "location": {
        "category": "Battery Storage — Installation",
        "items": [
            {
                "key": "re_bat_location",
                "label": "Planned installation location (indoor / outdoor / basement)",
                "recommended_source": "Site survey / building plans",
                "proxy_options": ["Owner knowledge"],
            },
            {
                "key": "re_bat_space",
                "label": "Available space for battery installation (m²)",
                "recommended_source": "Architectural drawing / site visit",
                "proxy_options": ["Owner measurement"],
            },
        ],
    },
    "purpose": {
        "category": "Battery Storage — Purpose & Usage",
        "items": [
            {
                "key": "re_bat_priority",
                "label": "Primary purpose of battery",
                "type": "select",
                "options": [
                    "Maximise self-consumption",
                    "Peak shaving",
                    "Backup power",
                ],
                "recommended_source": "Stakeholder goal",
                "proxy_options": [],
            },
            {
                "key": "re_bat_grid_export",
                "label": "Will the battery be used for grid export?",
                "type": "yes_no",
                "recommended_source": "Grid operator / utility contract",
                "proxy_options": [],
            },
        ],
    },
    "demand": {
        "category": "Battery Storage — Demand Context",
        "items": [
            {
                "key": "re_bat_daily_consumption",
                "label": "Average daily electricity consumption (kWh/day)",
                "recommended_source": "Electricity bills / smart meter data",
                "proxy_options": ["SCB / Energimyndigheten benchmarks"],
            },
            {
                "key": "re_bat_peak_load",
                "label": "Peak electricity load (kW)",
                "recommended_source": "Smart meter data / utility records",
                "proxy_options": [],
            },
        ],
    },
}


# ============================================================================
# ASSEMBLY FUNCTIONS
# ============================================================================

def _collect_categories(input_dict, existing=False, focus=None, is_residential=True):
    """Flatten a system input dict into a list of category dicts.

    Parameters
    ----------
    input_dict : dict
        One of the EC_*_INPUTS / RE_*_INPUTS dicts.
    existing : bool
        If True, include categories marked ``existing_only``.
        If False, skip them.
    focus : list[str] or None
        List of selected energy focuses (e.g. ["Electricity", "Heating"]).
        Categories / items whose focus list has no overlap are skipped.
        If None or empty, no filtering is applied.
    is_residential : bool
        If False, skip categories marked ``residential_only``.
    """
    focus_set = set(focus) if focus else set()
    result = []
    for _section_key, section in input_dict.items():
        # Skip existing-only categories when not existing
        if section.get("existing_only") and not existing:
            continue
        # Skip residential-only categories when not residential
        if section.get("residential_only") and not is_residential:
            continue
        # Skip non-residential-only categories when residential
        if section.get("non_residential_only") and is_residential:
            continue
        # Check category-level focus filter
        cat_focus = section.get("focus")
        if cat_focus and focus_set and not focus_set.intersection(cat_focus):
            continue

        items = section["items"]
        # Item-level focus filter
        if focus_set:
            items = [
                i for i in items
                if not i.get("focus_filter") or focus_set.intersection(i["focus_filter"])
            ]
        if items:
            result.append({
                "category": section["category"],
                "items": items,
            })
    return result


# System name → (input dict, needs_existing_flag, allowed_focuses)
# allowed_focuses = None  →  always shown regardless of energy focus
# allowed_focuses = [...]  →  only shown when the chosen focus is in the list
_EC_SYSTEM_MAP = {
    "Buildings":            (EC_BUILDING_INPUTS,    False, None),
    "Rooftop PV":           (EC_ROOFTOP_PV_INPUTS,  True,  ["Electricity"]),
    "Community PV":         (EC_COMMUNITY_PV_INPUTS, True,  ["Electricity"]),
    "Facade PV (BIPV)":     (EC_FACADE_PV_INPUTS,   True,  ["Electricity"]),
    "Battery System":       (EC_BATTERY_INPUTS,      True,  None),
    "EV Charging":          (EC_EV_CHARGING_INPUTS,  False, ["Electricity"]),
    "Vehicle to Grid (V2G)":(EC_V2G_INPUTS,          False, ["Electricity"]),
    "Grid":                 (EC_GRID_INPUTS,         False, ["Electricity"]),
}

_RE_SYSTEM_MAP = {
    "Rooftop PV":           (RE_ROOFTOP_PV_INPUTS,  False),
    "Community PV":         (RE_COMMUNITY_PV_INPUTS, False),
    "Facade PV (BIPV)":     (RE_FACADE_PV_INPUTS,   False),
    "Battery System":       (RE_BATTERY_INPUTS,      False),
}


def get_ec_data_inputs(systems, focus=None,
                       existing_pv=False, existing_battery=False,
                       is_residential=True):
    """Build the data input list for Energy Community Planning.

    Parameters
    ----------
    focus : list[str] or None
        Selected energy focuses, e.g. ["Electricity", "Heating"].

    Returns
    -------
    list[dict]  — list of ``{"system": ..., "categories": [{"category": ..., "items": [...]}]}``
    """
    focus_set = set(focus) if focus else set()
    result = []
    pv_systems = {"Rooftop PV", "Community PV", "Facade PV (BIPV)"}
    for sys_name in systems:
        entry = _EC_SYSTEM_MAP.get(sys_name)
        if not entry:
            continue
        input_dict, uses_existing, allowed_focuses = entry
        # Skip systems not relevant for the current energy focus
        if allowed_focuses is not None and focus_set and not focus_set.intersection(allowed_focuses):
            continue
        existing = False
        if uses_existing:
            if sys_name in pv_systems:
                existing = existing_pv
            elif sys_name == "Battery System":
                existing = existing_battery
        kw = {"existing": existing}
        if sys_name == "Buildings":
            kw["focus"] = focus
            kw["is_residential"] = is_residential
        cats = _collect_categories(input_dict, **kw)
        if cats:
            result.append({"system": sys_name, "categories": cats})
    return result


def get_re_data_inputs(systems):
    """Build the data input list for Renewable Energy Planning.

    Returns
    -------
    list[dict]  — list of ``{"system": ..., "categories": [{"category": ..., "items": [...]}]}``
    """
    result = []
    for sys_name in systems:
        entry = _RE_SYSTEM_MAP.get(sys_name)
        if not entry:
            continue
        input_dict, _ = entry
        cats = _collect_categories(input_dict)
        if cats:
            result.append({"system": sys_name, "categories": cats})
    return result

# ============================================================================
# RENOVATION PLANNING  – data inputs by system
# ============================================================================

# --- Building Envelope: common inputs (always shown when envelope selected) ---
RENO_ENVELOPE_COMMON_INPUTS = {
    "geometry": {
        "category": "Building Geometry",
        "items": [
            {
                "key": "reno_footprint",
                "label": "Footprint dimensions",
                "recommended_source": "Architectural drawing",
                "proxy_options": [],
            },
            {
                "key": "reno_height",
                "label": "Building height",
                "recommended_source": "Architectural drawing",
                "proxy_options": [],
            },
            {
                "key": "reno_num_floors",
                "label": "Number of floors",
                "recommended_source": "Architectural drawing",
                "proxy_options": [],
            },
        ],
    },
    "building_info": {
        "category": "Building Information",
        "items": [
            {
                "key": "reno_building_use",
                "label": "Building use type",
                "recommended_source": "Project brief",
                "proxy_options": [],
            },
            {
                "key": "reno_renovation_history",
                "label": "Renovation history",
                "recommended_source": "Building records / owner",
                "proxy_options": [],
            },
            {
                "key": "reno_construction_materials",
                "label": "Existing construction materials",
                "recommended_source": "Building survey / as-built drawings",
                "proxy_options": [],
            },
            {
                "key": "reno_existing_u_value",
                "label": "Existing U-value",
                "recommended_source": "Building survey / EPC",
                "proxy_options": [],
            },
        ],
    },
}

# --- Walls-specific inputs ---
RENO_WALLS_INPUTS = {
    "walls": {
        "category": "Walls – Renovation",
        "items": [
            {
                "key": "reno_wall_material_options",
                "label": "List of wall material options",
                "recommended_source": "Supplier catalogue / project brief",
                "proxy_options": [],
            },
        ],
    },
}

# --- Roof-specific inputs ---
RENO_ROOF_INPUTS = {
    "roof": {
        "category": "Roof – Renovation",
        "items": [
            {
                "key": "reno_roof_material_options",
                "label": "List of roof material options",
                "recommended_source": "Supplier catalogue / project brief",
                "proxy_options": [],
            },
        ],
    },
}

# --- Floor-specific inputs ---
RENO_FLOOR_INPUTS = {
    "floor": {
        "category": "Floor – Renovation",
        "items": [
            {
                "key": "reno_floor_material_options",
                "label": "List of floor material options",
                "recommended_source": "Supplier catalogue / project brief",
                "proxy_options": [],
            },
        ],
    },
}

# --- Windows-specific inputs ---
RENO_WINDOWS_INPUTS = {
    "windows": {
        "category": "Windows – Renovation",
        "items": [
            {
                "key": "reno_existing_window_type",
                "label": "Type of existing windows",
                "recommended_source": "Building survey / window schedule",
                "proxy_options": [],
            },
        ],
    },
}

# --- Heating System inputs ---
RENO_HEATING_INPUTS = {
    "building_info": {
        "category": "Heating System \u2013 Building Information",
        "items": [
            {
                "key": "reno_hs_footprint",
                "label": "Footprint dimensions",
                "recommended_source": "Architectural drawing",
                "proxy_options": [],
            },
            {
                "key": "reno_hs_height",
                "label": "Building height",
                "recommended_source": "Architectural drawing",
                "proxy_options": [],
            },
            {
                "key": "reno_hs_num_floors",
                "label": "Number of floors",
                "recommended_source": "Architectural drawing",
                "proxy_options": [],
            },
            {
                "key": "reno_hs_building_use",
                "label": "Building use type",
                "recommended_source": "Project brief",
                "proxy_options": [],
            },
            {
                "key": "reno_hs_renovation_history",
                "label": "Renovation history",
                "recommended_source": "Building records / owner",
                "proxy_options": [],
            },
            {
                "key": "reno_hs_existing_u_value",
                "label": "Existing U-value",
                "recommended_source": "Building survey / EPC",
                "proxy_options": [],
            },
        ],
    },
    "existing_demand": {
        "category": "Heating System – Current Performance",
        "existing_only": True,
        "items": [
            {
                "key": "reno_heating_demand",
                "label": "Current heating demand",
                "recommended_source": "Utility bills / BMS",
                "proxy_options": [],
                "temporal_resolution": True,
            },
        ],
    },
    "existing_cost": {
        "category": "Heating System – Cost",
        "existing_only": True,
        "cost_kpi_only": True,
        "items": [
            {
                "key": "reno_heating_cost",
                "label": "Current heating cost",
                "recommended_source": "Utility bills",
                "proxy_options": [],
            },
        ],
    },
    "existing_dhw_demand": {
        "category": "Heating System – DHW Demand",
        "existing_only": True,
        "items": [
            {
                "key": "reno_heating_dhw_demand",
                "label": "Domestic hot water demand",
                "recommended_source": "Utility bills / metering",
                "proxy_options": [],
            },
        ],
    },
    "target": {
        "category": "Heating System – Target",
        "items": [
            {
                "key": "reno_heating_target_temp",
                "label": "Target indoor temperature",
                "recommended_source": "Project brief / comfort standards",
                "proxy_options": [],
            },
        ],
    },
}

# --- Cooling System inputs ---
RENO_COOLING_INPUTS = {
    "building_info": {
        "category": "Cooling System \u2013 Building Information",
        "items": [
            {
                "key": "reno_cs_footprint",
                "label": "Footprint dimensions",
                "recommended_source": "Architectural drawing",
                "proxy_options": [],
            },
            {
                "key": "reno_cs_height",
                "label": "Building height",
                "recommended_source": "Architectural drawing",
                "proxy_options": [],
            },
            {
                "key": "reno_cs_num_floors",
                "label": "Number of floors",
                "recommended_source": "Architectural drawing",
                "proxy_options": [],
            },
            {
                "key": "reno_cs_building_use",
                "label": "Building use type",
                "recommended_source": "Project brief",
                "proxy_options": [],
            },
            {
                "key": "reno_cs_renovation_history",
                "label": "Renovation history",
                "recommended_source": "Building records / owner",
                "proxy_options": [],
            },
            {
                "key": "reno_cs_existing_u_value",
                "label": "Existing U-value",
                "recommended_source": "Building survey / EPC",
                "proxy_options": [],
            },
        ],
    },
    "existing_demand": {
        "category": "Cooling System – Current Performance",
        "existing_only": True,
        "items": [
            {
                "key": "reno_cooling_demand",
                "label": "Current cooling demand",
                "recommended_source": "Utility bills / BMS",
                "proxy_options": [],
                "temporal_resolution": True,
            },
        ],
    },
    "existing_cost": {
        "category": "Cooling System – Cost",
        "existing_only": True,
        "cost_kpi_only": True,
        "items": [
            {
                "key": "reno_cooling_cost",
                "label": "Current cooling cost",
                "recommended_source": "Utility bills",
                "proxy_options": [],
            },
        ],
    },
    "target": {
        "category": "Cooling System – Target",
        "items": [
            {
                "key": "reno_cooling_target_temp",
                "label": "Target indoor temperature",
                "recommended_source": "Project brief / comfort standards",
                "proxy_options": [],
            },
        ],
    },
}

# --- DHW System inputs ---
RENO_DHW_INPUTS = {
    "building_info": {
        "category": "DHW System \u2013 Building Information",
        "items": [
            {
                "key": "reno_dhw_footprint",
                "label": "Footprint dimensions",
                "recommended_source": "Architectural drawing",
                "proxy_options": [],
            },
            {
                "key": "reno_dhw_height",
                "label": "Building height",
                "recommended_source": "Architectural drawing",
                "proxy_options": [],
            },
            {
                "key": "reno_dhw_num_floors",
                "label": "Number of floors",
                "recommended_source": "Architectural drawing",
                "proxy_options": [],
            },
            {
                "key": "reno_dhw_building_use",
                "label": "Building use type",
                "recommended_source": "Project brief",
                "proxy_options": [],
            },
            {
                "key": "reno_dhw_renovation_history",
                "label": "Renovation history",
                "recommended_source": "Building records / owner",
                "proxy_options": [],
            },
            {
                "key": "reno_dhw_existing_u_value",
                "label": "Existing U-value",
                "recommended_source": "Building survey / EPC",
                "proxy_options": [],
            },
        ],
    },
    "existing_performance": {
        "category": "DHW System – Current Performance",
        "existing_only": True,
        "items": [
            {
                "key": "reno_dhw_energy_demand",
                "label": "Current energy demand for DHW",
                "recommended_source": "Utility bills / metering",
                "proxy_options": [],
            },
            {
                "key": "reno_dhw_water_consumption",
                "label": "Water consumption",
                "recommended_source": "Water meter / utility bills",
                "proxy_options": [],
            },
        ],
    },
    "general": {
        "category": "DHW System – General",
        "items": [
            {
                "key": "reno_dhw_num_occupants",
                "label": "Number of occupants",
                "recommended_source": "Building records / project brief",
                "proxy_options": [],
            },
            {
                "key": "reno_dhw_storage_temp",
                "label": "Storage temperature",
                "recommended_source": "System specifications / standards",
                "proxy_options": [],
            },
        ],
    },
}


def _collect_reno_categories(input_dict, existing=False, cost_kpi=False):
    """Flatten a renovation input dict into a list of category dicts.

    Parameters
    ----------
    input_dict : dict
        One of the RENO_*_INPUTS dicts.
    existing : bool
        If True, include categories marked ``existing_only``.
    cost_kpi : bool
        If True, include categories marked ``cost_kpi_only``.
    """
    result = []
    for _section_key, section in input_dict.items():
        # Skip existing-only categories when system is not existing
        if section.get("existing_only") and not existing:
            continue
        # Skip cost-kpi-only categories when cost KPI not selected
        if section.get("cost_kpi_only") and not cost_kpi:
            continue
        items = section["items"]
        if items:
            result.append({
                "category": section["category"],
                "items": items,
            })
    return result


def get_renovation_data_inputs(systems, envelope_components=None,
                               existing_heating=False,
                               existing_cooling=False,
                               existing_dhw=False,
                               cost_kpi=False):
    """Build the data input list for Renovation Planning.

    Parameters
    ----------
    systems : list[str]
        Selected systems in scope from Step 1+.
    envelope_components : list[str] or None
        Selected envelope sub-components (Windows, Walls, Roof, Floor).
    existing_heating : bool
        Whether there is an existing heating system.
    existing_cooling : bool
        Whether there is an existing cooling system.
    existing_dhw : bool
        Whether there is an existing DHW system.
    cost_kpi : bool
        Whether "Cost" is among the selected KPIs.

    Returns
    -------
    list[dict]  – list of ``{"system": ..., "categories": [...]}``
    """
    if not envelope_components:
        envelope_components = []

    result = []
    systems_set = set(systems)

    # --- Building Envelope ---
    if "Building Envelope (Windows, Roof, Walls, Floors)" in systems_set:
        cats = _collect_reno_categories(RENO_ENVELOPE_COMMON_INPUTS)

        # Add component-specific inputs
        if "Walls" in envelope_components:
            cats.extend(_collect_reno_categories(RENO_WALLS_INPUTS))
        if "Roof" in envelope_components:
            cats.extend(_collect_reno_categories(RENO_ROOF_INPUTS))
        if "Floor" in envelope_components:
            cats.extend(_collect_reno_categories(RENO_FLOOR_INPUTS))
        if "Windows" in envelope_components:
            cats.extend(_collect_reno_categories(RENO_WINDOWS_INPUTS))

        if cats:
            result.append({
                "system": "Building Envelope",
                "categories": cats,
            })

    # --- Heating System ---
    if "Heating System" in systems_set:
        cats = _collect_reno_categories(
            RENO_HEATING_INPUTS,
            existing=existing_heating,
            cost_kpi=cost_kpi,
        )
        if cats:
            result.append({
                "system": "Heating System",
                "categories": cats,
            })

    # --- Cooling System ---
    if "Cooling System" in systems_set:
        cats = _collect_reno_categories(
            RENO_COOLING_INPUTS,
            existing=existing_cooling,
            cost_kpi=cost_kpi,
        )
        if cats:
            result.append({
                "system": "Cooling System",
                "categories": cats,
            })

    # --- DHW System ---
    if "Domestic Hot Water System (DHW)" in systems_set:
        cats = _collect_reno_categories(
            RENO_DHW_INPUTS,
            existing=existing_dhw,
            cost_kpi=cost_kpi,
        )
        if cats:
            result.append({
                "system": "Domestic Hot Water System (DHW)",
                "categories": cats,
            })

    return result