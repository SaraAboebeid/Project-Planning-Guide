"""
Data Inputs Configuration for Step 2: Review Data

This file defines ALL data inputs for each analysis type and focus combination.
The structure is designed to be easily editable and extendable.

Structure:
    DATA_INPUTS = {
        "Analysis Type Name": {
            "Focus Name": [
                {
                    "category": "Category Name",
                    "items": [
                        {
                            "key": "unique_key",
                            "label": "Display Label",
                            "recommended_source": "Where to get this data",
                            "proxy_options": ["Proxy 1", "Proxy 2"],
                            "type": "standard" | "yes_no",  # optional, defaults to "standard"
                            "followup_label": "Label for followup input",  # only for yes_no type
                        }
                    ]
                }
            ]
        }
    }
"""

# ==============================================================================
# MAIN DATA INPUTS CONFIGURATION
# ==============================================================================

DATA_INPUTS = {
    
    # ==========================================================================
    # ENERGY & CARBON PERFORMANCE
    # ==========================================================================
    "Energy & Carbon Performance": {
        
        # ----------------------------------------------------------------------
        # ELECTRICITY FOCUS
        # ----------------------------------------------------------------------
        "Electricity": [
            {
                "category": "Building Geometry",
                "items": [
                    {
                        "key": "footprint",
                        "label": "Footprint dimension",
                        "recommended_source": "",  # TODO: Fill in
                        "proxy_options": [],  # TODO: Fill in
                    },
                    {
                        "key": "height",
                        "label": "Height",
                        "recommended_source": "",  # TODO: Fill in
                        "proxy_options": [],  # TODO: Fill in
                    },
                    {
                        "key": "num_floors",
                        "label": "Number of Floors",
                        "recommended_source": "",  # TODO: Fill in
                        "proxy_options": [],  # TODO: Fill in
                    },
                ]
            },
            {
                "category": "Measured Energy Data",
                "items": [
                    {
                        "key": "annual_electricity",
                        "label": "Annual Electricity Consumption",
                        "recommended_source": "",  # TODO: Fill in
                        "proxy_options": [],  # TODO: Fill in
                    },
                ]
            },
            {
                "category": "Renewable Energy System",
                "items": [
                    {
                        "key": "onsite_production",
                        "label": "Is there on-site electricity production?",
                        "type": "yes_no",
                        "followup_label": "Annual on-site electricity production",
                        "recommended_source": "",  # TODO: Fill in
                        "proxy_options": [],  # TODO: Fill in
                    },
                ]
            },
            {
                "category": "Building Use & Operation",
                "items": [
                    {
                        "key": "use_type",
                        "label": "Use type",
                        "recommended_source": "",  # TODO: Fill in
                        "proxy_options": [],  # TODO: Fill in
                    },
                    {
                        "key": "operating_hours",
                        "label": "Operating hours",
                        "recommended_source": "",  # TODO: Fill in
                        "proxy_options": [],  # TODO: Fill in
                    },
                ]
            },
            {
                "category": "Grid System",
                "items": [
                    {
                        "key": "grid_emission_factor",
                        "label": "Grid emission factor",
                        "recommended_source": "",  # TODO: Fill in
                        "proxy_options": [],  # TODO: Fill in
                    },
                ]
            },
        ],
        
        # ----------------------------------------------------------------------
        # HEATING/COOLING FOCUS
        # ----------------------------------------------------------------------
        "Heating/Cooling": [
            {
                "category": "Building Geometry",
                "items": [
                    {
                        "key": "footprint",
                        "label": "Footprint dimension",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                    {
                        "key": "height",
                        "label": "Height",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                    {
                        "key": "num_floors",
                        "label": "Number of floors",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                    {
                        "key": "wwr",
                        "label": "Window to wall ratio",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                    {
                        "key": "has_basement",
                        "label": "Does the building have basement?",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                    {
                        "key": "orientation",
                        "label": "Building Orientation",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                ]
            },
            {
                "category": "Building Fabric & Construction",
                "items": [
                    {
                        "key": "year_construction",
                        "label": "Year of construction/renovation",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                    {
                        "key": "construction_materials",
                        "label": "Construction materials",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                    {
                        "key": "window_properties",
                        "label": "Window properties",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                    {
                        "key": "infiltration_rate",
                        "label": "Infiltration rate",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                ]
            },
            {
                "category": "Building System",
                "items": [
                    {
                        "key": "hvac_type",
                        "label": "Type of HVAC system",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                    {
                        "key": "setpoint",
                        "label": "Heating/Cooling Setpoint",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                    {
                        "key": "supply_temp",
                        "label": "Supply temperature",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                ]
            },
            {
                "category": "Location Context",
                "items": [
                    {
                        "key": "location",
                        "label": "Building location",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                ]
            },
            {
                "category": "Measured Energy Data",
                "items": [
                    {
                        "key": "annual_heating_cooling",
                        "label": "Annual Heating/Cooling demand",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                ]
            },
            {
                "category": "Building Use",
                "items": [
                    {
                        "key": "use_type",
                        "label": "Use type",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                    {
                        "key": "occupancy_pattern",
                        "label": "Occupancy pattern",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                ]
            },
        ],
        
        # ----------------------------------------------------------------------
        # WHOLE SYSTEM INTERACTION FOCUS
        # ----------------------------------------------------------------------
        "Whole system interaction": [
            # TODO: Add combined data inputs
        ],
    },
    
    # ==========================================================================
    # SOLAR PV POTENTIAL
    # ==========================================================================
    "Solar PV Potential": {
        "default": [
            # TODO: Add Solar PV data inputs
        ],
    },
    
    # ==========================================================================
    # THERMAL COMFORT
    # ==========================================================================
    "Thermal Comfort": {
        "default": [
            # TODO: Add Thermal Comfort data inputs
        ],
    },
    
    # ==========================================================================
    # DAYLIGHTING
    # ==========================================================================
    "Daylighting": {
        "default": [
            # TODO: Add Daylighting data inputs
        ],
    },
    
    # ==========================================================================
    # WIND & VENTILATION
    # ==========================================================================
    "Wind & Ventilation": {
        "default": [
            # TODO: Add Wind & Ventilation data inputs
        ],
    },
    
    # ==========================================================================
    # RENEWABLE ENERGY & LOCAL PRODUCTION
    # ==========================================================================
    "Renewable Energy & Local Production": {
        "default": [
            # TODO: Add Renewable Energy data inputs
        ],
    },
    
    # ==========================================================================
    # CLIMATE RESILIENCE
    # ==========================================================================
    "Climate Resilience": {
        "default": [
            # TODO: Add Climate Resilience data inputs
        ],
    },
}


# ==============================================================================
# HELPER FUNCTION
# ==============================================================================

def get_data_inputs(analysis_type: str, focus: str) -> list:
    """
    Get the FIXED data inputs list for a given analysis type and focus.
    
    This function returns the same list every time for the same inputs.
    The list does NOT change based on user interactions.
    
    Args:
        analysis_type: The selected analysis type (e.g., "Energy & Carbon Performance")
        focus: The selected focus (e.g., "Electricity")
    
    Returns:
        List of category dictionaries with items, or empty list if not configured
    """
    if not analysis_type:
        return []
    
    # Handle list input (from multiselect)
    if isinstance(analysis_type, list):
        if not analysis_type:
            return []
        analysis_type = analysis_type[0]
    
    if analysis_type not in DATA_INPUTS:
        return []
    
    focus_data = DATA_INPUTS[analysis_type]
    
    # Try exact focus match first
    if focus and focus in focus_data:
        return focus_data[focus]
    
    # Fall back to "default" if exists
    if "default" in focus_data:
        return focus_data["default"]
    
    # Fall back to first available focus
    for key in focus_data:
        if focus_data[key]:
            return focus_data[key]
    
    return []
