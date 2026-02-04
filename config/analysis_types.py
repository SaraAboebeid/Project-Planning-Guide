"""
Analysis Types Configuration for Step 1: Define Scope and Context

This file defines all available analysis types and their focus options.
"""

# ==============================================================================
# ANALYSIS TYPES AND FOCUS OPTIONS
# ==============================================================================

ANALYSIS_TYPES = [
    "Energy & Carbon Performance",
    "Solar PV Potential",
    "Thermal Comfort",
    "Daylighting",
    "Wind & Ventilation",
    "Renewable Energy & Local Production",
    "Climate Resilience",
]

# Focus options for each analysis type
# If an analysis type is not listed here, it has no focus options
ANALYSIS_FOCUS_OPTIONS = {
    "Energy & Carbon Performance": ["Electricity", "Heating", "Cooling", "All"],
    # Add more focus options for other analysis types as needed
}


# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================

def get_analysis_types() -> list:
    """Get all available analysis types."""
    return ANALYSIS_TYPES


def get_focus_options(analysis_type: str) -> list:
    """
    Get focus options for a given analysis type.
    
    Args:
        analysis_type: The selected analysis type
    
    Returns:
        List of focus options, or empty list if none
    """
    if isinstance(analysis_type, list):
        if not analysis_type:
            return []
        analysis_type = analysis_type[0]
    
    return ANALYSIS_FOCUS_OPTIONS.get(analysis_type, [])


def has_focus_options(analysis_type: str) -> bool:
    """Check if an analysis type has focus options."""
    return bool(get_focus_options(analysis_type))
