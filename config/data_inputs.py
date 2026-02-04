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
        # This is dynamically generated by combining Electricity and Heating/Cooling
        # See get_data_inputs() function for the merge logic
        # ----------------------------------------------------------------------
        "Whole system interaction": [],  # Placeholder - handled dynamically
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
# HELPER FUNCTIONS
# ==============================================================================

# Countries that use the combined Electricity + Heating/Cooling approach
WHOLE_SYSTEM_COUNTRIES = ["Ireland", "Sweden", "United Kingdom", "Belgium"]

# Scales that support Whole system interaction
WHOLE_SYSTEM_SCALES = ["Building", "Neighborhood", "City"]


def merge_data_inputs_without_duplicates(electricity_inputs: list, heating_cooling_inputs: list) -> list:
    """
    Merge Electricity and Heating/Cooling data inputs, removing duplicates.
    
    Items are considered duplicates if they have the same 'key'.
    When duplicates are found, the Heating/Cooling version is used (as it typically 
    has more detail for building fabric properties).
    
    Args:
        electricity_inputs: List of category dicts from Electricity focus
        heating_cooling_inputs: List of category dicts from Heating/Cooling focus
    
    Returns:
        Merged list of category dicts with no duplicate items
    """
    # Track all seen keys and their source
    seen_keys = {}
    
    # First pass: collect all items from Heating/Cooling (they take priority for common items)
    for category in heating_cooling_inputs:
        for item in category.get("items", []):
            seen_keys[item["key"]] = True
    
    # Build merged result
    merged = []
    category_map = {}  # category name -> category dict with items
    
    # Add all Heating/Cooling categories and items first
    for category in heating_cooling_inputs:
        cat_name = category["category"]
        if cat_name not in category_map:
            category_map[cat_name] = {"category": cat_name, "items": []}
        category_map[cat_name]["items"].extend(category.get("items", []))
    
    # Add Electricity items, skipping duplicates
    for category in electricity_inputs:
        cat_name = category["category"]
        if cat_name not in category_map:
            category_map[cat_name] = {"category": cat_name, "items": []}
        
        for item in category.get("items", []):
            if item["key"] not in seen_keys:
                category_map[cat_name]["items"].append(item)
                seen_keys[item["key"]] = True
    
    # Convert to list, maintaining a logical order
    # Priority order for categories
    category_order = [
        "Building Geometry",
        "Building Fabric & Construction",
        "Building System",
        "Measured Energy Data",
        "Renewable Energy System",
        "Building Use & Operation",
        "Building Use",
        "Location Context",
        "Grid System",
    ]
    
    for cat_name in category_order:
        if cat_name in category_map and category_map[cat_name]["items"]:
            merged.append(category_map[cat_name])
    
    # Add any remaining categories not in the priority list
    for cat_name, cat_data in category_map.items():
        if cat_name not in category_order and cat_data["items"]:
            merged.append(cat_data)
    
    return merged


def get_data_inputs(analysis_type: str, focus: str, scale: str = None, context: str = None) -> list:
    """
    Get the FIXED data inputs list for a given analysis type and focus.
    
    This function returns the same list every time for the same inputs.
    The list does NOT change based on user interactions.
    
    For "Whole system interaction" focus with specific scales and contexts,
    this function combines Electricity and Heating/Cooling inputs without duplicates.
    
    Args:
        analysis_type: The selected analysis type (e.g., "Energy & Carbon Performance")
        focus: The selected focus (e.g., "Electricity", "Heating/Cooling", "Whole system interaction")
        scale: The selected scale (e.g., "Building", "Neighbourhood", "City")
        context: The selected context/country (e.g., "Ireland", "Sweden")
    
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
    
    # Special handling for "Whole system interaction" focus
    if focus == "Whole system interaction":
        # Check if scale and context qualify for combined inputs
        scale_qualifies = scale in WHOLE_SYSTEM_SCALES if scale else True
        context_qualifies = context in WHOLE_SYSTEM_COUNTRIES if context else True
        
        if scale_qualifies and context_qualifies:
            # Get Electricity and Heating/Cooling inputs
            electricity_inputs = focus_data.get("Electricity", [])
            heating_cooling_inputs = focus_data.get("Heating/Cooling", [])
            
            if electricity_inputs and heating_cooling_inputs:
                return merge_data_inputs_without_duplicates(electricity_inputs, heating_cooling_inputs)
        
        # If conditions not met or inputs not available, return empty or placeholder
        return []
    
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
