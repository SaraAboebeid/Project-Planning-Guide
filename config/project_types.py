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
    "Renewable Energy Planning",
]

# Short descriptions shown in the UI beneath each project type
PROJECT_TYPE_DESCRIPTIONS = {
    "Energy Community Planning": (
        "Plan shared energy systems across multiple entities."
    ),
    "Renovation Planning": (
        "Assess and prioritise retrofit measures for existing buildings — "
        "envelope, systems, comfort, and EPC improvement."
    ),
    "Renewable Energy Planning": (
        "Evaluate renewable energy potential — "
        "solar, wind, geothermal, biomass, and storage."
    ),
}

# ============================================================================
# SYSTEMS IN SCOPE  (per project type)
# ============================================================================

SYSTEMS_BY_PROJECT_TYPE = {
    "Energy Community Planning": [
        "Buildings",
        "Rooftop PV",
        "Community PV",
        "Facade PV (BIPV)",
        "Battery System",
        "EV Charging",
        "Vehicle to Grid (V2G)",
        "Grid",
    ],
    "Renovation Planning": [
        "Building Envelope (Windows, Roof, Walls, Floors)",
        "Domestic Hot Water System (DHW)",
        "Heating System",
        "Cooling System",
    ],
    "Renewable Energy Planning": [
        "Rooftop PV",
        "Community PV",
        "Facade PV (BIPV)",
        "Offshore Wind",
        "Onshore Wind",
        "Solar Thermal",
        "Geothermal",
        "Biomass",
        "Hydropower",
    ],
}

# Follow-up systems — shown as a conditional question when trigger systems
# are selected.  Keeps the main systems list clean while guiding the user.
FOLLOW_UP_SYSTEMS = {
    "Renewable Energy Planning": {
        "Battery System": {
            "triggers": ["Rooftop PV", "Community PV", "Facade PV (BIPV)"],
            "question": "Are you planning to include a battery storage system?",
            "help": (
                "Battery storage can improve self-sufficiency, enable "
                "energy export, and smooth peak loads."
            ),
        },
    },
}

# Follow-up questions for Energy Community Planning
# These ask whether PV / battery are *already installed* on site,
# which changes the data input list (measured vs. planned data).
EC_FOLLOW_UP_QUESTIONS = {
    "existing_pv": {
        "triggers": ["Rooftop PV", "Community PV", "Facade PV (BIPV)"],
        "question": "Is there PV already installed on site?",
        "help": (
            "If PV is already installed, we will ask for measured "
            "production data. Otherwise we will ask for planned "
            "system specifications."
        ),
    },
    "existing_battery": {
        "triggers": ["Battery System"],
        "question": "Is there a battery system already installed on site?",
        "help": (
            "If a battery is already installed, we will ask for "
            "measured performance data. Otherwise we will ask for "
            "planned specifications."
        ),
    },
}

# Energy focus options for Energy Community Planning
EC_FOCUS_OPTIONS = [
    "Electricity",
    "Heating",
    "Cooling",
]

# Systems that are shown but disabled (greyed-out) in the UI
# See also FOLLOW_UP_SYSTEMS (conditional follow-up questions)
DISABLED_SYSTEMS = {
    "Renewable Energy Planning": [
        "Offshore Wind",
        "Onshore Wind",
        "Solar Thermal",
        "Geothermal",
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
        "Peak Load Shaving",
        "Global Warming Potential",
        "Cost",
        "Return on Investment",
    ],
    "Renovation Planning": [
        "Cost",
        "Thermal Comfort",
        "Global Warming Potential",
        "Energy Demand",
        "Return on Investment",
    ],
    "Renewable Energy Planning": [
        "Self-Sufficiency",
        "Global Warming Potential",
        "Energy Import",
        "Peak Load Shaving",
        "Thermal Comfort",
        "Cost",
        "Return on Investment",
    ],
}

# Conditional KPIs added dynamically based on selected systems in scope
CONDITIONAL_KPIS = {
    "Energy Community Planning": {
        "Grid": ["Energy Import"],
        "Battery System": ["Energy Export", "State of Charge"],
    },
    "Renewable Energy Planning": {
        "Battery System": ["Energy Export"],
    },
}


# ============================================================================
# EXPLORATION APPROACHES  –  options, descriptions & KPI constraints
# ============================================================================

EXPLORATION_OPTIONS = [
    "Baseline Assessment",
    "Scenario Comparison",
    "What-if Simulation",
    "Multi-objective Optimization",
    "Resource Allocation Planning",
    "Roadmap Planning",
    "Risk & Uncertainty Analysis",
]

EXPLORATION_CONSTRAINTS = {
    "Baseline Assessment": {
        "min_kpis": 1,
        "max_kpis": None,
        "icon": "📏",
        "description": (
            "Evaluate current performance against selected KPIs "
            "to establish a reference point."
        ),
        "hint": "Select one or more KPIs",
    },
    "Scenario Comparison": {
        "min_kpis": 1,
        "max_kpis": None,
        "icon": "🔀",
        "description": (
            "Compare multiple design or operational scenarios "
            "side-by-side across KPIs."
        ),
        "hint": "Select one or more KPIs",
    },
    "What-if Simulation": {
        "min_kpis": 1,
        "max_kpis": 1,
        "icon": "🧪",
        "description": (
            "Test the impact of changing a single variable on one KPI."
        ),
        "hint": "Select exactly 1 KPI",
    },
    "Multi-objective Optimization": {
        "min_kpis": 2,
        "max_kpis": 5,
        "weighting": True,
        "icon": "⚖️",
        "description": (
            "Find optimal trade-offs between 2–5 competing objectives."
        ),
        "hint": "Select 2–5 KPIs",
    },
    "Resource Allocation Planning": {
        "min_kpis": 1,
        "max_kpis": 1,
        "icon": "📦",
        "description": (
            "Determine how to allocate limited resources "
            "to maximise one KPI."
        ),
        "hint": "Select exactly 1 KPI",
    },
    "Roadmap Planning": {
        "min_kpis": 1,
        "max_kpis": None,
        "primary": True,
        "icon": "🗺️",
        "description": (
            "Define a phased plan with a primary target KPI "
            "and optional supporting secondary KPIs."
        ),
        "hint": "Select a primary KPI + optional secondary KPIs",
    },
    "Risk & Uncertainty Analysis": {
        "min_kpis": 1,
        "max_kpis": 1,
        "icon": "🎲",
        "description": (
            "Assess how uncertainty in inputs affects one KPI."
        ),
        "hint": "Select exactly 1 KPI",
    },
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
        "Rooftop PV": "Solar PV",
        "Community PV": "Solar PV",
        "Facade PV (BIPV)": "Solar PV",
        "Solar Thermal": "Solar Thermal",
        "Onshore Wind": "Onshore Wind",
        "Offshore Wind": "Offshore Wind",
        "Geothermal": "Geothermal",
        "Battery System": "Battery Storage",
        "Biomass": "Biomass",
        "Hydropower": "Hydropower",
    }
    for sys in systems:
        if sys in _RE_MAP:
            result["renewable_types"].append(_RE_MAP[sys])

    # ── focus helper ─────────────────────────────────────────────────
    def _infer_focus():
        thermal = {"Heating System", "Cooling System"} & systems_set
        if thermal:
            return "Heating/Cooling"
        return "Whole system interaction"

    # ── project-type → analysis_type mapping ─────────────────────────
    if project_type == "Energy Community Planning":
        result["analysis_type"] = ["Energy & Carbon Performance"]
        result["analysis_focus"] = "Whole system interaction"
        result["energy_system_focus"] = "Whole system interaction"
        pv_systems = {"Rooftop PV", "Community PV", "Facade PV (BIPV)",
                      "Battery System"}
        if pv_systems & systems_set:
            result["analysis_type"].append("Renewable Energy & Local Production")

    elif project_type == "Renovation Planning":
        result["analysis_type"] = ["Retrofit & Transformation"]
        energy_sys = {"Heating System", "Cooling System",
                      "Domestic Hot Water System (DHW)"}
        if energy_sys & systems_set:
            result["analysis_type"].insert(0, "Energy & Carbon Performance")
            focus = _infer_focus()
            result["analysis_focus"] = focus
            result["energy_system_focus"] = focus

    elif project_type == "Renewable Energy Planning":
        result["analysis_type"] = ["Renewable Energy & Local Production"]
        result["analysis_focus"] = None
        result["energy_system_focus"] = None

    return result
