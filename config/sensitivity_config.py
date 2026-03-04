"""
Sensitivity Analysis Configuration

Pre-computed results from One-At-a-Time (OAT) and Global sensitivity analyses
performed on a reference building energy model (Heating/Cooling focus, Swedish context).

These results drive:
1. SHAP-like visualizations showing parameter importance
2. Confidence weighting — high-impact parameters affect confidence more when missing
3. Proxy quality impact — inaccurate proxies on critical parameters reduce confidence more
"""

# ==============================================================================
# BASELINE
# ==============================================================================

BASELINE_HEATING_KWH = 226335.41  # Baseline annual heating from reference model (kWh)

# ==============================================================================
# OAT (ONE-AT-A-TIME) SENSITIVITY RESULTS
# ==============================================================================
# Each parameter was varied independently while all others held at baseline.
# Results show how annual heating demand changes with each parameter.

OAT_PARAMETERS = {
    "infiltration": {
        "label": "Infiltration Rate",
        "unit": "m³/s·m²",
        "data_keys": ["infiltration_rate"],
        "values": [
            0.0001, 0.00015, 0.0002, 0.00025, 0.0003,
            0.00035, 0.0004, 0.00045, 0.0005, 0.00055, 0.0006,
        ],
        "outputs_kwh": [
            129919.15, 143239.16, 156715.22, 170366.23, 184183.35,
            198158.18, 212251.26, 226335.41, 240635.27, 255020.16, 269353.10,
        ],
        "range_kwh": 139434.0,
        "baseline_value": 0.00045,
    },
    "construction_package": {
        "label": "Construction Quality",
        "unit": "category",
        "data_keys": ["construction_materials"],
        "values": ["P0 Poor", "P1 Baseline", "P2 Well-insulated"],
        "outputs_kwh": [279892.67, 226335.41, 201608.30],
        "range_kwh": 78284.37,
        "baseline_value": "P1 Baseline",
    },
    "wwr_north": {
        "label": "WWR North",
        "unit": "ratio",
        "data_keys": ["wwr"],
        "values": [0.04, 0.09, 0.14, 0.19, 0.24, 0.29, 0.34, 0.39, 0.44, 0.49],
        "outputs_kwh": [
            220166.13, 223635.98, 227028.12, 230419.99, 233855.33,
            237277.13, 240684.87, 244000.08, 247388.97, 250767.13,
        ],
        "range_kwh": 30601.0,
        "baseline_value": 0.24,
    },
    "wwr_south": {
        "label": "WWR South",
        "unit": "ratio",
        "data_keys": ["wwr"],
        "values": [0.04, 0.09, 0.14, 0.19, 0.24, 0.29, 0.34, 0.39, 0.44, 0.49],
        "outputs_kwh": [
            232793.26, 230955.88, 229269.27, 227746.60, 226335.41,
            225070.15, 223991.71, 223019.81, 222163.65, 221334.63,
        ],
        "range_kwh": 11458.63,
        "baseline_value": 0.24,
    },
    "wwr_east": {
        "label": "WWR East",
        "unit": "ratio",
        "data_keys": ["wwr"],
        "values": [0.04, 0.09, 0.14, 0.19, 0.24, 0.29, 0.34, 0.39, 0.44, 0.49],
        "outputs_kwh": [
            226335.41, 226847.50, 227353.04, 227855.17, 228295.53,
            228811.72, 229375.06, 229895.35, 230449.54, 231005.21,
        ],
        "range_kwh": 4669.80,
        "baseline_value": 0.24,
    },
    "wwr_west": {
        "label": "WWR West",
        "unit": "ratio",
        "data_keys": ["wwr"],
        "values": [0.04, 0.09, 0.14, 0.19, 0.24, 0.29, 0.34, 0.39, 0.44, 0.49],
        "outputs_kwh": [
            226335.41, 226395.50, 226452.13, 226512.16, 226581.38,
            226591.01, 226708.05, 226785.22, 227033.05, 227201.51,
        ],
        "range_kwh": 866.10,
        "baseline_value": 0.24,
    },

    # ------------------------------------------------------------------
    # NEW OAT PARAMETERS (added from latest simulation results)
    # ------------------------------------------------------------------

    "roof_pitch_gable": {
        "label": "Roof Pitch (Gable)",
        "unit": "degrees",
        "data_keys": ["roof_shape_angle"],
        "values": [0, 10, 15, 25, 35, 45],
        "outputs_kwh": [
            225100.96, 244381.48, 261399.58,
            304791.38, 361038.53, 436418.24,
        ],
        "range_kwh": 211317.28,
        "baseline_value": 0,
    },
    "heating_setpoint": {
        "label": "Heating Setpoint",
        "unit": "°C",
        "data_keys": ["setpoint"],
        "values": [19, 20, 21, 22, 23],
        "outputs_kwh": [
            171222.30, 197468.59, 226335.41, 257907.95, 291787.77,
        ],
        "range_kwh": 120565.47,
        "baseline_value": 21,
    },
    "floors_total": {
        "label": "Number of Floors",
        "unit": "count",
        "data_keys": ["num_floors"],
        "values": [3, 4, 5],
        "outputs_kwh": [190255.20, 226335.41, 262413.31],
        "range_kwh": 72158.11,
        "baseline_value": 4,
    },
    "footprint_length": {
        "label": "Building Length",
        "unit": "factor",
        "data_keys": ["footprint"],
        "values": [0.9, 1.0, 1.1, 1.2],
        "outputs_kwh": [205108.69, 226335.41, 247628.30, 268861.77],
        "range_kwh": 63753.08,
        "baseline_value": 1.0,
    },
    "footprint_width": {
        "label": "Building Width",
        "unit": "factor",
        "data_keys": ["footprint"],
        "values": [0.8, 0.9, 1.0, 1.1, 1.2],
        "outputs_kwh": [200067.92, 213174.52, 226335.41, 239692.54, 252891.61],
        "range_kwh": 52823.69,
        "baseline_value": 1.0,
    },
    "glazing_package": {
        "label": "Glazing Quality",
        "unit": "category",
        "data_keys": ["window_properties"],
        "values": ["P0 Poor", "P1 Baseline", "P2 Good"],
        "outputs_kwh": [225390.84, 213962.33, 202041.01],
        "range_kwh": 23349.83,
        "baseline_value": "P1 Baseline",
    },
    "roof_pitch_shed": {
        "label": "Roof Pitch (Shed)",
        "unit": "degrees",
        "data_keys": ["roof_shape_angle"],
        "values": [0, 10, 15, 25, 35, 45],
        "outputs_kwh": [
            224629.69, 225877.35, 227057.18,
            230904.45, 237255.22, 247602.52,
        ],
        "range_kwh": 22972.83,
        "baseline_value": 0,
    },
}

# Computed relative importance (% of total output range)
TOTAL_OAT_RANGE = sum(p["range_kwh"] for p in OAT_PARAMETERS.values())
OAT_IMPORTANCE = {
    name: round(data["range_kwh"] / TOTAL_OAT_RANGE * 100, 1)
    for name, data in OAT_PARAMETERS.items()
}


# ==============================================================================
# SENSITIVITY WEIGHTS FOR CONFIDENCE CALCULATION
# ==============================================================================
# Maps data_input keys to confidence weights.
# Derived from sensitivity analysis: high-impact parameters get higher weights.
# When a parameter is missing, the confidence penalty is proportional to its weight.
# When a proxy is used, the penalty is reduced by the proxy's confidence level.

# Default weights (Heating / Cooling focus — from OAT + Global SA)
SENSITIVITY_WEIGHTS = {
    # --- Very high impact (from OAT analysis) ---
    "roof_shape_angle": 20.0,
    "infiltration_rate": 20.0,
    "construction_materials": 15.0,

    # --- High impact ---
    "setpoint": 12.0,
    "wwr": 10.0,
    "num_floors": 9.0,
    "window_properties": 8.0,

    # --- Moderate impact (from global SA + physics) ---
    "footprint": 8.0,
    "height": 6.0,
    "hvac_type": 5.0,

    # --- Lower impact ---
    "year_construction": 4.0,
    "orientation": 3.0,
    "supply_temp": 3.0,
    "annual_heating_cooling": 3.0,
    "annual_electricity": 3.0,

    # --- Context / operational ---
    "use_type": 2.0,
    "occupancy_pattern": 2.0,
    "operating_hours": 2.0,
    "location": 1.5,
    "grid_emission_factor": 1.0,
    "onsite_production": 1.0,
    "has_basement": 1.0,

    # --- Renewable / roof parameters ---
    "roof_shape_angle": 3.0,
    "roof_area": 3.0,
    "pv_module": 2.0,
    "installing_battery": 1.0,
    "building_location": 1.5,
    "context_location_height": 1.0,
}

# Per-analysis-type overrides  — keys not listed fall back to SENSITIVITY_WEIGHTS
ANALYSIS_TYPE_WEIGHTS = {
    "Energy & Carbon Performance": {
        # High
        "annual_electricity": 20.0,
        "onsite_production": 18.0,
        "operating_hours": 16.0,
        # Medium
        "grid_emission_factor": 10.0,
        # Everything else → Low (explicit)
        "infiltration_rate": 3.0,
        "construction_materials": 3.0,
        "wwr": 3.0,
        "window_properties": 3.0,
        "footprint": 3.0,
        "num_floors": 3.0,
        "height": 3.0,
        "hvac_type": 3.0,
        "year_construction": 2.0,
        "setpoint": 2.0,
        "orientation": 2.0,
        "supply_temp": 2.0,
        "annual_heating_cooling": 2.0,
        "use_type": 2.0,
        "occupancy_pattern": 2.0,
        "location": 2.0,
        "has_basement": 1.0,
        "roof_shape_angle": 2.0,
        "roof_area": 2.0,
        "pv_module": 2.0,
        "installing_battery": 1.0,
        "building_location": 2.0,
        "context_location_height": 1.0,
    },

    # ------------------------------------------------------------------
    # RENEWABLE ENERGY & LOCAL PRODUCTION  — Solar PV / RE Planning
    # ------------------------------------------------------------------
    # For renewable energy analysis the building geometry & orientation
    # parameters that determine solar access dominate, while HVAC and
    # envelope thermal parameters drop in importance.
    # Derived from the Solar Analysis OAT study (same reference model,
    # interpreted through the solar-gain lens).
    "Renewable Energy & Local Production": {
        # ── Very High (solar access drivers) ─────────────────────────
        "roof_shape_angle": 20.0,       # tilt → PV yield
        "roof_area": 20.0,              # available PV area
        "orientation": 18.0,            # azimuth → irradiance
        "pv_module": 16.0,              # panel type / efficiency
        # ── High (context & shading) ─────────────────────────────────
        "building_location": 14.0,      # urban shading context
        "context_location_height": 12.0, # horizon shading
        "wwr": 10.0,                    # south WWR ↔ passive solar
        # ── Medium (geometry affecting available roof / facade) ──────
        "footprint": 8.0,
        "height": 8.0,
        "num_floors": 6.0,
        "installing_battery": 6.0,      # storage sizing
        # ── Lower (less relevant for PV yield) ───────────────────────
        "infiltration_rate": 3.0,
        "construction_materials": 3.0,
        "window_properties": 3.0,
        "hvac_type": 2.0,
        "setpoint": 2.0,
        "supply_temp": 2.0,
        "annual_heating_cooling": 2.0,
        "annual_electricity": 3.0,
        "onsite_production": 4.0,
        "grid_emission_factor": 5.0,
        "use_type": 2.0,
        "occupancy_pattern": 2.0,
        "operating_hours": 2.0,
        "year_construction": 2.0,
        "location": 3.0,
        "has_basement": 1.0,
    },
}

DEFAULT_SENSITIVITY_WEIGHT = 2.0


def get_sensitivity_weight(item_key: str, analysis_type: str = None) -> float:
    """Get the sensitivity weight for a data input parameter.

    Higher weight = more impact on result accuracy.
    If *analysis_type* is supplied and has an override table, that table is
    checked first; otherwise the default (Heating/Cooling) weights are used.
    """
    if analysis_type and analysis_type in ANALYSIS_TYPE_WEIGHTS:
        overrides = ANALYSIS_TYPE_WEIGHTS[analysis_type]
        if item_key in overrides:
            return overrides[item_key]
    return SENSITIVITY_WEIGHTS.get(item_key, DEFAULT_SENSITIVITY_WEIGHT)


def get_importance_rank(item_key: str, analysis_type: str = None) -> dict:
    """Return importance tier for a data-input parameter.

    Three tiers: High, Medium, Low — using the project colour palette.

    Returns a dict with:
        label  – tier name
        color  – hex colour for the badge
        icon   – emoji indicator
        weight – raw numeric weight
        rank   – integer 1-3 (1 = most important)
    """
    w = get_sensitivity_weight(item_key, analysis_type)
    if w >= 15:
        return {"label": "High",   "color": "#33A9A0", "icon": "🔴", "weight": w, "rank": 1}
    if w >= 8:
        return {"label": "Medium", "color": "#8AB62E", "icon": "🟡", "weight": w, "rank": 2}
    return {"label": "Low",    "color": "#33528A", "icon": "🔵", "weight": w, "rank": 3}


# ==============================================================================
# SOLAR / RE OAT PARAMETERS
# ==============================================================================
# Same reference model, but the OAT parameters are interpreted through
# the solar-gain lens: WWR South is now "beneficial" (more glass = more
# solar gain = less heating) while WWR North drives losses.
# The CSV lives at data/sensitivity/solar_oat_results.csv.

SOLAR_OAT_PARAMETERS = {
    "wwr_south": {
        "label": "WWR South (Solar Gain)",
        "unit": "ratio",
        "data_keys": ["wwr"],
        "values": [0.04, 0.09, 0.14, 0.19, 0.24, 0.29, 0.34, 0.39, 0.44, 0.49],
        "outputs_kwh": [
            232793.26, 230955.88, 229269.27, 227746.60, 226335.41,
            225070.15, 223991.71, 223019.81, 222163.65, 221334.63,
        ],
        "range_kwh": 11458.63,
        "baseline_value": 0.24,
    },
    "wwr_north": {
        "label": "WWR North (Heat Loss)",
        "unit": "ratio",
        "data_keys": ["wwr"],
        "values": [0.04, 0.09, 0.14, 0.19, 0.24, 0.29, 0.34, 0.39, 0.44, 0.49],
        "outputs_kwh": [
            220166.13, 223635.98, 227028.12, 230419.99, 233855.33,
            237277.13, 240684.87, 244000.08, 247388.97, 250767.13,
        ],
        "range_kwh": 30601.0,
        "baseline_value": 0.24,
    },
    "wwr_east": {
        "label": "WWR East",
        "unit": "ratio",
        "data_keys": ["wwr"],
        "values": [0.04, 0.09, 0.14, 0.19, 0.24, 0.29, 0.34, 0.39, 0.44, 0.49],
        "outputs_kwh": [
            226335.41, 226847.50, 227353.04, 227855.17, 228295.53,
            228811.72, 229375.06, 229895.35, 230449.54, 231005.21,
        ],
        "range_kwh": 4669.80,
        "baseline_value": 0.24,
    },
    "wwr_west": {
        "label": "WWR West",
        "unit": "ratio",
        "data_keys": ["wwr"],
        "values": [0.04, 0.09, 0.14, 0.19, 0.24, 0.29, 0.34, 0.39, 0.44, 0.49],
        "outputs_kwh": [
            226335.41, 226395.50, 226452.13, 226512.16, 226581.38,
            226591.01, 226708.05, 226785.22, 227033.05, 227201.51,
        ],
        "range_kwh": 866.10,
        "baseline_value": 0.24,
    },
    "infiltration": {
        "label": "Infiltration Rate",
        "unit": "m³/s·m²",
        "data_keys": ["infiltration_rate"],
        "values": [
            0.0001, 0.00015, 0.0002, 0.00025, 0.0003,
            0.00035, 0.0004, 0.00045, 0.0005, 0.00055, 0.0006,
        ],
        "outputs_kwh": [
            129919.15, 143239.16, 156715.22, 170366.23, 184183.35,
            198158.18, 212251.26, 226335.41, 240635.27, 255020.16, 269353.10,
        ],
        "range_kwh": 139434.0,
        "baseline_value": 0.00045,
    },
    "construction_package": {
        "label": "Construction Quality",
        "unit": "category",
        "data_keys": ["construction_materials"],
        "values": ["P0 Poor", "P1 Baseline", "P2 Well-insulated"],
        "outputs_kwh": [279892.67, 226335.41, 201608.30],
        "range_kwh": 78284.37,
        "baseline_value": "P1 Baseline",
    },
}

TOTAL_SOLAR_OAT_RANGE = sum(p["range_kwh"] for p in SOLAR_OAT_PARAMETERS.values())
SOLAR_OAT_IMPORTANCE = {
    name: round(data["range_kwh"] / TOTAL_SOLAR_OAT_RANGE * 100, 1)
    for name, data in SOLAR_OAT_PARAMETERS.items()
}


# ==============================================================================
# GLOBAL SA CONFIGURATION
# ==============================================================================

GLOBAL_SA_LABELS = {
    "infiltration": "Infiltration Rate",
    "length_factor": "Building Length",
    "width_factor": "Building Width",
    "wwr_n": "WWR North",
    "wwr_e": "WWR East",
    "wwr_s": "WWR South",
    "wwr_w": "WWR West",
    "roof_pitch_deg": "Roof Pitch Angle",
    "construction_pkg": "Construction Package",
    "glazing_pkg": "Glazing Package",
    "floors_total": "Number of Floors",
    "roof_type": "Roof Type",
}

CATEGORICAL_ENCODING = {
    "construction_pkg": {"P0_poor": 0, "P1_baseline": 1, "P2_good": 2},
    "glazing_pkg": {"P0_poor": 0, "P1_baseline": 1, "P2_good": 2},
    "roof_type": {"gable": 0, "shed": 1},
}
