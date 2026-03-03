"""
Project Type definitions for the Step 1+ pipeline.

Maps project types → systems in scope → KPIs, and provides a
translation function that converts Step 1+ selections into the
session-state keys that Steps 2-6 already expect.
"""

# ============================================================================
# PROJECT TYPES
# ============================================================================

PROJECT_TYPES = [
    "Energy Community Planning",
    "Renovation Planning",
    "System Optimization",
    "Net Zero Carbon Strategy",
    "Renewable Energy Feasibility",
]

# Short descriptions shown in the UI beneath each project type
PROJECT_TYPE_DESCRIPTIONS = {
    "Energy Community Planning": (
        "Plan shared energy systems across multiple buildings — "
        "PV, storage, grid interaction, and cost sharing."
    ),
    "Renovation Planning": (
        "Assess and prioritise retrofit measures for existing buildings — "
        "envelope, systems, comfort, and EPC improvement."
    ),
    "System Optimization": (
        "Optimise individual building systems — "
        "heating, cooling, ventilation, controls, and lighting."
    ),
    "Net Zero Carbon Strategy": (
        "Develop a roadmap to net-zero carbon — "
        "operational and embodied carbon reduction pathways."
    ),
    "Renewable Energy Feasibility": (
        "Evaluate renewable energy potential — "
        "solar, wind, geothermal, biomass, and storage."
    ),
}

# ============================================================================
# SYSTEMS IN SCOPE  (per project type)
# ============================================================================

SYSTEMS_BY_PROJECT_TYPE = {
    "Energy Community Planning": [
        "Solar PV",
        "Battery Storage",
        "V2G (Vehicle to Grid)",
        "Heating System",
        "Cooling System",
        "DHW (Domestic Hot Water)",
        "Grid Connection",
    ],
    "Renovation Planning": [
        "Building Envelope (Wall, Roof, Window, Floor)",
        "Heating System",
        "Cooling System",
        "DHW (Domestic Hot Water)",
    ],
    "System Optimization": [
        "Heating System",
        "Cooling System",
        "Ventilation",
        "DHW (Domestic Hot Water)",
        "Solar PV System",
    ],
    "Net Zero Carbon Strategy": [
        "Envelope (Walls, Roof, Windows)",
        "Heating",
        "Cooling",
        "Ventilation",
        "Solar PV",
        "Lighting",
        "DHW (Domestic Hot Water)",
        "Embodied Carbon",
        "Operational Carbon",
    ],
    "Renewable Energy Feasibility": [
        "Solar PV",
        "Solar Thermal",
        "Onshore Wind",
        "Offshore Wind",
        "Geothermal",
        "Battery Storage",
        "Biomass",
        "Hydropower",
    ],
}

# ============================================================================
# KEY PERFORMANCE INDICATORS  (per project type)
# ============================================================================

KPIS_BY_PROJECT_TYPE = {
    "Energy Community Planning": [
        "Self-sufficiency",
        "Peak load reduction",
        "Operating cost reduction",
        "Energy balance (self-consumption)",
        "GWP reduction",
    ],
    "Renovation Planning": [
        "Reduce energy demand",
        "Reduce energy cost",
        "Improve thermal comfort",
        "Reduce GWP",
        "Reduce peak loads",
    ],
    "System Optimization": [
        "Reduce energy demand",
        "Reduce energy cost",
        "Reduce GWP",
        "Improve system efficiency (COP)",
        "Reduce peak loads",
        "Improve indoor comfort",
    ],
    "Net Zero Carbon Strategy": [
        "Operational carbon zero",
        "Whole-life carbon reduction",
        "Embodied carbon reduction",
        "Timeline to net zero",
        "Carbon offset budget",
        "Achieve EPC A rating",
    ],
    "Renewable Energy Feasibility": [
        "Energy yield (kWh/yr)",
        "Self-consumption rate",
        "ROI / Payback period",
        "LCOE (Levelized Cost of Energy)",
        "GWP avoided",
        "Grid independence",
    ],
}


# ============================================================================
# TRANSLATION  →  legacy session-state keys used by Steps 2-6
# ============================================================================

def translate_to_legacy_keys(project_type, systems, kpis):
    """
    Convert Step 1+ selections into the session-state keys that the
    existing Steps 2-6 expect.

    Returns
    -------
    dict  with keys:
        analysis_type, analysis_focus, energy_system_focus,
        renewable_types, urban_design_types, climate_resilience_types
    """
    result = {
        "analysis_type": [],
        "analysis_focus": None,
        "energy_system_focus": None,
        "renewable_types": [],
        "urban_design_types": [],
        "climate_resilience_types": [],
    }

    systems_set = set(systems)

    # ── renewable helpers ────────────────────────────────────────────
    _RE_MAP = {
        "Solar PV": "Solar PV",
        "Solar PV System": "Solar PV",
        "Solar Thermal": "Solar Thermal",
        "Onshore Wind": "Onshore Wind",
        "Offshore Wind": "Offshore Wind",
        "Geothermal": "Geothermal",
        "Battery Storage": "Battery Storage",
        "Biomass": "Biomass",
        "Hydropower": "Hydropower",
    }
    for sys in systems:
        if sys in _RE_MAP:
            result["renewable_types"].append(_RE_MAP[sys])

    # ── focus helper ─────────────────────────────────────────────────
    def _infer_focus():
        thermal = {"Heating System", "Cooling System"} & systems_set
        electrical = {"Lighting"} & systems_set
        if thermal and not electrical:
            return "Heating/Cooling"
        if electrical and not thermal:
            return "Electricity"
        return "Whole system interaction"

    # ── project-type → analysis_type mapping ─────────────────────────
    if project_type == "Energy Community Planning":
        result["analysis_type"] = ["Energy & Carbon Performance"]
        result["analysis_focus"] = "Whole system interaction"
        result["energy_system_focus"] = "Whole system interaction"
        if {"Solar PV", "Solar PV System", "Solar Thermal", "Battery Storage"} & systems_set:
            result["analysis_type"].append("Renewable Energy & Local Production")

    elif project_type == "Renovation Planning":
        result["analysis_type"] = ["Retrofit & Transformation"]
        energy_sys = {"Heating System", "Cooling System",
                      "DHW (Domestic Hot Water)"}
        if energy_sys & systems_set:
            result["analysis_type"].insert(0, "Energy & Carbon Performance")
            focus = _infer_focus()
            result["analysis_focus"] = focus
            result["energy_system_focus"] = focus

    elif project_type == "System Optimization":
        result["analysis_type"] = ["Energy & Carbon Performance"]
        if "Solar PV System" in systems_set:
            result["analysis_type"].append("Renewable Energy & Local Production")
        focus = _infer_focus()
        result["analysis_focus"] = focus
        result["energy_system_focus"] = focus

    elif project_type == "Net Zero Carbon Strategy":
        result["analysis_type"] = ["Energy & Carbon Performance"]
        if "Envelope (Walls, Roof, Windows)" in systems_set:
            result["analysis_type"].append("Retrofit & Transformation")
        if "Solar PV" in systems_set:
            result["analysis_type"].append("Renewable Energy & Local Production")
        result["analysis_focus"] = "Whole system interaction"
        result["energy_system_focus"] = "Whole system interaction"

    elif project_type == "Renewable Energy Feasibility":
        result["analysis_type"] = ["Renewable Energy & Local Production"]
        result["analysis_focus"] = None
        result["energy_system_focus"] = None

    return result
