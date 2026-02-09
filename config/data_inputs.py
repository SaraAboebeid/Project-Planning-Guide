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
        
        # ----------------------------------------------------------------------
        # SOLAR PV FOCUS
        # ----------------------------------------------------------------------
        "Solar PV": [
            {
                "category": "Building Geometry",
                "items": [
                    {
                        "key": "footprint",
                        "label": "Footprint dimensions",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                    {
                        "key": "height",
                        "label": "Building height",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                    {
                        "key": "roof_shape_angle",
                        "label": "Roof shape and angle",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                    {
                        "key": "roof_area",
                        "label": "Roof area",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                    {
                        "key": "orientation",
                        "label": "Building orientation",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                ]
            },
            {
                "category": "Location and Context",
                "items": [
                    {
                        "key": "building_location",
                        "label": "Building location",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                    {
                        "key": "context_location_height",
                        "label": "Context location and height",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                ]
            },
            {
                "category": "Renewable Energy System",
                "items": [
                    {
                        "key": "pv_module",
                        "label": "PV module",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                    {
                        "key": "installing_battery",
                        "label": "Are you installing battery?",
                        "type": "yes_no",
                        "followup_label": "Battery module",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                ]
            },
        ],
        
        # ----------------------------------------------------------------------
        # DEFAULT / OTHER RENEWABLE TYPES
        # ----------------------------------------------------------------------
        "default": [
            # TODO: Add default Renewable Energy data inputs
        ],
    },
    
    # ==========================================================================
    # RETROFIT & TRANSFORMATION
    # ==========================================================================
    "Retrofit & Transformation": {
        "default": [
            {
                "category": "Building Geometry",
                "items": [
                    {
                        "key": "footprint",
                        "label": "Footprint dimensions",
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
                        "key": "roof_shape_angle",
                        "label": "Roof shape and angle",
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
                        "key": "num_floors",
                        "label": "Number of Floors",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                ]
            },
            {
                "category": "Building Fabric & Construction",
                "items": [
                    {
                        "key": "construction_materials",
                        "label": "Construction materials",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                    {
                        "key": "infiltration_rate",
                        "label": "Infiltration rate",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                    {
                        "key": "window_properties",
                        "label": "Windows properties",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                ]
            },
            {
                "category": "Building System",
                "items": [
                    {
                        "key": "hvac_system",
                        "label": "HVAC system",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                    {
                        "key": "setpoint",
                        "label": "Heating/cooling setpoint",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                ]
            },
            {
                "category": "Location Context",
                "items": [
                    {
                        "key": "building_location",
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
                        "key": "annual_heating_demand",
                        "label": "Annual heating demand",
                        "recommended_source": "",
                        "proxy_options": [],
                    },
                ]
            },
            {
                "category": "Building Use & Operation",
                "items": [
                    {
                        "key": "building_use",
                        "label": "Building use",
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
    },
    
    # ==========================================================================
    # CLIMATE RESILIENCE
    # ==========================================================================
    "Climate Resilience": {
        
        # ----------------------------------------------------------------------
        # CLIMATE PROJECTIONS
        # ----------------------------------------------------------------------
        "Climate Projections": [
            # TODO: Add Climate Projections data inputs
        ],
        
        # ----------------------------------------------------------------------
        # COOLING DEMAND IMPACT
        # ----------------------------------------------------------------------
        "Cooling Demand Impact": [
            # TODO: Add Cooling Demand Impact data inputs
        ],
        
        # ----------------------------------------------------------------------
        # EXTREME HEAT ANALYSIS
        # ----------------------------------------------------------------------
        "Extreme Heat Analysis": [
            # TODO: Add Extreme Heat Analysis data inputs
        ],
        
        # ----------------------------------------------------------------------
        # FLOOD RISK ASSESSMENT (Neighborhood/City only)
        # ----------------------------------------------------------------------
        "Flood Risk Assessment": [
            # TODO: Add Flood Risk Assessment data inputs
        ],
        
        # ----------------------------------------------------------------------
        # WIND & VENTILATION ANALYSIS
        # ----------------------------------------------------------------------
        "Wind & Ventilation Analysis": [
            # TODO: Add Wind & Ventilation Analysis data inputs
        ],
        
        "default": [
            # TODO: Add default Climate Resilience data inputs
        ],
    },
    
    # ==========================================================================
    # URBAN DESIGN SUPPORT
    # ==========================================================================
    "Urban Design Support": {
        
        # ----------------------------------------------------------------------
        # ACCESSIBILITY
        # ----------------------------------------------------------------------
        "Accessibility": [
            # TODO: Add Accessibility data inputs
        ],
        
        # ----------------------------------------------------------------------
        # AMENITIES DEMAND
        # ----------------------------------------------------------------------
        "Amenities Demand": [
            # TODO: Add Amenities Demand data inputs
        ],
        
        # ----------------------------------------------------------------------
        # ECOSYSTEM & HABITAT
        # ----------------------------------------------------------------------
        "Ecosystem & Habitat": [
            # TODO: Add Ecosystem & Habitat data inputs
        ],
        
        # ----------------------------------------------------------------------
        # NOISE
        # ----------------------------------------------------------------------
        "Noise": [
            # TODO: Add Noise data inputs
        ],
        
        # ----------------------------------------------------------------------
        # PARKING STUDIES
        # ----------------------------------------------------------------------
        "Parking Studies": [
            # TODO: Add Parking Studies data inputs
        ],
        
        # ----------------------------------------------------------------------
        # TRAFFIC & CONGESTION
        # ----------------------------------------------------------------------
        "Traffic & Congestion": [
            # TODO: Add Traffic & Congestion data inputs
        ],
        
        # ----------------------------------------------------------------------
        # URBAN HEAT ISLAND
        # ----------------------------------------------------------------------
        "Urban Heat Island": [
            # TODO: Add Urban Heat Island data inputs
        ],
        
        "default": [
            # TODO: Add default Urban Design Support data inputs
        ],
    },
}


# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================

# Countries that support Solar PV data inputs
SOLAR_PV_COUNTRIES = ["Ireland", "Sweden", "United Kingdom", "Belgium"]

# Scales that support Solar PV
SOLAR_PV_SCALES = ["Building", "Neighborhood", "City"]

# Countries that support Retrofit & Transformation data inputs
RETROFIT_COUNTRIES = ["Ireland", "Sweden", "United Kingdom", "Belgium"]

# Scales that support Retrofit & Transformation
RETROFIT_SCALES = ["Building", "Neighborhood", "City"]

# Countries that use the combined Electricity + Heating/Cooling approach
WHOLE_SYSTEM_COUNTRIES = ["Ireland", "Sweden", "United Kingdom", "Belgium"]

# Scales that support Whole system interaction
WHOLE_SYSTEM_SCALES = ["Building", "Neighborhood", "City"]

# Countries that support Urban Design Support data inputs
URBAN_DESIGN_COUNTRIES = ["Belgium", "Ireland", "Sweden", "United Kingdom"]

# Scales that support Urban Design Support (NOT Building - only Neighborhood and City)
URBAN_DESIGN_SCALES = ["Neighborhood", "City"]

# Countries that support Climate Resilience data inputs
CLIMATE_RESILIENCE_COUNTRIES = ["Belgium", "Ireland", "Sweden", "United Kingdom"]

# Scales that support Climate Resilience (all scales)
CLIMATE_RESILIENCE_SCALES = ["Building", "Neighborhood", "City"]

# Scales that support Flood Risk Assessment (NOT Building - only Neighborhood and City)
FLOOD_RISK_SCALES = ["Neighborhood", "City"]


def merge_data_inputs_without_duplicates(*input_lists) -> list:
    """
    Merge multiple data input lists, removing duplicates.
    
    Items are considered duplicates if they have the same 'key'.
    When duplicates are found, the first occurrence is kept.
    
    Args:
        *input_lists: Variable number of lists of category dicts to merge
    
    Returns:
        Merged list of category dicts with no duplicate items
    """
    # Track all seen keys
    seen_keys = set()
    
    # Build merged result using a category map
    category_map = {}  # category name -> category dict with items
    
    # Process each input list in order
    for inputs in input_lists:
        if not inputs:
            continue
        for category in inputs:
            cat_name = category.get("category", "Other")
            if cat_name not in category_map:
                category_map[cat_name] = {"category": cat_name, "items": []}
            
            for item in category.get("items", []):
                item_key = item.get("key", item.get("label", ""))
                if item_key not in seen_keys:
                    category_map[cat_name]["items"].append(item)
                    seen_keys.add(item_key)
    
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
        "Location and Context",
        "Grid System",
    ]
    
    merged = []
    for cat_name in category_order:
        if cat_name in category_map and category_map[cat_name]["items"]:
            merged.append(category_map[cat_name])
    
    # Add any remaining categories not in the priority list
    for cat_name, cat_data in category_map.items():
        if cat_name not in category_order and cat_data["items"]:
            merged.append(cat_data)
    
    return merged


def get_data_inputs_for_single_analysis(analysis_type: str, focus: str, scale: str = None, context: str = None, renewable_types: list = None, urban_design_types: list = None, climate_resilience_types: list = None) -> list:
    """
    Get the data inputs for a SINGLE analysis type.
    
    This is a helper function used by get_data_inputs to handle one analysis type at a time.
    """
    if not analysis_type or analysis_type not in DATA_INPUTS:
        return []
    
    focus_data = DATA_INPUTS[analysis_type]
    
    # Special handling for "Retrofit & Transformation"
    if analysis_type == "Retrofit & Transformation":
        scale_qualifies = scale in RETROFIT_SCALES if scale else True
        context_qualifies = context in RETROFIT_COUNTRIES if context else True
        
        if scale_qualifies and context_qualifies:
            if "default" in focus_data and focus_data["default"]:
                return focus_data["default"]
    
    # Special handling for "Urban Design Support"
    if analysis_type == "Urban Design Support":
        # Check if scale and context qualify for Urban Design Support
        scale_qualifies = scale in URBAN_DESIGN_SCALES if scale else True
        context_qualifies = context in URBAN_DESIGN_COUNTRIES if context else True
        
        if not scale_qualifies or not context_qualifies:
            return []  # Urban Design Support only works at Neighborhood/City scale
        
        all_urban_inputs = []
        
        if urban_design_types:
            for urban_type in urban_design_types:
                # Check if we have specific data inputs for this urban design type
                if urban_type in focus_data and focus_data[urban_type]:
                    all_urban_inputs.append(focus_data[urban_type])
        
        # Merge all urban design inputs if we have multiple
        if len(all_urban_inputs) > 1:
            return merge_data_inputs_without_duplicates(*all_urban_inputs)
        elif len(all_urban_inputs) == 1:
            return all_urban_inputs[0]
        
        # Fall back to default if no specific urban design type matched
        if "default" in focus_data and focus_data["default"]:
            return focus_data["default"]
        return []
    
    # Special handling for "Climate Resilience"
    if analysis_type == "Climate Resilience":
        # Check if context qualifies
        context_qualifies = context in CLIMATE_RESILIENCE_COUNTRIES if context else True
        
        if not context_qualifies:
            return []
        
        all_climate_inputs = []
        
        if climate_resilience_types:
            for climate_type in climate_resilience_types:
                # Special handling for Flood Risk Assessment - only Neighborhood/City
                if climate_type == "Flood Risk Assessment":
                    if scale and scale not in FLOOD_RISK_SCALES:
                        continue  # Skip Flood Risk Assessment for Building scale
                
                # Check if we have specific data inputs for this climate type
                if climate_type in focus_data and focus_data[climate_type]:
                    all_climate_inputs.append(focus_data[climate_type])
        
        # Merge all climate inputs if we have multiple
        if len(all_climate_inputs) > 1:
            return merge_data_inputs_without_duplicates(*all_climate_inputs)
        elif len(all_climate_inputs) == 1:
            return all_climate_inputs[0]
        
        # Fall back to default if no specific climate type matched
        if "default" in focus_data and focus_data["default"]:
            return focus_data["default"]
        return []
    
    # Special handling for "Renewable Energy & Local Production"
    if analysis_type == "Renewable Energy & Local Production":
        all_renewable_inputs = []
        
        if renewable_types:
            for renewable_type in renewable_types:
                # Check if we have specific data inputs for this renewable type
                if renewable_type == "Solar PV":
                    scale_qualifies = scale in SOLAR_PV_SCALES if scale else True
                    context_qualifies = context in SOLAR_PV_COUNTRIES if context else True
                    
                    if scale_qualifies and context_qualifies and "Solar PV" in focus_data:
                        all_renewable_inputs.append(focus_data["Solar PV"])
                
                # Add more renewable types here as they are defined
                # elif renewable_type == "Onshore Wind":
                #     if "Onshore Wind" in focus_data:
                #         all_renewable_inputs.append(focus_data["Onshore Wind"])
        
        # Merge all renewable inputs if we have multiple
        if len(all_renewable_inputs) > 1:
            return merge_data_inputs_without_duplicates(*all_renewable_inputs)
        elif len(all_renewable_inputs) == 1:
            return all_renewable_inputs[0]
        
        # Fall back to default if no specific renewable type matched
        if "default" in focus_data and focus_data["default"]:
            return focus_data["default"]
        return []
    
    # Special handling for "Whole system interaction" focus (Energy & Carbon Performance)
    if analysis_type == "Energy & Carbon Performance" and focus == "Whole system interaction":
        scale_qualifies = scale in WHOLE_SYSTEM_SCALES if scale else True
        context_qualifies = context in WHOLE_SYSTEM_COUNTRIES if context else True
        
        if scale_qualifies and context_qualifies:
            electricity_inputs = focus_data.get("Electricity", [])
            heating_cooling_inputs = focus_data.get("Heating/Cooling", [])
            
            if electricity_inputs and heating_cooling_inputs:
                return merge_data_inputs_without_duplicates(electricity_inputs, heating_cooling_inputs)
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


def get_data_inputs(analysis_types, focus: str = None, scale: str = None, context: str = None, renewable_types: list = None, urban_design_types: list = None, climate_resilience_types: list = None) -> list:
    """
    Get the FIXED data inputs list for given analysis type(s) and focus.
    
    This function returns the same list every time for the same inputs.
    The list does NOT change based on user interactions.
    
    HANDLES MULTIPLE ANALYSIS TYPES:
    - If analysis_types is a list with multiple items, all their inputs are merged
    - Duplicate items (same key) are removed, keeping the first occurrence
    
    For "Whole system interaction" focus with specific scales and contexts,
    this function combines Electricity and Heating/Cooling inputs without duplicates.
    
    For "Renewable Energy & Local Production" with multiple renewable types,
    this function merges all selected renewable type inputs without duplicates.
    
    For "Urban Design Support" with multiple urban design types,
    this function merges all selected urban design type inputs without duplicates.
    
    For "Climate Resilience" with multiple climate types,
    this function merges all selected climate type inputs without duplicates.
    Note: Flood Risk Assessment is only available at Neighborhood/City scale.
    
    For "Retrofit & Transformation" with specific scales and contexts,
    this function returns the retrofit-specific data inputs.
    
    Args:
        analysis_types: Single analysis type string OR list of analysis types
        focus: The selected focus (e.g., "Electricity", "Heating/Cooling", "Whole system interaction")
        scale: The selected scale (e.g., "Building", "Neighborhood", "City")
        context: The selected context/country (e.g., "Ireland", "Sweden")
        renewable_types: List of selected renewable energy types (e.g., ["Solar PV", "Battery Storage"])
        urban_design_types: List of selected urban design types (e.g., ["Accessibility", "Noise"])
        climate_resilience_types: List of selected climate resilience types (e.g., ["Flood Risk Assessment", "Extreme Heat Analysis"])
    
    Returns:
        List of category dictionaries with items, or empty list if not configured
    """
    if not analysis_types:
        return []
    
    # Normalize to list
    if isinstance(analysis_types, str):
        analysis_types = [analysis_types]
    
    if not analysis_types:
        return []
    
    # Get inputs for each analysis type
    all_inputs = []
    for analysis_type in analysis_types:
        # Determine the focus for this analysis type
        current_focus = None
        if analysis_type == "Energy & Carbon Performance":
            current_focus = focus
        # Other analysis types use "default" or their own focus logic
        
        inputs = get_data_inputs_for_single_analysis(
            analysis_type=analysis_type,
            focus=current_focus,
            scale=scale,
            context=context,
            renewable_types=renewable_types,
            urban_design_types=urban_design_types,
            climate_resilience_types=climate_resilience_types
        )
        if inputs:
            all_inputs.append(inputs)
    
    # Merge all inputs if we have multiple analysis types
    if len(all_inputs) > 1:
        return merge_data_inputs_without_duplicates(*all_inputs)
    elif len(all_inputs) == 1:
        return all_inputs[0]
    
    return []
