"""
Sensitivity Analysis Configuration

Defines the impact weight of each data parameter on the analysis result,
and the accuracy multiplier for proxy data sources.

How it works:
─────────────
1. PARAMETER WEIGHTS (impact_weight):
   Each data input has a weight (0.0–1.0) representing how much losing
   that parameter degrades the analysis confidence. A weight of 1.0 means
   the parameter is critical; 0.3 means it has minor impact.
   
   Weights are normalised per analysis type so they sum to 1.0 when used
   in the confidence formula.

2. PROXY ACCURACY (proxy_accuracy):
   When a parameter is missing but a proxy is used, this multiplier
   (0.0–1.0) captures how well the proxy replaces the real data.
   A proxy accuracy of 0.95 means the proxy is almost as good as the
   real data; 0.50 means the proxy introduces significant uncertainty.
   
   Proxy accuracy values are derived from the PROXY_CONFIDENCE table in
   data_inputs.py (confidence / 100) but can be overridden here.

3. CONFIDENCE FORMULA:
   For each parameter i:
     - If available (real data):   contribution_i = weight_i × 1.0
     - If proxy used:              contribution_i = weight_i × proxy_accuracy_i
     - If missing (no proxy):      contribution_i = 0.0

   Overall confidence = Σ contribution_i / Σ weight_i × 100

   This replaces the old simple average approach with a weighted,
   sensitivity-aware calculation.
"""

# ==============================================================================
# PARAMETER IMPACT WEIGHTS
# ==============================================================================
# Structure:
#   PARAMETER_WEIGHTS = {
#       "Analysis Type": {
#           "Focus": {
#               "parameter_key": impact_weight (0.0 – 1.0),
#           }
#       }
#   }
#
# Guidelines for setting weights:
#   1.0  — Critical: analysis cannot produce meaningful results without it
#   0.8  — High: significant impact on accuracy
#   0.6  — Medium: noticeable impact, but analysis can compensate
#   0.4  — Low-Medium: contributes to precision but not essential
#   0.2  — Low: minor refinement, analysis works well without it
#
# When a parameter is not listed, a default weight of 0.5 is assumed.

PARAMETER_WEIGHTS = {
    
    # ==========================================================================
    # ENERGY & CARBON PERFORMANCE
    # ==========================================================================
    "Energy & Carbon Performance": {
        "Electricity": {
            "footprint":              0.8,   # Core geometry — drives floor area calculations
            "height":                 0.6,   # Affects volume & facade area
            "num_floors":             0.7,   # Determines total floor area, zones
            "annual_electricity":     1.0,   # Critical — primary measured outcome
            "onsite_production":      0.5,   # Adjusts net consumption
            "use_type":               0.7,   # Determines load profiles
            "operating_hours":        0.6,   # Shapes demand curves
            "grid_emission_factor":   0.9,   # Critical for carbon calculation
        },
        "Heating/Cooling": {
            "footprint":              0.8,
            "height":                 0.7,
            "num_floors":             0.7,
            "wwr":                    0.8,   # Major driver of heat loss/gain
            "has_basement":           0.3,   # Minor geometric adjustment
            "orientation":            0.6,   # Solar gains dependency
            "year_construction":      0.7,   # Proxy for envelope quality
            "construction_materials": 0.9,   # Critical for U-value estimation
            "window_properties":      0.8,   # Major thermal bridge & solar gain
            "infiltration_rate":      0.7,   # Significant for heating demand
            "hvac_type":              0.9,   # Determines system efficiency
            "setpoint":               0.6,   # Affects demand magnitude
            "supply_temp":            0.5,   # System design parameter
            "location":               0.8,   # Climate data dependency
            "annual_heating_cooling": 1.0,   # Primary measured outcome
            "use_type":               0.6,
            "occupancy_pattern":      0.5,
        },
        "Whole system interaction": {
            # Combined — uses the union of Electricity + Heating/Cooling weights
            "footprint":              0.8,
            "height":                 0.7,
            "num_floors":             0.7,
            "wwr":                    0.8,
            "has_basement":           0.3,
            "orientation":            0.6,
            "year_construction":      0.7,
            "construction_materials": 0.9,
            "window_properties":      0.8,
            "infiltration_rate":      0.7,
            "hvac_type":              0.9,
            "setpoint":               0.6,
            "supply_temp":            0.5,
            "location":               0.8,
            "annual_electricity":     1.0,
            "annual_heating_cooling": 1.0,
            "onsite_production":      0.5,
            "use_type":               0.7,
            "operating_hours":        0.6,
            "occupancy_pattern":      0.5,
            "grid_emission_factor":   0.9,
        },
    },
    
    # ==========================================================================
    # SOLAR PV POTENTIAL
    # ==========================================================================
    "Solar PV Potential": {
        "default": {
            # Placeholder — fill when data inputs are defined
        },
    },
    
    # ==========================================================================
    # RENEWABLE ENERGY & LOCAL PRODUCTION
    # ==========================================================================
    "Renewable Energy & Local Production": {
        "Solar PV": {
            "footprint":              0.7,
            "height":                 0.5,
            "roof_shape_angle":       0.9,   # Critical for PV tilt optimisation
            "roof_area":              1.0,   # Directly determines capacity
            "orientation":            0.8,   # Major yield factor
            "building_location":      0.8,   # Irradiance data
            "context_location_height":0.6,   # Shading from surroundings
            "pv_module":              0.7,   # Efficiency & specs
            "installing_battery":     0.4,   # Secondary system component
        },
    },
    
    # ==========================================================================
    # RETROFIT & TRANSFORMATION
    # ==========================================================================
    "Retrofit & Transformation": {
        "default": {
            "footprint":              0.7,
            "height":                 0.6,
            "roof_shape_angle":       0.5,
            "wwr":                    0.7,
            "num_floors":             0.6,
            "construction_materials": 0.9,
            "infiltration_rate":      0.7,
            "window_properties":      0.8,
            "hvac_system":            0.8,
            "setpoint":               0.5,
            "building_location":      0.7,
            "annual_heating_demand":  1.0,
            "building_use":           0.6,
            "occupancy_pattern":      0.5,
        },
    },
    
    # ==========================================================================
    # THERMAL COMFORT (placeholder)
    # ==========================================================================
    "Thermal Comfort": {
        "default": {},
    },
    
    # ==========================================================================
    # DAYLIGHTING (placeholder)
    # ==========================================================================
    "Daylighting": {
        "default": {},
    },
    
    # ==========================================================================
    # WIND & VENTILATION (placeholder)
    # ==========================================================================
    "Wind & Ventilation": {
        "default": {},
    },
    
    # ==========================================================================
    # CLIMATE RESILIENCE (placeholder)
    # ==========================================================================
    "Climate Resilience": {
        "default": {},
    },
    
    # ==========================================================================
    # URBAN DESIGN SUPPORT (placeholder)
    # ==========================================================================
    "Urban Design Support": {
        "default": {},
    },
}


# ==============================================================================
# DEFAULT WEIGHT
# ==============================================================================
# Used when a parameter is not listed in PARAMETER_WEIGHTS

DEFAULT_WEIGHT = 0.5


# ==============================================================================
# SENSITIVITY CALCULATION FUNCTIONS
# ==============================================================================

def get_parameter_weight(analysis_type: str, focus: str, param_key: str) -> float:
    """
    Get the sensitivity weight for a single parameter.
    
    Args:
        analysis_type: e.g. "Energy & Carbon Performance"
        focus: e.g. "Electricity", "Heating/Cooling", or "default"
        param_key: the data input key, e.g. "footprint"
    
    Returns:
        Weight between 0.0 and 1.0
    """
    if analysis_type in PARAMETER_WEIGHTS:
        type_weights = PARAMETER_WEIGHTS[analysis_type]
        # Try exact focus first
        if focus and focus in type_weights:
            return type_weights[focus].get(param_key, DEFAULT_WEIGHT)
        # Try "default"
        if "default" in type_weights:
            return type_weights["default"].get(param_key, DEFAULT_WEIGHT)
    return DEFAULT_WEIGHT


def get_all_weights_for_analysis(analysis_type: str, focus: str) -> dict:
    """
    Get the full weight dictionary for an analysis type + focus.
    
    Returns:
        Dict of {param_key: weight}, or empty dict if not configured.
    """
    if analysis_type in PARAMETER_WEIGHTS:
        type_weights = PARAMETER_WEIGHTS[analysis_type]
        if focus and focus in type_weights:
            return dict(type_weights[focus])
        if "default" in type_weights:
            return dict(type_weights["default"])
    return {}


def calculate_sensitivity_confidence(
    all_items: list,
    item_status: dict,
    analysis_type: str,
    focus: str,
) -> dict:
    """
    Calculate the overall confidence score using sensitivity analysis.
    
    This replaces the old simple average with a weighted formula that
    accounts for both parameter importance and proxy accuracy.
    
    Args:
        all_items: list of item dicts (each has "key", "label", etc.)
        item_status: dict mapping item_key -> {
            "available": bool,       # True if user has the data
            "proxy_name": str|None,  # Selected proxy (if missing)
            "proxy_confidence": float|None,  # 0-100 from PROXY_CONFIDENCE table
        }
        analysis_type: e.g. "Energy & Carbon Performance"
        focus: e.g. "Electricity"
    
    Returns:
        {
            "overall_confidence": float (0-100),
            "confidence_level": str ("Good" | "Moderate" | "Low"),
            "parameter_contributions": [
                {
                    "key": str,
                    "label": str,
                    "weight": float,
                    "status": "available" | "proxy" | "missing",
                    "proxy_accuracy": float|None,
                    "contribution": float,       # actual weighted contribution
                    "max_contribution": float,   # what it would be if available
                    "impact_if_missing": float,  # confidence drop if this param removed
                }
            ],
            "total_weight": float,
            "achieved_weight": float,
        }
    """
    parameter_contributions = []
    total_weight = 0.0
    achieved_weight = 0.0
    
    for item in all_items:
        key = item["key"]
        label = item.get("label", key)
        weight = get_parameter_weight(analysis_type, focus, key)
        
        status_info = item_status.get(key, {"available": False, "proxy_name": None, "proxy_confidence": None})
        
        if status_info.get("available", False):
            # Real data available — full contribution
            contribution = weight * 1.0
            status = "available"
            proxy_accuracy = None
        elif status_info.get("proxy_name"):
            # Proxy used — partial contribution based on proxy accuracy
            proxy_conf = status_info.get("proxy_confidence")
            if proxy_conf is not None:
                proxy_accuracy = proxy_conf / 100.0  # Convert 0-100 to 0-1
            else:
                proxy_accuracy = 0.5  # Default if proxy confidence unknown
            contribution = weight * proxy_accuracy
            status = "proxy"
        else:
            # Missing with no proxy — zero contribution
            contribution = 0.0
            proxy_accuracy = None
            status = "missing"
        
        total_weight += weight
        achieved_weight += contribution
        
        parameter_contributions.append({
            "key": key,
            "label": label,
            "weight": weight,
            "status": status,
            "proxy_accuracy": proxy_accuracy,
            "contribution": round(contribution, 3),
            "max_contribution": round(weight, 3),
            "impact_if_missing": 0.0,  # computed below
        })
    
    # Calculate overall confidence
    if total_weight > 0:
        overall_confidence = round((achieved_weight / total_weight) * 100, 1)
    else:
        overall_confidence = 0.0
    
    overall_confidence = max(0.0, min(100.0, overall_confidence))
    
    # Calculate "impact if missing" for each parameter
    # = how much the confidence drops if this single parameter were removed
    for pc in parameter_contributions:
        if total_weight > 0:
            conf_without = ((achieved_weight - pc["contribution"]) / total_weight) * 100
            pc["impact_if_missing"] = round(overall_confidence - conf_without, 1)
        else:
            pc["impact_if_missing"] = 0.0
    
    # Sort by impact (highest impact first)
    parameter_contributions.sort(key=lambda x: x["impact_if_missing"], reverse=True)
    
    # Determine level
    if overall_confidence >= 70:
        confidence_level = "Good"
    elif overall_confidence >= 50:
        confidence_level = "Moderate"
    else:
        confidence_level = "Low"
    
    return {
        "overall_confidence": overall_confidence,
        "confidence_level": confidence_level,
        "parameter_contributions": parameter_contributions,
        "total_weight": round(total_weight, 3),
        "achieved_weight": round(achieved_weight, 3),
    }
