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
    "window_to_wall_ratio": {
        "label": "Window-to-Wall Ratio",
        "unit": "ratio (0-1)",
        "data_keys": ["wwr"],
        "values": [
            "North (Low 4%)", "North (High 49%)",
            "South (Low 4%)", "South (High 49%)",
            "East (Low 4%)", "East (High 49%)",
            "West (Low 4%)", "West (High 49%)"
        ],
        "outputs_kwh": [
            # Combined range from all facades showing min/max for each
            220166.13,  # North low (worst case - max heat loss)
            250767.13,  # North high
            221334.63,  # South low (best case for south - less solar gain needed in heating)
            232793.26,  # South high
            226335.41,  # East low (baseline)
            231005.21,  # East high
            226335.41,  # West low (baseline)
            227201.51,  # West high
        ],
        "range_kwh": 30601.0,  # Maximum range (North facade has largest impact)
        "baseline_value": "All facades 24%",
        "facade_details": {
            "North": {"range_kwh": 30601.0, "impact": "High - heat loss dominates"},
            "South": {"range_kwh": 11458.63, "impact": "Moderate - solar gain vs heat loss"},
            "East": {"range_kwh": 4669.80, "impact": "Low - morning sun"},
            "West": {"range_kwh": 866.10, "impact": "Very Low - afternoon sun"},
        }
    },

    # ------------------------------------------------------------------
    # NEW OAT PARAMETERS (added from latest simulation results)
    # ------------------------------------------------------------------

    "roof_shape_angle": {
        "label": "Roof Shape & Angle",
        "unit": "degrees or type",
        "data_keys": ["roof_shape_angle"],
        "values": ["Flat (0°)", "Low (10°)", "Moderate (15-25°)", "Steep (35-45°)", "Gable", "Shed"],
        "outputs_kwh": [
            # Combined range from both gable and shed roof types
            # Flat: 224629.69 (shed) to 225100.96 (gable)
            # Steep gable: up to 436418.24
            # Shows uncertainty from not knowing roof shape/angle
            224865.33,  # Flat (average of both types)
            235129.42,  # Low pitch (average ~10°)
            244228.38,  # Moderate pitch (average 15-25°)
            299146.88,  # Steep pitch (average 35-45°)
            225100.96,  # Gable baseline (flat)
            247602.52,  # Shed maximum
        ],
        "range_kwh": 211553.11,  # Maximum range across all roof shapes/angles
        "baseline_value": "Flat (0°)",
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
    # Weights for the RE-specific data-input keys (re_rpv_*, re_fpv_*,
    # re_cpv_*, re_bat_*) used in step2plus_data_inputs.py.
    #
    # Mapping methodology:
    #   • SA-backed params  → weight derived from OAT annual % swing
    #       swing ≥ 20%  → 20  (High)
    #       swing 10–19% → 15  (High)
    #       swing  4–9%  → 10  (Medium)
    #       swing  1–3%  → 5   (Low)
    #       swing < 1%   → 3   (Low)
    #   • Non-SA params     → classified by domain knowledge / literature
    #       High     = 18   (physical / regulatory constraint)
    #       Medium   = 10   (economic / planning parameter)
    #       Low      = 5    (logistics / organisational)
    "Renewable Energy & Local Production": {

        # ────────────────── ROOFTOP PV ───────────────────────────────
        "re_rpv_electricity_demand": 18.0,  # energy demand → High
        "re_rpv_location":           18.0,  # determines GHI → High
        "re_rpv_roof_area":          20.0,  # SA: roof_coverage 59% swing → High
        "re_rpv_tilt":               15.0,  # SA: roof_tilt 14.6% swing → High
        "re_rpv_azimuth":            10.0,  # SA: building_azimuth 4.4% → Medium

        # ────────────────── FACADE PV (BIPV) ────────────────────────
        "re_fpv_electricity_demand": 18.0,  # energy demand → High
        "re_fpv_location":           18.0,  # determines GHI → High
        "re_fpv_facade_area":        20.0,  # SA: facade_cov_S 51% swing → High
        "re_fpv_wwr":                18.0,  # determines usable façade → High
        "re_fpv_orientation":        18.0,  # S vs N matters hugely → High

        # ────────────────── COMMUNITY PV ────────────────────────────
        "re_cpv_location":           18.0,  # determines GHI → High
        "re_cpv_site_area":          20.0,  # SA: roof_coverage concept → High
        "re_cpv_slope":              15.0,  # SA: roof_tilt concept → High
        "re_cpv_existing_infra":      5.0,  # logistics → Low
        "re_cpv_grid_connection":    18.0,  # infrastructure constraint → High

        # ────────────────── BATTERY STORAGE ─────────────────────────
        "re_bat_priority":            8.0,  # operational strategy → Low–Medium
        "re_bat_location":            5.0,  # logistics → Low
        "re_bat_area":                5.0,  # logistics → Low
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


# ==============================================================================
# SOLAR PV SENSITIVITY ANALYSIS  (Renewable Energy Planning)
# ==============================================================================
# Results from OAT and Morris screening analyses on a reference solar PV system
# with rooftop + façade-integrated panels (Swedish climate, PVWatts-based model).
# Output metrics: annual PV production (kWh), winter production (Oct–Mar kWh),
# and specific yield (kWh/kWdc).

SOLAR_PV_BASELINE = {
    "annual_kwh": 88385.07,
    "winter_kwh": 17174.19,
    "specific_yield": 722.13,   # kWh per kWdc installed
}

SOLAR_PV_LABELS = {
    "roof_coverage":      "Roof PV Coverage",
    "facade_cov_S":       "South Façade Coverage",
    "facade_cov_N":       "North Façade Coverage",
    "facade_cov_E":       "East Façade Coverage",
    "facade_cov_W":       "West Façade Coverage",
    "module_efficiency":  "Module Efficiency",
    "roof_tilt":          "Roof Tilt Angle",
    "roof_type":          "Roof Type",
    "losses_percent":     "System Losses",
    "facade_shading":     "Façade Shading",
    "winter_snow_derate": "Winter Snow Derating",
    "building_azimuth":   "Building Orientation",
    "availability":       "System Availability",
    "array_type":         "Array Type",
    "snowloss_enabled":   "Snow Loss Model",
    "dc_ac_ratio":        "DC/AC Ratio",
    "albedo":             "Ground Albedo",
}

# OAT results: (delta_low_pct, delta_high_pct, max_abs_swing_pct)
# Negative delta = production decreases; positive = production increases.
SOLAR_PV_OAT_ANNUAL = {
    "roof_coverage":      (-59.04,  23.62, 59.04),
    "facade_cov_S":       (-19.56,  50.85, 50.85),
    "module_efficiency":  (-25.00,  15.00, 25.00),
    "facade_cov_N":       ( -3.80,  18.98, 18.98),
    "roof_tilt":          ( -1.52,  14.63, 14.63),
    "roof_type":          ( 13.45,   0.00, 13.45),
    "losses_percent":     ( 10.69, -13.07, 13.07),
    "facade_shading":     (  3.24, -12.96, 12.96),
    "facade_cov_W":       ( -2.92,  10.23, 10.23),
    "facade_cov_E":       ( -2.87,  10.06, 10.06),
    "winter_snow_derate": (  2.16,  -6.48,  6.48),
    "building_azimuth":   ( -4.39,  -4.40,  4.40),
    "availability":       ( -4.04,   1.01,  4.04),
    "array_type":         ( -1.23,   0.00,  1.23),
    "snowloss_enabled":   (  0.82,   0.00,  0.82),
    "dc_ac_ratio":        ( -0.43,  -0.03,  0.43),
}

SOLAR_PV_OAT_WINTER = {
    "facade_cov_S":       (-34.47,  89.63, 89.63),
    "roof_coverage":      (-47.51,  19.01, 47.51),
    "roof_tilt":          ( -4.38,  42.45, 42.45),
    "winter_snow_derate": ( 11.11, -33.33, 33.33),
    "roof_type":          ( 27.56,   0.00, 27.56),
    "module_efficiency":  (-25.00,  15.00, 25.00),
    "facade_shading":     (  4.78, -19.10, 19.10),
    "facade_cov_N":       ( -3.15,  15.73, 15.73),
    "losses_percent":     ( 10.82, -13.23, 13.23),
    "facade_cov_W":       ( -2.80,   9.81,  9.81),
    "building_azimuth":   ( -9.36,  -9.35,  9.36),
    "facade_cov_E":       ( -2.56,   8.96,  8.96),
    "snowloss_enabled":   (  4.24,   0.00,  4.24),
    "availability":       ( -4.04,   1.01,  4.04),
    "array_type":         ( -3.38,   0.00,  3.38),
    "dc_ac_ratio":        ( -0.69,   0.36,  0.69),
}

SOLAR_PV_OAT_SPECIFIC_YIELD = {
    "facade_cov_N":       (  9.02, -25.07, 25.07),
    "roof_type":          ( 13.45,   0.00, 13.45),
    "losses_percent":     ( 10.69, -13.07, 13.07),
    "roof_coverage":      (-12.47,   1.92, 12.47),
    "roof_tilt":          (  0.43,  -7.08,  7.08),
    "winter_snow_derate": (  2.16,  -6.48,  6.48),
    "building_azimuth":   ( -4.39,  -4.40,  4.40),
    "facade_cov_S":       ( -2.94,   4.39,  4.39),
    "availability":       ( -4.04,   1.01,  4.04),
    "facade_shading":     ( -0.75,   3.71,  3.71),
    "facade_cov_E":       (  0.79,  -2.37,  2.37),
    "facade_cov_W":       (  0.74,  -2.21,  2.21),
    "array_type":         ( -1.23,   0.00,  1.23),
    "snowloss_enabled":   (  0.82,   0.00,  0.82),
    "dc_ac_ratio":        ( -0.43,  -0.03,  0.43),
    "module_efficiency":  (  0.00,   0.00,  0.00),
}

# Morris screening: (mu_star, sigma)  — μ* = mean |elementary effect|, σ = std
SOLAR_PV_MORRIS = {
    "annual_kwh": {
        "roof_coverage":      (63604.73, 15185.88),
        "facade_cov_N":       (40808.54, 17313.44),
        "module_efficiency":  (30960.43, 11413.80),
        "facade_cov_S":       (25825.38, 12823.53),
        "building_azimuth":   (25397.33, 37904.66),
        "facade_shading":     (24124.61, 11388.31),
        "losses_percent":     (20929.71,  5767.81),
        "roof_type":          (16858.43, 20943.84),
        "roof_tilt":          (10018.64, 12892.87),
        "facade_cov_E":       ( 8808.58,  4061.50),
        "winter_snow_derate": ( 8001.83,  2594.27),
        "facade_cov_W":       ( 6786.82,  3401.22),
        "array_type":         ( 4106.81,  2516.15),
        "availability":       ( 3835.15,  1521.50),
        "dc_ac_ratio":        (  954.35,  1044.05),
        "snowloss_enabled":   (  652.85,   350.37),
    },
    "winter_kwh": {
        "facade_cov_N":       ( 9996.31,  6340.33),
        "roof_coverage":      ( 9104.10,  3840.49),
        "building_azimuth":   ( 8789.60, 12898.78),
        "winter_snow_derate": ( 8001.83,  2594.27),
        "facade_cov_S":       ( 5762.24,  4461.39),
        "module_efficiency":  ( 5761.22,  2386.26),
        "roof_type":          ( 5411.27,  6549.46),
        "facade_shading":     ( 5184.31,  3049.11),
        "losses_percent":     ( 3856.35,  1560.97),
        "roof_tilt":          ( 2489.17,  2871.13),
        "facade_cov_E":       ( 1755.33,  1146.54),
        "array_type":         ( 1437.29,   961.37),
        "facade_cov_W":       ( 1225.98,  1181.76),
        "availability":       (  658.60,   348.27),
        "snowloss_enabled":   (  652.85,   350.37),
        "dc_ac_ratio":        (  254.01,   251.40),
    },
    "specific_yield": {
        "building_azimuth":   (178.91, 261.76),
        "losses_percent":     (126.79,  15.21),
        "roof_type":          (101.37, 123.74),
        "roof_coverage":      ( 92.24,  80.17),
        "facade_cov_N":       ( 79.93, 100.84),
        "facade_cov_S":       ( 77.62,  80.67),
        "roof_tilt":          ( 63.81,  76.51),
        "winter_snow_derate": ( 51.25,  13.88),
        "facade_shading":     ( 33.33,  28.56),
        "availability":       ( 26.66,   3.86),
        "array_type":         ( 25.81,  11.16),
        "facade_cov_W":       ( 18.50,  20.90),
        "facade_cov_E":       ( 16.10,  20.67),
        "dc_ac_ratio":        (  5.83,   6.12),
        "snowloss_enabled":   (  4.61,   1.83),
        "module_efficiency":  (  0.33,   0.33),
    },
}

# Stakeholder-friendly descriptions of each solar PV parameter
SOLAR_PV_DESCRIPTIONS = {
    "roof_coverage":      "Share of roof area covered by PV panels. The single biggest driver of total production — more panels = more electricity.",
    "facade_cov_S":       "Share of south-facing façade with PV. South façades get the most sun and dramatically boost winter production.",
    "facade_cov_N":       "Share of north-facing façade with PV. North panels produce less but add to total capacity; removing them improves specific yield.",
    "facade_cov_E":       "Share of east-facing façade with PV. East panels capture morning sun — moderate benefit.",
    "facade_cov_W":       "Share of west-facing façade with PV. West panels capture afternoon sun — similar to east in impact.",
    "module_efficiency":  "Conversion efficiency of PV modules (%). Higher efficiency panels produce more per m², but cost more.",
    "roof_tilt":          "Tilt angle of roof-mounted panels. Optimal tilt depends on latitude; wrong tilt especially hurts winter production.",
    "roof_type":          "Gable vs shed (mono-pitch) roof. Roof shape affects how much roof area faces the optimal direction.",
    "losses_percent":     "System losses from wiring, soiling, mismatch, etc. Keeping losses low is a reliable way to boost output.",
    "facade_shading":     "Shading on façade panels from nearby buildings or trees. Shading reduces production and is hard to predict without a site survey.",
    "winter_snow_derate": "Production loss from snow covering panels in winter. Very important in Nordic climates — can cut winter output by a third.",
    "building_azimuth":   "Compass orientation of the building. Affects how much sun reaches roof and façade surfaces throughout the day.",
    "availability":       "Fraction of time the system is operational. Accounts for maintenance downtime and grid outages.",
    "array_type":         "Fixed-tilt vs tracking mount. Tracking systems follow the sun but add cost and complexity.",
    "snowloss_enabled":   "Whether the energy model accounts for snow-related losses. A modelling choice, not a physical parameter.",
    "dc_ac_ratio":        "Ratio of DC panel capacity to AC inverter capacity. Oversizing DC slightly boosts output but beyond a point causes clipping.",
    "albedo":             "Ground reflectance. Has negligible impact in this study.",
}
